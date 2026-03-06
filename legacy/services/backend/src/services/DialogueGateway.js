/**
 * [T-011] DialogueGateway
 * AI对话网关
 *
 * 职责:
 * - WebSocket连接管理
 * - 消息转发至trading-ai-service
 * - 流式响应处理
 * - 对话状态维护
 */

class DialogueGateway {
  constructor(options = {}) {
    this.aiServiceClient = options.aiServiceClient;
    this.sessions = new Map(); // accountId -> session
    this.maxRounds = 10;
    this.cooldownMs = 1000;
    this.sessionTimeoutMs = 60 * 60 * 1000; // 1小时
  }

  /**
   * 处理WebSocket连接
   * @param {WebSocket} ws - WebSocket连接
   * @param {string} accountId - AI账户ID
   * @param {Object} userPreferences - 用户偏好
   */
  async handleConnection(ws, accountId, userPreferences = {}) {
    // 检查是否已有活跃连接
    if (this.sessions.has(accountId)) {
      const error = {
        type: 'error',
        error: '该账户已有活跃对话连接',
        code: 'CONNECTION_EXISTS'
      };
      ws.send(JSON.stringify(error));
      ws.close(1008, 'Connection already exists');
      return;
    }

    try {
      // 创建对话会话
      const sessionResponse = await this.aiServiceClient.createDialogueSession({
        accountId,
        userPreferences,
        history: []
      });

      // 创建会话记录
      const session = {
        accountId,
        sessionId: sessionResponse.sessionId,
        ws,
        roundCount: 0,
        maxRounds: this.maxRounds,
        preferences: {},
        lastActivity: Date.now(),
        cooldownMs: this.cooldownMs
      };

      this.sessions.set(accountId, session);

      // 发送连接成功消息
      ws.send(JSON.stringify({
        type: 'connected',
        sessionId: sessionResponse.sessionId,
        roundCount: 0,
        remainingRounds: this.maxRounds,
        maxRounds: this.maxRounds
      }));

      // 设置消息处理器
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data);
          await this.handleMessage(accountId, message.content);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: '消息格式错误',
            details: error.message
          }));
        }
      });

      // 设置断开处理器
      ws.on('close', () => {
        this.handleDisconnection(accountId);
      });

      // 启动会话超时检查
      this._startSessionTimeoutCheck(accountId);

    } catch (error) {
      console.error('Failed to establish dialogue session:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: '无法建立AI对话会话',
        fallback: true
      }));
      ws.close(1011, 'Service unavailable');
    }
  }

  /**
   * 处理用户消息
   * @param {string} accountId - AI账户ID
   * @param {string} content - 消息内容
   */
  async handleMessage(accountId, content) {
    const session = this.sessions.get(accountId);

    if (!session) {
      console.error(`Session not found for account: ${accountId}`);
      return;
    }

    // 检查对话轮数限制
    if (session.roundCount >= session.maxRounds) {
      session.ws.send(JSON.stringify({
        type: 'error',
        error: '已达到最大对话轮数',
        code: 'MAX_ROUNDS_REACHED',
        roundCount: session.roundCount,
        maxRounds: session.maxRounds
      }));
      return;
    }

    // 检查冷却时间
    const timeSinceLastActivity = Date.now() - session.lastActivity;
    if (timeSinceLastActivity < session.cooldownMs) {
      const remainingCooldown = Math.ceil((session.cooldownMs - timeSinceLastActivity) / 1000);
      session.ws.send(JSON.stringify({
        type: 'error',
        error: `冷却中，请${remainingCooldown}秒后再试`,
        code: 'COOLDOWN',
        remainingSeconds: remainingCooldown
      }));
      return;
    }

    try {
      // 更新最后活动时间
      session.lastActivity = Date.now();

      // 调用AI服务
      const stream = await this.aiServiceClient.createDialogueSession({
        accountId,
        sessionId: session.sessionId,
        message: content,
        history: this._getSessionHistory(session)
      });

      // 处理流式响应
      await this.processStreamResponse(accountId, stream);

      // 增加对话轮数
      session.roundCount++;

    } catch (error) {
      console.error('Failed to process message:', error);

      // 降级处理
      session.ws.send(JSON.stringify({
        type: 'error',
        error: 'AI服务暂时不可用，请稍后重试',
        fallback: true,
        code: 'SERVICE_UNAVAILABLE'
      }));
    }
  }

  /**
   * 处理流式响应
   * @param {string} accountId - AI账户ID
   * @param {AsyncIterable} stream - 流式响应
   */
  async processStreamResponse(accountId, stream) {
    const session = this.sessions.get(accountId);
    if (!session) return;

    try {
      for await (const chunk of stream) {
        // 处理偏好更新
        if (chunk.type === 'preference_update' && chunk.extractedPreference) {
          session.preferences = {
            ...session.preferences,
            ...chunk.extractedPreference
          };
        }

        // 转发给用户
        const message = {
          type: chunk.type,
          content: chunk.content,
          roundCount: chunk.roundCount || session.roundCount,
          remainingRounds: chunk.remainingRounds || (session.maxRounds - session.roundCount),
          timestamp: Date.now()
        };

        session.ws.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('Error processing stream:', error);
      session.ws.send(JSON.stringify({
        type: 'error',
        error: '处理响应时出错',
        code: 'STREAM_ERROR'
      }));
    }
  }

  /**
   * 处理断开连接
   * @param {string} accountId - AI账户ID
   */
  async handleDisconnection(accountId) {
    const session = this.sessions.get(accountId);

    if (session) {
      // 清理会话
      this.sessions.delete(accountId);
      console.log(`Dialogue session closed for account: ${accountId}`);
    }
  }

  /**
   * 发送消息给用户
   * @param {string} accountId - AI账户ID
   * @param {Object} message - 消息对象
   */
  async sendToUser(accountId, message) {
    const session = this.sessions.get(accountId);

    if (session && session.ws.readyState === 1) { // WebSocket.OPEN
      session.ws.send(JSON.stringify(message));
    }
  }

  /**
   * 清理无活动会话
   * @param {number} timeoutMs - 超时时间（毫秒）
   */
  async cleanupInactiveSessions(timeoutMs = this.sessionTimeoutMs) {
    const now = Date.now();
    const toRemove = [];

    for (const [accountId, session] of this.sessions) {
      if (now - session.lastActivity > timeoutMs) {
        toRemove.push(accountId);
      }
    }

    for (const accountId of toRemove) {
      const session = this.sessions.get(accountId);
      if (session) {
        session.ws.send(JSON.stringify({
          type: 'error',
          error: '会话已超时',
          code: 'SESSION_TIMEOUT'
        }));
        session.ws.close(1001, 'Session timeout');
        this.sessions.delete(accountId);
      }
    }

    return toRemove.length;
  }

  /**
   * 获取会话历史
   * @private
   */
  _getSessionHistory(session) {
    // 这里可以从数据库或缓存中获取历史对话记录
    // 简化实现，返回空数组
    return [];
  }

  /**
   * 启动会话超时检查
   * @private
   */
  _startSessionTimeoutCheck(accountId) {
    const checkInterval = setInterval(() => {
      const session = this.sessions.get(accountId);

      if (!session) {
        clearInterval(checkInterval);
        return;
      }

      const inactiveTime = Date.now() - session.lastActivity;

      if (inactiveTime > this.sessionTimeoutMs) {
        session.ws.send(JSON.stringify({
          type: 'error',
          error: '会话因长时间无活动已关闭',
          code: 'INACTIVITY_TIMEOUT'
        }));
        session.ws.close(1001, 'Inactivity timeout');
        this.sessions.delete(accountId);
        clearInterval(checkInterval);
      }
    }, 60000); // 每分钟检查一次
  }
}

module.exports = DialogueGateway;
