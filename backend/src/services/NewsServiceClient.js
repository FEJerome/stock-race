import ServiceClient, { ServiceUnavailableError } from './ServiceClient.js';

/**
 * 新闻服务客户端
 * 封装 news-service 的HTTP调用
 */
export class NewsServiceClient extends ServiceClient {
  constructor(config = {}) {
    const baseURL = process.env.NEWS_SERVICE_URL || 'http://localhost:8002';
    const apiKey = process.env.NEWS_SERVICE_API_KEY || 'stock-race-news-key';

    super('news-service', baseURL, {
      timeout: parseInt(process.env.NEWS_SERVICE_TIMEOUT) || 5000,
      retries: parseInt(process.env.NEWS_SERVICE_MAX_RETRIES) || 2,
      retryDelay: parseInt(process.env.NEWS_SERVICE_RETRY_DELAY) || 1000,
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
    this.apiPrefix = '/api/v1';
  }

  /**
   * 构建API路径
   * @param {string} endpoint - 端点路径
   * @returns {string} 完整API路径
   */
  buildPath(endpoint) {
    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint;
    }
    return `${this.apiPrefix}${endpoint}`;
  }

  /**
   * 获取股票相关新闻
   * @param {string} symbol - 股票代码
   * @param {Object} options - 查询选项
   * @param {number} options.limit - 新闻数量限制
   * @param {string} options.startDate - 开始日期
   * @param {string} options.endDate - 结束日期
   * @returns {Promise<Array<Object>>} 新闻列表
   */
  async getStockNews(symbol, options = {}) {
    const { limit = 10, startDate, endDate } = options;

    try {
      const params = { limit };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await this.get(this.buildPath(`/news/stock/${symbol}`), { params });

      return response.data.map(news => ({
        id: news.id,
        title: news.title,
        summary: news.summary,
        content: news.content,
        source: news.source,
        url: news.url,
        publishedAt: news.published_at || news.publishedAt,
        sentiment: news.sentiment || 'neutral',
        relevance: news.relevance || 0.5,
        symbols: news.symbols || [symbol]
      }));
    } catch (error) {
      console.error(`获取股票新闻失败 (${symbol}):`, error.message);
      throw new ServiceUnavailableError('news-service', `获取${symbol}新闻失败`, error);
    }
  }

  /**
   * 获取市场新闻
   * @param {Object} options - 查询选项
   * @param {number} options.limit - 新闻数量限制
   * @param {string} options.category - 新闻分类
   * @returns {Promise<Array<Object>>} 新闻列表
   */
  async getMarketNews(options = {}) {
    const { limit = 20, category = 'all' } = options;

    try {
      const response = await this.get(this.buildPath('/news/market'), {
        params: { limit, category }
      });

      return response.data.map(news => ({
        id: news.id,
        title: news.title,
        summary: news.summary,
        source: news.source,
        url: news.url,
        publishedAt: news.published_at || news.publishedAt,
        sentiment: news.sentiment || 'neutral',
        category: news.category || 'general',
        impact: news.impact || 'medium'
      }));
    } catch (error) {
      console.error('获取市场新闻失败:', error.message);
      throw new ServiceUnavailableError('news-service', '获取市场新闻失败', error);
    }
  }

  /**
   * 获取新闻情报（综合分析）
   * @param {string} symbol - 股票代码
   * @returns {Promise<Object>} 情报分析结果
   */
  async getIntelligence(symbol) {
    try {
      const response = await this.get(this.buildPath(`/intelligence/${symbol}`));

      return {
        success: true,
        symbol,
        sentiment: response.data.sentiment || 'neutral',
        sentimentScore: response.data.sentiment_score || 0,
        keyEvents: response.data.key_events || [],
        riskFactors: response.data.risk_factors || [],
        opportunities: response.data.opportunities || [],
        summary: response.data.summary || '',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`获取新闻情报失败 (${symbol}):`, error.message);
      throw new ServiceUnavailableError('news-service', `获取${symbol}情报失败`, error);
    }
  }

  /**
   * 获取热门话题
   * @param {Object} options - 查询选项
   * @param {number} options.limit - 话题数量限制
   * @returns {Promise<Array<Object>>} 热门话题列表
   */
  async getHotTopics(options = {}) {
    const { limit = 10 } = options;

    try {
      const response = await this.get(this.buildPath('/news/hot-topics'), {
        params: { limit }
      });

      return response.data.map(topic => ({
        id: topic.id,
        title: topic.title,
        heat: topic.heat || topic.score || 0,
        relatedStocks: topic.related_stocks || topic.symbols || [],
        mentions: topic.mentions || 0
      }));
    } catch (error) {
      console.error('获取热门话题失败:', error.message);
      throw new ServiceUnavailableError('news-service', '获取热门话题失败', error);
    }
  }

  /**
   * 搜索新闻
   * @param {string} query - 搜索关键词
   * @param {Object} options - 搜索选项
   * @param {number} options.limit - 结果数量限制
   * @returns {Promise<Array<Object>>} 搜索结果
   */
  async searchNews(query, options = {}) {
    const { limit = 20 } = options;

    try {
      const response = await this.get(this.buildPath('/news/search'), {
        params: { query, limit }
      });

      return response.data.map(news => ({
        id: news.id,
        title: news.title,
        summary: news.summary,
        source: news.source,
        url: news.url,
        publishedAt: news.published_at || news.publishedAt,
        relevance: news.relevance || 0.5
      }));
    } catch (error) {
      console.error('搜索新闻失败:', error.message);
      throw new ServiceUnavailableError('news-service', '搜索新闻服务不可用', error);
    }
  }

  /**
   * 测试新闻服务连接
   * @returns {Promise<Object>} 连接测试结果
   */
  async testConnection() {
    const result = await this.healthCheck('/health');
    return {
      ...result,
      service: 'news-service',
      version: result.data?.version || 'unknown'
    };
  }
}

// 创建单例实例
export const newsServiceClient = new NewsServiceClient();

export default NewsServiceClient;
