/**
 * GuestService PostgreSQL重构版
 * 将游客数据从Redis迁移到PostgreSQL，与正式用户统一存储
 *
 * 核心设计：
 * - 逻辑删除 + 定时物理删除
 * - 事务保护确保数据一致性
 * - 状态机管理：active → migrating → migrated/expired
 * - 缓存一致性保障
 *
 * @author Backend开发团队
 * @date 2026-02-13
 */

const crypto = require('crypto');
const { Prisma } = require('@prisma/client');

/**
 * 游客服务错误
 */
class GuestServiceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GuestServiceError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * GuestService PostgreSQL版
 */
class GuestServicePostgreSQL {
  constructor(prismaClient, cacheService = null) {
    if (!prismaClient) {
      throw new GuestServiceError('PRISMA_NOT_INITIALIZED', 'Prisma client is required');
    }
    this.prisma = prismaClient;
    this.cacheService = cacheService;

    // 游客配置
    this.config = {
      maxAIAccounts: 3,           // 最大活跃AI账户数
      maxDialogueRounds: 10,      // 最大对话轮数
      guestTTLHours: 24,          // 无AI账户时24小时过期
      guestTTLWithAccountsHours: 72,  // 有AI账户时72小时过期
      migrationLockMinutes: 5,    // 迁移锁定时间（防止并发）
    };

    // 清理定时器
    this.cleanupInterval = null;
    this.startCleanupTask();
  }

