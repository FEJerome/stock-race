/**
 * Trading Status Service [T-015]
 * 交易状态服务
 *
 * 职责:
 * - 从Market Data Service获取实时交易状态
 * - 熔断降级：Market Data不可用时使用本地TradingRulesEngine
 * - 缓存交易状态数据
 */

import { MarketDataClient } from './MarketDataClient.js';
import { TradingRulesEngine } from './TradingRulesEngine.js';
import { ServiceUnavailableError } from './ServiceClient.js';
import { tradingStatusCache } from './CacheService.js';

class TradingStatusService {
  constructor() {
    this.marketDataClient = new MarketDataClient();
    this.rulesEngine = new TradingRulesEngine();

    // 熔断器状态
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      successCount: 0,
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 60000, // 60秒后尝试恢复
      lastFailureTime: null
    };

    // 缓存TTL: 30秒
    this.cacheTTL = 30000;
  }

  /**
   * 获取股票交易状态 [T-015]
   * @param {string} symbol - 股票代码
   * @returns {Promise<Object>} 交易状态
   */
  async getTradingStatus(symbol) {
    try {
      // 检查熔断器
      if (this.isCircuitBreakerOpen()) {
        console.log(`[TradingStatusService] 熔断器开启，使用本地降级方案 (${symbol})`);
        return this.getFallbackTradingStatus(symbol);
      }

      // 使用缓存或获取新数据
      const status = await tradingStatusCache.getOrSet(
        `status:${symbol}`,
        async () => {
          // 从Market Data Service获取
          const data = await this.marketDataClient.getTradingStatus(symbol);
          // 记录成功
          this.recordSuccess();
          return data;
        },
        this.cacheTTL
      );

      return status;
    } catch (error) {
      console.error(`[TradingStatusService] 获取交易状态失败 (${symbol}):`, error.message);

      // 记录失败
      this.recordFailure();

      // 降级到本地规则
      return this.getFallbackTradingStatus(symbol);
    }
  }

  /**
   * 批量获取股票交易状态
   * @param {Array<string>} symbols - 股票代码数组
   * @returns {Promise<Object>} 交易状态映射
   */
  async getBatchTradingStatus(symbols) {
    const results = {};

    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          results[symbol] = await this.getTradingStatus(symbol);
        } catch (error) {
          console.error(`[TradingStatusService] 批量获取失败 (${symbol}):`, error.message);
          results[symbol] = this.getFallbackTradingStatus(symbol);
        }
      })
    );

    return results;
  }

  /**
   * 获取市场规则 [T-011]
   * @param {string} market - 市场代码
   * @returns {Promise<Object>} 市场规则
   */
  async getMarketRules(market) {
    try {
      // 检查熔断器
      if (this.isCircuitBreakerOpen()) {
        console.log(`[TradingStatusService] 熔断器开启，使用本地降级方案 (${market})`);
        return this.getFallbackMarketRules(market);
      }

      // 使用缓存或获取新数据
      const rules = await tradingStatusCache.getOrSet(
        `rules:${market}`,
        async () => {
          // 从Market Data Service获取
          const data = await this.marketDataClient.getMarketRules(market);
          // 记录成功
          this.recordSuccess();
          return data;
        },
        this.cacheTTL
      );

      return rules;
    } catch (error) {
      console.error(`[TradingStatusService] 获取市场规则失败 (${market}):`, error.message);

      // 记录失败
      this.recordFailure();

      // 降级到本地规则
      return this.getFallbackMarketRules(market);
    }
  }

  /**
   * 获取降级交易状态（本地规则）
   * @private
   * @param {string} symbol - 股票代码
   * @returns {Object} 交易状态
   */
  getFallbackTradingStatus(symbol) {
    // 推断市场类型
    const market = this.inferMarket(symbol);
    const marketRules = this.rulesEngine.getMarketRules(market);

    // 计算涨跌停价格（假设昨收价为基准）
    const lastPrice = 10.00; // 默认价格，实际应该从缓存或数据库获取
    const priceLimits = this.rulesEngine.calculatePriceLimits(lastPrice, market, {
      isST: symbol.startsWith('ST') || symbol.startsWith('*ST')
    });

    return {
      success: true,
      symbol,
      status: 'normal',
      priceLimits,
      tradingPhase: this.getCurrentTradingPhase(),
      isST: symbol.startsWith('ST') || symbol.startsWith('*ST'),
      isSuspended: false,
      isFallback: true, // 标记为降级数据
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取降级市场规则（本地规则）
   * @private
   * @param {string} market - 市场代码
   * @returns {Object} 市场规则
   */
  getFallbackMarketRules(market) {
    const rules = this.rulesEngine.getMarketRules(market);

    return {
      success: true,
      market,
      priceLimit: rules.priceLimit,
      minQuantity: rules.minQuantity,
      maxQuantityPerOrder: rules.maxQuantityPerOrder,
      tradingHours: rules.tradingHours,
      isFallback: true, // 标记为降级数据
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 推断市场类型
   * @private
   * @param {string} symbol - 股票代码
   * @returns {string} 市场代码
   */
  inferMarket(symbol) {
    const code = symbol.replace(/\D/g, '');
    const prefix = symbol.replace(/\d/g, '');

    if (prefix === 'sh' || code.startsWith('6')) {
      return 'SH';
    } else if (code.startsWith('3')) {
      return 'CYB';
    } else if (code.startsWith('68')) {
      return 'KCB';
    } else if (code.startsWith('8') || code.startsWith('4')) {
      return 'BJ';
    } else {
      return 'SZ'; // 默认深圳主板
    }
  }

  /**
   * 获取当前交易时段
   * @private
   * @returns {string} 交易时段
   */
  getCurrentTradingPhase() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const time = hour * 100 + minute;

    if (time >= 930 && time <= 1130) {
      return 'continuous'; // 连续竞价
    } else if (time >= 1300 && time <= 1500) {
      return 'continuous';
    } else if (time >= 915 && time < 930) {
      return 'auction'; // 集合竞价
    } else {
      return 'closed'; // 闭市
    }
  }

  /**
   * 检查熔断器是否开启
   * @private
   * @returns {boolean}
   */
  isCircuitBreakerOpen() {
    if (!this.circuitBreaker.isOpen) {
      return false;
    }

    // 检查是否超过恢复时间
    if (this.circuitBreaker.lastFailureTime) {
      const elapsed = Date.now() - this.circuitBreaker.lastFailureTime;
      if (elapsed > this.circuitBreaker.timeout) {
        console.log('[TradingStatusService] 熔断器恢复，尝试重新连接');
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failureCount = 0;
        return false;
      }
    }

    return true;
  }

  /**
   * 记录成功请求
   * @private
   */
  recordSuccess() {
    this.circuitBreaker.successCount++;

    if (this.circuitBreaker.successCount >= this.circuitBreaker.successThreshold) {
      this.circuitBreaker.failureCount = 0;
    }
  }

  /**
   * 记录失败请求
   * @private
   */
  recordFailure() {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      console.log('[TradingStatusService] 熔断器开启，切换到降级模式');
      this.circuitBreaker.isOpen = true;
    }
  }

  /**
   * 从缓存获取 (使用统一的CacheService)
   * @private
   * @param {string} key - 缓存键
   * @returns {Promise<Object|null>}
   */
  async getFromCache(key) {
    return await tradingStatusCache.get(key);
  }

  /**
   * 设置缓存 (使用统一的CacheService)
   * @private
   * @param {string} key - 缓存键
   * @param {Object} data - 缓存数据
   */
  async setCache(key, data) {
    await tradingStatusCache.set(key, data, this.cacheTTL);
  }

  /**
   * 清除缓存
   */
  async clearCache() {
    await tradingStatusCache.clear('trading-status:*');
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker() {
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.successCount = 0;
    this.circuitBreaker.lastFailureTime = null;
  }

  /**
   * 获取服务状态
   * @returns {Object} 服务状态
   */
  getStatus() {
    return {
      circuitBreaker: {
        isOpen: this.circuitBreaker.isOpen,
        failureCount: this.circuitBreaker.failureCount,
        successCount: this.circuitBreaker.successCount
      },
      cache: {
        stats: tradingStatusCache.getStats(),
        ttl: this.cacheTTL
      },
      timestamp: new Date().toISOString()
    };
  }
}

// 导出单例
const tradingStatusService = new TradingStatusService();
export { tradingStatusService as default, TradingStatusService };
