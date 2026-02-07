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

      const response = await this.client.post('/api/v1/decision/service-generate', payload);

      // AI服务返回DecisionResponse结构：{success, decision, error, warnings, metadata}
      // decision字段是DecisionResult对象：{action, symbol, quantity, price_target, reasoning, confidence_score, risk_level, ...}
      if (response.data.success && response.data.decision) {
        const decisionResult = response.data.decision;
        return {
          success: true,
          decision: decisionResult.action,
          reasoning: decisionResult.reasoning,
          confidence: decisionResult.confidence_score,
          risk_level: decisionResult.risk_level,
          suggested_quantity: decisionResult.quantity,
          suggested_price: decisionResult.price_target,
          metadata: {
            ...(response.data.metadata || {}),
            decision_id: decisionResult.decision_id,
            ai_provider: decisionResult.ai_provider,
            model_name: decisionResult.model_name,
            technical_analysis: decisionResult.technical_analysis,
            fundamental_analysis: decisionResult.fundamental_analysis,
            risk_assessment: decisionResult.risk_assessment,
            raw_response: decisionResult.raw_response
          }
        };
      } else {
        // AI服务返回失败
        throw new Error(response.data.error || 'AI服务返回失败');
      }
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
      // AI服务期望DecisionRequest数组，而不是包装对象
      const payload = requests.map(req => ({
        account_id: req.accountId,
        stock_code: req.stockCode,
        market_data: req.marketData,
        portfolio_data: req.portfolioData,
        strategy: req.strategy || 'default'
      }));

      const response = await this.client.post('/api/v1/decision/service-batch-generate', payload);

      // AI服务返回DecisionResponse数组：每个元素{success, decision, error, warnings, metadata}
      return response.data.map((decisionResponse, index) => {
        if (decisionResponse.success && decisionResponse.decision) {
          const decisionResult = decisionResponse.decision;
          return {
            success: true,
            request_id: requests[index].requestId || `req-${index}`,
            decision: decisionResult.action,
            reasoning: decisionResult.reasoning,
            confidence: decisionResult.confidence_score,
            risk_level: decisionResult.risk_level,
            suggested_quantity: decisionResult.quantity,
            suggested_price: decisionResult.price_target,
            metadata: {
              ...(decisionResponse.metadata || {}),
              decision_id: decisionResult.decision_id,
              ai_provider: decisionResult.ai_provider,
              model_name: decisionResult.model_name,
              technical_analysis: decisionResult.technical_analysis,
              fundamental_analysis: decisionResult.fundamental_analysis,
              risk_assessment: decisionResult.risk_assessment,
              raw_response: decisionResult.raw_response
            }
          };
        } else {
          // 单个决策失败，返回模拟决策
          return {
            success: false,
            request_id: requests[index].requestId || `req-${index}`,
            ...this.getMockDecision(requests[index]),
            is_fallback: true,
            error: decisionResponse.error || 'AI服务返回失败'
          };
        }
      });
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
      // AI服务中没有账户分析端点，直接返回模拟分析
      console.log('AI服务中没有账户分析端点，返回模拟分析');
      return this.getMockAccountAnalysis(accountId);
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
      // AI服务中没有模型状态端点，尝试获取AI提供商列表作为替代
      const response = await this.client.get('/api/v1/decision/providers');

      return {
        success: true,
        models: response.data.providers || [],
        active_model: response.data.default_model || 'default',
        model_version: '1.0.0',
        last_trained: new Date().toISOString(),
        performance_metrics: {},
        health_status: 'healthy',
        providers_info: response.data
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
      // AI服务中没有模型训练端点，返回模拟响应
      console.log('AI服务中没有模型训练端点，返回模拟响应');

      return {
        success: true,
        training_id: `train-${Date.now()}`,
        status: 'completed',
        start_time: new Date().toISOString(),
        estimated_completion: new Date(Date.now() + 3600000).toISOString(), // 1小时后
        metrics: {
          accuracy: 0.85,
          loss: 0.15,
          training_time: '模拟训练'
        },
        is_mock: true
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
      // AI服务中没有训练状态端点，返回模拟状态
      console.log(`AI服务中没有训练状态端点，返回模拟状态 for training: ${trainingId}`);

      return {
        success: true,
        training_id: trainingId,
        status: 'completed',
        progress: 100,
        start_time: new Date(Date.now() - 7200000).toISOString(), // 2小时前
        end_time: new Date(Date.now() - 3600000).toISOString(), // 1小时前
        metrics: {
          accuracy: 0.85,
          loss: 0.15,
          training_time: '2小时'
        },
        logs: [
          '训练开始',
          '数据加载完成',
          '模型初始化完成',
          '训练进行中...',
          '训练完成'
        ],
        is_mock: true
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

    // 生成模拟分析数据
    const marketPrice = marketData?.price || 10.0;
    const technical_analysis = {
      trend: decision === 'buy' ? 'bullish' : decision === 'sell' ? 'bearish' : 'neutral',
      rsi: 30 + Math.random() * 40, // 30-70
      macd: {
        signal: marketPrice * 0.01 * (Math.random() - 0.5),
        histogram: marketPrice * 0.005 * (Math.random() - 0.5)
      },
      moving_averages: {
        ma5: marketPrice * (1 + (Math.random() * 0.05 - 0.025)),
        ma10: marketPrice * (1 + (Math.random() * 0.05 - 0.025)),
        ma20: marketPrice * (1 + (Math.random() * 0.05 - 0.025))
      },
      support_levels: [marketPrice * 0.95, marketPrice * 0.90],
      resistance_levels: [marketPrice * 1.05, marketPrice * 1.10],
      volume_trend: Math.random() > 0.5 ? 'increasing' : 'decreasing'
    };

    const fundamental_analysis = {
      pe_ratio: 10 + Math.random() * 20, // 10-30
      pb_ratio: 1 + Math.random() * 2, // 1-3
      dividend_yield: (1 + Math.random() * 4).toFixed(2), // 1-5%
      market_cap: (1000000 + Math.random() * 9000000).toFixed(0), // 百万
      debt_to_equity: (0.3 + Math.random() * 0.7).toFixed(2), // 0.3-1.0
      roe: (5 + Math.random() * 15).toFixed(2), // 5-20%
      revenue_growth: (-5 + Math.random() * 20).toFixed(2), // -5 to 15%
      profit_margin: (5 + Math.random() * 15).toFixed(2) // 5-20%
    };

    const risk_assessment = {
      market_risk: decision === 'hold' ? 'low' : 'medium',
      liquidity_risk: 'low',
      concentration_risk: 'low',
      volatility: (20 + Math.random() * 30).toFixed(2), // 20-50%
      var_95: marketPrice * (0.05 + Math.random() * 0.1), // 5-15%
      expected_shortfall: marketPrice * (0.08 + Math.random() * 0.12) // 8-20%
    };

    return {
      success: false,
      decision,
      reasoning: `模拟决策: ${decision.toUpperCase()} ${stockCode}。技术分析显示${technical_analysis.trend}趋势，RSI ${technical_analysis.rsi.toFixed(1)}。基本面：PE ${fundamental_analysis.pe_ratio}，股息率${fundamental_analysis.dividend_yield}%。风险评估：${risk_assessment.market_risk}风险。`,
      confidence: parseFloat(confidence.toFixed(2)),
      risk_level: decision === 'hold' ? 'low' : 'medium',
      suggested_quantity: decision !== 'hold' ? Math.floor(Math.random() * 1000) + 100 : 0,
      suggested_price: marketData?.price ? marketData.price * (1 + (Math.random() * 0.1 - 0.05)) : 0,
      is_fallback: true,
      fallback_reason: 'AI服务不可用',
      metadata: {
        technical_analysis,
        fundamental_analysis,
        risk_assessment,
        market_analysis: {
          overall_sentiment: decision === 'buy' ? 'positive' : decision === 'sell' ? 'negative' : 'neutral',
          sector_performance: Math.random() > 0.5 ? 'outperforming' : 'underperforming',
          market_trend: Math.random() > 0.5 ? 'uptrend' : 'downtrend'
        },
        model_name: 'mock-ai-model',
        ai_provider: 'mock',
        processing_time: 50 + Math.random() * 100,
        api_cost: 0
      }
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
      // 尝试使用根路径的健康检查端点
      const response = await this.client.get('/health', { timeout: 5000 });
      const endTime = Date.now();

      return {
        success: true,
        status: 'connected',
        response_time: endTime - startTime,
        service_version: response.data.version || '0.1.0',
        service: response.data.service || 'ai-service',
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