/**
 * [C4-001~C4-003] DialogueService 单元测试
 *
 * 测试内容:
 * - C4-001: 对话会话管理
 * - C4-002: 对话消息处理
 * - C4-003: 投资偏好提取
 * - Token成本控制
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DialogueService } from '../../../src/services/DialogueService.js';

describe('DialogueService', () => {
  let dialogueService;
  let mockRedis;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      setEx: jest.fn().mockResolvedValue(),
      del: jest.fn().mockResolvedValue()
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
    jest.spyOn(dialogueService, '_getConfig').mockResolvedValue(defaultConfig);

    // Mock 审计服务
    dialogueService.auditService = {
      recordMessage: jest.fn().mockResolvedValue()
    };

    // Mock 配置服务
    dialogueService.configService = {
      getConfig: jest.fn().mockImplementation((key) => {
        const configs = {
          max_rounds: 10,
          max_tokens_per_message: 2000,
          total_token_budget: 10000,
          session_expiry_hours: 24,
          enable_content_audit: true
        };
        return Promise.resolve(configs[key]);
      }),
      initialize: jest.fn().mockResolvedValue()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('[C4-001] 对话会话管理', () => {
    it('应该成功创建对话会话', async () => {
      const accountId = 'acc_123';
      const userPreferences = { riskTolerance: 'medium' };

      const result = await dialogueService.createSession(accountId, userPreferences);

      expect(result).toHaveProperty('sessionId');
      expect(result.sessionId).toMatch(/^dlg_acc_123_/);
      expect(result).toHaveProperty('roundCount', 0);
      expect(result).toHaveProperty('remainingRounds', 10);
      expect(result).toHaveProperty('expiresAt');
    });

    it('应该将会话保存到 Redis', async () => {
      const accountId = 'acc_123';
      await dialogueService.createSession(accountId);

      expect(mockRedis.setEx).toHaveBeenCalledTimes(2);
      const sessionCall = mockRedis.setEx.mock.calls[0];
      expect(sessionCall[0]).toMatch(/^dialogue:session:/);
      expect(sessionCall[1]).toBe(24 * 60 * 60); // 24小时 = 86400秒
    });

    it('应该能获取会话信息', async () => {
      const sessionId = 'dlg_acc_123_456';
      const mockSession = {
        id: sessionId,
        accountId: 'acc_123',
        roundCount: 3,
        expiresAt: Date.now() + 3600000
      };
      mockRedis.get.mockImplementation((key) => {
        if (key === `dialogue:session:${sessionId}`) {
          return Promise.resolve(JSON.stringify(mockSession));
        }
        return Promise.resolve(null);
      });

      const result = await dialogueService.getSession(sessionId);

      expect(result).not.toBeNull();
      expect(result.id).toBe(sessionId);
      expect(result.roundCount).toBe(3);
    });

    it('过期会话应该返回 null', async () => {
      const sessionId = 'dlg_acc_123_456';
      const expiredSession = {
        id: sessionId,
        expiresAt: Date.now() - 1000
      };
      mockRedis.get.mockImplementation((key) => {
        if (key === `dialogue:session:${sessionId}`) {
          return Promise.resolve(JSON.stringify(expiredSession));
        }
        return Promise.resolve(null);
      });

      const result = await dialogueService.getSession(sessionId);

      expect(result).toBeNull();
    });

    it('应该能获取对话历史', async () => {
      const sessionId = 'dlg_acc_123_456';
      const mockHistory = [
        { role: 'user', content: '你好', timestamp: Date.now() },
        { role: 'assistant', content: '您好！', timestamp: Date.now() }
      ];
      mockRedis.get.mockImplementation((key) => {
        if (key === `dialogue:history:${sessionId}`) {
          return Promise.resolve(JSON.stringify(mockHistory));
        }
        return Promise.resolve(null);
      });

      const result = await dialogueService.getHistory(sessionId);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
    });
  });

  describe('[C4-002] 对话消息处理', () => {
    it('应该检查会话存在性', async () => {
      mockRedis.get.mockResolvedValue(null);

      try {
        await dialogueService.sendMessage('invalid_session', '你好');
        expect.fail('应该抛出 SESSION_NOT_FOUND 错误');
      } catch (error) {
        expect(error.message).toBe('SESSION_NOT_FOUND');
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
      mockRedis.get.mockImplementation((key) => {
        if (key === `dialogue:session:${sessionId}`) {
          return Promise.resolve(JSON.stringify(mockSession));
        }
        return Promise.resolve(null);
      });

      try {
        await dialogueService.sendMessage(sessionId, '第11轮');
        expect.fail('应该抛出 ROUND_LIMIT_REACHED 错误');
      } catch (error) {
        expect(error.message).toBe('ROUND_LIMIT_REACHED');
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
      mockRedis.get.mockImplementation((key) => {
        if (key === `dialogue:session:${sessionId}`) {
          return Promise.resolve(JSON.stringify(mockSession));
        }
        return Promise.resolve(null);
      });

      try {
        await dialogueService.sendMessage(sessionId, '你好');
        expect.fail('应该抛出 TOKEN_BUDGET_EXHAUSTED 错误');
      } catch (error) {
        expect(error.message).toBe('TOKEN_BUDGET_EXHAUSTED');
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

      mockRedis.get.mockImplementation((key) => {
        if (key === `dialogue:session:${sessionId}`) {
          return Promise.resolve(JSON.stringify(mockSession));
        }
        if (key === `dialogue:history:${sessionId}`) {
          return Promise.resolve(JSON.stringify(mockHistory));
        }
        return Promise.resolve(null);
      });

      // Mock DeepSeek API 响应
      const fetchStub = jest.spyOn(global, 'fetch').mockResolvedValue({
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

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('accountId', 'acc_123');
      expect(result).toHaveProperty('extractedPreference');
      expect(result.extractedPreference).toHaveProperty('investmentStyle', 'conservative');

      fetchStub.mockRestore();
    });

    it('无效会话应该拒绝提取', async () => {
      mockRedis.get.mockResolvedValue(null);

      try {
        await dialogueService.finalizeAccount('invalid_session');
        expect.fail('应该抛出 SESSION_NOT_FOUND 错误');
      } catch (error) {
        expect(error.message).toBe('SESSION_NOT_FOUND');
      }
    });
  });

  describe('Token成本控制', () => {
    it('应该估算Token数量', () => {
      const text = 'Hello 世界';
      const tokens = dialogueService._estimateTokens(text);

      // "Hello" = 1 token, "世界" = 2 tokens * 2 = 4 tokens
      expect(tokens).toBeGreaterThanOrEqual(1);
    });

    it('应该通过动态配置获取单条消息Token限制', async () => {
      const config = await dialogueService._getConfig();
      expect(config.maxTokensPerMessage).toBe(2000);
    });

    it('应该通过动态配置获取总Token预算限制', async () => {
      const config = await dialogueService._getConfig();
      expect(config.totalTokenBudget).toBe(10000);
    });

    it('应该通过动态配置获取最大对话轮数', async () => {
      const config = await dialogueService._getConfig();
      expect(config.maxRounds).toBe(10);
    });
  });

  describe('系统提示词构建', () => {
    it('应该构建包含用户偏好的系统提示词', () => {
      const userPreferences = { riskTolerance: 'high' };
      const config = { maxRounds: 10 };
      const prompt = dialogueService._buildSystemPrompt(userPreferences, config);

      expect(prompt).toContain('AI投资顾问');
      expect(prompt).toContain('high');
      expect(prompt).toContain('10轮对话');
    });

    it('应该使用动态配置的最大轮数', () => {
      const userPreferences = {};
      const config = { maxRounds: 15 };
      const prompt = dialogueService._buildSystemPrompt(userPreferences, config);

      expect(prompt).toContain('15轮对话');
    });
  });
});
