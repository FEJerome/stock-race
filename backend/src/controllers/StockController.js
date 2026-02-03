import { stockRepository } from '../models/index.js';
import { dataService } from '../services/DataService.js';

export class StockController {
  constructor() {
    // 数据服务已通过dataService集成
  }

  /**
   * 获取股票列表
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getStocks(req, res) {
    try {
      const {
        market,
        industry,
        search,
        page = 1,
        limit = 50
      } = req.query;

      // 构建查询条件
      const where = {};

      if (market) {
        where.market = market;
      }

      if (industry) {
        where.industry = industry;
      }

      if (search) {
        where.OR = [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } }
        ];
      }

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit)
      };

      const result = await stockRepository.paginate({
        ...pagination,
        where,
        orderBy: { code: 'asc' }
      });

      // 获取实时行情数据
      const stocksWithPrices = await this.enrichStocksWithPrices(result.data);

      res.json({
        success: true,
        data: {
          stocks: stocksWithPrices,
          pagination: result.pagination
        },
        message: '获取股票列表成功'
      });
    } catch (error) {
      console.error('获取股票列表控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取股票列表失败，请稍后重试'
      });
    }
  }

  /**
   * 获取股票详情
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getStockDetail(req, res) {
    try {
      const { stockCode } = req.params;

      const stock = await stockRepository.findOne(
        { code: stockCode },
        {
          include: {
            portfolios: {
              take: 10,
              orderBy: { quantity: 'desc' },
              include: {
                account: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            },
            trades: {
              take: 10,
              orderBy: { executedAt: 'desc' },
              include: {
                account: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      );

      if (!stock) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: '股票不存在'
          },
          message: `股票 ${stockCode} 不存在`
        });
      }

      // 获取实时行情数据
      const realtimeData = await this.getRealtimeData(stockCode);
      const klineData = await this.getKlineData(stockCode, '1d', 30);

      // 获取技术指标
      const technicalIndicators = await this.getTechnicalIndicators(stockCode);

      const formattedStock = {
        code: stock.code,
        name: stock.name,
        fullName: stock.fullName,
        market: stock.market,
        industry: stock.industry,
        subIndustry: stock.subIndustry,
        listingDate: stock.listingDate,
        totalShares: stock.totalShares,
        circulatingShares: stock.circulatingShares,
        status: stock.status,
        createdAt: stock.createdAt,
        updatedAt: stock.updatedAt,
        realtime: realtimeData,
        kline: klineData,
        technicalIndicators,
        topHolders: stock.portfolios.map(p => ({
          accountId: p.accountId,
          accountName: p.account.name,
          quantity: p.quantity,
          marketValue: parseFloat(p.marketValue)
        })),
        recentTrades: stock.trades.map(t => ({
          id: t.id,
          accountId: t.accountId,
          accountName: t.account.name,
          tradeType: t.tradeType,
          quantity: t.quantity,
          price: parseFloat(t.price),
          executedAt: t.executedAt
        }))
      };

      res.json({
        success: true,
        data: {
          stock: formattedStock
        },
        message: '获取股票详情成功'
      });
    } catch (error) {
      console.error('获取股票详情控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取股票详情失败，请稍后重试'
      });
    }
  }

  /**
   * 获取K线数据
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getKline(req, res) {
    try {
      const { stockCode } = req.params;
      const {
        interval = '1d',
        startTime,
        endTime,
        limit = 100
      } = req.query;

      // 验证股票是否存在
      const stock = await stockRepository.findOne({ code: stockCode });
      if (!stock) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: '股票不存在'
          },
          message: `股票 ${stockCode} 不存在`
        });
      }

      // 获取K线数据
      const klineData = await this.getKlineData(
        stockCode,
        interval,
        parseInt(limit),
        startTime,
        endTime
      );

      res.json({
        success: true,
        data: {
          stockCode,
          stockName: stock.name,
          interval,
          kline: klineData,
          timestamp: new Date().toISOString()
        },
        message: '获取K线数据成功'
      });
    } catch (error) {
      console.error('获取K线数据控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取K线数据失败，请稍后重试'
      });
    }
  }

  /**
   * 获取实时行情
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getRealtime(req, res) {
    try {
      const { stockCode } = req.params;

      // 验证股票是否存在
      const stock = await stockRepository.findOne({ code: stockCode });
      if (!stock) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: '股票不存在'
          },
          message: `股票 ${stockCode} 不存在`
        });
      }

      // 获取实时行情数据
      const realtimeData = await this.getRealtimeData(stockCode);

      res.json({
        success: true,
        data: {
          stockCode,
          stockName: stock.name,
          ...realtimeData,
          timestamp: new Date().toISOString()
        },
        message: '获取实时行情成功'
      });
    } catch (error) {
      console.error('获取实时行情控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取实时行情失败，请稍后重试'
      });
    }
  }

  /**
   * 搜索股票
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async searchStocks(req, res) {
    try {
      const { q, limit = 20 } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '搜索关键词太短'
          },
          message: '搜索关键词至少需要2个字符'
        });
      }

      const stocks = await stockRepository.searchStocks(q.trim(), {
        take: parseInt(limit)
      });

      // 获取实时行情数据
      const stocksWithPrices = await this.enrichStocksWithPrices(stocks);

      res.json({
        success: true,
        data: {
          stocks: stocksWithPrices,
          count: stocks.length,
          searchTerm: q.trim()
        },
        message: '搜索股票成功'
      });
    } catch (error) {
      console.error('搜索股票控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '搜索股票失败，请稍后重试'
      });
    }
  }

  /**
   * 获取市场统计
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getMarketStats(req, res) {
    try {
      const { market } = req.query;

      const where = {};
      if (market) {
        where.market = market;
      }

      // 获取股票总数
      const totalStocks = await stockRepository.count(where);

      // 按行业统计
      const industryStats = await stockRepository.prisma.stock.groupBy({
        by: ['industry'],
        where,
        _count: {
          _all: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 10
      });

      // 按市场统计
      const marketStats = await stockRepository.prisma.stock.groupBy({
        by: ['market'],
        _count: {
          _all: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        }
      });

      // 获取涨跌统计（需要实时数据）
      const priceStats = await this.getPriceChangeStats(market);

      res.json({
        success: true,
        data: {
          totalStocks,
          industryStats: industryStats.map(stat => ({
            industry: stat.industry || '未知',
            count: stat._count._all,
            percentage: totalStocks > 0 ? (stat._count._all / totalStocks) * 100 : 0
          })),
          marketStats: marketStats.map(stat => ({
            market: stat.market,
            count: stat._count._all,
            percentage: totalStocks > 0 ? (stat._count._all / totalStocks) * 100 : 0
          })),
          priceStats,
          timestamp: new Date().toISOString()
        },
        message: '获取市场统计成功'
      });
    } catch (error) {
      console.error('获取市场统计控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取市场统计失败，请稍后重试'
      });
    }
  }

  /**
   * 批量获取股票实时数据
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async batchGetRealtime(req, res) {
    try {
      const { stockCodes } = req.body;

      if (!stockCodes || !Array.isArray(stockCodes) || stockCodes.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '股票代码列表不能为空'
          },
          message: '请提供股票代码列表'
        });
      }

      if (stockCodes.length > 100) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '股票代码数量过多'
          },
          message: '一次最多查询100只股票'
        });
      }

      // 验证股票是否存在
      const stocks = await stockRepository.findMany({
        code: { in: stockCodes }
      });

      const existingCodes = stocks.map(stock => stock.code);
      const missingCodes = stockCodes.filter(code => !existingCodes.includes(code));

      if (missingCodes.length > 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: '部分股票不存在'
          },
          message: `以下股票不存在: ${missingCodes.join(', ')}`,
          data: {
            missingCodes
          }
        });
      }

      // 批量获取实时数据
      const realtimeData = await this.batchGetRealtimeData(stockCodes);

      res.json({
        success: true,
        data: {
          stocks: realtimeData,
          count: realtimeData.length,
          timestamp: new Date().toISOString()
        },
        message: '批量获取股票实时数据成功'
      });
    } catch (error) {
      console.error('批量获取股票实时数据控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '批量获取股票实时数据失败，请稍后重试'
      });
    }
  }

  /**
   * 获取股票排行榜
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getStockRankings(req, res) {
    try {
      const {
        sortBy = 'changePercent',
        order = 'desc',
        market,
        limit = 20
      } = req.query;

      // 获取股票列表
      const where = {};
      if (market) {
        where.market = market;
      }

      const stocks = await stockRepository.findMany(
        where,
        { code: 'asc' },
        parseInt(limit)
      );

      // 获取实时数据并排序
      const stocksWithPrices = await this.enrichStocksWithPrices(stocks);

      // 排序
      const sortedStocks = stocksWithPrices.sort((a, b) => {
        const aValue = a[sortBy] || 0;
        const bValue = b[sortBy] || 0;

        if (order === 'desc') {
          return bValue - aValue;
        } else {
          return aValue - bValue;
        }
      });

      res.json({
        success: true,
        data: {
          rankings: sortedStocks.slice(0, parseInt(limit)),
          sortBy,
          order,
          market: market || '全部',
          timestamp: new Date().toISOString()
        },
        message: '获取股票排行榜成功'
      });
    } catch (error) {
      console.error('获取股票排行榜控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取股票排行榜失败，请稍后重试'
      });
    }
  }

  /**
   * 调用数据服务获取实时数据
   * @param {string} stockCode - 股票代码
   * @returns {Promise<Object>} 实时数据
   */
  async getRealtimeData(stockCode) {
    try {
      const result = await dataService.getRealtimeData(stockCode);

      if (!result.success) {
        throw new Error('数据服务返回失败');
      }

      return {
        price: result.price,
        change: result.change,
        changePercent: result.change_percent,
        volume: result.volume,
        amount: result.amount,
        timestamp: result.timestamp,
        bidAsk: result.bid_ask,
        open: result.open,
        high: result.high,
        low: result.low,
        prevClose: result.prev_close,
        marketStatus: result.market_status,
        isFallback: result.is_fallback || false
      };
    } catch (error) {
      console.error('获取实时数据错误:', error);
      // 返回默认数据
      return {
        price: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        amount: 0,
        timestamp: new Date().toISOString(),
        bidAsk: null,
        isFallback: true
      };
    }
  }

