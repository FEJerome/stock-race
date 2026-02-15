/**
 * StockActivityTracker 测试
 * B-005: 用户活动数据收集
 *
 * 测试覆盖:
 * - 股票查看行为记录
 * - 用户计数和查看次数统计
 * - Redis数据存储和过期
 * - 批量数据获取
 */

const { StockActivityTracker } = require('../../../src/services/StockActivityTracker');

// Mock Redis
const mockRedis = {
  data: new Map(),
  pipeline: jest.fn(function() {
    const commands = [];
    return {
      hIncrBy: jest.fn((key, field, value) => {
        commands.push({ cmd: 'hIncrBy', key, field, value });
        return this;
      }),
      hGet: jest.fn((key, field) => {
        commands.push({ cmd: 'hGet', key, field });
        return this;
      }),
      hGetAll: jest.fn((key) => {
        commands.push({ cmd: 'hGetAll', key });
        return this;
      }),
      expire: jest.fn((key, ttl) => {
        commands.push({ cmd: 'expire', key, ttl });
        return this;
      }),
      exec: jest.fn(async () => {
        const results = [];
        for (const cmd of commands) {
          const fullKey = cmd.key;
          switch (cmd.cmd) {
            case 'hIncrBy':
              const current = mockRedis.data.get(fullKey) || {};
              current[cmd.field] = (current[cmd.field] || 0) + cmd.value;
              mockRedis.data.set(fullKey, current);
              results.push(current[cmd.field]);
              break;
            case 'hGet':
              const data1 = mockRedis.data.get(fullKey) || {};
              results.push(data1[cmd.field] || '0');
              break;
            case 'hGetAll':
              results.push(mockRedis.data.get(fullKey) || {});
              break;
            case 'expire':
              results.push(1);
              break;
          }
        }
        return results;
      })
    };
  }),
  hGetAll: jest.fn(async (key) => {
    return mockRedis.data.get(key) || {};
  }),
  keys: jest.fn(async (pattern) => {
    const keys = [];
    for (const key of mockRedis.data.keys()) {
      if (key.match(pattern.replace('*', '.*'))) {
        keys.push(key);
      }
    }
    return keys;
  }),
  clear: () => {
    mockRedis.data.clear();
  }
};

