/**
 * [C5-001~C5-006] GuestService
 * 游客模式服务
 *
 * 职责:
 * - 游客 Token 生成与管理
 * - 游客 AI 账户创建（限制2个）
 * - 游客 AI 对话（限制10轮）
 * - 游客数据迁移到正式用户
 * - 智能过期策略（24h/72h）
 * - Redis 持久化支持
 */

import crypto from 'crypto';
import { getRedisClient } from '../database/redis.js';

class GuestService {
  constructor(options = {}) {
    this.redis = options.redis || null;
    this.db = options.db || null;
    this.localCache = new Map(); // 内存回退缓存

    // 配置
    this.config = {
      tokenExpiryNoAccounts: 24 * 60 * 60, // 24小时（秒）- 无AI账户
      tokenExpiryWithAccounts: 72 * 60 * 60, // 72小时（秒）- 有AI账户
      maxAIAccounts: 2,
      maxDialogueRounds: 10,
      tokenPrefix: 'guest:session:',
      accountPrefix: 'guest:account:',
      dialoguePrefix: 'guest:dialogue:'
    };
  }

  /**
   * 初始化 Redis 连接
   */
  async initialize() {
    try {
      this.redis = getRedisClient();
      console.log('✅ GuestService initialized with Redis');
    } catch (error) {
      console.warn('⚠️ GuestService running in memory-only mode:', error.message);
      this.redis = null;
    }
  }

  /**
   * [C5-001] 创建游客 Token
   * 基于 openid_hash 生成唯一 token
   */
  async createGuestToken(openid) {
    const openidHash = this._hashOpenid(openid);
    const token = this._generateToken(openidHash);

    const session = {
      token,
      openidHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + (this.config.tokenExpiryNoAccounts * 1000),
      aiAccounts: [],
      dialogueRounds: 0,
      status: 'active'
    };

    // 保存到 Redis（如果可用）
    if (this.redis) {
      await this.redis.setEx(
        `${this.config.tokenPrefix}${token}`,
        this.config.tokenExpiryNoAccounts,
        JSON.stringify(session)
      );
    }

    // 同时保存到内存缓存
    this.localCache.set(token, session);

    return {
      token,
      expiresIn: this.config.tokenExpiryNoAccounts,
      createdAt: session.createdAt
    };
  }

  /**
   * [C5-001] 验证游客 Token
   */
  async validateToken(token) {
    // 先尝试从 Redis 获取
    if (this.redis) {
      try {
        const data = await this.redis.get(`${this.config.tokenPrefix}${token}`);
        if (data) {
          const session = JSON.parse(data);
          if (session.expiresAt > Date.now()) {
            return session;
          }
        }
      } catch (error) {
        console.warn('Redis error, falling back to memory:', error.message);
      }
    }

    // 回退到内存缓存
    const session = this.localCache.get(token);
    if (session && session.expiresAt > Date.now()) {
      return session;
    }

    return null;
  }

  /**
   * [C5-001] 获取游客会话
   */
  async getSession(token) {
    return this.validateToken(token);
  }

