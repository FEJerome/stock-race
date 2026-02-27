import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 用户偏好处理服务
 * 负责处理AI账户的用户偏好配置
 */
class UserPreferenceProcessor {
  constructor() {
    // 默认偏好配置
    this.defaultPreferences = {
      // 风险偏好
      riskTolerance: 'balanced', // conservative, balanced, aggressive

      // 交易风格
      tradingStyle: 'swing', // day, swing, position
      holdingPeriod: 'medium_term', // short_term, medium_term, long_term

      // 策略偏好
      preferredStrategies: ['momentum', 'value'], // momentum, value, growth, dividend, technical
      avoidStrategies: ['speculative'], // speculative, high_frequency

      // 行业偏好
      preferredIndustries: [], // 空数组表示无特定偏好
      avoidIndustries: [], // 空数组表示无特定避免

      // 技术指标权重
      indicatorWeights: {
        technical: 0.4,
        fundamental: 0.4,
        sentiment: 0.2
      },

      // 交易限制
      tradingLimits: {
        maxPositionSize: 0.2, // 单只股票最大持仓比例
        minCashRatio: 0.1, // 最低现金比例
        maxDailyLoss: -0.05, // 单日最大亏损比例
        stopLossLevel: -0.1, // 止损线
        takeProfitLevel: 0.2 // 止盈线
      },

      // 其他偏好
      otherPreferences: {
        preferDividendStocks: false,
        avoidHighVolatility: false,
        focusOnLiquidity: true,
        considerMarketTiming: true
      }
    };
  }

  /**
   * 获取AI账户的用户偏好配置
   * @param {number} accountId - 账户ID
   * @returns {Promise<Object>} 用户偏好配置
   */
  async getAccountPreferences(accountId) {
    try {
      const account = await prisma.aIAccount.findUnique({
        where: { id: accountId },
        select: {
          preferenceConfig: true,
          riskLevel: true,
          tradingFrequency: true
        }
      });

      if (!account) {
        throw new Error(`AI账户不存在: ${accountId}`);
      }

      // 合并默认配置和账户配置
      const preferences = this.mergePreferences(
        this.defaultPreferences,
        account.preferenceConfig,
        account.riskLevel,
        account.tradingFrequency
      );

      return preferences;
    } catch (error) {
      console.error('获取账户偏好配置失败:', error);
      return this.defaultPreferences;
    }
  }

  /**
   * 更新AI账户的用户偏好配置
   * @param {number} accountId - 账户ID
   * @param {Object} preferences - 新的偏好配置
   * @returns {Promise<Object>} 更新后的偏好配置
   */
  async updateAccountPreferences(accountId, preferences) {
    try {
      // 验证偏好配置
      const validatedPreferences = this.validatePreferences(preferences);

      // 更新账户配置
      const updatedAccount = await prisma.aIAccount.update({
        where: { id: accountId },
        data: {
          preferenceConfig: validatedPreferences,
          updatedAt: new Date()
        },
        select: {
          id: true,
          name: true,
          preferenceConfig: true
        }
      });

      console.log(`AI账户 ${accountId} 偏好配置已更新`);

      // 记录配置变更日志
      await this.logPreferenceChange(accountId, validatedPreferences);

      return updatedAccount.preferenceConfig;
    } catch (error) {
      console.error('更新账户偏好配置失败:', error);
      throw error;
    }
  }

  /**
   * 合并偏好配置
   * @param {Object} defaultPrefs - 默认配置
   * @param {Object} accountPrefs - 账户配置
   * @param {string} riskLevel - 风险等级
   * @param {string} tradingFrequency - 交易频率
   * @returns {Object} 合并后的配置
   */
  mergePreferences(defaultPrefs, accountPrefs, riskLevel, tradingFrequency) {
    try {
      let accountConfig = {};

      // 解析账户配置
      if (accountPrefs) {
        if (typeof accountPrefs === 'string') {
          accountConfig = JSON.parse(accountPrefs);
        } else if (typeof accountPrefs === 'object') {
          accountConfig = accountPrefs;
        }
      }

      // 合并配置
      const merged = {
        ...defaultPrefs,
        ...accountConfig
      };

      // 根据风险等级调整配置
      merged.riskTolerance = this.getRiskToleranceFromLevel(riskLevel);

      // 根据交易频率调整配置
      merged.tradingStyle = this.getTradingStyleFromFrequency(tradingFrequency);

      // 确保数组字段正确
      this.ensureArrayFields(merged);

      return merged;
    } catch (error) {
      console.error('合并偏好配置失败:', error);
      return defaultPrefs;
    }
  }

