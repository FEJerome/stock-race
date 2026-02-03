import { BaseRepository } from './BaseRepository.js';

export class TradeRepository extends BaseRepository {
  constructor() {
    super();
    this.modelName = 'trade';
  }

  /**
   * 创建交易订单
   * @param {Object} tradeData - 交易数据
   * @returns {Promise<Object>}
   */
  async createTrade(tradeData) {
    return this.create(tradeData);
  }

  /**
   * 执行交易
   * @param {number} tradeId - 交易ID
   * @param {Object} executionData - 执行数据
   * @returns {Promise<Object>}
   */
  async executeTrade(tradeId, executionData = {}) {
    return this.update(tradeId, {
      status: 'executed',
      executedAt: new Date(),
      ...executionData
    });
  }

  /**
   * 取消交易
   * @param {number} tradeId - 交易ID
   * @param {string} reason - 取消原因
   * @returns {Promise<Object>}
   */
  async cancelTrade(tradeId, reason = '用户取消') {
    return this.update(tradeId, {
      status: 'cancelled',
      cancelledAt: new Date(),
      reason
    });
  }

  /**
   * 获取账户的交易记录
   * @param {number} accountId - 账户ID
   * @param {Object} filters - 过滤器
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>}
   */
  async getAccountTrades(accountId, filters = {}, pagination = { page: 1, limit: 20 }) {
    const where = {
      accountId,
      ...filters
    };

    return this.paginate({
      ...pagination,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        stock: true,
        account: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }

  /**
   * 获取股票的交易记录
   * @param {number} stockId - 股票ID
   * @param {Object} filters - 过滤器
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>}
   */
  async getStockTrades(stockId, filters = {}, pagination = { page: 1, limit: 20 }) {
    const where = {
      stockId,
      ...filters
    };

    return this.paginate({
      ...pagination,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        account: {
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * 获取待执行的交易
   * @param {Object} filters - 过滤器
   * @returns {Promise<Array>}
   */
  async getPendingTrades(filters = {}) {
    const where = {
      status: 'pending',
      ...filters
    };

    return this.findMany(
      where,
      { createdAt: 'asc' },
      100,
      {
        stock: true,
        account: true
      }
    );
  }

  /**
   * 获取今日交易统计
   * @param {number} accountId - 账户ID
   * @returns {Promise<Object>}
   */
  async getTodayTradeStats(accountId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where = {
      accountId,
      executedAt: {
        gte: today,
        lt: tomorrow
      },
      status: 'executed'
    };

    const trades = await this.findMany(where);

    const stats = {
      totalTrades: trades.length,
      buyTrades: 0,
      sellTrades: 0,
      totalVolume: 0,
      totalFees: 0,
      netAmount: 0
    };

    trades.forEach(trade => {
      if (trade.tradeType === 'buy') {
        stats.buyTrades++;
      } else {
        stats.sellTrades++;
      }

      stats.totalVolume += parseFloat(trade.amount);
      stats.totalFees += parseFloat(trade.fee);
      stats.netAmount += parseFloat(trade.netAmount);
    });

    return stats;
  }

  /**
   * 获取交易绩效统计
   * @param {number} accountId - 账户ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async getTradePerformance(accountId, options = {}) {
    const { startDate, endDate } = options;

    const where = {
      accountId,
      status: 'executed'
    };

    if (startDate) {
      where.executedAt = { ...where.executedAt, gte: startDate };
    }
    if (endDate) {
      where.executedAt = { ...where.executedAt, lte: endDate };
    }

    const trades = await this.findMany(where, { executedAt: 'asc' }, undefined, {
      stock: true
    });

    // 计算交易绩效
    const performance = {
      totalTrades: trades.length,
      profitableTrades: 0,
      losingTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      maxProfit: 0,
      maxLoss: 0,
      winRate: 0,
      profitFactor: 0,
      averageProfit: 0,
      averageLoss: 0
    };

    // 这里需要根据实际交易逻辑计算盈亏
    // 简化处理：假设买入后卖出有盈利
    const buyTrades = trades.filter(t => t.tradeType === 'buy');
    const sellTrades = trades.filter(t => t.tradeType === 'sell');

    // 配对买入和卖出交易计算盈亏
    // 实际实现需要更复杂的逻辑
    performance.profitableTrades = sellTrades.length;
    performance.losingTrades = 0; // 简化处理

    if (trades.length > 0) {
      performance.winRate = (performance.profitableTrades / trades.length) * 100;
    }

    if (performance.losingTrades > 0) {
      performance.profitFactor = Math.abs(performance.totalProfit / performance.totalLoss);
    } else if (performance.totalProfit > 0) {
      performance.profitFactor = Infinity;
    }

    return performance;
  }

  /**
   * 批量更新交易状态
   * @param {Array<number>} tradeIds - 交易ID数组
   * @param {string} status - 状态
   * @param {Object} updateData - 更新数据
   * @returns {Promise<Object>}
   */
  async batchUpdateStatus(tradeIds, status, updateData = {}) {
    return this.updateMany(
      { id: { in: tradeIds } },
      { status, ...updateData }
    );
  }

  /**
   * 获取交易趋势统计
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getTradeTrendStats(options = {}) {
    const { days = 30, accountId } = options;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where = {
      executedAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'executed'
    };

    if (accountId) {
      where.accountId = accountId;
    }

    // 按日期分组统计
    const dailyStats = await this.prisma.$queryRaw`
      SELECT
        DATE(executed_at) as date,
        COUNT(*) as trade_count,
        SUM(CASE WHEN trade_type = 'buy' THEN 1 ELSE 0 END) as buy_count,
        SUM(CASE WHEN trade_type = 'sell' THEN 1 ELSE 0 END) as sell_count,
        SUM(amount) as total_volume,
        AVG(price) as avg_price
      FROM "Trade"
      WHERE executed_at >= ${startDate}
        AND executed_at <= ${endDate}
        AND status = 'executed'
        ${accountId ? Prisma.sql`AND account_id = ${accountId}` : Prisma.sql``}
      GROUP BY DATE(executed_at)
      ORDER BY date ASC
    `;

    return dailyStats;
  }

  /**
   * 获取热门交易股票
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getHotTradingStocks(options = {}) {
    const { days = 7, limit = 10 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const hotStocks = await this.prisma.trade.groupBy({
      by: ['stockId'],
      where: {
        executedAt: {
          gte: startDate
        },
        status: 'executed'
      },
      _count: {
        _all: true
      },
      _sum: {
        quantity: true,
        amount: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: limit
    });

    // 获取股票详情
    const stocksWithDetails = await Promise.all(
      hotStocks.map(async (stat) => {
        const stock = await this.prisma.stock.findUnique({
          where: { id: stat.stockId }
        });

        return {
          stock,
          tradeCount: stat._count._all,
          totalQuantity: stat._sum.quantity,
          totalAmount: stat._sum.amount
        };
      })
    );

    return stocksWithDetails;
  }

  /**
   * 验证交易是否可执行
   * @param {Object} tradeData - 交易数据
   * @returns {Promise<{valid: boolean, errors: Array<string>}>}
   */
  async validateTrade(tradeData) {
    const errors = [];

    // 检查账户是否存在且有足够余额
    const account = await this.prisma.aIAccount.findUnique({
      where: { id: tradeData.accountId }
    });

    if (!account) {
      errors.push('账户不存在');
    } else if (tradeData.tradeType === 'buy') {
      const requiredAmount = parseFloat(tradeData.price) * tradeData.quantity;
      if (parseFloat(account.currentBalance) < requiredAmount) {
        errors.push('账户余额不足');
      }
    }

    // 检查股票是否存在且可交易
    const stock = await this.prisma.stock.findUnique({
      where: { id: tradeData.stockId }
    });

    if (!stock) {
      errors.push('股票不存在');
    } else if (stock.status !== 'normal') {
      errors.push('股票不可交易');
    }

    // 检查交易数量是否有效
    if (tradeData.quantity <= 0) {
      errors.push('交易数量必须大于0');
    }

    // 检查价格是否有效
    if (tradeData.price <= 0) {
      errors.push('交易价格必须大于0');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}