  /**
   * [C5-002] 创建游客 AI 账户
   * 限制最多2个账户
   */
  async createAIAccount(token, accountData) {
    const session = await this.validateToken(token);
    if (!session) {
      throw new Error('INVALID_TOKEN');
    }

    // 检查账户数量限制
    if (session.aiAccounts.length >= this.config.maxAIAccounts) {
      throw new Error('ACCOUNT_LIMIT_REACHED');
    }

    const accountId = `guest_acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const account = {
      id: accountId,
      guestToken: token,
      name: accountData.name || `AI账户${session.aiAccounts.length + 1}`,
      modelType: accountData.modelType || 'deepseek',
      initialBalance: accountData.initialBalance || 100000,
      createdAt: Date.now(),
      status: 'active'
    };

    session.aiAccounts.push(accountId);

    // 更新过期时间为72小时（因为有AI账户了）
    session.expiresAt = Date.now() + (this.config.tokenExpiryWithAccounts * 1000);

    // 保存账户信息
    if (this.redis) {
      await this.redis.setEx(
        `${this.config.accountPrefix}${accountId}`,
        this.config.tokenExpiryWithAccounts,
        JSON.stringify(account)
      );

      // 更新会话
      await this.redis.setEx(
        `${this.config.tokenPrefix}${token}`,
        this.config.tokenExpiryWithAccounts,
        JSON.stringify(session)
      );
    }

    // 更新内存缓存
    this.localCache.set(token, session);
    this.localCache.set(`${this.config.accountPrefix}${accountId}`, account);

    return account;
  }

  /**
   * [C5-002] 获取游客的 AI 账户列表
   */
  async getAIAccounts(token) {
    const session = await this.validateToken(token);
    if (!session) {
      throw new Error('INVALID_TOKEN');
    }

    const accounts = [];
    for (const accountId of session.aiAccounts) {
      let account = null;

      // 尝试从 Redis 获取
      if (this.redis) {
        const data = await this.redis.get(`${this.config.accountPrefix}${accountId}`);
        if (data) {
          account = JSON.parse(data);
        }
      }

      // 回退到内存缓存
      if (!account) {
        account = this.localCache.get(`${this.config.accountPrefix}${accountId}`);
      }

      if (account) {
        accounts.push(account);
      }
    }

    return accounts;
  }

  /**
   * [C5-003] 游客 AI 对话
   * 限制10轮对话
   */
  async dialogue(token, accountId, message) {
    const session = await this.validateToken(token);
    if (!session) {
      throw new Error('INVALID_TOKEN');
    }

    // 检查是否是该游客的账户
    if (!session.aiAccounts.includes(accountId)) {
      throw new Error('ACCOUNT_NOT_FOUND');
    }

    // 检查对话轮数限制
    const dialogueKey = `${this.config.dialoguePrefix}${accountId}`;
    let dialogueData = { rounds: 0, messages: [] };

    if (this.redis) {
      const data = await this.redis.get(dialogueKey);
      if (data) {
        dialogueData = JSON.parse(data);
      }
    } else {
      dialogueData = this.localCache.get(dialogueKey) || dialogueData;
    }

    if (dialogueData.rounds >= this.config.maxDialogueRounds) {
      throw new Error('ROUND_LIMIT_REACHED');
    }

    // 记录对话
    dialogueData.rounds++;
    dialogueData.messages.push({
      role: 'user',
      content: message,
      timestamp: Date.now()
    });

    // 保存对话记录
    const ttl = session.aiAccounts.length > 0
      ? this.config.tokenExpiryWithAccounts
      : this.config.tokenExpiryNoAccounts;

    if (this.redis) {
      await this.redis.setEx(dialogueKey, ttl, JSON.stringify(dialogueData));
    }
    this.localCache.set(dialogueKey, dialogueData);

    return {
      roundCount: dialogueData.rounds,
      remainingRounds: this.config.maxDialogueRounds - dialogueData.rounds,
      message: '对话已记录'
    };
  }

  /**
   * [C5-004] 游客数据迁移到正式用户
   */
  async migrateToUser(token, userId) {
    const session = await this.validateToken(token);
    if (!session) {
      throw new Error('INVALID_TOKEN');
    }

    if (this.db) {
      // 使用事务保护
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');

        // 迁移 AI 账户
        for (const accountId of session.aiAccounts) {
          let account = null;

          if (this.redis) {
            const data = await this.redis.get(`${this.config.accountPrefix}${accountId}`);
            if (data) {
              account = JSON.parse(data);
            }
          }

          if (!account) {
            account = this.localCache.get(`${this.config.accountPrefix}${accountId}`);
          }

          if (account) {
            // 创建正式 AI 账户
            await client.query(
              `INSERT INTO ai_accounts (user_id, name, model_type, initial_balance, status, created_at)
               VALUES ($1, $2, $3, $4, $5, NOW())`,
              [userId, account.name, account.modelType, account.initialBalance, 'active']
            );
          }
        }

        // 标记游客会话为已迁移
        session.migratedTo = userId;
        session.migratedAt = Date.now();
        session.status = 'migrated';

        await client.query('COMMIT');

        // 更新缓存
        if (this.redis) {
          await this.redis.setEx(
            `${this.config.tokenPrefix}${token}`,
            3600, // 1小时后过期
            JSON.stringify(session)
          );
        }
        this.localCache.set(token, session);

        return {
          success: true,
          migratedAccounts: session.aiAccounts.length,
          userId
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    throw new Error('Database not configured');
  }

  /**
   * [C5-005] 清理过期会话
   */
  async cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    // 清理内存缓存
    for (const [token, session] of this.localCache.entries()) {
      if (session.expiresAt < now && !session.migratedTo) {
        this.localCache.delete(token);
        cleanedCount++;
      }
    }

    console.log(`🧹 Cleaned up ${cleanedCount} expired guest sessions`);
    return cleanedCount;
  }

  /**
   * 从 Redis 恢复数据到内存缓存
   * 用于服务重启后的数据恢复
   */
  async restoreFromRedis() {
    if (!this.redis) {
      console.warn('Redis not available, cannot restore');
      return;
    }

    try {
      // 获取所有游客会话
      const sessionKeys = await this.redis.keys(`${this.config.tokenPrefix}*`);
      for (const key of sessionKeys) {
        const data = await this.redis.get(key);
        if (data) {
          const session = JSON.parse(data);
          const token = key.replace(this.config.tokenPrefix, '');
          this.localCache.set(token, session);
        }
      }

      // 获取所有账户
      const accountKeys = await this.redis.keys(`${this.config.accountPrefix}*`);
      for (const key of accountKeys) {
        const data = await this.redis.get(key);
        if (data) {
          const account = JSON.parse(data);
          this.localCache.set(key, account);
        }
      }

      console.log(`✅ Restored ${sessionKeys.length} sessions and ${accountKeys.length} accounts from Redis`);
    } catch (error) {
      console.error('❌ Failed to restore from Redis:', error.message);
    }
  }

  /**
   * 生成 OpenID 哈希
   * @private
   */
  _hashOpenid(openid) {
    return crypto.createHash('sha256').update(openid).digest('hex').substring(0, 16);
  }

  /**
   * 生成 Token
   * @private
   */
  _generateToken(openidHash) {
    const random = crypto.randomBytes(16).toString('hex');
    return `guest_${openidHash}_${random}`;
  }
}

export { GuestService };
export default GuestService;
