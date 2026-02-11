import { tradeRepository } from '../models/index.js';
import { portfolioRepository } from '../models/index.js';
import { aiAccountRepository } from '../models/index.js';
import { stockRepository } from '../models/index.js';

/**
 * 交易执行错误
 */
export class TradeExecutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TradeExecutionError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 交易结果代码
 */
export const TradeResultCode = {
  SUCCESS: 'SUCCESS',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_POSITION: 'INSUFFICIENT_POSITION',
  INVALID_ACTION: 'INVALID_ACTION',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  STOCK_NOT_FOUND: 'STOCK_NOT_FOUND',
  DUPLICATE_DECISION: 'DUPLICATE_DECISION',
  EXECUTION_FAILED: 'EXECUTION_FAILED'
};

/**
 * 交易执行服务
 * 接收AI决策结果，执行虚拟交易，更新持仓
 */
export class TradeExecutionService {
  constructor() {
    // 已执行的决策ID集合（用于幂等性检查）
    this.executedDecisions = new Set();
    // 最大缓存大小
    this.maxCacheSize = 10000;
  }

  /**
   * 执行AI决策
   * @param {Object} decision - 决策数据
   * @param {string} decision.decisionId - 决策ID
   * @param {string} decision.accountId - AI账户ID
   * @param {string} decision.action - 动作 (buy/sell/hold)
   * @param {string} decision.symbol - 股票代码
   * @param {number} decision.quantity - 数量
   * @param {number} decision.price - 价格
   * @param {string} decision.reasoning - 决策理由
   * @returns {Promise<Object>} 执行结果
   */
  async executeDecision(decision) {
    const {
      decisionId,
      accountId,
      action,
      symbol,
      quantity,
      price,
      reasoning
    } = decision;

    // 1. 幂等性检查
    if (await this.isDecisionExecuted(decisionId)) {
      return {
        success: false,
        code: TradeResultCode.DUPLICATE_DECISION,
        message: '该决策已执行过',
        decisionId,
        tradeId: await this.getExistingTradeId(decisionId)
      };
    }

    // 2. 验证决策数据
    const validation = this.validateDecision(decision);
    if (!validation.valid) {
      return {
        success: false,
        code: TradeResultCode.INVALID_ACTION,
        message: validation.message,
        errors: validation.errors
      };
    }

    // 3. 获取账户信息
    const account = await this.getAccount(parseInt(accountId));
    if (!account) {
      return {
        success: false,
        code: TradeResultCode.ACCOUNT_NOT_FOUND,
        message: 'AI账户不存在'
      };
    }

    // 4. 获取股票信息
    const stock = await this.getStock(symbol);
    if (!stock) {
      return {
        success: false,
        code: TradeResultCode.STOCK_NOT_FOUND,
        message: `股票 ${symbol} 不存在`
      };
    }

    try {
      let tradeResult;

      // 5. 根据动作执行交易
      switch (action.toLowerCase()) {
        case 'buy':
          tradeResult = await this.executeBuy(account, stock, quantity, price, reasoning, decisionId);
          break;
        case 'sell':
          tradeResult = await this.executeSell(account, stock, quantity, price, reasoning, decisionId);
          break;
        case 'hold':
          tradeResult = await this.executeHold(account, stock, reasoning, decisionId);
          break;
        default:
          return {
            success: false,
            code: TradeResultCode.INVALID_ACTION,
            message: `不支持的交易动作: ${action}`
          };
      }

      // 6. 记录决策已执行
      await this.markDecisionExecuted(decisionId, tradeResult.tradeId);

      return tradeResult;
    } catch (error) {
      console.error('[TradeExecutionService] 执行交易失败:', error);
      return {
        success: false,
        code: TradeResultCode.EXECUTION_FAILED,
        message: '交易执行失败',
        error: error.message
      };
    }
  }

