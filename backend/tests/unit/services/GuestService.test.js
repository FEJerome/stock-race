/**
 * [P0-005] GuestService 单元测试
 *
 * 测试内容:
 * - C5-001: 游客 Token 生成与验证
 * - C5-002: 游客 AI 账户创建（限制2个）
 * - C5-003: 游客 AI 对话（限制10轮）
 * - C5-004: 游客数据迁移到正式用户
 * - C5-005: 智能过期策略（24h/72h）
 * - P0-004: Redis 持久化
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { GuestService } from '../../../src/services/GuestService.js';

describe('GuestService', () => {
  let guestService;
  let mockRedis;
  let mockDb;

  beforeEach(() => {
    // 创建 Mock Redis
    mockRedis = {
      get: sinon.stub(),
      setEx: sinon.stub().resolves(),
      keys: sinon.stub().resolves([]),
      del: sinon.stub().resolves()
    };

    // 创建 Mock DB
    mockDb = {
      connect: sinon.stub().resolves({
        query: sinon.stub().resolves({ rows: [] }),
        release: sinon.stub()
      })
    };

    guestService = new GuestService({
      redis: mockRedis,
      db: mockDb
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('[C5-001] 游客 Token 生成', () => {
    it('应该基于 openid 生成唯一 token', async () => {
      const openid = 'test_openid_123';
      const result = await guestService.createGuestToken(openid);

      expect(result).to.have.property('token');
      expect(result.token).to.be.a('string');
      expect(result.token).to.match(/^guest_/);
      expect(result).to.have.property('expiresIn', 24 * 60 * 60);
      expect(result).to.have.property('createdAt');
    });

    it('同一 openid 应该生成不同的 token', async () => {
      const openid = 'test_openid_123';
      const result1 = await guestService.createGuestToken(openid);
      const result2 = await guestService.createGuestToken(openid);

      expect(result1.token).to.not.equal(result2.token);
    });

    it('应该保存到 Redis', async () => {
      const openid = 'test_openid_123';
      await guestService.createGuestToken(openid);

      expect(mockRedis.setEx.calledOnce).to.be.true;
      const [key, ttl, data] = mockRedis.setEx.firstCall.args;
      expect(key).to.match(/^guest:session:/);
      expect(ttl).to.equal(24 * 60 * 60);
      expect(JSON.parse(data)).to.have.property('status', 'active');
    });
  });

  describe('[C5-001] Token 验证', () => {
    it('应该验证有效的 token', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);

      // 模拟 Redis 返回
      const session = guestService.localCache.get(token);
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));

      const result = await guestService.validateToken(token);

      expect(result).to.not.be.null;
      expect(result).to.have.property('token', token);
    });

    it('过期 token 应该返回 null', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);

      // 模拟过期会话（Redis 返回过期数据）
      const expiredSession = {
        token,
        expiresAt: Date.now() - 1000, // 已过期
        status: 'active'
      };
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(expiredSession));

      // 清除内存缓存，强制从 Redis 读取
      guestService.localCache.delete(token);

      const result = await guestService.validateToken(token);

      expect(result).to.be.null;
    });

    it('无效的 token 应该返回 null', async () => {
      mockRedis.get.withArgs('guest:session:invalid_token').resolves(null);

      const result = await guestService.validateToken('invalid_token');

      expect(result).to.be.null;
    });
  });

  describe('[C5-002] 游客 AI 账户创建', () => {
    it('应该成功创建 AI 账户', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);
      const session = guestService.localCache.get(token);
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));

      const accountData = {
        name: '测试AI账户',
        modelType: 'deepseek',
        initialBalance: 100000
      };

      const account = await guestService.createAIAccount(token, accountData);

      expect(account).to.have.property('id');
      expect(account).to.have.property('name', '测试AI账户');
      expect(account).to.have.property('modelType', 'deepseek');
      expect(account).to.have.property('initialBalance', 100000);
    });

    it('最多只能创建2个AI账户', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);

      // 创建第1个账户
      let session = guestService.localCache.get(token);
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));
      const account1 = await guestService.createAIAccount(token, { name: '账户1' });

      // 创建第2个账户
      session = guestService.localCache.get(token);
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));
      const account2 = await guestService.createAIAccount(token, { name: '账户2' });

      // 尝试创建第3个账户应该失败
      session = guestService.localCache.get(token);
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));

      try {
        await guestService.createAIAccount(token, { name: '账户3' });
        expect.fail('应该抛出 ACCOUNT_LIMIT_REACHED 错误');
      } catch (error) {
        expect(error.message).to.equal('ACCOUNT_LIMIT_REACHED');
      }
    });

    it('创建账户后过期时间应该变为72小时', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);
      const session = guestService.localCache.get(token);
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));

      await guestService.createAIAccount(token, { name: '测试账户' });

      // 验证 Redis 调用使用了 72 小时的 TTL（有AI账户后）
      const calls = mockRedis.setEx.getCalls();
      // 查找更新会话的调用（应该使用 72 小时 TTL）
      const sessionUpdateCalls = calls.filter(call =>
        call.args[0] === `guest:session:${token}` && call.args[1] === 72 * 60 * 60
      );
      expect(sessionUpdateCalls.length).to.be.at.least(1);
    });
  });

  describe('[C5-003] 游客 AI 对话', () => {
    it('应该记录对话并返回轮数信息', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);
      const session = guestService.localCache.get(token);
      session.aiAccounts = ['acc_1'];
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));

      const result = await guestService.dialogue(token, 'acc_1', '你好');

      expect(result).to.have.property('roundCount', 1);
      expect(result).to.have.property('remainingRounds', 9);
    });

    it('最多只能进行10轮对话', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);
      const session = guestService.localCache.get(token);
      session.aiAccounts = ['acc_1'];
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));

      // 模拟已有10轮对话
      mockRedis.get.withArgs('guest:dialogue:acc_1').resolves(JSON.stringify({
        rounds: 10,
        messages: []
      }));

      try {
        await guestService.dialogue(token, 'acc_1', '第11轮');
        expect.fail('应该抛出 ROUND_LIMIT_REACHED 错误');
      } catch (error) {
        expect(error.message).to.equal('ROUND_LIMIT_REACHED');
      }
    });

    it('非该游客的账户应该拒绝访问', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);
      const session = guestService.localCache.get(token);
      session.aiAccounts = ['acc_1'];
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));

      try {
        await guestService.dialogue(token, 'acc_2', '你好'); // acc_2 不属于该游客
        expect.fail('应该抛出 ACCOUNT_NOT_FOUND 错误');
      } catch (error) {
        expect(error.message).to.equal('ACCOUNT_NOT_FOUND');
      }
    });
  });

  describe('[C5-004] 游客数据迁移', () => {
    it('应该成功迁移到正式用户', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);
      const session = guestService.localCache.get(token);
      session.aiAccounts = ['acc_1'];
      guestService.localCache.set('guest:account:acc_1', {
        id: 'acc_1',
        name: '测试账户',
        modelType: 'deepseek',
        initialBalance: 100000
      });
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));
      mockRedis.get.withArgs('guest:account:acc_1').resolves(JSON.stringify({
        id: 'acc_1',
        name: '测试账户',
        modelType: 'deepseek',
        initialBalance: 100000
      }));

      const result = await guestService.migrateToUser(token, 'user_123');

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('migratedAccounts', 1);
      expect(result).to.have.property('userId', 'user_123');
    });

    it('无效的 token 应该拒绝迁移', async () => {
      mockRedis.get.withArgs('guest:session:invalid_token').resolves(null);

      try {
        await guestService.migrateToUser('invalid_token', 'user_123');
        expect.fail('应该抛出 INVALID_TOKEN 错误');
      } catch (error) {
        expect(error.message).to.equal('INVALID_TOKEN');
      }
    });
  });

  describe('[C5-005] 智能过期策略', () => {
    it('无AI账户时应该24小时过期', async () => {
      const openid = 'test_openid_123';
      const { token, expiresIn } = await guestService.createGuestToken(openid);

      expect(expiresIn).to.equal(24 * 60 * 60);
    });

    it('应该清理过期会话', async () => {
      // 创建一些过期会话
      guestService.localCache.set('token_1', {
        expiresAt: Date.now() - 1000,
        status: 'active'
      });
      guestService.localCache.set('token_2', {
        expiresAt: Date.now() - 2000,
        status: 'active'
      });
      guestService.localCache.set('token_3', {
        expiresAt: Date.now() + 10000,
        status: 'active'
      });

      const cleanedCount = await guestService.cleanupExpiredSessions();

      expect(cleanedCount).to.equal(2);
      expect(guestService.localCache.has('token_1')).to.be.false;
      expect(guestService.localCache.has('token_2')).to.be.false;
      expect(guestService.localCache.has('token_3')).to.be.true;
    });
  });

  describe('[P0-004] Redis 持久化', () => {
    it('Redis 断开时应该降级到内存模式', async () => {
      // 创建没有 Redis 的服务实例
      const memoryOnlyService = new GuestService({});

      const openid = 'test_openid_123';
      const result = await memoryOnlyService.createGuestToken(openid);

      expect(result).to.have.property('token');
      expect(memoryOnlyService.localCache.has(result.token)).to.be.true;
    });

    it('应该从 Redis 恢复数据', async () => {
      // 模拟 Redis 中的数据
      mockRedis.keys.withArgs('guest:session:*').resolves(['guest:session:token_1', 'guest:session:token_2']);
      mockRedis.keys.withArgs('guest:account:*').resolves(['guest:account:acc_1']);
      mockRedis.get.withArgs('guest:session:token_1').resolves(JSON.stringify({ token: 'token_1', status: 'active' }));
      mockRedis.get.withArgs('guest:session:token_2').resolves(JSON.stringify({ token: 'token_2', status: 'active' }));
      mockRedis.get.withArgs('guest:account:acc_1').resolves(JSON.stringify({ id: 'acc_1', status: 'active' }));

      await guestService.restoreFromRedis();

      expect(guestService.localCache.has('token_1')).to.be.true;
      expect(guestService.localCache.has('token_2')).to.be.true;
      expect(guestService.localCache.has('guest:account:acc_1')).to.be.true;
    });

    it('服务重启后应该能从 Redis 恢复会话', async () => {
      const openid = 'test_openid_123';
      const { token } = await guestService.createGuestToken(openid);

      // 模拟服务重启：清除内存缓存
      const session = guestService.localCache.get(token);
      guestService.localCache.clear();

      // 模拟从 Redis 恢复 - 设置 keys 和 get 返回
      mockRedis.keys.withArgs('guest:session:*').resolves([`guest:session:${token}`]);
      mockRedis.keys.withArgs('guest:account:*').resolves([]);
      mockRedis.get.withArgs(`guest:session:${token}`).resolves(JSON.stringify(session));
      await guestService.restoreFromRedis();

      // 验证可以恢复会话
      const restoredSession = guestService.localCache.get(token);
      expect(restoredSession).to.not.be.undefined;
      expect(restoredSession.token).to.equal(token);
    });
  });
});
