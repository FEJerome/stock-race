import Redis from 'redis';
import { systemLogRepository } from '../models/index.js';

export class SessionService {
  constructor() {
    this.redisClient = null;
    this.sessionPrefix = 'session:';
    this.userSessionPrefix = 'user:session:';
    this.sessionTtl = parseInt(process.env.SESSION_TTL || '86400'); // 默认24小时
    this.maxSessionsPerUser = parseInt(process.env.MAX_SESSIONS_PER_USER || '5');
  }

  /**
   * 初始化Redis客户端
   */
  async init() {
    if (this.redisClient) {
      return;
    }

    try {
      this.redisClient = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB || '0')
      });

      this.redisClient.on('error', (err) => {
        console.error('Redis连接错误:', err);
      });

      this.redisClient.on('connect', () => {
        console.log('✅ Redis连接成功');
      });

      await this.redisClient.connect();
    } catch (error) {
      console.error('❌ Redis连接失败:', error);
      throw error;
    }
  }

  /**
   * 创建会话
   * @param {number} userId - 用户ID
   * @param {Object} userData - 用户数据
   * @param {Object} clientInfo - 客户端信息
   * @returns {Promise<{sessionId: string, expiresAt: Date}>}
   */
  async createSession(userId, userData, clientInfo = {}) {
    await this.init();

    const sessionId = this.generateSessionId();
    const expiresAt = new Date(Date.now() + this.sessionTtl * 1000);

    const sessionData = {
      userId,
      username: userData.username,
      email: userData.email,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      clientInfo
    };

    // 存储会话数据
    await this.redisClient.set(
      `${this.sessionPrefix}${sessionId}`,
      JSON.stringify(sessionData),
      { EX: this.sessionTtl }
    );

    // 将会话ID添加到用户会话集合
    await this.redisClient.sAdd(
      `${this.userSessionPrefix}${userId}`,
      sessionId
    );

    // 限制用户会话数量
    await this.cleanupUserSessions(userId);

    // 记录会话创建
    await this.logSessionActivity(userId, 'create', sessionId, clientInfo);

    return {
      sessionId,
      expiresAt
    };
  }

  /**
   * 获取会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object|null>}
   */
  async getSession(sessionId) {
    await this.init();

    try {
      const sessionData = await this.redisClient.get(`${this.sessionPrefix}${sessionId}`);

      if (!sessionData) {
        return null;
      }

      const session = JSON.parse(sessionData);

      // 检查会话是否过期
      if (new Date(session.expiresAt) < new Date()) {
        await this.deleteSession(sessionId);
        return null;
      }

      // 更新最后访问时间（可选）
      // await this.touchSession(sessionId);

      return session;
    } catch (error) {
      console.error('获取会话失败:', error);
      return null;
    }
  }

  /**
   * 验证会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<{valid: boolean, session?: Object, message?: string}>}
   */
  async validateSession(sessionId) {
    const session = await this.getSession(sessionId);

    if (!session) {
      return {
        valid: false,
        message: '会话不存在或已过期'
      };
    }

    return {
      valid: true,
      session
    };
  }

  /**
   * 删除会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<boolean>}
   */
  async deleteSession(sessionId) {
    await this.init();

    try {
      // 获取会话数据以记录用户ID
      const sessionData = await this.redisClient.get(`${this.sessionPrefix}${sessionId}`);
      let userId = null;

      if (sessionData) {
        const session = JSON.parse(sessionData);
        userId = session.userId;

        // 从用户会话集合中移除
        if (userId) {
          await this.redisClient.sRem(`${this.userSessionPrefix}${userId}`, sessionId);
        }
      }

      // 删除会话数据
      await this.redisClient.del(`${this.sessionPrefix}${sessionId}`);

      // 记录会话删除
      if (userId) {
        await this.logSessionActivity(userId, 'delete', sessionId);
      }

      return true;
    } catch (error) {
      console.error('删除会话失败:', error);
      return false;
    }
  }

  /**
   * 更新会话
   * @param {string} sessionId - 会话ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<boolean>}
   */
  async updateSession(sessionId, updates) {
    await this.init();

    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        return false;
      }

      const updatedSession = {
        ...session,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await this.redisClient.set(
        `${this.sessionPrefix}${sessionId}`,
        JSON.stringify(updatedSession),
        { EX: this.sessionTtl }
      );

      return true;
    } catch (error) {
      console.error('更新会话失败:', error);
      return false;
    }
  }

  /**
   * 延长会话有效期
   * @param {string} sessionId - 会话ID
   * @returns {Promise<boolean>}
   */
  async touchSession(sessionId) {
    await this.init();

    try {
      const session = await this.getSession(sessionId);

      if (!session) {
        return false;
      }

      // 更新过期时间
      session.expiresAt = new Date(Date.now() + this.sessionTtl * 1000).toISOString();
      session.updatedAt = new Date().toISOString();

      await this.redisClient.set(
        `${this.sessionPrefix}${sessionId}`,
        JSON.stringify(session),
        { EX: this.sessionTtl }
      );

      return true;
    } catch (error) {
      console.error('延长会话失败:', error);
      return false;
    }
  }

  /**
   * 获取用户的所有会话
   * @param {number} userId - 用户ID
   * @returns {Promise<Array>}
   */
  async getUserSessions(userId) {
    await this.init();

    try {
      const sessionIds = await this.redisClient.sMembers(`${this.userSessionPrefix}${userId}`);

      const sessions = [];
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push({
            sessionId,
            ...session
          });
        }
      }

      return sessions;
    } catch (error) {
      console.error('获取用户会话失败:', error);
      return [];
    }
  }

  /**
   * 清理用户过期会话
   * @param {number} userId - 用户ID
   */
  async cleanupUserSessions(userId) {
    await this.init();

    try {
      const sessionIds = await this.redisClient.sMembers(`${this.userSessionPrefix}${userId}`);

      // 检查每个会话是否有效
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (!session) {
          // 从集合中移除无效会话
          await this.redisClient.sRem(`${this.userSessionPrefix}${userId}`, sessionId);
        }
      }

      // 如果会话数量超过限制，删除最旧的会话
      const currentCount = await this.redisClient.sCard(`${this.userSessionPrefix}${userId}`);

      if (currentCount > this.maxSessionsPerUser) {
        const allSessionIds = await this.redisClient.sMembers(`${this.userSessionPrefix}${userId}`);
        const sessionsWithData = [];

        // 获取所有会话的创建时间
        for (const sessionId of allSessionIds) {
          const session = await this.getSession(sessionId);
          if (session) {
            sessionsWithData.push({
              sessionId,
              createdAt: new Date(session.createdAt)
            });
          }
        }

        // 按创建时间排序
        sessionsWithData.sort((a, b) => a.createdAt - b.createdAt);

        // 删除最旧的会话直到数量符合限制
        const sessionsToDelete = sessionsWithData.slice(0, currentCount - this.maxSessionsPerUser);

        for (const session of sessionsToDelete) {
          await this.deleteSession(session.sessionId);
        }
      }
    } catch (error) {
      console.error('清理用户会话失败:', error);
    }
  }

  /**
   * 强制用户退出所有会话
   * @param {number} userId - 用户ID
   * @returns {Promise<number>} 删除的会话数量
   */
  async forceLogoutUser(userId) {
    await this.init();

    try {
      const sessionIds = await this.redisClient.sMembers(`${this.userSessionPrefix}${userId}`);

      let deletedCount = 0;
      for (const sessionId of sessionIds) {
        await this.deleteSession(sessionId);
        deletedCount++;
      }

      // 记录强制退出
      await this.logSessionActivity(userId, 'force_logout', null, {
        deletedSessions: deletedCount
      });

      return deletedCount;
    } catch (error) {
      console.error('强制用户退出失败:', error);
      return 0;
    }
  }

  /**
   * 获取会话统计
   * @returns {Promise<Object>}
   */
  async getSessionStats() {
    await this.init();

    try {
      // 获取所有会话键
      const sessionKeys = await this.redisClient.keys(`${this.sessionPrefix}*`);

      const stats = {
        totalSessions: sessionKeys.length,
        activeUsers: new Set(),
        byClient: {}
      };

      // 分析会话数据
      for (const key of sessionKeys) {
        const sessionData = await this.redisClient.get(key);

        if (sessionData) {
          const session = JSON.parse(sessionData);

          // 统计活跃用户
          stats.activeUsers.add(session.userId);

          // 统计客户端类型
          const clientType = session.clientInfo?.userAgent || 'unknown';
          if (!stats.byClient[clientType]) {
            stats.byClient[clientType] = 0;
          }
          stats.byClient[clientType]++;
        }
      }

      stats.activeUsersCount = stats.activeUsers.size;

      return stats;
    } catch (error) {
      console.error('获取会话统计失败:', error);
      return {
        totalSessions: 0,
        activeUsersCount: 0,
        byClient: {}
      };
    }
  }

  /**
   * 清理所有过期会话
   * @returns {Promise<number>} 清理的会话数量
   */
  async cleanupExpiredSessions() {
    await this.init();

    try {
      const sessionKeys = await this.redisClient.keys(`${this.sessionPrefix}*`);
      let cleanedCount = 0;

      for (const key of sessionKeys) {
        const sessionData = await this.redisClient.get(key);

        if (sessionData) {
          const session = JSON.parse(sessionData);

          if (new Date(session.expiresAt) < new Date()) {
            const sessionId = key.replace(this.sessionPrefix, '');
            await this.deleteSession(sessionId);
            cleanedCount++;
          }
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('清理过期会话失败:', error);
      return 0;
    }
  }

  /**
   * 生成会话ID
   * @returns {string}
   */
  generateSessionId() {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 记录会话活动
   * @param {number} userId - 用户ID
   * @param {string} action - 操作类型
   * @param {string|null} sessionId - 会话ID
   * @param {Object} metadata - 元数据
   */
  async logSessionActivity(userId, action, sessionId, metadata = {}) {
    try {
      await systemLogRepository.logUserActivity({
        userId,
        module: 'session',
        action,
        message: `会话${action}: ${sessionId || 'N/A'}`,
        metadata: {
          sessionId,
          ...metadata
        }
      });
    } catch (error) {
      console.error('记录会话活动失败:', error);
    }
  }

  /**
   * 关闭Redis连接
   */
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
      console.log('✅ Redis连接已关闭');
    }
  }
}

// 创建单例实例
export const sessionService = new SessionService();