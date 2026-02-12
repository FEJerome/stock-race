/**
 * [T-012] HotStocksAggregator
 * 热股票聚合服务
 *
 * 职责:
 * - 维护热股票计数器（Redis Sorted Set）
 * - 处理Stream事件增量更新
 * - 生成热股票列表
 * - 定时全量校准
 */

class HotStocksAggregator {
  constructor(redis) {
    this.redis = redis;
    this.key = 'hot-stocks:realtime';
    this.cache = new Map();
  }

  /**
   * 增加股票热度
   * @param {string} symbol - 股票代码
   * @param {number} increment - 增量（可为负数）
   * @returns {Promise<number>} 更新后的分数
   */
  async incrementStockHeat(symbol, increment = 1) {
    const newScore = await this.redis.zincrby(this.key, increment, symbol);

    // 如果热度降到0或以下，从列表中移除
    if (parseFloat(newScore) <= 0) {
      await this.redis.zrem(this.key, symbol);
      return 0;
    }

    return parseFloat(newScore);
  }

  /**
   * 批量增加股票热度
   * @param {Array<string>} symbols - 股票代码数组
   * @param {number} increment - 增量
   */
  async incrementStocksHeat(symbols, increment = 1) {
    const pipeline = this.redis.pipeline();

    for (const symbol of symbols) {
      pipeline.zincrby(this.key, increment, symbol);
    }

    await pipeline.exec();
  }

  /**
   * 获取热股票列表
   * @param {number} count - 获取数量
   * @param {Object} options - 选项 { withScores: boolean }
   * @returns {Promise<Array>} 热股票列表
   */
  async getHotStocks(count = 100, options = {}) {
    const { withScores = true } = options;

    let results;
    if (withScores) {
      results = await this.redis.zrevrange(this.key, 0, count - 1, 'WITHSCORES');

      // 解析为对象数组
      const stocks = [];
      for (let i = 0; i < results.length; i += 2) {
        stocks.push({
          symbol: results[i],
          heat: parseFloat(results[i + 1])
        });
      }
      return stocks;
    } else {
      results = await this.redis.zrevrange(this.key, 0, count - 1);
      return results;
    }
  }

  /**
   * 获取指定股票的热度
   * @param {string} symbol - 股票代码
   * @returns {Promise<number>} 热度分数
   */
  async getStockHeat(symbol) {
    const score = await this.redis.zscore(this.key, symbol);
    return score ? parseFloat(score) : 0;
  }

  /**
   * 获取统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    const [totalStocks, topStockWithScore] = await Promise.all([
      this.redis.zcard(this.key),
      this.redis.zrevrange(this.key, 0, 0, 'WITHSCORES')
    ]);

    const stats = {
      totalStocks: parseInt(totalStocks, 10)
    };

    if (topStockWithScore && topStockWithScore.length >= 2) {
      stats.topStock = {
        symbol: topStockWithScore[0],
        heat: parseFloat(topStockWithScore[1])
      };
    }

    return stats;
  }

  /**
   * 处理Stream事件
   * @param {Object} event - Stream事件
   */
  async processStreamEvent(event) {
    try {
      const action = event.action;
      const stocks = JSON.parse(event.stocks || '[]');

      if (!Array.isArray(stocks) || stocks.length === 0) {
        return;
      }

      if (action === 'increment') {
        await this.incrementStocksHeat(stocks, 1);
      } else if (action === 'decrement') {
        await this.incrementStocksHeat(stocks, -1);
      }
    } catch (error) {
      console.error('Failed to process stream event:', error);
    }
  }

  /**
   * 根据全量数据校准计数器
   * @param {Object} fullData - 全量数据 { symbol: heat, ... }
   */
  async calibrate(fullData) {
    // 获取当前所有股票
    const currentStocks = await this.redis.zrange(this.key, 0, -1);
    const currentSet = new Set(currentStocks);
    const fullSet = new Set(Object.keys(fullData));

    const pipeline = this.redis.pipeline();

    // 更新或添加股票
    for (const [symbol, heat] of Object.entries(fullData)) {
      if (heat > 0) {
        pipeline.zadd(this.key, heat, symbol);
      }
    }

    // 移除已不在列表中的股票
    for (const symbol of currentSet) {
      if (!fullSet.has(symbol)) {
        pipeline.zrem(this.key, symbol);
      }
    }

    await pipeline.exec();
  }

  /**
   * 生成热股票消息（用于发布到market-data-service）
   * @param {number} accountCount - 活跃账户数
   * @returns {Promise<Object>} 热股票消息
   */
  async generateHotStocksMessage(accountCount = 0) {
    const [stocks, stats] = await Promise.all([
      this.getHotStocks(300, { withScores: false }),
      this.getStats()
    ]);

    return {
      stocks,
      count: stats.totalStocks,
      accounts: accountCount,
      timestamp: Date.now(),
      source: 'backend-event-driven'
    };
  }

  /**
   * 清空热股票列表
   */
  async clear() {
    await this.redis.del(this.key);
  }

  /**
   * 启动Stream消费者
   * @param {Function} onMessage - 消息处理回调
   */
  async startStreamConsumer(onMessage) {
    // 这里应该实现Redis Stream消费者逻辑
    // 使用 XREADGROUP 实现消费者组
    const consumerGroup = 'hot-stocks-consumers';
    const consumerName = `consumer-${process.pid}`;

    try {
      // 创建消费者组（如果不存在）
      await this.redis.xgroup('CREATE', 'hot-stocks-stream', consumerGroup, '$', 'MKSTREAM');
    } catch (error) {
      // 消费者组可能已存在，忽略错误
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }

    // 持续读取消息
    const readMessages = async () => {
      try {
        const messages = await this.redis.xreadgroup(
          'GROUP', consumerGroup, consumerName,
          'BLOCK', 5000,
          'STREAMS', 'hot-stocks-stream', '>'
        );

        if (messages && messages[0] && messages[0][1]) {
          for (const [id, fields] of messages[0][1]) {
            const event = this._parseStreamMessage(fields);
            await onMessage(event);
            // 确认消息已处理
            await this.redis.xack('hot-stocks-stream', consumerGroup, id);
          }
        }
      } catch (error) {
        console.error('Stream consumer error:', error);
      }

      // 继续读取
      setImmediate(readMessages);
    };

    readMessages();
  }

  /**
   * 解析Stream消息
   * @private
   */
  _parseStreamMessage(fields) {
    const event = {};
    for (let i = 0; i < fields.length; i += 2) {
      event[fields[i]] = fields[i + 1];
    }
    return event;
  }
}

module.exports = HotStocksAggregator;
