import axios from 'axios';

export class AIService {
  constructor() {
    // AI服务配置
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    this.aiServiceApiKey = process.env.AI_SERVICE_API_KEY || 'stock-race-ai-key';
    this.timeout = parseInt(process.env.AI_SERVICE_TIMEOUT) || 30000;
    this.maxRetries = parseInt(process.env.AI_SERVICE_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.AI_SERVICE_RETRY_DELAY) || 1000;

    // 创建axios实例
    this.client = axios.create({
      baseURL: this.aiServiceUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.aiServiceApiKey
      }
    });
  }

  /**
   * 请求AI决策
   * @param {Object} requestData - 请求数据
   * @returns {Promise<Object>} AI决策结果
   */
  async requestDecision(requestData) {
    const { accountId, stockCode, marketData, portfolioData, strategy } = requestData;

    try {
      const payload = {
        account_id: accountId,
        stock_code: stockCode,
        market_data: marketData,
        portfolio_data: portfolioData,
        strategy: strategy || 'default',
        timestamp: new Date().toISOString()
      };

      const response = await this.client.post('/api/ai/decision', payload);

      return {
        success: true,
        decision: response.data.decision,
        reasoning: response.data.reasoning,
        confidence: response.data.confidence,
        risk_level: response.data.risk_level,
        suggested_quantity: response.data.suggested_quantity,
        suggested_price: response.data.suggested_price,
        metadata: response.data.metadata || {}
      };
    } catch (error) {
      console.error('AI决策请求失败:', error.message);

      // 返回模拟决策作为降级方案
      return this.getMockDecision(requestData);
    }
  }

  /**
   * 批量请求AI决策
   * @param {Array<Object>} requests - 请求数组
   * @returns {Promise<Array<Object>>} 决策结果数组
   */
  async batchRequestDecisions(requests) {
    try {
      const payload = {
        requests: requests.map(req => ({
          account_id: req.accountId,
          stock_code: req.stockCode,
          market_data: req.marketData,
          portfolio_data: req.portfolioData,
          strategy: req.strategy || 'default'
        }))
      };

      const response = await this.client.post('/api/ai/decisions/batch', payload);

      return response.data.decisions.map((decision, index) => ({
        success: true,
        request_id: requests[index].requestId || `req-${index}`,
        decision: decision.decision,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        risk_level: decision.risk_level,
        suggested_quantity: decision.suggested_quantity,
        suggested_price: decision.suggested_price,
        metadata: decision.metadata || {}
      }));
    } catch (error) {
      console.error('批量AI决策请求失败:', error.message);

      // 返回模拟决策作为降级方案
      return requests.map((request, index) => ({
        success: false,
        request_id: request.requestId || `req-${index}`,
        ...this.getMockDecision(request),
        is_fallback: true
      }));
    }
  }

  /**
   * 获取AI账户分析
   * @param {string} accountId - 账户ID
   * @returns {Promise<Object>} 账户分析结果
   */
  async getAccountAnalysis(accountId) {
    try {
      const response = await this.client.get(`/api/ai/accounts/${accountId}/analysis`);

      return {
        success: true,
        account_id: accountId,
        performance_score: response.data.performance_score,
        risk_profile: response.data.risk_profile,
        strategy_effectiveness: response.data.strategy_effectiveness,
        recommendations: response.data.recommendations || [],
        analysis_date: response.data.analysis_date,
        metadata: response.data.metadata || {}
      };
    } catch (error) {
      console.error('获取AI账户分析失败:', error.message);

      // 返回模拟分析作为降级方案
      return this.getMockAccountAnalysis(accountId);
    }
  }

  /**
   * 获取AI模型状态
   * @returns {Promise<Object>} 模型状态信息
   */
  async getModelStatus() {
    try {
      const response = await this.client.get('/api/ai/models/status');

      return {
        success: true,
        models: response.data.models,
        active_model: response.data.active_model,
        model_version: response.data.model_version,
        last_trained: response.data.last_trained,
        performance_metrics: response.data.performance_metrics || {},
        health_status: response.data.health_status || 'healthy'
      };
    } catch (error) {
      console.error('获取AI模型状态失败:', error.message);

      return {
        success: false,
        models: [],
        active_model: 'mock-model',
        model_version: '1.0.0',
        last_trained: new Date().toISOString(),
        performance_metrics: {},
        health_status: 'degraded',
        error: error.message
      };
    }
  }

  /**
   * 训练AI模型
   * @param {Object} trainingConfig - 训练配置
   * @returns {Promise<Object>} 训练结果
   */
  async trainModel(trainingConfig) {
    try {
      const response = await this.client.post('/api/ai/models/train', trainingConfig);

      return {
        success: true,
        training_id: response.data.training_id,
        status: response.data.status,
        start_time: response.data.start_time,
        estimated_completion: response.data.estimated_completion,
        metrics: response.data.metrics || {}
      };
    } catch (error) {
      console.error('AI模型训练请求失败:', error.message);

      return {
        success: false,
        training_id: `train-${Date.now()}`,
        status: 'failed',
        start_time: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * 获取训练状态
   * @param {string} trainingId - 训练ID
   * @returns {Promise<Object>} 训练状态
   */
  async getTrainingStatus(trainingId) {
    try {
      const response = await this.client.get(`/api/ai/models/train/${trainingId}/status`);

      return {
        success: true,
        training_id: trainingId,
        status: response.data.status,
        progress: response.data.progress,
        start_time: response.data.start_time,
        end_time: response.data.end_time,
        metrics: response.data.metrics || {},
        logs: response.data.logs || []
      };
    } catch (error) {
      console.error('获取训练状态失败:', error.message);

      return {
        success: false,
        training_id: trainingId,
        status: 'unknown',
        error: error.message
      };
    }
  }

  /**
   * 获取模拟决策（降级方案）
   * @param {Object} requestData - 请求数据
   * @returns {Object} 模拟决策结果
   */
  getMockDecision(requestData) {
    const { stockCode, marketData } = requestData;

    // 简单的模拟决策逻辑
    const random = Math.random();
    let decision = 'hold';
    let confidence = 0.5;

    if (random > 0.7) {
      decision = 'buy';
      confidence = 0.6 + Math.random() * 0.3;
    } else if (random < 0.3) {
      decision = 'sell';
      confidence = 0.6 + Math.random() * 0.3;
    }

    return {
      success: false,
      decision,
      reasoning: `模拟决策: ${decision.toUpperCase()} ${stockCode}`,
      confidence: parseFloat(confidence.toFixed(2)),
      risk_level: decision === 'hold' ? 'low' : 'medium',
      suggested_quantity: decision !== 'hold' ? Math.floor(Math.random() * 1000) + 100 : 0,
      suggested_price: marketData?.price ? marketData.price * (1 + (Math.random() * 0.1 - 0.05)) : 0,
      is_fallback: true,
      fallback_reason: 'AI服务不可用'
    };
  }

  /**
   * 获取模拟账户分析（降级方案）
   * @param {string} accountId - 账户ID
   * @returns {Object} 模拟账户分析结果
   */
  getMockAccountAnalysis(accountId) {
    return {
      success: false,
      account_id: accountId,
      performance_score: 65 + Math.random() * 30,
      risk_profile: ['conservative', 'moderate', 'aggressive'][Math.floor(Math.random() * 3)],
      strategy_effectiveness: {
        buy_and_hold: 0.6 + Math.random() * 0.3,
        momentum: 0.5 + Math.random() * 0.4,
        mean_reversion: 0.4 + Math.random() * 0.5
      },
      recommendations: [
        {
          type: 'diversify',
          message: '建议增加投资组合多样性',
          priority: 'medium'
        },
        {
          type: 'risk_management',
          message: '建议加强风险管理',
          priority: 'low'
        }
      ],
      analysis_date: new Date().toISOString(),
      is_fallback: true,
      fallback_reason: 'AI服务不可用'
    };
  }

  /**
   * 测试AI服务连接
   * @returns {Promise<Object>} 连接测试结果
   */
  async testConnection() {
    try {
      const startTime = Date.now();
      const response = await this.client.get('/api/ai/health', { timeout: 5000 });
      const endTime = Date.now();

      return {
        success: true,
        status: 'connected',
        response_time: endTime - startTime,
        service_version: response.data.version,
        model_status: response.data.model_status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('AI服务连接测试失败:', error.message);

      return {
        success: false,
        status: 'disconnected',
        error: error.message,
        response_time: null,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 重试请求
   * @param {Function} requestFn - 请求函数
   * @param {number} maxRetries - 最大重试次数
   * @param {number} retryDelay - 重试延迟（毫秒）
   * @returns {Promise<any>} 请求结果
   */
  async retryRequest(requestFn, maxRetries = this.maxRetries, retryDelay = this.retryDelay) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        console.warn(`AI服务请求失败，第${attempt}次重试:`, error.message);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    throw lastError;
  }
}

// 创建单例实例
export const aiService = new AIService();