  /**
   * 根据风险等级获取风险承受能力
   * @param {string} riskLevel - 风险等级
   * @returns {string} 风险承受能力
   */
  getRiskToleranceFromLevel(riskLevel) {
    const riskMap = {
      'low': 'conservative',
      'conservative': 'conservative',
      'medium': 'balanced',
      'balanced': 'balanced',
      'high': 'aggressive',
      'aggressive': 'aggressive'
    };

    return riskMap[riskLevel] || 'balanced';
  }

  /**
   * 根据交易频率获取交易风格
   * @param {string} tradingFrequency - 交易频率
   * @returns {string} 交易风格
   */
  getTradingStyleFromFrequency(tradingFrequency) {
    const styleMap = {
      'high': 'day', // 高频交易 -> 日内交易
      'daily': 'swing', // 每日交易 -> 波段交易
      'weekly': 'swing', // 每周交易 -> 波段交易
      'monthly': 'position', // 每月交易 -> 持仓交易
      'low': 'position' // 低频交易 -> 持仓交易
    };

    return styleMap[tradingFrequency] || 'swing';
  }

  /**
   * 确保数组字段正确
   * @param {Object} preferences - 偏好配置
   */
  ensureArrayFields(preferences) {
    const arrayFields = [
      'preferredStrategies',
      'avoidStrategies',
      'preferredIndustries',
      'avoidIndustries'
    ];

    arrayFields.forEach(field => {
      if (!Array.isArray(preferences[field])) {
        preferences[field] = [];
      }
    });
  }

  /**
   * 验证偏好配置
   * @param {Object} preferences - 待验证的配置
   * @returns {Object} 验证后的配置
   */
  validatePreferences(preferences) {
    const validated = {};

    // 验证风险承受能力
    if (preferences.riskTolerance && ['conservative', 'balanced', 'aggressive'].includes(preferences.riskTolerance)) {
      validated.riskTolerance = preferences.riskTolerance;
    }

    // 验证交易风格
    if (preferences.tradingStyle && ['day', 'swing', 'position'].includes(preferences.tradingStyle)) {
      validated.tradingStyle = preferences.tradingStyle;
    }

    // 验证持有期限
    if (preferences.holdingPeriod && ['short_term', 'medium_term', 'long_term'].includes(preferences.holdingPeriod)) {
      validated.holdingPeriod = preferences.holdingPeriod;
    }

    // 验证策略偏好（确保是数组）
    if (preferences.preferredStrategies) {
      validated.preferredStrategies = this.validateStrategyArray(preferences.preferredStrategies);
    }

    if (preferences.avoidStrategies) {
      validated.avoidStrategies = this.validateStrategyArray(preferences.avoidStrategies);
    }

    // 验证行业偏好（确保是数组）
    if (preferences.preferredIndustries) {
      validated.preferredIndustries = this.validateIndustryArray(preferences.preferredIndustries);
    }

    if (preferences.avoidIndustries) {
      validated.avoidIndustries = this.validateIndustryArray(preferences.avoidIndustries);
    }

    // 验证技术指标权重
    if (preferences.indicatorWeights && typeof preferences.indicatorWeights === 'object') {
      validated.indicatorWeights = this.validateIndicatorWeights(preferences.indicatorWeights);
    }

    // 验证交易限制
    if (preferences.tradingLimits && typeof preferences.tradingLimits === 'object') {
      validated.tradingLimits = this.validateTradingLimits(preferences.tradingLimits);
    }

    // 验证其他偏好
    if (preferences.otherPreferences && typeof preferences.otherPreferences === 'object') {
      validated.otherPreferences = this.validateOtherPreferences(preferences.otherPreferences);
    }

    return validated;
  }

