/**
 * [T-012] PortfolioChangePublisher
 * 持仓变更事件发布器
 *
 * 职责:
 * - 监听AI账户持仓和关注列表变更
 * - 发布事件到Redis Pub/Sub
 * - 写入Redis Stream供热股票聚合器消费
 */

class PortfolioChangePublisher {
  constructor(redis) {
    this.redis = redis;
    this.batchQueue = [];
    this.batchTimer = null;
  }

  /**
   * 发布持仓变更事件到Pub/Sub
   * @param {string} accountId - AI账户ID
   * @param {Object} changes - 变更内容 { addedStocks: [], removedStocks: [], timestamp }
   */
  async publishPortfolioChange(accountId, changes) {
    // 如果没有变更，不发布事件
    if (!changes.addedStocks?.length && !changes.removedStocks?.length) {
      return;
    }

    const message = {
      eventType: 'portfolio_change',
      accountId,
      addedStocks: changes.addedStocks || [],
      removedStocks: changes.removedStocks || [],
      timestamp: changes.timestamp || Date.now()
    };

    try {
      await this.redis.publish('account:portfolio:changed', JSON.stringify(message));
    } catch (error) {
      const err = new Error(`Failed to publish portfolio change: ${error.message}`);
      err.code = 'EVENT_PUBLISH_FAILED';
      throw err;
    }
  }

  /**
   * 发布关注列表变更事件
   * @param {string} accountId - AI账户ID
   * @param {Object} changes - 变更内容
   */
  async publishWatchlistChange(accountId, changes) {
    if (!changes.addedStocks?.length && !changes.removedStocks?.length) {
      return;
    }

    const message = {
      eventType: 'watchlist_change',
      accountId,
      addedStocks: changes.addedStocks || [],
      removedStocks: changes.removedStocks || [],
      timestamp: changes.timestamp || Date.now()
    };

    try {
      await this.redis.publish('account:watchlist:changed', JSON.stringify(message));
    } catch (error) {
      const err = new Error(`Failed to publish watchlist change: ${error.message}`);
      err.code = 'EVENT_PUBLISH_FAILED';
      throw err;
    }
  }

  /**
   * 将事件写入Redis Stream
   * @param {string} accountId - AI账户ID
   * @param {Object} changes - 变更内容
   */
  async publishToStream(accountId, changes) {
    const timestamp = changes.timestamp || Date.now();

    // 分别处理增加和移除的股票
    const promises = [];

    if (changes.addedStocks?.length > 0) {
      promises.push(
        this.redis.xadd(
          'hot-stocks-stream',
          '*',
          'action', 'increment',
          'stocks', JSON.stringify(changes.addedStocks),
          'source', accountId,
          'timestamp', timestamp.toString()
        )
      );
    }

    if (changes.removedStocks?.length > 0) {
      promises.push(
        this.redis.xadd(
          'hot-stocks-stream',
          '*',
          'action', 'decrement',
          'stocks', JSON.stringify(changes.removedStocks),
          'source', accountId,
          'timestamp', timestamp.toString()
        )
      );
    }

    if (promises.length > 0) {
      try {
        await Promise.all(promises);
      } catch (error) {
        throw new Error(`Failed to write to stream: ${error.message}`);
      }
    }
  }

  /**
   * 批量发布事件（带聚合）
   * @param {Array} events - 事件数组
   * @param {Object} options - 配置选项
   */
  async batchPublish(events, options = {}) {
    const { maxBatchSize = 100 } = options;

    // 分批处理
    for (let i = 0; i < events.length; i += maxBatchSize) {
      const batch = events.slice(i, i + maxBatchSize);
      await this._processBatch(batch);
    }
  }

  /**
   * 处理一批事件
   * @private
   */
  async _processBatch(batch) {
    const promises = batch.map(event =>
      this.publishToStream(event.accountId, {
        addedStocks: event.addedStocks || [],
        removedStocks: event.removedStocks || [],
        timestamp: event.timestamp || Date.now()
      })
    );

    await Promise.all(promises);
  }

  /**
   * 启用批量模式（自动聚合短时间内的多个事件）
   * @param {number} intervalMs - 聚合间隔（毫秒）
   */
  enableBatchMode(intervalMs = 1000) {
    this.batchTimer = setInterval(() => {
      if (this.batchQueue.length > 0) {
        const batch = [...this.batchQueue];
        this.batchQueue = [];
        this.batchPublish(batch);
      }
    }, intervalMs);
  }

  /**
   * 禁用批量模式
   */
  disableBatchMode() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * 队列事件到批量缓冲区
   * @param {string} accountId - AI账户ID
   * @param {Object} changes - 变更内容
   */
  queueEvent(accountId, changes) {
    this.batchQueue.push({
      accountId,
      ...changes,
      timestamp: Date.now()
    });
  }
}

module.exports = PortfolioChangePublisher;
