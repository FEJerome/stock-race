import { BaseRepository } from './BaseRepository.js';

export class DecisionLogRepository extends BaseRepository {
  constructor() {
    super();
    this.modelName = 'decisionLog';
  }

  /**
   * 创建AI决策日志
   * @param {Object} decisionData - 决策数据
   * @returns {Promise<Object>}
   */
  async createDecisionLog(decisionData) {
    return this.create(decisionData);
  }

  /**
   * 获取账户的AI决策历史
   * @param {number} accountId - 账户ID
   * @param {Object} filters - 过滤器
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>}
   */
  async getAccountDecisionLogs(accountId, filters = {}, pagination = { page: 1, limit: 20 }) {
    const where = {
      accountId,
      ...filters
    };

    return this.paginate({
      ...pagination,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        trade: {
          include: {
            stock: true
          }
        },
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
   * 获取与交易关联的决策日志
   * @param {number} tradeId - 交易ID
   * @returns {Promise<Array>}
   */
  async getTradeDecisionLogs(tradeId) {
    return this.findMany(
      { tradeId },
      { createdAt: 'desc' },
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
   * 获取AI决策统计
   * @param {number} accountId - 账户ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async getDecisionStats(accountId, options = {}) {
    const { startDate, endDate } = options;

    const where = {
      accountId
    };

    if (startDate) {
      where.createdAt = { ...where.createdAt, gte: startDate };
    }
    if (endDate) {
      where.createdAt = { ...where.createdAt, lte: endDate };
    }

    const stats = await this.prisma.decisionLog.groupBy({
      by: ['decisionType'],
      where,
      _count: {
        _all: true
      },
      _avg: {
        confidence: true,
        processingTimeMs: true,
        apiCost: true
      }
    });

    const total = await this.count(where);

    return {
      total,
      byDecisionType: stats.reduce((acc, stat) => {
        acc[stat.decisionType] = {
          count: stat._count._all,
          avgConfidence: stat._avg.confidence,
          avgProcessingTime: stat._avg.processingTimeMs,
          avgApiCost: stat._avg.apiCost
        };
        return acc;
      }, {}),
      overallStats: {
        avgConfidence: stats.reduce((sum, stat) => sum + (stat._avg.confidence || 0), 0) / stats.length,
        avgProcessingTime: stats.reduce((sum, stat) => sum + (stat._avg.processingTimeMs || 0), 0) / stats.length,
        totalApiCost: stats.reduce((sum, stat) => sum + (stat._avg.apiCost || 0) * stat._count._all, 0)
      }
    };
  }

  /**
   * 获取AI模型使用统计
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async getModelUsageStats(options = {}) {
    const { startDate, endDate } = options;

    const where = {};
    if (startDate) {
      where.createdAt = { ...where.createdAt, gte: startDate };
    }
    if (endDate) {
      where.createdAt = { ...where.createdAt, lte: endDate };
    }

    const stats = await this.prisma.decisionLog.groupBy({
      by: ['modelUsed'],
      where,
      _count: {
        _all: true
      },
      _sum: {
        apiCost: true
      },
      _avg: {
        processingTimeMs: true,
        confidence: true
      }
    });

    const total = await this.count(where);

    return {
      total,
      byModel: stats.reduce((acc, stat) => {
        acc[stat.modelUsed || 'unknown'] = {
          count: stat._count._all,
          percentage: total > 0 ? (stat._count._all / total) * 100 : 0,
          totalApiCost: stat._sum.apiCost,
          avgProcessingTime: stat._avg.processingTimeMs,
          avgConfidence: stat._avg.confidence
        };
        return acc;
      }, {})
    };
  }

  /**
   * 获取高风险决策
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getHighRiskDecisions(options = {}) {
    const { limit = 50, days = 7 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.findMany(
      {
        riskLevel: 'high',
        createdAt: {
          gte: startDate
        }
      },
      { createdAt: 'desc' },
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
        },
        trade: {
          include: {
            stock: true
          }
        }
      }
    );
  }

  /**
   * 获取决策质量分析
   * @param {number} accountId - 账户ID
   * @returns {Promise<Object>}
   */
  async getDecisionQualityAnalysis(accountId) {
    const decisions = await this.findMany(
      { accountId },
      { createdAt: 'desc' },
      100,
      {
        trade: true
      }
    );

    // 分析决策质量
    const analysis = {
      totalDecisions: decisions.length,
      decisionsWithTrades: 0,
      profitableDecisions: 0,
      averageConfidence: 0,
      riskDistribution: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      }
    };

    let totalConfidence = 0;
    let confidenceCount = 0;

    decisions.forEach(decision => {
      if (decision.trade) {
        analysis.decisionsWithTrades++;
        // 这里需要根据交易结果判断决策是否盈利
        // 简化处理
      }

      if (decision.confidence) {
        totalConfidence += parseFloat(decision.confidence);
        confidenceCount++;
      }

      if (decision.riskLevel) {
        analysis.riskDistribution[decision.riskLevel]++;
      }
    });

    if (confidenceCount > 0) {
      analysis.averageConfidence = totalConfidence / confidenceCount;
    }

    // 计算决策成功率（简化）
    if (analysis.decisionsWithTrades > 0) {
      analysis.successRate = (analysis.profitableDecisions / analysis.decisionsWithTrades) * 100;
    }

    return analysis;
  }

  /**
   * 批量创建决策日志
   * @param {Array} decisions - 决策数据数组
   * @returns {Promise<Object>}
   */
  async batchCreateDecisionLogs(decisions) {
    return this.createMany(decisions);
  }

  /**
   * 搜索决策日志
   * @param {string} searchTerm - 搜索关键词
   * @param {Object} filters - 过滤器
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>}
   */
  async searchDecisionLogs(searchTerm, filters = {}, pagination = { page: 1, limit: 20 }) {
    const where = {
      ...filters,
      OR: [
        { reasoning: { contains: searchTerm, mode: 'insensitive' } },
        { modelUsed: { contains: searchTerm, mode: 'insensitive' } },
        { promptVersion: { contains: searchTerm, mode: 'insensitive' } }
      ]
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
        },
        trade: {
          include: {
            stock: true
          }
        }
      }
    });
  }

  /**
   * 获取决策趋势
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getDecisionTrends(options = {}) {
    const { days = 30, accountId } = options;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where = {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    };

    if (accountId) {
      where.accountId = accountId;
    }

    // 按日期分组统计
    const dailyStats = await this.prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as decision_count,
        COUNT(DISTINCT account_id) as account_count,
        AVG(confidence) as avg_confidence,
        AVG(processing_time_ms) as avg_processing_time,
        SUM(api_cost) as total_api_cost
      FROM "decision_logs"
      WHERE created_at >= ${startDate}
        AND created_at <= ${endDate}
        ${accountId ? Prisma.sql`AND account_id = ${accountId}` : Prisma.sql``}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    return dailyStats;
  }
}