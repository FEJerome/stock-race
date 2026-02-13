/**
 * [T-018] WeightedHotStocksService
 * 加权热股票服务
 *
 * 职责:
 * - 多因子权重计算（用户查看数、交易活跃度等）
 * - 热股票列表生成和排序
 * - Redis缓存管理
 * - 数据收集和集成
 */

class WeightedHotStocksService {
  constructor(redis, marketDataClient) {
    this.redis = redis;
    this.marketDataClient = marketDataClient;
    this.cacheKey = 'hot:stocks:weighted';
    this.cacheTTL = 60; // 缓存60秒

    // 权重计算配置
    this.weightConfig = {
      userCount: { max: 1000, weight: 40 },    // 查看用户数，40%
      viewCount: { max: 5000, weight: 30 },    // 查看次数，30%
      tradeVolume: { max: 1000000, weight: 20 }, // 交易量，20%
      favoriteCount: { max: 500, weight: 10 }  // 收藏数，10%
    };
  }

  /**
   * 计算股票权重
   * @param {Object} stockData - 股票数据
   * @param {number} stockData.userCount - 当前查看用户数
   * @param {number} stockData.viewCount - 近期查看次数
   * @param {number} stockData.tradeVolume - 交易量
   * @param {number} stockData.favoriteCount - 收藏用户数
   * @returns {number} 权重值 (0-100)
   */
  calculateWeight(stockData) {
    const userScore = this.normalizeWeightFactor(
      stockData.userCount || 0,
      this.weightConfig.userCount.max,
      this.weightConfig.userCount.weight
    );

    const viewScore = this.normalizeWeightFactor(
      stockData.viewCount || 0,
      this.weightConfig.viewCount.max,
      this.weightConfig.viewCount.weight
    );

    const tradeScore = this.normalizeWeightFactor(
      stockData.tradeVolume || 0,
      this.weightConfig.tradeVolume.max,
      this.weightConfig.tradeVolume.weight
    );

    const favoriteScore = this.normalizeWeightFactor(
      stockData.favoriteCount || 0,
      this.weightConfig.favoriteCount.max,
      this.weightConfig.favoriteCount.weight
    );

    const totalWeight = userScore + viewScore + tradeScore + favoriteScore;
    return Math.round(totalWeight * 10) / 10; // 保留1位小数
  }

  /**
   * 归一化权重因子
   * @param {number} value - 实际值
   * @param {number} max - 最大值
   * @param {number} weight - 权重占比
   * @returns {number} 归一化后的得分
   */
  normalizeWeightFactor(value, max, weight) {
    if (value <= 0) return 0;
    const normalized = Math.min(value / max, 1.0);
    return normalized * weight;
  }

  /**
   * 计算交易活跃度得分
   * @param {number} volume - 交易量
   * @returns {number} 得分 (0-20)
   */
  calculateTradeScore(volume) {
    return this.normalizeWeightFactor(
      volume,
      this.weightConfig.tradeVolume.max,
      this.weightConfig.tradeVolume.weight
    );
  }

  /**
   * 收集股票数据
   * 从多个数据源收集数据用于权重计算
   * @returns {Promise<Object>} 股票数据映射 { symbol: data }
   */
  async collectStockData() {
    const [
      activityData,
      favoriteData,
      volumeData
    ] = await Promise.all([
      this.getUserActivityData(),
      this.getUserFavoriteData(),
      this.getTradeVolumeData()
    ]);

    // 合并所有数据
    const allSymbols = new Set([
      ...Object.keys(activityData),
      ...Object.keys(favoriteData),
      ...Object.keys(volumeData)
    ]);

    const stockDataMap = {};
    for (const symbol of allSymbols) {
      stockDataMap[symbol] = {
        userCount: activityData[symbol]?.userCount || 0,
        viewCount: activityData[symbol]?.viewCount || 0,
        favoriteCount: favoriteData[symbol] || 0,
        tradeVolume: volumeData[symbol] || 0
      };
    }

    return stockDataMap;
  }

  /**
   * 获取用户活动数据
   * 从Redis或活动追踪服务获取
   * @returns {Promise<Object>} 用户活动数据
   */
  async getUserActivityData() {
    // TODO: 从用户活动追踪服务获取实时数据
    // 临时返回模拟数据，实际实现时需要替换
    return {
      '000001.SZ': { userCount: 120, viewCount: 450 },
      '600519.SH': { userCount: 98, viewCount: 380 },
      '000858.SZ': { userCount: 60, viewCount: 200 }
    };
  }

  /**
   * 获取用户收藏数据
   * @returns {Promise<Object>} 收藏数据 { symbol: count }
   */
  async getUserFavoriteData() {
    // TODO: 从用户数据库获取收藏数据
    // 临时返回模拟数据
    return {
      '000001.SZ': 230,
      '600519.SH': 180,
      '000858.SZ': 100
    };
  }

  /**
   * 获取交易量数据
   * @returns {Promise<Object>} 交易量数据 { symbol: volume }
   */
  async getTradeVolumeData() {
    try {
      // 尝试从Market Data Service获取
      if (this.marketDataClient && this.marketDataClient.getStockVolumes) {
        return await this.marketDataClient.getStockVolumes();
      }
    } catch (error) {
      console.error('Failed to get trade volume data:', error);
    }

    // 返回默认数据
    return {
      '000001.SZ': 1000000,
      '600519.SH': 800000,
      '000858.SZ': 600000
    };
  }

