import axios from 'axios';

export class DataService {
  constructor() {
    // 数据服务配置
    this.dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8001';
    this.dataServiceApiKey = process.env.DATA_SERVICE_API_KEY || 'stock-race-data-key';
    this.dataServiceApiPrefix = process.env.DATA_SERVICE_API_PREFIX || '/api/v1';
    this.timeout = parseInt(process.env.DATA_SERVICE_TIMEOUT) || 10000;
    this.maxRetries = parseInt(process.env.DATA_SERVICE_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.DATA_SERVICE_RETRY_DELAY) || 1000;

    // 创建axios实例
    this.client = axios.create({
      baseURL: this.dataServiceUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.dataServiceApiKey
      }
    });

    // 缓存配置
    this.cache = new Map();
    this.cacheTTL = 60000; // 1分钟缓存

    // 监控和健康检查配置
    this.healthCheckInterval = parseInt(process.env.DATA_SERVICE_HEALTH_CHECK_INTERVAL) || 30000; // 30秒
    this.maxFallbackDuration = parseInt(process.env.DATA_SERVICE_MAX_FALLBACK_DURATION) || 300000; // 5分钟
    this.dataQualityThreshold = parseFloat(process.env.DATA_SERVICE_QUALITY_THRESHOLD) || 0.8; // 80%