  /**
   * 批量获取实时数据
   * @param {Array<string>} stockCodes - 股票代码数组
   * @returns {Promise<Array>} 实时数据数组
   */
  async batchGetRealtimeData(stockCodes) {
    try {
      const results = await dataService.batchGetRealtimeData(stockCodes);

      return results.map(result => ({
        stockCode: result.stock_code,
        price: result.price,
        change: result.change,
        changePercent: result.change_percent,
        volume: result.volume,
        amount: result.amount,
        timestamp: result.timestamp,
        isFallback: result.is_fallback || false
      }));
    } catch (error) {
      console.error('批量获取实时数据错误:', error);
      return stockCodes.map(code => ({
        stockCode: code,
        price: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        amount: 0,
        timestamp: new Date().toISOString(),
        isFallback: true
      }));
    }
  }

  /**
   * 获取K线数据
   * @param {string} stockCode - 股票代码
   * @param {string} interval - 时间间隔
   * @param {number} limit - 数据条数
   * @param {string} startTime - 开始时间
   * @param {string} endTime - 结束时间
   * @returns {Promise<Array>} K线数据
   */
  async getKlineData(stockCode, interval = '1d', limit = 100, startTime, endTime) {
    try {
      const klineData = await dataService.getKlineData(stockCode, interval, limit, startTime, endTime);
      return klineData;
    } catch (error) {
      console.error('获取K线数据错误:', error);
      return [];
    }
  }

