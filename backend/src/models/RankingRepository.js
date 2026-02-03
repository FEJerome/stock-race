import { BaseRepository } from './BaseRepository.js';

export class RankingRepository extends BaseRepository {
  constructor() {
    super();
    this.modelName = 'ranking';
  }

  /**
   * 创建或更新排行榜记录
   * @param {Object} rankingData - 排行榜数据
   * @returns {Promise<Object>}
   */
  async upsertRanking(rankingData) {
    const { accountId, periodType, periodDate, ...data } = rankingData;

    return this.prisma.ranking.upsert({
      where: {
        accountId_periodType_periodDate: {
          accountId,
          periodType,
          periodDate
        }
      },
      update: data,
      create: rankingData
    });
  }

  /**
   * 获取排行榜
   * @param {string} periodType - 周期类型
   * @param {Date} periodDate - 周期日期
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getRankings(periodType, periodDate, options = {}) {
    const { limit = 100, offset = 0 } = options;

    return this.findMany(
      {
        periodType,
        periodDate
      },
      [
        { rank: 'asc' },
        { totalReturn: 'desc' }
      ],
      limit,
      {
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
    );
  }

  /**
   * 获取账户的排名历史
   * @param {number} accountId - 账户ID
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getAccountRankingHistory(accountId, options = {}) {
    const { periodType, limit = 50 } = options;

    const where = { accountId };
    if (periodType) {
      where.periodType = periodType;
    }

    return this.findMany(
      where,
      [
        { periodDate: 'desc' },
        { periodType: 'asc' }
      ],
      limit,
      {
        account: {
          select: {
            id: true,
            name: true
          }
        }
      }
    );
  }

  /**
   * 计算并更新排行榜
   * @param {string} periodType - 周期类型
   * @param {Date} periodDate - 周期日期
   * @returns {Promise<Array>}
   */
  async calculateAndUpdateRankings(periodType, periodDate) {
    // 获取所有活跃账户
    const accounts = await this.prisma.aIAccount.findMany({
      where: { status: 'active' },
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    // 计算每个账户的绩效
    const accountPerformances = await Promise.all(
      accounts.map(async (account) => {
        // 这里需要根据周期计算绩效指标
        // 简化处理：使用账户的总收益率
        const performance = await this.calculateAccountPerformance(account.id, periodType, periodDate);

        return {
          accountId: account.id,
          accountName: account.name,
          userName: account.user.username,
          ...performance
        };
      })
    );

    // 按总收益率排序
    accountPerformances.sort((a, b) => b.totalReturn - a.totalReturn);

    // 更新排行榜
    const rankingUpdates = accountPerformances.map((performance, index) => {
      return this.upsertRanking({
        accountId: performance.accountId,
        periodType,
        periodDate,
        rank: index + 1,
        totalReturn: performance.totalReturn,
        annualizedReturn: performance.annualizedReturn,
        sharpeRatio: performance.sharpeRatio,
        maxDrawdown: performance.maxDrawdown,
        winRate: performance.winRate,
        profitFactor: performance.profitFactor,
        totalTrades: performance.totalTrades,
        totalVolume: performance.totalVolume
      });
    });

    return Promise.all(rankingUpdates);
  }

  /**
   * 计算账户绩效
   * @param {number} accountId - 账户ID
   * @param {string} periodType - 周期类型
   * @param {Date} periodDate - 周期日期
   * @returns {Promise<Object>}
   */
  async calculateAccountPerformance(accountId, periodType, periodDate) {
    const account = await this.prisma.aIAccount.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      throw new Error('账户不存在');
    }

    // 根据周期类型计算开始日期
    let startDate;
    const endDate = periodDate;

    switch (periodType) {
      case 'daily':
        startDate = new Date(periodDate);
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'weekly':
        startDate = new Date(periodDate);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate = new Date(periodDate);
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'total':
        startDate = account.createdAt;
        break;
      default:
        startDate = new Date(periodDate);
        startDate.setDate(startDate.getDate() - 1);
    }

    // 获取周期内的交易
    const trades = await this.prisma.trade.findMany({
      where: {
        accountId,
        executedAt: {
          gte: startDate,
          lte: endDate
        },
        status: 'executed'
      }
    });

    // 计算绩效指标
    const performance = {
      totalReturn: 0,
      annualizedReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0,
      profitFactor: 0,
      totalTrades: trades.length,
      totalVolume: 0
    };

    // 计算总交易额
    performance.totalVolume = trades.reduce((sum, trade) => {
      return sum + parseFloat(trade.amount);
    }, 0);

    // 计算总收益率（简化）
    const initialValue = parseFloat(account.initialBalance);
    const currentValue = parseFloat(account.totalValue);
    performance.totalReturn = ((currentValue - initialValue) / initialValue) * 100;

    // 计算年化收益率
    const daysDiff = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
    performance.annualizedReturn = Math.pow(1 + performance.totalReturn / 100, 365 / daysDiff) - 1;

    // 计算胜率（简化）
    const profitableTrades = trades.filter(trade => trade.tradeType === 'sell').length;
    performance.winRate = trades.length > 0 ? (profitableTrades / trades.length) * 100 : 0;

    return performance;
  }

  /**
   * 获取排行榜统计
   * @param {string} periodType - 周期类型
   * @param {Date} periodDate - 周期日期
   * @returns {Promise<Object>}
   */
  async getRankingStats(periodType, periodDate) {
    const rankings = await this.getRankings(periodType, periodDate, { limit: 1000 });

    if (rankings.length === 0) {
      return {
        totalParticipants: 0,
        averageReturn: 0,
        medianReturn: 0,
        top10AverageReturn: 0,
        bottom10AverageReturn: 0,
        returnDistribution: {}
      };
    }

    const returns = rankings.map(r => parseFloat(r.totalReturn));
    returns.sort((a, b) => a - b);

    // 计算统计指标
    const totalParticipants = rankings.length;
    const averageReturn = returns.reduce((sum, ret) => sum + ret, 0) / totalParticipants;
    const medianReturn = returns[Math.floor(totalParticipants / 2)];

    // 前10名平均收益率
    const top10Returns = returns.slice(-10);
    const top10AverageReturn = top10Returns.reduce((sum, ret) => sum + ret, 0) / top10Returns.length;

    // 后10名平均收益率
    const bottom10Returns = returns.slice(0, 10);
    const bottom10AverageReturn = bottom10Returns.reduce((sum, ret) => sum + ret, 0) / bottom10Returns.length;

    // 收益率分布
    const returnDistribution = {
      negative: returns.filter(r => r < 0).length,
      zeroToFive: returns.filter(r => r >= 0 && r < 5).length,
      fiveToTen: returns.filter(r => r >= 5 && r < 10).length,
      tenToTwenty: returns.filter(r => r >= 10 && r < 20).length,
      twentyPlus: returns.filter(r => r >= 20).length
    };

    return {
      totalParticipants,
      averageReturn,
      medianReturn,
      top10AverageReturn,
      bottom10AverageReturn,
      returnDistribution
    };
  }

  /**
   * 获取排行榜趋势
   * @param {number} accountId - 账户ID
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getRankingTrend(accountId, options = {}) {
    const { periodType = 'daily', days = 30 } = options;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.findMany(
      {
        accountId,
        periodType,
        periodDate: {
          gte: startDate,
          lte: endDate
        }
      },
      { periodDate: 'asc' },
      undefined,
      {
        account: {
          select: {
            id: true,
            name: true
          }
        }
      }
    );
  }

  /**
   * 获取排行榜变化
   * @param {string} periodType - 周期类型
   * @param {Date} currentDate - 当前日期
   * @param {Date} previousDate - 前一日期
   * @returns {Promise<Array>}
   */
  async getRankingChanges(periodType, currentDate, previousDate) {
    const [currentRankings, previousRankings] = await Promise.all([
      this.getRankings(periodType, currentDate, { limit: 1000 }),
      this.getRankings(periodType, previousDate, { limit: 1000 })
    ]);

    // 创建映射以便快速查找
    const previousRankMap = new Map();
    previousRankings.forEach(ranking => {
      previousRankMap.set(ranking.accountId, ranking.rank);
    });

    // 计算排名变化
    const rankingChanges = currentRankings.map(current => {
      const previousRank = previousRankMap.get(current.accountId);
      const rankChange = previousRank ? previousRank - current.rank : null; // 正数表示上升，负数表示下降

      return {
        accountId: current.accountId,
        accountName: current.account.name,
        currentRank: current.rank,
        previousRank,
        rankChange,
        totalReturn: current.totalReturn,
        returnChange: null // 需要计算收益率变化
      };
    });

    return rankingChanges;
  }

  /**
   * 批量删除过期排行榜
   * @param {Date} cutoffDate - 截止日期
   * @returns {Promise<Object>}
   */
  async deleteOldRankings(cutoffDate) {
    return this.deleteMany({
      periodDate: {
        lt: cutoffDate
      }
    });
  }
}