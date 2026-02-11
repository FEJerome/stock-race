/**
 * [T-015] TradingRulesEngine
 * 交易规则引擎
 *
 * 职责:
 * - 管理各市场类型交易规则（主板/创业板/科创板/北交所）
 * - 计算涨跌停价格
 * - 验证交易数量和时间
 * - 处理特殊规则（ST/停牌/新股）
 */

class TradingRulesEngine {
  constructor() {
    // 市场基础规则
    this.marketRules = {
      'SH': {  // 上海主板
        priceLimit: 0.10,
        minQuantity: 100,
        maxQuantityPerOrder: 1000000,
        tradingHours: [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' }
        ]
      },
      'SZ': {  // 深圳主板
        priceLimit: 0.10,
        minQuantity: 100,
        maxQuantityPerOrder: 1000000,
        tradingHours: [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' }
        ]
      },
      'CYB': {  // 创业板
        priceLimit: 0.20,
        minQuantity: 100,
        maxQuantityPerOrder: 1000000,
        tradingHours: [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' }
        ]
      },
      'KCB': {  // 科创板
        priceLimit: 0.20,
        minQuantity: 200,
        maxQuantityPerOrder: 1000000,
        tradingHours: [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' }
        ]
      },
      'BJ': {  // 北交所
        priceLimit: 0.30,
        minQuantity: 100,
        maxQuantityPerOrder: 1000000,
        tradingHours: [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' }
        ]
      }
    };

    // 特殊规则
    this.specialRules = {
      'ST': { priceLimit: 0.05 },
      'STAR': { priceLimit: null },  // 新股首日无限制
      'SUSPENDED': { tradable: false }
    };

    // 默认规则
    this.defaultRules = {
      priceLimit: 0.10,
      minQuantity: 100,
      maxQuantityPerOrder: 1000000,
      tradingHours: [
        { start: '09:30', end: '11:30' },
        { start: '13:00', end: '15:00' }
      ]
    };
  }

  /**
   * 获取市场规则
   * @param {string} market - 市场代码
   * @returns {Object} 市场规则
   */
  getMarketRules(market) {
    return this.marketRules[market] || this.defaultRules;
  }

  /**
   * 获取特殊规则
   * @param {string} type - 特殊类型
   * @returns {Object} 特殊规则
   */
  getSpecialRules(type) {
    return this.specialRules[type] || {};
  }

  /**
   * 获取生效的交易限制（综合市场和特殊规则）
   * @param {Object} stockState - 股票状态
   * @returns {Object} 生效规则
   */
  getEffectiveRules(stockState) {
    const { market = 'SH', isST = false, isSuspended = false, isFirstDay = false } = stockState;

    // 基础市场规则
    let rules = { ...this.getMarketRules(market) };

    // 应用特殊规则
    if (isSuspended) {
      const suspendedRules = this.getSpecialRules('SUSPENDED');
      rules = { ...rules, ...suspendedRules };
    } else if (isFirstDay) {
      const starRules = this.getSpecialRules('STAR');
      rules = { ...rules, ...starRules };
    } else if (isST) {
      const stRules = this.getSpecialRules('ST');
      rules = { ...rules, ...stRules };
    }

    return rules;
  }

  /**
   * 计算涨跌停价格
   * @param {number} lastPrice - 昨收价/最新价
   * @param {string} market - 市场代码
   * @param {Object} options - 选项 { isST, isFirstDay }
   * @returns {Object} { upper, lower }
   */
  calculatePriceLimits(lastPrice, market, options = {}) {
    const { isST = false, isFirstDay = false } = options;

    // 新股首日无涨跌幅限制
    if (isFirstDay) {
      return { upper: null, lower: null };
    }

    // 获取涨跌幅限制比例
    let limitRatio;
    if (isST) {
      limitRatio = 0.05;
    } else {
      limitRatio = this.getMarketRules(market).priceLimit;
    }

    // 计算涨停价和跌停价（四舍五入到分）
    const upper = this._roundToCents(lastPrice * (1 + limitRatio));
    const lower = this._roundToCents(lastPrice * (1 - limitRatio));

    return { upper, lower };
  }

  /**
   * 验证交易数量
   * @param {number} quantity - 交易数量
   * @param {string} market - 市场代码
   * @param {Object} options - 选项
   * @returns {Object} { valid, error }
   */
  validateQuantity(quantity, market, options = {}) {
    const rules = this.getMarketRules(market);

    // 检查最小数量
    if (quantity < rules.minQuantity) {
      return {
        valid: false,
        error: `交易数量不足${rules.minQuantity}股`
      };
    }

    // 科创板特殊规则：200股起，递增100股
    if (market === 'KCB') {
      if (quantity < 200) {
        return {
          valid: false,
          error: '科创板最小交易单位为200股'
        };
      }
      if ((quantity - 200) % 100 !== 0) {
        return {
          valid: false,
          error: '科创板交易数量应为200股或200+100n股'
        };
      }
    } else {
      // 其他市场必须是100的整数倍
      if (quantity % 100 !== 0) {
        return {
          valid: false,
          error: '交易数量必须是100的整数倍'
        };
      }
    }

    // 检查最大数量
    if (quantity > rules.maxQuantityPerOrder) {
      return {
        valid: false,
        error: `单笔交易数量不能超过${rules.maxQuantityPerOrder}股`
      };
    }

    return { valid: true };
  }

  /**
   * 验证交易时间
   * @param {string} time - 时间字符串 (HH:mm)
   * @param {string} market - 市场代码
   * @returns {Object} { valid, phase, error }
   */
  validateTradingTime(time, market = 'SH') {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;

    // 集合竞价时间：9:15-9:25
    if (totalMinutes >= 555 && totalMinutes <= 565) { // 9:15-9:25
      return { valid: true, phase: 'auction' };
    }

    // 9:25-9:30 不接受委托
    if (totalMinutes > 565 && totalMinutes < 570) {
      return { valid: false, phase: 'closed', error: '集合竞价结束至开盘前不接受委托' };
    }

    // 上午交易时间：9:30-11:30
    if (totalMinutes >= 570 && totalMinutes <= 690) {
      return { valid: true, phase: 'continuous' };
    }

    // 午休时间
    if (totalMinutes > 690 && totalMinutes < 780) {
      return { valid: false, phase: 'closed', error: '午休时间' };
    }

    // 下午交易时间：13:00-15:00
    if (totalMinutes >= 780 && totalMinutes <= 900) {
      return { valid: true, phase: 'continuous' };
    }

    return { valid: false, phase: 'closed', error: '非交易时间' };
  }

  /**
   * 获取交易限制（综合校验）
   * @param {Object} stockState - 股票状态
   * @returns {Object} 交易限制
   */
  getTradingRestrictions(stockState) {
    const rules = this.getEffectiveRules(stockState);

    // 停牌检查
    if (rules.tradable === false) {
      return {
        tradable: false,
        reason: '股票已停牌'
      };
    }

    // 计算价格限制
    const priceLimits = this.calculatePriceLimits(
      stockState.lastPrice || 0,
      stockState.market,
      {
        isST: stockState.isST,
        isFirstDay: stockState.isFirstDay
      }
    );

    return {
      tradable: true,
      priceLimits,
      minQuantity: rules.minQuantity,
      maxQuantityPerOrder: rules.maxQuantityPerOrder
    };
  }

  /**
   * 四舍五入到分
   * @private
   */
  _roundToCents(price) {
    return Math.round(price * 100) / 100;
  }
}

export { TradingRulesEngine };
export default TradingRulesEngine;
