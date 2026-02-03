import { marketController } from '../../src/controllers/MarketController.js';
import { aiAccountRepository } from '../../src/models/index.js';
import { competitionRepository } from '../../src/models/index.js';
import { tradeRepository } from '../../src/models/index.js';
import { dataService } from '../../src/services/DataService.js';

// 模拟依赖
jest.mock('../../src/models/index.js', () => ({
  aiAccountRepository: {
    getRankings: jest.fn(),
    getAccountRanking: jest.fn(),
    findOne: jest.fn(),
    getUserAccounts: jest.fn()
  },
  competitionRepository: {
    paginate: jest.fn(),
    findOne: jest.fn(),
    joinCompetition: jest.fn(),
    leaveCompetition: jest.fn(),
    getCompetitionRankings: jest.fn()
  },
  tradeRepository: {
    getHotTradingStocks: jest.fn(),
    getRecentTrades: jest.fn()
  }
}));

jest.mock('../../src/services/DataService.js', () => ({
  dataService: {
    getMarketStats: jest.fn(),
    getMarketTrends: jest.fn(),
    getIndices: jest.fn()
  }
}));

describe('MarketController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRankings', () => {
    it('应该成功获取排行榜', async () => {
      const req = global.mockRequest({
        query: {
          type: 'all_time',
          sortBy: 'total_return',
          order: 'desc',
          page: 1,
          limit: 20
        }
      });
      const res = global.mockResponse();

      // 模拟排行榜查询
      aiAccountRepository.getRankings.mockResolvedValue({
        data: [
          {
            rank: 1,
            accountId: 1,
            accountName: '冠军账户',
            userName: 'user1',
            totalReturn: 0.35,
            totalAssets: '135000.00',
            winRate: 0.65,
            sharpeRatio: 1.45,
            tradesCount: 50,
            joinDate: new Date()
          }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 100,
          pages: 5
        }
      });

      await marketController.getRankings(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            rankings: expect.arrayContaining([
              expect.objectContaining({
                rank: 1,
                accountName: '冠军账户'
              })
            ])
          })
        })
      );
    });

    it('应该支持不同的排行榜类型', async () => {
      const req = global.mockRequest({
        query: { type: 'daily', sortBy: 'total_assets' }
      });
      const res = global.mockResponse();

      // 模拟排行榜查询
      aiAccountRepository.getRankings.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 }
      });

      await marketController.getRankings(req, res);

      expect(aiAccountRepository.getRankings).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'daily',
          sortBy: 'total_assets'
        })
      );
    });
  });

  describe('getAccountRanking', () => {
    it('应该成功获取账户排名', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { accountId: '1' },
        query: { type: 'all_time' }
      });
      const res = global.mockResponse();

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户'
      });

      // 模拟排名查询
      aiAccountRepository.getAccountRanking.mockResolvedValue({
        accountId: 1,
        accountName: '测试账户',
        rank: 25,
        totalRank: 100,
        percentile: 0.75,
        metrics: {
          totalReturn: 0.15,
          totalAssets: '115000.00',
          winRate: 0.55,
          sharpeRatio: 1.20
        },
        comparison: {
          topPerformer: { return: 0.35, rank: 1 },
          average: { return: 0.08, rank: 50 },
          benchmark: { return: 0.10, rank: 40 }
        }
      });

      await marketController.getAccountRanking(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            ranking: expect.objectContaining({
              accountId: 1,
              rank: 25
            })
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

      await marketController.getAccountRanking(req, res);

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

      await marketController.getMarketData(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            marketData: expect.objectContaining({
              totalStocks: 5000,
              marketSentiment: 'bullish'
            })
          })
        })
      );
    });
  });

  describe('getCompetitions', () => {
    it('应该成功获取竞赛信息', async () => {
      const req = global.mockRequest({
        query: { status: 'active', page: 1, limit: 10 }
      });
      const res = global.mockResponse();

      // 模拟竞赛查询
      competitionRepository.paginate.mockResolvedValue({
        data: [
          {
            id: 1,
            name: '月度交易大赛',
            description: '测试月度竞赛',
            type: 'monthly',
            status: 'active',
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-01-31'),
            prizePool: '10000.00',
            participants: 50,
            maxParticipants: 100,
            rules: {
              minTrades: 5,
              maxRisk: 0.30,
              allowedStrategies: ['momentum', 'value']
            },
            createdAt: new Date()
          }
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 5,
          pages: 1
        }
      });

      await marketController.getCompetitions(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            competitions: expect.arrayContaining([
              expect.objectContaining({
                id: 1,
                name: '月度交易大赛',
                status: 'active'
              })
            ])
          })
        })
      );
    });
  });

  describe('getCompetitionDetail', () => {
    it('应该成功获取竞赛详情', async () => {
      const req = global.mockRequest({
        params: { competitionId: '1' }
      });
      const res = global.mockResponse();

      // 模拟竞赛查询
      competitionRepository.findOne.mockResolvedValue({
        id: 1,
        name: '月度交易大赛',
        description: '测试月度竞赛',
        type: 'monthly',
        status: 'active',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        prizePool: '10000.00',
        participants: 50,
        maxParticipants: 100,
        rules: {
          minTrades: 5,
          maxRisk: 0.30,
          allowedStrategies: ['momentum', 'value']
        },
        createdAt: new Date(),
        rankings: [
          {
            rank: 1,
            accountId: 1,
            accountName: '冠军账户',
            totalReturn: 0.25,
            totalAssets: '125000.00'
          }
        ]
      });

      await marketController.getCompetitionDetail(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            competition: expect.objectContaining({
              id: 1,
              name: '月度交易大赛'
            })
          })
        })
      );
    });

    it('竞赛不存在时应该返回404', async () => {
      const req = global.mockRequest({
        params: { competitionId: '999' }
      });
      const res = global.mockResponse();

      // 模拟竞赛不存在
      competitionRepository.findOne.mockResolvedValue(null);

      await marketController.getCompetitionDetail(req, res);

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

  describe('joinCompetition', () => {
    it('应该成功加入竞赛', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { competitionId: '1' },
        body: { accountId: 1 }
      });
      const res = global.mockResponse();

      // 模拟竞赛查询
      competitionRepository.findOne.mockResolvedValue({
        id: 1,
        name: '月度交易大赛',
        status: 'active',
        maxParticipants: 100,
        participants: 50
      });

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户',
        status: 'active'
      });

      // 模拟加入竞赛
      competitionRepository.joinCompetition.mockResolvedValue({
        success: true,
        competitionId: 1,
        accountId: 1,
        joinDate: new Date(),
        message: '成功加入竞赛'
      });

      await marketController.joinCompetition(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            joinResult: expect.objectContaining({
              success: true,
              competitionId: 1
            })
          })
        })
      );
    });

    it('竞赛已满时应该返回400', async () => {
      const req = global.mockRequest({
        user: { id: 1 },
        params: { competitionId: '1' },
        body: { accountId: 1 }
      });
      const res = global.mockResponse();

      // 模拟已满的竞赛
      competitionRepository.findOne.mockResolvedValue({
        id: 1,
        name: '月度交易大赛',
        status: 'active',
        maxParticipants: 100,
        participants: 100 // 已满
      });

      // 模拟账户查询
      aiAccountRepository.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: '测试账户',
        status: 'active'
      });

      await marketController.joinCompetition(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'COMPETITION_001'
          })
        })
      );
    });
  });

  describe('getTradingHallData', () => {
    it('应该成功获取交易大厅数据', async () => {
      const req = global.mockRequest({
        query: { limit: 10 }
      });
      const res = global.mockResponse();

      // 模拟热门交易股票
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

      // 模拟最近交易
      tradeRepository.getRecentTrades.mockResolvedValue([
        {
          id: 1,
          accountId: 1,
          accountName: '活跃用户',
          stockCode: '000001',
          stockName: '平安银行',
          tradeType: 'buy',
          quantity: 100,
          price: '10.00',
          amount: '1000.00',
          executedAt: new Date()
        }
      ]);

      // 模拟排行榜
      aiAccountRepository.getRankings.mockResolvedValue({
        data: [
          {
            rank: 1,
            accountId: 1,
            accountName: '冠军账户',
            totalReturn: 0.35
          }
        ],
        pagination: { page: 1, limit: 10, total: 1, pages: 1 }
      });

      await marketController.getTradingHallData(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hotStocks: expect.any(Array),
            recentTrades: expect.any(Array),
            topTraders: expect.any(Array)
          })
        })
      );
    });
  });

  describe('getMarketTrends', () => {
    it('应该成功获取市场趋势', async () => {
      const req = global.mockRequest({
        query: { period: 'week', limit: 10 }
      });
      const res = global.mockResponse();

      // 模拟市场趋势
      dataService.getMarketTrends.mockResolvedValue({
        period: 'week',
        trends: [
          {
            industry: '科技',
            performance: 0.08,
            volumeChange: 0.15,
            sentiment: 'bullish',
            topStocks: ['000001', '000002']
          },
          {
            industry: '消费',
            performance: 0.05,
            volumeChange: 0.08,
            sentiment: 'neutral',
            topStocks: ['000003', '000004']
          }
        ],
        capitalFlows: {
          inflow: '5000000000.00',
          outflow: '3000000000.00',
          netFlow: '2000000000.00',
          topInflow: ['科技', '医药'],
          topOutflow: ['金融', '能源']
        },
        timestamp: new Date().toISOString()
      });

      await marketController.getMarketTrends(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            trends: expect.objectContaining({
              period: 'week',
              trends: expect.any(Array)
            })
          })
        })
      );
    });
  });

  describe('getIndices', () => {
    it('应该成功获取指数数据', async () => {
      const req = global.mockRequest({
        query: { indices: ['SH000001', 'SZ399001'] }
      });
      const res = global.mockResponse();

      // 模拟指数数据
      dataService.getIndices.mockResolvedValue([
        {
          code: 'SH000001',
          name: '上证指数',
          price: 3200.50,
          change: 25.50,
          changePercent: 0.80,
          high: 3210.20,
          low: 3180.80,
          volume: 1000000000,
          timestamp: new Date().toISOString()
        },
        {
          code: 'SZ399001',
          name: '深证成指',
          price: 11000.25,
          change: -50.75,
          changePercent: -0.46,
          high: 11050.80,
          low: 10980.20,
          volume: 800000000,
          timestamp: new Date().toISOString()
        }
      ]);

      await marketController.getIndices(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            indices: expect.arrayContaining([
              expect.objectContaining({
                code: 'SH000001',
                name: '上证指数'
              })
            ])
          })
        })
      );
    });
  });
});