import { VirtualTradingService } from '../../src/services/VirtualTradingService.js';
import { tradeRepository } from '../../src/models/index.js';
import { aiAccountRepository } from '../../src/models/index.js';
import { portfolioRepository } from '../../src/models/index.js';
import { dataService } from '../../src/services/DataService.js';
import { webSocketService } from '../../src/services/WebSocketService.js';

// 模拟依赖
jest.mock('../../src/models/index.js', () => ({
  tradeRepository: {
    prisma: {
      stock: {
        findUnique: jest.fn()
      }
    },
    findMany: jest.fn(),
    findOne: jest.fn(),
    executeTrade: jest.fn(),
    update: jest.fn()
  },
  aiAccountRepository: {
    findOne: jest.fn(),
    updateBalance: jest.fn(),
    calculateTotalValue: jest.fn()
  },
  portfolioRepository: {
    findOne: jest.fn(),
    updatePositionOnBuy: jest.fn(),
    updatePositionOnSell: jest.fn()
  }
}));

jest.mock('../../src/services/DataService.js', () => ({
  dataService: {
    getRealtimeData: jest.fn()
  }
}));

jest.mock('../../src/services/WebSocketService.js', () => ({
  webSocketService: {
    broadcastTradeNotification: jest.fn()
  }
}));

