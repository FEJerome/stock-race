/**
 * [C4-001~C4-003] DialogueService
 * AI对话服务
 *
 * 职责:
 * - 对话会话管理（创建、维护、清理）
 * - 对话消息处理（SSE流式响应）
 * - 投资偏好提取与画像生成
 * - 对接DeepSeek API
 * - Token成本控制
 */

import { getRedisClient } from '../database/redis.js';
import { DialogueConfigService } from './DialogueConfigService.js';
import { DialogueAuditService } from './DialogueAuditService.js';

class DialogueService {
  constructor(options = {}) {
    this.redis = options.redis || null;
    this.db = options.db || null;
    this.deepseekApiKey = options.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    this.deepseekApiUrl = options.deepseekApiUrl || 'https://api.deepseek.com/v1/chat/completions';

    // 初始化配置服务和审计服务
    this.configService = options.configService || new DialogueConfigService({ db: this.db, redis: this.redis });
    this.auditService = options.auditService || new DialogueAuditService({ db: this.db, redis: this.redis });

    // Redis键前缀（硬编码，不涉及业务配置）
    this.keyPrefix = {
      session: 'dialogue:session:',
      history: 'dialogue:history:',
      preference: 'dialogue:preference:'
    };

    // 本地缓存配置
    this.cachedConfig = null;
    this.configCacheTime = null;
    this.configCacheTTL = 60000; // 1分钟本地缓存
  }

  /**
   * 初始化 Redis 连接
   */
  async initialize() {
    try {
      this.redis = getRedisClient();

      // 初始化配置服务和审计服务
      await this.configService.initialize();
      await this.auditService.initialize();

      // 注入db连接到服务（如果可用）
      if (this.db) {
        this.configService.db = this.db;
        this.auditService.db = this.db;
      }

      console.log('✅ DialogueService initialized with Redis');
    } catch (error) {
      console.warn('⚠️ DialogueService running without Redis:', error.message);
      this.redis = null;
    }
  }

  /**
   * 获取动态配置（带本地缓存）
   * @private
   */
  async _getConfig() {
    // 检查本地缓存
    if (this.cachedConfig && this.configCacheTime &&
        (Date.now() - this.configCacheTime) < this.configCacheTTL) {
      return this.cachedConfig;
    }

    // 从配置服务获取
    const config = {
      maxRounds: await this.configService.getConfig('max_rounds'),
      maxTokensPerMessage: await this.configService.getConfig('max_tokens_per_message'),
      totalTokenBudget: await this.configService.getConfig('total_token_budget'),
      sessionExpiryHours: await this.configService.getConfig('session_expiry_hours'),
      enableContentAudit: await this.configService.getConfig('enable_content_audit')
    };

    // 更新本地缓存
    this.cachedConfig = config;
    this.configCacheTime = Date.now();

    return config;
  }

  /**
   * 清除配置缓存（当配置更新时调用）
   */
  invalidateConfigCache() {
    this.cachedConfig = null;
    this.configCacheTime = null;
  }

  /**
   * [C4-001] 创建对话会话
   */
  async createSession(accountId, userPreferences = {}) {
    const config = await this._getConfig();
    const sessionExpiry = config.sessionExpiryHours * 60 * 60; // 转换为秒

    const sessionId = `dlg_${accountId}_${Date.now()}`;
    const session = {
      id: sessionId,
      accountId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + (sessionExpiry * 1000),
      roundCount: 0,
      totalTokens: 0,
      userPreferences,
      status: 'active',
      extractedPreference: null
    };

    // 保存到 Redis
    if (this.redis) {
      await this.redis.setEx(
        `${this.keyPrefix.session}${sessionId}`,
        sessionExpiry,
        JSON.stringify(session)
      );

      // 初始化对话历史
      await this.redis.setEx(
        `${this.keyPrefix.history}${sessionId}`,
        sessionExpiry,
        JSON.stringify([])
      );
    }

    return {
      sessionId,
      roundCount: 0,
      remainingRounds: config.maxRounds,
      expiresAt: session.expiresAt
    };
  }

  /**
   * [C4-001] 获取会话信息
   */
  async getSession(sessionId) {
    if (!this.redis) {
      throw new Error('Redis not available');
    }

    const data = await this.redis.get(`${this.keyPrefix.session}${sessionId}`);
    if (!data) {
      return null;
    }

    const session = JSON.parse(data);
    if (session.expiresAt < Date.now()) {
      return null;
    }

    return session;
  }

  /**
   * [C4-001] 获取对话历史
   */
  async getHistory(sessionId) {
    if (!this.redis) {
      return [];
    }

    const data = await this.redis.get(`${this.keyPrefix.history}${sessionId}`);
    return data ? JSON.parse(data) : [];
  }

