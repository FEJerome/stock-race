/**
 * [T-015] TradeValidator
 * 交易校验器
 *
 * 职责:
 * - 综合校验交易决策
 * - 价格限制校验
 * - 资金/持仓校验
 * - 市场状态校验
 */

import { TradingRulesEngine } from './TradingRulesEngine.js';

class TradeValidator {
  constructor(options = {}) {
    this.rulesEngine = options.rulesEngine || new TradingRulesEngine();
    this.stockStateCache = options.stockStateCache;
    this.portfolioService = options.portfolioService;
  }

  /**
   * 校验交易决策
   * @param {Object} decision - 交易决策 { action, symbol, quantity, price }
   * @param {string} accountId - AI账户ID
   * @returns {Promise<Object>} { valid, errors, warnings }
   */
  async validateTrade(decision, accountId) {
    const errors = [];
    const warnings = [];

    const { action, symbol, quantity, price } = decision;

    // 1. 获取股票状态
    const stockState = await this._getStockState(symbol);
    if (!stockState) {
      return {
        valid: false,
        errors: ['无法获取股票状态'],
        warnings
      };
    }

    // 2. 获取交易限制
    const restrictions = this.rulesEngine.getTradingRestrictions(stockState);

    if (!restrictions.tradable) {
      return {
        valid: false,
        errors: [restrictions.reason || '该股票当前不可交易'],
        warnings
      };
    }

    // 3. 校验交易数量
    const quantityValidation = this.rulesEngine.validateQuantity(
      quantity,
      stockState.market,
      { isST: stockState.isST }
    );
    if (!quantityValidation.valid) {
      errors.push(quantityValidation.error);
    }

    // 4. 校验价格限制
    if (price && restrictions.priceLimits) {
      const { upper, lower } = restrictions.priceLimits;

      if (upper !== null && price > upper) {
        if (action === 'buy') {
          errors.push(`买入价格超出涨停限制（最高${upper}元）`);
        } else if (action === 'sell') {
          warnings.push('卖出价格高于涨停价，可能无法成交');
        }
      }

      if (lower !== null && price < lower) {
        if (action === 'sell') {
          errors.push(`卖出价格低于跌停限制（最低${lower}元）`);
        } else if (action === 'buy') {
          warnings.push('买入价格低于跌停价，可能无法成交');
        }
      }
    }

    // 5. 根据操作类型进行特定校验
    if (action === 'buy') {
      const buyValidation = await this._validateBuy(decision, accountId, price * quantity);
      errors.push(...buyValidation.errors);
      warnings.push(...buyValidation.warnings);
    } else if (action === 'sell') {
      const sellValidation = await this._validateSell(decision, accountId);
      errors.push(...sellValidation.errors);
      warnings.push(...sellValidation.warnings);
    } else if (action === 'hold') {
      // 持仓决策无需额外校验
    } else {
      errors.push(`未知的操作类型: ${action}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 校验买入操作
   * @private
   */
  async _validateBuy(decision, accountId, totalAmount) {
    const errors = [];
    const warnings = [];

    // 检查资金余额
    if (this.portfolioService) {
      const balance = await this.portfolioService.getBalance(accountId);
      if (balance < totalAmount) {
        errors.push(`资金不足，需要${totalAmount.toFixed(2)}元，当前余额${balance.toFixed(2)}元`);
      } else if (balance < totalAmount * 1.1) {
        warnings.push('买入后资金余额将低于10%');
      }
    }

    return { errors, warnings };
  }

  /**
   * 校验卖出操作
   * @private
   */
  async _validateSell(decision, accountId) {
    const errors = [];
    const warnings = [];
    const { symbol, quantity } = decision;

    // 检查持仓
    if (this.portfolioService) {
      const position = await this.portfolioService.getPosition(accountId, symbol);

      if (!position) {
        errors.push(`未持有该股票: ${symbol}`);
      } else if (position.quantity < quantity) {
        errors.push(`持仓不足，持有${position.quantity}股，尝试卖出${quantity}股`);
      } else if (position.quantity === quantity) {
        warnings.push('将清仓该股票');
      }
    }

    return { errors, warnings };
  }

  /**
   * 获取股票状态
   * @private
   */
  async _getStockState(symbol) {
    if (this.stockStateCache) {
      return await this.stockStateCache.getStockState(symbol);
    }

    // 如果没有缓存服务，返回默认状态
    // 实际应用中应该从market-data-service获取
    return {
      symbol,
      market: this._inferMarket(symbol),
      isST: symbol.startsWith('ST'),
      isSuspended: false,
      isFirstDay: false,
      lastPrice: 0
    };
  }

  /**
   * 根据股票代码推断市场
   * @private
   */
  _inferMarket(symbol) {
    const code = symbol.replace(/\D/g, '');
    const prefix = symbol.replace(/\d/g, '');

    if (prefix === 'sh' || code.startsWith('6')) {
      return 'SH';
    } else if (prefix === 'sz' || code.startsWith('0') || code.startsWith('3')) {
      return code.startsWith('3') ? 'CYB' : 'SZ';
    } else if (code.startsWith('68')) {
      return 'KCB';
    } else if (code.startsWith('8') || code.startsWith('4')) {
      return 'BJ';
    }

    return 'SZ'; // 默认
  }
}

export { TradeValidator };
export default TradeValidator;
