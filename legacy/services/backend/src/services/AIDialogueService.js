import { aiServiceClient } from './AIServiceClient.js';

/**
 * AI对话服务错误
 */
export class AIDialogueError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AIDialogueError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 对话限制配置
 */
const DIALOGUE_LIMITS = {
  MAX_ROUNDS: 10,           // 最大对话轮数
  MAX_TOKENS_PER_MESSAGE: 500,  // 每轮最大token数
  COOLDOWN_MS: 1000,        // 冷却时间（毫秒）
  INACTIVITY_TIMEOUT_MS: 60 * 60 * 1000,  // 1小时无操作自动断开
  MAX_MESSAGE_LENGTH: 2000  // 最大消息长度（字符）
};

/**
 * AI对话服务
 * 管理AI账户的对话会话，实现对话限制保护
 */
export class AIDialogueService {
  constructor() {
    // 会话映射: Map<accountId, DialogueSession>
    this.sessions = new Map();
    // 活跃连接映射: Map<accountId, socketId>
    this.activeConnections = new Map();
    // 清理定时器
    this.cleanupInterval = null;

    this.startCleanupTask();
  }

  /**
   * 开始清理任务
   * 定期检查并清理过期会话
   */
  startCleanupTask() {
    // 每5分钟清理一次过期会话
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
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
   * 创建或获取对话会话
   * @param {string} accountId - AI账户ID
   * @param {Object} options - 会话选项
   * @returns {DialogueSession} 对话会话
   */
  createSession(accountId, options = {}) {
    const session = {
      accountId,
      socketId: options.socketId,
      userId: options.userId,
      roundCount: 0,
      messages: [],
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      status: 'active',
      persona: options.persona || 'professional_trader',
      config: {
        maxRounds: options.maxRounds ?? DIALOGUE_LIMITS.MAX_ROUNDS,
        maxTokens: options.maxTokens ?? DIALOGUE_LIMITS.MAX_TOKENS_PER_MESSAGE,
        cooldownMs: options.cooldownMs ?? DIALOGUE_LIMITS.COOLDOWN_MS
      }
    };

    this.sessions.set(accountId, session);
    console.log(`[AIDialogueService] 创建会话: accountId=${accountId}`);

    return session;
  }

  /**
   * 获取会话
   * @param {string} accountId - AI账户ID
   * @returns {DialogueSession|null}
   */
  getSession(accountId) {
    return this.sessions.get(accountId) || null;
  }

  /**
   * 检查是否可以连接
   * @param {string} accountId - AI账户ID
   * @param {string} socketId - 当前socket ID
   * @returns {Object} 检查结果
   */
  canConnect(accountId, socketId) {
    const existingSocketId = this.activeConnections.get(accountId);

    if (existingSocketId && existingSocketId !== socketId) {
      return {
        allowed: false,
        code: 'ALREADY_CONNECTED',
        message: '该账户已有活跃的对话连接',
        existingSocketId
      };
    }

    return { allowed: true };
  }

  /**
   * 注册连接
   * @param {string} accountId - AI账户ID
   * @param {string} socketId - Socket ID
   * @param {Object} options - 连接选项
   * @returns {Object} 会话信息
   */
  async registerConnection(accountId, socketId, options = {}) {
    // 检查并发限制
    const canConnect = this.canConnect(accountId, socketId);
    if (!canConnect.allowed) {
      throw new AIDialogueError(
        canConnect.code,
        canConnect.message,
        { existingSocketId: canConnect.existingSocketId }
      );
    }

    // 标记活跃连接
    this.activeConnections.set(accountId, socketId);

    // 创建或重置会话
    let session = this.getSession(accountId);
    if (!session || session.status !== 'active') {
      session = this.createSession(accountId, { socketId, ...options });
    } else {
      // 更新socket ID
      session.socketId = socketId;
      session.lastActivityAt = Date.now();
    }

    return {
      sessionId: accountId,
      roundCount: session.roundCount,
      remainingRounds: session.config.maxRounds - session.roundCount,
      maxRounds: session.config.maxRounds,
      status: session.status
    };
  }

  /**
   * 断开连接
   * @param {string} accountId - AI账户ID
   * @param {string} socketId - Socket ID
   */
  disconnect(accountId, socketId) {
    const activeSocketId = this.activeConnections.get(accountId);

    // 只有匹配的socket才能断开
    if (activeSocketId === socketId) {
      this.activeConnections.delete(accountId);

      const session = this.sessions.get(accountId);
      if (session) {
        session.status = 'disconnected';
        session.disconnectedAt = Date.now();
      }

      console.log(`[AIDialogueService] 断开连接: accountId=${accountId}`);
    }
  }

  /**
   * 发送消息
   * @param {string} accountId - AI账户ID
   * @param {string} socketId - Socket ID
   * @param {string} message - 用户消息
   * @returns {Object} AI回复
   */
  async sendMessage(accountId, socketId, message) {
    // 验证会话
    const session = this.getSession(accountId);
    if (!session) {
      throw new AIDialogueError('SESSION_NOT_FOUND', '对话会话不存在');
    }

    // 验证socket ID
    if (session.socketId !== socketId) {
      throw new AIDialogueError('UNAUTHORIZED', '无权访问该对话会话');
    }

    // 检查会话状态
    if (session.status !== 'active') {
      throw new AIDialogueError('SESSION_INACTIVE', '对话会话已结束');
    }

    // 检查对话轮数限制
    if (session.roundCount >= session.config.maxRounds) {
      throw new AIDialogueError(
        'ROUND_LIMIT_REACHED',
        `已达到最大对话轮数限制 (${session.config.maxRounds}轮)`,
        { roundCount: session.roundCount, maxRounds: session.config.maxRounds }
      );
    }

    // 检查消息长度
    if (message.length > DIALOGUE_LIMITS.MAX_MESSAGE_LENGTH) {
      throw new AIDialogueError(
        'MESSAGE_TOO_LONG',
        `消息长度超过限制 (${DIALOGUE_LIMITS.MAX_MESSAGE_LENGTH}字符)`,
        { maxLength: DIALOGUE_LIMITS.MAX_MESSAGE_LENGTH }
      );
    }

    // 检查冷却时间（第一轮不检查，因为 lastActivityAt 在注册时已设置）
    const timeSinceLastActivity = Date.now() - session.lastActivityAt;
    if (session.roundCount > 0 && timeSinceLastActivity < session.config.cooldownMs) {
      const remainingCooldown = Math.ceil((session.config.cooldownMs - timeSinceLastActivity) / 1000);
      throw new AIDialogueError(
        'COOLDOWN',
        `请等待 ${remainingCooldown} 秒后再发送消息`,
        { remainingCooldown }
      );
    }

    // 更新活动时间
    session.lastActivityAt = Date.now();

    // 构建对话上下文
    const dialogueContext = this.buildDialogueContext(session, message);

    try {
      // 调用AI服务生成回复
      const aiResponse = await this.generateAIResponse(accountId, dialogueContext);

      // 检查token限制
      if (aiResponse.content.length > session.config.maxTokens * 4) {  // 粗略估算：1 token ≈ 4 字符
        console.warn(`[AIDialogueService] 回复可能超过token限制: accountId=${accountId}`);
      }

      // 记录对话
      session.messages.push({
        role: 'user',
        content: message,
        timestamp: Date.now()
      });
      session.messages.push({
        role: 'assistant',
        content: aiResponse.content,
        timestamp: Date.now()
      });

      // 增加轮数
      session.roundCount++;

      // 检查是否达到轮数限制
      const remainingRounds = session.config.maxRounds - session.roundCount;
      const isLastRound = remainingRounds === 0;

      return {
        message: aiResponse.content,
        roundCount: session.roundCount,
        remainingRounds,
        isLastRound,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[AIDialogueService] AI响应生成失败:`, error);
      throw new AIDialogueError(
        'AI_RESPONSE_FAILED',
        'AI响应生成失败，请稍后重试',
        { originalError: error.message }
      );
    }
  }

  /**
   * 构建对话上下文
   * @param {DialogueSession} session - 会话
   * @param {string} currentMessage - 当前消息
   * @returns {Object} 对话上下文
   */
  buildDialogueContext(session, currentMessage) {
    // 获取最近的消息作为上下文（保留最多5轮）
    const recentMessages = session.messages.slice(-10);

    return {
      persona: session.persona,
      roundCount: session.roundCount,
      history: recentMessages.map(m => ({
        role: m.role,
        content: m.content
      })),
      currentMessage,
      remainingRounds: session.config.maxRounds - session.roundCount
    };
  }

  /**
   * 生成AI响应
   * @param {string} accountId - AI账户ID
   * @param {Object} context - 对话上下文
   * @returns {Object} AI响应
   */
  async generateAIResponse(accountId, context) {
    // 这里应该调用实际的AI服务
    // 目前使用模拟响应

    const personaResponses = {
      professional_trader: `作为专业交易员，我理解您的需求。基于当前市场情况，建议您关注风险控制和资金管理。`,
      aggressive_growth: `激进增长策略下，我们可以考虑更高风险的机会，但请务必设置止损。`,
      conservative_value: `保守价值投资强调安全边际，建议关注基本面稳健的标的。`,
      default: `感谢您的消息。我会根据您的投资目标和风险偏好提供建议。`
    };

    const response = personaResponses[context.persona] || personaResponses.default;

    // 添加剩余轮数提示
    let finalResponse = response;
    if (context.remainingRounds <= 2) {
      finalResponse += `\n\n【提示】对话即将结束（还剩${context.remainingRounds}轮），请总结您的投资偏好。`;
    }

    return {
      content: finalResponse,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 结束对话
   * @param {string} accountId - AI账户ID
   * @param {string} socketId - Socket ID
   * @returns {Object} 对话总结
   */
  async endDialogue(accountId, socketId) {
    const session = this.getSession(accountId);

    if (!session || session.socketId !== socketId) {
      throw new AIDialogueError('UNAUTHORIZED', '无权结束该对话');
    }

    // 生成对话总结
    const summary = await this.generateSummary(session);

    // 标记会话结束
    session.status = 'completed';
    session.completedAt = Date.now();

    // 清理活跃连接
    this.activeConnections.delete(accountId);

    return {
      summary: summary.content,
      roundCount: session.roundCount,
      duration: session.completedAt - session.createdAt,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 生成对话总结
   * @param {DialogueSession} session - 会话
   * @returns {Object} 总结
   */
  async generateSummary(session) {
    // 这里应该调用AI服务生成总结
    // 目前使用模拟总结

    return {
      content: `对话总结：用户表达了投资意向，建议采用${session.persona}策略。共进行了${session.roundCount}轮对话。`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [accountId, session] of this.sessions.entries()) {
      // 检查无操作超时
      const inactiveTime = now - session.lastActivityAt;

      if (inactiveTime > DIALOGUE_LIMITS.INACTIVITY_TIMEOUT_MS) {
        // 标记为过期
        session.status = 'expired';

        // 清理活跃连接
        if (this.activeConnections.get(accountId) === session.socketId) {
          this.activeConnections.delete(accountId);
        }

        cleanedCount++;
        console.log(`[AIDialogueService] 清理过期会话: accountId=${accountId}, 无操作时间=${Math.floor(inactiveTime / 60000)}分钟`);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[AIDialogueService] 清理完成: 共${cleanedCount}个过期会话`);
    }
  }

  /**
   * 获取会话统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.status === 'active').length,
      activeConnections: this.activeConnections.size,
      limits: DIALOGUE_LIMITS
    };
  }

  /**
   * 获取会话详情
   * @param {string} accountId - AI账户ID
   * @returns {Object|null} 会话详情
   */
  getSessionDetails(accountId) {
    const session = this.sessions.get(accountId);
    if (!session) return null;

    return {
      accountId: session.accountId,
      roundCount: session.roundCount,
      remainingRounds: session.config.maxRounds - session.roundCount,
      maxRounds: session.config.maxRounds,
      status: session.status,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      isConnected: this.activeConnections.has(accountId),
      messageCount: session.messages.length
    };
  }

  /**
   * 重置会话（用于测试）
   * @param {string} accountId - AI账户ID
   */
  resetSession(accountId) {
    this.sessions.delete(accountId);
    this.activeConnections.delete(accountId);
  }

  /**
   * 关闭服务
   */
  close() {
    this.stopCleanupTask();
    this.sessions.clear();
    this.activeConnections.clear();
    console.log('[AIDialogueService] 服务已关闭');
  }
}

// 创建单例实例
export const aiDialogueService = new AIDialogueService();

export default AIDialogueService;
