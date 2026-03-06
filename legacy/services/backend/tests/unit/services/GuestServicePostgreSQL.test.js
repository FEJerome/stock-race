/**
 * GuestService PostgreSQL重构 - 完整测试套件
 * TDD原则：测试先行，覆盖所有场景
 *
 * 测试覆盖：
 * - 游客Token创建与验证（C5-001）
 * - AI账户CRUD操作（C5-002）
 * - AI对话管理（C5-003）
 * - 数据迁移（C5-004）
 * - 过期清理（C5-005）
 * - 事务安全与并发控制
 * - 缓存一致性
 * - 错误处理与回滚
 *
 * @author Backend开发团队
 * @date 2026-02-13
 */

const { jest, describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

// 被测服务（将实现）
const GuestServicePostgreSQL = require('../../../src/services/GuestServicePostgreSQL.js');

describe('GuestServicePostgreSQL', () => {
  let guestService;
  let prisma;

  beforeEach(() => {
    prisma = new PrismaClient();
    guestService = new GuestServicePostgreSQL(prisma);
  });

  afterEach(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  async function cleanupTestData() {
    // 清理测试数据（按依赖顺序）
    await prisma.$executeRaw`DELETE FROM decision_logs WHERE account_id IN (SELECT id FROM ai_accounts WHERE is_guest = true)`;
    await prisma.$executeRaw`DELETE FROM portfolios WHERE account_id IN (SELECT id FROM ai_accounts WHERE is_guest = true)`;
    await prisma.$executeRaw`DELETE FROM trades WHERE account_id IN (SELECT id FROM ai_accounts WHERE is_guest = true)`;
    await prisma.$executeRaw`DELETE FROM ai_accounts WHERE is_guest = true`;
    await prisma.$executeRaw`DELETE FROM guest_sessions WHERE openid_hash LIKE 'test_%'`;
  }

  function generateTestOpenid(suffix = '') {
    return `test_openid_${suffix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function hashOpenid(openid) {
    return crypto.createHash('sha256').update(openid).digest('hex');
  }

  // ============================================================================
  // G-003-001: 游客Token创建与验证
  // ============================================================================
  describe('游客Token创建与验证 (C5-001)', () => {
    describe('createGuestToken', () => {
      it('应该为新openid创建游客Token', async () => {
        const openid = generateTestOpenid('new');

        const result = await guestService.createGuestToken(openid);

        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('expiresAt');
        expect(result.token).toMatch(/^guest_/);
        expect(new Date(result.expiresAt)).toBeInstanceOf(Date);
      });

      it('应该使用openid_hash作为唯一标识', async () => {
        const openid = generateTestOpenid('hash');
        const openidHash = hashOpenid(openid);

        await guestService.createGuestToken(openid);

        const session = await prisma.guest_sessions.findUnique({
          where: { openid_hash: openidHash }
        });

        expect(session).not.toBeNull();
        expect(session.openid_hash).toBe(openidHash);
      });

      it('相同openid应该返回相同的Token（在有效期内）', async () => {
        const openid = generateTestOpenid('same');

        const result1 = await guestService.createGuestToken(openid);
        const result2 = await guestService.createGuestToken(openid);

        expect(result1.token).toBe(result2.token);
      });

      it('相同openid应该更新过期时间', async () => {
        const openid = generateTestOpenid('renew');

        const result1 = await guestService.createGuestToken(openid);
        await new Promise(resolve => setTimeout(resolve, 100)); // 等待100ms
        const result2 = await guestService.createGuestToken(openid);

        expect(new Date(result2.expiresAt)).toBeGreaterThanOrEqual(
          new Date(result1.expiresAt)
        );
      });

      it('无AI账户时过期时间应为24小时', async () => {
        const openid = generateTestOpenid('24h');

        const result = await guestService.createGuestToken(openid);
        const expectedExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        expect(new Date(result.expiresAt)).toBeGreaterThan(
          new Date(expectedExpiry.getTime() - 60000) // 允许1分钟误差
        );
        expect(new Date(result.expiresAt)).toBeLessThan(
          new Date(expectedExpiry.getTime() + 60000)
        );
      });

      it('状态应设置为active', async () => {
        const openid = generateTestOpenid('active');
        const openidHash = hashOpenid(openid);

        await guestService.createGuestToken(openid);

        const session = await prisma.guest_sessions.findUnique({
          where: { openid_hash: openidHash }
        });

        expect(session.status).toBe('active');
      });

      it('ai_account_count应默认为0', async () => {
        const openid = generateTestOpenid('count0');
        const openidHash = hashOpenid(openid);

        await guestService.createGuestToken(openid);

        const session = await prisma.guest_sessions.findUnique({
          where: { openid_hash: openidHash }
        });

        expect(session.ai_account_count).toBe(0);
      });

      it('openid为空应该抛出错误', async () => {
        await expect(guestService.createGuestToken('')).rejects.toThrow();
        await expect(guestService.createGuestToken(null)).rejects.toThrow();
        await expect(guestService.createGuestToken(undefined)).rejects.toThrow();
      });
    });

    describe('validateGuestToken', () => {
      it('应该验证有效的Token', async () => {
        const openid = generateTestOpenid('valid');
        const { token } = await guestService.createGuestToken(openid);

        const result = await guestService.validateGuestToken(token);

        expect(result).not.toBeNull();
        expect(result.openid_hash).toBe(hashOpenid(openid));
        expect(result.status).toBe('active');
      });

      it('无效的Token应该返回null', async () => {
        const result = await guestService.validateGuestToken('invalid_token');
        expect(result).toBeNull();
      });

      it('过期的Token应该返回null', async () => {
        const openid = generateTestOpenid('expired');
        const { token } = await guestService.createGuestToken(openid);

        // 手动将过期时间设为过去
        await prisma.guest_sessions.updateMany({
          where: { guest_token: token },
          data: { expires_at: new Date(Date.now() - 1000), status: 'expired' }
        });

        const result = await guestService.validateGuestToken(token);
        expect(result).toBeNull();
      });

      it('migrated状态的Token应该返回null', async () => {
        const openid = generateTestOpenid('migrated');
        const { token } = await guestService.createGuestToken(openid);

        await prisma.guest_sessions.updateMany({
          where: { guest_token: token },
          data: { status: 'migrated', migrated_user_id: 1 }
        });

        const result = await guestService.validateGuestToken(token);
        expect(result).toBeNull();
      });

      it('应该更新最后活跃时间', async () => {
        const openid = generateTestOpenid('activity');
        const { token } = await guestService.createGuestToken(openid);

        const before = await prisma.guest_sessions.findFirst({
          where: { guest_token: token }
        });

        await new Promise(resolve => setTimeout(resolve, 100));
        await guestService.validateGuestToken(token);

        const after = await prisma.guest_sessions.findFirst({
          where: { guest_token: token }
        });

        expect(new Date(after.last_activity_at)).toBeGreaterThan(
          new Date(before.last_activity_at)
        );
      });
    });
  });

  // ============================================================================
  // G-003-002: AI账户CRUD操作
  // ============================================================================
  describe('AI账户CRUD操作 (C5-002)', () => {
    let validToken;
    let guestSessionId;

    beforeEach(async () => {
      const openid = generateTestOpenid('account');
      const result = await guestService.createGuestToken(openid);
      validToken = result.token;

      const session = await prisma.guest_sessions.findFirst({
        where: { guest_token: validToken }
      });
      guestSessionId = session.id;
    });

    describe('createAIAccount', () => {
      it('应该为游客创建AI账户', async () => {
        const account = await guestService.createAIAccount(validToken, {
          name: '测试AI账户',
          initialBalance: 100000
        });

        expect(account).toHaveProperty('id');
        expect(account).toHaveProperty('name', '测试AI账户');
        expect(account.is_guest).toBe(true);
        expect(account.guest_session_id).toBe(guestSessionId);
      });

      it('应该限制最多3个活跃AI账户', async () => {
        // 创建3个账户
        for (let i = 0; i < 3; i++) {
          await guestService.createAIAccount(validToken, {
            name: `AI账户${i + 1}`,
            initialBalance: 100000
          });
        }

        // 第4个应该失败
        await expect(
          guestService.createAIAccount(validToken, {
            name: 'AI账户4',
            initialBalance: 100000
          })
        ).rejects.toThrow(/上限|limit/i);
      });

      it('已删除的账户不计入上限', async () => {
        // 创建3个账户
        const accounts = [];
        for (let i = 0; i < 3; i++) {
          const acc = await guestService.createAIAccount(validToken, {
            name: `AI账户${i + 1}`,
            initialBalance: 100000
          });
          accounts.push(acc);
        }

        // 删除第一个
        await guestService.deleteAIAccount(validToken, accounts[0].id);

        // 现在可以创建新账户
        const newAccount = await guestService.createAIAccount(validToken, {
          name: '新AI账户',
          initialBalance: 100000
        });

        expect(newAccount).toHaveProperty('id');
      });

      it('无效的Token应该抛出错误', async () => {
        await expect(
          guestService.createAIAccount('invalid_token', { name: '测试' })
        ).rejects.toThrow();
      });

      it('应该更新ai_account_count', async () => {
        await guestService.createAIAccount(validToken, {
          name: '测试账户',
          initialBalance: 100000
        });

        const session = await prisma.guest_sessions.findUnique({
          where: { id: guestSessionId }
        });

        expect(session.ai_account_count).toBe(1);
      });

      it('有AI账户后过期时间应延长至72小时', async () => {
        const openid = generateTestOpenid('72h');
        const { token } = await guestService.createGuestToken(openid);

        await guestService.createAIAccount(token, {
          name: '延长过期',
          initialBalance: 100000
        });

        const session = await prisma.guest_sessions.findFirst({
          where: { guest_token: token }
        });

        const expectedExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
        expect(new Date(session.expires_at)).toBeGreaterThan(
          new Date(expectedExpiry.getTime() - 5 * 60 * 1000) // 允许5分钟误差
        );
      });
    });

    describe('getAIAccounts', () => {
      it('应该返回游客的所有AI账户', async () => {
        await guestService.createAIAccount(validToken, { name: '账户1' });
        await guestService.createAIAccount(validToken, { name: '账户2' });

        const accounts = await guestService.getAIAccounts(validToken);

        expect(accounts).toHaveLength(2);
        expect(accounts[0].name).toMatch(/账户[12]/);
        expect(accounts[1].name).toMatch(/账户[12]/);
      });

      it('不应该返回已删除的账户', async () => {
        const acc1 = await guestService.createAIAccount(validToken, { name: '账户1' });
        await guestService.createAIAccount(validToken, { name: '账户2' });

        await guestService.deleteAIAccount(validToken, acc1.id);

        const accounts = await guestService.getAIAccounts(validToken);
        expect(accounts).toHaveLength(1);
        expect(accounts[0].name).toBe('账户2');
      });

      it('无效的Token应该返回空数组', async () => {
        const accounts = await guestService.getAIAccounts('invalid_token');
        expect(accounts).toEqual([]);
      });
    });

    describe('deleteAIAccount', () => {
      it('应该软删除AI账户', async () => {
        const account = await guestService.createAIAccount(validToken, { name: '待删除' });

        await guestService.deleteAIAccount(validToken, account.id);

        const deleted = await prisma.ai_accounts.findUnique({
          where: { id: account.id }
        });

        expect(deleted.status).toBe('deleted');
        expect(deleted.deleted_at).not.toBeNull();
      });

      it('应该减少ai_account_count', async () => {
        const account = await guestService.createAIAccount(validToken, { name: '待删除' });

        const before = await prisma.guest_sessions.findUnique({
          where: { id: guestSessionId }
        });
        expect(before.ai_account_count).toBe(1);

        await guestService.deleteAIAccount(validToken, account.id);

        const after = await prisma.guest_sessions.findUnique({
          where: { id: guestSessionId }
        });
        expect(after.ai_account_count).toBe(0);
      });

      it('不能删除其他游客的账户', async () => {
        const otherOpenid = generateTestOpenid('other');
        const otherResult = await guestService.createGuestToken(otherOpenid);
        const otherToken = otherResult.token;

        const otherAccount = await guestService.createAIAccount(otherToken, { name: '别人的' });

        await expect(
          guestService.deleteAIAccount(validToken, otherAccount.id)
        ).rejects.toThrow(/无权|不存在|not found/i);
      });

      it('已删除的账户不能再次删除', async () => {
        const account = await guestService.createAIAccount(validToken, { name: '已删除' });
        await guestService.deleteAIAccount(validToken, account.id);

        await expect(
          guestService.deleteAIAccount(validToken, account.id)
        ).rejects.toThrow(/已删除|already deleted/i);
      });
    });
  });

  // ============================================================================
  // G-003-003: AI对话管理
  // ============================================================================
  describe('AI对话管理 (C5-003)', () => {
    let validToken;
    let accountId;

    beforeEach(async () => {
      const openid = generateTestOpenid('dialogue');
      const result = await guestService.createGuestToken(openid);
      validToken = result.token;

      const account = await guestService.createAIAccount(validToken, { name: '对话测试' });
      accountId = account.id;
    });

    describe('startDialogue', () => {
      it('应该为AI账户创建对话', async () => {
        const dialogue = await guestService.startDialogue(validToken, accountId);

        expect(dialogue).toHaveProperty('sessionId');
        expect(dialogue).toHaveProperty('roundCount', 0);
        expect(dialogue).toHaveProperty('maxRounds', 10);
        expect(dialogue.status).toBe('active');
      });

      it('已经活跃的对话应该直接返回', async () => {
        const dialogue1 = await guestService.startDialogue(validToken, accountId);
        const dialogue2 = await guestService.startDialogue(validToken, accountId);

        expect(dialogue1.sessionId).toBe(dialogue2.sessionId);
      });

      it('不能为其他游客的账户创建对话', async () => {
        const otherOpenid = generateTestOpenid('other_dialogue');
        const otherResult = await guestService.createGuestToken(otherOpenid);

        await expect(
          guestService.startDialogue(otherResult.token, accountId)
        ).rejects.toThrow(/无权|不存在/i);
      });
    });

    describe('sendMessage', () => {
      it('应该发送消息并增加轮数', async () => {
        await guestService.startDialogue(validToken, accountId);

        const result = await guestService.sendMessage(validToken, accountId, '你好');

        expect(result.roundCount).toBe(1);
        expect(result.remainingRounds).toBe(9);
      });

      it('超过10轮应该抛出错误', async () => {
        await guestService.startDialogue(validToken, accountId);

        for (let i = 0; i < 10; i++) {
          await guestService.sendMessage(validToken, accountId, `消息${i}`);
        }

        await expect(
          guestService.sendMessage(validToken, accountId, '第11轮')
        ).rejects.toThrow(/上限|limit reached/i);
      });

      it('应该返回AI响应', async () => {
        await guestService.startDialogue(validToken, accountId);

        const result = await guestService.sendMessage(validToken, accountId, '分析这只股票');

        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('type', 'message');
      });
    });
  });

  // ============================================================================
  // G-003-004: 数据迁移（核心安全模块）
  // ============================================================================
  describe('数据迁移 (C5-004) - 事务安全', () => {
    let guestToken;
    let guestSessionId;
    let accountIds = [];

    beforeEach(async () => {
      const openid = generateTestOpenid('migration');
      const result = await guestService.createGuestToken(openid);
      guestToken = result.token;

      const session = await prisma.guest_sessions.findFirst({
        where: { guest_token: guestToken }
      });
      guestSessionId = session.id;

      // 创建3个AI账户
      accountIds = [];
      for (let i = 0; i < 3; i++) {
        const acc = await guestService.createAIAccount(guestToken, {
          name: `迁移账户${i + 1}`,
          initialBalance: 100000
        });
        accountIds.push(acc.id);
      }
    });

    it('应该原子迁移所有AI账户到正式用户', async () => {
      const userId = 999; // 假设的正式用户ID

      const result = await guestService.migrateToFormalUser(guestToken, userId);

      expect(result.success).toBe(true);
      expect(result.migratedAccounts).toBe(3);
      expect(result.userId).toBe(userId);
    });

    it('迁移后AI账户应该绑定到新用户', async () => {
      const userId = 999;
      await guestService.migrateToFormalUser(guestToken, userId);

      for (const accountId of accountIds) {
        const account = await prisma.ai_accounts.findUnique({
          where: { id: accountId }
        });

        expect(account.userId).toBe(userId);
        expect(account.is_guest).toBe(false);
        expect(account.guest_session_id).toBeNull();
      }
    });

    it('迁移后游客会话应该标记为migrated', async () => {
      const userId = 999;
      await guestService.migrateToFormalUser(guestToken, userId);

      const session = await prisma.guest_sessions.findUnique({
        where: { id: guestSessionId }
      });

      expect(session.status).toBe('migrated');
      expect(session.migrated_user_id).toBe(userId);
      expect(session.migrated_at).not.toBeNull();
    });

    it('迁移中的游客会话不应该被删除', async () => {
      const userId = 999;

      // 模拟迁移状态
      await prisma.guest_sessions.update({
        where: { id: guestSessionId },
        data: { status: 'migrating' }
      });

      // 尝试删除应该失败（触发器保护）
      await expect(
        prisma.guest_sessions.delete({ where: { id: guestSessionId } })
      ).rejects.toThrow();
    });

    it('迁移失败应该回滚所有更改', async () => {
      // 模拟失败场景（例如用户ID不存在但外键约束）
      const invalidUserId = -1;

      await expect(
        guestService.migrateToFormalUser(guestToken, invalidUserId)
      ).rejects.toThrow();

      // 验证数据未改变
      const session = await prisma.guest_sessions.findUnique({
        where: { id: guestSessionId }
      });
      expect(session.status).toBe('active');

      for (const accountId of accountIds) {
        const account = await prisma.ai_accounts.findUnique({
          where: { id: accountId }
        });
        expect(account.is_guest).toBe(true);
        expect(account.guest_session_id).toBe(guestSessionId);
      }
    });

    it('并发迁移应该只有一个成功', async () => {
      const userId1 = 991;
      const userId2 = 992;

      // 同时发起两个迁移请求
      const [result1, result2] = await Promise.allSettled([
        guestService.migrateToFormalUser(guestToken, userId1),
        guestService.migrateToFormalUser(guestToken, userId2)
      ]);

      // 一个成功，一个失败
      const successCount = [result1, result2].filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBe(1);
    });

    it('已迁移的账户不应该被再次迁移', async () => {
      const userId = 999;
      await guestService.migrateToFormalUser(guestToken, userId);

      await expect(
        guestService.migrateToFormalUser(guestToken, userId)
      ).rejects.toThrow(/已迁移|already migrated/i);
    });
  });

  // ============================================================================
  // G-003-005: 过期清理
  // ============================================================================
  describe('过期清理 (C5-005)', () => {
    it('应该逻辑删除已过期的游客会话', async () => {
      // 创建已过期的会话
      const openid = generateTestOpenid('expired_cleanup');
      const { token } = await guestService.createGuestToken(openid);

      await prisma.guest_sessions.updateMany({
        where: { guest_token: token },
        data: {
          expires_at: new Date(Date.now() - 1000),
          status: 'active'
        }
      });

      // 执行清理
      const cleaned = await guestService.cleanupExpiredSessions();

      expect(cleaned.count).toBeGreaterThan(0);

      const session = await prisma.guest_sessions.findFirst({
        where: { guest_token: token }
      });

      expect(session.status).toBe('expired');
    });

    it('不应该删除migrating状态的会话', async () => {
      const openid = generateTestOpenid('migrating_cleanup');
      const { token } = await guestService.createGuestToken(openid);

      await prisma.guest_sessions.updateMany({
        where: { guest_token: token },
        data: {
          expires_at: new Date(Date.now() - 1000),
          status: 'migrating'
        }
      });

      const cleaned = await guestService.cleanupExpiredSessions();

      const session = await prisma.guest_sessions.findFirst({
        where: { guest_token: token }
      });

      expect(session.status).toBe('migrating');
    });

    it('不应该删除migrated状态的会话', async () => {
      const openid = generateTestOpenid('migrated_cleanup');
      const { token } = await guestService.createGuestToken(openid);

      await prisma.guest_sessions.updateMany({
        where: { guest_token: token },
        data: {
          expires_at: new Date(Date.now() - 1000),
          status: 'migrated',
          migrated_user_id: 1
        }
      });

      const cleaned = await guestService.cleanupExpiredSessions();

      const session = await prisma.guest_sessions.findFirst({
        where: { guest_token: token }
      });

      expect(session.status).toBe('migrated');
    });

    it('应该物理删除已过期的expired状态会话（延迟25小时后）', async () => {
      const openid = generateTestOpenid('physical_cleanup');
      const hash = hashOpenid(openid);

      await prisma.guest_sessions.create({
        data: {
          openid_hash: hash,
          guest_token: `guest_${hash.substring(0, 16)}_old`,
          status: 'expired',
          expires_at: new Date(Date.now() - 26 * 60 * 60 * 1000), // 26小时前
          ai_account_count: 0
        }
      });

      const deleted = await guestService.physicalCleanup();

      expect(deleted.count).toBeGreaterThan(0);

      const session = await prisma.guest_sessions.findFirst({
        where: { openid_hash: hash }
      });

      expect(session).toBeNull();
    });
  });

  // ============================================================================
  // G-003-006: 错误处理与边界情况
  // ============================================================================
  describe('错误处理与边界情况', () => {
    it('数据库连接失败应该抛出友好错误', async () => {
      const badService = new GuestServicePostgreSQL(null);

      await expect(
        badService.createGuestToken('test')
      ).rejects.toThrow();
    });

    it('重复删除同一账户应该优雅处理', async () => {
      const openid = generateTestOpenid('double_delete');
      const { token } = await guestService.createGuestToken(openid);
      const account = await guestService.createAIAccount(token, { name: '测试' });

      await guestService.deleteAIAccount(token, account.id);

      // 第二次删除应该抛出错误
      await expect(
        guestService.deleteAIAccount(token, account.id)
      ).rejects.toThrow();
    });

    it('为不存在的账户创建对话应该抛出错误', async () => {
      const openid = generateTestOpenid('no_account');
      const { token } = await guestService.createGuestToken(openid);

      await expect(
        guestService.startDialogue(token, 999999)
      ).rejects.toThrow(/不存在|not found/i);
    });

    it('超长的openid应该被正确处理', async () => {
      const longOpenid = 'a'.repeat(1000);

      const result = await guestService.createGuestToken(longOpenid);

      expect(result).toHaveProperty('token');
    });
  });
});

// ============================================================================
// 导出测试套件配置
// ============================================================================
describe('GuestServicePostgreSQL - 测试配置', () => {
  it('测试环境应该正确配置', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
