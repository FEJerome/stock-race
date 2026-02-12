import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { tradeController } from '../../src/controllers/TradeController.js';
import { tradeRepository } from '../../src/models/index.js';
import { aiAccountRepository } from '../../src/models/index.js';
import { systemLogRepository } from '../../src/models/index.js';
import { virtualTradingService } from '../../src/services/VirtualTradingService.js';

// 模拟依赖
jest.mock('../../src/models/index.js', () => ({
  tradeRepository: {
    prisma: {
      stock: {
        findUnique: jest.fn()
      }
    },
    paginate: jest.fn(),
    findOne: jest.fn(),
    createTrade: jest.fn(),
    executeTrade: jest.fn(),
    cancelTrade: jest.fn(),
    update: jest.fn(),
    getTradePerformance: jest.fn(),
    getTodayTradeStats: jest.fn(),
    getTradeTrendStats: jest.fn(),
    getHotTradingStocks: jest.fn()
  },
  aiAccountRepository: {
    findOne: jest.fn(),
    getUserAccounts: jest.fn(),
    updateBalance: jest.fn(),
    calculateTotalValue: jest.fn()
  },
  portfolioRepository: {
    updatePositionOnBuy: jest.fn(),
    updatePositionOnSell: jest.fn()
  },
  systemLogRepository: {
    logUserActivity: jest.fn()
  }
}));

jest.mock('../../src/services/VirtualTradingService.js', () => ({
  virtualTradingService: {
    validateTradeOrder: jest.fn(),
    executeTradeOrder: jest.fn()
  }
}));

