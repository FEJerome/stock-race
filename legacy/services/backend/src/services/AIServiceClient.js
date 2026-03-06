import ServiceClient, { ServiceUnavailableError } from './ServiceClient.js';

/**
 * AI服务客户端
 * 封装 trading-ai-service 的HTTP调用
 */
export class AIServiceClient extends ServiceClient {
  constructor(config = {}) {
    const baseURL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    const apiKey = process.env.AI_SERVICE_API_KEY || 'stock-race-ai-key';

    super('ai-service', baseURL, {
      timeout: parseInt(process.env.AI_SERVICE_TIMEOUT) || 30000,
      retries: parseInt(process.env.AI_SERVICE_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.AI_SERVICE_RETRY_DELAY) || 1000,
      enableCircuitBreaker: true,
      circuitBreaker: {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000
      },
      headers: {
        'X-API-Key': apiKey
      },
      ...config
    });

    this.apiKey = apiKey;
  }

  /**
   * 请求AI决策
   * @param {Object} requestData - 请求数据
   * @param {string} requestData.accountId - 账户ID
   * @param {string} requestData.stockCode - 股票代码
   * @param {Object} requestData.marketData - 市场数据
   * @param {Object} requestData.portfolioData - 持仓数据
   * @param {string} requestData.strategy - 策略类型
   * @returns {Promise<Object>} AI决策结果
   */
  async generateDecision(requestData) {
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

      const response = await this.post('/api/v1/decision/generate', payload);

      return {
        success: true,
        decision: response.data.decision,
        reasoning: response.data.reasoning,
        confidence: response.data.confidence,
        riskLevel: response.data.risk_level,
        suggestedQuantity: response.data.suggested_quantity,
        suggestedPrice: response.data.suggested_price,
        metadata: response.data.metadata || {}
      };
    } catch (error) {
      console.error('AI决策请求失败:', error.message);
      throw new ServiceUnavailableError('ai-service', 'AI决策服务不可用', error);
    }
  }

  /**
   * 批量请求AI决策
   * @param {Array<Object>} requests - 请求数组
   * @returns {Promise<Array<Object>>} 决策结果数组
   */
  async batchGenerateDecisions(requests) {
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

      const response = await this.post('/api/v1/decision/batch-generate', payload);

      return response.data.decisions.map((decision, index) => ({
        success: true,
        requestId: requests[index].requestId || `req-${index}`,
        decision: decision.decision,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        riskLevel: decision.risk_level,
        suggestedQuantity: decision.suggested_quantity,
        suggestedPrice: decision.suggested_price,
        metadata: decision.metadata || {}
      }));
    } catch (error) {
      console.error('批量AI决策请求失败:', error.message);
      throw new ServiceUnavailableError('ai-service', '批量AI决策服务不可用', error);
    }
  }

  /**
   * 获取AI提供商列表
   * @returns {Promise<Object>} AI提供商信息
   */
  async getProviders() {
    try {
      const response = await this.get('/api/v1/decision/providers');
      return {
        success: true,
        providers: response.data.providers || [],
        defaultProvider: response.data.default_provider,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('获取AI提供商列表失败:', error.message);
      throw new ServiceUnavailableError('ai-service', '获取AI提供商列表失败', error);
    }
  }

  /**
   * 提炼提示词
   * @param {Object} dialogueData - 对话数据
   * @returns {Promise<Object>} 提炼后的提示词
   */
  async craftPrompt(dialogueData) {
    try {
      const response = await this.post('/api/v1/prompt/craft', dialogueData);
      return {
        success: true,
        prompt: response.data.prompt,
        role: response.data.role,
        philosophy: response.data.philosophy,
        constraints: response.data.constraints,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('提示词提炼失败:', error.message);
      throw new ServiceUnavailableError('ai-service', '提示词提炼服务不可用', error);
    }
  }

  /**
   * 测试AI服务连接
   * @returns {Promise<Object>} 连接测试结果
   */
  async testConnection() {
    const result = await this.healthCheck('/api/v1/health/');
    return {
      ...result,
      service: 'ai-service',
      version: result.data?.version || 'unknown'
    };
  }
}

// 创建单例实例
export const aiServiceClient = new AIServiceClient();

export default AIServiceClient;
