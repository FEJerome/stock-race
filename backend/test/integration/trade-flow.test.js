import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { tradeRepository } from '../../src/models/index.js';
import { aiAccountRepository } from '../../src/models/index.js';
import { portfolioRepository } from '../../src/models/index.js';
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
    findOne: jest.fn(),
    updatePositionOnBuy: jest.fn(),
    updatePositionOnSell: jest.fn()
  }
}));

jest.mock('../../src/services/VirtualTradingService.js', () => ({
  virtualTradingService: {
    validateTradeOrder: jest.fn(),
    executeTradeOrder: jest.fn()
  }
}));

describe('交易流程集成测试', () => {
  let authToken;

  beforeAll(() => {
    // 设置测试token
    authToken = 'test-jwt-token';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('完整的交易流程', () => {
    it('应该完成从创建到执行的完整买入流程', async () => {
      const accountId = 1;
      const stockCode = '000001';
      const quantity = 100;
      const price = 10.00;

      // 1. 模拟获取交易记录（初始状态）
      aiAccountRepository.getUserAccounts.mockResolvedValue([
        { id: accountId, name: '测试账户' }
      ]);
      tradeRepository.paginate.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 }
      });

      const initialResponse = await request(app)
        .get('/api/trades')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ accountId });

      expect(initialResponse.status).toBe(200);
      expect(initialResponse.body.data.trades).toHaveLength(0);

      // 2. 模拟创建买入订单
      aiAccountRepository.findOne.mockResolvedValue({
        id: accountId,
        userId: 1,
        name: '测试账户',
        status: 'active'
      });

      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: stockCode,
        name: '平安银行',
        status: 'normal'
      });

      virtualTradingService.validateTradeOrder.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      tradeRepository.createTrade.mockResolvedValue({
        id: 1,
        accountId,
        stockId: 1,
        tradeType: 'buy',
        orderType: 'market',
        quantity,
        price,
        amount: quantity * price,
        fee: 0,
        netAmount: quantity * price,
        status: 'pending',
        reason: '测试买入',
        createdAt: new Date()
      });

      virtualTradingService.executeTradeOrder.mockResolvedValue({
        success: true,
        tradeId: 1,
        executionResult: {
          executionPrice: price,
          actualAmount: quantity * price,
          actualFee: 1.00
        },
        timestamp: new Date().toISOString()
      });

      const createResponse = await request(app)
        .post('/api/trades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          accountId,
          stockCode,
          tradeType: 'buy',
          orderType: 'market',
          quantity,
          price,
          reason: '测试买入'
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.trade.id).toBe(1);
      expect(createResponse.body.data.trade.status).toBe('pending');

      // 3. 模拟获取交易详情
      tradeRepository.findOne.mockResolvedValue({
        id: 1,
        accountId,
        account: {
          userId: 1,
          name: '测试账户',
          user: { id: 1, username: 'testuser' }
        },
        stock: {
          id: 1,
          code: stockCode,
          name: '平安银行'
        },
        tradeType: 'buy',
        orderType: 'market',
        quantity,
        price: price.toString(),
        amount: (quantity * price).toString(),
        fee: '1.00',
        netAmount: (quantity * price + 1).toString(),
        status: 'executed',
        reason: '测试买入',
        executedAt: new Date(),
        createdAt: new Date(),
        decisionLogs: []
      });

      const detailResponse = await request(app)
        .get('/api/trades/1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.data.trade.id).toBe(1);
      expect(detailResponse.body.data.trade.status).toBe('executed');

      // 4. 模拟获取更新后的交易记录
      tradeRepository.paginate.mockResolvedValue({
        data: [
          {
            id: 1,
            accountId,
            account: { name: '测试账户', user: { id: 1, username: 'testuser' } },
            stock: { code: stockCode, name: '平安银行' },
            tradeType: 'buy',
            orderType: 'market',
            quantity,
            price: price.toString(),
            amount: (quantity * price).toString(),
            fee: '1.00',
            netAmount: (quantity * price + 1).toString(),
            status: 'executed',
            reason: '测试买入',
            executedAt: new Date(),
            createdAt: new Date()
          }
        ],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      });

      const finalResponse = await request(app)
        .get('/api/trades')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ accountId });

      expect(finalResponse.status).toBe(200);
      expect(finalResponse.body.data.trades).toHaveLength(1);
      expect(finalResponse.body.data.trades[0].status).toBe('executed');
    });

    it('应该完成卖出流程', async () => {
      const accountId = 1;
      const stockCode = '000001';
      const quantity = 50; // 卖出部分持仓
      const price = 11.00; // 卖出价格高于买入价格

      // 1. 模拟创建卖出订单
      aiAccountRepository.findOne.mockResolvedValue({
        id: accountId,
        userId: 1,
        name: '测试账户',
        status: 'active'
      });

      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: stockCode,
        name: '平安银行',
        status: 'normal'
      });

      // 模拟有足够持仓
      portfolioRepository.findOne.mockResolvedValue({
        accountId,
        stockId: 1,
        quantity: 100 // 有足够持仓
      });

      virtualTradingService.validateTradeOrder.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: []
      });

      tradeRepository.createTrade.mockResolvedValue({
        id: 2,
        accountId,
        stockId: 1,
        tradeType: 'sell',
        orderType: 'market',
        quantity,
        price,
        amount: quantity * price,
        fee: 0,
        netAmount: quantity * price,
        status: 'pending',
        reason: '测试卖出',
        createdAt: new Date()
      });

      virtualTradingService.executeTradeOrder.mockResolvedValue({
        success: true,
        tradeId: 2,
        executionResult: {
          executionPrice: price,
          actualAmount: quantity * price,
          actualFee: 1.10, // 卖出有印花税
          commission: 1.10,
          stampDuty: 0.55,
          netAmount: quantity * price - 1.65
        },
        timestamp: new Date().toISOString()
      });

      const createResponse = await request(app)
        .post('/api/trades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          accountId,
          stockCode,
          tradeType: 'sell',
          orderType: 'market',
          quantity,
          price,
          reason: '测试卖出'
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.trade.tradeType).toBe('sell');
    });
  });

  describe('错误处理流程', () => {
    it('账户余额不足时应该拒绝买入', async () => {
      const accountId = 1;
      const stockCode = '000001';
      const quantity = 10000; // 大量买入
      const price = 10.00;

      // 模拟账户查询（余额不足）
      aiAccountRepository.findOne.mockResolvedValue({
        id: accountId,
        userId: 1,
        name: '测试账户',
        status: 'active'
      });

      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: stockCode,
        name: '平安银行',
        status: 'normal'
      });

      // 模拟验证失败（余额不足）
      virtualTradingService.validateTradeOrder.mockResolvedValue({
        valid: false,
        errors: ['账户余额不足'],
        warnings: []
      });

      const response = await request(app)
        .post('/api/trades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          accountId,
          stockCode,
          tradeType: 'buy',
          orderType: 'market',
          quantity,
          price
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TRADING_001');
    });

    it('持仓不足时应该拒绝卖出', async () => {
      const accountId = 1;
      const stockCode = '000001';
      const quantity = 1000; // 大量卖出
      const price = 10.00;

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: accountId,
        userId: 1,
        name: '测试账户',
        status: 'active'
      });

      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: stockCode,
        name: '平安银行',
        status: 'normal'
      });

      // 模拟持仓不足
      portfolioRepository.findOne.mockResolvedValue({
        accountId,
        stockId: 1,
        quantity: 500 // 持仓不足
      });

      // 模拟验证失败（持仓不足）
      virtualTradingService.validateTradeOrder.mockResolvedValue({
        valid: false,
        errors: ['持仓不足'],
        warnings: []
      });

      const response = await request(app)
        .post('/api/trades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          accountId,
          stockCode,
          tradeType: 'sell',
          orderType: 'market',
          quantity,
          price
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TRADING_001');
    });

    it('无效的股票代码应该返回404', async () => {
      const accountId = 1;
      const stockCode = 'INVALID';

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: accountId,
        userId: 1,
        name: '测试账户',
        status: 'active'
      });

      // 模拟股票不存在
      tradeRepository.prisma.stock.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/trades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          accountId,
          stockCode,
          tradeType: 'buy',
          orderType: 'market',
          quantity: 100,
          price: 10.00
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND_001');
    });
  });

  describe('交易统计和查询', () => {
    it('应该成功获取交易统计', async () => {
      const accountId = 1;

      // 模拟账户权限验证
      aiAccountRepository.findOne.mockResolvedValue({
        id: accountId,
        userId: 1,
        name: '测试账户'
      });

      // 模拟交易统计
      tradeRepository.getTradePerformance.mockResolvedValue({
        totalTrades: 10,
        winRate: 0.6,
        totalReturn: 0.15,
        sharpeRatio: 1.2,
        maxDrawdown: -0.08,
        avgHoldingPeriod: 5.2
      });

      tradeRepository.getTodayTradeStats.mockResolvedValue({
        todayTrades: 3,
        todayVolume: 300,
        todayAmount: 3000.00,
        todayPnl: 150.00
      });

      tradeRepository.getTradeTrendStats.mockResolvedValue([
        { date: '2024-01-01', trades: 2, volume: 200, amount: 2000.00, pnl: 100.00 }
      ]);

      const response = await request(app)
        .get('/api/trades/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ accountId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.performance).toBeDefined();
      expect(response.body.data.todayStats).toBeDefined();
      expect(response.body.data.trendStats).toBeDefined();
    });

    it('应该成功获取热门交易股票', async () => {
      // 模拟热门股票
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

      const response = await request(app)
        .get('/api/trades/hot-stocks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ days: 7, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.hotStocks).toBeDefined();
      expect(response.body.data.hotStocks).toHaveLength(1);
    });
  });

  describe('交易取消流程', () => {
    it('应该成功取消待处理交易', async () => {
      const tradeId = 1;

      // 模拟交易查询（待处理状态）
      tradeRepository.findOne.mockResolvedValue({
        id: tradeId,
        accountId: 1,
        account: { userId: 1 },
        status: 'pending'
      });

      // 模拟取消交易
      tradeRepository.cancelTrade.mockResolvedValue(true);

      const response = await request(app)
        .post(`/api/trades/${tradeId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: '测试取消' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('取消交易订单成功');
    });

    it('已执行的交易不能取消', async () => {
      const tradeId = 1;

      // 模拟交易查询（已执行状态）
      tradeRepository.findOne.mockResolvedValue({
        id: tradeId,
        accountId: 1,
        account: { userId: 1 },
        status: 'executed'
      });

      const response = await request(app)
        .post(`/api/trades/${tradeId}/cancel`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: '测试取消' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TRADING_003');
    });
  });
});