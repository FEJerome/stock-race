/**
 * Guest Service
 * Backend游客模式服务
 *
 * 对应需求: C5-001 ~ C5-006
 */

const crypto = require('crypto');
const { EventBusService } = require('./EventBusService');

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
 */
class GuestService {
  constructor() {
    // 游客会话映射: Map<openidHash, GuestSession>
    this.sessions = new Map();
    // AI账户映射: Map<accountId, GuestAIAccount>
    this.aiAccounts = new Map();
    // 对话会话映射: Map<accountId, DialogueSession>
    this.dialogues = new Map();
    // 清理定时器
    this.cleanupInterval = null;

    this.startCleanupTask();
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
   * C5-001: 创建游客Token
   * @param {string} openid - 微信openid
   * @returns {Promise<Object>} token信息
   */
  async createGuestToken(openid) {
    const openidHash = this._hashOpenid(openid);

    // 检查是否已存在会话
    let session = this.sessions.get(openidHash);

    if (session) {
      // 更新过期时间
      const accountCount = this._getGuestAccountCount(openidHash);
      session.expiresAt = this._calculateExpiry(accountCount).toISOString();
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

    this.sessions.set(openidHash, session);

    console.log(`[GuestService] Created guest token: ${token.substring(0, 20)}...`);

    return {
      token,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * 验证token并获取会话
   * @private
   * @param {string} token - 游客token
   * @returns {Object} 会话对象
   */
  _validateToken(token) {
    // 从token提取openidHash
    const parts = token.split('_');
    if (parts.length !== 3 || parts[0] !== 'guest') {
      throw new GuestServiceError('INVALID_TOKEN', 'Invalid token format');
    }

    const openidHash = parts[1];
    const session = this.sessions.get(openidHash);

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
   * C5-002: 创建游客AI账户
   * @param {string} token - 游客token
   * @param {Object} options - 账户选项
   * @returns {Promise<Object>} AI账户
   */
  async createAIAccount(token, options = {}) {
    const session = this._validateToken(token);
    const openidHash = session.openidHash;

    // 检查账户数量限制
    const accountCount = this._getGuestAccountCount(openidHash);
    if (accountCount >= 2) {
      throw new GuestServiceError(
        'ACCOUNT_LIMIT_REACHED',
        'Maximum 2 AI accounts allowed for guest'
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

    this.aiAccounts.set(accountId, account);

    // 更新会话过期时间（72h）
    session.aiAccountCount = accountCount + 1;
    session.expiresAt = this._calculateExpiry(session.aiAccountCount).toISOString();

    console.log(`[GuestService] Created AI account: ${accountId} for guest`);

    return account;
  }

  /**
   * 获取游客的所有AI账户
   * @param {string} token - 游客token
   * @returns {Promise<Array>} AI账户列表
   */
  async getGuestAccounts(token) {
    const session = this._validateToken(token);
    const openidHash = session.openidHash;

    const accounts = [];
    for (const account of this.aiAccounts.values()) {
      if (account.guestId === openidHash && account.status !== 'migrated') {
        accounts.push(account);
      }
    }

    return accounts;
  }

  /**
   * C5-003: 开始AI对话
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @returns {Promise<Object>} 对话会话
   */
  async startDialogue(token, accountId) {
    const session = this._validateToken(token);
    const account = this.aiAccounts.get(accountId);

    if (!account || account.guestId !== session.openidHash) {
      throw new GuestServiceError('ACCOUNT_NOT_FOUND', 'AI account not found');
    }

    // 检查是否已有活跃对话
    const existingDialogue = this.dialogues.get(accountId);
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

    this.dialogues.set(accountId, dialogue);
    account.dialogues.push(dialogue.sessionId);

    console.log(`[GuestService] Started dialogue: ${dialogue.sessionId}`);

    return dialogue;
  }

  /**
   * 发送对话消息
   * @param {string} token - 游客token
   * @param {string} accountId - AI账户ID
   * @param {string} message - 用户消息
   * @returns {Promise<Object>} AI响应
   */
  async sendMessage(token, accountId, message) {
    const session = this._validateToken(token);
    const dialogue = this.dialogues.get(accountId);

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

    return response;
  }

  /**
   * C5-004: 迁移游客数据到正式用户
   * @param {string} token - 游客token
   * @param {string} formalUserId - 正式用户ID
   * @returns {Promise<Object>} 迁移结果
   */
  async migrateToFormalUser(token, formalUserId) {
    const session = this._validateToken(token);
    const openidHash = session.openidHash;

    // 获取所有AI账户
    const accounts = [];
    for (const account of this.aiAccounts.values()) {
      if (account.guestId === openidHash && account.status !== 'migrated') {
        accounts.push(account);
      }
    }

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
   */
  async cleanupExpiredSessions() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [openidHash, session] of this.sessions.entries()) {
      if (session.status === 'active' && new Date(session.expiresAt) < now) {
        session.status = 'expired';
        cleanedCount++;

        // 清理关联的对话
        for (const [accountId, dialogue] of this.dialogues.entries()) {
          if (dialogue.guestId === openidHash) {
            dialogue.status = 'expired';
          }
        }

        console.log(`[GuestService] Expired session: ${openidHash.substring(0, 16)}...`);
      }
    }

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
   * @param {string} token - 游客token
   * @returns {Promise<Object|null>} 会话信息
   */
  async getSession(token) {
    try {
      const session = this._validateToken(token);
      return session;
    } catch (error) {
      return null;
    }
  }
}

// 导出单例
module.exports = new GuestService();
module.exports.GuestServiceError = GuestServiceError;
