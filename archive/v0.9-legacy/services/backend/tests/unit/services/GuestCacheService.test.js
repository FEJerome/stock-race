/**
 * GuestCacheService 测试
 * G-008: 缓存一致性保障
 *
 * 测试覆盖:
 * - 游客Token缓存CRUD
 * - AI账户列表缓存
 * - 缓存穿透防护
 * - 缓存一致性保障（删除同步清缓存）
 * - 批量操作和统计
 */

const { GuestCacheService } = require('../../../src/services/GuestCacheService');

// Mock Redis
const mockRedis = {
  data: new Map(),
  ttlMap: new Map(),

  async get(key) {
    const value = this.data.get(key);
    if (!value) return null;

    // 检查过期
    const ttl = this.ttlMap.get(key);
    if (ttl && Date.now() > ttl) {
      this.data.delete(key);
      this.ttlMap.delete(key);
      return null;
    }

    return value;
  },

  async set(key, value) {
    this.data.set(key, value);
    return 'OK';
  },

  async setEx(key, seconds, value) {
    this.data.set(key, value);
    this.ttlMap.set(key, Date.now() + seconds * 1000);
    return 'OK';
  },

  async del(...keys) {
    let count = 0;
    for (const key of keys) {
      if (this.data.has(key)) {
        this.data.delete(key);
        this.ttlMap.delete(key);
        count++;
      }
    }
    return count;
  },

  async exists(...keys) {
    let count = 0;
    for (const key of keys) {
      if (this.data.has(key)) count++;
    }
    return count;
  },

  async keys(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    const keys = [];
    for (const key of this.data.keys()) {
      if (regex.test(key)) keys.push(key);
    }
    return keys;
  },

  async mget(...keys) {
    return keys.map(key => this.data.get(key) || null);
  },

  async mset(...keyValues) {
    for (let i = 0; i < keyValues.length; i += 2) {
      this.data.set(keyValues[i], keyValues[i + 1]);
    }
    return 'OK';
  },

  pipeline() {
    const commands = [];
    return {
      get: (key) => { commands.push({ cmd: 'get', key }); return this; },
      set: (key, value) => { commands.push({ cmd: 'set', key, value }); return this; },
      del: (...keys) => { commands.push({ cmd: 'del', keys }); return this; },
      exec: async () => {
        const results = [];
        for (const c of commands) {
          switch (c.cmd) {
            case 'get': results.push(await mockRedis.get(c.key)); break;
            case 'set': results.push(await mockRedis.set(c.key, c.value)); break;
            case 'del': results.push(await mockRedis.del(...c.keys)); break;
          }
        }
        return results;
      }
    };
  },

  clear() {
    this.data.clear();
    this.ttlMap.clear();
  }
};