describe('VirtualTradingService', () => {
  let tradingService;

  beforeEach(() => {
    tradingService = new VirtualTradingService();
    jest.clearAllMocks();
  });

  describe('validateTradeOrder', () => {
    it('应该成功验证买入订单', async () => {
      const tradeData = {
        accountId: 1,
        stockId: 1,
        tradeType: 'buy',
        orderType: 'market',
        quantity: 100,
        price: 10.00
      };

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        status: 'active',
        currentBalance: '20000.00'
      });

      // 模拟股票查询
      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: '000001',
        status: 'normal'
      });

      // 模拟实时数据
      dataService.getRealtimeData.mockResolvedValue({
        price: 10.00,
        timestamp: new Date().toISOString()
      });

      const result = await tradingService.validateTradeOrder(tradeData);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('账户余额不足时应该验证失败', async () => {
      const tradeData = {
        accountId: 1,
        stockId: 1,
        tradeType: 'buy',
        orderType: 'market',
        quantity: 10000, // 大量买入
        price: 10.00
      };

      // 模拟账户查询（余额不足）
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        status: 'active',
        currentBalance: '1000.00' // 余额不足
      });

      // 模拟股票查询
      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: '000001',
        status: 'normal'
      });

      const result = await tradingService.validateTradeOrder(tradeData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('账户余额不足');
    });

    it('股票不可交易时应该验证失败', async () => {
      const tradeData = {
        accountId: 1,
        stockId: 1,
        tradeType: 'buy',
        orderType: 'market',
        quantity: 100,
        price: 10.00
      };

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        status: 'active',
        currentBalance: '20000.00'
      });

      // 模拟股票查询（状态异常）
      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: '000001',
        status: 'suspended' // 停牌
      });

      const result = await tradingService.validateTradeOrder(tradeData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('股票不可交易');
    });

    it('应该成功验证卖出订单', async () => {
      const tradeData = {
        accountId: 1,
        stockId: 1,
        tradeType: 'sell',
        orderType: 'market',
        quantity: 100,
        price: 10.00
      };

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        status: 'active',
        currentBalance: '20000.00'
      });

      // 模拟股票查询
      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: '000001',
        status: 'normal'
      });

      // 模拟持仓查询
      portfolioRepository.findOne.mockResolvedValue({
        accountId: 1,
        stockId: 1,
        quantity: 500 // 有足够持仓
      });

      // 模拟最近买入记录（T+1检查）
      tradeRepository.findMany.mockResolvedValue([]);

      const result = await tradingService.validateTradeOrder(tradeData);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('持仓不足时应该验证失败', async () => {
      const tradeData = {
        accountId: 1,
        stockId: 1,
        tradeType: 'sell',
        orderType: 'market',
        quantity: 1000, // 大量卖出
        price: 10.00
      };

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        status: 'active',
        currentBalance: '20000.00'
      });

      // 模拟股票查询
      tradeRepository.prisma.stock.findUnique.mockResolvedValue({
        id: 1,
        code: '000001',
        status: 'normal'
      });

      // 模拟持仓查询（持仓不足）
      portfolioRepository.findOne.mockResolvedValue({
        accountId: 1,
        stockId: 1,
        quantity: 500 // 持仓不足
      });

      const result = await tradingService.validateTradeOrder(tradeData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('持仓不足');
    });
  });

  describe('executeTradeOrder', () => {
    it('应该成功执行买入订单', async () => {
      const tradeId = 1;

      // 模拟交易查询
      tradeRepository.findOne.mockResolvedValue({
        id: 1,
        accountId: 1,
        stockId: 1,
        tradeType: 'buy',
        orderType: 'market',
        quantity: 100,
        price: '10.00',
        status: 'pending',
        account: {
          id: 1,
          status: 'active'
        },
        stock: {
          id: 1,
          code: '000001',
          status: 'normal'
        }
      });

      // 模拟验证结果
      const mockValidateTradeOrder = jest.spyOn(tradingService, 'validateTradeOrder');
      mockValidateTradeOrder.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        validationData: {
          account: { id: 1, currentBalance: '20000.00' },
          stock: { id: 1, code: '000001' },
          amount: 1000.00,
          commission: 1.00,
          totalCost: 1001.00
        }
      });

      // 模拟执行价格
      const mockGetExecutionPrice = jest.spyOn(tradingService, 'getExecutionPrice');
      mockGetExecutionPrice.mockResolvedValue(10.00);

      const result = await tradingService.executeTradeOrder(tradeId);

      expect(result.success).toBe(true);
      expect(result.tradeId).toBe(tradeId);
      expect(tradeRepository.executeTrade).toHaveBeenCalled();
      expect(webSocketService.broadcastTradeNotification).toHaveBeenCalled();

      mockValidateTradeOrder.mockRestore();
      mockGetExecutionPrice.mockRestore();
    });

    it('应该成功执行卖出订单', async () => {
      const tradeId = 1;

      // 模拟交易查询
      tradeRepository.findOne.mockResolvedValue({
        id: 1,
        accountId: 1,
        stockId: 1,
        tradeType: 'sell',
        orderType: 'market',
        quantity: 100,
        price: '10.00',
        status: 'pending',
        account: {
          id: 1,
          status: 'active'
        },
        stock: {
          id: 1,
          code: '000001',
          status: 'normal'
        }
      });

      // 模拟验证结果
      const mockValidateTradeOrder = jest.spyOn(tradingService, 'validateTradeOrder');
      mockValidateTradeOrder.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        validationData: {
          account: { id: 1, currentBalance: '20000.00' },
          stock: { id: 1, code: '000001' },
          amount: 1000.00,
          commission: 1.00
        }
      });

      // 模拟执行价格
      const mockGetExecutionPrice = jest.spyOn(tradingService, 'getExecutionPrice');
      mockGetExecutionPrice.mockResolvedValue(10.00);

      const result = await tradingService.executeTradeOrder(tradeId);

      expect(result.success).toBe(true);
      expect(result.tradeId).toBe(tradeId);
      expect(tradeRepository.executeTrade).toHaveBeenCalled();
      expect(webSocketService.broadcastTradeNotification).toHaveBeenCalled();

      mockValidateTradeOrder.mockRestore();
      mockGetExecutionPrice.mockRestore();
    });

    it('交易验证失败时应该抛出错误', async () => {
      const tradeId = 1;

      // 模拟交易查询
      tradeRepository.findOne.mockResolvedValue({
        id: 1,
        accountId: 1,
        stockId: 1,
        tradeType: 'buy',
        orderType: 'market',
        quantity: 100,
        price: '10.00',
        status: 'pending',
        account: {
          id: 1,
          status: 'active'
        },
        stock: {
          id: 1,
          code: '000001',
          status: 'normal'
        }
      });

      // 模拟验证失败
      const mockValidateTradeOrder = jest.spyOn(tradingService, 'validateTradeOrder');
      mockValidateTradeOrder.mockResolvedValue({
        valid: false,
        errors: ['账户余额不足'],
        warnings: []
      });

      await expect(tradingService.executeTradeOrder(tradeId)).rejects.toThrow();

      expect(tradeRepository.update).toHaveBeenCalledWith(
        tradeId,
        expect.objectContaining({
          status: 'rejected',
          reason: expect.stringContaining('交易验证失败')
        })
      );

      mockValidateTradeOrder.mockRestore();
    });
  });

  describe('getExecutionPrice', () => {
    it('市价单应该使用实时价格', async () => {
      const stockCode = '000001';
      const orderPrice = 10.00;
      const orderType = 'market';
      const tradeType = 'buy';

      // 模拟实时数据
      dataService.getRealtimeData.mockResolvedValue({
        price: 10.50,
        timestamp: new Date().toISOString()
      });

      const price = await tradingService.getExecutionPrice(stockCode, orderPrice, orderType, tradeType);

      expect(price).toBe(10.50);
      expect(dataService.getRealtimeData).toHaveBeenCalledWith(stockCode);
    });

    it('限价单应该使用订单价格', async () => {
      const stockCode = '000001';
      const orderPrice = 10.00;
      const orderType = 'limit';
      const tradeType = 'buy';

      const price = await tradingService.getExecutionPrice(stockCode, orderPrice, orderType, tradeType);

      expect(price).toBe(orderPrice);
      expect(dataService.getRealtimeData).not.toHaveBeenCalled();
    });

    it('获取实时价格失败时应该使用订单价格', async () => {
      const stockCode = '000001';
      const orderPrice = 10.00;
      const orderType = 'market';
      const tradeType = 'buy';

      // 模拟实时数据失败
      dataService.getRealtimeData.mockRejectedValue(new Error('网络错误'));

      const price = await tradingService.getExecutionPrice(stockCode, orderPrice, orderType, tradeType);

      expect(price).toBe(orderPrice);
    });
  });

  describe('calculateCommission', () => {
    it('应该正确计算佣金', () => {
      const amount = 10000.00;
      const commission = tradingService.calculateCommission(amount);

      // 佣金费率0.1%，最低1元
      const expectedCommission = Math.max(amount * 0.001, 1);
      expect(commission).toBe(expectedCommission);
    });

    it('小金额交易应该使用最低佣金', () => {
      const amount = 500.00; // 佣金0.5元，但最低1元
      const commission = tradingService.calculateCommission(amount);

      expect(commission).toBe(1); // 最低佣金
    });
  });

  describe('calculateStampDuty', () => {
    it('应该正确计算印花税', () => {
      const amount = 10000.00;
      const stampDuty = tradingService.calculateStampDuty(amount);

      // 印花税率0.1%
      const expectedStampDuty = amount * 0.001;
      expect(stampDuty).toBe(expectedStampDuty);
    });
  });

  describe('isTradingTime', () => {
    it('应该在交易时间内返回true', () => {
      // 模拟交易时间（09:30-15:00）
      const mockDate = new Date('2024-01-01T10:00:00');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const isTrading = tradingService.isTradingTime();
      expect(isTrading).toBe(true);

      jest.restoreAllMocks();
    });

    it('应该在非交易时间返回false', () => {
      // 模拟非交易时间（08:00）
      const mockDate = new Date('2024-01-01T08:00:00');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const isTrading = tradingService.isTradingTime();
      expect(isTrading).toBe(false);

      jest.restoreAllMocks();
    });
  });

  describe('executePendingOrders', () => {
    it('应该批量执行待处理订单', async () => {
      // 模拟待处理订单
      tradeRepository.findMany.mockResolvedValue([
        { id: 1, status: 'pending', orderType: 'market' },
        { id: 2, status: 'pending', orderType: 'market' }
      ]);

      // 模拟交易时间
      const mockIsTradingTime = jest.spyOn(tradingService, 'isTradingTime');
      mockIsTradingTime.mockReturnValue(true);

      // 模拟执行交易
      const mockExecuteTradeOrder = jest.spyOn(tradingService, 'executeTradeOrder');
      mockExecuteTradeOrder.mockResolvedValue({ success: true });

      const results = await tradingService.executePendingOrders();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].tradeId).toBe(1);

      mockIsTradingTime.mockRestore();
      mockExecuteTradeOrder.mockRestore();
    });

    it('非交易时间应该不执行订单', async () => {
      // 模拟待处理订单
      tradeRepository.findMany.mockResolvedValue([
        { id: 1, status: 'pending', orderType: 'market' }
      ]);

      // 模拟非交易时间
      const mockIsTradingTime = jest.spyOn(tradingService, 'isTradingTime');
      mockIsTradingTime.mockReturnValue(false);

      const results = await tradingService.executePendingOrders();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].reason).toBe('非交易时间');

      mockIsTradingTime.mockRestore();
    });
  });
});