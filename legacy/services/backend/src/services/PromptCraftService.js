import { aiServiceClient } from './AIServiceClient.js';
import { ServiceUnavailableError } from './ServiceClient.js';

/**
 * 提示词提炼服务错误
 */
export class PromptCraftError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PromptCraftError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 提示词结构验证器
 */
export class PromptValidator {
  /**
   * 验证提示词结构
   * @param {Object} prompt - 提示词对象
   * @returns {Object} 验证结果
   */
  static validate(prompt) {
    const errors = [];
    const requiredFields = ['role', 'philosophy', 'constraints'];

    for (const field of requiredFields) {
      if (!(field in prompt)) {
        errors.push(`缺少必需字段: ${field}`);
      } else if (typeof prompt[field] !== 'string' || prompt[field].trim().length === 0) {
        errors.push(`字段 ${field} 不能为空字符串`);
      }
    }

    // 验证字段长度
    if (prompt.role && prompt.role.length > 500) {
      errors.push('role 字段长度不能超过500字符');
    }
    if (prompt.philosophy && prompt.philosophy.length > 1000) {
      errors.push('philosophy 字段长度不能超过1000字符');
    }
    if (prompt.constraints && prompt.constraints.length > 2000) {
      errors.push('constraints 字段长度不能超过2000字符');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证对话数据
   * @param {Array} messages - 对话消息数组
   * @returns {Object} 验证结果
   */
  static validateDialogue(messages) {
    const errors = [];

    if (!Array.isArray(messages) || messages.length === 0) {
      errors.push('对话消息不能为空');
      return { valid: false, errors };
    }

    if (messages.length < 2) {
      errors.push('对话消息至少需要2轮（用户和AI各至少一条）');
    }

    // 检查消息格式
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
        errors.push(`消息[${i}] role 必须是 'user' 或 'assistant'`);
      }
      if (!msg.content || typeof msg.content !== 'string') {
        errors.push(`消息[${i}] content 不能为空`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * 提示词模板
 */
const PROMPT_TEMPLATES = {
  craftPrompt: (dialogueText, persona) => `
你是一位专业的AI提示词工程师。请根据以下用户与AI交易助手的对话内容，提炼出一套完整的交易AI提示词。

对话内容：
${dialogueText}

用户选择的交易风格：${persona || '未指定'}

请提炼出以下结构的提示词（使用JSON格式返回）：
{
  "role": "AI交易助手的角色定位（如：稳健型价值投资者、激进型短线交易者等，200字以内）",
  "philosophy": "投资哲学和核心理念（如：长期持有优质股票、追求短期高回报等，500字以内）",
  "constraints": "交易约束和风险控制规则（如：单只股票最大仓位不超过20%、止损线设为-5%等，1000字以内）",
  "preferences": "用户偏好的行业和交易风格（可选，如：偏好科技股、避免高波动股票等）"
}

要求：
1. 从对话中提取用户的投资偏好和风险承受能力
2. role 必须体现交易风格特征
3. philosophy 必须包含具体的投资理念
4. constraints 必须包含具体的风险控制规则
5. 所有内容必须基于对话内容提炼，不要添加对话中没有的信息
`,

  defaultPrompt: (persona) => ({
    role: '专业股票交易AI助手',
    philosophy: '基于数据驱动的投资决策，注重风险控制和长期收益',
    constraints: '单只股票仓位不超过总资产的20%；止损线设为-8%；不投资ST股票和退市风险股票',
    preferences: persona || '平衡型投资风格'
  })
};

/**
 * 提示词提炼服务
 * 负责将用户与AI的对话提炼成结构化的交易AI提示词
 */
export class PromptCraftService {
  constructor(options = {}) {
    this.aiClient = options.aiClient || aiServiceClient;
    this.useLocalFallback = options.useLocalFallback !== false;
    this.maxRetries = options.maxRetries || 3;
  }

  /**
   * 从对话中提炼提示词
   * @param {Object} params - 参数
   * @param {string} params.accountId - AI账户ID
   * @param {Array} params.dialogueMessages - 对话消息数组
   * @param {string} params.persona - 用户选择的交易风格
   * @param {string} params.modelType - AI模型类型
   * @returns {Promise<Object>} 提炼后的提示词
   */
  async craftPrompt({ accountId, dialogueMessages, persona, modelType }) {
    // 验证输入
    const validation = PromptValidator.validateDialogue(dialogueMessages);
    if (!validation.valid) {
      throw new PromptCraftError(
        'INVALID_DIALOGUE',
        '对话数据验证失败',
        { errors: validation.errors }
      );
    }

    try {
      // 构建对话文本
      const dialogueText = this._buildDialogueText(dialogueMessages);

      // 调用AI服务提炼提示词
      const craftedPrompt = await this._callAICraftPrompt(dialogueText, persona, modelType);

      // 验证提炼结果
      const promptValidation = PromptValidator.validate(craftedPrompt);
      if (!promptValidation.valid) {
        throw new PromptCraftError(
          'INVALID_PROMPT_STRUCTURE',
          '提炼的提示词结构不符合要求',
          { errors: promptValidation.errors }
        );
      }

      return {
        success: true,
        prompt: craftedPrompt,
        accountId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (error instanceof PromptCraftError) {
        throw error;
      }

      // 如果AI服务不可用且允许本地回退，使用默认提示词
      if (this.useLocalFallback && error instanceof ServiceUnavailableError) {
        console.warn('[PromptCraftService] AI服务不可用，使用默认提示词');
        return this._getDefaultPrompt(accountId, persona);
      }

      throw new PromptCraftError(
        'CRAFT_FAILED',
        '提示词提炼失败',
        { originalError: error.message }
      );
    }
  }

  /**
   * 构建对话文本
   * @private
   */
  _buildDialogueText(messages) {
    return messages.map(msg => {
      const role = msg.role === 'user' ? '用户' : 'AI助手';
      return `${role}: ${msg.content}`;
    }).join('\n\n');
  }

  /**
   * 调用AI服务提炼提示词
   * @private
   */
  async _callAICraftPrompt(dialogueText, persona, modelType) {
    // 尝试调用AI服务的craftPrompt接口
    try {
      const result = await this.aiClient.craftPrompt({
        dialogueText,
        persona,
        modelType,
        timestamp: new Date().toISOString()
      });

      if (result.success && result.prompt) {
        return {
          role: result.role || result.prompt.role,
          philosophy: result.philosophy || result.prompt.philosophy,
          constraints: result.constraints || result.prompt.constraints,
          preferences: result.preferences || result.prompt.preferences || persona
        };
      }
    } catch (error) {
      // 如果craftPrompt接口不存在或失败，使用本地生成
      console.warn('[PromptCraftService] AI服务craftPrompt接口调用失败，使用本地生成:', error.message);
    }

    // 本地生成提示词（基于对话内容分析）
    return this._generateLocalPrompt(dialogueText, persona);
  }

  /**
   * 本地生成提示词
   * @private
   */
  _generateLocalPrompt(dialogueText, persona) {
    // 分析对话内容提取关键信息
    const analysis = this._analyzeDialogue(dialogueText);

    // 根据交易风格生成提示词
    const style = persona || analysis.detectedStyle || 'balanced';

    const stylePrompts = {
      conservative: {
        role: '稳健型价值投资者，专注于长期持有优质蓝筹股，追求稳定股息收益和资本保值',
        philosophy: '价值投资为核心，注重安全边际，选择基本面稳健、现金流充裕的企业，长期持有获取复利收益。避免高风险投机，宁可错过机会也不冒本金损失的风险。',
        constraints: '单只股票最大仓位不超过总资产的15%；止损线设置为-5%；只投资沪深300成分股或同等级别的优质股票；不追逐热点，不跟风炒作；市盈率超过30的股票不买入。'
      },
      aggressive: {
        role: '激进型成长股猎手，专注于高成长潜力股票，追求超额收益',
        philosophy: '成长投资为核心，勇于承担风险，专注新兴产业和高成长赛道。相信高风险高回报，愿意在短期内承受较大波动以换取长期超额收益。积极寻找十倍股机会。',
        constraints: '单只股票最大仓位不超过总资产的25%；止损线设置为-12%；可以接受短期回撤30%以上；至少50%仓位配置成长股；允许适度参与市场热点但需控制仓位。'
      },
      balanced: {
        role: '平衡型全能交易者，兼顾价值与成长，追求风险调整后收益最大化',
        philosophy: '均衡配置策略，60%仓位配置稳健的价值股获取稳定收益，40%仓位配置成长股捕捉超额机会。注重资产配置和动态平衡，根据市场环境灵活调整策略。',
        constraints: '单只股票最大仓位不超过总资产的20%；止损线设置为-8%；成长股和价值股仓位比例保持在4:6到6:4之间；定期再平衡，每季度调整一次仓位；避免单一行业过度集中。'
      },
      day_trader: {
        role: '日内短线交易者，专注于技术分析和短线波动，追求快速盈利',
        philosophy: '技术分析为核心，追随市场趋势和资金流向，快进快出不恋战。重视盘口语言和市场情绪，利用短期波动获取收益。严格的纪律性是成功的关键。',
        constraints: '单只股票日内最大仓位不超过总资产的30%；单笔交易止损线设置为-3%；持仓时间不超过3个交易日；每日最大交易次数不超过10次；收盘前必须平仓80%以上仓位。'
      }
    };

    const selected = stylePrompts[style] || stylePrompts.balanced;

    return {
      role: selected.role,
      philosophy: selected.philosophy,
      constraints: selected.constraints,
      preferences: analysis.preferences || persona || '根据市场机会灵活调整'
    };
  }

  /**
   * 分析对话内容
   * @private
   */
  _analyzeDialogue(dialogueText) {
    const text = dialogueText.toLowerCase();

    // 检测交易风格关键词
    const styleKeywords = {
      conservative: ['稳健', '保守', '安全', '保值', '股息', '蓝筹', '长期', '谨慎', '低风险'],
      aggressive: ['激进', '冒险', '高收益', '成长', '追涨停', '高风险', '十倍股', '暴富'],
      day_trader: ['短线', '日内', '超短', '技术分析', '盘口', '快进快出', 't+0', '波段']
    };

    let detectedStyle = null;
    let maxMatches = 0;

    for (const [style, keywords] of Object.entries(styleKeywords)) {
      const matches = keywords.filter(kw => text.includes(kw)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedStyle = style;
      }
    }

    // 提取行业偏好
    const industryKeywords = {
      '科技股': ['科技', '芯片', '半导体', 'ai', '人工智能', '软件', '互联网'],
      '新能源': ['新能源', '光伏', '电动车', '锂电池', '储能', '绿色'],
      '医药股': ['医药', '医疗', '生物科技', '创新药', '医疗器械'],
      '消费股': ['消费', '白酒', '食品饮料', '零售', '品牌'],
      '金融股': ['银行', '保险', '券商', '金融', '地产']
    };

    const preferences = [];
    for (const [industry, keywords] of Object.entries(industryKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        preferences.push(industry);
      }
    }

    return {
      detectedStyle,
      preferences: preferences.length > 0 ? preferences.join('、') : null
    };
  }

  /**
   * 获取默认提示词
   * @private
   */
  _getDefaultPrompt(accountId, persona) {
    const defaultPrompt = PROMPT_TEMPLATES.defaultPrompt(persona);

    return {
      success: true,
      prompt: defaultPrompt,
      accountId,
      isDefault: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 构建完整系统提示词
   * @param {Object} craftedPrompt - 提炼的提示词
   * @returns {string} 完整系统提示词
   */
  buildSystemPrompt(craftedPrompt) {
    return `你是一位专业的股票交易AI助手。

## 角色定位
${craftedPrompt.role}

## 投资哲学
${craftedPrompt.philosophy}

## 交易约束
${craftedPrompt.constraints}

## 用户偏好
${craftedPrompt.preferences || '无特殊偏好'}

## 任务说明
基于以上角色设定，分析提供的股票市场数据，给出交易决策建议。你的决策必须符合上述角色定位和交易约束。

输出格式要求：
1. 必须给出明确的操作建议：买入(buy)、卖出(sell)或持有(hold)
2. 必须说明推荐理由，引用具体数据分析
3. 必须评估风险等级：低(low)、中(medium)、高(high)
4. 必须给出置信度评分(0-1)
5. 如涉及具体交易，建议合理的数量和价格区间`;
  }
}

// 创建单例实例
export const promptCraftService = new PromptCraftService();

export default PromptCraftService;