describe('StockActivityTracker', () => {
  let tracker;

  beforeEach(() => {
    mockRedis.clear();
    tracker = new StockActivityTracker(mockRedis, { defaultTTL: 3600 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该使用提供的Redis客户端初始化', () => {
      expect(tracker.redis).toBe(mockRedis);
    });

    it('应该使用默认配置', () => {
      const defaultTracker = new StockActivityTracker(mockRedis);
      expect(defaultTracker.config.defaultTTL).toBe(3600);
      expect(defaultTracker.config.keyPrefix).toBe('stock:activity:');
    });

    it('应该合并自定义配置', () => {
      const customTracker = new StockActivityTracker(mockRedis, {
        defaultTTL: 7200,
        keyPrefix: 'custom:'
      });
      expect(customTracker.config.defaultTTL).toBe(7200);
      expect(customTracker.config.keyPrefix).toBe('custom:');
    });
  });

  describe('recordView', () => {
    it('应该记录用户查看行为', async () => {
      await tracker.recordView('000001.SZ', 'user-123');

      const data = mockRedis.data.get('stock:activity:000001.SZ');
      expect(data).toBeDefined();
      expect(parseInt(data.viewCount)).toBe(1);
    });

    it('应该为同一用户多次查看累计查看次数', async () => {
      await tracker.recordView('000001.SZ', 'user-123');
      await tracker.recordView('000001.SZ', 'user-123');
      await tracker.recordView('000001.SZ', 'user-123');

      const data = mockRedis.data.get('stock:activity:000001.SZ');
      expect(parseInt(data.viewCount)).toBe(3);
    });

    it('应该为不同用户分别累计', async () => {
      await tracker.recordView('000001.SZ', 'user-1');
      await tracker.recordView('000001.SZ', 'user-2');
      await tracker.recordView('000001.SZ', 'user-3');

      const data = mockRedis.data.get('stock:activity:000001.SZ');
      expect(parseInt(data.viewCount)).toBe(3);
    });

    it('应该设置过期时间', async () => {
      await tracker.recordView('000001.SZ', 'user-123');

      expect(mockRedis.pipeline().exec).toHaveBeenCalled();
    });

    it('应该处理无效参数', async () => {
      await expect(tracker.recordView(null, 'user-123')).rejects.toThrow();
      await expect(tracker.recordView('000001.SZ', null)).rejects.toThrow();
    });
  });

  describe('recordBatchViews', () => {
    it('应该批量记录多个股票的查看', async () => {
      const views = [
        { symbol: '000001.SZ', userId: 'user-1' },
        { symbol: '000001.SZ', userId: 'user-2' },
        { symbol: '600519.SH', userId: 'user-1' }
      ];

      await tracker.recordBatchViews(views);

      const data1 = mockRedis.data.get('stock:activity:000001.SZ');
      const data2 = mockRedis.data.get('stock:activity:600519.SH');

      expect(parseInt(data1.viewCount)).toBe(2);
      expect(parseInt(data2.viewCount)).toBe(1);
    });

    it('应该处理空数组', async () => {
      const result = await tracker.recordBatchViews([]);
      expect(result).toEqual({ success: true, processed: 0 });
    });

    it('应该跳过无效数据', async () => {
      const views = [
        { symbol: '000001.SZ', userId: 'user-1' },
        { symbol: null, userId: 'user-2' },
        { symbol: '600519.SH', userId: null }
      ];

      await tracker.recordBatchViews(views);

      const data1 = mockRedis.data.get('stock:activity:000001.SZ');
      expect(parseInt(data1.viewCount)).toBe(1);
      expect(mockRedis.data.get('stock:activity:null')).toBeUndefined();
    });
  });

  describe('getActivityData', () => {
    it('应该获取单只股票的活动数据', async () => {
      await tracker.recordView('000001.SZ', 'user-1');
      await tracker.recordView('000001.SZ', 'user-2');

      const data = await tracker.getActivityData('000001.SZ');

      expect(data).toEqual({
        symbol: '000001.SZ',
        userCount: 2,
        viewCount: 2
      });
    });

    it('应该返回默认值当数据不存在', async () => {
      const data = await tracker.getActivityData('UNKNOWN.SZ');

      expect(data).toEqual({
        symbol: 'UNKNOWN.SZ',
        userCount: 0,
        viewCount: 0
      });
    });

    it('应该正确解析存储的数据', async () => {
      mockRedis.data.set('stock:activity:000001.SZ', {
        userCount: '5',
        viewCount: '15'
      });

      const data = await tracker.getActivityData('000001.SZ');

      expect(data.userCount).toBe(5);
      expect(data.viewCount).toBe(15);
    });
  });

  describe('getBatchActivityData', () => {
    it('应该批量获取多只股票的活动数据', async () => {
      await tracker.recordView('000001.SZ', 'user-1');
      await tracker.recordView('000001.SZ', 'user-2');
      await tracker.recordView('600519.SH', 'user-1');

      const symbols = ['000001.SZ', '600519.SH', 'UNKNOWN.SZ'];
      const data = await tracker.getBatchActivityData(symbols);

      expect(data).toEqual({
        '000001.SZ': { userCount: 2, viewCount: 2 },
        '600519.SH': { userCount: 1, viewCount: 1 },
        'UNKNOWN.SZ': { userCount: 0, viewCount: 0 }
      });
    });

    it('应该处理空数组', async () => {
      const data = await tracker.getBatchActivityData([]);
      expect(data).toEqual({});
    });
  });

  describe('getAllActivityData', () => {
    it('应该获取所有有活动数据的股票', async () => {
      await tracker.recordView('000001.SZ', 'user-1');
      await tracker.recordView('600519.SH', 'user-1');
      await tracker.recordView('000001.SZ', 'user-2');

      const allData = await tracker.getAllActivityData();

      expect(Object.keys(allData)).toHaveLength(2);
      expect(allData['000001.SZ']).toEqual({ userCount: 2, viewCount: 2 });
      expect(allData['600519.SH']).toEqual({ userCount: 1, viewCount: 1 });
    });

    it('应该返回空对象当没有数据', async () => {
      const allData = await tracker.getAllActivityData();
      expect(allData).toEqual({});
    });
  });

  describe('getTopStocks', () => {
    it('应该按查看次数排序返回热门股票', async () => {
      await tracker.recordView('000001.SZ', 'user-1');
      await tracker.recordView('000001.SZ', 'user-2');
      await tracker.recordView('000001.SZ', 'user-3');
      await tracker.recordView('600519.SH', 'user-1');
      await tracker.recordView('600519.SH', 'user-2');
      await tracker.recordView('000858.SZ', 'user-1');

      const topStocks = await tracker.getTopStocks(2);

      expect(topStocks).toHaveLength(2);
      expect(topStocks[0].symbol).toBe('000001.SZ');
      expect(topStocks[0].viewCount).toBe(3);
      expect(topStocks[1].symbol).toBe('600519.SH');
      expect(topStocks[1].viewCount).toBe(2);
    });

    it('应该限制返回数量', async () => {
      for (let i = 0; i < 10; i++) {
        await tracker.recordView(`STOCK${i}.SZ`, 'user-1');
      }

      const topStocks = await tracker.getTopStocks(5);
      expect(topStocks).toHaveLength(5);
    });
  });

  describe('clearActivityData', () => {
    it('应该清除指定股票的活动数据', async () => {
      await tracker.recordView('000001.SZ', 'user-1');
      await tracker.clearActivityData('000001.SZ');

      const data = await tracker.getActivityData('000001.SZ');
      expect(data.userCount).toBe(0);
    });
  });

  describe('trackUserSession', () => {
    it('应该追踪用户在会话中查看的股票', async () => {
      const userId = 'user-123';
      const viewedStocks = ['000001.SZ', '600519.SH'];

      await tracker.trackUserSession(userId, viewedStocks);

      const data1 = await tracker.getActivityData('000001.SZ');
      const data2 = await tracker.getActivityData('600519.SH');

      expect(data1.userCount).toBe(1);
      expect(data1.viewCount).toBe(1);
      expect(data2.userCount).toBe(1);
      expect(data2.viewCount).toBe(1);
    });

    it('应该为同一用户多次查看累计', async () => {
      const userId = 'user-123';

      await tracker.trackUserSession(userId, ['000001.SZ']);
      await tracker.trackUserSession(userId, ['000001.SZ']);

      const data = await tracker.getActivityData('000001.SZ');
      expect(data.userCount).toBe(1);
      expect(data.viewCount).toBe(2);
    });
  });
});