  /**
   * 生成加权热股票列表
   * @param {Object} stockDataMap - 股票数据映射
   * @returns {Promise<Array>} 按权重排序的热股票列表
   */
  async generateWeightedHotStocks(stockDataMap) {
    if (!stockDataMap || Object.keys(stockDataMap).length === 0) {
      return [];
    }

    const weightedStocks = [];

    for (const [symbol, data] of Object.entries(stockDataMap)) {
      const weight = this.calculateWeight(data);

      weightedStocks.push({
        symbol,
        weight,
        factors: {
          userCount: data.userCount,
          viewCount: data.viewCount,
          tradeScore: this.calculateTradeScore(data.tradeVolume),
          favoriteCount: data.favoriteCount
        },
        updatedAt: new Date().toISOString()
      });
    }

    // 按权重降序排序
    weightedStocks.sort((a, b) => b.weight - a.weight);

    return weightedStocks;
  }

  /**
   * 更新热股票缓存
   * @param {Array} hotStocks - 热股票列表
   */
  async updateHotStocksCache(hotStocks) {
    const cacheData = {
      stocks: hotStocks,
      totalCount: hotStocks.length,
      updatedAt: new Date().toISOString()
    };

    await this.redis.setEx(
      this.cacheKey,
      this.cacheTTL,
      JSON.stringify(cacheData)
    );

    console.log(`[HotStocks] Cache updated with ${hotStocks.length} stocks`);
  }

  /**
   * 获取加权热股票列表
   * @param {Object} options - 选项
   * @param {number} options.limit - 返回数量限制
   * @param {number} options.minWeight - 最小权重过滤
   * @returns {Promise<Object>} 响应对象
   */
  async getWeightedHotStocks(options = {}) {
    const { limit = 50, minWeight = 0 } = options;

    try {
      // 从缓存获取
      const cached = await this.redis.get(this.cacheKey);

      if (!cached) {
        return {
          success: false,
          error: {
            code: 'CACHE_NOT_READY',
            message: '热股票列表正在初始化，请稍后重试'
          }
        };
      }

      const cacheData = JSON.parse(cached);
      let stocks = cacheData.stocks || [];

      // 应用过滤
      if (minWeight > 0) {
        stocks = stocks.filter(s => s.weight >= minWeight);
      }

      // 应用限制
      if (limit > 0 && stocks.length > limit) {
        stocks = stocks.slice(0, limit);
      }

      // 计算下次更新时间
      const updatedAt = new Date(cacheData.updatedAt);
      const nextUpdate = new Date(updatedAt.getTime() + this.cacheTTL * 1000);
      const nextUpdateIn = Math.max(0, Math.floor((nextUpdate - Date.now()) / 1000));

      return {
        success: true,
        data: {
          stocks,
          totalCount: stocks.length,
          updatedAt: cacheData.updatedAt,
          nextUpdateIn
        }
      };
    } catch (error) {
      console.error('[HotStocks] Failed to get weighted hot stocks:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取热股票列表失败'
        }
      };
    }
  }

  /**
   * 执行完整更新流程
   * 收集数据 -> 计算权重 -> 更新缓存
   */
  async performFullUpdate() {
    try {
      console.log('[HotStocks] Starting full update...');

      // 1. 收集数据
      const stockDataMap = await this.collectStockData();
      console.log(`[HotStocks] Collected data for ${Object.keys(stockDataMap).length} stocks`);

      // 2. 生成加权列表
      const weightedStocks = await this.generateWeightedHotStocks(stockDataMap);
      console.log(`[HotStocks] Generated weighted list with ${weightedStocks.length} stocks`);

      // 3. 更新缓存
      await this.updateHotStocksCache(weightedStocks);

      console.log('[HotStocks] Full update completed');
      return {
        success: true,
        count: weightedStocks.length,
        topStock: weightedStocks[0] || null
      };
    } catch (error) {
      console.error('[HotStocks] Full update failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取缓存状态
   * @returns {Promise<Object>} 缓存状态
   */
  async getCacheStatus() {
    try {
      const cached = await this.redis.get(this.cacheKey);

      if (!cached) {
        return {
          isReady: false,
          lastUpdate: null,
          nextUpdateIn: null
        };
      }

      const cacheData = JSON.parse(cached);
      const updatedAt = new Date(cacheData.updatedAt);
      const nextUpdate = new Date(updatedAt.getTime() + this.cacheTTL * 1000);
      const nextUpdateIn = Math.max(0, Math.floor((nextUpdate - Date.now()) / 1000));

      return {
        isReady: true,
        lastUpdate: cacheData.updatedAt,
        nextUpdateIn,
        stockCount: cacheData.totalCount
      };
    } catch (error) {
      return {
        isReady: false,
        error: error.message
      };
    }
  }

  /**
   * 启动定时更新任务
   * @param {number} interval - 更新间隔（毫秒），默认30秒
   */
  startScheduledUpdates(interval = 30000) {
    console.log(`[HotStocks] Starting scheduled updates every ${interval}ms`);

    // 立即执行一次
    this.performFullUpdate();

    // 定时执行
    this.updateInterval = setInterval(() => {
      this.performFullUpdate();
    }, interval);

    return this.updateInterval;
  }

  /**
   * 停止定时更新任务
   */
  stopScheduledUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('[HotStocks] Scheduled updates stopped');
    }
  }
}

export default WeightedHotStocksService;