describe('TradeController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTrades', () => {
    it('应该成功获取交易记录', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        query: { page: 1, limit: 20 }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.getUserAccounts.mockResolvedValue([
        { id: 1, name: '测试账户' }
      ]);

      // 模拟交易记录查询
      tradeRepository.paginate.mockResolvedValue({
        data: [
          {
            id: 1,
            accountId: 1,
            account: { name: '测试账户', user: { id: 1, username: 'testuser' } },
            stock: { code: '000001', name: '平安银行' },
            tradeType: 'buy',
            orderType: 'market',
            quantity: 100,
            price: '10.00',
            amount: '1000.00',
            fee: '1.00',
            netAmount: '1001.00',
            status: 'executed',
            reason: '手动交易',
            executedAt: new Date(),
            createdAt: new Date()
          }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          pages: 1
        }
      });

      await tradeController.getTrades(req, res);

      expect(res.status).not.toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            trades: expect.arrayContaining([
              expect.objectContaining({
                id: 1,
                accountId: 1,
                stockCode: '000001',
                tradeType: 'buy'
              })
            ])
          })
        })
      );
    });

    it('用户未认证时应该返回401', async () => {
      const req = global.mockRequest({ user: null });
      const res = global.mockResponse();

      await tradeController.getTrades(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'AUTH_001'
          })
        })
      );
    });
  });

  describe('createTrade', () => {
    it('应该成功创建买入交易订单', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        body: {
          accountId: 1,
          stockCode: '000001',
          tradeType: 'buy',
          orderType: 'market',
          quantity: 100,
          price: 10.00,
          reason: '测试买入'
        }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户'
      });

      // 模拟股票查询
      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: '000001',
        name: '平安银行'
      });

      // 模拟交易验证
      virtualTradingService.validateTradeOrder.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      // 模拟交易创建
      tradeRepository.createTrade.mockResolvedValue({
        id: 1,
        accountId: 1,
        stockId: 1,
        tradeType: 'buy',
        orderType: 'market',
        quantity: 100,
        price: 10.00,
        amount: 1000.00,
        fee: 0,
        netAmount: 1000.00,
        status: 'pending',
        reason: '测试买入',
        createdAt: new Date()
      });

      // 模拟交易执行
      virtualTradingService.executeTradeOrder.mockResolvedValue({
        success: true,
        tradeId: 1
      });

      await tradeController.createTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            trade: expect.objectContaining({
              id: 1,
              accountId: 1,
              stockCode: '000001',
              tradeType: 'buy'
            })
          })
        })
      );
    });

    it('缺少必要参数时应该返回400', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        body: {
          accountId: 1,
          // 缺少stockCode
          tradeType: 'buy',
          quantity: 100,
          price: 10.00
        }
      });
      const res = global.mockResponse();

      await tradeController.createTrade(req, res);

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

    it('交易验证失败时应该返回400', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        body: {
          accountId: 1,
          stockCode: '000001',
          tradeType: 'buy',
          orderType: 'market',
          quantity: 100,
          price: 10.00
        }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户'
      });

      // 模拟股票查询
      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: '000001',
        name: '平安银行'
      });

      // 模拟交易验证失败
      virtualTradingService.validateTradeOrder.mockResolvedValue({
        valid: false,
        errors: ['账户余额不足'],
        warnings: []
      });

      await tradeController.createTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'TRADING_001'
          })
        })
      );
    });
  });

  describe('getTradeDetail', () => {
    it('应该成功获取交易详情', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { tradeId: '1' }
      });
      const res = global.mockResponse();

      // 模拟交易查询
      tradeRepository.findOne.mockResolvedValue({
        id: 1,
        accountId: 1,
        account: {
          userId: 1,
          name: '测试账户',
          user: { id: 1, username: 'testuser' }
        },
        stock: { code: '000001', name: '平安银行' },
        tradeType: 'buy',
        orderType: 'market',
        quantity: 100,
        price: '10.00',
        amount: '1000.00',
        fee: '1.00',
        netAmount: '1001.00',
        status: 'executed',
        reason: '手动交易',
        executedAt: new Date(),
        createdAt: new Date(),
        decisionLogs: []
      });

      await tradeController.getTradeDetail(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            trade: expect.objectContaining({
              id: 1,
              accountId: 1,
              stockCode: '000001'
            })
          })
        })
      );
    });

    it('交易不存在时应该返回404', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { tradeId: '999' }
      });
      const res = global.mockResponse();

      // 模拟交易不存在
      tradeRepository.findOne.mockResolvedValue(null);

      await tradeController.getTradeDetail(req, res);

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

  describe('cancelTrade', () => {
    it('应该成功取消交易订单', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { tradeId: '1' },
        body: { reason: '测试取消' }
      });
      const res = global.mockResponse();

      // 模拟交易查询
      tradeRepository.findOne.mockResolvedValue({
        id: 1,
        accountId: 1,
        account: { userId: 1 },
        status: 'pending'
      });

      // 模拟取消交易
      tradeRepository.cancelTrade.mockResolvedValue(true);

      await tradeController.cancelTrade(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: '取消交易订单成功'
        })
      );
    });

    it('交易状态不可取消时应该返回400', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { tradeId: '1' }
      });
      const res = global.mockResponse();

      // 模拟已执行的交易
      tradeRepository.findOne.mockResolvedValue({
        id: 1,
        accountId: 1,
        account: { userId: 1 },
        status: 'executed'
      });

      await tradeController.cancelTrade(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'TRADING_003'
          })
        })
      );
    });
  });

  describe('getTradeStats', () => {
    it('应该成功获取交易统计', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        query: {}
      });
      const res = global.mockResponse();

      // 模拟统计查询
      tradeRepository.getTradePerformance.mockResolvedValue({
        totalTrades: 10,
        winRate: 0.6,
        totalReturn: 0.15,
        sharpeRatio: 1.2
      });

      tradeRepository.getTodayTradeStats.mockResolvedValue({
        todayTrades: 3,
        todayVolume: 300,
        todayAmount: 3000.00
      });

      tradeRepository.getTradeTrendStats.mockResolvedValue([
        { date: '2024-01-01', trades: 2, volume: 200, amount: 2000.00 }
      ]);

      await tradeController.getTradeStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            performance: expect.any(Object),
            todayStats: expect.any(Object),
            trendStats: expect.any(Array)
          })
        })
      );
    });
  });

  describe('getHotTradingStocks', () => {
    it('应该成功获取热门交易股票', async () => {
      const req = global.mockRequest({
        query: { days: 7, limit: 10 }
      });
      const res = global.mockResponse();

      // 模拟热门股票查询
      tradeRepository.getHotTradingStocks.mockResolvedValue([
        {
          stock: {
            code: '000001',
            name: '平安银行',
            market: 'SZ',
            industry: '银行'
          },
          tradeCount: 50,
          totalQuantity: 5000,
          totalAmount: '50000.00'
        }
      ]);

      await tradeController.getHotTradingStocks(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hotStocks: expect.arrayContaining([
              expect.objectContaining({
                stock: expect.objectContaining({
                  code: '000001',
                  name: '平安银行'
                })
              })
            ])
          })
        })
      );
    });
  });
});