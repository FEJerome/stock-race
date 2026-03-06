import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 提示词模板服务
 * 负责管理提示词模板和生成个性化提示词
 */
class PromptTemplateService {
  constructor() {
    this.defaultTemplateId = 'default_decision_v1';
  }

  /**
   * 获取提示词模板
   * @param {string} templateId - 模板ID
   * @returns {Promise<Object>} 模板对象
   */
  async getTemplate(templateId) {
    try {
      const template = await prisma.promptTemplate.findUnique({
        where: { id: templateId }
      });

      if (!template) {
        throw new Error(`模板不存在: ${templateId}`);
      }

      return template;
    } catch (error) {
      console.error('获取提示词模板失败:', error);
      throw error;
    }
  }

  /**
   * 获取默认决策模板
   * @returns {Promise<Object>} 默认模板
   */
  async getDefaultDecisionTemplate() {
    return this.getTemplate(this.defaultTemplateId);
  }

  /**
   * 根据AI账户配置获取合适的模板
   * @param {Object} aiAccount - AI账户对象
   * @returns {Promise<string>} 模板ID
   */
  async getTemplateForAccount(aiAccount) {
    try {
      const { riskLevel, preferenceConfig, promptTemplateId } = aiAccount;

      // 如果账户指定了模板，使用指定模板
      if (promptTemplateId) {
        const template = await this.getTemplate(promptTemplateId);
        if (template && template.isActive) {
          return promptTemplateId;
        }
      }

      // 根据风险等级选择模板
      let templateId = this.defaultTemplateId;
      if (riskLevel === 'low' || riskLevel === 'conservative') {
        templateId = 'conservative_decision_v1';
      } else if (riskLevel === 'high' || riskLevel === 'aggressive') {
        templateId = 'aggressive_decision_v1';
      }

      // 检查模板是否存在且激活
      const template = await this.getTemplate(templateId);
      if (!template || !template.isActive) {
        return this.defaultTemplateId;
      }

      return templateId;
    } catch (error) {
      console.error('获取账户模板失败:', error);
      return this.defaultTemplateId;
    }
  }

