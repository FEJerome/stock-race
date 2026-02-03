import { stockController } from '../../src/controllers/StockController.js';
import { stockRepository } from '../../src/models/index.js';
import { dataService } from '../../src/services/DataService.js';

// 模拟依赖
jest.mock('../../src/models/index.js', () => ({
  stockRepository: {
    paginate: jest.fn(),
    findOne: jest.fn(),
    searchStocks: jest.fn(),
    getStockPerformance: jest.fn(),
    getTopGainers: jest.fn(),
    getTopLosers: jest.fn(),
    getMostActive: jest.fn()
  }
}));

jest.mock('../../src/services/DataService.js', () => ({
  dataService: {
    getRealtimeData: jest.fn(),
    getKlineData: jest.fn(),
    getTechnicalIndicators: jest.fn(),
    getMarketStats: jest.fn()
  }
}));

describe('StockController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStocks', () => {
    it('应该成功获取股票列表', async () => {
      const req = global.mockRequest({
        query: { page: 1, limit: 20 }
      });
      const res = global.mockResponse();

      // 模拟股票查询
      stockRepository.paginate.mockResolvedValue({
        data: [
          {
            id: 1,
            code: '000001',
            name: '平安银行',
            market: 'SZ',
            industry: '银行',
            currentPrice: '10.00',
            change: '0.50',
            changePercent: '5.00',
            volume: 1000000,
            marketCap: '1000000000.00'
          }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 100,
          pages: 5
        }
      });

      await stockController.getStocks(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            stocks: expect.arrayContaining([
              expect.objectContaining({
                code: '000001',
                name: '平安银行'
              })
            ])
          })
        })
      );
    });

    it('应该支持搜索股票', async () => {
      const req = global.mockRequest({
        query: { search: '平安', page: 1, limit: 20 }
      });
      const res = global.mockResponse();

      // 模拟股票搜索
      stockRepository.searchStocks.mockResolvedValue({
        data: [
          {
            id: 1,
            code: '000001',
            name: '平安银行',
            market: 'SZ',
            industry: '银行'
          }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          pages: 1
        }
      });

      await stockController.getStocks(req, res);

      expect(stockRepository.searchStocks).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '平安'
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });
  });

  describe('getStockDetail', () => {
    it('应该成功获取股票详情', async () => {
      const req = global.mockRequest({
        params: { stockCode: '000001' }
      });
      const res = global.mockResponse();

      // 模拟股票查询
      stockRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001',
        name: '平安银行',
        market: 'SZ',
        industry: '银行',
        currentPrice: '10.00',
        change: '0.50',
        changePercent: '5.00',
        volume: 1000000,
        marketCap: '1000000000.00',
        peRatio: '8.50',
        pbRatio: '0.85',
        dividendYield: '3.50'
      });

      // 模拟实时数据
      dataService.getRealtimeData.mockResolvedValue({
        price: 10.00,
        change: 0.50,
        changePercent: 5.00,
        volume: 1000000,
        amount: 10000000.00,
        high: 10.20,
        low: 9.80,
        open: 9.90,
        prevClose: 9.50,
        timestamp: new Date().toISOString()
      });

      // 模拟K线数据
      dataService.getKlineData.mockResolvedValue([
        {
          time: '2024-01-01',
          open: 9.90,
          high: 10.20,
          low: 9.80,
          close: 10.00,
          volume: 1000000
        }
      ]);

      // 模拟技术指标
      dataService.getTechnicalIndicators.mockResolvedValue({
        ma5: 9.80,
        ma10: 9.70,
        ma20: 9.60,
        rsi: 65.5,
        macd: { value: 0.15, signal: 0.10, histogram: 0.05 },
        bollinger: { upper: 10.50, middle: 9.80, lower: 9.10 }
      });

      await stockController.getStockDetail(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            stock: expect.objectContaining({
              code: '000001',
              name: '平安银行'
            }),
            realtimeData: expect.any(Object),
            klineData: expect.any(Array),
            technicalIndicators: expect.any(Object)
          })
        })
      );
    });

    it('股票不存在时应该返回404', async () => {
      const req = global.mockRequest({
        params: { stockCode: '999999' }
      });
      const res = global.mockResponse();

      // 模拟股票不存在
      stockRepository.findOne.mockResolvedValue(null);

      await stockController.getStockDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND_001'
          })
        })
      );
    });
  });

  describe('getStockPerformance', () => {
    it('应该成功获取股票表现', async () => {
      const req = global.mockRequest({
        params: { stockCode: '000001' },
        query: { period: '1m' }
      });
      const res = global.mockResponse();

      // 模拟股票查询
      stockRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001',
        name: '平安银行'
      });

      // 模拟表现数据
      stockRepository.getStockPerformance.mockResolvedValue({
        periodReturn: 0.15,
        volatility: 0.25,
        sharpeRatio: 0.60,
        maxDrawdown: -0.08,
        winRate: 0.55,
        avgReturn: 0.005,
        benchmarkComparison: 0.02
      });

      await stockController.getStockPerformance(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            performance: expect.objectContaining({
              periodReturn: expect.any(Number)
            })
          })
        })
      );
    });
  });

  describe('getMarketData', () => {
    it('应该成功获取市场数据', async () => {
      const req = global.mockRequest({
        query: {}
      });
      const res = global.mockResponse();

      // 模拟市场数据
      dataService.getMarketStats.mockResolvedValue({
        totalStocks: 5000,
        advancing: 3000,
        declining: 1500,
        unchanged: 500,
        totalVolume: 1000000000,
        totalAmount: 10000000000.00,
        marketSentiment: 'bullish',
        timestamp: new Date().toISOString()
      });

      // 模拟涨幅榜
      stockRepository.getTopGainers.mockResolvedValue([
        {
          code: '000001',
          name: '平安银行',
          changePercent: '10.00',
          currentPrice: '11.00'
        }
      ]);

      // 模拟跌幅榜
      stockRepository.getTopLosers.mockResolvedValue([
        {
          code: '000002',
          name: '万科A',
          changePercent: '-5.00',
          currentPrice: '9.50'
        }
      ]);

      // 模拟活跃榜
      stockRepository.getMostActive.mockResolvedValue([
        {
          code: '000001',
          name: '平安银行',
          volume: 1000000,
          amount: 11000000.00
        }
      ]);

      await stockController.getMarketData(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            marketStats: expect.any(Object),
            topGainers: expect.any(Array),
            topLosers: expect.any(Array),
            mostActive: expect.any(Array)
          })
        })
      );
    });
  });

  describe('getKlineData', () => {
    it('应该成功获取K线数据', async () => {
      const req = global.mockRequest({
        params: { stockCode: '000001' },
        query: { period: '1d', interval: '1h' }
      });
      const res = global.mockResponse();

      // 模拟股票查询
      stockRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001',
        name: '平安银行'
      });

      // 模拟K线数据
      dataService.getKlineData.mockResolvedValue([
        {
          time: '2024-01-01 09:30',
          open: 9.90,
          high: 10.20,
          low: 9.80,
          close: 10.00,
          volume: 100000
        }
      ]);

      await stockController.getKlineData(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            klineData: expect.any(Array)
          })
        })
      );
    });

    it('无效的周期参数时应该返回400', async () => {
      const req = global.mockRequest({
        params: { stockCode: '000001' },
        query: { period: 'invalid', interval: '1h' }
      });
      const res = global.mockResponse();

      // 模拟股票查询
      stockRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001',
        name: '平安银行'
      });

      await stockController.getKlineData(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR'
          })
        })
      );
    });
  });

  describe('getTechnicalIndicators', () => {
    it('应该成功获取技术指标', async () => {
      const req = global.mockRequest({
        params: { stockCode: '000001' },
        query: { period: '1m' }
      });
      const res = global.mockResponse();

      // 模拟股票查询
      stockRepository.findOne.mockResolvedValue({
        id: 1,
        code: '000001',
        name: '平安银行'
      });

      // 模拟技术指标
      dataService.getTechnicalIndicators.mockResolvedValue({
        ma5: 9.80,
        ma10: 9.70,
        ma20: 9.60,
        rsi: 65.5,
        macd: { value: 0.15, signal: 0.10, histogram: 0.05 },
        bollinger: { upper: 10.50, middle: 9.80, lower: 9.10 },
        stochastic: { k: 75.2, d: 70.8 },
        atr: 0.25
      });

      await stockController.getTechnicalIndicators(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            indicators: expect.objectContaining({
              ma5: expect.any(Number)
            })
          })
        })
      );
    });
  });
});