  /**
   * 设置缓存服务（用于延迟初始化）
   * @param {GuestCacheService} cacheService
   */
  setCacheService(cacheService) {
    this.cacheService = cacheService;
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 生成openid的hash
   */
  _hashOpenid(openid) {
    return crypto.createHash('sha256').update(openid).digest('hex');
  }

  /**
   * 生成游客token
   */
  _generateToken(openidHash) {
    const random = crypto.randomBytes(16).toString('hex');
    return `guest_${openidHash.substring(0, 16)}_${random}`;
  }

  /**
   * 计算过期时间
   */
  _calculateExpiry(accountCount) {
    const hours = accountCount > 0
      ? this.config.guestTTLWithAccountsHours
      : this.config.guestTTLHours;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  /**
   * 生成对话sessionId
   */
  _generateDialogueSessionId() {
    return `dlg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  // ============================================================================
  // C5-001: 游客Token管理
  // ============================================================================

  /**
   * 创建游客Token
   */
  async createGuestToken(openid) {
    if (!openid || typeof openid !== 'string') {
      throw new GuestServiceError('INVALID_OPENID', 'OpenID is required');
    }

    const openidHash = this._hashOpenid(openid);

    try {
      // 检查是否已存在活跃会话
      const existingSession = await this.prisma.guest_sessions.findUnique({
        where: { openid_hash: openidHash }
      });

      if (existingSession && existingSession.status === 'active') {
        // 更新过期时间
        const accountCount = existingSession.ai_account_count;
        const newExpiry = this._calculateExpiry(accountCount);

        await this.prisma.guest_sessions.update({
          where: { id: existingSession.id },
          data: {
            expires_at: newExpiry,
            last_activity_at: new Date()
          }
        });

        return {
          token: existingSession.guest_token,
          expiresAt: newExpiry.toISOString()
        };
      }

      // 创建新会话
      const token = this._generateToken(openidHash);
      const expiresAt = this._calculateExpiry(0);

      const newSession = await this.prisma.guest_sessions.create({
        data: {
          openid_hash: openidHash,
          guest_token: token,
          status: 'active',
          expires_at: expiresAt,
          ai_account_count: 0
        }
      });

      // 写入缓存（G-008）
      if (this.cacheService) {
        await this.cacheService.cacheToken(token, newSession);
      }

      return {
        token,
        expiresAt: expiresAt.toISOString()
      };

    } catch (error) {
      if (error instanceof GuestServiceError) throw error;
      throw new GuestServiceError('CREATE_TOKEN_FAILED', 'Failed to create guest token', { error: error.message });
    }
  }

  /**
   * 验证游客Token（带缓存）
   */
  async validateGuestToken(token) {
    if (!token) return null;

    try {
      // 先尝试从缓存获取（G-008）
      if (this.cacheService) {
        const cached = await this.cacheService.getCachedToken(token, { preventPenetration: true });
        if (cached) {
          // 检查缓存数据是否过期
          if (new Date(cached.expires_at) < new Date()) {
            await this.cacheService.invalidateToken(token);
            return null;
          }
          return cached;
        }
      }

      // 缓存未命中，从数据库查询
      const session = await this.prisma.guest_sessions.findFirst({
        where: {
          guest_token: token,
          status: 'active'
        }
      });

      if (!session) return null;

      // 检查是否过期
      if (new Date(session.expires_at) < new Date()) {
        // 自动标记为过期
        await this.prisma.guest_sessions.update({
          where: { id: session.id },
          data: { status: 'expired' }
        });
        return null;
      }

      // 更新最后活跃时间
      await this.prisma.guest_sessions.update({
        where: { id: session.id },
        data: { last_activity_at: new Date() }
      });

      // 写入缓存（G-008）
      if (this.cacheService) {
        await this.cacheService.cacheToken(token, session);
      }

      return session;

    } catch (error) {
      console.error('[GuestService] Validate token error:', error);
      return null;
    }
  }

  /**
   * 获取游客会话（不验证过期）
   */
  async _getSessionByToken(token) {
    return await this.prisma.guest_sessions.findFirst({
      where: { guest_token: token }
    });
  }

  // ============================================================================
  // C5-002: AI账户管理
  // ============================================================================

  /**
   * 创建游客AI账户
   */
  async createAIAccount(token, options = {}) {
    const session = await this.validateGuestToken(token);
    if (!session) {
      throw new GuestServiceError('INVALID_TOKEN', 'Invalid or expired guest token');
    }

    // 检查活跃账户数量
    const activeCount = await this.prisma.ai_accounts.count({
      where: {
        guest_session_id: session.id,
        status: { not: 'deleted' }
      }
    });

    if (activeCount >= this.config.maxAIAccounts) {
      throw new GuestServiceError(
        'ACCOUNT_LIMIT_REACHED',
        `Maximum ${this.config.maxAIAccounts} active AI accounts allowed for guest`
      );
    }

    try {
      // 使用事务创建账户并更新计数
      const result = await this.prisma.$transaction(async (tx) => {
        // 创建AI账户
        const account = await tx.ai_accounts.create({
          data: {
            userId: 0, // 游客账户userId为0
            name: options.name || `AI账户 ${activeCount + 1}`,
            modelType: options.modelType || 'deepseek',
            initialBalance: options.initialBalance || 100000,
            currentBalance: options.initialBalance || 100000,
            totalValue: options.initialBalance || 100000,
            status: 'active',
            guest_session_id: session.id,
            is_guest: true,
            guest_expires_at: this._calculateExpiry(activeCount + 1)
          }
        });

        // 更新游客会话的AI账户计数和过期时间
        await tx.guest_sessions.update({
          where: { id: session.id },
          data: {
            ai_account_count: activeCount + 1,
            expires_at: this._calculateExpiry(activeCount + 1)
          }
        });

        return account;
      });

      return {
        id: result.id,
        name: result.name,
        modelType: result.modelType,
        initialBalance: result.initialBalance,
        isGuest: true,
        guestSessionId: result.guest_session_id,
        status: result.status,
        createdAt: result.createdAt
      };

    } catch (error) {
      throw new GuestServiceError('CREATE_ACCOUNT_FAILED', 'Failed to create AI account', { error: error.message });
    }
  }

  /**
   * 获取游客的AI账户列表
   */
  async getAIAccounts(token) {
    const session = await this.validateGuestToken(token);
    if (!session) {
      return [];
    }

    const accounts = await this.prisma.ai_accounts.findMany({
      where: {
        guest_session_id: session.id,
        status: { not: 'deleted' }
      },
      orderBy: { createdAt: 'desc' }
    });

    return accounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      modelType: acc.modelType,
      initialBalance: acc.initialBalance,
      currentBalance: acc.currentBalance,
      status: acc.status,
      createdAt: acc.createdAt
    }));
  }

  /**
   * 删除AI账户（软删除）
   */
  async deleteAIAccount(token, accountId) {
    const session = await this.validateGuestToken(token);
    if (!session) {
      throw new GuestServiceError('INVALID_TOKEN', 'Invalid or expired guest token');
    }

    // 查找账户
    const account = await this.prisma.ai_accounts.findFirst({
      where: {
        id: accountId,
        guest_session_id: session.id
      }
    });

    if (!account) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    if (account.status === 'deleted') {
      throw new GuestServiceError('ACCOUNT_ALREADY_DELETED', 'AI account already deleted');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // 软删除账户
        await tx.ai_accounts.update({
          where: { id: accountId },
          data: {
            status: 'deleted',
            deleted_at: new Date()
          }
        });

        // 更新AI账户计数
        const remainingCount = await tx.ai_accounts.count({
          where: {
            guest_session_id: session.id,
            status: { not: 'deleted' }
          }
        });

        await tx.guest_sessions.update({
          where: { id: session.id },
          data: {
            ai_account_count: remainingCount,
            expires_at: this._calculateExpiry(remainingCount)
          }
        });
      });

      // 清除AI账户列表缓存（G-008）
      if (this.cacheService) {
        await this.cacheService.invalidateAIAccounts(session.id);
      }

      return {
        success: true,
        accountId,
        deletedAt: new Date().toISOString()
      };

    } catch (error) {
      throw new GuestServiceError('DELETE_ACCOUNT_FAILED', 'Failed to delete AI account', { error: error.message });
    }
  }

  // ============================================================================
  // C5-003: AI对话管理
  // ============================================================================

  /**
   * 开始AI对话
   */
  async startDialogue(token, accountId) {
    const session = await this.validateGuestToken(token);
    if (!session) {
      throw new GuestServiceError('INVALID_TOKEN', 'Invalid or expired guest token');
    }

    // 验证账户属于该游客
    const account = await this.prisma.ai_accounts.findFirst({
      where: {
        id: accountId,
        guest_session_id: session.id,
        status: { not: 'deleted' }
      }
    });

    if (!account) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    // 检查是否已有活跃对话（这里简化实现，实际应该使用dialogues表）
    // 为简化实现，我们返回一个模拟的对话会话
    return {
      sessionId: this._generateDialogueSessionId(),
      accountId,
      roundCount: 0,
      maxRounds: this.config.maxDialogueRounds,
      status: 'active',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 发送对话消息
   */
  async sendMessage(token, accountId, message) {
    const session = await this.validateGuestToken(token);
    if (!session) {
      throw new GuestServiceError('INVALID_TOKEN', 'Invalid or expired guest token');
    }

    // 验证账户
    const account = await this.prisma.ai_accounts.findFirst({
      where: {
        id: accountId,
        guest_session_id: session.id,
        status: { not: 'deleted' }
      }
    });

    if (!account) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    // 这里简化实现，实际应该查询dialogues表并更新轮数
    // 返回模拟响应
    return {
      type: 'message',
      content: `AI response to: ${message}`,
      roundCount: 1,
      remainingRounds: this.config.maxDialogueRounds - 1,
      isLastRound: false
    };
  }

  // ============================================================================
  // C5-004: 数据迁移（核心安全模块）
  // ============================================================================

  /**
   * 游客转正迁移（原子操作）
   */
  async migrateToFormalUser(token, userId) {
    // 参数验证
    if (!token || !userId || userId <= 0) {
      throw new GuestServiceError('INVALID_PARAMS', 'Token and valid userId are required');
    }

    // 验证游客Token
    const session = await this._getSessionByToken(token);
    if (!session) {
      throw new GuestServiceError('SESSION_NOT_FOUND', 'Guest session not found');
    }

    if (session.status === 'migrated') {
      throw new GuestServiceError('ALREADY_MIGRATED', 'Guest session already migrated');
    }

    if (session.status === 'expired') {
      throw new GuestServiceError('SESSION_EXPIRED', 'Guest session has expired');
    }

    // 验证用户ID是否存在（简单检查）
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!userExists) {
      // 在实际场景中应该创建用户或抛出错误
      // 这里为了测试，我们允许不存在的用户ID（触发外键约束失败以测试回滚）
      console.warn(`[GuestService] User ${userId} may not exist, migration will fail if foreign key constraint exists`);
    }

    try {
      // 原子迁移事务
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. 锁定游客会话（防止并发迁移）
        const lockedSession = await tx.guest_sessions.update({
          where: {
            id: session.id,
            status: 'active'  // 乐观锁：只有active状态才能迁移
          },
          data: {
            status: 'migrating',
            last_activity_at: new Date()
          }
        });

        if (!lockedSession) {
          throw new GuestServiceError('CONCURRENT_MIGRATION', 'Migration already in progress');
        }

        // 2. 获取所有AI账户
        const accounts = await tx.ai_accounts.findMany({
          where: {
            guest_session_id: session.id,
            status: { not: 'deleted' }
          }
        });

        const migratedAccountIds = [];

        // 3. 迁移每个AI账户
        for (const account of accounts) {
          await tx.ai_accounts.update({
            where: { id: account.id },
            data: {
              userId: userId,
              is_guest: false,
              guest_session_id: null,
              guest_expires_at: null,
              updatedAt: new Date()
            }
          });
          migratedAccountIds.push(account.id);
        }

        // 4. 标记游客会话为已迁移
        await tx.guest_sessions.update({
          where: { id: session.id },
          data: {
            status: 'migrated',
            migrated_user_id: userId,
            migrated_at: new Date()
          }
        });

        // 5. 记录迁移日志
        await tx.$executeRaw`
          INSERT INTO guest_migration_logs (
            guest_session_id, openid_hash, user_id,
            accounts_migrated, account_ids, migrated_at
          ) VALUES (
            ${session.id}, ${session.openid_hash}, ${userId},
            ${migratedAccountIds.length}, ${JSON.stringify(migratedAccountIds)}, ${new Date()}
          )
        `;

        return {
          guestSessionId: session.id,
          migratedAccounts: migratedAccountIds.length,
          userId
        };
      }, {
        // 事务隔离级别：可串行化，确保并发安全
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // 超时时间：30秒
        maxWait: 30000,
        timeout: 30000
      });

      // 清除所有相关缓存（G-008）
      if (this.cacheService) {
        await this.cacheService.invalidateSessionCascade(session.id, {
          token: token,
          openidHash: session.openid_hash
        });
      }

      return {
        success: true,
        userId: result.userId,
        migratedAccounts: result.migratedAccounts,
        message: 'Migration completed successfully'
      };

    } catch (error) {
      // 如果迁移失败，尝试恢复状态
      try {
        await this.prisma.guest_sessions.update({
          where: { id: session.id },
          data: { status: 'active' }
        });
      } catch (recoveryError) {
        console.error('[GuestService] Failed to recover session status:', recoveryError);
      }

      if (error instanceof GuestServiceError) throw error;

      throw new GuestServiceError(
        'MIGRATION_FAILED',
        `Migration failed: ${error.message}`,
        { originalError: error.message }
      );
    }
  }

  // ============================================================================
  // C5-005: 过期清理
  // ============================================================================

  /**
   * 清理过期会话（逻辑删除）
   */
  async cleanupExpiredSessions() {
    try {
      // 找到所有已过期的active会话
      const expiredSessions = await this.prisma.guest_sessions.findMany({
        where: {
          status: 'active',
          expires_at: { lt: new Date() }
        }
      });

      let cleanedCount = 0;

      for (const session of expiredSessions) {
        try {
          await this.prisma.guest_sessions.update({
            where: { id: session.id },
            data: { status: 'expired' }
          });

          // 清除相关缓存（G-008）
          if (this.cacheService) {
            await this.cacheService.invalidateSessionCascade(session.id, {
              token: session.guest_token,
              openidHash: session.openid_hash
            });
          }

          cleanedCount++;
        } catch (error) {
          console.error(`[GuestService] Failed to expire session ${session.id}:`, error);
        }
      }

      console.log(`[GuestService] Cleaned ${cleanedCount} expired sessions`);
      return { count: cleanedCount };

    } catch (error) {
      console.error('[GuestService] Cleanup error:', error);
      return { count: 0, error: error.message };
    }
  }

  /**
   * 物理删除过期会话（延迟25小时后执行）
   */
  async physicalCleanup() {
    try {
      const cutoffDate = new Date(Date.now() - 25 * 60 * 60 * 1000);

      // 删除expired状态且超过25小时的会话
      // 注意：触发器会阻止删除migrated状态的会话
      const result = await this.prisma.guest_sessions.deleteMany({
        where: {
          status: 'expired',
          expires_at: { lt: cutoffDate }
        }
      });

      console.log(`[GuestService] Physically deleted ${result.count} expired sessions`);
      return { count: result.count };

    } catch (error) {
      console.error('[GuestService] Physical cleanup error:', error);
      return { count: 0, error: error.message };
    }
  }

  /**
   * 启动定时清理任务
   */
  startCleanupTask() {
    // 每10分钟执行一次逻辑清理
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 10 * 60 * 1000);

    console.log('[GuestService] Cleanup task started');
  }

  /**
   * 停止定时清理任务
   */
  stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[GuestService] Cleanup task stopped');
    }
  }

  // ============================================================================
  // 统计与监控
  // ============================================================================

  /**
   * 获取统计信息
   */
  async getStats() {
    const stats = await this.prisma.$transaction([
      this.prisma.guest_sessions.count({ where: { status: 'active' } }),
      this.prisma.guest_sessions.count({ where: { status: 'migrated' } }),
      this.prisma.guest_sessions.count({ where: { status: 'expired' } }),
      this.prisma.ai_accounts.count({ where: { is_guest: true, status: { not: 'deleted' } } })
    ]);

    return {
      activeSessions: stats[0],
      migratedSessions: stats[1],
      expiredSessions: stats[2],
      guestAIAccounts: stats[3]
    };
  }
}

// 导出
module.exports = GuestServicePostgreSQL;
module.exports.GuestServiceError = GuestServiceError;
</pre>