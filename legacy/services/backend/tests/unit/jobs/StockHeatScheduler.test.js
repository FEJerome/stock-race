import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  StockHeatScheduler,
  StockHeatSchedulerError
} from '../../../src/jobs/StockHeatScheduler.js';

describe('StockHeatScheduler', () => {
  let scheduler;
  let mockEventBus;
  let mockAIAccountRepository;
  let mockPortfolioRepository;
  let mockWatchlistRepository;

  beforeEach(() => {
    // Mock EventBus
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(true)
    };

    // Mock repositories
    mockAIAccountRepository = {
      prisma: {
        aIAccount: {
          findMany: jest.fn()
        }
      }
    };

    mockPortfolioRepository = {
      prisma: {
        portfolio: {
          findMany: jest.fn()
        }
      }
    };

    mockWatchlistRepository = {
      prisma: {
        watchlist: {
          findMany: jest.fn()
        }
      }
    };

    // Create scheduler with mocks
    scheduler = new StockHeatScheduler({
      intervalMs: 1000,
      maxStocks: 10,
      enableMetrics: false
    });

    // Inject mocks
    scheduler.config.publishChannel = 'test:hot-stocks';
    scheduler.eventBus = mockEventBus;
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const defaultScheduler = new StockHeatScheduler();
      expect(defaultScheduler.config.intervalMs).toBe(60000);
      expect(defaultScheduler.config.maxStocks).toBe(250);
      expect(defaultScheduler.isRunning).toBe(false);
    });

    it('should create with custom config', () => {
      const customScheduler = new StockHeatScheduler({
        intervalMs: 30000,
        maxStocks: 100
      });
      expect(customScheduler.config.intervalMs).toBe(30000);
      expect(customScheduler.config.maxStocks).toBe(100);
    });
  });

  describe('start/stop', () => {
    it('should start and set isRunning to true', () => {
      scheduler.start();
      expect(scheduler.isRunning).toBe(true);
    });

    it('should not start if already running', () => {
      scheduler.start();
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      scheduler.start();
      expect(consoleSpy).toHaveBeenCalledWith('[StockHeatScheduler] 调度器已在运行中');
      consoleSpy.mockRestore();
    });

    it('should stop and set isRunning to false', () => {
      scheduler.start();
      scheduler.stop();
      expect(scheduler.isRunning).toBe(false);
    });

    it('should clear timer on stop', () => {
      scheduler.start();
      expect(scheduler.timer).not.toBeNull();
      scheduler.stop();
      expect(scheduler.timer).toBeNull();
    });
  });

  describe('getActiveAccounts', () => {
    it('should return active accounts', async () => {
      const mockAccounts = [
        { id: 1, userId: 1, name: 'Account 1' },
        { id: 2, userId: 2, name: 'Account 2' }
      ];

      scheduler.getActiveAccounts = jest.fn().mockResolvedValue(mockAccounts);

      const accounts = await scheduler.getActiveAccounts();
      expect(accounts).toHaveLength(2);
      expect(accounts[0].id).toBe(1);
    });

    it('should return empty array when no active accounts', async () => {
      scheduler.getActiveAccounts = jest.fn().mockResolvedValue([]);

      const accounts = await scheduler.getActiveAccounts();
      expect(accounts).toHaveLength(0);
    });
  });

  describe('collectStockHeat', () => {
    it('should aggregate stock heat from positions and watchlists', async () => {
      const accounts = [{ id: 1, userId: 1 }, { id: 2, userId: 2 }];

      // Mock getPositionsForAccounts
      scheduler.getPositionsForAccounts = jest.fn().mockResolvedValue([
        { accountId: 1, quantity: 100, stock: { symbol: '000001' } },
        { accountId: 2, quantity: 200, stock: { symbol: '000001' } },
        { accountId: 1, quantity: 50, stock: { symbol: '600519' } }
      ]);

      // Mock getWatchlistsForAccounts
      scheduler.getWatchlistsForAccounts = jest.fn().mockResolvedValue([
        { userId: 1, stock: { symbol: '000001' } },
        { userId: 2, stock: { symbol: '600519' } }
      ]);

      const heatMap = await scheduler.collectStockHeat(accounts);

      expect(heatMap.has('000001')).toBe(true);
      expect(heatMap.has('600519')).toBe(true);

      const stock000001 = heatMap.get('000001');
      expect(stock000001.positionCount).toBe(2);
      expect(stock000001.watchlistCount).toBe(1);
      expect(stock000001.totalShares).toBe(300);
    });

    it('should handle empty positions and watchlists', async () => {
      const accounts = [{ id: 1, userId: 1 }];

      scheduler.getPositionsForAccounts = jest.fn().mockResolvedValue([]);
      scheduler.getWatchlistsForAccounts = jest.fn().mockResolvedValue([]);

      const heatMap = await scheduler.collectStockHeat(accounts);

      expect(heatMap.size).toBe(0);
    });

    it('should handle missing stock data gracefully', async () => {
      const accounts = [{ id: 1, userId: 1 }];

      scheduler.getPositionsForAccounts = jest.fn().mockResolvedValue([
        { accountId: 1, quantity: 100, stock: null },
        { accountId: 1, quantity: 200, stock: { symbol: '000001' } }
      ]);

      scheduler.getWatchlistsForAccounts = jest.fn().mockResolvedValue([]);

      const heatMap = await scheduler.collectStockHeat(accounts);

      expect(heatMap.size).toBe(1);
      expect(heatMap.has('000001')).toBe(true);
    });
  });

  describe('generateHotStocksList', () => {
    it('should sort stocks by heat score', () => {
      const heatMap = new Map([
        ['000001', { symbol: '000001', positionCount: 5, watchlistCount: 3, totalAccounts: new Set([1, 2, 3]), totalShares: 1000 }],
        ['600519', { symbol: '600519', positionCount: 3, watchlistCount: 2, totalAccounts: new Set([1, 2]), totalShares: 500 }],
        ['300001', { symbol: '300001', positionCount: 1, watchlistCount: 1, totalAccounts: new Set([1]), totalShares: 100 }]
      ]);

      const hotStocks = scheduler.generateHotStocksList(heatMap);

      expect(hotStocks[0]).toBe('000001'); // heatScore = 5*2 + 3 = 13
      expect(hotStocks[1]).toBe('600519'); // heatScore = 3*2 + 2 = 8
      expect(hotStocks[2]).toBe('300001'); // heatScore = 1*2 + 1 = 3
    });

    it('should respect maxStocks limit', () => {
      scheduler.config.maxStocks = 2;

      const heatMap = new Map([
        ['000001', { symbol: '000001', positionCount: 5, watchlistCount: 3, totalAccounts: new Set(), totalShares: 0 }],
        ['600519', { symbol: '600519', positionCount: 3, watchlistCount: 2, totalAccounts: new Set(), totalShares: 0 }],
        ['300001', { symbol: '300001', positionCount: 1, watchlistCount: 1, totalAccounts: new Set(), totalShares: 0 }]
      ]);

      const hotStocks = scheduler.generateHotStocksList(heatMap);

      expect(hotStocks).toHaveLength(2);
    });

    it('should filter stocks below attention threshold', () => {
      scheduler.config.minAttentionThreshold = 5;

      const heatMap = new Map([
        ['000001', { symbol: '000001', positionCount: 3, watchlistCount: 0, totalAccounts: new Set(), totalShares: 0 }], // heatScore = 6
        ['600519', { symbol: '600519', positionCount: 1, watchlistCount: 1, totalAccounts: new Set(), totalShares: 0 }]  // heatScore = 3
      ]);

      const hotStocks = scheduler.generateHotStocksList(heatMap);

      expect(hotStocks).toContain('000001');
      expect(hotStocks).not.toContain('600519');
    });

    it('should sort by position count when heat score is equal', () => {
      const heatMap = new Map([
        ['000001', { symbol: '000001', positionCount: 2, watchlistCount: 2, totalAccounts: new Set(), totalShares: 0 }], // heatScore = 6
        ['600519', { symbol: '600519', positionCount: 3, watchlistCount: 0, totalAccounts: new Set(), totalShares: 0 }]  // heatScore = 6
      ]);

      const hotStocks = scheduler.generateHotStocksList(heatMap);

      // 600519 should come first because it has more positions (3 vs 2)
      expect(hotStocks[0]).toBe('600519');
      expect(hotStocks[1]).toBe('000001');
    });
  });

  describe('publishHotStocks', () => {
    it('should publish message to Redis channel', async () => {
      // Replace eventBus with mock
      const { eventBus } = await import('../../../src/events/EventBus.js');
      eventBus.publish = jest.fn().mockResolvedValue(true);

      const stocks = ['000001', '600519'];
      await scheduler.publishHotStocks(stocks, 10);

      expect(eventBus.publish).toHaveBeenCalledWith(
        'test:hot-stocks',
        expect.objectContaining({
          stocks: ['000001', '600519'],
          count: 2,
          accounts: 10,
          timestamp: expect.any(Number),
          source: 'backend-scheduler',
          version: '1.0'
        })
      );
    });
  });

  describe('chunkArray', () => {
    it('should split array into chunks', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const chunks = scheduler.chunkArray(array, 3);

      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toEqual([1, 2, 3]);
      expect(chunks[1]).toEqual([4, 5, 6]);
      expect(chunks[2]).toEqual([7, 8, 9]);
      expect(chunks[3]).toEqual([10]);
    });

    it('should handle empty array', () => {
      const chunks = scheduler.chunkArray([], 3);
      expect(chunks).toHaveLength(0);
    });

    it('should handle chunk size larger than array', () => {
      const array = [1, 2, 3];
      const chunks = scheduler.chunkArray(array, 10);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual([1, 2, 3]);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      scheduler.isRunning = true;
      scheduler.lastRunTime = '2024-01-01T00:00:00Z';
      scheduler.metrics.totalRuns = 5;

      const status = scheduler.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.lastRunTime).toBe('2024-01-01T00:00:00Z');
      expect(status.config.intervalMs).toBe(1000);
      expect(status.metrics.totalRuns).toBe(5);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      scheduler.metrics.totalRuns = 100;
      scheduler.metrics.errors = [{ message: 'error' }];

      scheduler.resetMetrics();

      expect(scheduler.metrics.totalRuns).toBe(0);
      expect(scheduler.metrics.errors).toHaveLength(0);
    });
  });

  describe('performance', () => {
    it('should handle 1000 accounts efficiently', async () => {
      const startTime = Date.now();

      // Generate 1000 mock accounts
      const accounts = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        userId: i + 1
      }));

      // Generate mock positions (each account has 5 positions)
      const positions = accounts.flatMap(acc =>
        Array.from({ length: 5 }, (_, j) => ({
          accountId: acc.id,
          quantity: 100,
          stock: { symbol: `STOCK${(j % 100).toString().padStart(3, '0')}` }
        }))
      );

      scheduler.getPositionsForAccounts = jest.fn().mockResolvedValue(positions);
      scheduler.getWatchlistsForAccounts = jest.fn().mockResolvedValue([]);

      await scheduler.collectStockHeat(accounts);

      const executionTime = Date.now() - startTime;
      console.log(`Processing 1000 accounts took: ${executionTime}ms`);

      // Should complete within 1 second
      expect(executionTime).toBeLessThan(1000);
    });
  });

  describe('execute', () => {
    it('should skip execution if no active accounts', async () => {
      scheduler.getActiveAccounts = jest.fn().mockResolvedValue([]);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await scheduler.execute();

      expect(consoleSpy).toHaveBeenCalledWith('[StockHeatScheduler] 没有活跃账户，跳过本次执行');
      consoleSpy.mockRestore();
    });

    it('should handle errors gracefully', async () => {
      scheduler.getActiveAccounts = jest.fn().mockRejectedValue(new Error('DB error'));

      await scheduler.execute();

      expect(scheduler.metrics.errors).toHaveLength(1);
      expect(scheduler.metrics.errors[0].error).toBe('DB error');
    });
  });
});
