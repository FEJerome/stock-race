/**
 * [T-013] DynamicLimitService 单元测试
 *
 * 测试内容:
 * - 分层配置解析（默认→会员→账户）
 * - 会员级别限制获取
 * - 账户级别覆盖
 * - 缓存热更新
 * - 配置优先级
 */

import { expect, jest, describe, it, beforeEach, afterEach } from '@jest/globals';
import DynamicLimitService from '../../../src/services/DynamicLimitService.js';

describe('DynamicLimitService', () => {
  let service;
  let dbStub;
  let redisStub;
  let cacheStub;

  beforeEach(() => {
    dbStub = {
      query: jest.fn()
    };

    redisStub = {
      get: jest.fn().resolves(null),
      setex: jest.fn().resolves('OK'),
      del: jest.fn().resolves(1)
    };

    cacheStub = new Map();

    service = new DynamicLimitService({
      db: dbStub,
      redis: redisStub,
      localCache: cacheStub
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('分层配置解析', () => {
    it('应该正确解析默认配置', async () => {
      const limits = await service.getLimits('acc-123', { skipCache: true });

      expect(limits).toMatchObject({
        dailyWakeupLimit: 10,
        cooldownMinutes: 5,
        tokenBudget: 10000
      });
    });

    it('应该将会员级别配置合并到默认配置', async () => {
      dbStub.query.withArgs('SELECT * FROM membership_limits WHERE tier = $1', ['premium'])
        .resolves({
          rows: [{
            tier: 'premium',
            daily_wakeup_limit: 30,
            cooldown_minutes: 2,
            token_budget: 50000
          }]
        });

      // 模拟获取用户会员级别
      sinon.stub(service, 'getUserMembershipTier').resolves('premium');

      const limits = await service.getLimits('acc-123');

      expect(limits.dailyWakeupLimit).toBe(30);
      expect(limits.cooldownMinutes).toBe(2);
      expect(limits.tokenBudget).toBe(50000);
    });

    it('应该将账户级别配置覆盖会员级别配置', async () => {
      dbStub.query.withArgs('SELECT * FROM membership_limits WHERE tier = $1', ['basic'])
        .resolves({
          rows: [{
            tier: 'basic',
            daily_wakeup_limit: 10,
            cooldown_minutes: 5,
            token_budget: 10000
          }]
        });

      dbStub.query.withArgs('SELECT * FROM ai_account_limits WHERE account_id = $1', ['acc-123'])
        .resolves({
          rows: [{
            account_id: 'acc-123',
            daily_wakeup_limit: 50,  // 覆盖会员级别的10
            cooldown_minutes: null,   // 使用会员级别的5
            token_budget: null,
            effective_until: null
          }]
        });

      sinon.stub(service, 'getUserMembershipTier').resolves('basic');

      const limits = await service.getLimits('acc-123');

      expect(limits.dailyWakeupLimit).toBe(50);  // 账户级别覆盖
      expect(limits.cooldownMinutes).toBe(5);    // 会员级别继承
      expect(limits.tokenBudget).toBe(10000);    // 会员级别继承
    });

    it('应该返回配置来源信息', async () => {
      const limits = await service.getLimits('acc-123', { skipCache: true });

      expect(limits).toHaveProperty('configSource', 'default');
      expect(limits).toHaveProperty('membershipTier', null);
      expect(limits).toHaveProperty('accountOverride', false);
    });
  });

  describe('会员级别限制', () => {
    it('应该正确返回free会员限制', async () => {
      dbStub.query.resolves({
        rows: [{
          tier: 'free',
          daily_wakeup_limit: 5,
          cooldown_minutes: 10,
          token_budget: 5000
        }]
      });

      sinon.stub(service, 'getUserMembershipTier').resolves('free');

      const limits = await service.getLimits('acc-123');

      expect(limits.dailyWakeupLimit).toBe(5);
      expect(limits.cooldownMinutes).toBe(10);
    });

    it('应该正确返回vip会员限制', async () => {
      dbStub.query.resolves({
        rows: [{
          tier: 'vip',
          daily_wakeup_limit: 100,
          cooldown_minutes: 1,
          token_budget: 200000
        }]
      });

      sinon.stub(service, 'getUserMembershipTier').resolves('vip');

      const limits = await service.getLimits('acc-123');

      expect(limits.dailyWakeupLimit).toBe(100);
      expect(limits.cooldownMinutes).toBe(1);
    });

    it('对未知会员级别应该使用默认配置', async () => {
      dbStub.query.resolves({ rows: [] });

      sinon.stub(service, 'getUserMembershipTier').resolves('unknown-tier');

      const limits = await service.getLimits('acc-123');

      expect(limits.dailyWakeupLimit).toBe(10);
      expect(limits.configSource).toBe('default');
    });
  });

  describe('账户级别覆盖', () => {
    it('应该支持账户级别临时调整', async () => {
      const futureDate = new Date(Date.now() + 86400000); // 明天

      dbStub.query.resolves({
        rows: [{
          account_id: 'acc-123',
          daily_wakeup_limit: 100,
          cooldown_minutes: null,
          token_budget: null,
          effective_until: futureDate
        }]
      });

      sinon.stub(service, 'getUserMembershipTier').resolves('basic');

      const limits = await service.getLimits('acc-123');

      expect(limits.dailyWakeupLimit).toBe(100);
      expect(limits.accountOverride).toBe(true);
    });

    it('应该忽略已过期的账户级别配置', async () => {
      const pastDate = new Date(Date.now() - 86400000); // 昨天

      dbStub.query.withArgs(expect.stringContaining("ai_account_limits"))
        .resolves({
          rows: [{
            account_id: 'acc-123',
            daily_wakeup_limit: 100,
            effective_until: pastDate  // 已过期
          }]
        });

      sinon.stub(service, 'getUserMembershipTier').resolves('basic');

      const limits = await service.getLimits('acc-123');

      expect(limits.accountOverride).toBe(false);
    });

    it('应该支持为特定账户设置永久覆盖', async () => {
      dbStub.query.resolves({
        rows: [{
          account_id: 'acc-123',
          daily_wakeup_limit: 200,
          cooldown_minutes: 1,
          token_budget: 100000,
          effective_until: null  // 永久有效
        }]
      });

      sinon.stub(service, 'getUserMembershipTier').resolves('basic');

      const limits = await service.getLimits('acc-123');

      expect(limits.dailyWakeupLimit).toBe(200);
      expect(limits.accountOverride).toBe(true);
    });
  });

  describe('缓存机制', () => {
    it('应该从Redis缓存读取配置', async () => {
      const cachedConfig = JSON.stringify({
        dailyWakeupLimit: 50,
        cooldownMinutes: 3,
        configSource: 'membership'
      });

      redisStub.get.resolves(cachedConfig);

      const limits = await service.getLimits('acc-123');

      expect(redisStub.get.toHaveBeenCalledWith('limits:account:acc-123')).toBe(true);
      expect(limits.dailyWakeupLimit).toBe(50);
      expect(dbStub.query.toHaveBeenCalled()).toBe(false); // 不应该查询数据库
    });

    it('应该在缓存未命中时查询数据库并写入缓存', async () => {
      redisStub.get.resolves(null);

      dbStub.query.withArgs(expect.stringContaining("membership_limits"))
        .resolves({ rows: [{ tier: 'premium', daily_wakeup_limit: 30, cooldown_minutes: 2, token_budget: 50000 }] });

      sinon.stub(service, 'getUserMembershipTier').resolves('premium');

      await service.getLimits('acc-123');

      expect(redisStub.setex.toHaveBeenCalled()).toBe(true);
      const [key, ttl, value] = redisStub.setex.firstCall.args;
      expect(key).toBe('limits:account:acc-123');
      expect(ttl).toBe(300); // 5分钟缓存
    });

    it('应该支持本地缓存作为二级缓存', async () => {
      const config = { dailyWakeupLimit: 50, configSource: 'membership' };
      cacheStub.set('acc-123', { data: config, timestamp: Date.now() });

      const limits = await service.getLimits('acc-123');

      expect(limits.dailyWakeupLimit).toBe(50);
      expect(redisStub.get.toHaveBeenCalled()).toBe(false); // 不应该查询Redis
    });
  });

  describe('配置热更新', () => {
    it('应该支持手动清除缓存', async () => {
      await service.invalidateCache('acc-123');

      expect(redisStub.del.toHaveBeenCalledWith('limits:account:acc-123')).toBe(true);
    });

    it('应该支持批量清除缓存', async () => {
      await service.invalidateCacheByPattern('limits:account:*');

      expect(redisStub.del.toHaveBeenCalled()).toBe(true);
    });

    it('应该在配置更新后自动清除相关缓存', async () => {
      // 模拟更新会员级别配置
      await service.updateMembershipLimit('premium', {
        dailyWakeupLimit: 40
      });

      // 应该清除所有premium用户的缓存
      expect(redisStub.del.toHaveBeenCalled()).toBe(true);
    });
  });

  describe('管理员接口', () => {
    it('应该支持管理员设置账户级别限制', async () => {
      dbStub.query.resolves({ rowCount: 1 });

      const result = await service.setAccountLimit('acc-123', {
        dailyWakeupLimit: 100,
        effectiveDays: 30
      }, { adminId: 'admin-1' });

      expect(result.success).toBe(true);
      expect(dbStub.query.toHaveBeenCalled()).toBe(true);
    });

    it('应该记录配置变更审计日志', async () => {
      dbStub.query.resolves({ rowCount: 1 });

      await service.setAccountLimit('acc-123', {
        dailyWakeupLimit: 100
      }, { adminId: 'admin-1', reason: '用户投诉补偿' });

      // 验证审计日志记录
      const auditCall = dbStub.query.getCalls().find(
        call => call.args[0].includes('audit_log')
      );
      expect(auditCall).toBeDefined();
    });
  });
});
