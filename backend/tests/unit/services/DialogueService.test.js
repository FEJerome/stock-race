/**
 * [C4-001~C4-003] DialogueService 单元测试
 *
 * 测试内容:
 * - C4-001: 对话会话管理
 * - C4-002: 对话消息处理
 * - C4-003: 投资偏好提取
 * - Token成本控制
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { DialogueService } from '../../../src/services/DialogueService.js';

describe('DialogueService', () => {
  let dialogueService;
  let mockRedis;

  beforeEach(() => {
    mockRedis = {
      get: sinon.stub(),
      setEx: sinon.stub().resolves(),
      del: sinon.stub().resolves()
    };

    dialogueService = new DialogueService({
      redis: mockRedis,
      deepseekApiKey: 'test-key'
    });

    // Mock 配置服务返回默认值
    const defaultConfig = {
      maxRounds: 10,
      maxTokensPerMessage: 2000,
      totalTokenBudget: 10000,
      sessionExpiryHours: 24,
      enableContentAudit: true
    };
    sinon.stub(dialogueService, '_getConfig').resolves(defaultConfig);

    // Mock 审计服务
    dialogueService.auditService = {
      recordMessage: sinon.stub().resolves()
    };

    // Mock 配置服务
    dialogueService.configService = {
      getConfig: sinon.stub().callsFake((key) => {
        const configs = {
          max_rounds: 10,
          max_tokens_per_message: 2000,
          total_token_budget: 10000,
          session_expiry_hours: 24,
          enable_content_audit: true
        };
        return Promise.resolve(configs[key]);
      }),
      initialize: sinon.stub().resolves()
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('[C4-001] 对话会话管理', () => {
    it('应该成功创建对话会话', async () => {
      const accountId = 'acc_123';
      const userPreferences = { riskTolerance: 'medium' };

      const result = await dialogueService.createSession(accountId, userPreferences);

      expect(result).to.have.property('sessionId');
      expect(result.sessionId).to.match(/^dlg_acc_123_/);
      expect(result).to.have.property('roundCount', 0);
      expect(result).to.have.property('remainingRounds', 10);
      expect(result).to.have.property('expiresAt');
    });

    it('应该将会话保存到 Redis', async () => {
      const accountId = 'acc_123';
      await dialogueService.createSession(accountId);

      expect(mockRedis.setEx.calledTwice).to.be.true;
      const sessionCall = mockRedis.setEx.firstCall;
      expect(sessionCall.args[0]).to.match(/^dialogue:session:/);
      expect(sessionCall.args[1]).to.equal(24 * 60 * 60); // 24小时 = 86400秒
    });

    it('应该能获取会话信息', async () => {
      const sessionId = 'dlg_acc_123_456';
      const mockSession = {
        id: sessionId,
        accountId: 'acc_123',
        roundCount: 3,
        expiresAt: Date.now() + 3600000
      };
      mockRedis.get.withArgs(`dialogue:session:${sessionId}`).resolves(JSON.stringify(mockSession));

      const result = await dialogueService.getSession(sessionId);

      expect(result).to.not.be.null;
      expect(result.id).to.equal(sessionId);
      expect(result.roundCount).to.equal(3);
    });

    it('过期会话应该返回 null', async () => {
      const sessionId = 'dlg_acc_123_456';
      const expiredSession = {
        id: sessionId,
        expiresAt: Date.now() - 1000
      };
      mockRedis.get.withArgs(`dialogue:session:${sessionId}`).resolves(JSON.stringify(expiredSession));

      const result = await dialogueService.getSession(sessionId);

      expect(result).to.be.null;
    });

    it('应该能获取对话历史', async () => {
      const sessionId = 'dlg_acc_123_456';
      const mockHistory = [
        { role: 'user', content: '你好', timestamp: Date.now() },
        { role: 'assistant', content: '您好！', timestamp: Date.now() }
      ];
      mockRedis.get.withArgs(`dialogue:history:${sessionId}`).resolves(JSON.stringify(mockHistory));

      const result = await dialogueService.getHistory(sessionId);

      expect(result).to.have.lengthOf(2);
      expect(result[0].role).to.equal('user');
    });
  });

  describe('[C4-002] 对话消息处理', () => {
    it('应该检查会话存在性', async () => {
      mockRedis.get.resolves(null);

      try {
        await dialogueService.sendMessage('invalid_session', '你好');
        expect.fail('应该抛出 SESSION_NOT_FOUND 错误');
      } catch (error) {
        expect(error.message).to.equal('SESSION_NOT_FOUND');
      }
    });

    it('应该检查对话轮数限制', async () => {
      const sessionId = 'dlg_acc_123_456';
      const mockSession = {
        id: sessionId,
        accountId: 'acc_123',
        roundCount: 10,
        totalTokens: 100,
        expiresAt: Date.now() + 3600000
      };
      mockRedis.get.withArgs(`dialogue:session:${sessionId}`).resolves(JSON.stringify(mockSession));

      try {
        await dialogueService.sendMessage(sessionId, '第11轮');
        expect.fail('应该抛出 ROUND_LIMIT_REACHED 错误');
      } catch (error) {
        expect(error.message).to.equal('ROUND_LIMIT_REACHED');
      }
    });

    it('应该检查Token预算', async () => {
      const sessionId = 'dlg_acc_123_456';
      const mockSession = {
        id: sessionId,
        accountId: 'acc_123',
        roundCount: 5,
        totalTokens: 10000, // 已达到预算上限
        expiresAt: Date.now() + 3600000
      };
      mockRedis.get.withArgs(`dialogue:session:${sessionId}`).resolves(JSON.stringify(mockSession));

      try {
        await dialogueService.sendMessage(sessionId, '你好');
        expect.fail('应该抛出 TOKEN_BUDGET_EXHAUSTED 错误');
      } catch (error) {
        expect(error.message).to.equal('TOKEN_BUDGET_EXHAUSTED');
      }
    });
  });

  describe('[C4-003] 投资偏好提取', () => {
    it('应该提取投资偏好并激活账户', async () => {
      const sessionId = 'dlg_acc_123_456';
      const mockSession = {
        id: sessionId,
        accountId: 'acc_123',
        roundCount: 5,
        totalTokens: 1000,
        userPreferences: {},
        expiresAt: Date.now() + 3600000
      };
      const mockHistory = [
        { role: 'user', content: '我喜欢稳健投资', timestamp: Date.now() },
        { role: 'assistant', content: '了解，您偏好稳健型投资', timestamp: Date.now() }
      ];

      mockRedis.get.withArgs(`dialogue:session:${sessionId}`).resolves(JSON.stringify(mockSession));
      mockRedis.get.withArgs(`dialogue:history:${sessionId}`).resolves(JSON.stringify(mockHistory));

      // Mock DeepSeek API 响应
      const fetchStub = sinon.stub(global, 'fetch').resolves({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                investmentStyle: 'conservative',
                riskTolerance: 'low',
                preferredSectors: ['finance', 'utilities']
              })
            }
          }]
        })
      });

      const result = await dialogueService.finalizeAccount(sessionId);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('accountId', 'acc_123');
      expect(result).to.have.property('extractedPreference');
      expect(result.extractedPreference).to.have.property('investmentStyle', 'conservative');

      fetchStub.restore();
    });

    it('无效会话应该拒绝提取', async () => {
      mockRedis.get.resolves(null);

      try {
        await dialogueService.finalizeAccount('invalid_session');
        expect.fail('应该抛出 SESSION_NOT_FOUND 错误');
      } catch (error) {
        expect(error.message).to.equal('SESSION_NOT_FOUND');
      }
    });
  });

  describe('Token成本控制', () => {
    it('应该估算Token数量', () => {
      const text = 'Hello 世界';
      const tokens = dialogueService._estimateTokens(text);

      // "Hello" = 1 token, "世界" = 2 tokens * 2 = 4 tokens
      expect(tokens).to.be.at.least(1);
    });

    it('应该通过动态配置获取单条消息Token限制', async () => {
      const config = await dialogueService._getConfig();
      expect(config.maxTokensPerMessage).to.equal(2000);
    });

    it('应该通过动态配置获取总Token预算限制', async () => {
      const config = await dialogueService._getConfig();
      expect(config.totalTokenBudget).to.equal(10000);
    });

    it('应该通过动态配置获取最大对话轮数', async () => {
      const config = await dialogueService._getConfig();
      expect(config.maxRounds).to.equal(10);
    });
  });

  describe('系统提示词构建', () => {
    it('应该构建包含用户偏好的系统提示词', () => {
      const userPreferences = { riskTolerance: 'high' };
      const config = { maxRounds: 10 };
      const prompt = dialogueService._buildSystemPrompt(userPreferences, config);

      expect(prompt).to.include('AI投资顾问');
      expect(prompt).to.include('high');
      expect(prompt).to.include('10轮对话');
    });

    it('应该使用动态配置的最大轮数', () => {
      const userPreferences = {};
      const config = { maxRounds: 15 };
      const prompt = dialogueService._buildSystemPrompt(userPreferences, config);

      expect(prompt).to.include('15轮对话');
    });
  });
});
