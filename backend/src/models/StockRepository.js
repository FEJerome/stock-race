import { BaseRepository } from './BaseRepository.js';

export class StockRepository extends BaseRepository {
  constructor() {
    super();
    this.modelName = 'stock';
  }

  /**
   * 根据股票代码查找股票
   * @param {string} code - 股票代码
   * @returns {Promise<Object|null>}
   */
  async findByCode(code) {
    return this.findOne({ code });
  }

  /**
   * 根据市场查找股票
   * @param {string} market - 市场代码
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async findByMarket(market, options = {}) {
    const { status = 'normal', limit = 100 } = options;

    return this.findMany(
      { market, status },
      { code: 'asc' },
      limit
    );
  }

  /**
   * 根据行业查找股票
   * @param {string} industry - 行业
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async findByIndustry(industry, options = {}) {
    const { market, status = 'normal', limit = 100 } = options;

    const where = { industry, status };
    if (market) {
      where.market = market;
    }

    return this.findMany(where, { code: 'asc' }, limit);
  }

  /**
   * 搜索股票
   * @param {string} searchTerm - 搜索关键词
   * @param {Object} filters - 过滤器
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>}
   */
  async searchStocks(searchTerm, filters = {}, pagination = { page: 1, limit: 50 }) {
    const where = {
      ...filters,
      OR: [
        { code: { contains: searchTerm, mode: 'insensitive' } },
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { fullName: { contains: searchTerm, mode: 'insensitive' } }
      ]
    };

    return this.paginate({
      ...pagination,
      where,
      orderBy: { code: 'asc' }
    });
  }

  /**
   * 批量创建或更新股票
   * @param {Array} stocks - 股票数据数组
   * @returns {Promise<Object>}
   */
  async bulkUpsert(stocks) {
    const operations = stocks.map(stock => {
      return this.prisma.stock.upsert({
        where: { code: stock.code },
        update: stock,
        create: stock
      });
    });

    return Promise.all(operations);
  }

  /**
   * 获取股票统计信息
   * @returns {Promise<Object>}
   */
  async getStockStats() {
    const [total, byMarket, byIndustry, byStatus] = await Promise.all([
      this.count(),
      this.prisma.stock.groupBy({
        by: ['market'],
        _count: {
          _all: true
        }
      }),
      this.prisma.stock.groupBy({
        by: ['industry'],
        _count: {
          _all: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 20
      }),
      this.prisma.stock.groupBy({
        by: ['status'],
        _count: {
          _all: true
        }
      })
    ]);

    return {
      total,
      byMarket: byMarket.reduce((acc, stat) => {
        acc[stat.market] = stat._count._all;
        return acc;
      }, {}),
      byIndustry: byIndustry.reduce((acc, stat) => {
        acc[stat.industry || '未知'] = stat._count._all;
        return acc;
      }, {}),
      byStatus: byStatus.reduce((acc, stat) => {
        acc[stat.status] = stat._count._all;
        return acc;
      }, {})
    };
  }

  /**
   * 获取热门股票（按关注度）
   * @param {number} limit - 限制数量
   * @returns {Promise<Array>}
   */
  async getPopularStocks(limit = 20) {
    return this.prisma.stock.findMany({
      where: {
        status: 'normal'
      },
      orderBy: {
        watchlist: {
          _count: 'desc'
        }
      },
      take: limit,
      include: {
        _count: {
          select: {
            watchlist: true,
            portfolios: true
          }
        }
      }
    });
  }

  /**
   * 获取热门股票（简化版）
   * @param {Object} options - 选项
   * @param {number} options.limit - 限制数量
   * @returns {Promise<Array>}
   */
  async getHotStocks(options = {}) {
    const { limit = 20 } = options;
    return this.prisma.stock.findMany({
      where: {
        status: 'normal'
      },
      orderBy: {
        marketCap: 'desc'
      },
      take: limit
    });
  }

  /**
   * 更新股票状态
   * @param {string} code - 股票代码
   * @param {string} status - 状态
   * @returns {Promise<Object>}
   */
  async updateStockStatus(code, status) {
    return this.update({ code }, { status });
  }

  /**
   * 批量更新股票状态
   * @param {Array<string>} codes - 股票代码数组
   * @param {string} status - 状态
   * @returns {Promise<Object>}
   */
  async batchUpdateStatus(codes, status) {
    return this.updateMany(
      { code: { in: codes } },
      { status }
    );
  }

  /**
   * 获取股票关联信息
   * @param {string} code - 股票代码
   * @returns {Promise<Object|null>}
   */
  async getStockWithRelations(code) {
    return this.findOne(
      { code },
      {
        include: {
          _count: {
            select: {
              watchlist: true,
              portfolios: true,
              trades: true
            }
          },
          portfolios: {
            take: 5,
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
            },
            orderBy: {
              quantity: 'desc'
            }
          }
        }
      }
    );
  }

  /**
   * 获取股票价格历史（需要TimescaleDB集成）
   * @param {string} code - 股票代码
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getPriceHistory(code, options = {}) {
    const { startDate, endDate, interval = '1d', limit = 100 } = options;

    // 这里需要集成TimescaleDB查询
    // 暂时返回空数组，后续实现
    return [];
  }

  /**
   * 获取股票技术指标（需要TimescaleDB集成）
   * @param {string} code - 股票代码
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async getTechnicalIndicators(code, options = {}) {
    const { interval = '1d', indicators = ['ma5', 'ma10', 'ma20', 'rsi', 'macd'] } = options;

    // 这里需要集成TimescaleDB查询
    // 暂时返回空对象，后续实现
    return {};
  }

  /**
   * 获取股票基本面数据
   * @param {string} code - 股票代码
   * @returns {Promise<Object>}
   */
  async getFundamentalData(code) {
    const stock = await this.findByCode(code);

    if (!stock) {
      throw new Error('股票不存在');
    }

    // 这里可以集成外部数据源获取基本面数据
    // 暂时返回基础信息
    return {
      code: stock.code,
      name: stock.name,
      market: stock.market,
      industry: stock.industry,
      listingDate: stock.listingDate,
      totalShares: stock.totalShares,
      circulatingShares: stock.circulatingShares,
      // 需要从外部数据源获取以下数据
      peRatio: null,
      pbRatio: null,
      dividendYield: null,
      marketCap: null,
      circulatingMarketCap: null
    };
  }
}