  /**
   * 验证策略数组
   * @param {any} strategies - 策略数据
   * @returns {Array<string>} 验证后的策略数组
   */
  validateStrategyArray(strategies) {
    const validStrategies = ['momentum', 'value', 'growth', 'dividend', 'technical', 'mean_reversion', 'breakout'];

    if (Array.isArray(strategies)) {
      return strategies.filter(strategy =>
        typeof strategy === 'string' && validStrategies.includes(strategy)
      );
    } else if (typeof strategies === 'string') {
      // 尝试解析字符串
      try {
        const parsed = JSON.parse(strategies);
        if (Array.isArray(parsed)) {
          return parsed.filter(strategy =>
            typeof strategy === 'string' && validStrategies.includes(strategy)
          );
        }
      } catch {
        // 如果不是JSON，尝试按逗号分割
        return strategies.split(',').map(s => s.trim()).filter(strategy =>
          validStrategies.includes(strategy)
        );
      }
    }

    return [];
  }

  /**
   * 验证行业数组
   * @param {any} industries - 行业数据
   * @returns {Array<string>} 验证后的行业数组
   */
  validateIndustryArray(industries) {
    if (Array.isArray(industries)) {
      return industries.filter(industry => typeof industry === 'string');
    } else if (typeof industries === 'string') {
      try {
        const parsed = JSON.parse(industries);
        if (Array.isArray(parsed)) {
          return parsed.filter(industry => typeof industry === 'string');
        }
      } catch {
        return industries.split(',').map(s => s.trim()).filter(industry => industry.length > 0);
      }
    }

    return [];
  }

  /**
   * 验证技术指标权重
   * @param {Object} weights - 权重配置
   * @returns {Object} 验证后的权重配置
   */
  validateIndicatorWeights(weights) {
    const validated = {
      technical: 0.4,
      fundamental: 0.4,
      sentiment: 0.2
    };

    if (typeof weights.technical === 'number' && weights.technical >= 0 && weights.technical <= 1) {
      validated.technical = weights.technical;
    }

    if (typeof weights.fundamental === 'number' && weights.fundamental >= 0 && weights.fundamental <= 1) {
      validated.fundamental = weights.fundamental;
    }

    if (typeof weights.sentiment === 'number' && weights.sentiment >= 0 && weights.sentiment <= 1) {
      validated.sentiment = weights.sentiment;
    }

    // 归一化权重
    const total = validated.technical + validated.fundamental + validated.sentiment;
    if (total > 0) {
      validated.technical = validated.technical / total;
      validated.fundamental = validated.fundamental / total;
      validated.sentiment = validated.sentiment / total;
    }

    return validated;
  }

  /**
   * 验证交易限制
   * @param {Object} limits - 交易限制
   * @returns {Object} 验证后的交易限制
   */
  validateTradingLimits(limits) {
    const validated = {
      maxPositionSize: 0.2,
      minCashRatio: 0.1,
      maxDailyLoss: -0.05,
      stopLossLevel: -0.1,
      takeProfitLevel: 0.2
    };

    if (typeof limits.maxPositionSize === 'number' && limits.maxPositionSize > 0 && limits.maxPositionSize <= 1) {
      validated.maxPositionSize = limits.maxPositionSize;
    }

    if (typeof limits.minCashRatio === 'number' && limits.minCashRatio >= 0 && limits.minCashRatio <= 1) {
      validated.minCashRatio = limits.minCashRatio;
    }

    if (typeof limits.maxDailyLoss === 'number' && limits.maxDailyLoss < 0) {
      validated.maxDailyLoss = limits.maxDailyLoss;
    }

    if (typeof limits.stopLossLevel === 'number' && limits.stopLossLevel < 0) {
      validated.stopLossLevel = limits.stopLossLevel;
    }

    if (typeof limits.takeProfitLevel === 'number' && limits.takeProfitLevel > 0) {
      validated.takeProfitLevel = limits.takeProfitLevel;
    }

    return validated;
  }

