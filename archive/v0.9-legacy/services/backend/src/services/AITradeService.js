import { tradeRepository } from '../models/index.js';
import { aiAccountRepository } from '../models/index.js';
import { portfolioRepository } from '../models/index.js';
import { stockRepository } from '../models/index.js';
import { decisionLogRepository } from '../models/index.js';
import { virtualTradingService } from './VirtualTradingService.js';
import { dataService } from './DataService.js';

export class AITradeService {
  constructor() {
    this.minConfidence = 0.6; // 最小置信度阈值
    this.maxPositionSize = 0.1; // 最大持仓比例（10%）
    this.maxDailyTrades = 10; // 每日最大交易次数
  }

  /**
   * 为AI账户创建交易订单
   * @param {Object} params - 交易参数
   * @param {number} params.accountId - AI账户ID
   * @param {string} params.stockCode - 股票代码
   * @param {string} params.decisionType - 决策类型 ('buy' | 'sell')
   * @param {number} params.confidence - 置信度
   * @param {string} params.reasoning - 决策理由
   * @param {number} params.suggestedQuantity - 建议数量
   * @param {number} params.suggestedPrice - 建议价格
   * @param {string} params.riskLevel - 风险等级
   * @returns {Promise<Object>} 交易创建结果
   */
  async createAITrade({
    accountId,
    stockCode,
    decisionType,
    confidence,
    reasoning,
    suggestedQuantity,
    suggestedPrice,
    riskLevel
  }) {
    try {
      // 1. 验证AI账户
      const account = await aiAccountRepository.findOne({ id: accountId }, { user: true });

      if (!account) {
        throw new Error(`AI账户不存在: ${accountId}`);
      }

      if (account.status !== 'active') {
        throw new Error(`AI账户未激活: ${account.name}`);
      }

      // 2. 获取股票信息
      const stock = await stockRepository.findByCode(stockCode);
      if (!stock) {
        throw new Error(`股票不存在: ${stockCode}`);
      }

      if (stock.status !== 'normal') {
        throw new Error(`股票不可交易: ${stockCode}`);
      }

      // 3. 获取当前市场数据
      const marketData = await dataService.getRealtimeData(stockCode);
      if (!marketData || marketData.isFallback) {
        throw new Error(`无法获取股票实时数据: ${stockCode}`);
      }

      // 4. 验证置信度阈值
      if (confidence < this.minConfidence) {
        throw new Error(`置信度过低: ${confidence} < ${this.minConfidence}`);
      }

      // 5. 根据决策类型确定交易类型
      const tradeType = decisionType === 'buy' ? 'buy' : 'sell';

      // 6. 计算交易参数
      const { quantity, price } = await this.calculateTradeParameters({
        accountId,
        stockId: stock.id,
        tradeType,
        suggestedQuantity,
        suggestedPrice,
        marketData,
        riskLevel
      });

      // 7. 验证交易可行性
      const validation = await tradeRepository.validateTrade({
        accountId,
        stockId: stock.id,
        tradeType,
        orderType: 'market', // AI交易使用市价单
        quantity,
        price
      });

      if (!validation.valid) {
        throw new Error(`交易验证失败: ${validation.errors.join(', ')}`);
      }

      // 8. 计算交易金额和费用
      const amount = price * quantity;
      const { fee, netAmount } = this.calculateFees({
        tradeType,
        amount,
        quantity,
        price
      });

      // 9. 创建交易订单
      const tradeData = {
        accountId,
        stockId: stock.id,
        tradeType,
        orderType: 'market',
        quantity,
        price,
        amount,
        fee,
        netAmount,
        status: 'pending',
        reason: `AI决策: ${reasoning.substring(0, 100)}` // 截断理由
      };

      const trade = await tradeRepository.createTrade(tradeData);

      // 10. 更新决策日志的交易关联
      // 注意：这里需要外部传入决策日志ID或在此方法之前创建决策日志
      // 暂时返回交易ID，由调用者更新决策日志

      console.log(`✅ AI交易订单创建成功: 账户=${account.name}, 股票=${stockCode}, 类型=${tradeType}, 数量=${quantity}, 价格=${price}`);

      return {
        success: true,
        tradeId: trade.id,
        trade,
        message: 'AI交易订单创建成功'
      };
    } catch (error) {
      console.error(`❌ AI交易订单创建失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
        tradeId: null
      };
    }
  }

  /**
   * 计算交易参数
   */
  async calculateTradeParameters({
    accountId,
    stockId,
    tradeType,
    suggestedQuantity,
    suggestedPrice,
    marketData,
    riskLevel
  }) {
    let quantity = suggestedQuantity || 100; // 默认100股
    let price = suggestedPrice || marketData.price;

    // 获取账户余额和持仓
    const account = await aiAccountRepository.findOne({ id: accountId });

    const portfolio = await portfolioRepository.getStockPosition(accountId, stockId);
    const currentPosition = portfolio ? portfolio.quantity : 0;

    // 买入交易：检查资金限制
    if (tradeType === 'buy') {
      const maxBuyAmount = parseFloat(account.currentBalance) * this.maxPositionSize;
      const requestedAmount = price * quantity;

      if (requestedAmount > maxBuyAmount) {
        // 调整数量以适应资金限制
        quantity = Math.floor(maxBuyAmount / price);
        if (quantity < 100) {
          quantity = 100; // 至少100股
        }
      }

      // 确保有足够资金
      const availableBalance = parseFloat(account.currentBalance);
      const requiredAmount = price * quantity + this.calculateFees({
        tradeType: 'buy',
        amount: price * quantity,
        quantity,
        price
      }).fee;

      if (requiredAmount > availableBalance) {
        // 进一步调整数量
        quantity = Math.floor((availableBalance * 0.95) / price); // 保留5%缓冲
        if (quantity < 100) {
          throw new Error('账户余额不足，无法购买最低数量');
        }
      }
    }
    // 卖出交易：检查持仓限制
    else if (tradeType === 'sell') {
      if (currentPosition <= 0) {
        throw new Error('没有持仓可卖出');
      }

      // 不能卖出超过持仓的数量
      if (quantity > currentPosition) {
        quantity = currentPosition;
      }

      // 至少卖出100股或全部持仓
      if (quantity < 100 && currentPosition >= 100) {
        quantity = 100;
      }
    }

    // 价格合理性检查
    const priceChange = Math.abs((price - marketData.price) / marketData.price);
    if (priceChange > 0.1) { // 价格偏差超过10%
      price = marketData.price; // 使用市场价
    }

    return { quantity, price };
  }

  /**
   * 计算交易费用
   */
  calculateFees({ tradeType, amount, quantity, price }) {
    // 佣金（0.1%，最低1元）
    let commission = amount * 0.001;
    if (commission < 1) {
      commission = 1;
    }

    // 印花税（卖出时收取，0.1%）
    let stampDuty = 0;
    if (tradeType === 'sell') {
      stampDuty = amount * 0.001;
    }

    // 过户费（0.02%）
    const transferFee = amount * 0.0002;

    const fee = commission + stampDuty + transferFee;
    const netAmount = tradeType === 'buy' ? amount + fee : amount - fee;

    return { fee, netAmount };
  }

  /**
   * 批量处理AI决策并创建交易
   * @param {Array<Object>} decisions - AI决策数组
   * @returns {Promise<Array<Object>>} 处理结果
   */
  async processAIDecisions(decisions) {
    const results = [];

    for (const decision of decisions) {
      try {
        // 只处理买入和卖出决策
        if (decision.decisionType !== 'buy' && decision.decisionType !== 'sell') {
          results.push({
            decisionId: decision.id,
            success: false,
            reason: '忽略持有决策'
          });
          continue;
        }

        const result = await this.createAITrade({
          accountId: decision.accountId,
          stockCode: decision.stockCode,
          decisionType: decision.decisionType,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
          suggestedQuantity: decision.suggestedQuantity,
          suggestedPrice: decision.suggestedPrice,
          riskLevel: decision.riskLevel
        });

        if (result.success) {
          // 更新决策日志的交易关联
          await decisionLogRepository.update(decision.id, {
            tradeId: result.tradeId
          });
        }

        results.push({
          decisionId: decision.id,
          success: result.success,
          tradeId: result.tradeId,
          message: result.message,
          error: result.error
        });
      } catch (error) {
        results.push({
          decisionId: decision.id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 获取待处理的AI决策
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 待处理决策
   */
  async getPendingAIDecisions(options = {}) {
    const { limit = 50, minConfidence = this.minConfidence } = options;

    // 查找未关联交易的AI决策（决策类型为buy或sell）
    const pendingDecisions = await decisionLogRepository.findMany(
      {
        tradeId: null,
        decisionType: { in: ['buy', 'sell'] },
        confidence: { gte: minConfidence },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 最近24小时
        }
      },
      { createdAt: 'asc' },
      limit,
      {
        account: {
          select: {
            id: true,
            name: true,
            status: true
          }
        },
        stock: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    );

    // 过滤掉非活跃账户的决策
    return pendingDecisions.filter(decision =>
      decision.account.status === 'active'
    );
  }
}

// 创建单例实例
export const aiTradeService = new AITradeService();