    // 监控状态
    this.monitoringStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackRequests: 0,
      lastHealthCheck: null,
      lastSuccessfulRequest: null,
      isHealthy: false,
      dataQualityScore: 1.0,
      currentDataSource: 'unknown'
    };

    // 启动健康检查
    this.startHealthCheck();
  }

  /**
   * 获取股票实时数据
   * @param {string} stockCode - 股票代码
   * @returns {Promise<Object>} 实时数据
   */
  async getRealtimeData(stockCode) {
    const cacheKey = `realtime:${stockCode}`;
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    // 检查是否应该使用降级方案
    if (this.shouldUseFallback()) {
      console.warn(`数据服务降级模式激活，使用模拟数据 (${stockCode})`);
      const fallbackData = this.getMockRealtimeData(stockCode);
      this.updateMonitoringStats(true, true); // 降级方案视为成功
      this.setToCache(cacheKey, fallbackData, 5000); // 降级数据缓存5秒
      return fallbackData;
    }

    try {
      // 调用数据服务的API端点
      const response = await this.client.get(this.buildApiPath(`/stocks/${stockCode}/quote`));

      // 将数据服务返回的数据格式转换为后端期望的格式
      const result = {
        success: true,
        stock_code: stockCode,
        price: response.data.price || response.data.current_price || 0,
        change: response.data.change || response.data.change_amount || 0,
        change_percent: response.data.change_percent || response.data.change_percentage || 0,
        volume: response.data.volume || response.data.trading_volume || 0,
        amount: response.data.amount || response.data.trading_amount || 0,
        open: response.data.open || response.data.open_price || 0,
        high: response.data.high || response.data.high_price || 0,
        low: response.data.low || response.data.low_price || 0,
        prev_close: response.data.prev_close || response.data.previous_close || 0,
        bid_ask: response.data.bid_ask || {
          bid1: { price: 0, volume: 0 },
          bid2: { price: 0, volume: 0 },
          ask1: { price: 0, volume: 0 },
          ask2: { price: 0, volume: 0 }
        },
        timestamp: response.data.timestamp || new Date().toISOString(),
        market_status: response.data.market_status || 'trading',
        data_source: response.data.data_source || 'real',
        is_fallback: false
      };

      // 验证数据质量
      const dataQuality = this.validateDataQuality(result);
      if (!dataQuality.isValid) {
        console.warn(`数据质量检查失败 (${stockCode}):`, dataQuality.reasons);
        result.data_quality_warnings = dataQuality.reasons;
      }

      this.setToCache(cacheKey, result, 10000); // 10秒缓存实时数据
      this.updateMonitoringStats(true, false);
      return result;
    } catch (error) {
      console.error(`获取股票实时数据失败 (${stockCode}):`, error.message);
      this.updateMonitoringStats(false, false);

      // 返回模拟数据作为降级方案
      const fallbackData = this.getMockRealtimeData(stockCode);
      this.setToCache(cacheKey, fallbackData, 5000); // 降级数据缓存5秒
      return fallbackData;
    }
  }

  /**
   * 批量获取股票实时数据
   * @param {Array<string>} stockCodes - 股票代码数组
   * @returns {Promise<Array<Object>>} 实时数据数组
   */
  async batchGetRealtimeData(stockCodes) {
    // 检查是否应该使用降级方案
    if (this.shouldUseFallback()) {
      console.warn('数据服务降级模式激活，批量使用模拟数据');
      const fallbackResults = stockCodes.map(stockCode => this.getMockRealtimeData(stockCode));
      this.updateMonitoringStats(true, true); // 降级方案视为成功
      return fallbackResults;
    }

    try {
      // 调用数据服务的批量API端点
      const response = await this.client.get(this.buildApiPath('/stocks/batch/quotes'), {
        params: { symbols: stockCodes.join(',') }
      });

      // 将数据服务返回的数据格式转换为后端期望的格式
      const results = stockCodes.map(stockCode => {
        const quote = response.data[stockCode] || {};
        const result = {
          success: true,
          stock_code: stockCode,
          price: quote.price || quote.current_price || 0,
          change: quote.change || quote.change_amount || 0,
          change_percent: quote.change_percent || quote.change_percentage || 0,
          volume: quote.volume || quote.trading_volume || 0,
          amount: quote.amount || quote.trading_amount || 0,
          timestamp: quote.timestamp || new Date().toISOString(),
          data_source: quote.data_source || 'real',
          is_fallback: false
        };

        // 验证数据质量
        const dataQuality = this.validateDataQuality(result);
        if (!dataQuality.isValid) {
          console.warn(`批量数据质量检查失败 (${stockCode}):`, dataQuality.reasons);
          result.data_quality_warnings = dataQuality.reasons;
        }

        return result;
      });

      this.updateMonitoringStats(true, false);
      return results;
    } catch (error) {
      console.error('批量获取股票实时数据失败:', error.message);
      this.updateMonitoringStats(false, false);

      // 返回模拟数据作为降级方案
      return stockCodes.map(stockCode => this.getMockRealtimeData(stockCode));
    }
  }

  /**
   * 获取K线数据
   * @param {string} stockCode - 股票代码
   * @param {string} interval - 时间间隔 (1m, 5m, 15m, 30m, 1h, 1d, 1w, 1M)
   * @param {number} limit - 数据条数
   * @param {string} startTime - 开始时间
   * @param {string} endTime - 结束时间
   * @returns {Promise<Array<Object>>} K线数据
   */
  async getKlineData(stockCode, interval = '1d', limit = 100, startTime, endTime) {
    const cacheKey = `kline:${stockCode}:${interval}:${limit}:${startTime || ''}:${endTime || ''}`;
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // 调用数据服务的K线数据API端点
      const params = {
        interval,
        limit
      };

      if (startTime) params.start_date = startTime;
      if (endTime) params.end_date = endTime;

      const response = await this.client.get(this.buildApiPath(`/stocks/${stockCode}/history`), { params });

      // 将数据服务返回的数据格式转换为后端期望的格式
      const result = response.data.map(k => ({
        time: k.time || k.timestamp || k.date,
        open: k.open || k.open_price || 0,
        high: k.high || k.high_price || 0,
        low: k.low || k.low_price || 0,
        close: k.close || k.close_price || k.current_price || 0,
        volume: k.volume || k.trading_volume || 0,
        amount: k.amount || k.trading_amount || 0
      }));

      this.setToCache(cacheKey, result, 300000); // 5分钟缓存K线数据
      return result;
    } catch (error) {
      console.error(`获取K线数据失败 (${stockCode}):`, error.message);

      // 返回模拟数据作为降级方案
      return this.getMockKlineData(stockCode, interval, limit);
    }
  }

  /**
   * 获取技术指标
   * @param {string} stockCode - 股票代码
   * @param {Array<string>} indicators - 指标列表
   * @returns {Promise<Object>} 技术指标数据
   */
  async getTechnicalIndicators(stockCode, indicators = ['ma', 'rsi', 'macd', 'kdj', 'boll']) {
    const cacheKey = `indicators:${stockCode}:${indicators.join(',')}`;
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // 调用数据服务的技术指标API端点
      const response = await this.client.get(this.buildApiPath(`/technical/${stockCode}/indicators`), {
        params: { indicators: indicators.join(','), period: 20 }
      });

      const result = {
        success: true,
        stock_code: stockCode,
        indicators: response.data.indicators || response.data,
        timestamp: response.data.timestamp || new Date().toISOString()
      };

      this.setToCache(cacheKey, result, 120000); // 2分钟缓存技术指标
      return result;
    } catch (error) {
      console.error(`获取技术指标失败 (${stockCode}):`, error.message);

      // 返回模拟数据作为降级方案
      return this.getMockTechnicalIndicators(stockCode);
    }
  }

  /**
   * 获取市场统计数据
   * @param {string} market - 市场代码
   * @returns {Promise<Object>} 市场统计数据
   */
  async getMarketStats(market) {
    const cacheKey = `market_stats:${market || 'all'}`;
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // 数据服务可能没有直接的市场统计API，这里使用降级方案
      // 或者我们可以组合多个API来获取市场统计数据
      // 暂时返回模拟数据，后续可以扩展
      console.warn('数据服务暂无市场统计API，使用降级方案');

      // 尝试获取市场状态作为替代
      const params = market ? { market } : {};
      const response = await this.client.get(this.buildApiPath('/market/status'), { params });

      const result = {
        success: true,
        market: market || 'all',
        total_stocks: 0, // 数据服务可能不提供这些数据
        up_count: 0,
        down_count: 0,
        unchanged_count: 0,
        limit_up_count: 0,
        limit_down_count: 0,
        total_turnover: 0,
        total_market_cap: 0,
        timestamp: response.data.timestamp || new Date().toISOString(),
        market_status: response.data.status || 'unknown',
        is_fallback: true,
        fallback_reason: '数据服务暂无完整的市场统计API'
      };

      this.setToCache(cacheKey, result, 30000); // 30秒缓存市场统计
      return result;
    } catch (error) {
      console.error('获取市场统计数据失败:', error.message);

      // 返回模拟数据作为降级方案
      return this.getMockMarketStats(market);
    }
  }

  /**
   * 获取股票基本信息
   * @param {string} stockCode - 股票代码
   * @returns {Promise<Object>} 股票基本信息
   */
  async getStockInfo(stockCode) {
    const cacheKey = `stock_info:${stockCode}`;
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // 数据服务可能没有专门的股票信息API
      // 我们可以尝试从其他API获取部分信息，或者使用降级方案
      console.warn('数据服务暂无专门的股票信息API，使用降级方案');

      // 尝试从实时数据中获取一些基本信息
      const realtimeData = await this.getRealtimeData(stockCode);

      const result = {
        success: true,
        stock_code: stockCode,
        name: `股票${stockCode}`, // 默认名称
        full_name: `${stockCode}股份有限公司`,
        market: stockCode.includes('.SH') ? 'SH' : stockCode.includes('.SZ') ? 'SZ' : 'Unknown',
        industry: '未知行业',
        sub_industry: '未知细分行业',
        listing_date: '2010-01-01',
        total_shares: 1000000000,
        circulating_shares: 800000000,
        pe_ratio: 15.0,
        pb_ratio: 1.5,
        dividend_yield: 2.0,
        market_cap: realtimeData.price * 1000000000,
        circulating_market_cap: realtimeData.price * 800000000,
        is_fallback: true,
        fallback_reason: '数据服务暂无专门的股票信息API'
      };

      this.setToCache(cacheKey, result, 3600000); // 1小时缓存股票信息
      return result;
    } catch (error) {
      console.error(`获取股票基本信息失败 (${stockCode}):`, error.message);

      // 返回模拟数据作为降级方案
      return this.getMockStockInfo(stockCode);
    }
  }

  /**
   * 搜索股票
   * @param {string} query - 搜索关键词
   * @param {number} limit - 结果数量限制
   * @returns {Promise<Array<Object>>} 搜索结果
   */
  async searchStocks(query, limit = 20) {
    const cacheKey = `search:${query}:${limit}`;
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // 调用数据服务的搜索API端点
      const response = await this.client.get(this.buildApiPath('/search'), {
        params: { query, limit }
      });

      // 将数据服务返回的数据格式转换为后端期望的格式
      const result = response.data.map(stock => ({
        stock_code: stock.symbol || stock.stock_code,
        name: stock.name || stock.company_name,
        market: stock.market || stock.exchange,
        industry: stock.industry || stock.sector,
        match_score: stock.match_score || stock.relevance_score || 0.8
      }));

      this.setToCache(cacheKey, result, 300000); // 5分钟缓存搜索结果
      return result;
    } catch (error) {
      console.error('搜索股票失败:', error.message);

      // 返回模拟搜索结果作为降级方案
      return this.getMockSearchResults(query, limit);
    }
  }

  /**
   * 获取模拟实时数据（降级方案）
   * @param {string} stockCode - 股票代码
   * @returns {Object} 模拟实时数据
   */
  getMockRealtimeData(stockCode) {
    const basePrice = 10 + Math.random() * 20;
    const change = (Math.random() * 2 - 1) * 0.1 * basePrice;
    const price = basePrice + change;

    return {
      success: false,
      stock_code: stockCode,
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      change_percent: parseFloat(((change / basePrice) * 100).toFixed(2)),
      volume: Math.floor(Math.random() * 10000000),
      amount: parseFloat((price * Math.random() * 1000000).toFixed(2)),
      open: parseFloat((basePrice + (Math.random() * 0.5 - 0.25)).toFixed(2)),
      high: parseFloat((price + Math.random() * 0.5).toFixed(2)),
      low: parseFloat((price - Math.random() * 0.5).toFixed(2)),
      prev_close: parseFloat(basePrice.toFixed(2)),
      bid_ask: {
        bid1: { price: parseFloat((price - 0.01).toFixed(2)), volume: Math.floor(Math.random() * 1000) },
        bid2: { price: parseFloat((price - 0.02).toFixed(2)), volume: Math.floor(Math.random() * 2000) },
        ask1: { price: parseFloat((price + 0.01).toFixed(2)), volume: Math.floor(Math.random() * 800) },
        ask2: { price: parseFloat((price + 0.02).toFixed(2)), volume: Math.floor(Math.random() * 1500) }
      },
      timestamp: new Date().toISOString(),
      market_status: 'trading',
      is_fallback: true,
      fallback_reason: '数据服务不可用'
    };
  }

  /**
   * 获取模拟K线数据（降级方案）
   * @param {string} stockCode - 股票代码
   * @param {string} interval - 时间间隔
   * @param {number} limit - 数据条数
   * @returns {Array<Object>} 模拟K线数据
   */
  getMockKlineData(stockCode, interval = '1d', limit = 100) {
    const kline = [];
    const now = new Date();
    const basePrice = 15 + Math.random() * 3;

    for (let i = limit - 1; i >= 0; i--) {
      const time = new Date(now);

      // 根据时间间隔调整时间
      switch (interval) {
        case '1m':
          time.setMinutes(time.getMinutes() - i);
          break;
        case '5m':
          time.setMinutes(time.getMinutes() - i * 5);
          break;
        case '15m':
          time.setMinutes(time.getMinutes() - i * 15);
          break;
        case '30m':
          time.setMinutes(time.getMinutes() - i * 30);
          break;
        case '1h':
          time.setHours(time.getHours() - i);
          break;
        case '1d':
          time.setDate(time.getDate() - i);
          break;
        case '1w':
          time.setDate(time.getDate() - i * 7);
          break;
        case '1M':
          time.setMonth(time.getMonth() - i);
          break;
        default:
          time.setDate(time.getDate() - i);
      }

      const open = basePrice + (Math.random() * 0.5 - 0.25);
      const close = open + (Math.random() * 0.4 - 0.2);
      const high = Math.max(open, close) + Math.random() * 0.3;
      const low = Math.min(open, close) - Math.random() * 0.3;

      kline.push({
        time: time.toISOString(),
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(Math.random() * 10000000),
        amount: parseFloat((((open + high + low + close) / 4) * Math.random() * 1000000).toFixed(2))
      });
    }

    return kline;
  }

  /**
   * 获取模拟技术指标（降级方案）
   * @param {string} stockCode - 股票代码
   * @returns {Object} 模拟技术指标
   */
  getMockTechnicalIndicators(stockCode) {
    return {
      success: false,
      stock_code: stockCode,
      indicators: {
        ma: {
          ma5: 16.23 + Math.random() * 0.5 - 0.25,
          ma10: 16.05 + Math.random() * 0.5 - 0.25,
          ma20: 15.89 + Math.random() * 0.5 - 0.25,
          ma30: 15.75 + Math.random() * 0.5 - 0.25,
          ma60: 15.50 + Math.random() * 0.5 - 0.25
        },
        rsi: 50 + Math.random() * 40 - 20,
        macd: {
          dif: Math.random() * 0.5 - 0.25,
          dea: Math.random() * 0.4 - 0.2,
          macd: Math.random() * 0.3 - 0.15
        },
        kdj: {
          k: 50 + Math.random() * 50 - 25,
          d: 50 + Math.random() * 50 - 25,
          j: 50 + Math.random() * 50 - 25
        },
        boll: {
          upper: 17.00 + Math.random() * 1 - 0.5,
          middle: 16.00 + Math.random() * 1 - 0.5,
          lower: 15.00 + Math.random() * 1 - 0.5
        }
      },
      timestamp: new Date().toISOString(),
      is_fallback: true,
      fallback_reason: '数据服务不可用'
    };
  }

  /**
   * 获取模拟市场统计数据（降级方案）
   * @param {string} market - 市场代码
   * @returns {Object} 模拟市场统计数据
   */
  getMockMarketStats(market) {
    const total = 2000 + Math.floor(Math.random() * 1000);
    const up = Math.floor(total * (0.4 + Math.random() * 0.2));
    const down = Math.floor(total * (0.3 + Math.random() * 0.2));
    const unchanged = total - up - down;

    return {
      success: false,
      market: market || 'all',
      total_stocks: total,
      up_count: up,
      down_count: down,
      unchanged_count: unchanged,
      limit_up_count: Math.floor(up * 0.1),
      limit_down_count: Math.floor(down * 0.05),
      total_turnover: 100000000000 + Math.random() * 50000000000,
      total_market_cap: 5000000000000 + Math.random() * 2000000000000,
      timestamp: new Date().toISOString(),
      is_fallback: true,
      fallback_reason: '数据服务不可用'
    };
  }

  /**
   * 获取模拟股票信息（降级方案）
   * @param {string} stockCode - 股票代码
   * @returns {Object} 模拟股票信息
   */
  getMockStockInfo(stockCode) {
    const industries = ['科技', '金融', '消费', '医药', '工业', '能源', '材料', '公用事业'];
    const markets = ['SH', 'SZ', 'BJ', 'HK'];

    return {
      success: false,
      stock_code: stockCode,
      name: `股票${stockCode}`,
      full_name: `${stockCode}股份有限公司`,
      market: markets[Math.floor(Math.random() * markets.length)],
      industry: industries[Math.floor(Math.random() * industries.length)],
      sub_industry: '细分行业',
      listing_date: '2010-01-01',
      total_shares: 1000000000 + Math.floor(Math.random() * 9000000000),
      circulating_shares: 800000000 + Math.floor(Math.random() * 7000000000),
      pe_ratio: 8 + Math.random() * 20,
      pb_ratio: 0.8 + Math.random() * 2,
      dividend_yield: 1 + Math.random() * 4,
      market_cap: 50000000000 + Math.random() * 50000000000,
      circulating_market_cap: 40000000000 + Math.random() * 40000000000,
      is_fallback: true,
      fallback_reason: '数据服务不可用'
    };
  }

  /**
   * 获取模拟搜索结果（降级方案）
   * @param {string} query - 搜索关键词
   * @param {number} limit - 结果数量限制
   * @returns {Array<Object>} 模拟搜索结果
   */
  getMockSearchResults(query, limit = 20) {
    const results = [];
    const industries = ['科技', '金融', '消费', '医药', '工业', '能源', '材料', '公用事业'];
    const markets = ['SH', 'SZ', 'BJ', 'HK'];

    for (let i = 0; i < Math.min(limit, 10); i++) {
      const code = `STOCK${1000 + i}`;
      results.push({
        stock_code: code,
        name: `${query}相关股票${i + 1}`,
        market: markets[Math.floor(Math.random() * markets.length)],
        industry: industries[Math.floor(Math.random() * industries.length)],
        match_score: 0.8 - i * 0.05
      });
    }

    return results;
  }

  /**
   * 从缓存获取数据
   * @param {string} key - 缓存键
   * @returns {any} 缓存数据或null
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const { data, timestamp } = cached;
    if (Date.now() - timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return data;
  }

  /**
   * 设置数据到缓存
   * @param {string} key - 缓存键
   * @param {any} data - 要缓存的数据
   * @param {number} ttl - 缓存时间（毫秒）
   */
  setToCache(key, data, ttl = this.cacheTTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * 清理过期缓存
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 测试数据服务连接
   * @returns {Promise<Object>} 连接测试结果
   */
  async testConnection() {
    try {
      const startTime = Date.now();
      const response = await this.client.get(this.buildApiPath('/health'), { timeout: 5000 });
      const endTime = Date.now();

      return {
        success: true,
        status: 'connected',
        response_time: endTime - startTime,
        service_version: response.data.version || '0.1.0',
        data_source: response.data.data_source || 'unknown',
        last_update: response.data.last_update || response.data.timestamp,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('数据服务连接测试失败:', error.message);

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
   * 构建完整的API路径
   * @param {string} endpoint - API端点
   * @returns {string} 完整的API路径
   */
  buildApiPath(endpoint) {
    // 确保endpoint以/开头
    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint;
    }

    // 构建完整路径：API前缀 + 端点
    return `${this.dataServiceApiPrefix}${endpoint}`;
  }

  /**
   * 启动健康检查
   */
  startHealthCheck() {
    // 立即执行一次健康检查
    this.performHealthCheck();

    // 设置定时健康检查
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);

    console.log('数据服务健康检查已启动，间隔:', this.healthCheckInterval, 'ms');
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      const healthResult = await this.testConnection();
      this.monitoringStats.lastHealthCheck = new Date().toISOString();
      this.monitoringStats.isHealthy = healthResult.success;
      this.monitoringStats.currentDataSource = healthResult.data_source || 'unknown';

      if (healthResult.success) {
        console.log('数据服务健康检查通过:', healthResult);
      } else {
        console.warn('数据服务健康检查失败:', healthResult.error);
      }
    } catch (error) {
      console.error('健康检查执行失败:', error.message);
      this.monitoringStats.isHealthy = false;
      this.monitoringStats.lastHealthCheck = new Date().toISOString();
    }
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      console.log('数据服务健康检查已停止');
    }
  }

  /**
   * 更新监控统计
   * @param {boolean} success - 请求是否成功
   * @param {boolean} isFallback - 是否使用了降级方案
   */
  updateMonitoringStats(success, isFallback = false) {
    this.monitoringStats.totalRequests++;

    if (success) {
      this.monitoringStats.successfulRequests++;
      this.monitoringStats.lastSuccessfulRequest = new Date().toISOString();
    } else {
      this.monitoringStats.failedRequests++;
    }

    if (isFallback) {
      this.monitoringStats.fallbackRequests++;
    }

    // 计算数据质量分数（成功请求比例）
    if (this.monitoringStats.totalRequests > 0) {
      this.monitoringStats.dataQualityScore =
        this.monitoringStats.successfulRequests / this.monitoringStats.totalRequests;
    }
  }

  /**
   * 获取监控统计
   * @returns {Object} 监控统计信息
   */
  getMonitoringStats() {
    return {
      ...this.monitoringStats,
      successRate: this.monitoringStats.totalRequests > 0
        ? (this.monitoringStats.successfulRequests / this.monitoringStats.totalRequests) * 100
        : 0,
      fallbackRate: this.monitoringStats.totalRequests > 0
        ? (this.monitoringStats.fallbackRequests / this.monitoringStats.totalRequests) * 100
        : 0,
      uptime: this.monitoringStats.isHealthy ? 'up' : 'down',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 检查是否应该使用降级方案
   * @returns {boolean} 是否应该使用降级方案
   */
  shouldUseFallback() {
    // 如果数据服务不健康，使用降级方案
    if (!this.monitoringStats.isHealthy) {
      return true;
    }

    // 如果数据质量低于阈值，使用降级方案
    if (this.monitoringStats.dataQualityScore < this.dataQualityThreshold) {
      return true;
    }

    // 如果最近没有成功请求，使用降级方案
    if (this.monitoringStats.lastSuccessfulRequest) {
      const lastSuccessTime = new Date(this.monitoringStats.lastSuccessfulRequest).getTime();
      const currentTime = Date.now();
      if (currentTime - lastSuccessTime > this.maxFallbackDuration) {
        return true;
      }
    }

    return false;
  }

  /**
   * 验证数据质量
   * @param {Object} data - 要验证的数据
   * @returns {Object} 验证结果
   */
  validateDataQuality(data) {
    const reasons = [];

    // 检查必要字段是否存在
    const requiredFields = ['price', 'timestamp', 'stock_code'];
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        reasons.push(`缺少必要字段: ${field}`);
      }
    }

    // 检查价格是否合理
    if (data.price !== undefined && data.price !== null) {
      if (data.price <= 0) {
        reasons.push('价格无效（小于等于0）');
      }
      if (data.price > 10000) {
        reasons.push('价格异常高（超过10000）');
      }
    }

    // 检查时间戳是否合理
    if (data.timestamp) {
      const dataTime = new Date(data.timestamp).getTime();
      const currentTime = Date.now();
      const timeDiff = Math.abs(currentTime - dataTime);

      if (timeDiff > 3600000) { // 1小时
        reasons.push('数据时间戳过时（超过1小时）');
      }
    }

    // 检查涨跌幅是否合理
    if (data.change_percent !== undefined && data.change_percent !== null) {
      if (Math.abs(data.change_percent) > 20) {
        reasons.push('涨跌幅异常（超过20%）');
      }
    }

    return {
      isValid: reasons.length === 0,
      reasons,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 重置监控统计
   */
  resetMonitoringStats() {
    this.monitoringStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackRequests: 0,
      lastHealthCheck: null,
      lastSuccessfulRequest: null,
      isHealthy: false,
      dataQualityScore: 1.0,
      currentDataSource: 'unknown'
    };
    console.log('监控统计已重置');
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
        console.warn(`数据服务请求失败，第${attempt}次重试:`, error.message);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * 获取增强的市场状态信息
   * @returns {Promise<Object>} 市场状态信息
   */
  async getEnhancedMarketStatus() {
    const cacheKey = 'enhanced_market_status';
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // 调用数据服务的增强市场状态端点
      const response = await this.client.get('/api/v2/market/status');

      // 转换数据格式
      const result = {
        success: true,
        isTrading: response.data.is_open,
        status: response.data.status,
        description: response.data.description,
        nextTradingTime: response.data.next_trading_time,
        currentTime: response.data.current_time,
        recommendedInterval: response.data.recommended_interval,
        dataServiceStatus: response.data.data_service_status,
        dataQuality: response.data.data_quality,
        dataStatus: response.data.data_status,
        activeSources: response.data.active_sources,
        successRate: response.data.success_rate,
        timestamp: new Date().toISOString()
      };

      // 缓存30秒
      this.setToCache(cacheKey, result, 30000);
      return result;
    } catch (error) {
      console.error('获取增强市场状态失败:', error.message);

      // 返回降级方案的市场状态信息
      const now = new Date();
      const isAfterHours = now.getHours() >= 15 || now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 30);

      return {
        success: false,
        isTrading: false,
        status: isAfterHours ? 'after_hours' : 'unknown',
        description: isAfterHours ? '收盘后（降级数据）' : '未知（降级数据）',
        nextTradingTime: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 30).toISOString(),
        currentTime: now.toISOString(),
        recommendedInterval: '5m',
        dataServiceStatus: 'degraded',
        dataQuality: 0.0,
        dataStatus: 'historical',
        activeSources: [],
        successRate: 0.0,
        isFallback: true,
        fallbackReason: '数据服务不可用',
        timestamp: now.toISOString()
      };
    }
  }
}

// 创建单例实例
export const dataService = new DataService();