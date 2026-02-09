import { aiAccountRepository } from '../models/index.js';
import { decisionLogRepository } from '../models/index.js';
import { systemLogRepository } from '../models/index.js';
import { aiService } from '../services/AIService.js';
import enhancedAIService from '../services/EnhancedAIService.js';
import { dataService } from '../services/DataService.js';

export class AIController {
  constructor() {
    // AI服务已通过aiService集成
  }

  /**
   * 获取AI账户列表
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getAIAccounts(req, res) {
    try {
      const {
        status,
        page = 1,
        limit = 20
      } = req.query;

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      const options = {};
      if (status) {
        options.status = status;
      }

      const accounts = await aiAccountRepository.getUserAccounts(userId, options);

      // 计算账户绩效
      const accountsWithPerformance = await Promise.all(
        accounts.map(async (account) => {
          const performance = await aiAccountRepository.getAccountPerformance(account.id);
          return {
            id: account.id,
            name: account.name,
            modelType: account.modelType,
            initialBalance: parseFloat(account.initialBalance),
            currentBalance: parseFloat(account.currentBalance),
            totalValue: parseFloat(account.totalValue),
            status: account.status,
            tradingFrequency: account.tradingFrequency,
            riskLevel: account.riskLevel,
            createdAt: account.createdAt,
            performance: {
              totalReturn: performance.totalReturn,
              todayReturn: 0, // 需要计算今日收益
              winRate: performance.winRate
            }
          };
        })
      );

      // 分页处理
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedAccounts = accountsWithPerformance.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          accounts: paginatedAccounts,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: accounts.length,
            pages: Math.ceil(accounts.length / parseInt(limit))
          }
        },
        message: '获取AI账户列表成功'
      });
    } catch (error) {
      console.error('获取AI账户列表控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取AI账户列表失败，请稍后重试'
      });
    }
  }

  /**
   * 创建AI账户
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async createAIAccount(req, res) {
    try {
      const {
        name,
        modelType = 'deepseek',
        initialBalance = 100000.00,
        tradingFrequency = 'daily',
        riskLevel = 'medium',
        promptTemplate,
        config = {},
        // 新增字段：用户偏好配置和提示词模板
        preferenceConfig = {},
        promptTemplateId = null,
        tokenBudget = 1500
      } = req.body;

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 验证必填字段
      if (!name) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '账户名称不能为空'
          },
          message: '请输入AI账户名称'
        });
      }

      // 验证初始余额
      const initialBalanceNum = parseFloat(initialBalance);
      if (initialBalanceNum <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '初始余额必须大于0'
          },
          message: '初始余额必须大于0'
        });
      }

      // 验证模型类型 - 根据AI服务适配器更新为deepseek和glm
      const validModelTypes = ['deepseek', 'glm'];
      if (!validModelTypes.includes(modelType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的模型类型'
          },
          message: `模型类型必须是: ${validModelTypes.join(', ')}`
        });
      }

      // 验证交易频率
      const validFrequencies = ['minutely', 'hourly', 'daily', 'weekly'];
      if (!validFrequencies.includes(tradingFrequency)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的交易频率'
          },
          message: `交易频率必须是: ${validFrequencies.join(', ')}`
        });
      }

      // 验证风险等级
      const validRiskLevels = ['low', 'medium', 'high', 'critical'];
      if (!validRiskLevels.includes(riskLevel)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的风险等级'
          },
          message: `风险等级必须是: ${validRiskLevels.join(', ')}`
        });
      }

      // 创建AI账户
      const accountData = {
        userId,
        name,
        modelType,
        initialBalance: initialBalanceNum,
        currentBalance: initialBalanceNum,
        totalValue: initialBalanceNum,
        tradingFrequency,
        riskLevel,
        promptTemplate,
        config: JSON.stringify(config),
        // 新增字段：用户偏好配置和提示词模板
        preferenceConfig: preferenceConfig,
        promptTemplateId,
        tokenBudget
      };

      const account = await aiAccountRepository.createAccount(accountData);

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        module: 'ai',
        action: 'create_account',
        message: `创建AI账户: ${name}`,
        metadata: {
          accountId: account.id,
          modelType,
          initialBalance: initialBalanceNum,
          tradingFrequency,
          riskLevel
        }
      });

      res.status(201).json({
        success: true,
        data: {
          account: {
            id: account.id,
            name: account.name,
            modelType: account.modelType,
            initialBalance: parseFloat(account.initialBalance),
            currentBalance: parseFloat(account.currentBalance),
            totalValue: parseFloat(account.totalValue),
            status: account.status,
            tradingFrequency: account.tradingFrequency,
            riskLevel: account.riskLevel,
            createdAt: account.createdAt
          }
        },
        message: '创建AI账户成功'
      });
    } catch (error) {
      console.error('创建AI账户控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '创建AI账户失败，请稍后重试'
      });
    }
  }

  /**
   * 获取AI账户详情
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getAIAccountDetail(req, res) {
    try {
      const { accountId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      const account = await aiAccountRepository.findOne(
        { id: parseInt(accountId) },
        {
          portfolios: {
            include: {
              stock: true
            }
          },
          trades: {
            take: 10,
            orderBy: { executedAt: 'desc' },
            include: {
              stock: true
            }
          },
          decisionLogs: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      );

      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: 'AI账户不存在'
          },
          message: 'AI账户不存在'
        });
      }

      // 验证权限
      if (account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权访问该AI账户'
        });
      }

      // 计算账户绩效
      const performance = await aiAccountRepository.getAccountPerformance(account.id);

      // 解析配置
      let config = {};
      let preferenceConfig = {};
      try {
        config = JSON.parse(account.config || '{}');
      } catch (error) {
        console.error('解析账户配置错误:', error);
      }

      try {
        // preferenceConfig已经是JavaScript对象（来自Prisma的JSONB字段）
        preferenceConfig = account.preferenceConfig || {};
      } catch (error) {
        console.error('解析用户偏好配置错误:', error);
        preferenceConfig = {};
      }

      const formattedAccount = {
        id: account.id,
        name: account.name,
        description: account.description,
        modelType: account.modelType,
        initialBalance: parseFloat(account.initialBalance),
        currentBalance: parseFloat(account.currentBalance),
        totalValue: parseFloat(account.totalValue),
        status: account.status,
        tradingFrequency: account.tradingFrequency,
        riskLevel: account.riskLevel,
        promptTemplate: account.promptTemplate,
        // 新增字段
        preferenceConfig,
        promptTemplateId: account.promptTemplateId,
        tokenBudget: account.tokenBudget || 1500,
        lastDecisionAt: account.lastDecisionAt,
        config,
        performance,
        portfolios: account.portfolios.map(p => ({
          stockCode: p.stock.code,
          stockName: p.stock.name,
          quantity: p.quantity,
          avgCost: parseFloat(p.avgCost),
          currentPrice: parseFloat(p.currentPrice),
          marketValue: parseFloat(p.marketValue),
          profitLoss: parseFloat(p.profitLoss),
          profitLossRate: parseFloat(p.profitLossRate)
        })),
        recentTrades: account.trades.map(t => ({
          id: t.id,
          stockCode: t.stock.code,
          stockName: t.stock.name,
          tradeType: t.tradeType,
          quantity: t.quantity,
          price: parseFloat(t.price),
          amount: parseFloat(t.amount),
          status: t.status,
          executedAt: t.executedAt
        })),
        recentDecisions: account.decisionLogs.map(d => ({
          id: d.id,
          decisionType: d.decisionType,
          reasoning: d.reasoning,
          confidence: parseFloat(d.confidence),
          riskLevel: d.riskLevel,
          createdAt: d.createdAt
        })),
        createdAt: account.createdAt,
        updatedAt: account.updatedAt
      };

      res.json({
        success: true,
        data: {
          account: formattedAccount
        },
        message: '获取AI账户详情成功'
      });
    } catch (error) {
      console.error('获取AI账户详情控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取AI账户详情失败，请稍后重试'
      });
    }
  }

  /**
   * 更新AI账户
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async updateAIAccount(req, res) {
    try {
      const { accountId } = req.params;
      const updates = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 验证账户存在性和权限
      const account = await aiAccountRepository.findOne({ id: parseInt(accountId) });
      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: 'AI账户不存在'
          },
          message: 'AI账户不存在'
        });
      }

      if (account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权更新该AI账户'
        });
      }

      // 验证更新字段
      const allowedUpdates = ['name', 'description', 'status', 'config', 'preferenceConfig', 'promptTemplateId', 'tokenBudget'];
      const invalidUpdates = Object.keys(updates).filter(key => !allowedUpdates.includes(key));

      if (invalidUpdates.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的更新字段'
          },
          message: `不允许更新以下字段: ${invalidUpdates.join(', ')}`
        });
      }

      // 验证状态
      if (updates.status) {
        const validStatuses = ['active', 'paused', 'stopped'];
        if (!validStatuses.includes(updates.status)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: '无效的账户状态'
            },
            message: `账户状态必须是: ${validStatuses.join(', ')}`
          });
        }
      }

      // 处理配置更新
      let updateData = { ...updates };
      if (updates.config) {
        try {
          // 合并现有配置
          const currentConfig = JSON.parse(account.config || '{}');
          const newConfig = typeof updates.config === 'string'
            ? JSON.parse(updates.config)
            : updates.config;

          const mergedConfig = { ...currentConfig, ...newConfig };
          updateData.config = JSON.stringify(mergedConfig);
        } catch (error) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: '配置格式错误'
            },
            message: '配置必须是有效的JSON格式'
          });
        }
      }

      // 处理用户偏好配置更新
      if (updates.preferenceConfig) {
        try {
          // 合并现有偏好配置
          const currentPrefConfig = JSON.parse(account.preferenceConfig || '{}');
          const newPrefConfig = typeof updates.preferenceConfig === 'string'
            ? JSON.parse(updates.preferenceConfig)
            : updates.preferenceConfig;

          const mergedPrefConfig = { ...currentPrefConfig, ...newPrefConfig };
          updateData.preferenceConfig = JSON.stringify(mergedPrefConfig);
        } catch (error) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: '用户偏好配置格式错误'
            },
            message: '用户偏好配置必须是有效的JSON格式'
          });
        }
      }

      // 验证tokenBudget
      if (updates.tokenBudget) {
        const tokenBudgetNum = parseInt(updates.tokenBudget);
        if (isNaN(tokenBudgetNum) || tokenBudgetNum < 100 || tokenBudgetNum > 10000) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: '无效的token预算'
            },
            message: 'token预算必须是100-10000之间的整数'
          });
        }
        updateData.tokenBudget = tokenBudgetNum;
      }

      // 更新账户
      const updatedAccount = await aiAccountRepository.update(parseInt(accountId), updateData);

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        accountId: parseInt(accountId),
        module: 'ai',
        action: 'update_account',
        message: `更新AI账户: ${account.name}`,
        metadata: {
          updates,
          previousStatus: account.status,
          newStatus: updates.status
        }
      });

      res.json({
        success: true,
        data: {
          account: {
            id: updatedAccount.id,
            name: updatedAccount.name,
            status: updatedAccount.status,
            updatedAt: updatedAccount.updatedAt
          }
        },
        message: '更新AI账户成功'
      });
    } catch (error) {
      console.error('更新AI账户控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '更新AI账户失败，请稍后重试'
      });
    }
  }

  /**
   * 删除AI账户
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async deleteAIAccount(req, res) {
    try {
      const { accountId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 验证账户存在性和权限
      const account = await aiAccountRepository.findOne({ id: parseInt(accountId) });
      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: 'AI账户不存在'
          },
          message: 'AI账户不存在'
        });
      }

      if (account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权删除该AI账户'
        });
      }

      // 检查账户是否有持仓或未完成交易
      const hasPositions = await aiAccountRepository.prisma.portfolio.count({
        where: { accountId: parseInt(accountId) }
      }) > 0;

      const hasPendingTrades = await aiAccountRepository.prisma.trade.count({
        where: {
          accountId: parseInt(accountId),
          status: 'pending'
        }
      }) > 0;

      if (hasPositions || hasPendingTrades) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '账户有未清仓持仓或未完成交易'
          },
          message: '请先清空持仓并完成所有交易后再删除账户'
        });
      }

      // 删除账户
      await aiAccountRepository.delete(parseInt(accountId));

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        module: 'ai',
        action: 'delete_account',
        message: `删除AI账户: ${account.name}`,
        metadata: {
          accountId: parseInt(accountId),
          accountName: account.name
        }
      });

      res.json({
        success: true,
        data: null,
        message: '删除AI账户成功'
      });
    } catch (error) {
      console.error('删除AI账户控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '删除AI账户失败，请稍后重试'
      });
    }
  }

  /**
   * 请求AI决策
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async requestAIDecision(req, res) {
    try {
      const {
        action = 'analyze',
        data
      } = req.body;

      const accountId = req.params.accountId;

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 验证必填字段
      if (!accountId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '账户ID不能为空'
          },
          message: '请指定AI账户'
        });
      }

      // 验证账户权限
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId),
        userId
      });
      if (!account) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权操作该AI账户'
        });
      }

      // 验证账户状态
      if (account.status !== 'active') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '账户未激活'
          },
          message: 'AI账户未激活，无法请求决策'
        });
      }

      // 验证action
      const validActions = ['analyze', 'trade'];
      if (!validActions.includes(action)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的决策类型'
          },
          message: `决策类型必须是: ${validActions.join(', ')}`
        });
      }

      // 调用AI服务
      const decision = await this.callAIService(account, action, data);

      // 记录决策日志（包含提示词信息）
      const decisionLog = await decisionLogRepository.createDecisionLog({
        accountId: parseInt(accountId),
        decisionType: action,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        riskLevel: decision.riskLevel,
        inputData: JSON.stringify(data),
        outputData: JSON.stringify(decision),
        modelUsed: account.modelType,
        promptVersion: account.promptTemplate,
        processingTimeMs: decision.processingTimeMs,
        apiCost: decision.apiCost,
        // 新增字段：提示词相关
        promptTemplate: decision.promptInfo?.template,
        tokenCount: decision.promptInfo?.tokenCount,
        userPreferences: decision.promptInfo?.userPreferences ?
          JSON.stringify(decision.promptInfo.userPreferences) : null,
        // 注意：fullPrompt和promptVariables由EnhancedAIService在创建决策日志时填充
        decisionLogId: decision.decisionLogId
      });

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        accountId: parseInt(accountId),
        module: 'ai',
        action: 'request_decision',
        message: `请求AI决策: ${action}`,
        metadata: {
          decisionId: decisionLog.id,
          action,
          modelType: account.modelType,
          processingTimeMs: decision.processingTimeMs
        }
      });

      res.json({
        success: true,
        data: {
          decisionId: decisionLog.id,
          accountId: parseInt(accountId),
          action,
          recommendation: decision.recommendation,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
          riskLevel: decision.riskLevel,
          analysis: decision.analysis,
          suggestedActions: decision.suggestedActions,
          processingTime: decision.processingTimeMs,
          modelUsed: account.modelType,
          createdAt: decisionLog.createdAt
        },
        message: 'AI决策生成成功'
      });
    } catch (error) {
      console.error('请求AI决策控制器错误:', error);

      let statusCode = 500;
      let errorCode = 'INTERNAL_ERROR';
      let errorMessage = 'AI决策生成失败，请稍后重试';

      if (error.message.includes('AI服务不可用')) {
        statusCode = 503;
        errorCode = 'AI_001';
        errorMessage = 'AI服务暂时不可用';
      } else if (error.message.includes('超时')) {
        statusCode = 504;
        errorCode = 'AI_002';
        errorMessage = 'AI决策请求超时';
      }

      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: error.message
        },
        message: errorMessage
      });
    }
  }

  /**
   * 获取AI决策历史
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getAIDecisionHistory(req, res) {
    try {
      const {
        accountId,
        action,
        startDate,
        endDate,
        page = 1,
        limit = 20
      } = req.query;

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 构建查询条件
      const where = {};

      if (accountId) {
        // 验证账户权限
        const account = await aiAccountRepository.findOne({
          id: parseInt(accountId),
          userId
        });
        if (!account) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'AUTH_003',
              message: '权限不足'
            },
            message: '无权访问该账户的决策历史'
          });
        }
        where.accountId = parseInt(accountId);
      } else {
        // 获取用户的所有账户
        const accounts = await aiAccountRepository.getUserAccounts(userId);
        const accountIds = accounts.map(account => account.id);
        if (accountIds.length === 0) {
          return res.json({
            success: true,
            data: {
              decisions: [],
              pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: 0,
                pages: 0
              }
            },
            message: '获取AI决策历史成功'
          });
        }
        where.accountId = { in: accountIds };
      }

      if (action) {
        where.decisionType = action;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate);
        }
      }

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit)
      };

      const result = await decisionLogRepository.paginate({
        ...pagination,
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          account: {
            select: {
              id: true,
              name: true
            }
          },
          trade: {
            select: {
              id: true,
              stockCode: true,
              tradeType: true,
              quantity: true,
              price: true
            }
          }
        }
      });

      // 格式化响应数据
      const formattedDecisions = result.data.map(decision => {
        let inputData = {};
        let outputData = {};

        try {
          inputData = JSON.parse(decision.inputData || '{}');
          outputData = JSON.parse(decision.outputData || '{}');
        } catch (error) {
          console.error('解析决策数据错误:', error);
        }

        return {
          id: decision.id,
          accountId: decision.accountId,
          accountName: decision.account.name,
          decisionType: decision.decisionType,
          reasoning: decision.reasoning,
          confidence: parseFloat(decision.confidence),
          riskLevel: decision.riskLevel,
          tradeId: decision.tradeId,
          tradeInfo: decision.trade ? {
            stockCode: decision.trade.stockCode,
            tradeType: decision.trade.tradeType,
            quantity: decision.trade.quantity,
            price: parseFloat(decision.trade.price)
          } : null,
          modelUsed: decision.modelUsed,
          processingTimeMs: decision.processingTimeMs,
          apiCost: parseFloat(decision.apiCost),
          inputData,
          outputData,
          createdAt: decision.createdAt
        };
      });

      res.json({
        success: true,
        data: {
          decisions: formattedDecisions,
          pagination: result.pagination
        },
        message: '获取AI决策历史成功'
      });
    } catch (error) {
      console.error('获取AI决策历史控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取AI决策历史失败，请稍后重试'
      });
    }
  }

  /**
   * 获取AI服务统计
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getAIStats(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 获取账户统计
      const accountStats = await aiAccountRepository.getActiveAccountStats();

      // 获取决策统计
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const decisionStats = await decisionLogRepository.prisma.decisionLog.groupBy({
        by: ['decisionType'],
        where: {
          account: {
            userId
          },
          createdAt: {
            gte: today,
            lt: tomorrow
          }
        },
        _count: {
          _all: true
        }
      });

      // 获取模型使用统计
      const modelStats = await decisionLogRepository.prisma.decisionLog.groupBy({
        by: ['modelUsed'],
        where: {
          account: {
            userId
          },
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 最近30天
          }
        },
        _count: {
          _all: true
        },
        _avg: {
          processingTimeMs: true,
          confidence: true
        }
      });

      // 获取AI服务健康状态
      const aiServiceHealth = await this.checkAIServiceHealth();

      res.json({
        success: true,
        data: {
          accountStats,
          decisionStats: decisionStats.reduce((acc, stat) => {
            acc[stat.decisionType] = stat._count._all;
            return acc;
          }, {}),
          modelStats: modelStats.map(stat => ({
            model: stat.modelUsed || '未知',
            count: stat._count._all,
            avgProcessingTime: stat._avg.processingTimeMs,
            avgConfidence: stat._avg.confidence
          })),
          aiServiceHealth,
          timestamp: new Date().toISOString()
        },
        message: '获取AI服务统计成功'
      });
    } catch (error) {
      console.error('获取AI服务统计控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取AI服务统计失败，请稍后重试'
      });
    }
  }

  /**
   * 调用AI服务
   * @param {Object} account - AI账户
   * @param {string} action - 决策类型
   * @param {Object} data - 输入数据
   * @returns {Promise<Object>} AI决策结果
   */
  async callAIService(account, action, data) {
    try {
      // 准备市场数据
      const stockCode = data?.stockData?.code;
      let marketData = {};

      if (stockCode) {
        try {
          const realtimeData = await dataService.getRealtimeData(stockCode);
          marketData = {
            price: realtimeData.price,
            change: realtimeData.change,
            change_percent: realtimeData.change_percent,
            volume: realtimeData.volume,
            timestamp: realtimeData.timestamp
          };
        } catch (error) {
          console.warn(`获取股票数据失败 (${stockCode}):`, error.message);
        }
      }

      // 准备投资组合数据
      const portfolioData = data?.portfolioData || {};

      // 调用增强的AI服务
      const decisionResult = await enhancedAIService.requestEnhancedDecision({
        accountId: account.id,
        stockCode,
        marketData,
        portfolioData,
        strategy: account.strategy || 'default'
      });

      return {
        recommendation: decisionResult.decision,
        confidence: decisionResult.confidence,
        reasoning: decisionResult.reasoning,
        riskLevel: decisionResult.risk_level,
        analysis: decisionResult.reasoning, // 使用reasoning作为分析
        suggestedActions: decisionResult.decision === 'buy' ? ['买入'] :
                         decisionResult.decision === 'sell' ? ['卖出'] : ['持有'],
        processingTimeMs: decisionResult.metadata?.processing_time_ms || 500,
        apiCost: decisionResult.metadata?.api_cost || 0.01,
        isFallback: decisionResult.is_fallback || false,
        // 新增字段：决策日志ID和提示词信息
        decisionLogId: decisionResult.decision_log_id,
        promptInfo: {
          template: decisionResult.metadata?.prompt_template,
          tokenCount: decisionResult.metadata?.token_count,
          userPreferences: decisionResult.metadata?.user_preferences
        }
      };
    } catch (error) {
      console.error('调用AI服务错误:', error);
      throw new Error(`AI服务调用失败: ${error.message}`);
    }
  }

