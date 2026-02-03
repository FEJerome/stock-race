import { BaseRepository } from './BaseRepository.js';

export class WatchlistRepository extends BaseRepository {
  constructor() {
    super();
    this.modelName = 'watchlist';
  }

  /**
   * 获取用户的关注列表
   * @param {number} userId - 用户ID
   * @returns {Promise<Array>}
   */
  async getUserWatchlist(userId) {
    return this.findMany(
      { userId },
      [
        { sortOrder: 'asc' },
        { createdAt: 'desc' }
      ],
      undefined,
      {
        stock: true
      }
    );
  }

  /**
   * 添加股票到关注列表
   * @param {number} userId - 用户ID
   * @param {number} stockId - 股票ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async addToWatchlist(userId, stockId, options = {}) {
    const { customName, notes, alertPrice, alertType } = options;

    // 检查是否已关注
    const existing = await this.findOne({ userId, stockId });
    if (existing) {
      return this.update(
        { id: existing.id },
        {
          customName,
          notes,
          alertPrice,
          alertType,
          updatedAt: new Date()
        }
      );
    }

    // 获取当前最大排序值
    const maxSortOrder = await this.prisma.watchlist.aggregate({
      where: { userId },
      _max: {
        sortOrder: true
      }
    });

    const newSortOrder = (maxSortOrder._max.sortOrder || 0) + 1;

    return this.create({
      userId,
      stockId,
      customName,
      notes,
      alertPrice,
      alertType,
      sortOrder: newSortOrder
    });
  }

  /**
   * 从关注列表移除股票
   * @param {number} userId - 用户ID
   * @param {number} stockId - 股票ID
   * @returns {Promise<Object>}
   */
  async removeFromWatchlist(userId, stockId) {
    return this.delete({ userId, stockId });
  }

  /**
   * 批量添加股票到关注列表
   * @param {number} userId - 用户ID
   * @param {Array<number>} stockIds - 股票ID数组
   * @returns {Promise<Array>}
   */
  async batchAddToWatchlist(userId, stockIds) {
    // 获取当前最大排序值
    const maxSortOrder = await this.prisma.watchlist.aggregate({
      where: { userId },
      _max: {
        sortOrder: true
      }
    });

    let currentSortOrder = (maxSortOrder._max.sortOrder || 0) + 1;

    const operations = stockIds.map(stockId => {
      const operation = this.prisma.watchlist.upsert({
        where: {
          userId_stockId: {
            userId,
            stockId
          }
        },
        update: {
          sortOrder: currentSortOrder++,
          updatedAt: new Date()
        },
        create: {
          userId,
          stockId,
          sortOrder: currentSortOrder++
        }
      });

      return operation;
    });

    return Promise.all(operations);
  }

  /**
   * 更新关注项排序
   * @param {number} userId - 用户ID
   * @param {Array<Object>} sortUpdates - 排序更新数组
   * @returns {Promise<Array>}
   */
  async updateWatchlistOrder(userId, sortUpdates) {
    const operations = sortUpdates.map(update => {
      return this.prisma.watchlist.update({
        where: {
          userId_stockId: {
            userId,
            stockId: update.stockId
          }
        },
        data: {
          sortOrder: update.sortOrder,
          updatedAt: new Date()
        }
      });
    });

    return Promise.all(operations);
  }

  /**
   * 设置价格提醒
   * @param {number} userId - 用户ID
   * @param {number} stockId - 股票ID
   * @param {number} alertPrice - 提醒价格
   * @param {string} alertType - 提醒类型
   * @returns {Promise<Object>}
   */
  async setPriceAlert(userId, stockId, alertPrice, alertType) {
    return this.update(
      { userId, stockId },
      {
        alertPrice,
        alertType,
        updatedAt: new Date()
      }
    );
  }

  /**
   * 清除价格提醒
   * @param {number} userId - 用户ID
   * @param {number} stockId - 股票ID
   * @returns {Promise<Object>}
   */
  async clearPriceAlert(userId, stockId) {
    return this.update(
      { userId, stockId },
      {
        alertPrice: null,
        alertType: null,
        updatedAt: new Date()
      }
    );
  }

