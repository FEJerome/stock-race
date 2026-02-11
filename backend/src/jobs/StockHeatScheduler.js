import { eventBus } from '../events/EventBus.js';
import { aiAccountRepository } from '../models/index.js';
import { portfolioRepository } from '../models/index.js';
import { watchlistRepository } from '../models/index.js';

/**
 * 热股票列表生成器错误
 */
export class StockHeatSchedulerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StockHeatSchedulerError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 热股票列表生成器配置
 */
const DEFAULT_CONFIG = {
  // 调度间隔（毫秒）- 默认1分钟
  intervalMs: 60 * 1000,
  // 最大股票数量
  maxStocks: 250,
  // 最小关注数阈值（只有被至少N个账户关注的股票才纳入）
  minAttentionThreshold: 1,
  // 最大持仓数量（防止单个账户持仓过多影响结果）
  maxPositionsPerAccount: 50,
  // Redis发布频道
  publishChannel: 'data-service:hot-stocks',
  // 性能监控
  enableMetrics: true,
  // 批处理大小（用于分批查询）
  batchSize: 100
};

/**
 * 热股票列表生成器
 * 定时任务：查询活跃AI账户的持仓和关注列表，生成热股票列表推送至market-data-service
 */
export class StockHeatScheduler {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isRunning = false;
    this.timer = null;
    this.lastRunTime = null;
    this.metrics = {
      totalRuns: 0,
      totalAccounts: 0,
      totalStocks: 0,
      avgExecutionTimeMs: 0,
      errors: []
    };
  }

  /**
   * 启动调度器
   */
  start() {
    if (this.isRunning) {
      console.warn('[StockHeatScheduler] 调度器已在运行中');
      return;
    }

    console.log(`[StockHeatScheduler] 启动调度器，间隔: ${this.config.intervalMs}ms`);
    this.isRunning = true;

    // 立即执行一次
    this.execute();

    // 设置定时器
    this.timer = setInterval(() => {
      this.execute();
    }, this.config.intervalMs);
  }

  /**
   * 停止调度器
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('[StockHeatScheduler] 停止调度器');
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 执行热股票列表生成
   */
  async execute() {
    const startTime = Date.now();
    console.log('[StockHeatScheduler] 开始生成热股票列表...');

    try {
      // 1. 获取活跃账户
      const activeAccounts = await this.getActiveAccounts();
      console.log(`[StockHeatScheduler] 活跃账户数: ${activeAccounts.length}`);

      if (activeAccounts.length === 0) {
        console.log('[StockHeatScheduler] 没有活跃账户，跳过本次执行');
        return;
      }

      // 2. 收集所有股票（持仓+关注）
      const stockHeatMap = await this.collectStockHeat(activeAccounts);

      // 3. 生成热股票列表
      const hotStocks = this.generateHotStocksList(stockHeatMap);

      // 4. 发布到Redis
      await this.publishHotStocks(hotStocks, activeAccounts.length);

      // 5. 更新指标
      this.updateMetrics(startTime, activeAccounts.length, hotStocks.length);

      console.log(`[StockHeatScheduler] 热股票列表生成完成: ${hotStocks.length} 只股票`);
    } catch (error) {
      console.error('[StockHeatScheduler] 执行失败:', error);
      this.metrics.errors.push({
        timestamp: new Date().toISOString(),
        error: error.message
      });

      // 只保留最近100个错误
      if (this.metrics.errors.length > 100) {
        this.metrics.errors = this.metrics.errors.slice(-100);
      }
    }
  }

  /**
   * 获取活跃AI账户
   * @returns {Promise<Array>}
   */
  async getActiveAccounts() {
    try {
      // 使用Prisma直接查询活跃账户
      const accounts = await aiAccountRepository.prisma.aIAccount.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          userId: true,
          name: true
        }
      });

      return accounts;
    } catch (error) {
      throw new StockHeatSchedulerError(
        'FETCH_ACCOUNTS_FAILED',
        '获取活跃账户失败',
        { originalError: error.message }
      );
    }
  }

  /**
   * 收集股票热度数据
   * @param {Array} accounts - 活跃账户列表
   * @returns {Promise<Map<string, Object>>} 股票热度映射
   */
  async collectStockHeat(accounts) {
    const stockHeatMap = new Map();
    const accountIds = accounts.map(a => a.id);

    // 分批处理账户以避免内存问题
    const batches = this.chunkArray(accountIds, this.config.batchSize);

    for (const batch of batches) {
      // 并行获取持仓和关注列表
      const [positions, watchlists] = await Promise.all([
        this.getPositionsForAccounts(batch),
        this.getWatchlistsForAccounts(accounts.filter(a => batch.includes(a.id)))
      ]);

      // 统计持仓热度
      for (const position of positions) {
        if (!position.stock?.symbol) continue;

        const symbol = position.stock.symbol;
        if (!stockHeatMap.has(symbol)) {
          stockHeatMap.set(symbol, {
            symbol,
            positionCount: 0,
            watchlistCount: 0,
            totalAccounts: new Set(),
            totalShares: 0
          });
        }

        const heat = stockHeatMap.get(symbol);
        heat.positionCount++;
        heat.totalAccounts.add(position.accountId);
        heat.totalShares += position.quantity || 0;
      }

      // 统计关注列表热度
      for (const watchlist of watchlists) {
        if (!watchlist.stock?.symbol) continue;

        const symbol = watchlist.stock.symbol;
        if (!stockHeatMap.has(symbol)) {
          stockHeatMap.set(symbol, {
            symbol,
            positionCount: 0,
            watchlistCount: 0,
            totalAccounts: new Set(),
            totalShares: 0
          });
        }

        const heat = stockHeatMap.get(symbol);
        heat.watchlistCount++;
        heat.totalAccounts.add(watchlist.userId);
      }
    }

    return stockHeatMap;
  }

  /**
   * 获取指定账户的持仓
   * @private
   */
  async getPositionsForAccounts(accountIds) {
    try {
      const positions = await portfolioRepository.prisma.portfolio.findMany({
        where: {
          accountId: { in: accountIds },
          quantity: { gt: 0 }
        },
        select: {
          accountId: true,
          quantity: true,
          stock: {
            select: {
              symbol: true,
              name: true
            }
          }
        }
      });

      return positions;
    } catch (error) {
      console.error('[StockHeatScheduler] 获取持仓失败:', error);
      return [];
    }
  }

  /**
   * 获取指定用户的关注列表
   * @private
   */
  async getWatchlistsForAccounts(accounts) {
    try {
      const userIds = accounts.map(a => a.userId);

      const watchlists = await watchlistRepository.prisma.watchlist.findMany({
        where: {
          userId: { in: userIds }
        },
        select: {
          userId: true,
          stock: {
            select: {
              symbol: true,
              name: true
            }
          }
        }
      });

      return watchlists;
    } catch (error) {
      console.error('[StockHeatScheduler] 获取关注列表失败:', error);
      return [];
    }
  }

  /**
   * 生成热股票列表
   * @param {Map} stockHeatMap - 股票热度映射
   * @returns {Array<string>} 热股票代码列表
   */
  generateHotStocksList(stockHeatMap) {
    // 计算热度分数并排序
    const stocksWithScore = Array.from(stockHeatMap.values())
      .map(stock => ({
        ...stock,
        // 热度分数 = 持仓数 * 2 + 关注数
        heatScore: stock.positionCount * 2 + stock.watchlistCount,
        // 总账户数（去重）
        uniqueAccounts: stock.totalAccounts.size
      }))
      .filter(stock => {
        // 过滤掉关注度太低的股票
        return stock.heatScore >= this.config.minAttentionThreshold;
      })
      .sort((a, b) => {
        // 按热度分数降序
        if (b.heatScore !== a.heatScore) {
          return b.heatScore - a.heatScore;
        }
        // 热度相同则按持仓数降序
        return b.positionCount - a.positionCount;
      });

    // 只取前N个
    return stocksWithScore
      .slice(0, this.config.maxStocks)
      .map(s => s.symbol);
  }

  /**
   * 发布热股票列表到Redis
   * @param {Array<string>} stocks - 热股票列表
   * @param {number} accountCount - 活跃账户数
   */
  async publishHotStocks(stocks, accountCount) {
    const message = {
      stocks,
      count: stocks.length,
      accounts: accountCount,
      timestamp: Date.now(),
      source: 'backend-scheduler',
      version: '1.0'
    };

    try {
      await eventBus.publish(this.config.publishChannel, message);
      console.log(`[StockHeatScheduler] 已发布热股票列表到 ${this.config.publishChannel}`);
    } catch (error) {
      throw new StockHeatSchedulerError(
        'PUBLISH_FAILED',
        '发布热股票列表失败',
        { originalError: error.message }
      );
    }
  }

  /**
   * 更新性能指标
   * @private
   */
  updateMetrics(startTime, accountCount, stockCount) {
    const executionTime = Date.now() - startTime;

    this.metrics.totalRuns++;
    this.metrics.totalAccounts = accountCount;
    this.metrics.totalStocks = stockCount;

    // 计算平均执行时间
    const prevAvg = this.metrics.avgExecutionTimeMs;
    const count = this.metrics.totalRuns;
    this.metrics.avgExecutionTimeMs = (prevAvg * (count - 1) + executionTime) / count;

    this.lastRunTime = new Date().toISOString();

    if (this.config.enableMetrics) {
      console.log(`[StockHeatScheduler] 执行时间: ${executionTime}ms, 平均: ${Math.round(this.metrics.avgExecutionTimeMs)}ms`);
    }
  }

  /**
   * 将数组分块
   * @private
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 获取调度器状态
   * @returns {Object}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      config: {
        intervalMs: this.config.intervalMs,
        maxStocks: this.config.maxStocks,
        publishChannel: this.config.publishChannel
      },
      metrics: { ...this.metrics }
    };
  }

  /**
   * 手动触发执行
   */
  async triggerManual() {
    console.log('[StockHeatScheduler] 手动触发执行');
    await this.execute();
  }

  /**
   * 重置指标
   */
  resetMetrics() {
    this.metrics = {
      totalRuns: 0,
      totalAccounts: 0,
      totalStocks: 0,
      avgExecutionTimeMs: 0,
      errors: []
    };
    console.log('[StockHeatScheduler] 指标已重置');
  }
}

// 创建单例实例
export const stockHeatScheduler = new StockHeatScheduler();

export default StockHeatScheduler;