  /**
   * 验证决策数据
   * @private
   */
  validateDecision(decision) {
    const errors = [];

    if (!decision.decisionId) {
      errors.push('缺少决策ID');
    }

    if (!decision.accountId) {
      errors.push('缺少账户ID');
    }

    if (!decision.action) {
      errors.push('缺少交易动作');
    }

    if (!decision.symbol) {
      errors.push('缺少股票代码');
    }

    if (decision.quantity === undefined || decision.quantity === null) {
      errors.push('缺少交易数量');
    } else if (decision.quantity <= 0) {
      errors.push('交易数量必须大于0');
    }

    if (decision.price === undefined || decision.price === null) {
      errors.push('缺少交易价格');
    } else if (decision.price <= 0) {
      errors.push('交易价格必须大于0');
    }

    return {
      valid: errors.length === 0,
      message: errors.length > 0 ? '决策数据验证失败' : undefined,
      errors
    };
  }

  /**
   * 获取账户
   * @private
   */
  async getAccount(accountId) {
    try {
      return await aiAccountRepository.findOne({ id: accountId });
    } catch (error) {
      console.error('[TradeExecutionService] 获取账户失败:', error);
      return null;
    }
  }

  /**
   * 获取股票
   * @private
   */
  async getStock(symbol) {
    try {
      return await stockRepository.findOne({ code: symbol });
    } catch (error) {
      console.error('[TradeExecutionService] 获取股票失败:', error);
      return null;
    }
  }

