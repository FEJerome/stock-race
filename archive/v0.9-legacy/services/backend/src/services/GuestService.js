/**
 * Guest Service
 * Backend游客模式服务
 *
 * 对应需求: C5-001 ~ C5-006
 * P0-004: Redis持久化改造完成
 */

import crypto from 'crypto';
import { EventBusService } from './EventBusService.js';
import { getRedisClientSafe, isRedisConnected } from '../database/redis.js';

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
 * 游客服务
 * 管理游客会话、AI账户和数据迁移
 * P0-004: 支持Redis持久化，服务重启数据不丢失
 */
class GuestService {
  constructor() {
    // 内存缓存（作为Redis的本地缓存）
    this.sessions = new Map();
    this.aiAccounts = new Map();
    this.dialogues = new Map();

    // 清理定时器
    this.cleanupInterval = null;

    // Redis键前缀
    this.redisPrefix = {
      session: 'guest:session:',
      account: 'guest:account:',
      dialogue: 'guest:dialogue:',
      index: 'guest:index:'
    };

    this.startCleanupTask();
  }

  /**
   * 获取Redis客户端
   * @private
   * @returns {RedisClient|null}
   */
  _getRedis() {
    return getRedisClientSafe();
  }

  /**
   * 检查是否使用Redis
   * @private
   * @returns {boolean}
   */
  _useRedis() {
    return isRedisConnected();
  }

  /**
   * 生成openid的hash
   * @private
   * @param {string} openid - 微信openid
   * @returns {string} SHA-256 hash
   */
  _hashOpenid(openid) {
    return crypto.createHash('sha256').update(openid).digest('hex');
  }

  /**
   * 生成游客token
   * @private
   * @param {string} openidHash - openid的hash
   * @returns {string} 游客token
   */
  _generateToken(openidHash) {
    const random = crypto.randomBytes(16).toString('hex');
    return `guest_${openidHash.substring(0, 16)}_${random}`;
  }

