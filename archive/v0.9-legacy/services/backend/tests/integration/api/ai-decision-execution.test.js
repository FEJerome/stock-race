import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../../../src/app.js';
import { prisma } from '../../../src/models/index.js';

/**
 * AI决策执行集成测试
 * 验证从决策接收到交易执行的完整流程
 *
 * 注意：运行这些测试需要数据库连接
 */

describe('AI Decision Execution Integration Tests', () => {
  const TEST_TIMEOUT = 30000;

  let testAccount;
  let testStock;
  let testUser;

  beforeAll(async () => {
    try {
      // 创建测试用户
      testUser = await prisma.user.create({
        data: {
          email: `test-decision-${Date.now()}@example.com`,
          password: 'testpassword123',
          name: 'Test Decision User'
        }
      });

      // 创建测试AI账户
      testAccount = await prisma.aIAccount.create({
        data: {
          userId: testUser.id,
          name: 'Test AI Account',
          modelType: 'openai_gpt4',
          initialBalance: 100000.00,
          currentBalance: 100000.00,
          totalValue: 100000.00,
          status: 'active',
          tradingFrequency: 'daily',
          riskLevel: 'medium'
        }
      });

      // 创建测试股票
      testStock = await prisma.stock.create({
        data: {
          code: '000001',
          name: '平安银行',
          market: 'SZ',
          industry: '银行',
          currentPrice: 10.50,
          previousClose: 10.30
        }
      });
    } catch (error) {
      console.warn('数据库连接失败，跳过集成测试:', error.message);
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (!testUser) return;

    try {
      // 清理测试数据
      await prisma.trade.deleteMany({
        where: { accountId: testAccount.id }
      });

      await prisma.decisionLog.deleteMany({
        where: { accountId: testAccount.id }
      });

      await prisma.portfolio.deleteMany({
        where: { accountId: testAccount.id }
      });

      await prisma.aIAccount.delete({
        where: { id: testAccount.id }
      });

      await prisma.stock.delete({
        where: { id: testStock.id }
      });

      await prisma.user.delete({
        where: { id: testUser.id }
      });
    } catch (error) {
      console.error('清理测试数据失败:', error);
    }

    await prisma.$disconnect();
  }, TEST_TIMEOUT);

  beforeEach(async () => {
    if (!testAccount) return;

    // 重置账户余额
    await prisma.aIAccount.update({
      where: { id: testAccount.id },
      data: { currentBalance: 100000.00 }
    });

    // 清理交易记录
    await prisma.trade.deleteMany({
      where: { accountId: testAccount.id }
    });

    // 清理持仓
    await prisma.portfolio.deleteMany({
      where: { accountId: testAccount.id }
    });
  }, TEST_TIMEOUT);

  describe('POST /api/internal/ai-decisions', () => {
    it('should execute buy decision successfully', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      const decision = {
        accountId: testAccount.id.toString(),
        decision: {
          decisionId: `buy-dec-${Date.now()}`,
          action: 'buy',
          symbol: '000001',
          quantity: 100,
          price: 10.50,
          reasoning: 'Test buy decision'
        }
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.action).toBe('buy');
      expect(response.body.data.symbol).toBe('000001');
      expect(response.body.data.quantity).toBe(100);
      expect(response.body.data.status).toBe('executed');
    }, TEST_TIMEOUT);

    it('should reject buy when insufficient balance', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      // 将账户余额设为很低
      await prisma.aIAccount.update({
        where: { id: testAccount.id },
        data: { currentBalance: 100.00 }
      });

      const decision = {
        accountId: testAccount.id.toString(),
        decision: {
          decisionId: `buy-fail-${Date.now()}`,
          action: 'buy',
          symbol: '000001',
          quantity: 100,
          price: 10.50,
          reasoning: 'Should fail'
        }
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INSUFFICIENT_BALANCE');
    }, TEST_TIMEOUT);

    it('should execute sell decision successfully', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      // 先创建持仓
      await prisma.portfolio.create({
        data: {
          accountId: testAccount.id,
          stockId: testStock.id,
          quantity: 200,
          avgCost: 10.00,
          currentPrice: 10.50,
          marketValue: 2100.00,
          profitLoss: 100.00,
          profitLossRate: 5.00
        }
      });

      const decision = {
        accountId: testAccount.id.toString(),
        decision: {
          decisionId: `sell-dec-${Date.now()}`,
          action: 'sell',
          symbol: '000001',
          quantity: 100,
          price: 11.00,
          reasoning: 'Test sell decision'
        }
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.action).toBe('sell');
    }, TEST_TIMEOUT);

    it('should reject sell when insufficient position', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      const decision = {
        accountId: testAccount.id.toString(),
        decision: {
          decisionId: `sell-fail-${Date.now()}`,
          action: 'sell',
          symbol: '000001',
          quantity: 100,
          price: 11.00,
          reasoning: 'Should fail - no position'
        }
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INSUFFICIENT_POSITION');
    }, TEST_TIMEOUT);

    it('should execute hold decision successfully', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      const decision = {
        accountId: testAccount.id.toString(),
        decision: {
          decisionId: `hold-dec-${Date.now()}`,
          action: 'hold',
          symbol: '000001',
          quantity: 0,
          price: 0,
          reasoning: 'Market uncertain, hold position'
        }
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.action).toBe('hold');
    }, TEST_TIMEOUT);

    it('should reject duplicate decision (idempotency)', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      const decisionId = `dup-test-${Date.now()}`;
      const decision = {
        accountId: testAccount.id.toString(),
        decision: {
          decisionId,
          action: 'hold',
          symbol: '000001',
          quantity: 0,
          price: 0,
          reasoning: 'Test duplicate'
        }
      };

      // 第一次执行
      const response1 = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(200);

      expect(response1.body.success).toBe(true);
      const tradeId = response1.body.data.tradeId;

      // 第二次执行相同决策
      const response2 = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(409);

      expect(response2.body.success).toBe(false);
      expect(response2.body.error.code).toBe('DUPLICATE_DECISION');
      expect(response2.body.error.tradeId).toBe(tradeId);
    }, TEST_TIMEOUT);

    it('should return 404 when account not found', async () => {
      const decision = {
        accountId: '999999',
        decision: {
          decisionId: `acc-not-found-${Date.now()}`,
          action: 'buy',
          symbol: '000001',
          quantity: 100,
          price: 10.50
        }
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCOUNT_NOT_FOUND');
    }, TEST_TIMEOUT);

    it('should return 404 when stock not found', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      const decision = {
        accountId: testAccount.id.toString(),
        decision: {
          decisionId: `stock-not-found-${Date.now()}`,
          action: 'buy',
          symbol: 'INVALID_CODE',
          quantity: 100,
          price: 10.50
        }
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('STOCK_NOT_FOUND');
    }, TEST_TIMEOUT);

    it('should return 400 for missing required fields', async () => {
      const decision = {
        accountId: testAccount?.id.toString() || '123',
        // missing decision object
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(400);

      expect(response.body.success).toBe(false);
    }, TEST_TIMEOUT);

    it('should return 400 for invalid action', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      const decision = {
        accountId: testAccount.id.toString(),
        decision: {
          decisionId: `invalid-action-${Date.now()}`,
          action: 'invalid',
          symbol: '000001',
          quantity: 100,
          price: 10.50
        }
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ACTION');
    }, TEST_TIMEOUT);
  });

  describe('POST /api/internal/ai-decisions/batch', () => {
    it('should execute batch decisions', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      const batchRequest = {
        decisions: [
          {
            decisionId: `batch-hold-1-${Date.now()}`,
            accountId: testAccount.id.toString(),
            action: 'hold',
            symbol: '000001',
            quantity: 0,
            price: 0
          },
          {
            decisionId: `batch-hold-2-${Date.now()}`,
            accountId: testAccount.id.toString(),
            action: 'hold',
            symbol: '000001',
            quantity: 0,
            price: 0
          },
          {
            decisionId: `batch-hold-3-${Date.now()}`,
            accountId: testAccount.id.toString(),
            action: 'hold',
            symbol: '000001',
            quantity: 0,
            price: 0
          }
        ]
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions/batch')
        .send(batchRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(3);
      expect(response.body.data.succeeded).toBe(3);
      expect(response.body.data.failed).toBe(0);
    }, TEST_TIMEOUT);

    it('should return 400 for empty decisions array', async () => {
      const response = await request(app)
        .post('/api/internal/ai-decisions/batch')
        .send({ decisions: [] })
        .expect(400);

      expect(response.body.success).toBe(false);
    }, TEST_TIMEOUT);

    it('should handle partial failures in batch', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      // 将账户余额设为很低，使买入失败
      await prisma.aIAccount.update({
        where: { id: testAccount.id },
        data: { currentBalance: 100.00 }
      });

      const batchRequest = {
        decisions: [
          {
            decisionId: `batch-fail-1-${Date.now()}`,
            accountId: testAccount.id.toString(),
            action: 'buy',
            symbol: '000001',
            quantity: 100,
            price: 10.50
          },
          {
            decisionId: `batch-fail-2-${Date.now()}`,
            accountId: testAccount.id.toString(),
            action: 'buy',
            symbol: '000001',
            quantity: 100,
            price: 10.50
          }
        ]
      };

      const response = await request(app)
        .post('/api/internal/ai-decisions/batch')
        .send(batchRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.succeeded).toBe(0);
      expect(response.body.data.failed).toBe(2);
    }, TEST_TIMEOUT);
  });

  describe('Decision Logging', () => {
    it('should log decision to database', async () => {
      if (!testAccount) {
        console.log('Skipping - no database connection');
        return;
      }

      const decisionId = `log-test-${Date.now()}`;
      const decision = {
        accountId: testAccount.id.toString(),
        decision: {
          decisionId,
          action: 'hold',
          symbol: '000001',
          quantity: 0,
          price: 0,
          reasoning: 'Test logging'
        }
      };

      await request(app)
        .post('/api/internal/ai-decisions')
        .send(decision)
        .expect(200);

      // 验证决策日志已创建
      const log = await prisma.decisionLog.findFirst({
        where: { accountId: testAccount.id },
        orderBy: { createdAt: 'desc' }
      });

      expect(log).toBeTruthy();
      expect(log.decisionType).toBe('hold');
      expect(log.reasoning).toBe('Test logging');
    }, TEST_TIMEOUT);
  });
});
