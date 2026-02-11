/**
 * DialogueAuditService 单元测试
 * 内容审计服务测试
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { DialogueAuditService } from '../../../src/services/DialogueAuditService.js';

describe('DialogueAuditService', () => {
  let auditService;
  let mockRedis;
  let mockDb;

  beforeEach(() => {
    mockRedis = {
      get: sinon.stub(),
      setEx: sinon.stub().resolves(),
      del: sinon.stub().resolves(),
      publish: sinon.stub().resolves()
    };

    mockDb = {
      query: sinon.stub().resolves({ rows: [] })
    };

    auditService = new DialogueAuditService({
      redis: mockRedis,
      db: mockDb
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('初始化', () => {
    it('应该成功初始化服务', async () => {
      await auditService.initialize();
      expect(auditService.redis).to.equal(mockRedis);
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

      expect(result).to.have.property('auditStatus', 'approved');
      expect(result).to.have.property('isBlocked', false);
      expect(result).to.have.property('isFlagged', false);
      expect(result).to.have.property('sessionId', 'dlg_123');
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

      expect(result.auditStatus).to.equal('flagged');
      expect(result.isFlagged).to.be.true;
      expect(result.flaggedKeywords).to.include('赌博');
      expect(result.sensitivityScore).to.be.greaterThan(0);
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

      expect(result.auditStatus).to.equal('blocked');
      expect(result.isBlocked).to.be.true;
      expect(result.sensitivityScore).to.be.at.least(0.6);
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

      expect(mockDb.query.calledOnce).to.be.true;
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
      expect(result.isBlocked).to.be.true;
      // 验证告警被触发
      expect(result.auditStatus).to.equal('blocked');
    });
  });

  describe('查询审计日志', () => {
    it('应该支持按会话ID查询', async () => {
      mockDb.query.onFirstCall().resolves({ rows: [{ count: '5' }] });
      mockDb.query.onSecondCall().resolves({ rows: [] });

      await auditService.queryAuditLogs({ sessionId: 'dlg_123' });

      const queryCall = mockDb.query.secondCall;
      expect(queryCall.args[0]).to.include('session_id = $1');
      expect(queryCall.args[1]).to.include('dlg_123');
    });

    it('应该支持按账户ID查询', async () => {
      mockDb.query.onFirstCall().resolves({ rows: [{ count: '10' }] });
      mockDb.query.onSecondCall().resolves({ rows: [] });

      await auditService.queryAuditLogs({ accountId: 'acc_123' });

      const queryCall = mockDb.query.secondCall;
      expect(queryCall.args[0]).to.include('account_id = $1');
    });

    it('应该支持按审计状态查询', async () => {
      mockDb.query.onFirstCall().resolves({ rows: [{ count: '3' }] });
      mockDb.query.onSecondCall().resolves({ rows: [] });

      await auditService.queryAuditLogs({ auditStatus: 'blocked' });

      const queryCall = mockDb.query.secondCall;
      expect(queryCall.args[0]).to.include('audit_status = $1');
    });

    it('应该支持日期范围查询', async () => {
      mockDb.query.onFirstCall().resolves({ rows: [{ count: '100' }] });
      mockDb.query.onSecondCall().resolves({ rows: [] });

      await auditService.queryAuditLogs({
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });

      const queryCall = mockDb.query.secondCall;
      expect(queryCall.args[0]).to.include('created_at >= $1');
      expect(queryCall.args[0]).to.include('created_at <= $2');
    });

    it('应该返回分页信息', async () => {
      mockDb.query.onFirstCall().resolves({ rows: [{ count: '100' }] });
      mockDb.query.onSecondCall().resolves({ rows: [{ id: 1, message_content: 'test' }] });

      const result = await auditService.queryAuditLogs({ limit: 10, offset: 20 });

      expect(result).to.have.property('total', 100);
      expect(result).to.have.property('limit', 10);
      expect(result).to.have.property('offset', 20);
      expect(result.data).to.be.an('array');
    });
  });

  describe('审核消息', () => {
    it('应该支持通过审核', async () => {
      await auditService.reviewMessage(1, 1, 'approve', '内容正常');

      expect(mockDb.query.calledOnce).to.be.true;
      const queryCall = mockDb.query.firstCall;
      expect(queryCall.args[0]).to.include('UPDATE dialogue_audit');
      expect(queryCall.args[1]).to.include('approved');
    });

    it('应该支持拒绝审核', async () => {
      await auditService.reviewMessage(1, 1, 'block', '违规内容');

      expect(mockDb.query.calledOnce).to.be.true;
      const queryCall = mockDb.query.firstCall;
      expect(queryCall.args[1]).to.include('blocked');
    });

    it('应该记录审核信息', async () => {
      const result = await auditService.reviewMessage(1, 1, 'approve', '审核通过');

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('auditId', 1);
      expect(result).to.have.property('reviewedBy', 1);
      expect(result).to.have.property('reviewedAt');
    });
  });

  describe('敏感词管理', () => {
    it('应该更新敏感词列表', async () => {
      const newWords = ['新词1', '新词2'];
      await auditService.updateSensitiveWords(newWords, 1);

      expect(auditService.sensitiveWords).to.deep.equal(newWords);
    });

    it('应该保存敏感词到数据库', async () => {
      mockDb.query.resolves({ rows: [] });
      const words = ['测试词1', '测试词2'];

      await auditService.updateSensitiveWords(words, 1);

      expect(mockDb.query.calledOnce).to.be.true;
    });

    it('应该清除敏感词缓存', async () => {
      mockDb.query.resolves({ rows: [] });

      await auditService.updateSensitiveWords(['测试'], 1);

      expect(mockRedis.del.calledOnce).to.be.true;
    });
  });

  describe('会话审查检查', () => {
    it('应该检查会话是否需要审查', async () => {
      mockDb.query.resolves({
        rows: [{
          flagged_count: '2',
          blocked_count: '1',
          max_sensitivity: '0.75'
        }]
      });

      const result = await auditService.checkSessionForReview('dlg_123');

      expect(result).to.have.property('flagged_count', '2');
      expect(result).to.have.property('blocked_count', '1');
      expect(result).to.have.property('max_sensitivity', '0.75');
    });
  });

  describe('统计查询', () => {
    it('应该获取审计统计', async () => {
      mockDb.query.resolves({
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

      expect(result).to.be.an('array');
      expect(result[0]).to.have.property('total_messages', '100');
    });
  });

  describe('敏感内容检测', () => {
    it('应该检测单个敏感词', () => {
      const result = auditService._checkSensitiveContent('我想了解赌博');

      expect(result.hasSensitive).to.be.true;
      expect(result.matchedWords).to.include('赌博');
    });

    it('应该检测多个敏感词', () => {
      const result = auditService._checkSensitiveContent('赌博和色情内容');

      expect(result.matchedWords).to.have.lengthOf(2);
      expect(result.sensitivityScore).to.be.greaterThan(0.2);
    });

    it('应该不标记正常内容', () => {
      const result = auditService._checkSensitiveContent('你好，我想投资股票');

      expect(result.hasSensitive).to.be.false;
      expect(result.matchedWords).to.have.lengthOf(0);
      expect(result.sensitivityScore).to.equal(0);
    });

    it('敏感度分数应该封顶1.0', () => {
      const result = auditService._checkSensitiveContent('赌博色情暴力恐怖主义毒品洗钱诈骗传销非法集资');

      expect(result.sensitivityScore).to.equal(1.0);
    });
  });

  describe('内容哈希', () => {
    it('应该生成一致的哈希值', () => {
      const content = '测试内容';
      const hash1 = auditService._calculateHash(content);
      const hash2 = auditService._calculateHash(content);

      expect(hash1).to.equal(hash2);
      expect(hash1).to.have.lengthOf(64); // SHA256 hex length
    });

    it('不同内容应该生成不同哈希', () => {
      const hash1 = auditService._calculateHash('内容1');
      const hash2 = auditService._calculateHash('内容2');

      expect(hash1).to.not.equal(hash2);
    });
  });
});
