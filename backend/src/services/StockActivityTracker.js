/**
 * StockActivityTracker - 股票活动追踪服务
 * B-005: 用户活动数据收集
 *
 * 功能:
 * - 追踪用户查看股票行为
 * - 统计每只股票的用户查看数和查看次数
 * - 使用Redis存储活动数据,支持TTL过期
 * - 为WeightedHotStocksService提供数据源
 */

class StockActivityTracker {
  /**
   * @param {Object} redis - Redis客户端
   * @param {Object} config - 配置选项
   */
  constructor(redis, config = {}) {
    this.redis = redis;
    this.config = {
      defaultTTL: 3600,        // 默认过期时间: 1小时
      keyPrefix: 'stock:activity:', // Redis键前缀
      ...config
    };

    // 用户会话追踪(内存中临时存储,避免重复计数)
    this.userSessions = new Map(); // Map<userId, Set<symbol>>
  }

  /**
   * 获取Redis键
   * @param {string} symbol - 股票代码
   * @returns {string} Redis键
   */
  _getKey(symbol) {
    return `${this.config.keyPrefix}${symbol}`;
  }

  /**
   * 记录用户查看行为
   *
   * @param {string} symbol - 股票代码
   * @param {string} userId - 用户ID
   * @returns {Promise<Object>} 更新后的数据
   */
  async recordView(symbol, userId) {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Stock symbol is required');
    }
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required');
    }

    const key = this._getKey(symbol);
    const isNewUser = !this._hasUserViewed(userId, symbol);

    // 使用pipeline批量执行
    const pipeline = this.redis.pipeline();

    // 增加查看次数
    pipeline.hIncrBy(key, 'viewCount', 1);

    // 如果是新用户查看,增加用户计数
    if (isNewUser) {
      pipeline.hIncrBy(key, 'userCount', 1);
      this._markUserViewed(userId, symbol);
    }

    // 设置过期时间
    pipeline.expire(key, this.config.defaultTTL);

    const results = await pipeline.exec();

    return {
      symbol,
      userId,
      viewCount: parseInt(results[0]) || 0,
      userCount: isNewUser ? parseInt(results[1]) : undefined,
      isNewUser
    };
  }

  /**
   * 批量记录查看行为
   *
   * @param {Array} views - 查看记录数组 [{ symbol, userId }]
   * @returns {Promise<Object>} 处理结果
   */
  async recordBatchViews(views) {
    if (!Array.isArray(views) || views.length === 0) {
      return { success: true, processed: 0 };
    }

    const pipeline = this.redis.pipeline();
    let processed = 0;

    for (const view of views) {
      const { symbol, userId } = view;

      if (!symbol || !userId) {
        continue;
      }

      const key = this._getKey(symbol);
      const isNewUser = !this._hasUserViewed(userId, symbol);

      pipeline.hIncrBy(key, 'viewCount', 1);
      if (isNewUser) {
        pipeline.hIncrBy(key, 'userCount', 1);
        this._markUserViewed(userId, symbol);
      }
      pipeline.expire(key, this.config.defaultTTL);

      processed++;
    }

    if (processed > 0) {
      await pipeline.exec();
    }

    return { success: true, processed };
  }

  /**
   * 追踪用户会话中查看的股票
   * 用于WebSocket连接统计
   *
   * @param {string} userId - 用户ID
   * @param {Array} symbols - 查看的股票代码数组
   */
  async trackUserSession(userId, symbols) {
    if (!userId || !Array.isArray(symbols)) {
      return;
    }

    const views = symbols.map(symbol => ({ symbol, userId }));
    await this.recordBatchViews(views);
  }

  /**
   * 获取单只股票的活动数据
   *
   * @param {string} symbol - 股票代码
   * @returns {Promise<Object>} 活动数据
   */
  async getActivityData(symbol) {
    if (!symbol) {
      return { symbol: null, userCount: 0, viewCount: 0 };
    }

    const key = this._getKey(symbol);
    const data = await this.redis.hGetAll(key);

    return {
      symbol,
      userCount: parseInt(data.userCount) || 0,
      viewCount: parseInt(data.viewCount) || 0
    };
  }

  /**
   * 批量获取多只股票的活动数据
   *
   * @param {Array} symbols - 股票代码数组
   * @returns {Promise<Object>} 活动数据映射 { symbol: { userCount, viewCount } }
   */
  async getBatchActivityData(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return {};
    }

    const pipeline = this.redis.pipeline();

    for (const symbol of symbols) {
      pipeline.hGetAll(this._getKey(symbol));
    }

    const results = await pipeline.exec();
    const dataMap = {};

    symbols.forEach((symbol, index) => {
      const data = results[index] || {};
      dataMap[symbol] = {
        userCount: parseInt(data.userCount) || 0,
        viewCount: parseInt(data.viewCount) || 0
      };
    });

    return dataMap;
  }

  /**
   * 获取所有有活动数据的股票
   *
   * @returns {Promise<Object>} 所有活动数据
   */
  async getAllActivityData() {
    const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
    const dataMap = {};

    if (keys.length === 0) {
      return dataMap;
    }

    const pipeline = this.redis.pipeline();

    for (const key of keys) {
      pipeline.hGetAll(key);
    }

    const results = await pipeline.exec();

    keys.forEach((key, index) => {
      const symbol = key.replace(this.config.keyPrefix, '');
      const data = results[index] || {};
      dataMap[symbol] = {
        userCount: parseInt(data.userCount) || 0,
        viewCount: parseInt(data.viewCount) || 0
      };
    });

    return dataMap;
  }

  /**
   * 获取热门股票(按查看次数排序)
   *
   * @param {number} limit - 返回数量限制
   * @returns {Promise<Array>} 热门股票列表
   */
  async getTopStocks(limit = 10) {
    const allData = await this.getAllActivityData();

    const stocks = Object.entries(allData).map(([symbol, data]) => ({
      symbol,
      ...data
    }));

    // 按查看次数降序排序
    stocks.sort((a, b) => b.viewCount - a.viewCount);

    return stocks.slice(0, limit);
  }

  /**
   * 清除指定股票的活动数据
   *
   * @param {string} symbol - 股票代码
   */
  async clearActivityData(symbol) {
    if (!symbol) return;

    const key = this._getKey(symbol);
    await this.redis.del?.(key);
  }

  /**
   * 清除所有活动数据
   */
  async clearAllActivityData() {
    const keys = await this.redis.keys(`${this.config.keyPrefix}*`);

    if (keys.length > 0 && this.redis.del) {
      await this.redis.del(...keys);
    }
  }

  /**
   * 获取统计信息
   *
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
    const allData = await this.getAllActivityData();

    let totalViews = 0;
    let totalUsers = 0;

    for (const data of Object.values(allData)) {
      totalViews += data.viewCount;
      totalUsers += data.userCount;
    }

    return {
      trackedStocks: keys.length,
      totalViews,
      totalUsers,
      averageViewsPerStock: keys.length > 0 ? Math.round(totalViews / keys.length) : 0
    };
  }

  /**
   * 检查用户是否已经查看过该股票(内存缓存)
   *
   * @param {string} userId - 用户ID
   * @param {string} symbol - 股票代码
   * @returns {boolean}
   */
  _hasUserViewed(userId, symbol) {
    const userStocks = this.userSessions.get(userId);
    return userStocks ? userStocks.has(symbol) : false;
  }

  /**
   * 标记用户已查看该股票
   *
   * @param {string} userId - 用户ID
   * @param {string} symbol - 股票代码
   */
  _markUserViewed(userId, symbol) {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId).add(symbol);
  }

  /**
   * 清除用户会话缓存(用于用户断开连接时)
   *
   * @param {string} userId - 用户ID
   */
  clearUserSession(userId) {
    this.userSessions.delete(userId);
  }

  /**
   * 清除所有会话缓存
   */
  clearAllSessions() {
    this.userSessions.clear();
  }
}

module.exports = { StockActivityTracker };