  /**
   * 检查AI服务健康状态
   * @returns {Promise<Object>} 健康状态
   */
  /**
   * 获取AI账户余额
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getAccountBalance(req, res) {
    try {
      const { accountId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 验证账户存在性和权限
      const account = await aiAccountRepository.findOne({ id: parseInt(accountId) });
      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: 'AI账户不存在'
          },
          message: 'AI账户不存在'
        });
      }

      if (account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权访问该AI账户'
        });
      }

      // 计算持仓市值
      const portfolios = await aiAccountRepository.prisma.portfolio.findMany({
        where: { accountId: parseInt(accountId) },
        include: { stock: true }
      });

      let marketValue = 0;
      for (const p of portfolios) {
        marketValue += parseFloat(p.marketValue || 0);
      }

      // 计算总价值
      const totalValue = parseFloat(account.currentBalance) + marketValue;
      const totalReturn = totalValue - parseFloat(account.initialBalance);
      const totalReturnRate = (totalReturn / parseFloat(account.initialBalance)) * 100;

      res.json({
        success: true,
        data: {
          accountId: parseInt(accountId),
          accountName: account.name,
          currentBalance: parseFloat(account.currentBalance),
          initialBalance: parseFloat(account.initialBalance),
          marketValue,
          totalValue,
          totalReturn,
          totalReturnRate,
          positionsCount: portfolios.length,
          status: account.status,
          updatedAt: account.updatedAt
        },
        message: '获取账户余额成功'
      });
    } catch (error) {
      console.error('获取账户余额控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取账户余额失败，请稍后重试'
      });
    }
  }

  /**
   * 充值AI账户
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async depositBalance(req, res) {
    try {
      const { accountId } = req.params;
      const { amount, reason = '用户充值' } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 验证金额
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '充值金额必须大于0'
          },
          message: '请输入有效的充值金额'
        });
      }

      // 验证账户存在性和权限
      const account = await aiAccountRepository.findOne({ id: parseInt(accountId) });
      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: 'AI账户不存在'
          },
          message: 'AI账户不存在'
        });
      }

      if (account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权操作该AI账户'
        });
      }

      // 更新账户余额
      const newBalance = parseFloat(account.currentBalance) + amountNum;
      const totalValue = newBalance; // 充值时总价值等于新余额（持仓市值不变）

      await aiAccountRepository.update(parseInt(accountId), {
        currentBalance: newBalance,
        totalValue
      });

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        accountId: parseInt(accountId),
        module: 'ai',
        action: 'deposit',
        message: `充值AI账户: ${account.name}，金额: ${amountNum}`,
        metadata: {
          amount: amountNum,
          reason,
          previousBalance: parseFloat(account.currentBalance),
          newBalance
        }
      });

      res.json({
        success: true,
        data: {
          accountId: parseInt(accountId),
          accountName: account.name,
          amount: amountNum,
          previousBalance: parseFloat(account.currentBalance),
          newBalance,
          totalValue,
          reason,
          timestamp: new Date().toISOString()
        },
        message: '充值成功'
      });
    } catch (error) {
      console.error('充值账户控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '充值失败，请稍后重试'
      });
    }
  }

  /**
   * 提现AI账户
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async withdrawBalance(req, res) {
    try {
      const { accountId } = req.params;
      const { amount, reason = '用户提现' } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 验证金额
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '提现金额必须大于0'
          },
          message: '请输入有效的提现金额'
        });
      }

      // 验证账户存在性和权限
      const account = await aiAccountRepository.findOne({ id: parseInt(accountId) });
      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: 'AI账户不存在'
          },
          message: 'AI账户不存在'
        });
      }

      if (account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权操作该AI账户'
        });
      }

      // 验证余额
      if (amountNum > parseFloat(account.currentBalance)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '余额不足'
          },
          message: `账户余额不足，当前可用余额: ${account.currentBalance}`
        });
      }

      // 更新账户余额
      const newBalance = parseFloat(account.currentBalance) - amountNum;
      const totalValue = newBalance; // 提现时总价值等于新余额

      await aiAccountRepository.update(parseInt(accountId), {
        currentBalance: newBalance,
        totalValue
      });

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        accountId: parseInt(accountId),
        module: 'ai',
        action: 'withdraw',
        message: `提现AI账户: ${account.name}，金额: ${amountNum}`,
        metadata: {
          amount: amountNum,
          reason,
          previousBalance: parseFloat(account.currentBalance),
          newBalance
        }
      });

      res.json({
        success: true,
        data: {
          accountId: parseInt(accountId),
          accountName: account.name,
          amount: amountNum,
          previousBalance: parseFloat(account.currentBalance),
          newBalance,
          totalValue,
          reason,
          timestamp: new Date().toISOString()
        },
        message: '提现成功'
      });
    } catch (error) {
      console.error('提现账户控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '提现失败，请稍后重试'
      });
    }
  }

  /**
   * 获取账户绩效
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getAccountPerformance(req, res) {
    try {
      const { accountId } = req.params;
      const userId = req.user.id;

      // 验证账户所有权
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId),
        userId
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          error: '账户不存在或无权访问'
        });
      }

      // 获取账户绩效
      const performance = await aiAccountRepository.getAccountPerformance(parseInt(accountId));

      return res.json({
        success: true,
        data: performance
      });
    } catch (error) {
      console.error('获取账户绩效错误:', error);
      return res.status(500).json({
        success: false,
        error: '获取账户绩效失败',
        details: error.message
      });
    }
  }

  async checkAIServiceHealth() {
    try {
      const connectionTest = await aiService.testConnection();

      if (connectionTest.success) {
        return {
          status: 'healthy',
          timestamp: connectionTest.timestamp,
          services: {
            ai_decision: 'operational',
            model_training: 'operational'
          },
          metrics: {
            response_time_ms: connectionTest.response_time,
            service_version: connectionTest.service_version,
            model_status: connectionTest.model_status
          }
        };
      } else {
        return {
          status: 'degraded',
          timestamp: connectionTest.timestamp,
          services: {
            ai_decision: 'degraded',
            model_training: 'unknown'
          },
          metrics: {
            response_time_ms: null,
            error: connectionTest.error
          }
        };
      }
    } catch (error) {
      console.error('检查AI服务健康状态错误:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          ai_decision: 'unavailable',
          model_training: 'unavailable'
        },
        metrics: {
          error: error.message
        }
      };
    }
  }
}

// 创建控制器实例
export const aiController = new AIController();