  /**
   * 计算过期时间
   * @private
   * @param {number} accountCount - AI账户数量
   * @returns {Date} 过期时间
   */
  _calculateExpiry(accountCount) {
    const now = new Date();
    // 无AI账户24h，有AI账户72h
    const hours = accountCount > 0 ? 72 : 24;
    return new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  /**
   * 计算TTL（秒）
   * @private
   * @param {number} accountCount - AI账户数量
   * @returns {number} TTL秒数
   */
  _calculateTTL(accountCount) {
    // 无AI账户24h，有AI账户72h
    const hours = accountCount > 0 ? 72 : 24;
    return hours * 60 * 60;
  }

  /**
   * C5-001: 创建游客Token
   * P0-004: 支持Redis持久化
   * @param {string} openid - 微信openid
   * @returns {Promise<Object>} token信息
   */
  async createGuestToken(openid) {
    const openidHash = this._hashOpenid(openid);

    // 检查是否已存在会话（先查内存，再查Redis）
    let session = this.sessions.get(openidHash);

    if (!session && this._useRedis()) {
      // 从Redis恢复会话
      const redis = this._getRedis();
      const sessionData = await redis.get(`${this.redisPrefix.session}${openidHash}`);
      if (sessionData) {
        session = JSON.parse(sessionData);
        this.sessions.set(openidHash, session);
      }
    }

    if (session) {
      // 更新过期时间
      const accountCount = this._getGuestAccountCount(openidHash);
      session.expiresAt = this._calculateExpiry(accountCount).toISOString();

      // 持久化到Redis
      await this._persistSession(openidHash, session, accountCount);

      return {
        token: session.token,
        expiresAt: session.expiresAt,
      };
    }

    // 创建新会话
    const token = this._generateToken(openidHash);
    const expiresAt = this._calculateExpiry(0);

    session = {
      openidHash,
      token,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'active',
      aiAccountCount: 0,
      migratedTo: null,
    };

    // 保存到内存
    this.sessions.set(openidHash, session);

    // 持久化到Redis
    await this._persistSession(openidHash, session, 0);

    console.log(`[GuestService] Created guest token: ${token.substring(0, 20)}...`);

    return {
      token,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * 持久化会话到Redis
   * @private
   * @param {string} openidHash - openid hash
   * @param {Object} session - 会话对象
   * @param {number} accountCount - 账户数量
   */
  async _persistSession(openidHash, session, accountCount) {
    if (!this._useRedis()) return;

    try {
      const redis = this._getRedis();
      const ttl = this._calculateTTL(accountCount);
      await redis.setEx(
        `${this.redisPrefix.session}${openidHash}`,
        ttl,
        JSON.stringify(session)
      );
    } catch (error) {
      console.error('[GuestService] Failed to persist session to Redis:', error.message);
    }
  }

  /**
   * 持久化AI账户到Redis
   * @private
   * @param {string} accountId - 账户ID
   * @param {Object} account - 账户对象
   */
  async _persistAccount(accountId, account) {
    if (!this._useRedis()) return;

    try {
      const redis = this._getRedis();
      const ttl = this._calculateTTL(1); // 至少有一个账户，使用72h TTL
      await redis.setEx(
        `${this.redisPrefix.account}${accountId}`,
        ttl,
        JSON.stringify(account)
      );

      // 更新索引
      await redis.sAdd(`${this.redisPrefix.index}accounts:${account.guestId}`, accountId);
      await redis.expire(`${this.redisPrefix.index}accounts:${account.guestId}`, ttl);
    } catch (error) {
      console.error('[GuestService] Failed to persist account to Redis:', error.message);
    }
  }

  /**
   * 持久化对话到Redis
   * @private
   * @param {string} accountId - 账户ID
   * @param {Object} dialogue - 对话对象
   */
  async _persistDialogue(accountId, dialogue) {
    if (!this._useRedis()) return;

    try {
      const redis = this._getRedis();
      const ttl = this._calculateTTL(1);
      await redis.setEx(
        `${this.redisPrefix.dialogue}${accountId}`,
        ttl,
        JSON.stringify(dialogue)
      );
    } catch (error) {
      console.error('[GuestService] Failed to persist dialogue to Redis:', error.message);
    }
  }

  /**
   * 验证token并获取会话
   * @private
   * @param {string} token - 游客token
   * @returns {Object} 会话对象
   */
  async _validateToken(token) {
    // 从token提取openidHash
    const parts = token.split('_');
    if (parts.length !== 3 || parts[0] !== 'guest') {
      throw new GuestServiceError('INVALID_TOKEN', 'Invalid token format');
    }

    const openidHash = parts[1];

    // 先查内存
    let session = this.sessions.get(openidHash);

    // 再查Redis
    if (!session && this._useRedis()) {
      const redis = this._getRedis();
      const sessionData = await redis.get(`${this.redisPrefix.session}${openidHash}`);
      if (sessionData) {
        session = JSON.parse(sessionData);
        this.sessions.set(openidHash, session);
      }
    }

    if (!session) {
      throw new GuestServiceError('SESSION_NOT_FOUND', 'Session not found');
    }

    if (session.token !== token) {
      throw new GuestServiceError('TOKEN_MISMATCH', 'Token does not match');
    }

    if (session.status !== 'active') {
      throw new GuestServiceError('SESSION_INACTIVE', 'Session is not active');
    }

    if (new Date(session.expiresAt) < new Date()) {
      session.status = 'expired';
      await this._persistSession(openidHash, session, 0);
      throw new GuestServiceError('TOKEN_EXPIRED', 'Token has expired');
    }

    return session;
  }

  /**
   * 获取游客的AI账户数量
   * @private
   * @param {string} openidHash - openid的hash
   * @returns {number} 账户数量
   */
  _getGuestAccountCount(openidHash) {
    let count = 0;
    for (const account of this.aiAccounts.values()) {
      if (account.guestId === openidHash && account.status !== 'migrated') {
        count++;
      }
    }
    return count;
  }

  /**
   * 获取游客的活跃AI账户数量（不包括已删除的）
   * @private
   * @param {string} openidHash - openid的hash
   * @returns {number} 活跃账户数量
   */
  _getActiveGuestAccountCount(openidHash) {
    let count = 0;
    for (const account of this.aiAccounts.values()) {
      if (account.guestId === openidHash &&
          account.status !== 'migrated' &&
          account.status !== 'deleted') {
        count++;
      }
    }
    return count;
  }

  /**
   * C5-002: 创建游客AI账户
   * P0-004: 支持Redis持久化
   * @param {string} token - 游客token
   * @param {Object} options - 账户选项
   * @returns {Promise<Object>} AI账户
   */
  async createAIAccount(token, options = {}) {
    const session = await this._validateToken(token);
    const openidHash = session.openidHash;

    // 检查账户数量限制（最多3个活跃账户）
    const activeCount = this._getActiveGuestAccountCount(openidHash);
    if (activeCount >= 3) {
      throw new GuestServiceError(
        'ACCOUNT_LIMIT_REACHED',
        'Maximum 3 active AI accounts allowed for guest'
      );
    }

    // 创建AI账户
    const accountId = `guest-acc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const account = {
      id: accountId,
      guestId: openidHash,
      name: options.name || `AI账户 ${accountCount + 1}`,
      initialBalance: options.initialBalance || 100000,
      status: 'initializing',
      createdAt: new Date().toISOString(),
      dialogues: [],
    };

    // 保存到内存
    this.aiAccounts.set(accountId, account);

    // 持久化到Redis
    await this._persistAccount(accountId, account);

    // 更新会话过期时间（72h）
    session.aiAccountCount = accountCount + 1;
    session.expiresAt = this._calculateExpiry(session.aiAccountCount).toISOString();
    await this._persistSession(openidHash, session, session.aiAccountCount);

    console.log(`[GuestService] Created AI account: ${accountId} for guest`);

    return account;
  }

  /**
   * 获取游客的所有AI账户
   * P0-004: 支持从Redis恢复
   * @param {string} token - 游客token
   * @returns {Promise<Array>} AI账户列表
   */
  async getGuestAccounts(token) {
    const session = await this._validateToken(token);
    const openidHash = session.openidHash;

    const accounts = [];

    // 从内存获取
    for (const account of this.aiAccounts.values()) {
      if (account.guestId === openidHash && account.status !== 'migrated') {
        accounts.push(account);
      }
    }

    // 从Redis获取（补充）
    if (this._useRedis() && accounts.length === 0) {
      try {
        const redis = this._getRedis();
        const accountIds = await redis.sMembers(`${this.redisPrefix.index}accounts:${openidHash}`);

        for (const accountId of accountIds) {
          if (!this.aiAccounts.has(accountId)) {
            const accountData = await redis.get(`${this.redisPrefix.account}${accountId}`);
            if (accountData) {
              const account = JSON.parse(accountData);
              if (account.status !== 'migrated') {
                this.aiAccounts.set(accountId, account);
                accounts.push(account);
              }
            }
          }
        }
      } catch (error) {
        console.error('[GuestService] Failed to load accounts from Redis:', error.message);
      }
    }

    return accounts;
  }

  /**
   * C5-003: 开始AI对话
   * P0-004: 支持Redis持久化
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @returns {Promise<Object>} 对话会话
   */
  async startDialogue(token, accountId) {
    const session = await this._validateToken(token);

    // 先查内存，再查Redis
    let account = this.aiAccounts.get(accountId);

    if (!account && this._useRedis()) {
      const redis = this._getRedis();
      const accountData = await redis.get(`${this.redisPrefix.account}${accountId}`);
      if (accountData) {
        account = JSON.parse(accountData);
        this.aiAccounts.set(accountId, account);
      }
    }

    if (!account || account.guestId !== session.openidHash) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    // 检查是否已有活跃对话
    let existingDialogue = this.dialogues.get(accountId);

    if (!existingDialogue && this._useRedis()) {
      const redis = this._getRedis();
      const dialogueData = await redis.get(`${this.redisPrefix.dialogue}${accountId}`);
      if (dialogueData) {
        existingDialogue = JSON.parse(dialogueData);
        this.dialogues.set(accountId, existingDialogue);
      }
    }

    if (existingDialogue && existingDialogue.status === 'active') {
      return existingDialogue;
    }

    // 创建新对话
    const dialogue = {
      sessionId: `dlg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      accountId,
      guestId: session.openidHash,
      roundCount: 0,
      maxRounds: 10,
      messages: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    // 保存到内存
    this.dialogues.set(accountId, dialogue);

    // 持久化到Redis
    await this._persistDialogue(accountId, dialogue);

    // 更新账户的对话列表
    account.dialogues.push(dialogue.sessionId);
    await this._persistAccount(accountId, account);

    console.log(`[GuestService] Started dialogue: ${dialogue.sessionId}`);

    return dialogue;
  }

  /**
   * 发送对话消息
   * P0-004: 支持Redis持久化
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @param {string} message - 用户消息
   * @returns {Promise<Object>} AI响应
   */
  async sendMessage(token, accountId, message) {
    const session = await this._validateToken(token);

    // 先查内存，再查Redis
    let dialogue = this.dialogues.get(accountId);

    if (!dialogue && this._useRedis()) {
      const redis = this._getRedis();
      const dialogueData = await redis.get(`${this.redisPrefix.dialogue}${accountId}`);
      if (dialogueData) {
        dialogue = JSON.parse(dialogueData);
        this.dialogues.set(accountId, dialogue);
      }
    }

    if (!dialogue || dialogue.guestId !== session.openidHash) {
      throw new GuestServiceError('DIALOGUE_NOT_FOUND', 'Dialogue not found');
    }

    if (dialogue.status !== 'active') {
      throw new GuestServiceError('DIALOGUE_INACTIVE', 'Dialogue is not active');
    }

    if (dialogue.roundCount >= dialogue.maxRounds) {
      throw new GuestServiceError(
        'ROUND_LIMIT_REACHED',
        'Dialogue round limit reached'
      );
    }

    // 增加轮数
    dialogue.roundCount++;
    dialogue.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // 模拟AI响应（实际应调用DeepSeek API）
    const response = {
      type: 'message',
      content: `AI response to: ${message}`,
      roundCount: dialogue.roundCount,
      remainingRounds: dialogue.maxRounds - dialogue.roundCount,
      isLastRound: dialogue.roundCount >= dialogue.maxRounds,
    };

    dialogue.messages.push({
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
    });

    // 持久化到Redis
    await this._persistDialogue(accountId, dialogue);

    return response;
  }

  /**
   * C5-004: 迁移游客数据到正式用户
   * P0-004: 支持Redis持久化
   * @param {string} token - 游客token
   * @param {string} formalUserId - 正式用户ID
   * @returns {Promise<Object>} 迁移结果
   */
  async migrateToFormalUser(token, formalUserId) {
    const session = await this._validateToken(token);
    const openidHash = session.openidHash;

    // 获取所有AI账户
    const accounts = await this.getGuestAccounts(token);

    const migratedAccounts = [];
    const errors = [];

    // 使用事务保护迁移
    try {
      for (const account of accounts) {
        try {
          const migratedAccount = await this.migrateAccount(account, formalUserId);
          migratedAccounts.push(migratedAccount);
        } catch (error) {
          errors.push({ accountId: account.id, error: error.message });
          throw error; // 触发回滚
        }
      }

      // 更新会话状态
      session.status = 'migrated';
      session.migratedTo = formalUserId;
      session.migratedAt = new Date().toISOString();

      // 持久化到Redis
      await this._persistSession(openidHash, session, 0);

      // 发布账户迁移事件
      if (EventBusService.isConnected) {
        await EventBusService.publishAccountUpdated(
          formalUserId,
          'guest_migration',
          session.token,
          formalUserId
        );
      }

      console.log(`[GuestService] Migrated ${migratedAccounts.length} accounts to user: ${formalUserId}`);

      return {
        success: true,
        migratedAccounts,
        migratedAt: session.migratedAt,
      };
    } catch (error) {
      // 回滚已迁移的账户
      for (const migrated of migratedAccounts) {
        const account = this.aiAccounts.get(migrated.originalId);
        if (account) {
          account.status = 'initializing';
          account.migratedTo = null;
          await this._persistAccount(migrated.originalId, account);
        }
      }

      throw new GuestServiceError(
        'MIGRATION_FAILED',
        `Migration failed: ${error.message}`,
        { errors }
      );
    }
  }

  /**
   * 迁移单个账户
   * @private
   * @param {Object} account - 游客AI账户
   * @param {string} formalUserId - 正式用户ID
   * @returns {Promise<Object>} 迁移后的账户
   */
  async migrateAccount(account, formalUserId) {
    // 模拟迁移逻辑
    const newAccountId = `user-${formalUserId}-${account.id}`;

    account.status = 'migrated';
    account.migratedTo = formalUserId;
    account.migratedAt = new Date().toISOString();
    account.newAccountId = newAccountId;

    // 持久化到Redis
    await this._persistAccount(account.id, account);

    return {
      originalId: account.id,
      newAccountId,
      newUserId: formalUserId,
      name: account.name,
      migratedAt: account.migratedAt,
    };
  }

  /**
   * C5-005: 清理过期会话
   * P0-004: 支持Redis清理
   */
  async cleanupExpiredSessions() {
    const now = new Date();
    let cleanedCount = 0;

    // 清理内存中的过期会话
    for (const [openidHash, session] of this.sessions.entries()) {
      if (session.status === 'active' && new Date(session.expiresAt) < now) {
        session.status = 'expired';
        cleanedCount++;

        // 清理关联的对话
        for (const [accountId, dialogue] of this.dialogues.entries()) {
          if (dialogue.guestId === openidHash) {
            dialogue.status = 'expired';
            await this._persistDialogue(accountId, dialogue);
          }
        }

        // 持久化过期状态到Redis
        await this._persistSession(openidHash, session, 0);

        console.log(`[GuestService] Expired session: ${openidHash.substring(0, 16)}...`);
      }
    }

    // Redis中的数据会通过TTL自动过期，无需手动清理

    return { cleanedCount };
  }

  /**
   * 开始清理任务
   */
  startCleanupTask() {
    // 每10分钟清理一次过期会话
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 10 * 60 * 1000);
  }

  /**
   * 停止清理任务
   */
  stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * C5-006: 获取会话信息
   * P0-004: 支持从Redis恢复
   * @param {string} token - 游客token
   * @returns {Promise<Object|null>} 会话信息
   */
  async getSession(token) {
    try {
      return await this._validateToken(token);
    } catch (error) {
      return null;
    }
  }

  /**
   * 删除游客AI账户（软删除）
   * 删除后可以重新创建，活跃账户上限保持3个
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteAIAccount(token, accountId) {
    const session = await this._validateToken(token);

    // 查找账户
    let account = this.aiAccounts.get(accountId);

    if (!account && this._useRedis()) {
      const redis = this._getRedis();
      const accountData = await redis.get(`${this.redisPrefix.account}${accountId}`);
      if (accountData) {
        account = JSON.parse(accountData);
      }
    }

    if (!account || account.guestId !== session.openidHash) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    if (account.status === 'deleted') {
      throw new GuestServiceError('ACCOUNT_ALREADY_DELETED', 'AI account already deleted');
    }

    // 软删除
    account.status = 'deleted';
    account.deletedAt = new Date().toISOString();

    // 保存
    this.aiAccounts.set(accountId, account);
    await this._persistAccount(accountId, account);

    console.log(`[GuestService] Deleted AI account: ${accountId}`);

    return {
      success: true,
      accountId,
      deletedAt: account.deletedAt,
      message: 'Account deleted successfully. You can create a new one.',
    };
  }

  /**
   * 获取AI账户详情（含持仓、余额信息）
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @returns {Promise<Object>} AI账户详情
   */
  async getAIAccountDetail(token, accountId) {
    const session = await this._validateToken(token);

    let account = this.aiAccounts.get(accountId);

    if (!account && this._useRedis()) {
      const redis = this._getRedis();
      const accountData = await redis.get(`${this.redisPrefix.account}${accountId}`);
      if (accountData) {
        account = JSON.parse(accountData);
        this.aiAccounts.set(accountId, account);
      }
    }

    if (!account || account.guestId !== session.openidHash) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    if (account.status === 'deleted') {
      throw new GuestServiceError('ACCOUNT_DELETED', 'AI account has been deleted');
    }

    // 构建账户详情（包含模拟的持仓和余额数据）
    const detail = {
      ...account,
      balance: this._generateMockBalance(account),
      positions: this._generateMockPositions(account),
      performance: this._generateMockPerformance(account),
    };

    return detail;
  }

  /**
   * 获取AI账户持仓列表
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @returns {Promise<Array>} 持仓列表
   */
  async getAIAccountPositions(token, accountId) {
    const session = await this._validateToken(token);

    let account = this.aiAccounts.get(accountId);

    if (!account && this._useRedis()) {
      const redis = this._getRedis();
      const accountData = await redis.get(`${this.redisPrefix.account}${accountId}`);
      if (accountData) {
        account = JSON.parse(accountData);
      }
    }

    if (!account || account.guestId !== session.openidHash) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    if (account.status === 'deleted') {
      throw new GuestServiceError('ACCOUNT_DELETED', 'AI account has been deleted');
    }

    return this._generateMockPositions(account);
  }

  /**
   * 获取AI账户交易记录
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 交易记录和统计
   */
  async getAIAccountTrades(token, accountId, options = {}) {
    const session = await this._validateToken(token);
    const { page = 1, limit = 20 } = options;

    let account = this.aiAccounts.get(accountId);

    if (!account && this._useRedis()) {
      const redis = this._getRedis();
      const accountData = await redis.get(`${this.redisPrefix.account}${accountId}`);
      if (accountData) {
        account = JSON.parse(accountData);
      }
    }

    if (!account || account.guestId !== session.openidHash) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    if (account.status === 'deleted') {
      throw new GuestServiceError('ACCOUNT_DELETED', 'AI account has been deleted');
    }

    // 生成模拟交易记录
    const trades = this._generateMockTrades(account, page, limit);
    const statistics = this._generateMockTradeStats(account);

    return {
      trades,
      statistics,
      pagination: {
        page,
        limit,
        total: account.trades?.length || 0,
      },
    };
  }

  /**
   * 获取AI账户绩效
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @param {string} period - 周期 (day/week/month/quarter/year/all)
   * @returns {Promise<Object>} 绩效数据
   */
  async getAIAccountPerformance(token, accountId, period = 'month') {
    const session = await this._validateToken(token);

    let account = this.aiAccounts.get(accountId);

    if (!account && this._useRedis()) {
      const redis = this._getRedis();
      const accountData = await redis.get(`${this.redisPrefix.account}${accountId}`);
      if (accountData) {
        account = JSON.parse(accountData);
      }
    }

    if (!account || account.guestId !== session.openidHash) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    if (account.status === 'deleted') {
      throw new GuestServiceError('ACCOUNT_DELETED', 'AI account has been deleted');
    }

    return this._generateMockPerformance(account, period);
  }

  /**
   * 获取AI账户余额
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @returns {Promise<Object>} 余额数据
   */
  async getAIAccountBalance(token, accountId) {
    const session = await this._validateToken(token);

    let account = this.aiAccounts.get(accountId);

    if (!account && this._useRedis()) {
      const redis = this._getRedis();
      const accountData = await redis.get(`${this.redisPrefix.account}${accountId}`);
      if (accountData) {
        account = JSON.parse(accountData);
      }
    }

    if (!account || account.guestId !== session.openidHash) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    if (account.status === 'deleted') {
      throw new GuestServiceError('ACCOUNT_DELETED', 'AI account has been deleted');
    }

    return this._generateMockBalance(account);
  }

  /**
   * 生成模拟余额数据
   * @private
   */
  _generateMockBalance(account) {
    const initialBalance = account.initialBalance || 100000;
    // 模拟一些收益/亏损
    const mockReturn = (Math.random() * 0.2 - 0.05); // -5% to +15%
    const currentBalance = initialBalance * (1 + mockReturn);
    const totalValue = currentBalance + (initialBalance * 0.3); // 假设持仓市值

    return {
      initialBalance,
      currentBalance: Math.round(currentBalance * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
      availableCash: Math.round(currentBalance * 0.3 * 100) / 100, // 30% 现金
      totalReturn: Math.round(mockReturn * 10000) / 100, // 百分比
      totalReturnAmount: Math.round((currentBalance - initialBalance) * 100) / 100,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 生成模拟持仓数据
   * @private
   */
  _generateMockPositions(account) {
    const positions = [];
    const stockCodes = ['000001.SZ', '600000.SH', '000858.SZ', '600519.SH', '002594.SZ'];
    const stockNames = ['平安银行', '浦发银行', '五粮液', '贵州茅台', '比亚迪'];

    // 生成2-4个模拟持仓
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const avgPrice = 10 + Math.random() * 100;
      const quantity = 100 + Math.floor(Math.random() * 10) * 100;
      const currentPrice = avgPrice * (1 + (Math.random() * 0.2 - 0.08));
      const profitLoss = (currentPrice - avgPrice) * quantity;

      positions.push({
        symbol: stockCodes[i],
        name: stockNames[i],
        quantity,
        avgPrice: Math.round(avgPrice * 100) / 100,
        currentPrice: Math.round(currentPrice * 100) / 100,
        cost: Math.round(avgPrice * quantity * 100) / 100,
        marketValue: Math.round(currentPrice * quantity * 100) / 100,
        profitLoss: Math.round(profitLoss * 100) / 100,
        profitLossRate: Math.round(((currentPrice - avgPrice) / avgPrice) * 10000) / 100,
        weight: Math.round((1 / count) * 10000) / 100,
        updatedAt: new Date().toISOString(),
      });
    }

    return positions;
  }

  /**
   * 生成模拟绩效数据
   * @private
   */
  _generateMockPerformance(account, period = 'month') {
    const initialBalance = account.initialBalance || 100000;
    const totalReturn = Math.random() * 0.25 - 0.05; // -5% to +20%
    const totalValue = initialBalance * (1 + totalReturn);

    // 生成收益曲线数据点
    const dataPoints = [];
    const days = period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 :
                  period === 'quarter' ? 90 : period === 'year' ? 365 : 30;

    for (let i = days; i >= 0; i -= Math.floor(days / 10) || 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const progress = (days - i) / days;
      const dailyReturn = totalReturn * progress + (Math.random() * 0.02 - 0.01);
      dataPoints.push({
        date: date.toISOString().split('T')[0],
        value: initialBalance * (1 + dailyReturn),
        return: dailyReturn,
      });
    }

    return {
      initialBalance,
      currentValue: Math.round(totalValue * 100) / 100,
      totalReturn: Math.round(totalReturn * 10000) / 100,
      totalReturnAmount: Math.round((totalValue - initialBalance) * 100) / 100,
      sharpeRatio: Math.round((Math.random() * 1.5 + 0.5) * 100) / 100,
      maxDrawdown: Math.round((Math.random() * 0.15) * 10000) / 100,
      volatility: Math.round((Math.random() * 0.2 + 0.1) * 10000) / 100,
      winRate: Math.round((Math.random() * 0.3 + 0.5) * 10000) / 100,
      dataPoints,
      period,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 生成模拟交易记录
   * @private
   */
  _generateMockTrades(account, page = 1, limit = 20) {
    const trades = [];
    const stockCodes = ['000001.SZ', '600000.SH', '000858.SZ', '600519.SH'];
    const stockNames = ['平安银行', '浦发银行', '五粮液', '贵州茅台'];
    const actions = ['buy', 'sell'];

    const count = Math.min(limit, 10 + Math.floor(Math.random() * 20)); // 10-30条记录

    for (let i = 0; i < count; i++) {
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 30));

      const action = actions[Math.floor(Math.random() * actions.length)];
      const price = 10 + Math.random() * 100;
      const quantity = 100 + Math.floor(Math.random() * 10) * 100;

      trades.push({
        id: `trade-${account.id}-${i}`,
        accountId: account.id,
        symbol: stockCodes[Math.floor(Math.random() * stockCodes.length)],
        name: stockNames[Math.floor(Math.random() * stockNames.length)],
        action,
        price: Math.round(price * 100) / 100,
        quantity,
        totalAmount: Math.round(price * quantity * 100) / 100,
        status: 'executed',
        executedAt: date.toISOString(),
        reason: 'AI决策自动执行',
      });
    }

    // 按时间排序
    trades.sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));

    return trades;
  }

  /**
   * 生成模拟交易统计
   * @private
   */
  _generateMockTradeStats(account) {
    const totalTrades = 20 + Math.floor(Math.random() * 30);
    const buyTrades = Math.floor(totalTrades * 0.6);
    const sellTrades = totalTrades - buyTrades;
    const winTrades = Math.floor(totalTrades * 0.65);

    return {
      totalTrades,
      buyTrades,
      sellTrades,
      winTrades,
      lossTrades: totalTrades - winTrades,
      winRate: Math.round((winTrades / totalTrades) * 10000) / 100,
      totalProfit: Math.round(Math.random() * 5000 * 100) / 100,
      totalLoss: Math.round(Math.random() * 2000 * 100) / 100,
      avgTradeAmount: Math.round((15000 + Math.random() * 10000) * 100) / 100,
    };
  }

  /**
   * P0-004: 从Redis恢复所有数据（服务启动时调用）
   * @returns {Promise<Object>} 恢复统计
   */
  async restoreFromRedis() {
    if (!this._useRedis()) {
      return { restored: 0, message: 'Redis not available' };
    }

    try {
      const redis = this._getRedis();
      let restoredSessions = 0;
      let restoredAccounts = 0;
      let restoredDialogues = 0;

      // 恢复会话
      const sessionKeys = await redis.keys(`${this.redisPrefix.session}*`);
      for (const key of sessionKeys) {
        const sessionData = await redis.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (session.status === 'active' && new Date(session.expiresAt) > new Date()) {
            this.sessions.set(session.openidHash, session);
            restoredSessions++;
          }
        }
      }

      // 恢复账户
      const accountKeys = await redis.keys(`${this.redisPrefix.account}*`);
      for (const key of accountKeys) {
        const accountData = await redis.get(key);
        if (accountData) {
          const account = JSON.parse(accountData);
          if (account.status !== 'migrated') {
            this.aiAccounts.set(account.id, account);
            restoredAccounts++;
          }
        }
      }

      // 恢复对话
      const dialogueKeys = await redis.keys(`${this.redisPrefix.dialogue}*`);
      for (const key of dialogueKeys) {
        const dialogueData = await redis.get(key);
        if (dialogueData) {
          const dialogue = JSON.parse(dialogueData);
          if (dialogue.status === 'active') {
            this.dialogues.set(dialogue.accountId, dialogue);
            restoredDialogues++;
          }
        }
      }

      console.log(`[GuestService] Restored from Redis: ${restoredSessions} sessions, ${restoredAccounts} accounts, ${restoredDialogues} dialogues`);

      return {
        restored: restoredSessions + restoredAccounts + restoredDialogues,
        sessions: restoredSessions,
        accounts: restoredAccounts,
        dialogues: restoredDialogues
      };
    } catch (error) {
      console.error('[GuestService] Failed to restore from Redis:', error.message);
      return { restored: 0, error: error.message };
    }
  }

  /**
   * P0-004: 获取持久化统计
   * @returns {Object}
   */
  getPersistenceStats() {
    return {
      memory: {
        sessions: this.sessions.size,
        accounts: this.aiAccounts.size,
        dialogues: this.dialogues.size
      },
      redis: {
        available: this._useRedis(),
        prefix: this.redisPrefix
      }
    };
  }
}

// 导出单例
const guestService = new GuestService();
export { guestService as default, GuestService, GuestServiceError };
