import { portfolioController } from '../../src/controllers/PortfolioController.js';
import { portfolioRepository } from '../../src/models/index.js';
import { aiAccountRepository } from '../../src/models/index.js';
import { systemLogRepository } from '../../src/models/index.js';

// 模拟依赖
jest.mock('../../src/models/index.js', () => ({
  portfolioRepository: {
    paginate: jest.fn(),
    findOne: jest.fn(),
    getPortfolioStats: jest.fn(),
    getRiskAnalysis: jest.fn(),
    getPortfolioHistory: jest.fn(),
    rebalancePortfolio: jest.fn(),
    updateMarketValues: jest.fn()
  },
  aiAccountRepository: {
    findOne: jest.fn(),
    getUserAccounts: jest.fn()
  },
  systemLogRepository: {
    logUserActivity: jest.fn()
  }
}));

describe('PortfolioController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPortfolios', () => {
    it('应该成功获取持仓列表', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        query: { page: 1, limit: 20 }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.getUserAccounts.mockResolvedValue([
        { id: 1, name: '测试账户' }
      ]);

      // 模拟持仓查询
      portfolioRepository.paginate.mockResolvedValue({
        data: [
          {
            id: 1,
            accountId: 1,
            stock: {
              id: 1,
              code: '000001',
              name: '平安银行',
              market: 'SZ',
              industry: '银行',
              currentPrice: '10.00'
            },
            quantity: 1000,
            avgCost: '9.50',
            currentPrice: '10.00',
            marketValue: '10000.00',
            costValue: '9500.00',
            unrealizedPnl: '500.00',
            unrealizedPnlPercent: '5.26',
            weight: '0.25',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          pages: 1
        }
      });

      await portfolioController.getPortfolios(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            portfolios: expect.arrayContaining([
              expect.objectContaining({
                id: 1,
                accountId: 1,
                stockCode: '000001'
              })
            ])
          })
        })
      );
    });

    it('用户未认证时应该返回401', async () => {
      const req = global.mockRequest({ user: null });
      const res = global.mockResponse();

      await portfolioController.getPortfolios(req, res);

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

  describe('getPortfolioDetail', () => {
    it('应该成功获取持仓详情', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { portfolioId: '1' }
      });
      const res = global.mockResponse();

      // 模拟持仓查询
      portfolioRepository.findOne.mockResolvedValue({
        id: 1,
        accountId: 1,
        account: {
          userId: 1,
          name: '测试账户'
        },
        stock: {
          id: 1,
          code: '000001',
          name: '平安银行',
          market: 'SZ',
          industry: '银行',
          currentPrice: '10.00',
          change: '0.50',
          changePercent: '5.00'
        },
        quantity: 1000,
        avgCost: '9.50',
        currentPrice: '10.00',
        marketValue: '10000.00',
        costValue: '9500.00',
        unrealizedPnl: '500.00',
        unrealizedPnlPercent: '5.26',
        weight: '0.25',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await portfolioController.getPortfolioDetail(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            portfolio: expect.objectContaining({
              id: 1,
              accountId: 1,
              stockCode: '000001'
            })
          })
        })
      );
    });

    it('持仓不存在时应该返回404', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { portfolioId: '999' }
      });
      const res = global.mockResponse();

      // 模拟持仓不存在
      portfolioRepository.findOne.mockResolvedValue(null);

      await portfolioController.getPortfolioDetail(req, res);

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

  describe('getPortfolioStats', () => {
    it('应该成功获取持仓统计', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        query: { accountId: '1' }
      });
      const res = global.mockResponse();

      // 模拟账户权限验证
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户'
      });

      // 模拟持仓统计
      portfolioRepository.getPortfolioStats.mockResolvedValue({
        totalValue: '50000.00',
        totalCost: '45000.00',
        totalPnl: '5000.00',
        totalPnlPercent: '11.11',
        dailyPnl: '500.00',
        dailyPnlPercent: '1.00',
        positionsCount: 5,
        diversificationScore: 75,
        industryDistribution: {
          '银行': 0.35,
          '科技': 0.25,
          '消费': 0.20,
          '医药': 0.15,
          '其他': 0.05
        },
        topPositions: [
          {
            stockCode: '000001',
            stockName: '平安银行',
            weight: 0.25,
            pnl: '500.00',
            pnlPercent: '5.26'
          }
        ]
      });

      await portfolioController.getPortfolioStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            stats: expect.objectContaining({
              totalValue: '50000.00',
              totalPnl: '5000.00'
            })
          })
        })
      );
    });
  });

  describe('getRiskAnalysis', () => {
    it('应该成功获取持仓风险分析', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        query: { accountId: '1' }
      });
      const res = global.mockResponse();

      // 模拟账户权限验证
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户'
      });

      // 模拟风险分析
      portfolioRepository.getRiskAnalysis.mockResolvedValue({
        accountId: 1,
        riskMetrics: {
          volatility: 0.25,
          beta: 1.15,
          sharpeRatio: 1.20,
          sortinoRatio: 1.45,
          maxDrawdown: -0.08,
          var95: -0.05,
          cvar95: -0.07
        },
        concentrationRisks: [
          {
            type: 'industry',
            name: '银行',
            concentration: 0.35,
            riskLevel: 'medium'
          },
          {
            type: 'stock',
            name: '000001',
            concentration: 0.25,
            riskLevel: 'low'
          }
        ],
        stressTestResults: {
          marketCrash: -0.15,
          interestRateRise: -0.08,
          recession: -0.12,
          blackSwan: -0.25
        },
        recommendations: [
          '降低银行行业集中度',
          '增加防御性股票配置',
          '设置止损位'
        ],
        overallRiskLevel: 'medium'
      });

      await portfolioController.getRiskAnalysis(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            riskAnalysis: expect.objectContaining({
              accountId: 1,
              riskMetrics: expect.any(Object)
            })
          })
        })
      );
    });
  });

  describe('getPortfolioHistory', () => {
    it('应该成功获取持仓历史', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        query: {
          accountId: '1',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          page: 1,
          limit: 20
        }
      });
      const res = global.mockResponse();

      // 模拟账户权限验证
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户'
      });

      // 模拟持仓历史查询
      portfolioRepository.getPortfolioHistory.mockResolvedValue({
        data: [
          {
            id: 1,
            date: '2024-01-15',
            accountId: 1,
            stockCode: '000001',
            stockName: '平安银行',
            quantity: 1000,
            avgCost: '9.50',
            marketPrice: '10.00',
            marketValue: '10000.00',
            costValue: '9500.00',
            pnl: '500.00',
            pnlPercent: '5.26',
            weight: '0.25'
          }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          pages: 1
        }
      });

      await portfolioController.getPortfolioHistory(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            history: expect.arrayContaining([
              expect.objectContaining({
                stockCode: '000001',
                date: '2024-01-15'
              })
            ])
          })
        })
      );
    });
  });

  describe('rebalancePortfolio', () => {
    it('应该成功重新平衡持仓', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        body: {
          accountId: 1,
          targetAllocation: {
            '000001': 0.20,
            '000002': 0.30,
            '000003': 0.25,
            'CASH': 0.25
          },
          rebalanceMethod: 'proportional'
        }
      });
      const res = global.mockResponse();

      // 模拟账户权限验证
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户'
      });

      // 模拟重新平衡
      portfolioRepository.rebalancePortfolio.mockResolvedValue({
        success: true,
        accountId: 1,
        tradesGenerated: 3,
        totalCost: '1500.00',
        expectedImprovement: 0.05,
        newAllocation: {
          '000001': 0.20,
          '000002': 0.30,
          '000003': 0.25,
          'CASH': 0.25
        },
        timestamp: new Date().toISOString()
      });

      await portfolioController.rebalancePortfolio(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            rebalanceResult: expect.objectContaining({
              success: true,
              accountId: 1
            })
          })
        })
      );
    });

    it('缺少必要参数时应该返回400', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        body: {
          // 缺少accountId
          targetAllocation: {
            '000001': 0.20
          }
        }
      });
      const res = global.mockResponse();

      await portfolioController.rebalancePortfolio(req, res);

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

  describe('updateMarketValues', () => {
    it('应该成功更新持仓市值', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        body: { accountId: 1 }
      });
      const res = global.mockResponse();

      // 模拟账户权限验证
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户'
      });

      // 模拟市值更新
      portfolioRepository.updateMarketValues.mockResolvedValue({
        success: true,
        accountId: 1,
        positionsUpdated: 5,
        totalValueChange: '500.00',
        totalPnlChange: '200.00',
        timestamp: new Date().toISOString()
      });

      await portfolioController.updateMarketValues(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            updateResult: expect.objectContaining({
              success: true,
              accountId: 1
            })
          })
        })
      );
    });
  });
});