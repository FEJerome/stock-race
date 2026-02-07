import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import promptTemplateService from './PromptTemplateService.js';
import userPreferenceProcessor from './UserPreferenceProcessor.js';

const prisma = new PrismaClient();

/**
 * 增强的AI服务
 * 集成用户偏好和提示词模板功能
 */
export class EnhancedAIService {
  constructor() {
    // AI服务配置
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    this.aiServiceApiKey = process.env.AI_SERVICE_API_KEY || 'stock-race-ai-key';
    this.timeout = parseInt(process.env.AI_SERVICE_TIMEOUT) || 30000;
    this.maxRetries = parseInt(process.env.AI_SERVICE_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.AI_SERVICE_RETRY_DELAY) || 1000;

    // 创建axios实例
    this.client = axios.create({
      baseURL: this.aiServiceUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.aiServiceApiKey
      }
    });
  }

  /**
   * 请求AI决策（增强版）
   * @param {Object} requestData - 请求数据
   * @returns {Promise<Object>} AI决策结果（包含完整提示词信息）
   */
  async requestEnhancedDecision(requestData) {
    const { accountId, stockCode, marketData, portfolioData, strategy } = requestData;

    try {
      // 1. 获取AI账户信息
      const aiAccount = await this.getAIAccount(accountId);
      if (!aiAccount) {
        throw new Error(`AI账户不存在: ${accountId}`);
      }

      // 2. 获取用户偏好配置
      const userPreferences = await userPreferenceProcessor.getAccountPreferences(accountId);

      // 3. 获取合适的提示词模板
      const templateId = await promptTemplateService.getTemplateForAccount(aiAccount);
      const template = await promptTemplateService.getTemplate(templateId);

      // 4. 准备模板变量
      const templateVariables = promptTemplateService.prepareDecisionVariables(aiAccount, {
        stockData: { code: stockCode, ...marketData },
        portfolioData,
        marketData,
        constraints: userPreferenceProcessor.convertPreferencesToConstraints(userPreferences)
      });

      // 5. 生成完整提示词
      const fullPrompt = promptTemplateService.generatePrompt(template, templateVariables);

      // 6. 优化提示词长度（如有需要）
      const tokenBudget = aiAccount.tokenBudget || 1500;
      const optimizedPrompt = promptTemplateService.optimizePromptLength(fullPrompt, tokenBudget);

      // 7. 估算token数量
      const tokenCount = promptTemplateService.estimateTokenCount(optimizedPrompt);

      // 8. 准备AI服务请求负载
      const payload = {
        account_id: accountId,
        stock_code: stockCode,
        market_data: marketData,
        portfolio_data: portfolioData,
        strategy: strategy || 'default',
        user_preferences: userPreferences,
        prompt_template: templateId,
        prompt_variables: templateVariables,
        full_prompt: optimizedPrompt,
        token_count: tokenCount,
        timestamp: new Date().toISOString()
      };

      // 9. 发送请求到AI服务
      const response = await this.client.post('/api/v1/decision/service-generate', payload);

      // 10. 解析响应
      if (response.data.success && response.data.decision) {
        const decisionResult = response.data.decision;

        // 11. 创建决策日志记录
        const decisionLog = await this.createDecisionLog({
          accountId,
          tradeId: null, // 决策时尚未创建交易
          decisionType: decisionResult.action || 'analyze',
          reasoning: decisionResult.reasoning,
          confidence: decisionResult.confidence_score,
          riskLevel: decisionResult.risk_level,
          marketAnalysis: marketData,
          technicalIndicators: decisionResult.technical_analysis,
          fundamentalAnalysis: decisionResult.fundamental_analysis,
          inputData: {
            stockCode,
            marketData,
            portfolioData,
            strategy
          },
          outputData: decisionResult,
          modelUsed: decisionResult.model_name || aiAccount.modelType,
          promptVersion: template.version,
          processingTimeMs: response.data.metadata?.processing_time_ms,
          apiCost: response.data.metadata?.api_cost,
          stockId: null, // 需要根据股票代码查找
          // 新增字段
          promptTemplate: templateId,
          promptVariables: templateVariables,
          fullPrompt: optimizedPrompt,
          tokenCount: tokenCount,
          modelContext: promptTemplateService.getModelContext(aiAccount, requestData),
          userPreferences: userPreferences
        });

        // 12. 更新AI账户的最后决策时间
        await this.updateAccountLastDecisionTime(accountId);

        return {
          success: true,
          decision: decisionResult.action,
          reasoning: decisionResult.reasoning,
          confidence: decisionResult.confidence_score,
          risk_level: decisionResult.risk_level,
          suggested_quantity: decisionResult.quantity,
          suggested_price: decisionResult.price_target,
          decision_log_id: decisionLog.id,
          metadata: {
            ...(response.data.metadata || {}),
            decision_id: decisionResult.decision_id,
            ai_provider: decisionResult.ai_provider,
            model_name: decisionResult.model_name,
            technical_analysis: decisionResult.technical_analysis,
            fundamental_analysis: decisionResult.fundamental_analysis,
            risk_assessment: decisionResult.risk_assessment,
            raw_response: decisionResult.raw_response,
            // 新增元数据
            prompt_template: templateId,
            prompt_variables: templateVariables,
            full_prompt: optimizedPrompt,
            token_count: tokenCount,
            user_preferences: userPreferences
          }
        };
      } else {
        // AI服务返回失败
        throw new Error(response.data.error || 'AI服务返回失败');
      }
    } catch (error) {
      console.error('增强AI决策请求失败:', error.message);

      // 返回模拟决策作为降级方案（包含基本提示词信息）
      return this.getEnhancedMockDecision(requestData);
    }
  }

  /**
   * 获取AI账户信息
   * @param {number} accountId - 账户ID
   * @returns {Promise<Object>} AI账户对象
   */
  async getAIAccount(accountId) {
    try {
      const account = await prisma.aIAccount.findUnique({
        where: { id: accountId }
      });

      return account;
    } catch (error) {
      console.error('获取AI账户失败:', error);
      throw error;
    }
  }

  /**
   * 创建决策日志
   * @param {Object} logData - 日志数据
   * @returns {Promise<Object>} 创建的日志记录
   */
  async createDecisionLog(logData) {
    try {
      const decisionLog = await prisma.decisionLog.create({
        data: logData
      });

      console.log(`决策日志已创建: ID=${decisionLog.id}, 账户=${logData.accountId}`);

      return decisionLog;
    } catch (error) {
      console.error('创建决策日志失败:', error);
      // 不抛出错误，避免影响主流程
      return { id: null };
    }
  }

  /**
   * 更新AI账户的最后决策时间
   * @param {number} accountId - 账户ID
   */
  async updateAccountLastDecisionTime(accountId) {
    try {
      await prisma.aIAccount.update({
        where: { id: accountId },
        data: {
          lastDecisionAt: new Date(),
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error('更新账户最后决策时间失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 获取增强的模拟决策（降级方案）
   * @param {Object} requestData - 请求数据
   * @returns {Object} 模拟决策结果
   */
  getEnhancedMockDecision(requestData) {
    const { accountId, stockCode } = requestData;
    const mockActions = ['hold', 'buy', 'sell'];
    const randomAction = mockActions[Math.floor(Math.random() * mockActions.length)];

    // 创建模拟的提示词信息
    const mockTemplateId = 'default_decision_v1';
    const mockVariables = {
      account_info: `模拟账户 ID: ${accountId}`,
      positions: '模拟持仓数据',
      stock_data: `模拟股票: ${stockCode}`,
      constraints: '模拟交易约束',
      market_conditions: '模拟市场环境',
      user_preferences: '模拟用户偏好',
      current_time: new Date().toLocaleString('zh-CN')
    };

    const mockPrompt = `模拟提示词：基于账户 ${accountId} 和股票 ${stockCode} 的决策请求`;

    return {
      success: false,
      decision: randomAction,
      reasoning: 'AI服务不可用，使用模拟决策',
      confidence: 0.5,
      risk_level: 'medium',
      suggested_quantity: 100,
      suggested_price: 10.0,
      is_fallback: true,
      metadata: {
        decision_id: `mock-${Date.now()}`,
        ai_provider: 'mock',
        model_name: 'mock-model',
        prompt_template: mockTemplateId,
        prompt_variables: mockVariables,
        full_prompt: mockPrompt,
        token_count: 100,
        user_preferences: {},
        is_mock: true
      }
    };
  }

  /**
   * 批量请求AI决策（增强版）
   * @param {Array<Object>} requests - 请求数组
   * @returns {Promise<Array<Object>>} 决策结果数组
   */
  async batchRequestEnhancedDecisions(requests) {
    try {
      const results = await Promise.all(
        requests.map(async (request) => {
          try {
            return await this.requestEnhancedDecision(request);
          } catch (error) {
            console.error(`批量决策请求失败 (账户: ${request.accountId}):`, error);
            return this.getEnhancedMockDecision(request);
          }
        })
      );

      return results;
    } catch (error) {
      console.error('批量增强AI决策请求失败:', error.message);

      // 返回模拟决策作为降级方案
      return requests.map(request => this.getEnhancedMockDecision(request));
    }
  }

  /**
   * 获取决策日志详情（包含完整提示词）
   * @param {number} decisionLogId - 决策日志ID
   * @returns {Promise<Object>} 决策日志详情
   */
  async getDecisionLogDetails(decisionLogId) {
    try {
      const decisionLog = await prisma.decisionLog.findUnique({
        where: { id: decisionLogId },
        include: {
          account: {
            select: {
              id: true,
              name: true,
              modelType: true,
              riskLevel: true
            }
          },
          stock: {
            select: {
              id: true,
              code: true,
              name: true
            }
          },
          trade: {
            select: {
              id: true,
              action: true,
              quantity: true,
              price: true,
              status: true
            }
          }
        }
      });

      if (!decisionLog) {
        throw new Error(`决策日志不存在: ${decisionLogId}`);
      }

      // 如果fullPrompt为空，尝试重新生成
      if (!decisionLog.fullPrompt && decisionLog.promptTemplate && decisionLog.promptVariables) {
        try {
          const template = await promptTemplateService.getTemplate(decisionLog.promptTemplate);
          if (template) {
            decisionLog.fullPrompt = promptTemplateService.generatePrompt(
              template,
              decisionLog.promptVariables
            );
          }
        } catch (error) {
          console.error('重新生成提示词失败:', error);
        }
      }

      return decisionLog;
    } catch (error) {
      console.error('获取决策日志详情失败:', error);
      throw error;
    }
  }

  /**
   * 获取账户的决策历史（包含提示词信息）
   * @param {number} accountId - 账户ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 决策历史
   */
  async getAccountDecisionHistory(accountId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        startDate,
        endDate,
        includePrompt = true
      } = options;

      const where = {
        accountId
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const [decisionLogs, total] = await Promise.all([
        prisma.decisionLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            decisionType: true,
            reasoning: true,
            confidence: true,
            riskLevel: true,
            modelUsed: true,
            processingTimeMs: true,
            createdAt: true,
            // 条件包含提示词字段
            ...(includePrompt ? {
              promptTemplate: true,
              tokenCount: true,
              fullPrompt: true
            } : {}),
            stock: {
              select: {
                code: true,
                name: true
              }
            },
            trade: {
              select: {
                action: true,
                quantity: true,
                price: true
              }
            }
          }
        }),
        prisma.decisionLog.count({ where })
      ]);

      return {
        decisionLogs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('获取账户决策历史失败:', error);
      throw error;
    }
  }
}

export default new EnhancedAIService();