  /**
   * 生成个性化提示词
   * @param {Object} template - 模板对象
   * @param {Object} variables - 模板变量
   * @returns {string} 生成的提示词
   */
  generatePrompt(template, variables) {
    try {
      let prompt = template.templateText;

      // 替换模板变量
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        if (prompt.includes(placeholder)) {
          prompt = prompt.replace(new RegExp(placeholder, 'g'), this.formatVariableValue(value));
        }
      }

      // 检查是否有未替换的变量
      const missingVariables = this.findMissingVariables(prompt);
      if (missingVariables.length > 0) {
        console.warn('提示词中有未替换的变量:', missingVariables);
      }

      return prompt;
    } catch (error) {
      console.error('生成提示词失败:', error);
      throw error;
    }
  }

  /**
   * 格式化变量值
   * @param {any} value - 变量值
   * @returns {string} 格式化后的值
   */
  formatVariableValue(value) {
    if (value === null || value === undefined) {
      return '无';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? '是' : '否';
    }

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return '[对象]';
      }
    }

    return String(value);
  }

  /**
   * 查找未替换的变量
   * @param {string} prompt - 提示词文本
   * @returns {Array<string>} 未替换的变量列表
   */
  findMissingVariables(prompt) {
    const variablePattern = /\{([^}]+)\}/g;
    const matches = [];
    let match;

    while ((match = variablePattern.exec(prompt)) !== null) {
      matches.push(match[1]);
    }

    return matches;
  }

  /**
   * 估算提示词token数量
   * @param {string} prompt - 提示词文本
   * @returns {number} 预估token数量
   */
  estimateTokenCount(prompt) {
    // 简单估算：中文字符算1.5个token，英文字符算0.25个token
    const chineseChars = (prompt.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = prompt.length - chineseChars;

    return Math.ceil(chineseChars * 1.5 + englishChars * 0.25);
  }

  /**
   * 优化提示词长度
   * @param {string} prompt - 原始提示词
   * @param {number} maxTokens - 最大token数
   * @returns {string} 优化后的提示词
   */
  optimizePromptLength(prompt, maxTokens = 1500) {
    const currentTokens = this.estimateTokenCount(prompt);

    if (currentTokens <= maxTokens) {
      return prompt;
    }

    console.warn(`提示词过长: ${currentTokens} tokens > ${maxTokens} tokens，尝试优化`);

    // 简单优化策略：截断过长的部分
    const ratio = maxTokens / currentTokens;
    const targetLength = Math.floor(prompt.length * ratio * 0.9); // 保留90%的容量

    if (targetLength < 100) {
      throw new Error('提示词过长，无法优化到指定长度');
    }

    // 尝试在段落边界截断
    const truncated = this.truncateAtParagraph(prompt, targetLength);
    const truncatedTokens = this.estimateTokenCount(truncated);

    console.log(`提示词优化完成: ${currentTokens} -> ${truncatedTokens} tokens`);
    return truncated;
  }

  /**
   * 在段落边界截断文本
   * @param {string} text - 原始文本
   * @param {number} maxLength - 最大长度
   * @returns {string} 截断后的文本
   */
  truncateAtParagraph(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }

    // 查找段落分隔符
    const paragraphs = text.split(/\n\s*\n/);
    let result = '';
    let currentLength = 0;

    for (const paragraph of paragraphs) {
      const paragraphWithNewlines = paragraph + '\n\n';
      if (currentLength + paragraphWithNewlines.length <= maxLength) {
        result += paragraphWithNewlines;
        currentLength += paragraphWithNewlines.length;
      } else {
        // 当前段落过长，在句子边界截断
        const remainingLength = maxLength - currentLength;
        if (remainingLength > 50) { // 至少保留50个字符
          const sentences = paragraph.split(/[。！？.!?]/);
          let sentenceResult = '';

          for (const sentence of sentences) {
            const sentenceWithPunctuation = sentence + '。';
            if (sentenceResult.length + sentenceWithPunctuation.length <= remainingLength) {
              sentenceResult += sentenceWithPunctuation;
            } else {
              break;
            }
          }

          if (sentenceResult) {
            result += sentenceResult + '\n\n';
          }
        }
        break;
      }
    }

    return result.trim();
  }

  /**
   * 准备决策请求的模板变量
   * @param {Object} aiAccount - AI账户对象
   * @param {Object} requestData - 决策请求数据
   * @returns {Object} 模板变量
   */
  prepareDecisionVariables(aiAccount, requestData) {
    const {
      stockData = {},
      portfolioData = {},
      marketData = {},
      constraints = {}
    } = requestData;

    // 格式化账户信息
    const accountInfo = this.formatAccountInfo(aiAccount);

    // 格式化持仓信息
    const positions = this.formatPositions(portfolioData.positions || []);

    // 格式化股票数据
    const stockDataText = this.formatStockData(stockData);

    // 格式化交易约束
    const constraintsText = this.formatConstraints(constraints);

    // 格式化市场环境
    const marketConditionsText = this.formatMarketConditions(marketData);

    // 格式化用户偏好
    const userPreferencesText = this.formatUserPreferences(aiAccount.preferenceConfig || {});

    return {
      account_info: accountInfo,
      positions: positions,
      stock_data: stockDataText,
      constraints: constraintsText,
      market_conditions: marketConditionsText,
      user_preferences: userPreferencesText,
      current_time: new Date().toLocaleString('zh-CN')
    };
  }

  /**
   * 格式化账户信息
   * @param {Object} account - AI账户对象
   * @returns {string} 格式化后的账户信息
   */
  formatAccountInfo(account) {
    return `账户名称：${account.name}
账户ID：${account.id}
模型类型：${account.modelType}
风险等级：${account.riskLevel}
交易频率：${account.tradingFrequency}
初始资金：${parseFloat(account.initialBalance).toFixed(2)} 元
当前资金：${parseFloat(account.currentBalance).toFixed(2)} 元
总资产：${parseFloat(account.totalValue).toFixed(2)} 元
状态：${account.status}`;
  }

  /**
   * 格式化持仓信息
   * @param {Array} positions - 持仓数组
   * @returns {string} 格式化后的持仓信息
   */
  formatPositions(positions) {
    if (!positions || positions.length === 0) {
      return '无持仓';
    }

    let result = '';
    positions.forEach((position, index) => {
      result += `${index + 1}. ${position.stockCode || position.symbol} - 数量：${position.quantity}，成本：${position.avgCost || '未知'}，当前价：${position.currentPrice || '未知'}，盈亏：${position.profitLoss || '未知'} (${position.profitLossRate || '未知'}%)\n`;
    });

    return result.trim();
  }

  /**
   * 格式化股票数据
   * @param {Object} stockData - 股票数据
   * @returns {string} 格式化后的股票数据
   */
  formatStockData(stockData) {
    if (!stockData || Object.keys(stockData).length === 0) {
      return '无股票数据';
    }

    const { code, name, price, change, changePercent, volume, amount, ...otherData } = stockData;

    let result = `股票代码：${code}
股票名称：${name}
当前价格：${price || '未知'} 元
涨跌幅：${change || '未知'} (${changePercent || '未知'}%)
成交量：${volume || '未知'} 手
成交额：${amount || '未知'} 万元`;

    // 添加其他重要数据
    const importantFields = ['pe', 'pb', 'marketCap', 'industry', 'high', 'low', 'open', 'prevClose'];
    importantFields.forEach(field => {
      if (otherData[field] !== undefined) {
        result += `\n${field.toUpperCase()}：${otherData[field]}`;
      }
    });

    return result;
  }

  /**
   * 格式化交易约束
   * @param {Object} constraints - 交易约束
   * @returns {string} 格式化后的交易约束
   */
  formatConstraints(constraints) {
    if (!constraints || Object.keys(constraints).length === 0) {
      return '无特殊交易约束';
    }

    let result = '交易约束：\n';
    const constraintMap = {
      maxPositionSize: '单只股票最大持仓比例',
      minCashRatio: '最低现金比例',
      maxDailyLoss: '单日最大亏损',
      stopLossLevel: '止损线',
      takeProfitLevel: '止盈线',
      tradingHours: '交易时间限制',
      allowedMarkets: '允许交易的市场'
    };

    for (const [key, value] of Object.entries(constraints)) {
      const displayName = constraintMap[key] || key;
      result += `- ${displayName}：${value}\n`;
    }

    return result.trim();
  }

  /**
   * 格式化市场环境
   * @param {Object} marketData - 市场数据
   * @returns {string} 格式化后的市场环境
   */
  formatMarketConditions(marketData) {
    if (!marketData || Object.keys(marketData).length === 0) {
      return '市场数据暂不可用';
    }

    const { index, sentiment, volatility, trend, ...otherData } = marketData;

    let result = '市场环境：\n';
    if (index) result += `- 大盘指数：${index}\n`;
    if (sentiment) result += `- 市场情绪：${sentiment}\n`;
    if (volatility) result += `- 波动率：${volatility}\n`;
    if (trend) result += `- 趋势：${trend}\n`;

    // 添加其他市场数据
    Object.entries(otherData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        result += `- ${key}：${value}\n`;
      }
    });

    return result.trim() || '市场环境数据有限';
  }

  /**
   * 格式化用户偏好
   * @param {Object} preferences - 用户偏好配置
   * @returns {string} 格式化后的用户偏好
   */
  formatUserPreferences(preferences) {
    if (!preferences || Object.keys(preferences).length === 0) {
      return '使用默认配置';
    }

    try {
      const pref = typeof preferences === 'string' ? JSON.parse(preferences) : preferences;

      let result = '账户偏好配置：\n';

      // 风险偏好
      if (pref.riskTolerance) {
        result += `- 风险承受能力：${pref.riskTolerance}\n`;
      }

      // 交易风格
      if (pref.tradingStyle) {
        result += `- 交易风格：${pref.tradingStyle}\n`;
      }

      if (pref.holdingPeriod) {
        result += `- 持有期限偏好：${pref.holdingPeriod}\n`;
      }

      // 策略偏好
      if (pref.preferredStrategies && pref.preferredStrategies.length > 0) {
        result += `- 偏好策略：${pref.preferredStrategies.join(', ')}\n`;
      }

      if (pref.avoidStrategies && pref.avoidStrategies.length > 0) {
        result += `- 避免策略：${pref.avoidStrategies.join(', ')}\n`;
      }

      // 行业偏好
      if (pref.preferredIndustries && pref.preferredIndustries.length > 0) {
        result += `- 偏好行业：${pref.preferredIndustries.join(', ')}\n`;
      }

      if (pref.avoidIndustries && pref.avoidIndustries.length > 0) {
        result += `- 避免行业：${pref.avoidIndustries.join(', ')}\n`;
      }

      return result.trim();
    } catch (error) {
      console.error('格式化用户偏好失败:', error);
      return '用户偏好配置格式错误';
    }
  }

  /**
   * 获取模型上下文信息
   * @param {Object} aiAccount - AI账户对象
   * @param {Object} requestData - 决策请求数据
   * @returns {Object} 模型上下文信息
   */
  getModelContext(aiAccount, requestData) {
    return {
      modelType: aiAccount.modelType,
      riskLevel: aiAccount.riskLevel,
      tradingFrequency: aiAccount.tradingFrequency,
      tokenBudget: aiAccount.tokenBudget || 1500,
      requestTimestamp: new Date().toISOString(),
      stockCode: requestData.stockData?.code,
      hasPortfolioData: !!(requestData.portfolioData && Object.keys(requestData.portfolioData).length > 0),
      hasMarketData: !!(requestData.marketData && Object.keys(requestData.marketData).length > 0)
    };
  }
}

export default new PromptTemplateService();