  /**
   * 获取技术指标
   * @param {string} stockCode - 股票代码
   * @returns {Promise<Object>} 技术指标
   */
  async getTechnicalIndicators(stockCode) {
    try {
      const indicators = await dataService.getTechnicalIndicators(stockCode);

      if (!indicators.success) {
        throw new Error('数据服务返回失败');
      }

      return {
        ma5: indicators.indicators?.ma?.ma5 || 0,
        ma10: indicators.indicators?.ma?.ma10 || 0,
        ma20: indicators.indicators?.ma?.ma20 || 0,
        ma30: indicators.indicators?.ma?.ma30 || 0,
        ma60: indicators.indicators?.ma?.ma60 || 0,
        rsi: indicators.indicators?.rsi || 0,
        macd: indicators.indicators?.macd?.macd || 0,
        kdj_k: indicators.indicators?.kdj?.k || 0,
        kdj_d: indicators.indicators?.kdj?.d || 0,
        kdj_j: indicators.indicators?.kdj?.j || 0,
        boll_upper: indicators.indicators?.boll?.upper || 0,
        boll_middle: indicators.indicators?.boll?.middle || 0,
        boll_lower: indicators.indicators?.boll?.lower || 0,
        isFallback: indicators.is_fallback || false
      };
    } catch (error) {
      console.error('获取技术指标错误:', error);
      return {
        isFallback: true
      };
    }
  }

