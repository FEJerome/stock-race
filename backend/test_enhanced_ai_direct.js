#!/usr/bin/env node

/**
 * 直接测试增强的AI服务
 * 验证EnhancedAIService的核心功能
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testEnhancedAIServiceDirect() {
  console.log('=== 直接测试增强的AI服务 ===\n');

  try {
    // 1. 检查数据库连接
    console.log('1. 检查数据库连接...');
    await prisma.$connect();
    console.log('   数据库连接成功\n');

    // 2. 检查prompt_templates表
    console.log('2. 检查prompt_templates表...');
    try {
      const templates = await prisma.promptTemplate.findMany({
        take: 5
      });

      console.log(`   找到 ${templates.length} 个提示词模板:`);
      templates.forEach(template => {
        console.log(`   - ${template.id}: ${template.name} (${template.templateType}, ${template.isActive ? '激活' : '未激活'})`);
      });
      console.log();
    } catch (error) {
      console.log(`   查询提示词模板失败: ${error.message}`);
      console.log(`   错误详情: ${error}`);
      console.log();
    }

    // 3. 检查AI账户表结构
    console.log('3. 检查AI账户表结构...');
    const aiAccounts = await prisma.aIAccount.findMany({
      take: 3,
      select: {
        id: true,
        name: true,
        modelType: true,
        riskLevel: true,
        preferenceConfig: true,
        promptTemplateId: true,
        tokenBudget: true,
        lastDecisionAt: true
      }
    });

    console.log(`   找到 ${aiAccounts.length} 个AI账户:`);
    aiAccounts.forEach(account => {
      console.log(`   - ${account.id}: ${account.name} (${account.modelType})`);
      console.log(`     风险等级: ${account.riskLevel}`);
      console.log(`     偏好配置: ${account.preferenceConfig ? JSON.stringify(account.preferenceConfig).substring(0, 100) : '无'}`);
      console.log(`     提示词模板ID: ${account.promptTemplateId || '默认'}`);
      console.log(`     Token预算: ${account.tokenBudget || '默认(1500)'}`);
      console.log(`     最后决策时间: ${account.lastDecisionAt || '从未'}`);
      console.log();
    });

    // 4. 检查决策日志表结构
    console.log('4. 检查决策日志表结构...');
    const decisionLogs = await prisma.decisionLog.findMany({
      take: 3,
      select: {
        id: true,
        accountId: true,
        decisionType: true,
        reasoning: true,
        confidence: true,
        riskLevel: true,
        promptTemplate: true,
        fullPrompt: true,
        tokenCount: true,
        userPreferences: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`   找到 ${decisionLogs.length} 条决策日志:`);
    decisionLogs.forEach(log => {
      console.log(`   - ${log.id}: 账户ID=${log.accountId}, 类型=${log.decisionType}`);
      console.log(`     决策理由: ${log.reasoning ? log.reasoning.substring(0, 50) + '...' : '无'}`);
      console.log(`     置信度: ${log.confidence}`);
      console.log(`     风险等级: ${log.riskLevel}`);
      console.log(`     提示词模板: ${log.promptTemplate || '无'}`);
      console.log(`     完整提示词: ${log.fullPrompt ? `${log.fullPrompt.length} 字符` : '未存储'}`);
      console.log(`     Token数量: ${log.tokenCount || '未记录'}`);
      console.log(`     用户偏好: ${log.userPreferences ? '已存储' : '未存储'}`);
      console.log(`     创建时间: ${log.createdAt}`);
      console.log();
    });

    // 5. 测试创建一个带有偏好配置的AI账户
    console.log('5. 测试创建带有偏好配置的AI账户...');
    try {
      // 首先查找一个用户
      const user = await prisma.user.findFirst({
        select: { id: true, username: true }
      });

      if (user) {
        console.log(`   使用用户: ${user.username} (ID=${user.id})`);

        const testAccountData = {
          userId: user.id,
          name: '测试增强AI账户_' + Date.now(),
          modelType: 'deepseek',
          riskLevel: 'high',
          tradingFrequency: 'daily',
          preferenceConfig: {
            riskTolerance: 'aggressive',
            tradingStyle: 'swing',
            preferredStrategies: ['momentum', 'technical'],
            avoidStrategies: ['speculative'],
            tradingLimits: {
              maxPositionSize: 0.3,
              minCashRatio: 0.05,
              maxDailyLoss: -0.08
            }
          },
          promptTemplateId: 'aggressive_decision_v1',
          tokenBudget: 2000
        };

        const newAccount = await prisma.aIAccount.create({
          data: testAccountData
        });

        console.log(`   AI账户创建成功: ID=${newAccount.id}, 名称=${newAccount.name}`);
        console.log(`   偏好配置: ${JSON.stringify(newAccount.preferenceConfig, null, 2)}`);
        console.log(`   提示词模板ID: ${newAccount.promptTemplateId}`);
        console.log(`   Token预算: ${newAccount.tokenBudget}`);
        console.log();

        // 6. 测试创建一个决策日志
        console.log('6. 测试创建决策日志...');
        const testDecisionLog = {
          accountId: newAccount.id,
          decisionType: 'analyze',
          reasoning: '测试决策理由：基于技术分析和用户偏好配置',
          confidence: 0.85,
          riskLevel: 'high',
          promptTemplate: 'aggressive_decision_v1',
          promptVariables: {
            account_info: `测试账户 ${newAccount.name}`,
            stock_data: '测试股票数据',
            market_conditions: '测试市场环境',
            user_preferences: '测试用户偏好'
          },
          fullPrompt: '这是一个测试的完整提示词，包含账户信息、股票数据、市场环境和用户偏好配置。',
          tokenCount: 150,
          userPreferences: testAccountData.preferenceConfig,
          modelContext: {
            modelType: newAccount.modelType,
            riskLevel: newAccount.riskLevel,
            tokenBudget: newAccount.tokenBudget
          }
        };

        const newDecisionLog = await prisma.decisionLog.create({
          data: testDecisionLog
        });

        console.log(`   决策日志创建成功: ID=${newDecisionLog.id}`);
        console.log(`   完整提示词: ${newDecisionLog.fullPrompt ? '已存储' : '未存储'}`);
        console.log(`   Token数量: ${newDecisionLog.tokenCount}`);
        console.log(`   用户偏好: ${newDecisionLog.userPreferences ? '已存储' : '未存储'}`);
        console.log();

        // 7. 测试查询决策日志详情
        console.log('7. 测试查询决策日志详情...');
        const decisionLogDetail = await prisma.decisionLog.findUnique({
          where: { id: newDecisionLog.id },
          include: {
            account: {
              select: {
                name: true,
                modelType: true,
                riskLevel: true
              }
            }
          }
        });

        if (decisionLogDetail) {
          console.log(`   决策日志详情:`);
          console.log(`     账户: ${decisionLogDetail.account.name} (${decisionLogDetail.account.modelType}, ${decisionLogDetail.account.riskLevel})`);
          console.log(`     决策类型: ${decisionLogDetail.decisionType}`);
          console.log(`     决策理由: ${decisionLogDetail.reasoning}`);
          console.log(`     置信度: ${decisionLogDetail.confidence}`);
          console.log(`     风险等级: ${decisionLogDetail.riskLevel}`);
          console.log(`     提示词模板: ${decisionLogDetail.promptTemplate}`);
          console.log(`     完整提示词预览: ${decisionLogDetail.fullPrompt ? decisionLogDetail.fullPrompt.substring(0, 100) + '...' : '无'}`);
          console.log(`     Token数量: ${decisionLogDetail.tokenCount}`);
          console.log(`     用户偏好预览: ${decisionLogDetail.userPreferences ? JSON.stringify(decisionLogDetail.userPreferences).substring(0, 100) + '...' : '无'}`);
          console.log(`     创建时间: ${decisionLogDetail.createdAt}`);
        }
      } else {
        console.log('   未找到用户，跳过AI账户创建测试');
      }
    } catch (error) {
      console.log(`   测试创建失败: ${error.message}`);
    }

    console.log('\n=== 测试完成 ===');

  } catch (error) {
    console.error('测试过程中发生错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
testEnhancedAIServiceDirect().catch(console.error);