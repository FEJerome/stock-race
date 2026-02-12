/**
 * [P0-005] GuestService 单元测试
 *
 * 测试内容:
 * - C5-001: 游客Token生成与过期验证
 * - C5-002: AI账户创建与限制(最多2个)
 * - C5-003: AI对话与轮数限制(最多10轮)
 * - C5-004: 数据迁移
 * - C5-005: 过期清理
 * - C5-006: 会话查询
 * - P0-004: Redis持久化
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GuestService, GuestServiceError } from '../../../src/services/GuestService.js';

describe('GuestService', () => {
  let guestService;
  let mockRedis;

  beforeEach(() => {
    // 创建GuestService实例
    guestService = new GuestService();

    // Mock Redis客户端
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      sAdd: jest.fn().mockResolvedValue(1),
      sMembers: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
    };

    // 替换Redis客户端
    guestService._getRedis = () => mockRedis;
    guestService._useRedis = () => true;
  });

  afterEach(() => {
    guestService.stopCleanupTask();
    jest.restoreAllMocks();
  });

  describe('[C5-001] 游客Token生成', () => {
    it('应该为新的openid生成token', async () => {
      const openid = 'openid-123';

      const result = await guestService.createGuestToken(openid);

      expect(result).toHaveProperty('token');
      expect(result.token).toMatch(/^guest_[a-f0-9]{16}_[a-f0-9]{32}$/);
      expect(result).toHaveProperty('expiresAt');
    });

    it('同一openid应该生成相同的token（如果会话未过期）', async () => {
      const openid = 'openid-123';

      const result1 = await guestService.createGuestToken(openid);
      const result2 = await guestService.createGuestToken(openid);

      expect(result1.token).toBe(result2.token);
    });

    it('token应该包含正确的过期时间（24小时）', async () => {
      const openid = 'openid-123';
      const beforeCreate = new Date();

      const result = await guestService.createGuestToken(openid);

      const expiresAt = new Date(result.expiresAt);
      const expectedExpiry = new Date(beforeCreate.getTime() + 24 * 60 * 60 * 1000);

      // 允许1秒的误差
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });

    it('应该将会话持久化到Redis', async () => {
      const openid = 'openid-123';

      await guestService.createGuestToken(openid);

      expect(mockRedis.setEx).toHaveBeenCalled();
      const [key, ttl, value] = mockRedis.setEx.mock.calls[0];
      expect(key).toMatch(/^guest:session:/);
      expect(ttl).toBe(24 * 60 * 60); // 24小时
    });
  });

  describe('[C5-001] Token验证', () => {
    it('应该验证有效的token', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      const session = await guestService.getSession(token);

      expect(session).not.toBeNull();
      expect(session.token).toBe(token);
    });

    it('应该拒绝无效的token格式', async () => {
      const session = await guestService.getSession('invalid-token');

      expect(session).toBeNull();
    });

    it('应该拒绝不存在的会话', async () => {
      const session = await guestService.getSession('guest_1234567890abcdef_1234567890abcdef1234567890abcdef');

      expect(session).toBeNull();
    });

    it('应该拒绝过期的token', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      // 模拟过期
      const session = guestService.sessions.get(guestService._hashOpenid(openid));
      session.expiresAt = new Date(Date.now() - 1000).toISOString();

      const result = await guestService.getSession(token);

      expect(result).toBeNull();
    });
  });

  describe('[C5-002] AI账户创建', () => {
    it('应该为游客创建AI账户', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      const account = await guestService.createAIAccount(token, { name: '测试账户' });

      expect(account).toHaveProperty('id');
      expect(account).toHaveProperty('name', '测试账户');
      expect(account).toHaveProperty('status', 'initializing');
      expect(account.guestId).toBe(guestService._hashOpenid(openid));
    });

    it('应该限制最多2个AI账户', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      // 创建2个账户
      await guestService.createAIAccount(token, { name: '账户1' });
      await guestService.createAIAccount(token, { name: '账户2' });

      // 第3个应该失败
      await expect(
        guestService.createAIAccount(token, { name: '账户3' })
      ).rejects.toThrow(GuestServiceError);

      await expect(
        guestService.createAIAccount(token, { name: '账户3' })
      ).rejects.toThrow('Maximum 2 AI accounts');
    });

    it('应该使用默认名称创建账户', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      const account = await guestService.createAIAccount(token);

      expect(account.name).toBe('AI账户 1');
    });

    it('应该设置默认初始资金', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      const account = await guestService.createAIAccount(token);

      expect(account.initialBalance).toBe(100000);
    });

    it('应该将账户持久化到Redis', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      await guestService.createAIAccount(token, { name: '测试账户' });

      expect(mockRedis.setEx).toHaveBeenCalled();
      const calls = mockRedis.setEx.mock.calls;
      const accountCall = calls.find(call => call[0].includes('guest:account:'));
      expect(accountCall).toBeDefined();
    });
  });

  describe('[C5-003] AI对话', () => {
    it('应该开始新的对话', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      const account = await guestService.createAIAccount(token);

      const dialogue = await guestService.startDialogue(token, account.id);

      expect(dialogue).toHaveProperty('sessionId');
      expect(dialogue).toHaveProperty('accountId', account.id);
      expect(dialogue).toHaveProperty('status', 'active');
      expect(dialogue.roundCount).toBe(0);
      expect(dialogue.maxRounds).toBe(10);
    });

    it('应该返回现有的活跃对话', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      const account = await guestService.createAIAccount(token);

      const dialogue1 = await guestService.startDialogue(token, account.id);
      const dialogue2 = await guestService.startDialogue(token, account.id);

      expect(dialogue1.sessionId).toBe(dialogue2.sessionId);
    });

    it('应该发送消息并增加轮数', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      const account = await guestService.createAIAccount(token);
      await guestService.startDialogue(token, account.id);

      const response = await guestService.sendMessage(token, account.id, '你好');

      expect(response).toHaveProperty('type', 'message');
      expect(response).toHaveProperty('roundCount', 1);
      expect(response).toHaveProperty('remainingRounds', 9);
    });

    it('应该限制最多10轮对话', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      const account = await guestService.createAIAccount(token);
      await guestService.startDialogue(token, account.id);

      // 发送10条消息
      for (let i = 0; i < 10; i++) {
        await guestService.sendMessage(token, account.id, `消息${i}`);
      }

      // 第11条应该失败
      await expect(
        guestService.sendMessage(token, account.id, '第11条')
      ).rejects.toThrow(GuestServiceError);

      await expect(
        guestService.sendMessage(token, account.id, '第11条')
      ).rejects.toThrow('ROUND_LIMIT_REACHED');
    });

    it('应该标记最后一轮对话', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      const account = await guestService.createAIAccount(token);
      await guestService.startDialogue(token, account.id);

      // 发送9条消息
      for (let i = 0; i < 9; i++) {
        await guestService.sendMessage(token, account.id, `消息${i}`);
      }

      // 第10条应该是最后一轮
      const response = await guestService.sendMessage(token, account.id, '最后一条');

      expect(response.isLastRound).toBe(true);
      expect(response.remainingRounds).toBe(0);
    });

    it('应该拒绝无效的账户ID', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      await expect(
        guestService.startDialogue(token, 'invalid-account-id')
      ).rejects.toThrow(GuestServiceError);
    });

    it('应该拒绝其他游客的账户', async () => {
      const openid1 = 'openid-123';
      const openid2 = 'openid-456';
      const { token: token1 } = await guestService.createGuestToken(openid1);
      const { token: token2 } = await guestService.createGuestToken(openid2);
      const account = await guestService.createAIAccount(token1);

      await expect(
        guestService.startDialogue(token2, account.id)
      ).rejects.toThrow(GuestServiceError);
    });
  });

  describe('[C5-004] 数据迁移', () => {
    it('应该将游客数据迁移到正式用户', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      const account = await guestService.createAIAccount(token, { name: '测试账户' });

      const result = await guestService.migrateToFormalUser(token, 'user-456');

      expect(result.success).toBe(true);
      expect(result.migratedAccounts).toHaveLength(1);
      expect(result.migratedAccounts[0]).toHaveProperty('originalId', account.id);
      expect(result.migratedAccounts[0]).toHaveProperty('newUserId', 'user-456');
    });

    it('应该更新会话状态为已迁移', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      await guestService.createAIAccount(token);

      await guestService.migrateToFormalUser(token, 'user-456');

      const session = await guestService.getSession(token);
      expect(session).toBeNull(); // 已迁移的会话无法访问
    });

    it('应该更新账户状态为已迁移', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      const account = await guestService.createAIAccount(token);

      await guestService.migrateToFormalUser(token, 'user-456');

      const accounts = await guestService.getGuestAccounts(token);
      expect(accounts).toHaveLength(0); // 已迁移的账户不再显示
    });

    it('应该支持迁移多个账户', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      await guestService.createAIAccount(token, { name: '账户1' });
      await guestService.createAIAccount(token, { name: '账户2' });

      const result = await guestService.migrateToFormalUser(token, 'user-456');

      expect(result.migratedAccounts).toHaveLength(2);
    });
  });

  describe('[C5-005] 过期清理', () => {
    it('应该清理过期的会话', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      // 模拟过期
      const session = guestService.sessions.get(guestService._hashOpenid(openid));
      session.expiresAt = new Date(Date.now() - 1000).toISOString();

      const result = await guestService.cleanupExpiredSessions();

      expect(result.cleanedCount).toBe(1);
      expect(session.status).toBe('expired');
    });

    it('不应该清理未过期的会话', async () => {
      const openid = 'openid-123';
      await guestService.createGuestToken(openid);

      const result = await guestService.cleanupExpiredSessions();

      expect(result.cleanedCount).toBe(0);
    });

    it('应该清理过期会话关联的对话', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      const account = await guestService.createAIAccount(token);
      await guestService.startDialogue(token, account.id);

      // 模拟过期
      const session = guestService.sessions.get(guestService._hashOpenid(openid));
      session.expiresAt = new Date(Date.now() - 1000).toISOString();

      await guestService.cleanupExpiredSessions();

      const dialogue = guestService.dialogues.get(account.id);
      expect(dialogue.status).toBe('expired');
    });
  });

  describe('[C5-006] 会话查询', () => {
    it('应该获取游客的AI账户列表', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);
      await guestService.createAIAccount(token, { name: '账户1' });
      await guestService.createAIAccount(token, { name: '账户2' });

      const accounts = await guestService.getGuestAccounts(token);

      expect(accounts).toHaveLength(2);
      expect(accounts[0]).toHaveProperty('name');
    });

    it('应该只返回当前游客的账户', async () => {
      const openid1 = 'openid-123';
      const openid2 = 'openid-456';
      const { token: token1 } = await guestService.createGuestToken(openid1);
      const { token: token2 } = await guestService.createGuestToken(openid2);
      await guestService.createAIAccount(token1, { name: '游客1的账户' });
      await guestService.createAIAccount(token2, { name: '游客2的账户' });

      const accounts = await guestService.getGuestAccounts(token1);

      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe('游客1的账户');
    });
  });

  describe('[P0-004] Redis持久化', () => {
    it('应该支持从Redis恢复会话', async () => {
      const openid = 'openid-123';
      const openidHash = guestService._hashOpenid(openid);
      const sessionData = JSON.stringify({
        openidHash,
        token: 'guest_test123_test456',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        aiAccountCount: 0,
        migratedTo: null,
      });

      mockRedis.get.mockResolvedValue(sessionData);

      const session = await guestService.getSession('guest_test123_test456');

      expect(session).not.toBeNull();
      expect(session.token).toBe('guest_test123_test456');
    });

    it('应该支持从Redis恢复账户', async () => {
      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      // 模拟Redis中有账户
      mockRedis.sMembers.mockResolvedValue(['acc-1']);
      mockRedis.get.mockImplementation((key) => {
        if (key.includes('guest:account:')) {
          return JSON.stringify({
            id: 'acc-1',
            guestId: guestService._hashOpenid(openid),
            name: 'Redis账户',
            status: 'initializing',
            createdAt: new Date().toISOString(),
            dialogues: [],
          });
        }
        return null;
      });

      const accounts = await guestService.getGuestAccounts(token);

      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe('Redis账户');
    });

    it('应该支持restoreFromRedis方法', async () => {
      mockRedis.keys.mockImplementation((pattern) => {
        if (pattern.includes('session')) return ['guest:session:hash1'];
        if (pattern.includes('account')) return ['guest:account:acc1'];
        if (pattern.includes('dialogue')) return ['guest:dialogue:acc1'];
        return [];
      });

      mockRedis.get.mockImplementation((key) => {
        if (key.includes('session')) {
          return JSON.stringify({
            openidHash: 'hash1',
            status: 'active',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
        }
        if (key.includes('account')) {
          return JSON.stringify({
            id: 'acc1',
            status: 'initializing',
          });
        }
        if (key.includes('dialogue')) {
          return JSON.stringify({
            accountId: 'acc1',
            status: 'active',
          });
        }
        return null;
      });

      const result = await guestService.restoreFromRedis();

      expect(result.restored).toBe(3);
      expect(result.sessions).toBe(1);
      expect(result.accounts).toBe(1);
      expect(result.dialogues).toBe(1);
    });

    it('应该处理Redis连接失败的情况', async () => {
      guestService._useRedis = () => false;

      const openid = 'openid-123';
      const { token } = await guestService.createGuestToken(openid);

      // 不使用Redis时应该正常工作
      const session = await guestService.getSession(token);
      expect(session).not.toBeNull();
    });

    it('应该提供持久化统计', () => {
      const stats = guestService.getPersistenceStats();

      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('redis');
      expect(stats.redis).toHaveProperty('available');
      expect(stats.redis).toHaveProperty('prefix');
    });
  });

  describe('错误处理', () => {
    it('应该抛出GuestServiceError', async () => {
      const error = new GuestServiceError('TEST_ERROR', 'Test message', { detail: 'test' });

      expect(error.name).toBe('GuestServiceError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.details).toEqual({ detail: 'test' });
      expect(error).toHaveProperty('timestamp');
    });

    it('应该处理Redis错误而不中断服务', async () => {
      mockRedis.setEx.mockRejectedValue(new Error('Redis error'));

      const openid = 'openid-123';

      // 即使Redis失败，也应该成功创建token
      const result = await guestService.createGuestToken(openid);

      expect(result).toHaveProperty('token');
    });
  });
});