  /**
   * 为股票列表添加价格信息
   * @param {Array} stocks - 股票列表
   * @returns {Promise<Array>} 带价格信息的股票列表
   */
  async enrichStocksWithPrices(stocks) {
    if (!stocks || stocks.length === 0) {
      return [];
    }

    const stockCodes = stocks.map(stock => stock.code);
    const prices = await this.batchGetRealtimeData(stockCodes);

    const priceMap = {};
    prices.forEach(price => {
      priceMap[price.stockCode] = price;
    });

    return stocks.map(stock => {
      const priceInfo = priceMap[stock.code] || {
        price: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        amount: 0
      };

      return {
        code: stock.code,
        name: stock.name,
        market: stock.market,
        industry: stock.industry,
        currentPrice: parseFloat(priceInfo.price.toFixed(2)),
        change: parseFloat(priceInfo.change.toFixed(2)),
        changePercent: parseFloat(priceInfo.changePercent.toFixed(2)),
        volume: priceInfo.volume,
        amount: parseFloat(priceInfo.amount.toFixed(2)),
        peRatio: stock.peRatio || 0,
        pbRatio: stock.pbRatio || 0,
        marketCap: stock.marketCap || 0,
        circulatingMarketCap: stock.circulatingMarketCap || 0,
        isFallback: priceInfo.isFallback || false
      };
    });
  }

  /**
   * 获取价格变化统计
   * @param {string} market - 市场代码
   * @returns {Promise<Object>} 价格变化统计
   */
  async getPriceChangeStats(market) {
    try {
      const marketStats = await dataService.getMarketStats(market);

      if (!marketStats.success) {
        throw new Error('数据服务返回失败');
      }

      return {
        up: marketStats.up_count,
        down: marketStats.down_count,
        unchanged: marketStats.unchanged_count,
        limitUp: marketStats.limit_up_count,
        limitDown: marketStats.limit_down_count,
        total: marketStats.total_stocks,
        totalTurnover: marketStats.total_turnover,
        totalMarketCap: marketStats.total_market_cap,
        isFallback: marketStats.is_fallback || false
      };
    } catch (error) {
      console.error('获取价格变化统计错误:', error);
      return {
        up: 0,
        down: 0,
        unchanged: 0,
        limitUp: 0,
        limitDown: 0,
        total: 0,
        isFallback: true
      };
    }
  }
}

// 创建控制器实例
export const stockController = new StockController();