  /**
   * [C4-002] 发送消息并获取AI回复（SSE流式）
   */
  async sendMessage(sessionId, message, onStream, clientInfo = {}) {
    const config = await this._getConfig();
    const sessionExpiry = config.sessionExpiryHours * 60 * 60;

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    if (session.roundCount >= config.maxRounds) {
      throw new Error('ROUND_LIMIT_REACHED');
    }

    if (session.totalTokens >= config.totalTokenBudget) {
      throw new Error('TOKEN_BUDGET_EXHAUSTED');
    }

    // 获取对话历史
    const history = await this.getHistory(sessionId);

    // 构建消息列表
    const messages = [
      {
        role: 'system',
        content: this._buildSystemPrompt(session.userPreferences, config)
      },
      ...history.map(h => ({
        role: h.role,
        content: h.content
      })),
      {
        role: 'user',
        content: message
      }
    ];

    // 调用 DeepSeek API
    const response = await this._callDeepSeekAPI(messages, true, config);

    // 处理流式响应
    let fullContent = '';
    let tokenCount = 0;

    for await (const chunk of response) {
      const content = chunk.choices?.[0]?.delta?.content || '';
      fullContent += content;
      tokenCount += this._estimateTokens(content);

      // 调用流式回调
      if (onStream) {
        onStream({
          type: 'message',
          content,
          roundCount: session.roundCount + 1,
          remainingRounds: config.maxRounds - session.roundCount - 1
        });
      }
    }

    // 更新对话历史
    history.push(
      { role: 'user', content: message, timestamp: Date.now() },
      { role: 'assistant', content: fullContent, timestamp: Date.now() }
    );

    // 更新会话
    session.roundCount++;
    session.totalTokens += tokenCount;
    session.updatedAt = Date.now();

    if (this.redis) {
      await this.redis.setEx(
        `${this.keyPrefix.history}${sessionId}`,
        sessionExpiry,
        JSON.stringify(history)
      );

      await this.redis.setEx(
        `${this.keyPrefix.session}${sessionId}`,
        sessionExpiry,
        JSON.stringify(session)
      );
    }

    // 记录审计日志（如果启用）
    if (config.enableContentAudit) {
      try {
        // 记录用户消息
        await this.auditService.recordMessage({
          sessionId,
          accountId: session.accountId,
          userId: clientInfo.userId || null,
          role: 'user',
          content: message,
          tokenCount: this._estimateTokens(message),
          roundNumber: session.roundCount,
          ipAddress: clientInfo.ipAddress || null,
          userAgent: clientInfo.userAgent || null
        });

        // 记录AI回复
        await this.auditService.recordMessage({
          sessionId,
          accountId: session.accountId,
          userId: clientInfo.userId || null,
          role: 'assistant',
          content: fullContent,
          tokenCount,
          roundNumber: session.roundCount,
          ipAddress: clientInfo.ipAddress || null,
          userAgent: clientInfo.userAgent || null
        });
      } catch (auditError) {
        console.error('审计日志记录失败:', auditError);
        // 审计失败不影响主流程
      }
    }

    return {
      content: fullContent,
      roundCount: session.roundCount,
      remainingRounds: config.maxRounds - session.roundCount,
      totalTokens: session.totalTokens
    };
  }

  /**
   * [C4-003] 提取投资偏好并激活账户
   */
  async finalizeAccount(sessionId) {
    const config = await this._getConfig();
    const sessionExpiry = config.sessionExpiryHours * 60 * 60;

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const history = await this.getHistory(sessionId);

    // 构建提取偏好的提示词
    const extractPrompt = `
基于以下对话历史，提取用户的投资偏好和画像信息。
请以JSON格式返回，包含以下字段：
- investmentStyle: 投资风格（conservative/moderate/aggressive）
- preferredSectors: 偏好的行业板块（数组）
- riskTolerance: 风险承受能力（low/medium/high）
- investmentHorizon: 投资期限（short/medium/long）
- additionalNotes: 其他重要信息

对话历史：
${history.map(h => `${h.role}: ${h.content}`).join('\n')}
`;

    // 调用 DeepSeek API 提取偏好
    const response = await this._callDeepSeekAPI([
      { role: 'user', content: extractPrompt }
    ], false, config);

    let extractedPreference;
    try {
      extractedPreference = JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('解析提取的偏好失败:', error);
      extractedPreference = {};
    }

    // 更新会话状态
    session.status = 'finalized';
    session.extractedPreference = extractedPreference;
    session.finalizedAt = Date.now();

    if (this.redis) {
      await this.redis.setEx(
        `${this.keyPrefix.session}${sessionId}`,
        sessionExpiry,
        JSON.stringify(session)
      );

      await this.redis.setEx(
        `${this.keyPrefix.preference}${session.accountId}`,
        sessionExpiry * 7, // 保存7天
        JSON.stringify(extractedPreference)
      );
    }

    // 更新数据库中的AI账户
    if (this.db) {
      await this.db.query(
        `UPDATE ai_accounts
         SET status = 'active',
             extracted_preference = $1,
             activated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(extractedPreference), session.accountId]
      );
    }

    return {
      success: true,
      accountId: session.accountId,
      extractedPreference,
      totalRounds: session.roundCount,
      totalTokens: session.totalTokens
    };
  }

  /**
   * 构建系统提示词
   * @private
   */
  _buildSystemPrompt(userPreferences, config) {
    const maxRounds = config?.maxRounds || 10;
    return `你是一位专业的AI投资顾问，正在帮助用户创建AI投资账户。

你的职责：
1. 通过对话了解用户的投资偏好和风险承受能力
2. 提供专业但易懂的投资建议
3. 在${maxRounds}轮对话内收集足够信息生成投资画像

用户已知偏好：${JSON.stringify(userPreferences)}

对话限制：
- 最多${maxRounds}轮对话
- 每轮回复控制在500字以内
- 保持专业、友好的语气`;
  }

  /**
   * 调用 DeepSeek API
   * @private
   */
  async _callDeepSeekAPI(messages, stream = false, config = null) {
    const maxTokens = config?.maxTokensPerMessage || 2000;

    const response = await fetch(this.deepseekApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        stream,
        max_tokens: maxTokens,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    if (stream) {
      return this._parseStream(response.body);
    }

    return response.json();
  }

  /**
   * 解析 SSE 流
   * @private
   */
  async *_parseStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              yield JSON.parse(data);
            } catch (error) {
              // 忽略解析错误
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 估算 Token 数量（简化版）
   * @private
   */
  _estimateTokens(text) {
    // 简化估算：中文字符算2个token，英文单词算1个token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars * 2 + englishWords;
  }
}

export { DialogueService };
export default DialogueService;
