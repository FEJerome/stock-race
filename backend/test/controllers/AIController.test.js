import { aiController } from '../../src/controllers/AIController.js';
import { aiAccountRepository } from '../../src/models/index.js';
import { aiService } from '../../src/services/AIService.js';
import { systemLogRepository } from '../../src/models/index.js';

// 模拟依赖
jest.mock('../../src/models/index.js', () => ({
  aiAccountRepository: {
    paginate: jest.fn(),
    findOne: jest.fn(),
    createAccount: jest.fn(),
    updateAccount: jest.fn(),
    deleteAccount: jest.fn(),
    getUserAccounts: jest.fn(),
    updateBalance: jest.fn(),
    calculateTotalValue: jest.fn(),
    getAccountPerformance: jest.fn(),
    getAccountStats: jest.fn()
  },
  systemLogRepository: {
    logUserActivity: jest.fn()
  }
}));

jest.mock('../../src/services/AIService.js', () => ({
  aiService: {
    requestDecision: jest.fn(),
    batchRequestDecisions: jest.fn(),
    getAccountAnalysis: jest.fn(),
    getModelStatus: jest.fn(),
    testConnection: jest.fn()
  }
}));

describe('AIController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAIAccounts', () => {
    it('应该成功获取AI账户列表', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        query: { page: 1, limit: 20 }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.paginate.mockResolvedValue({
        data: [
          {
            id: 1,
            userId: 1,
            name: 'AI交易账户1',
            description: '测试AI账户',
            strategy: 'momentum',
            initialBalance: '100000.00',
            currentBalance: '105000.00',
            totalValue: '110000.00',
            status: 'active',
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

      await aiController.getAIAccounts(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            accounts: expect.arrayContaining([
              expect.objectContaining({
                id: 1,
                name: 'AI交易账户1'
              })
            ])
          })
        })
      );
    });

    it('用户未认证时应该返回401', async () => {
      const req = global.mockRequest({ user: null });
      const res = global.mockResponse();

      await aiController.getAIAccounts(req, res);

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

  describe('createAIAccount', () => {
    it('应该成功创建AI账户', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        body: {
          name: '新AI账户',
          description: '测试创建',
          strategy: 'value',
          initialBalance: 100000
        }
      });
      const res = global.mockResponse();

      // 模拟账户创建
      aiAccountRepository.createAccount.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '新AI账户',
        description: '测试创建',
        strategy: 'value',
        initialBalance: '100000.00',
        currentBalance: '100000.00',
        totalValue: '100000.00',
        status: 'active',
        createdAt: new Date()
      });

      await aiController.createAIAccount(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            account: expect.objectContaining({
              id: 1,
              name: '新AI账户'
            })
          })
        })
      );
    });

    it('缺少必要参数时应该返回400', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        body: {
          // 缺少name
          description: '测试',
          strategy: 'value',
          initialBalance: 100000
        }
      });
      const res = global.mockResponse();

      await aiController.createAIAccount(req, res);

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

  describe('getAIAccountDetail', () => {
    it('应该成功获取AI账户详情', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { accountId: '1' }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: 'AI交易账户1',
        description: '测试AI账户',
        strategy: 'momentum',
        initialBalance: '100000.00',
        currentBalance: '105000.00',
        totalValue: '110000.00',
        status: 'active',
        createdAt: new Date(),
        user: {
          id: 1,
          username: 'testuser'
        }
      });

      // 模拟账户表现
      aiAccountRepository.getAccountPerformance.mockResolvedValue({
        totalReturn: 0.10,
        dailyReturn: 0.002,
        weeklyReturn: 0.015,
        monthlyReturn: 0.045,
        sharpeRatio: 1.2,
        maxDrawdown: -0.05,
        winRate: 0.55
      });

      // 模拟账户统计
      aiAccountRepository.getAccountStats.mockResolvedValue({
        totalTrades: 50,
        successfulTrades: 28,
        totalVolume: 5000,
        totalAmount: '500000.00',
        avgTradeSize: '10000.00'
      });

      await aiController.getAIAccountDetail(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            account: expect.objectContaining({
              id: 1,
              name: 'AI交易账户1'
            }),
            performance: expect.any(Object),
            stats: expect.any(Object)
          })
        })
      );
    });

    it('账户不存在时应该返回404', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { accountId: '999' }
      });
      const res = global.mockResponse();

      // 模拟账户不存在
      aiAccountRepository.findOne.mockResolvedValue(null);

      await aiController.getAIAccountDetail(req, res);

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

  describe('requestAIDecision', () => {
    it('应该成功请求AI决策', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { accountId: '1' },
        body: {
          stockCode: '000001',
          decisionType: 'buy',
          confidenceThreshold: 0.7
        }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: 'AI交易账户1',
        status: 'active'
      });

      // 模拟AI决策
      aiService.requestDecision.mockResolvedValue({
        success: true,
        decision: {
          action: 'buy',
          stockCode: '000001',
          confidence: 0.85,
          reasoning: '技术指标显示买入信号',
          riskLevel: 'medium',
          suggestedQuantity: 100,
          suggestedPrice: 10.00,
          stopLoss: 9.50,
          takeProfit: 11.00
        },
        timestamp: new Date().toISOString()
      });

      await aiController.requestAIDecision(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            decision: expect.objectContaining({
              action: 'buy',
              stockCode: '000001'
            })
          })
        })
      );
    });

    it('AI服务不可用时应该返回503', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { accountId: '1' },
        body: {
          stockCode: '000001',
          decisionType: 'buy'
        }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: 'AI交易账户1',
        status: 'active'
      });

      // 模拟AI服务失败
      aiService.requestDecision.mockRejectedValue(
        new Error('AI服务暂时不可用')
      );

      await aiController.requestAIDecision(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'SERVICE_UNAVAILABLE'
          })
        })
      );
    });
  });

  describe('requestBatchDecisions', () => {
    it('应该成功请求批量AI决策', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { accountId: '1' },
        body: {
          stockCodes: ['000001', '000002', '000003'],
          decisionType: 'analyze'
        }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: 'AI交易账户1',
        status: 'active'
      });

      // 模拟批量AI决策
      aiService.batchRequestDecisions.mockResolvedValue({
        success: true,
        decisions: [
          {
            stockCode: '000001',
            action: 'buy',
            confidence: 0.82,
            reasoning: '基本面良好'
          },
          {
            stockCode: '000002',
            action: 'hold',
            confidence: 0.65,
            reasoning: '等待突破'
          },
          {
            stockCode: '000003',
            action: 'sell',
            confidence: 0.78,
            reasoning: '技术面走弱'
          }
        ],
        timestamp: new Date().toISOString()
      });

      await aiController.requestBatchDecisions(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            decisions: expect.arrayContaining([
              expect.objectContaining({
                stockCode: expect.any(String)
              })
            ])
          })
        })
      );
    });
  });

  describe('analyzeAccount', () => {
    it('应该成功分析AI账户', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { accountId: '1' }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: 'AI交易账户1',
        status: 'active'
      });

      // 模拟账户分析
      aiService.getAccountAnalysis.mockResolvedValue({
        success: true,
        analysis: {
          accountId: 1,
          performanceScore: 85,
          riskScore: 65,
          consistencyScore: 78,
          strengths: ['趋势跟踪能力强', '风险控制良好'],
          weaknesses: ['震荡市表现一般', '交易频率偏高'],
          recommendations: [
            '降低单笔交易仓位',
            '增加止损设置',
            '优化选股策略'
          ],
          suggestedStrategy: 'balanced',
          expectedReturn: 0.12,
          expectedRisk: 0.18
        },
        timestamp: new Date().toISOString()
      });

      await aiController.analyzeAccount(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            analysis: expect.objectContaining({
              accountId: 1,
              performanceScore: expect.any(Number)
            })
          })
        })
      );
    });
  });

  describe('getModelStatus', () => {
    it('应该成功获取AI模型状态', async () => {
      const req = global.mockRequest({
        user: { id: 1 }
      });
      const res = global.mockResponse();

      // 模拟模型状态检查
      aiService.getModelStatus.mockResolvedValue({
        success: true,
        status: {
          available: true,
          modelName: 'stock-predictor-v2',
          version: '1.2.0',
          lastTraining: '2024-01-01T00:00:00Z',
          accuracy: 0.78,
          latency: 120,
          memoryUsage: '2.5GB',
          queueLength: 3
        },
        timestamp: new Date().toISOString()
      });

      await aiController.getModelStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: expect.objectContaining({
              available: true,
              modelName: 'stock-predictor-v2'
            })
          })
        })
      );
    });
  });
});