describe('GuestCacheService', () => {
  let cacheService;

  beforeEach(() => {
    mockRedis.clear();
    cacheService = new GuestCacheService(mockRedis, {
      defaultTTL: 3600,
      keyPrefix: 'guest:'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该使用提供的Redis客户端初始化', () => {
      expect(cacheService.redis).toBe(mockRedis);
    });

    it('应该使用默认配置', () => {
      const defaultService = new GuestCacheService(mockRedis);
      expect(defaultService.config.defaultTTL).toBe(3600);
      expect(defaultService.config.keyPrefix).toBe('guest:');
    });

    it('应该合并自定义配置', () => {
      const customService = new GuestCacheService(mockRedis, {
        defaultTTL: 7200,
        keyPrefix: 'test:'
      });
      expect(customService.config.defaultTTL).toBe(7200);
      expect(customService.config.keyPrefix).toBe('test:');
    });

    it('应该初始化空值缓存Set', () => {
      expect(cacheService.nullValueCache).toBeInstanceOf(Set);
    });
  });

  describe('Token缓存', () => {
    const mockToken = 'guest_abc123_xyz';
    const mockSession = {
      id: 1,
      openid_hash: 'hash123',
      guest_token: mockToken,
      status: 'active',
      expires_at: new Date(Date.now() + 86400000).toISOString()
    };

    it('应该缓存游客Token', async () => {
      await cacheService.cacheToken(mockToken, mockSession);

      const cached = await mockRedis.get('guest:token:guest_abc123_xyz');
      expect(cached).toBeTruthy();
      expect(JSON.parse(cached)).toEqual(mockSession);
    });

    it('应该获取缓存的Token', async () => {
      await cacheService.cacheToken(mockToken, mockSession);

      const result = await cacheService.getCachedToken(mockToken);
      expect(result).toEqual(mockSession);
    });

    it('应该返回null当Token不存在', async () => {
      const result = await cacheService.getCachedToken('nonexistent');
      expect(result).toBeNull();
    });

    it('应该使Token缓存失效', async () => {
      await cacheService.cacheToken(mockToken, mockSession);
      await cacheService.invalidateToken(mockToken);

      const result = await cacheService.getCachedToken(mockToken);
      expect(result).toBeNull();
    });

    it('应该设置正确的过期时间', async () => {
      await cacheService.cacheToken(mockToken, mockSession, 1800);

      const key = 'guest:token:guest_abc123_xyz';
      expect(mockRedis.ttlMap.has(key)).toBe(true);
    });
  });

  describe('AI账户列表缓存', () => {
    const sessionId = 123;
    const mockAccounts = [
      { id: 1, name: 'AI账户1', status: 'active' },
      { id: 2, name: 'AI账户2', status: 'active' }
    ];

    it('应该缓存AI账户列表', async () => {
      await cacheService.cacheAIAccounts(sessionId, mockAccounts);

      const cached = await mockRedis.get('guest:accounts:123');
      expect(cached).toBeTruthy();
      expect(JSON.parse(cached)).toEqual(mockAccounts);
    });

    it('应该获取缓存的AI账户列表', async () => {
      await cacheService.cacheAIAccounts(sessionId, mockAccounts);

      const result = await cacheService.getCachedAIAccounts(sessionId);
      expect(result).toEqual(mockAccounts);
    });

    it('应该返回null当AI账户列表不存在', async () => {
      const result = await cacheService.getCachedAIAccounts(999);
      expect(result).toBeNull();
    });

    it('应该使AI账户列表缓存失效', async () => {
      await cacheService.cacheAIAccounts(sessionId, mockAccounts);
      await cacheService.invalidateAIAccounts(sessionId);

      const result = await cacheService.getCachedAIAccounts(sessionId);
      expect(result).toBeNull();
    });
  });

  describe('缓存穿透防护', () => {
    it('应该缓存空值防止缓存穿透', async () => {
      const token = 'nonexistent_token';

      // 第一次查询，记录空值
      const result1 = await cacheService.getCachedToken(token, { preventPenetration: true });
      expect(result1).toBeNull();

      // 验证空值被缓存
      const nullKey = 'guest:null:token:nonexistent_token';
      expect(mockRedis.data.has(nullKey)).toBe(true);

      // 第二次查询应该直接返回（使用缓存的空值）
      const result2 = await cacheService.getCachedToken(token, { preventPenetration: true });
      expect(result2).toBeNull();
    });

    it('应该设置空值缓存的短过期时间', async () => {
      const token = 'nonexistent_token';
      await cacheService.getCachedToken(token, { preventPenetration: true });

      const nullKey = 'guest:null:token:nonexistent_token';
      const ttl = mockRedis.ttlMap.get(nullKey);
      const expectedExpiry = Date.now() + 60 * 1000; // 默认60秒

      expect(ttl).toBeLessThanOrEqual(expectedExpiry + 100);
      expect(ttl).toBeGreaterThan(expectedExpiry - 1000);
    });

    it('应该在写入数据后清除空值缓存', async () => {
      const token = 'test_token';
      const session = { id: 1, status: 'active' };

      // 先设置空值缓存
      await cacheService.getCachedToken(token, { preventPenetration: true });
      expect(cacheService.nullValueCache.has(token)).toBe(true);

      // 写入真实数据
      await cacheService.cacheToken(token, session);

      // 验证空值缓存被清除
      expect(cacheService.nullValueCache.has(token)).toBe(false);
    });
  });

  describe('缓存一致性保障', () => {
    const mockSession = {
      id: 1,
      guest_token: 'token123',
      openid_hash: 'hash123'
    };

    it('删除会话时应该同步清除相关缓存', async () => {
      // 设置多个相关缓存
      await cacheService.cacheToken(mockSession.guest_token, mockSession);
      await cacheService.cacheAIAccounts(mockSession.id, [{ id: 1 }]);
      await cacheService.cacheSessionByOpenId(mockSession.openid_hash, mockSession);

      // 执行级联删除
      await cacheService.invalidateSessionCascade(mockSession.id, {
        token: mockSession.guest_token,
        openidHash: mockSession.openid_hash
      });

      // 验证所有缓存被清除
      expect(await cacheService.getCachedToken(mockSession.guest_token)).toBeNull();
      expect(await cacheService.getCachedAIAccounts(mockSession.id)).toBeNull();
      expect(await cacheService.getCachedSessionByOpenId(mockSession.openid_hash)).toBeNull();
    });

    it('应该使用pipeline批量删除提高性能', async () => {
      const keys = ['key1', 'key2', 'key3'];
      for (const key of keys) {
        await mockRedis.set(`guest:test:${key}`, 'value');
      }

      const pipelineSpy = jest.spyOn(mockRedis, 'pipeline');
      await cacheService.invalidateMultiple(keys.map(k => `guest:test:${k}`));

      expect(pipelineSpy).toHaveBeenCalled();
    });
  });

  describe('OpenID缓存', () => {
    const openidHash = 'abc123hash';
    const mockSession = { id: 1, status: 'active' };

    it('应该通过OpenID哈希缓存会话', async () => {
      await cacheService.cacheSessionByOpenId(openidHash, mockSession);

      const result = await cacheService.getCachedSessionByOpenId(openidHash);
      expect(result).toEqual(mockSession);
    });

    it('应该使OpenID缓存失效', async () => {
      await cacheService.cacheSessionByOpenId(openidHash, mockSession);
      await cacheService.invalidateSessionByOpenId(openidHash);

      const result = await cacheService.getCachedSessionByOpenId(openidHash);
      expect(result).toBeNull();
    });
  });

  describe('批量操作', () => {
    it('应该批量获取多个Token', async () => {
      const sessions = [
        { id: 1, guest_token: 'token1' },
        { id: 2, guest_token: 'token2' }
      ];

      await cacheService.cacheToken('token1', sessions[0]);
      await cacheService.cacheToken('token2', sessions[1]);

      const results = await cacheService.getMultipleTokens(['token1', 'token2', 'token3']);

      expect(results.get('token1')).toEqual(sessions[0]);
      expect(results.get('token2')).toEqual(sessions[1]);
      expect(results.get('token3')).toBeNull();
    });

    it('应该批量清除缓存', async () => {
      const keys = [];
      for (let i = 0; i < 5; i++) {
        const key = `guest:test:${i}`;
        await mockRedis.set(key, `value${i}`);
        keys.push(key);
      }

      const deleted = await cacheService.invalidateMultiple(keys);
      expect(deleted).toBe(5);

      for (const key of keys) {
        expect(await mockRedis.get(key)).toBeNull();
      }
    });
  });

  describe('缓存预热', () => {
    it('应该支持缓存预热', async () => {
      const sessions = [
        { id: 1, guest_token: 'token1', openid_hash: 'hash1' },
        { id: 2, guest_token: 'token2', openid_hash: 'hash2' }
      ];

      await cacheService.warmupCache(sessions);

      expect(await cacheService.getCachedToken('token1')).toEqual(sessions[0]);
      expect(await cacheService.getCachedToken('token2')).toEqual(sessions[1]);
      expect(await cacheService.getCachedSessionByOpenId('hash1')).toEqual(sessions[0]);
      expect(await cacheService.getCachedSessionByOpenId('hash2')).toEqual(sessions[1]);
    });
  });

  describe('统计信息', () => {
    it('应该返回缓存统计', async () => {
      // 设置一些缓存
      await cacheService.cacheToken('token1', { id: 1 });
      await cacheService.cacheToken('token2', { id: 2 });
      await cacheService.cacheAIAccounts(1, [{ id: 1 }]);

      const stats = await cacheService.getStats();

      expect(stats.tokenKeys).toBe(2);
      expect(stats.accountKeys).toBe(1);
      expect(stats.totalKeys).toBe(3);
    });

    it('应该计算命中率', async () => {
      // 先miss
      await cacheService.getCachedToken('token1');
      await cacheService.getCachedToken('token2');

      // 设置后hit
      await cacheService.cacheToken('token1', { id: 1 });
      await cacheService.getCachedToken('token1');

      const stats = cacheService.getHitStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(33.33, 1);
    });
  });

  describe('健康检查', () => {
    it('应该返回Redis连接状态', async () => {
      const health = await cacheService.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.redisConnected).toBe(true);
    });

    it('应该在Redis不可用时返回unhealthy', async () => {
      const badRedis = { get: () => { throw new Error('Connection lost'); } };
      const badService = new GuestCacheService(badRedis);

      const health = await badService.healthCheck();
      expect(health.status).toBe('unhealthy');
      expect(health.redisConnected).toBe(false);
    });
  });

  describe('配置更新', () => {
    it('应该支持运行时更新TTL', () => {
      cacheService.updateConfig({ defaultTTL: 7200 });
      expect(cacheService.config.defaultTTL).toBe(7200);
    });

    it('应该支持更新空值缓存过期时间', () => {
      cacheService.updateConfig({ nullValueTTL: 120 });
      expect(cacheService.config.nullValueTTL).toBe(120);
    });
  });
});
