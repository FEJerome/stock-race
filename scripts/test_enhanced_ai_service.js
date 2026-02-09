#!/usr/bin/env node

/**
 * 测试增强的AI服务
 * 验证EnhancedAIService是否正确集成用户偏好和提示词模板
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const API_BASE_URL = 'http://localhost:3001/api';

// 测试用户信息
const TEST_USER = {
  username: 'test_ai_user3',
  email: 'test_ai_user3@example.com',
  password: 'Test123456'
};

// 测试AI账户信息
const TEST_AI_ACCOUNT = {
  name: '测试增强AI账户',
  description: '用于测试增强AI服务的账户',
  modelType: 'deepseek',
  riskLevel: 'medium',
  tradingFrequency: 'daily',
  preferenceConfig: {
    riskTolerance: 'aggressive',
    tradingStyle: 'swing',
    preferredStrategies: ['momentum', 'technical'],
    avoidStrategies: ['speculative'],
    preferredIndustries: ['科技', '消费'],
    avoidIndustries: ['金融'],
    tradingLimits: {
      maxPositionSize: 0.3,
      minCashRatio: 0.05,
      maxDailyLoss: -0.08,
      stopLossLevel: -0.15,
      takeProfitLevel: 0.3
    }
  },
  promptTemplateId: 'aggressive_decision_v1',
  tokenBudget: 2000
};

// 测试股票信息
const TEST_STOCK = {
  code: '000001',
  name: '平安银行'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testEnhancedAIService() {
  console.log('=== 测试增强的AI服务 ===\n');

  let userId = null;
  let accountId = null;
  let authToken = null;

  try {
    // 1. 创建测试用户
    console.log('1. 创建测试用户...');
    try {
      const userResponse = await axios.post(`${API_BASE_URL}/auth/register`, {
        username: TEST_USER.username,
        email: TEST_USER.email,
        password: TEST_USER.password,
        confirmPassword: TEST_USER.password
      });

      if (userResponse.data.success) {
        userId = userResponse.data.data.user.id;
        console.log(`   用户创建成功: ID=${userId}, 用户名=${TEST_USER.username}`);
      } else {
        console.log(`   用户可能已存在: ${TEST_USER.username}`);
        // 尝试登录获取用户ID
        const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
          username: TEST_USER.username,
          password: TEST_USER.password
        });

        if (loginResponse.data.success) {
          userId = loginResponse.data.data.user.id;
          authToken = loginResponse.data.data.token;
          console.log(`   登录成功: 用户ID=${userId}`);
        }
      }
    } catch (error) {
      console.log(`   用户创建/登录失败: ${error.response?.data?.message || error.message}`);
      // 尝试直接登录
      try {
        const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
          username: TEST_USER.username,
          password: TEST_USER.password
        });

        if (loginResponse.data.success) {
          userId = loginResponse.data.data.user.id;
          authToken = loginResponse.data.data.token;
          console.log(`   登录成功: 用户ID=${userId}`);
        }
      } catch (loginError) {
        console.log(`   登录也失败: ${loginError.response?.data?.message || loginError.message}`);
        return;
      }
    }

    // 2. 创建带有用户偏好配置的AI账户
    console.log('\n2. 创建带有用户偏好配置的AI账户...');
    try {
      const accountResponse = await axios.post(`${API_BASE_URL}/ai/accounts`, {
        name: TEST_AI_ACCOUNT.name,
        description: TEST_AI_ACCOUNT.description,
        modelType: TEST_AI_ACCOUNT.modelType,
        riskLevel: TEST_AI_ACCOUNT.riskLevel,
        tradingFrequency: TEST_AI_ACCOUNT.tradingFrequency,
        preferenceConfig: TEST_AI_ACCOUNT.preferenceConfig,
        promptTemplateId: TEST_AI_ACCOUNT.promptTemplateId,
        tokenBudget: TEST_AI_ACCOUNT.tokenBudget
      }, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (accountResponse.data.success) {
        accountId = accountResponse.data.data.id;
        console.log(`   AI账户创建成功: ID=${accountId}`);
        console.log(`   偏好配置: ${JSON.stringify(TEST_AI_ACCOUNT.preferenceConfig, null, 2)}`);
      } else {
        console.log(`   AI账户创建失败: ${accountResponse.data.message}`);
        return;
      }
    } catch (error) {
      console.log(`   AI账户创建失败: ${error.response?.data?.message || error.message}`);
      return;
    }

    // 3. 获取AI账户详情，验证偏好配置
    console.log('\n3. 获取AI账户详情，验证偏好配置...');
    try {
      const accountDetailResponse = await axios.get(`${API_BASE_URL}/ai/accounts/${accountId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (accountDetailResponse.data.success) {
        const account = accountDetailResponse.data.data;
        console.log(`   AI账户详情获取成功`);
        console.log(`   账户名称: ${account.name}`);
        console.log(`   模型类型: ${account.modelType}`);
        console.log(`   风险等级: ${account.riskLevel}`);
        console.log(`   偏好配置: ${JSON.stringify(account.preferenceConfig, null, 2)}`);
        console.log(`   提示词模板ID: ${account.promptTemplateId}`);
        console.log(`   Token预算: ${account.tokenBudget}`);
      } else {
        console.log(`   AI账户详情获取失败: ${accountDetailResponse.data.message}`);
      }
    } catch (error) {
      console.log(`   AI账户详情获取失败: ${error.response?.data?.message || error.message}`);
    }

    // 4. 测试AI决策功能
    console.log('\n4. 测试AI决策功能...');
    try {
      const decisionResponse = await axios.post(`${API_BASE_URL}/ai/decision`, {
        accountId: accountId,
        stockCode: TEST_STOCK.code,
        stockName: TEST_STOCK.name,
        marketData: {
          price: 15.50,
          change: 0.25,
          changePercent: 1.64,
          volume: 1000000,
          amount: 15500000,
          pe: 12.5,
          pb: 1.2,
          marketCap: 300000000000
        },
        portfolioData: {
          cashBalance: 50000,
          totalValue: 150000,
          positions: [
            {
              stockCode: '000001',
              quantity: 1000,
              avgCost: 14.50,
              currentPrice: 15.50,
              profitLoss: 1000,
              profitLossRate: 6.9
            }
          ]
        }
      }, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (decisionResponse.data.success) {
        console.log(`   AI决策请求成功`);
        console.log(`   决策结果: ${decisionResponse.data.data.decision}`);
        console.log(`   决策理由: ${decisionResponse.data.data.reasoning}`);
        console.log(`   置信度: ${decisionResponse.data.data.confidence}`);
        console.log(`   风险等级: ${decisionResponse.data.data.risk_level}`);

        // 检查元数据中的提示词信息
        if (decisionResponse.data.data.metadata) {
          console.log(`   提示词模板: ${decisionResponse.data.data.metadata.prompt_template}`);
          console.log(`   Token数量: ${decisionResponse.data.data.metadata.token_count}`);
          console.log(`   是否降级: ${decisionResponse.data.data.metadata.is_mock || false}`);

          if (decisionResponse.data.data.metadata.full_prompt) {
            console.log(`   完整提示词预览: ${decisionResponse.data.data.metadata.full_prompt.substring(0, 200)}...`);
          }
        }
      } else {
        console.log(`   AI决策请求失败: ${decisionResponse.data.message}`);
      }
    } catch (error) {
      console.log(`   AI决策请求失败: ${error.response?.data?.message || error.message}`);
    }

    // 5. 查询数据库中的决策日志
    console.log('\n5. 查询数据库中的决策日志...');
    try {
      const decisionLogs = await prisma.decisionLog.findMany({
        where: {
          accountId: accountId
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 5
      });

      if (decisionLogs.length > 0) {
        console.log(`   找到 ${decisionLogs.length} 条决策日志`);
        const latestLog = decisionLogs[0];
        console.log(`   最新决策日志:`);
        console.log(`     ID: ${latestLog.id}`);
        console.log(`     决策类型: ${latestLog.decisionType}`);
        console.log(`     决策理由: ${latestLog.reasoning.substring(0, 100)}...`);
        console.log(`     置信度: ${latestLog.confidence}`);
        console.log(`     风险等级: ${latestLog.riskLevel}`);
        console.log(`     提示词模板: ${latestLog.promptTemplate}`);
        console.log(`     完整提示词: ${latestLog.fullPrompt ? '已存储' : '未存储'}`);
        console.log(`     Token数量: ${latestLog.tokenCount}`);
        console.log(`     用户偏好: ${latestLog.userPreferences ? '已存储' : '未存储'}`);
        console.log(`     创建时间: ${latestLog.createdAt}`);
      } else {
        console.log(`   未找到决策日志`);
      }
    } catch (error) {
      console.log(`   查询决策日志失败: ${error.message}`);
    }

    // 6. 测试获取决策日志详情
    console.log('\n6. 测试获取决策日志详情...');
    try {
      const decisionLogs = await prisma.decisionLog.findMany({
        where: {
          accountId: accountId
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 1
      });

      if (decisionLogs.length > 0) {
        const decisionLogId = decisionLogs[0].id;
        console.log(`   获取决策日志详情: ID=${decisionLogId}`);

        // 这里应该调用API获取决策日志详情，但API可能尚未实现
        // 暂时直接查询数据库
        const logDetail = await prisma.decisionLog.findUnique({
          where: { id: decisionLogId },
          include: {
            account: {
              select: {
                name: true,
                modelType: true
              }
            }
          }
        });

        if (logDetail) {
          console.log(`   决策日志详情:`);
          console.log(`     账户: ${logDetail.account.name} (${logDetail.account.modelType})`);
          console.log(`     提示词模板: ${logDetail.promptTemplate}`);
          console.log(`     Token数量: ${logDetail.tokenCount}`);
          console.log(`     完整提示词长度: ${logDetail.fullPrompt ? logDetail.fullPrompt.length : 0} 字符`);
          console.log(`     用户偏好: ${logDetail.userPreferences ? JSON.stringify(logDetail.userPreferences).substring(0, 200) : '无'}`);
        }
      }
    } catch (error) {
      console.log(`   获取决策日志详情失败: ${error.message}`);
    }

    console.log('\n=== 测试完成 ===');

  } catch (error) {
    console.error('测试过程中发生错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
testEnhancedAIService().catch(console.error);