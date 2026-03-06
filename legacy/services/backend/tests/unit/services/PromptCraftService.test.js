import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  PromptCraftService,
  PromptValidator,
  PromptCraftError
} from '../../../src/services/PromptCraftService.js';

describe('PromptCraftService', () => {
  let service;
  let mockAIClient;

  beforeEach(() => {
    mockAIClient = {
      craftPrompt: jest.fn()
    };
    service = new PromptCraftService({
      aiClient: mockAIClient,
      useLocalFallback: true
    });
  });

  describe('PromptValidator', () => {
    describe('validate', () => {
      it('should validate a valid prompt structure', () => {
        const prompt = {
          role: '稳健型投资者',
          philosophy: '长期价值投资',
          constraints: '单只股票仓位不超过20%'
        };

        const result = PromptValidator.validate(prompt);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject prompt without required fields', () => {
        const prompt = {
          role: '稳健型投资者'
          // missing philosophy and constraints
        };

        const result = PromptValidator.validate(prompt);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('缺少必需字段: philosophy');
        expect(result.errors).toContain('缺少必需字段: constraints');
      });

      it('should reject prompt with empty strings', () => {
        const prompt = {
          role: '',
          philosophy: '   ',
          constraints: '有效的约束'
        };

        const result = PromptValidator.validate(prompt);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain("字段 role 不能为空字符串");
        expect(result.errors).toContain("字段 philosophy 不能为空字符串");
      });

      it('should reject prompt with too long fields', () => {
        const prompt = {
          role: 'a'.repeat(501),
          philosophy: 'b'.repeat(1001),
          constraints: 'c'.repeat(2001)
        };

        const result = PromptValidator.validate(prompt);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('role 字段长度不能超过500字符');
        expect(result.errors).toContain('philosophy 字段长度不能超过1000字符');
        expect(result.errors).toContain('constraints 字段长度不能超过2000字符');
      });
    });

    describe('validateDialogue', () => {
      it('should validate valid dialogue messages', () => {
        const messages = [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '您好，我是您的AI交易助手' },
          { role: 'user', content: '我想稳健投资' }
        ];

        const result = PromptValidator.validateDialogue(messages);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject empty messages array', () => {
        const result = PromptValidator.validateDialogue([]);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('对话消息不能为空');
      });

      it('should reject non-array input', () => {
        const result = PromptValidator.validateDialogue(null);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('对话消息不能为空');
      });

      it('should reject messages with less than 2 rounds', () => {
        const messages = [
          { role: 'user', content: '你好' }
        ];

        const result = PromptValidator.validateDialogue(messages);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('对话消息至少需要2轮（用户和AI各至少一条）');
      });

      it('should reject messages with invalid role', () => {
        const messages = [
          { role: 'user', content: '你好' },
          { role: 'invalid', content: '回复' }
        ];

        const result = PromptValidator.validateDialogue(messages);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("role 必须是");
      });

      it('should reject messages with empty content', () => {
        const messages = [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: null }
        ];

        const result = PromptValidator.validateDialogue(messages);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain("content 不能为空");
      });
    });
  });

  describe('craftPrompt', () => {
    const validDialogue = [
      { role: 'user', content: '我想做一个稳健的投资者' },
      { role: 'assistant', content: '好的，我会帮您制定稳健的投资策略' },
      { role: 'user', content: '我不喜欢高风险' }
    ];

    it('should craft prompt successfully with AI service', async () => {
      mockAIClient.craftPrompt.mockResolvedValue({
        success: true,
        prompt: {
          role: '稳健型投资者',
          philosophy: '长期价值投资',
          constraints: '单只股票仓位不超过20%',
          preferences: '偏好蓝筹股'
        }
      });

      const result = await service.craftPrompt({
        accountId: 'acc-123',
        dialogueMessages: validDialogue,
        persona: 'conservative',
        modelType: 'deepseek-chat'
      });

      expect(result.success).toBe(true);
      expect(result.prompt.role).toBe('稳健型投资者');
      expect(result.prompt.philosophy).toBe('长期价值投资');
      expect(result.prompt.constraints).toBe('单只股票仓位不超过20%');
      expect(mockAIClient.craftPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          dialogueText: expect.any(String),
          persona: 'conservative',
          modelType: 'deepseek-chat'
        })
      );
    });

    it('should use local generation when AI service fails', async () => {
      mockAIClient.craftPrompt.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.craftPrompt({
        accountId: 'acc-123',
        dialogueMessages: validDialogue,
        persona: 'conservative',
        modelType: 'deepseek-chat'
      });

      expect(result.success).toBe(true);
      expect(result.prompt).toHaveProperty('role');
      expect(result.prompt).toHaveProperty('philosophy');
      expect(result.prompt).toHaveProperty('constraints');
    });

    it('should throw error for invalid dialogue', async () => {
      await expect(
        service.craftPrompt({
          accountId: 'acc-123',
          dialogueMessages: [],
          persona: 'conservative'
        })
      ).rejects.toThrow(PromptCraftError);

      try {
        await service.craftPrompt({
          accountId: 'acc-123',
          dialogueMessages: [],
          persona: 'conservative'
        });
      } catch (error) {
        expect(error.code).toBe('INVALID_DIALOGUE');
        expect(error.details.errors).toContain('对话消息不能为空');
      }
    });

    it('should throw error for invalid prompt structure from AI', async () => {
      mockAIClient.craftPrompt.mockResolvedValue({
        success: true,
        prompt: {
          role: '投资者'
          // missing philosophy and constraints
        }
      });

      await expect(
        service.craftPrompt({
          accountId: 'acc-123',
          dialogueMessages: validDialogue,
          persona: 'conservative'
        })
      ).rejects.toThrow(PromptCraftError);

      try {
        await service.craftPrompt({
          accountId: 'acc-123',
          dialogueMessages: validDialogue,
          persona: 'conservative'
        });
      } catch (error) {
        expect(error.code).toBe('INVALID_PROMPT_STRUCTURE');
      }
    });

    it('should detect conservative style from dialogue', async () => {
      const conservativeDialogue = [
        { role: 'user', content: '我想稳健投资，注重安全' },
        { role: 'assistant', content: '明白，稳健投资很重要' },
        { role: 'user', content: '我喜欢蓝筹股和长期持有' }
      ];

      mockAIClient.craftPrompt.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.craftPrompt({
        accountId: 'acc-123',
        dialogueMessages: conservativeDialogue,
        persona: null, // 让系统自动检测
        modelType: 'deepseek-chat'
      });

      expect(result.success).toBe(true);
      expect(result.prompt.role).toContain('稳健');
    });

    it('should detect aggressive style from dialogue', async () => {
      const aggressiveDialogue = [
        { role: 'user', content: '我想追求高收益，愿意承担高风险' },
        { role: 'assistant', content: '激进投资有可能获得高回报' },
        { role: 'user', content: '我想找十倍股机会' }
      ];

      mockAIClient.craftPrompt.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.craftPrompt({
        accountId: 'acc-123',
        dialogueMessages: aggressiveDialogue,
        persona: null,
        modelType: 'deepseek-chat'
      });

      expect(result.success).toBe(true);
      expect(result.prompt.role).toContain('激进');
    });

    it('should include timestamp in result', async () => {
      const before = Date.now();

      mockAIClient.craftPrompt.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.craftPrompt({
        accountId: 'acc-123',
        dialogueMessages: validDialogue,
        persona: 'balanced'
      });

      const after = Date.now();
      const timestamp = new Date(result.timestamp).getTime();

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe('buildSystemPrompt', () => {
    it('should build complete system prompt', () => {
      const craftedPrompt = {
        role: '稳健型价值投资者',
        philosophy: '长期持有优质企业',
        constraints: '单只股票最大仓位15%',
        preferences: '偏好蓝筹股'
      };

      const systemPrompt = service.buildSystemPrompt(craftedPrompt);

      expect(systemPrompt).toContain('稳健型价值投资者');
      expect(systemPrompt).toContain('长期持有优质企业');
      expect(systemPrompt).toContain('单只股票最大仓位15%');
      expect(systemPrompt).toContain('偏好蓝筹股');
      expect(systemPrompt).toContain('角色定位');
      expect(systemPrompt).toContain('投资哲学');
      expect(systemPrompt).toContain('交易约束');
    });
  });

  describe('local prompt generation', () => {
    const validDialogue = [
      { role: 'user', content: 'test' },
      { role: 'assistant', content: 'test' }
    ];

    it('should generate conservative style prompt', async () => {
      mockAIClient.craftPrompt.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.craftPrompt({
        accountId: 'acc-123',
        dialogueMessages: validDialogue,
        persona: 'conservative'
      });

      expect(result.prompt.role).toContain('稳健');
      expect(result.prompt.philosophy).toContain('价值投资');
      expect(result.prompt.constraints).toContain('15%');
    });

    it('should generate aggressive style prompt', async () => {
      mockAIClient.craftPrompt.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.craftPrompt({
        accountId: 'acc-123',
        dialogueMessages: validDialogue,
        persona: 'aggressive'
      });

      expect(result.prompt.role).toContain('激进');
      expect(result.prompt.philosophy).toContain('成长');
      expect(result.prompt.constraints).toContain('25%');
    });

    it('should generate balanced style prompt by default', async () => {
      mockAIClient.craftPrompt.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.craftPrompt({
        accountId: 'acc-123',
        dialogueMessages: validDialogue,
        persona: null
      });

      expect(result.prompt.role).toContain('平衡');
      expect(result.prompt.philosophy).toContain('均衡');
    });

    it('should detect industry preferences from dialogue', async () => {
      const techDialogue = [
        { role: 'user', content: '我喜欢科技股和芯片股' },
        { role: 'assistant', content: '科技行业确实有很大潜力' }
      ];

      mockAIClient.craftPrompt.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.craftPrompt({
        accountId: 'acc-123',
        dialogueMessages: techDialogue,
        persona: null
      });

      expect(result.prompt.preferences).toContain('科技股');
    });
  });
});
