import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  TradeExecutionService,
  TradeExecutionError,
  TradeResultCode,
  tradeExecutionService
} from '../../../src/services/TradeExecutionService.js';

describe('TradeExecutionService Unit Tests', () => {
  let service;

  beforeEach(() => {
    service = new TradeExecutionService();
    service.executedDecisions.clear();
    jest.clearAllMocks();
  });

  describe('Decision Validation', () => {
    it('should reject decision without decisionId', async () => {
      const decision = {
        accountId: '123',
        action: 'buy',
        symbol: '000001',
        quantity: 100,
        price: 10.5
      };

      const result = await service.executeDecision(decision);

      expect(result.success).toBe(false);
      expect(result.code).toBe(TradeResultCode.INVALID_ACTION);
      expect(result.errors).toContain('缺少决策ID');
    });

    it('should reject decision without accountId', async () => {
      const decision = {
        decisionId: 'dec-001',
        action: 'buy',
        symbol: '000001',
        quantity: 100,
        price: 10.5
      };

      const result = await service.executeDecision(decision);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('缺少账户ID');
    });

    it('should reject decision without action', async () => {
      const decision = {
        decisionId: 'dec-001',
        accountId: '123',
        symbol: '000001',
        quantity: 100,
        price: 10.5
      };

      const result = await service.executeDecision(decision);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('缺少交易动作');
    });

    it('should reject decision without symbol', async () => {
      const decision = {
        decisionId: 'dec-001',
        accountId: '123',
        action: 'buy',
        quantity: 100,
        price: 10.5
      };

      const result = await service.executeDecision(decision);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('缺少股票代码');
    });

    it('should reject decision with invalid quantity', async () => {
      const decision = {
        decisionId: 'dec-001',
        accountId: '123',
        action: 'buy',
        symbol: '000001',
        quantity: 0,
        price: 10.5
      };

      const result = await service.executeDecision(decision);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('交易数量必须大于0');
    });

    it('should reject decision with invalid price', async () => {
      const decision = {
        decisionId: 'dec-001',
        accountId: '123',
        action: 'buy',
        symbol: '000001',
        quantity: 100,
        price: -5
      };

      const result = await service.executeDecision(decision);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('交易价格必须大于0');
    });
  });

  describe('Idempotency Check', () => {
    it('should reject duplicate decision from cache', async () => {
      const decisionId = 'dec-duplicate-001';
      service.executedDecisions.add(decisionId);

      const decision = {
        decisionId,
        accountId: '123',
        action: 'buy',
        symbol: '000001',
        quantity: 100,
        price: 10.5
      };

      const result = await service.executeDecision(decision);

      expect(result.success).toBe(false);
      expect(result.code).toBe(TradeResultCode.DUPLICATE_DECISION);
    });
  });

  describe('Cache Management', () => {
    it('should limit cache size', () => {
      service.maxCacheSize = 3;

      service.markDecisionExecuted('dec-001', 1001);
      service.markDecisionExecuted('dec-002', 1002);
      service.markDecisionExecuted('dec-003', 1003);

      expect(service.executedDecisions.size).toBe(3);

      // Adding one more should evict the oldest
      service.markDecisionExecuted('dec-004', 1004);

      expect(service.executedDecisions.size).toBe(3);
      expect(service.executedDecisions.has('dec-001')).toBe(false);
      expect(service.executedDecisions.has('dec-004')).toBe(true);
    });

    it('should clear cache', () => {
      service.markDecisionExecuted('dec-001', 1001);
      service.markDecisionExecuted('dec-002', 1002);

      expect(service.executedDecisions.size).toBe(2);

      service.clearCache();

      expect(service.executedDecisions.size).toBe(0);
    });
  });

  describe('Stats', () => {
    it('should return correct stats', () => {
      service.markDecisionExecuted('dec-001', 1001);
      service.markDecisionExecuted('dec-002', 1002);

      const stats = service.getStats();

      expect(stats.cachedDecisions).toBe(2);
      expect(stats.maxCacheSize).toBe(10000);
    });
  });

  describe('Singleton Instance', () => {
    it('should export singleton instance', () => {
      expect(tradeExecutionService).toBeInstanceOf(TradeExecutionService);
    });
  });
});

describe('TradeExecutionError', () => {
  it('should create error with correct properties', () => {
    const error = new TradeExecutionError('TEST_ERROR', 'Test message', { detail: 'test' });

    expect(error.name).toBe('TradeExecutionError');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.details).toEqual({ detail: 'test' });
    expect(error.timestamp).toBeDefined();
  });
});

describe('TradeResultCode', () => {
  it('should have all required result codes', () => {
    expect(TradeResultCode.SUCCESS).toBe('SUCCESS');
    expect(TradeResultCode.INSUFFICIENT_BALANCE).toBe('INSUFFICIENT_BALANCE');
    expect(TradeResultCode.INSUFFICIENT_POSITION).toBe('INSUFFICIENT_POSITION');
    expect(TradeResultCode.INVALID_ACTION).toBe('INVALID_ACTION');
    expect(TradeResultCode.ACCOUNT_NOT_FOUND).toBe('ACCOUNT_NOT_FOUND');
    expect(TradeResultCode.STOCK_NOT_FOUND).toBe('STOCK_NOT_FOUND');
    expect(TradeResultCode.DUPLICATE_DECISION).toBe('DUPLICATE_DECISION');
    expect(TradeResultCode.EXECUTION_FAILED).toBe('EXECUTION_FAILED');
  });
});
