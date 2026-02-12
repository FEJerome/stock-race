/**
 * DialogueAuditService 单元测试
 * 内容审计服务测试
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DialogueAuditService } from '../../../src/services/DialogueAuditService.js';

describe('DialogueAuditService', () => {
  let auditService;
  let mockRedis;
  let mockDb;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      setEx: jest.fn().mockResolvedValue(),
      del: jest.fn().mockResolvedValue(),
      publish: jest.fn().mockResolvedValue()
    };

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };

    auditService = new DialogueAuditService({
      redis: mockRedis,
      db: mockDb
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('初始化', () => {
    it('应该成功初始化服务', async () => {
      await auditService.initialize();
      expect(auditService.redis).toBe(mockRedis);
    });
  });

  describe('记录消息', () => {
    it('应该记录普通消息并返回approved状态', async () => {
      const messageData = {
        sessionId: 'dlg_123',
        accountId: 'acc_123',
        userId: 1,
        role: 'user',
        content: '你好，我想了解投资',
        tokenCount: 10,
        roundNumber: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const result = await auditService.recordMessage(messageData);

      expect(result).toHaveProperty('auditStatus', 'approved');
      expect(result).toHaveProperty('isBlocked', false);
      expect(result).toHaveProperty('isFlagged', false);
      expect(result).toHaveProperty('sessionId', 'dlg_123');
    });

    it('应该检测敏感内容并标记为flagged', async () => {
      const messageData = {
        sessionId: 'dlg_123',
        accountId: 'acc_123',
        userId: 1,
        role: 'user',
        content: '我想了解赌博相关投资',
        tokenCount: 10,
        roundNumber: 1
      };

      const result = await auditService.recordMessage(messageData);

      expect(result.auditStatus).toBe('flagged');
      expect(result.isFlagged).toBe(true);
      expect(result.flaggedKeywords).toContain('赌博');
      expect(result.sensitivityScore).toBeGreaterThan(0);
    });

    it('应该拦截高敏感度内容', async () => {
      const messageData = {
        sessionId: 'dlg_123',
        accountId: 'acc_123',
        userId: 1,
        role: 'user',
        content: '赌博色情暴力恐怖主义毒品洗钱',
        tokenCount: 20,
        roundNumber: 1
      };

      const result = await auditService.recordMessage(messageData);

      expect(result.auditStatus).toBe('blocked');
      expect(result.isBlocked).toBe(true);
      expect(result.sensitivityScore).toBeGreaterThanOrEqual(0.6);
    });

    it('应该保存记录到数据库', async () => {
      const messageData = {
        sessionId: 'dlg_123',
        accountId: 'acc_123',
        userId: 1,
        role: 'user',
        content: '测试消息',
        tokenCount: 5,
        roundNumber: 1
      };

      await auditService.recordMessage(messageData);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('拦截内容应该发送告警', async () => {
      const messageData = {
        sessionId: 'dlg_123',
        accountId: 'acc_123',
        userId: 1,
        role: 'user',
        content: '赌博色情暴力恐怖主义', // 4个敏感词，触发blocked（0.6分）
        tokenCount: 10,
        roundNumber: 1
      };

      const result = await auditService.recordMessage(messageData);

      // 验证结果被拦截（需要4个敏感词达到0.6分阈值）
      expect(result.isBlocked).toBe(true);
      // 验证告警被触发
      expect(result.auditStatus).toBe('blocked');
    });
  });

  describe('查询审计日志', () => {
    it('应该支持按会话ID查询', async () => {
      mockDb.query.mockImplementation((query, params) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '5' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await auditService.queryAuditLogs({ sessionId: 'dlg_123' });

      const queryCall = mockDb.query.mock.calls[1];
      expect(queryCall[0]).toContain('session_id = $1');
      expect(queryCall[1]).toContain('dlg_123');
    });

    it('应该支持按账户ID查询', async () => {
      mockDb.query.mockImplementation((query, params) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '10' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await auditService.queryAuditLogs({ accountId: 'acc_123' });

      const queryCall = mockDb.query.mock.calls[1];
      expect(queryCall[0]).toContain('account_id = $1');
    });

    it('应该支持按审计状态查询', async () => {
      mockDb.query.mockImplementation((query, params) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '3' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await auditService.queryAuditLogs({ auditStatus: 'blocked' });

      const queryCall = mockDb.query.mock.calls[1];
      expect(queryCall[0]).toContain('audit_status = $1');
    });

    it('应该支持日期范围查询', async () => {
      mockDb.query.mockImplementation((query, params) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '100' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await auditService.queryAuditLogs({
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });

      const queryCall = mockDb.query.mock.calls[1];
      expect(queryCall[0]).toContain('created_at >= $1');
      expect(queryCall[0]).toContain('created_at <= $2');
    });

    it('应该返回分页信息', async () => {
      mockDb.query.mockImplementation((query, params) => {
        if (query.includes('COUNT')) {
          return Promise.resolve({ rows: [{ count: '100' }] });
        }
        return Promise.resolve({ rows: [{ id: 1, message_content: 'test' }] });
      });

      const result = await auditService.queryAuditLogs({ limit: 10, offset: 20 });

      expect(result).toHaveProperty('total', 100);
      expect(result).toHaveProperty('limit', 10);
      expect(result).toHaveProperty('offset', 20);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('审核消息', () => {
    it('应该支持通过审核', async () => {
      await auditService.reviewMessage(1, 1, 'approve', '内容正常');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain('UPDATE dialogue_audit');
      expect(queryCall[1]).toContain('approved');
    });

    it('应该支持拒绝审核', async () => {
      await auditService.reviewMessage(1, 1, 'block', '违规内容');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[1]).toContain('blocked');
    });

    it('应该记录审核信息', async () => {
      const result = await auditService.reviewMessage(1, 1, 'approve', '审核通过');

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('auditId', 1);
      expect(result).toHaveProperty('reviewedBy', 1);
      expect(result).toHaveProperty('reviewedAt');
    });
  });

  describe('敏感词管理', () => {
    it('应该更新敏感词列表', async () => {
      const newWords = ['新词1', '新词2'];
      await auditService.updateSensitiveWords(newWords, 1);

      expect(auditService.sensitiveWords).toEqual(newWords);
    });

    it('应该保存敏感词到数据库', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      const words = ['测试词1', '测试词2'];

      await auditService.updateSensitiveWords(words, 1);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('应该清除敏感词缓存', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await auditService.updateSensitiveWords(['测试'], 1);

      expect(mockRedis.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('会话审查检查', () => {
    it('应该检查会话是否需要审查', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          flagged_count: '2',
          blocked_count: '1',
          max_sensitivity: '0.75'
        }]
      });

      const result = await auditService.checkSessionForReview('dlg_123');

      expect(result).toHaveProperty('flagged_count', '2');
      expect(result).toHaveProperty('blocked_count', '1');
      expect(result).toHaveProperty('max_sensitivity', '0.75');
    });
  });

  describe('统计查询', () => {
    it('应该获取审计统计', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          date: new Date(),
          total_messages: '100',
          flagged_count: '5',
          blocked_count: '2',
          avg_sensitivity: '0.15',
          unique_sessions: '20'
        }]
      });

      const result = await auditService.getAuditStats('2024-01-01', '2024-01-31');

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('total_messages', '100');
    });
  });

  describe('敏感内容检测', () => {
    it('应该检测单个敏感词', () => {
      const result = auditService._checkSensitiveContent('我想了解赌博');

      expect(result.hasSensitive).toBe(true);
      expect(result.matchedWords).toContain('赌博');
    });

    it('应该检测多个敏感词', () => {
      const result = auditService._checkSensitiveContent('赌博和色情内容');

      expect(result.matchedWords).toHaveLength(2);
      expect(result.sensitivityScore).toBeGreaterThan(0.2);
    });

    it('应该不标记正常内容', () => {
      const result = auditService._checkSensitiveContent('你好，我想投资股票');

      expect(result.hasSensitive).toBe(false);
      expect(result.matchedWords).toHaveLength(0);
      expect(result.sensitivityScore).toBe(0);
    });

    it('敏感度分数应该封顶1.0', () => {
      const result = auditService._checkSensitiveContent('赌博色情暴力恐怖主义毒品洗钱诈骗传销非法集资');

      expect(result.sensitivityScore).toBe(1.0);
    });
  });

  describe('内容哈希', () => {
    it('应该生成一致的哈希值', () => {
      const content = '测试内容';
      const hash1 = auditService._calculateHash(content);
      const hash2 = auditService._calculateHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex length
    });

    it('不同内容应该生成不同哈希', () => {
      const hash1 = auditService._calculateHash('内容1');
      const hash2 = auditService._calculateHash('内容2');

      expect(hash1).not.toBe(hash2);
    });
  });
});
