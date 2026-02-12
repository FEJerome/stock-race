import { BaseRepository } from './BaseRepository.js';

export class AIAccountRepository extends BaseRepository {
  constructor() {
    super();
    this.modelName = 'AIAccount';
  }

  /**
   * 获取用户的所有AI账户
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getUserAccounts(userId, options = {}) {
    const { status, includePortfolio = false } = options;

    const where = { userId };
    if (status) {
      where.status = status;
    }

    const include = {};
    if (includePortfolio) {
      include.portfolios = {
        include: {
          stock: true
        }
      };
    }

    return this.findMany(where, { createdAt: 'desc' }, undefined, include);
  }

  /**
   * 创建AI账户
   * @param {Object} accountData - 账户数据
   * @returns {Promise<Object>}
   */
  async createAccount(accountData) {
    return this.create(accountData);
  }

  /**
   * 更新账户余额
   * @param {number} accountId - 账户ID
   * @param {number} amount - 金额变化（正数为增加，负数为减少）
   * @returns {Promise<Object>}
   */
  async updateBalance(accountId, amount) {
    const account = await this.findOne({ id: accountId });

    if (!account) {
      throw new Error('账户不存在');
    }

    const newBalance = parseFloat(account.currentBalance) + amount;

    if (newBalance < 0) {
      throw new Error('余额不足');
    }

    return this.update(accountId, {
      currentBalance: newBalance
    });
  }

  /**
   * 更新账户总价值
   * @param {number} accountId - 账户ID
   * @param {number} totalValue - 总价值
   * @returns {Promise<Object>}
   */
  async updateTotalValue(accountId, totalValue) {
    if (totalValue < 0) {
      throw new Error('总价值不能为负数');
    }

    return this.update(accountId, {
      totalValue
    });
  }

  /**
   * 计算账户总价值（现金 + 持仓市值）
   * @param {number} accountId - 账户ID
   * @returns {Promise<number>}
   */
  async calculateTotalValue(accountId) {
    const account = await this.findOne(
      { id: accountId },
      {
        portfolios: {
          include: {
            stock: true
          }
        }
      }
    );

    if (!account) {
      throw new Error('账户不存在');
    }

    // 计算持仓总市值
    const portfolioValue = account.portfolios.reduce((total, portfolio) => {
      if (portfolio.currentPrice && portfolio.quantity > 0) {
        return total + parseFloat(portfolio.currentPrice) * portfolio.quantity;
      }
      return total;
    }, 0);

    // 总价值 = 现金余额 + 持仓市值
    const totalValue = parseFloat(account.currentBalance) + portfolioValue;

    // 更新数据库中的总价值
    await this.updateTotalValue(accountId, totalValue);

    return totalValue;
  }

  /**
   * 获取账户绩效统计
   * @param {number} accountId - 账户ID
   * @returns {Promise<Object>}
   */
  async getAccountPerformance(accountId) {
    const account = await this.findOne({ id: accountId });

    if (!account) {
      throw new Error('账户不存在');
    }

    // 计算总收益率
    const initialBalance = parseFloat(account.initialBalance);
    const currentTotalValue = parseFloat(account.totalValue);
    const totalReturn = ((currentTotalValue - initialBalance) / initialBalance) * 100;

    // 获取交易统计
    const trades = await this.prisma.trade.findMany({
      where: {
        accountId,
        status: 'executed'
      }
    });

    // 计算胜率
    const profitableTrades = trades.filter(trade => {
      // 这里需要根据实际交易逻辑计算盈亏
      // 简化处理：假设买入后卖出有盈利
      return trade.tradeType === 'sell';
    }).length;

    const winRate = trades.length > 0 ? (profitableTrades / trades.length) * 100 : 0;

    // 计算总交易额
    const totalVolume = trades.reduce((sum, trade) => {
      return sum + parseFloat(trade.amount);
    }, 0);

    return {
      totalReturn,
      winRate,
      totalTrades: trades.length,
      totalVolume,
      currentBalance: parseFloat(account.currentBalance),
      totalValue: currentTotalValue
    };
  }

  /**
   * 更新账户状态
   * @param {number} accountId - 账户ID
   * @param {string} status - 状态
   * @returns {Promise<Object>}
   */
  async updateAccountStatus(accountId, status) {
    return this.update(accountId, { status });
  }

  /**
   * 批量更新账户配置
   * @param {Array<number>} accountIds - 账户ID数组
   * @param {Object} configUpdates - 配置更新
   * @returns {Promise<Object>}
   */
  async batchUpdateConfig(accountIds, configUpdates) {
    return this.updateMany(
      { id: { in: accountIds } },
      { config: configUpdates }
    );
  }

  /**
   * 获取活跃账户统计
   * @returns {Promise<Object>}
   */
  async getActiveAccountStats() {
    const [total, active, paused, stopped] = await Promise.all([
      this.count(),
      this.count({ status: 'active' }),
      this.count({ status: 'paused' }),
      this.count({ status: 'stopped' })
    ]);

    // 按模型类型统计
    const modelStats = await this.prisma.aIAccount.groupBy({
      by: ['modelType'],
      _count: {
        _all: true
      },
      where: { status: 'active' }
    });

    // 按风险等级统计
    const riskStats = await this.prisma.aIAccount.groupBy({
      by: ['riskLevel'],
      _count: {
        _all: true
      },
      where: { status: 'active' }
    });

    return {
      total,
      active,
      paused,
      stopped,
      activePercentage: total > 0 ? (active / total) * 100 : 0,
      modelStats: modelStats.reduce((acc, stat) => {
        acc[stat.modelType] = stat._count._all;
        return acc;
      }, {}),
      riskStats: riskStats.reduce((acc, stat) => {
        acc[stat.riskLevel] = stat._count._all;
        return acc;
      }, {})
    };
  }

  /**
   * 搜索AI账户
   * @param {string} searchTerm - 搜索关键词
   * @param {Object} filters - 过滤器
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>}
   */
  async searchAccounts(searchTerm, filters = {}, pagination = { page: 1, limit: 20 }) {
    const where = {
      ...filters,
      OR: [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } }
      ]
    };

    return this.paginate({
      ...pagination,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });
  }

  /**
   * 获取账户排行榜
   * @param {string} periodType - 周期类型
   * @param {Date} periodDate - 周期日期
   * @param {number} limit - 限制数量
   * @returns {Promise<Array>}
   */
  async getAccountRankings(periodType = 'total', periodDate = new Date(), limit = 100) {
    return this.prisma.ranking.findMany({
      where: {
        periodType,
        periodDate: {
          lte: periodDate
        }
      },
      orderBy: [
        { rank: 'asc' },
        { totalReturn: 'desc' }
      ],
      take: limit,
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
}