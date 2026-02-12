/**
 * 游客服务单元测试
 * 测试Backend游客模式功能
 *
 * 对应需求: C5-001 ~ C5-006
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import GuestService from '../../../src/services/GuestService.js';

describe('GuestService (C5-001~006)', () => {
  beforeEach(() => {
    // 重置服务状态
    GuestService.sessions.clear();
    GuestService.aiAccounts.clear();
  });

  describe('C5-001: 游客Token生成', () => {
    it('should create guest token', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);

      expect(token).toHaveProperty('token');
      expect(token).toHaveProperty('expiresAt');
      expect(token.token).toMatch(/^guest_/);
    });

    it('should generate same token for same openid', async () => {
      const openid = 'test-openid-123';
      const token1 = await GuestService.createGuestToken(openid);
      const token2 = await GuestService.createGuestToken(openid);

      expect(token1.token).toBe(token2.token);
    });

    it('should set 24h expiration for new guest without AI accounts', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);

      const now = Date.now();
      const expiresAt = new Date(token.expiresAt).getTime();
      const hours24 = 24 * 60 * 60 * 1000;

      expect(expiresAt - now).toBeGreaterThan(hours24 - 60000); // 允许1分钟误差
      expect(expiresAt - now).toBeLessThanOrEqual(hours24);
    });
  });

  describe('C5-002: 游客AI账户创建', () => {
    it('should create AI account for guest', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);

      const account = await GuestService.createAIAccount(token.token, {
        name: 'Test AI',
        initialBalance: 100000,
      });

      expect(account).toHaveProperty('id');
      expect(account).toHaveProperty('name', 'Test AI');
      expect(account).toHaveProperty('status', 'initializing');
      expect(account.guestId).toBe(openid);
    });

    it('should limit to 2 AI accounts per guest', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);

      await GuestService.createAIAccount(token.token, { name: 'AI 1' });
      await GuestService.createAIAccount(token.token, { name: 'AI 2' });

      await expect(
        GuestService.createAIAccount(token.token, { name: 'AI 3' })
      ).rejects.toThrow('Maximum 2 AI accounts allowed for guest');
    });

    it('should reject account creation with invalid token', async () => {
      await expect(
        GuestService.createAIAccount('invalid-token', { name: 'Test' })
      ).rejects.toThrow('Invalid or expired guest token');
    });
  });

  describe('C5-003: 游客AI对话', () => {
    it('should allow dialogue for guest AI account', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);
      const account = await GuestService.createAIAccount(token.token, { name: 'Test AI' });

      const dialogue = await GuestService.startDialogue(token.token, account.id);

      expect(dialogue).toHaveProperty('sessionId');
      expect(dialogue).toHaveProperty('roundCount', 0);
      expect(dialogue).toHaveProperty('maxRounds', 10);
    });

    it('should limit dialogue to 10 rounds', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);
      const account = await GuestService.createAIAccount(token.token, { name: 'Test AI' });
      const dialogue = await GuestService.startDialogue(token.token, account.id);

      // 模拟10轮对话
      for (let i = 0; i < 10; i++) {
        await GuestService.sendMessage(token.token, account.id, `Message ${i}`);
      }

      await expect(
        GuestService.sendMessage(token.token, account.id, '11th message')
      ).rejects.toThrow('Dialogue round limit reached');
    });
  });

  describe('C5-004: 游客数据迁移', () => {
    it('should migrate guest data to formal user', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);
      const account = await GuestService.createAIAccount(token.token, { name: 'Test AI' });

      // 模拟对话产生数据
      const dialogue = await GuestService.startDialogue(token.token, account.id);
      await GuestService.sendMessage(token.token, account.id, 'Hello');

      const formalUserId = 'formal-user-456';
      const result = await GuestService.migrateToFormalUser(token.token, formalUserId);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('migratedAccounts');
      expect(result.migratedAccounts).toHaveLength(1);
      expect(result.migratedAccounts[0].newUserId).toBe(formalUserId);
    });

    it('should use transaction for migration', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);
      await GuestService.createAIAccount(token.token, { name: 'Test AI' });

      // 模拟迁移失败
      jest.spyOn(GuestService, 'migrateAccount').mockRejectedValue(new Error('Migration failed'));

      await expect(
        GuestService.migrateToFormalUser(token.token, 'formal-user-456')
      ).rejects.toThrow('Migration failed');

      // 验证数据未被修改
      const accounts = await GuestService.getGuestAccounts(token.token);
      expect(accounts).toHaveLength(1);
    });
  });

  describe('C5-005: 智能过期策略', () => {
    it('should set 24h expiration for guest without AI accounts', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);
      const session = await GuestService.getSession(token.token);

      const now = Date.now();
      const expiresAt = new Date(session.expiresAt).getTime();
      const hours24 = 24 * 60 * 60 * 1000;

      expect(expiresAt - now).toBeGreaterThan(hours24 - 60000);
      expect(expiresAt - now).toBeLessThanOrEqual(hours24);
    });

    it('should set 72h expiration for guest with AI accounts', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);
      await GuestService.createAIAccount(token.token, { name: 'Test AI' });

      const session = await GuestService.getSession(token.token);
      const now = Date.now();
      const expiresAt = new Date(session.expiresAt).getTime();
      const hours72 = 72 * 60 * 60 * 1000;

      expect(expiresAt - now).toBeGreaterThan(hours72 - 60000);
      expect(expiresAt - now).toBeLessThanOrEqual(hours72);
    });

    it('should cleanup expired sessions', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);

      // 手动设置过期时间
      const session = GuestService.sessions.get(openid);
      session.expiresAt = new Date(Date.now() - 1000).toISOString();

      await GuestService.cleanupExpiredSessions();

      const cleanedSession = await GuestService.getSession(token.token);
      expect(cleanedSession).toBeNull();
    });
  });

  describe('C5-006: 游客会话表设计', () => {
    it('should store session with required fields', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);
      const session = await GuestService.getSession(token.token);

      expect(session).toHaveProperty('openidHash');
      expect(session).toHaveProperty('token');
      expect(session).toHaveProperty('createdAt');
      expect(session).toHaveProperty('expiresAt');
      expect(session).toHaveProperty('status');
      expect(session).toHaveProperty('aiAccountCount', 0);
    });

    it('should hash openid for storage', async () => {
      const openid = 'test-openid-123';
      const token = await GuestService.createGuestToken(openid);
      const session = await GuestService.getSession(token.token);

      expect(session.openidHash).not.toBe(openid);
      expect(session.openidHash).toHaveLength(64); // SHA-256 hex length
    });
  });
});
