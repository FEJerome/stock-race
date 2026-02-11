import ServiceClient, { ServiceUnavailableError } from './ServiceClient.js';

/**
 * 市场数据服务客户端
 * 封装 market-data-service 的HTTP调用
 */
export class MarketDataClient extends ServiceClient {
  constructor(config = {}) {
    const baseURL = process.env.DATA_SERVICE_URL || 'http://localhost:8001';
    const apiKey = process.env.DATA_SERVICE_API_KEY || 'stock-race-data-key';

    super('market-data-service', baseURL, {
      timeout: parseInt(process.env.DATA_SERVICE_TIMEOUT) || 10000,
      retries: parseInt(process.env.DATA_SERVICE_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.DATA_SERVICE_RETRY_DELAY) || 1000,
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
   * 获取股票实时报价
   * @param {string} symbol - 股票代码
   * @returns {Promise<Object>} 实时报价数据
   */
  async getQuote(symbol) {
    try {
      const response = await this.get(this.buildPath(`/stocks/${symbol}/quote`));
      return {
        success: true,
        symbol: response.data.symbol || symbol,
        price: response.data.price || response.data.current_price || 0,
        change: response.data.change || response.data.change_amount || 0,
        changePercent: response.data.change_percent || response.data.change_percentage || 0,
        volume: response.data.volume || response.data.trading_volume || 0,
        amount: response.data.amount || response.data.trading_amount || 0,
        open: response.data.open || response.data.open_price || 0,
        high: response.data.high || response.data.high_price || 0,
        low: response.data.low || response.data.low_price || 0,
        prevClose: response.data.prev_close || response.data.previous_close || 0,
        timestamp: response.data.timestamp || new Date().toISOString(),
        marketStatus: response.data.market_status || 'unknown',
        dataSource: response.data.data_source || 'unknown'
      };
    } catch (error) {
      console.error(`获取股票实时报价失败 (${symbol}):`, error.message);
      throw new ServiceUnavailableError('market-data-service', `获取${symbol}报价失败`, error);
    }
  }

  /**
   * 批量获取股票实时报价
   * @param {Array<string>} symbols - 股票代码数组
   * @returns {Promise<Array<Object>>} 实时报价数据数组
   */
  async getBatchQuotes(symbols) {
    try {
      const response = await this.get(this.buildPath('/stocks/batch/quotes'), {
        params: { symbols: symbols.join(',') }
      });

      return symbols.map(symbol => {
        const quote = response.data[symbol] || {};
        return {
          success: !!quote.price,
          symbol,
          price: quote.price || quote.current_price || 0,
          change: quote.change || quote.change_amount || 0,
          changePercent: quote.change_percent || quote.change_percentage || 0,
          volume: quote.volume || quote.trading_volume || 0,
          timestamp: quote.timestamp || new Date().toISOString(),
          dataSource: quote.data_source || 'unknown'
        };
      });
    } catch (error) {
      console.error('批量获取股票实时报价失败:', error.message);
      throw new ServiceUnavailableError('market-data-service', '批量获取报价失败', error);
    }
  }

  /**
   * 获取K线历史数据
   * @param {string} symbol - 股票代码
   * @param {Object} options - 查询选项
   * @param {string} options.interval - 时间间隔 (1m, 5m, 15m, 30m, 1h, 1d, 1w, 1M)
   * @param {number} options.limit - 数据条数限制
   * @param {string} options.startDate - 开始日期
   * @param {string} options.endDate - 结束日期
   * @returns {Promise<Array<Object>>} K线数据
   */
  async getHistory(symbol, options = {}) {
    const { interval = '1d', limit = 100, startDate, endDate } = options;

    try {
      const params = { interval, limit };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await this.get(this.buildPath(`/stocks/${symbol}/history`), { params });

      return response.data.map(k => ({
        time: k.time || k.timestamp || k.date,
        open: k.open || k.open_price || 0,
        high: k.high || k.high_price || 0,
        low: k.low || k.low_price || 0,
        close: k.close || k.close_price || k.current_price || 0,
        volume: k.volume || k.trading_volume || 0,
        amount: k.amount || k.trading_amount || 0
      }));
    } catch (error) {
      console.error(`获取K线数据失败 (${symbol}):`, error.message);
      throw new ServiceUnavailableError('market-data-service', `获取${symbol}历史数据失败`, error);
    }
  }

  /**
   * 获取技术指标
   * @param {string} symbol - 股票代码
   * @param {Object} options - 查询选项
   * @param {Array<string>} options.indicators - 指标列表
   * @param {number} options.period - 计算周期
   * @returns {Promise<Object>} 技术指标数据
   */
  async getTechnicalIndicators(symbol, options = {}) {
    const { indicators = ['ma', 'rsi', 'macd'], period = 20 } = options;

    try {
      const response = await this.get(this.buildPath(`/technical/${symbol}/indicators`), {
        params: {
          indicators: indicators.join(','),
          period
        }
      });

      return {
        success: true,
        symbol,
        indicators: response.data.indicators || response.data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`获取技术指标失败 (${symbol}):`, error.message);
      throw new ServiceUnavailableError('market-data-service', `获取${symbol}技术指标失败`, error);
    }
  }

  /**
   * 搜索股票
   * @param {string} query - 搜索关键词
   * @param {Object} options - 搜索选项
   * @param {number} options.limit - 结果数量限制
   * @returns {Promise<Array<Object>>} 搜索结果
   */
  async searchStocks(query, options = {}) {
    const { limit = 20 } = options;

    try {
      const response = await this.get(this.buildPath('/search'), {
        params: { query, limit }
      });

      return response.data.map(stock => ({
        symbol: stock.symbol || stock.stock_code,
        name: stock.name || stock.company_name,
        market: stock.market || stock.exchange,
        industry: stock.industry || stock.sector,
        matchScore: stock.match_score || stock.relevance_score || 0.8
      }));
    } catch (error) {
      console.error('搜索股票失败:', error.message);
      throw new ServiceUnavailableError('market-data-service', '搜索服务不可用', error);
    }
  }

  /**
   * 获取市场状态
   * @param {string} market - 市场代码
   * @returns {Promise<Object>} 市场状态
   */
  async getMarketStatus(market) {
    try {
      const params = market ? { market } : {};
      const response = await this.get(this.buildPath('/market/status'), { params });

      return {
        success: true,
        market: market || 'all',
        status: response.data.status || 'unknown',
        session: response.data.session || 'unknown',
        timestamp: response.data.timestamp || new Date().toISOString()
      };
    } catch (error) {
      console.error('获取市场状态失败:', error.message);
      throw new ServiceUnavailableError('market-data-service', '获取市场状态失败', error);
    }
  }

  /**
   * 测试数据服务连接
   * @returns {Promise<Object>} 连接测试结果
   */
  async testConnection() {
    const result = await this.healthCheck('/health');
    return {
      ...result,
      service: 'market-data-service',
      version: result.data?.version || 'unknown',
      dataSource: result.data?.data_source || 'unknown'
    };
  }
}

// 创建单例实例
export const marketDataClient = new MarketDataClient();

export default MarketDataClient;