  /**
   * 验证其他偏好
   * @param {Object} otherPrefs - 其他偏好
   * @returns {Object} 验证后的其他偏好
   */
  validateOtherPreferences(otherPrefs) {
    const validated = {
      preferDividendStocks: false,
      avoidHighVolatility: false,
      focusOnLiquidity: true,
      considerMarketTiming: true
    };

    if (typeof otherPrefs.preferDividendStocks === 'boolean') {
      validated.preferDividendStocks = otherPrefs.preferDividendStocks;
    }

    if (typeof otherPrefs.avoidHighVolatility === 'boolean') {
      validated.avoidHighVolatility = otherPrefs.avoidHighVolatility;
    }

    if (typeof otherPrefs.focusOnLiquidity === 'boolean') {
      validated.focusOnLiquidity = otherPrefs.focusOnLiquidity;
    }

    if (typeof otherPrefs.considerMarketTiming === 'boolean') {
      validated.considerMarketTiming = otherPrefs.considerMarketTiming;
    }

    return validated;
  }

  /**
   * 记录偏好配置变更日志
   * @param {number} accountId - 账户ID
   * @param {Object} newPreferences - 新的偏好配置
   */
  async logPreferenceChange(accountId, newPreferences) {
    try {
      await prisma.systemLog.create({
        data: {
          accountId,
          level: 'info',
          message: 'AI账户偏好配置已更新',
          source: 'UserPreferenceProcessor',
          metadata: {
            action: 'update_preferences',
            newPreferences: newPreferences
          }
        }
      });
    } catch (error) {
      console.error('记录偏好配置变更日志失败:', error);
    }
  }

  /**
   * 将用户偏好转换为决策约束
   * @param {Object} preferences - 用户偏好配置
   * @returns {Object} 决策约束
   */
  convertPreferencesToConstraints(preferences) {
    const constraints = {};

    if (preferences.tradingLimits) {
      constraints.maxPositionSize = preferences.tradingLimits.maxPositionSize;
      constraints.minCashRatio = preferences.tradingLimits.minCashRatio;
      constraints.maxDailyLoss = preferences.tradingLimits.maxDailyLoss;
      constraints.stopLossLevel = preferences.tradingLimits.stopLossLevel;
      constraints.takeProfitLevel = preferences.tradingLimits.takeProfitLevel;
    }

    if (preferences.preferredIndustries && preferences.preferredIndustries.length > 0) {
      constraints.preferredIndustries = preferences.preferredIndustries;
    }

    if (preferences.avoidIndustries && preferences.avoidIndustries.length > 0) {
      constraints.avoidIndustries = preferences.avoidIndustries;
    }

    if (preferences.otherPreferences) {
      if (preferences.otherPreferences.preferDividendStocks) {
        constraints.preferDividendStocks = true;
      }
      if (preferences.otherPreferences.avoidHighVolatility) {
        constraints.avoidHighVolatility = true;
      }
    }

    return constraints;
  }

  /**
   * 获取简化的偏好摘要（用于提示词）
   * @param {Object} preferences - 用户偏好配置
   * @returns {string} 偏好摘要
   */
  getPreferenceSummary(preferences) {
    const summary = [];

    // 风险偏好
    if (preferences.riskTolerance) {
      summary.push(`风险承受能力：${preferences.riskTolerance}`);
    }

    // 交易风格
    if (preferences.tradingStyle) {
      summary.push(`交易风格：${preferences.tradingStyle}`);
    }

    // 策略偏好
    if (preferences.preferredStrategies && preferences.preferredStrategies.length > 0) {
      summary.push(`偏好策略：${preferences.preferredStrategies.join(', ')}`);
    }

    if (preferences.avoidStrategies && preferences.avoidStrategies.length > 0) {
      summary.push(`避免策略：${preferences.avoidStrategies.join(', ')}`);
    }

    // 行业偏好
    if (preferences.preferredIndustries && preferences.preferredIndustries.length > 0) {
      summary.push(`偏好行业：${preferences.preferredIndustries.join(', ')}`);
    }

    if (preferences.avoidIndustries && preferences.avoidIndustries.length > 0) {
      summary.push(`避免行业：${preferences.avoidIndustries.join(', ')}`);
    }

    return summary.join('；');
  }
}

export default new UserPreferenceProcessor();