  /**
   * 检查决策是否已执行
   * @private
   */
  async isDecisionExecuted(decisionId) {
    // 先检查内存缓存
    if (this.executedDecisions.has(decisionId)) {
      return true;
    }

    // 再检查数据库
    try {
      const existingTrade = await tradeRepository.findOne({
        decisionId,
        status: { not: 'cancelled' }
      });

      if (existingTrade) {
        // 加入缓存
        this.markDecisionExecuted(decisionId, existingTrade.id);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[TradeExecutionService] 检查决策执行状态失败:', error);
      return false;
    }
  }

  /**
   * 获取已存在的交易ID
   * @private
   */
  async getExistingTradeId(decisionId) {
    try {
      const trade = await tradeRepository.findOne({ decisionId });
      return trade?.id;
    } catch (error) {
      return null;
    }
  }

  /**
   * 标记决策已执行
   * @private
   */
  async markDecisionExecuted(decisionId, tradeId) {
    this.executedDecisions.add(decisionId);

    // 如果缓存过大，清理旧的
    if (this.executedDecisions.size > this.maxCacheSize) {
      const iterator = this.executedDecisions.values();
      const first = iterator.next().value;
      this.executedDecisions.delete(first);
    }
  }

  /**
   * 执行买入
   * @private
   */
  async executeBuy(account, stock, quantity, price, reasoning, decisionId) {
    const totalCost = price * quantity;
    const currentBalance = parseFloat(account.currentBalance);

    // 检查余额
    if (currentBalance < totalCost) {
      return {
        success: false,
        code: TradeResultCode.INSUFFICIENT_BALANCE,
        message: `余额不足，需要 ${totalCost.toFixed(2)}，当前余额 ${currentBalance.toFixed(2)}`,
        details: {
          required: totalCost,
          available: currentBalance,
          shortfall: totalCost - currentBalance
        }
      };
    }

    // 创建交易记录
    const trade = await tradeRepository.createTrade({
      accountId: account.id,
      stockId: stock.id,
      tradeType: 'buy',
      quantity,
      price,
      amount: totalCost,
      status: 'pending',
      decisionId,
      reasoning,
      createdAt: new Date()
    });

    // 更新账户余额
    await aiAccountRepository.updateBalance(account.id, -totalCost);

    // 更新持仓
    await portfolioRepository.updatePositionOnBuy(account.id, stock.id, quantity, price);

    // 执行交易
    await tradeRepository.executeTrade(trade.id, {
      executedPrice: price,
      executedAt: new Date()
    });

    // 更新账户总价值
    await aiAccountRepository.calculateTotalValue(account.id);

    return {
      success: true,
      code: TradeResultCode.SUCCESS,
      message: '买入交易执行成功',
      tradeId: trade.id,
      status: 'executed',
      details: {
        action: 'buy',
        symbol: stock.code,
        quantity,
        price,
        totalCost,
        remainingBalance: currentBalance - totalCost
      }
    };
  }

  /**
   * 执行卖出
   * @private
   */
  async executeSell(account, stock, quantity, price, reasoning, decisionId) {
    // 检查持仓
    const position = await portfolioRepository.getStockPosition(account.id, stock.id);

    if (!position || position.quantity < quantity) {
      const available = position?.quantity || 0;
      return {
        success: false,
        code: TradeResultCode.INSUFFICIENT_POSITION,
        message: `持仓不足，需要 ${quantity}，当前持仓 ${available}`,
        details: {
          required: quantity,
          available,
          shortfall: quantity - available
        }
      };
    }

    const totalValue = price * quantity;

    // 创建交易记录
    const trade = await tradeRepository.createTrade({
      accountId: account.id,
      stockId: stock.id,
      tradeType: 'sell',
      quantity,
      price,
      amount: totalValue,
      status: 'pending',
      decisionId,
      reasoning,
      createdAt: new Date()
    });

    // 更新持仓
    await portfolioRepository.updatePositionOnSell(account.id, stock.id, quantity);

    // 更新账户余额
    await aiAccountRepository.updateBalance(account.id, totalValue);

    // 执行交易
    await tradeRepository.executeTrade(trade.id, {
      executedPrice: price,
      executedAt: new Date()
    });

    // 更新账户总价值
    await aiAccountRepository.calculateTotalValue(account.id);

    return {
      success: true,
      code: TradeResultCode.SUCCESS,
      message: '卖出交易执行成功',
      tradeId: trade.id,
      status: 'executed',
      details: {
        action: 'sell',
        symbol: stock.code,
        quantity,
        price,
        totalValue,
        newBalance: parseFloat(account.currentBalance) + totalValue
      }
    };
  }

  /**
   * 执行持有（不交易，只记录决策）
   * @private
   */
  async executeHold(account, stock, reasoning, decisionId) {
    // 创建交易记录（标记为hold）
    const trade = await tradeRepository.createTrade({
      accountId: account.id,
      stockId: stock.id,
      tradeType: 'hold',
      quantity: 0,
      price: 0,
      amount: 0,
      status: 'executed',
      decisionId,
      reasoning,
      createdAt: new Date(),
      executedAt: new Date()
    });

    return {
      success: true,
      code: TradeResultCode.SUCCESS,
      message: '持有决策已记录',
      tradeId: trade.id,
      status: 'executed',
      details: {
        action: 'hold',
        symbol: stock.code
      }
    };
  }

  /**
   * 批量执行决策
   * @param {Array<Object>} decisions - 决策数组
   * @returns {Promise<Object>} 批量执行结果
   */
  async batchExecuteDecisions(decisions) {
    const results = {
      total: decisions.length,
      succeeded: 0,
      failed: 0,
      details: []
    };

    for (const decision of decisions) {
      try {
        const result = await this.executeDecision(decision);
        results.details.push(result);

        if (result.success) {
          results.succeeded++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          success: false,
          code: TradeResultCode.EXECUTION_FAILED,
          message: error.message,
          decisionId: decision.decisionId
        });
      }
    }

    return results;
  }

  /**
   * 获取执行统计
   */
  getStats() {
    return {
      cachedDecisions: this.executedDecisions.size,
      maxCacheSize: this.maxCacheSize
    };
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.executedDecisions.clear();
    console.log('[TradeExecutionService] 决策执行缓存已清空');
  }
}

// 创建单例实例
export const tradeExecutionService = new TradeExecutionService();

export default TradeExecutionService;