  /**
   * 获取需要价格提醒的关注项
   * @param {number} currentPrice - 当前价格
   * @param {string} comparison - 比较方式 ('above', 'below')
   * @returns {Promise<Array>}
   */
  async getWatchlistItemsNeedingAlert(currentPrice, comparison = 'above') {
    const where = {
      alertPrice: { not: null },
      alertType: { not: null }
    };

    if (comparison === 'above') {
      where.alertPrice = { lte: currentPrice };
      where.OR = [
        { alertType: 'above' },
        { alertType: 'both' }
      ];
    } else {
      where.alertPrice = { gte: currentPrice };
      where.OR = [
        { alertType: 'below' },
        { alertType: 'both' }
      ];
    }

    return this.findMany(
      where,
      { updatedAt: 'desc' },
      100,
      {
        stock: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    );
  }

  /**
   * 获取关注股票的最新行情
   * @param {number} userId - 用户ID
   * @returns {Promise<Array>}
   */
  async getWatchlistWithQuotes(userId) {
    const watchlistItems = await this.getUserWatchlist(userId);

    // 这里需要集成股票行情数据
    // 暂时返回基础信息
    return watchlistItems.map(item => ({
      ...item,
      quote: {
        // 需要从外部数据源获取
        currentPrice: null,
        change: null,
        changePercent: null,
        volume: null,
        lastUpdated: null
      }
    }));
  }

  /**
   * 获取关注统计
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>}
   */
  async getWatchlistStats(userId) {
    const watchlistItems = await this.getUserWatchlist(userId);

    const stats = {
      totalItems: watchlistItems.length,
      itemsWithAlerts: 0,
      byMarket: {},
      byIndustry: {}
    };

    watchlistItems.forEach(item => {
      if (item.alertPrice) {
        stats.itemsWithAlerts++;
      }

      // 按市场统计
      const market = item.stock.market;
      if (!stats.byMarket[market]) {
        stats.byMarket[market] = 0;
      }
      stats.byMarket[market]++;

      // 按行业统计
      const industry = item.stock.industry || '未知';
      if (!stats.byIndustry[industry]) {
        stats.byIndustry[industry] = 0;
      }
      stats.byIndustry[industry]++;
    });

    return stats;
  }

  /**
   * 搜索用户关注列表
   * @param {number} userId - 用户ID
   * @param {string} searchTerm - 搜索关键词
   * @returns {Promise<Array>}
   */
  async searchUserWatchlist(userId, searchTerm) {
    return this.findMany(
      {
        userId,
        OR: [
          {
            stock: {
              code: { contains: searchTerm, mode: 'insensitive' }
            }
          },
          {
            stock: {
              name: { contains: searchTerm, mode: 'insensitive' }
            }
          },
          {
            customName: { contains: searchTerm, mode: 'insensitive' }
          },
          {
            notes: { contains: searchTerm, mode: 'insensitive' }
          }
        ]
      },
      [
        { sortOrder: 'asc' },
        { createdAt: 'desc' }
      ],
      undefined,
      {
        stock: true
      }
    );
  }

  /**
   * 获取热门关注股票
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getPopularWatchlistStocks(options = {}) {
    const { limit = 20, days = 30 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const popularStocks = await this.prisma.watchlist.groupBy({
      by: ['stockId'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        _all: true
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
      popularStocks.map(async (stat) => {
        const stock = await this.prisma.stock.findUnique({
          where: { id: stat.stockId }
        });

        return {
          stock,
          watchlistCount: stat._count._all
        };
      })
    );

    return stocksWithDetails;
  }

  /**
   * 清空用户关注列表
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>}
   */
  async clearUserWatchlist(userId) {
    return this.deleteMany({ userId });
  }

  /**
   * 导出关注列表
   * @param {number} userId - 用户ID
   * @returns {Promise<Array>}
   */
  async exportWatchlist(userId) {
    const watchlistItems = await this.getUserWatchlist(userId);

    return watchlistItems.map(item => ({
      stockCode: item.stock.code,
      stockName: item.stock.name,
      market: item.stock.market,
      industry: item.stock.industry,
      customName: item.customName,
      notes: item.notes,
      alertPrice: item.alertPrice,
      alertType: item.alertType,
      sortOrder: item.sortOrder,
      addedAt: item.createdAt,
      lastUpdated: item.updatedAt
    }));
  }
}