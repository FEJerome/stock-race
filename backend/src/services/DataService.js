import axios from 'axios';

export class DataService {
  constructor() {
    // 数据服务配置
    this.dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8001';
    this.dataServiceApiKey = process.env.DATA_SERVICE_API_KEY || 'stock-race-data-key';
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

    try {
      const response = await this.client.get(`/api/data/stocks/${stockCode}/realtime`);

      const result = {
        success: true,
        stock_code: stockCode,
        price: response.data.price,
        change: response.data.change,
        change_percent: response.data.change_percent,
        volume: response.data.volume,
        amount: response.data.amount,
        open: response.data.open,
        high: response.data.high,
        low: response.data.low,
        prev_close: response.data.prev_close,
        bid_ask: response.data.bid_ask,
        timestamp: response.data.timestamp,
        market_status: response.data.market_status
      };

      this.setToCache(cacheKey, result, 10000); // 10秒缓存实时数据
      return result;
    } catch (error) {
      console.error(`获取股票实时数据失败 (${stockCode}):`, error.message);

      // 返回模拟数据作为降级方案
      return this.getMockRealtimeData(stockCode);
    }
  }

  /**
   * 批量获取股票实时数据
   * @param {Array<string>} stockCodes - 股票代码数组
   * @returns {Promise<Array<Object>>} 实时数据数组
   */
  async batchGetRealtimeData(stockCodes) {
    try {
      const response = await this.client.post('/api/data/stocks/realtime/batch', {
        stock_codes: stockCodes
      });

      return response.data.stocks.map(stock => ({
        success: true,
        stock_code: stock.stock_code,
        price: stock.price,
        change: stock.change,
        change_percent: stock.change_percent,
        volume: stock.volume,
        amount: stock.amount,
        timestamp: stock.timestamp
      }));
    } catch (error) {
      console.error('批量获取股票实时数据失败:', error.message);

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
      const params = {
        interval,
        limit
      };

      if (startTime) params.start_time = startTime;
      if (endTime) params.end_time = endTime;

      const response = await this.client.get(`/api/data/stocks/${stockCode}/kline`, { params });

      const result = response.data.kline.map(k => ({
        time: k.time,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
        amount: k.amount
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
      const response = await this.client.get(`/api/data/stocks/${stockCode}/indicators`, {
        params: { indicators: indicators.join(',') }
      });

      const result = {
        success: true,
        stock_code: stockCode,
        indicators: response.data.indicators,
        timestamp: response.data.timestamp
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
      const params = market ? { market } : {};
      const response = await this.client.get('/api/data/market/stats', { params });

      const result = {
        success: true,
        market: market || 'all',
        total_stocks: response.data.total_stocks,
        up_count: response.data.up_count,
        down_count: response.data.down_count,
        unchanged_count: response.data.unchanged_count,
        limit_up_count: response.data.limit_up_count,
        limit_down_count: response.data.limit_down_count,
        total_turnover: response.data.total_turnover,
        total_market_cap: response.data.total_market_cap,
        timestamp: response.data.timestamp
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
      const response = await this.client.get(`/api/data/stocks/${stockCode}/info`);

      const result = {
        success: true,
        stock_code: stockCode,
        name: response.data.name,
        full_name: response.data.full_name,
        market: response.data.market,
        industry: response.data.industry,
        sub_industry: response.data.sub_industry,
        listing_date: response.data.listing_date,
        total_shares: response.data.total_shares,
        circulating_shares: response.data.circulating_shares,
        pe_ratio: response.data.pe_ratio,
        pb_ratio: response.data.pb_ratio,
        dividend_yield: response.data.dividend_yield,
        market_cap: response.data.market_cap,
        circulating_market_cap: response.data.circulating_market_cap
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
      const response = await this.client.get('/api/data/stocks/search', {
        params: { q: query, limit }
      });

      const result = response.data.stocks.map(stock => ({
        stock_code: stock.stock_code,
        name: stock.name,
        market: stock.market,
        industry: stock.industry,
        match_score: stock.match_score
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
      const response = await this.client.get('/api/data/health', { timeout: 5000 });
      const endTime = Date.now();

      return {
        success: true,
        status: 'connected',
        response_time: endTime - startTime,
        service_version: response.data.version,
        data_source: response.data.data_source,
        last_update: response.data.last_update,
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
}

// 创建单例实例
export const dataService = new DataService();