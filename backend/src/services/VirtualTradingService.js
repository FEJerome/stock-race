import { tradeRepository } from '../models/index.js';
import { aiAccountRepository } from '../models/index.js';
import { portfolioRepository } from '../models/index.js';
import { dataService } from './DataService.js';
import { webSocketService } from './WebSocketService.js';

export class VirtualTradingService {
  constructor() {
    // 交易规则配置
    this.tradingRules = {
      minTradeAmount: 100, // 最小交易金额
      maxTradeAmount: 1000000, // 最大交易金额
      minStockPrice: 0.01, // 最小股票价格
      maxStockPrice: 10000, // 最大股票价格
      tradingHours: {
        start: '09:30',
        end: '15:00'
      },
      tPlusOne: true, // T+1交易规则
      priceLimit: 0.1, // 价格涨跌幅限制（10%）
      commissionRate: 0.001, // 佣金费率（0.1%）
      minCommission: 1, // 最低佣金
      stampDutyRate: 0.001, // 印花税率（0.1%，卖出时收取）
      transferFee: 0.002 // 过户费（0.02%）
    };
  }

  /**
   * 验证交易订单
   * @param {Object} tradeData - 交易数据
   * @returns {Promise<Object>} 验证结果
   */
  async validateTradeOrder(tradeData) {
    const errors = [];
    const warnings = [];

    const {
      accountId,
      stockId,
      tradeType,
      orderType,
      quantity,
      price
    } = tradeData;

    // 1. 基本验证
    if (!accountId) errors.push('账户ID不能为空');
    if (!stockId) errors.push('股票ID不能为空');
    if (!tradeType || !['buy', 'sell'].includes(tradeType)) errors.push('无效的交易类型');
    if (!orderType || !['market', 'limit', 'stop'].includes(orderType)) errors.push('无效的订单类型');
    if (!quantity || quantity <= 0) errors.push('交易数量必须大于0');
    if (!price || price <= 0) errors.push('交易价格必须大于0');

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // 2. 获取账户信息
    const account = await aiAccountRepository.findOne({ id: accountId });
    if (!account) {
      errors.push('账户不存在');
      return { valid: false, errors, warnings };
    }

    // 3. 获取股票信息
    const stock = await tradeRepository.prisma.stock.findUnique({
      where: { id: stockId }
    });
    if (!stock) {
      errors.push('股票不存在');
      return { valid: false, errors, warnings };
    }

    // 4. 检查账户状态
    if (account.status !== 'active') {
      errors.push('账户未激活');
    }

    // 5. 检查股票状态
    if (stock.status !== 'normal') {
      errors.push('股票不可交易');
    }

    // 6. 检查交易时间
    if (!this.isTradingTime()) {
      errors.push('非交易时间');
      warnings.push('订单将在交易时间执行');
    }

    // 7. 计算交易金额
    const amount = price * quantity;
    const commission = this.calculateCommission(amount);
    const totalCost = amount + commission;

    // 8. 买入验证
    if (tradeType === 'buy') {
      // 检查账户余额
      if (parseFloat(account.currentBalance) < totalCost) {
        errors.push(`账户余额不足，需要 ${totalCost.toFixed(2)}，当前余额 ${parseFloat(account.currentBalance).toFixed(2)}`);
      }

      // 检查最小交易金额
      if (amount < this.tradingRules.minTradeAmount) {
        errors.push(`交易金额不能小于 ${this.tradingRules.minTradeAmount}`);
      }

      // 检查最大交易金额
      if (amount > this.tradingRules.maxTradeAmount) {
        errors.push(`交易金额不能大于 ${this.tradingRules.maxTradeAmount}`);
      }

      // 检查价格限制
      if (!this.isValidPrice(price, stock.code)) {
        warnings.push('交易价格可能超出涨跌幅限制');
      }
    }

    // 9. 卖出验证
    if (tradeType === 'sell') {
      // 检查持仓
      const position = await portfolioRepository.findOne({
        accountId,
        stockId
      });

      if (!position || position.quantity < quantity) {
        errors.push(`持仓不足，当前持仓 ${position ? position.quantity : 0} 股`);
      }

      // 检查T+1规则
      if (this.tradingRules.tPlusOne) {
        const recentBuys = await tradeRepository.findMany({
          accountId,
          stockId,
          tradeType: 'buy',
          status: 'executed',
          executedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24小时内
          }
        });

        const totalRecentBuys = recentBuys.reduce((sum, trade) => sum + trade.quantity, 0);
        if (totalRecentBuys > 0) {
          warnings.push('部分持仓受T+1规则限制，今日买入的股票需次日才能卖出');
        }
      }
    }

    // 10. 市价单特殊验证
    if (orderType === 'market') {
      // 获取实时价格
      try {
        const realtimeData = await dataService.getRealtimeData(stock.code);
        const currentPrice = realtimeData.price;

        if (tradeType === 'buy' && price < currentPrice * 0.9) {
          warnings.push('买入价格低于当前市价10%，可能无法成交');
        }

        if (tradeType === 'sell' && price > currentPrice * 1.1) {
          warnings.push('卖出价格高于当前市价10%，可能无法成交');
        }
      } catch (error) {
        warnings.push('无法获取实时价格，市价单风险增加');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      validationData: {
        account,
        stock,
        amount,
        commission,
        totalCost,
        currentBalance: parseFloat(account.currentBalance)
      }
    };
  }

  /**
   * 执行交易订单
   * @param {number} tradeId - 交易ID
   * @returns {Promise<Object>} 执行结果
   */
  async executeTradeOrder(tradeId) {
    try {
      const trade = await tradeRepository.findOne(
        { id: tradeId },
        {
          include: {
            account: true,
            stock: true
          }
        }
      );

      if (!trade || trade.status !== 'pending') {
        throw new Error('交易不存在或不可执行');
      }

      // 再次验证交易
      const validation = await this.validateTradeOrder({
        accountId: trade.accountId,
        stockId: trade.stockId,
        tradeType: trade.tradeType,
        orderType: trade.orderType,
        quantity: trade.quantity,
        price: parseFloat(trade.price)
      });

      if (!validation.valid) {
        throw new Error(`交易验证失败: ${validation.errors.join(', ')}`);
      }

      // 执行交易
      let executionResult;

      if (trade.tradeType === 'buy') {
        executionResult = await this.executeBuyOrder(trade, validation.validationData);
      } else {
        executionResult = await this.executeSellOrder(trade, validation.validationData);
      }

      // 更新交易状态
      await tradeRepository.executeTrade(tradeId, {
        executedAt: new Date(),
        executionPrice: executionResult.executionPrice,
        actualAmount: executionResult.actualAmount,
        actualFee: executionResult.actualFee
      });

      // 更新账户总价值
      await aiAccountRepository.calculateTotalValue(trade.accountId);

      // 广播交易通知
      webSocketService.broadcastTradeNotification({
        accountId: trade.accountId,
        stockCode: trade.stock.code,
        tradeType: trade.tradeType,
        quantity: trade.quantity,
        price: executionResult.executionPrice,
        amount: executionResult.actualAmount
      });

      return {
        success: true,
        tradeId,
        executionResult,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('执行交易订单错误:', error);

      // 更新交易状态为拒绝
      await tradeRepository.update(tradeId, {
        status: 'rejected',
        reason: error.message
      });

      throw error;
    }
  }

  /**
   * 执行买入订单
   * @param {Object} trade - 交易数据
   * @param {Object} validationData - 验证数据
   * @returns {Promise<Object>} 执行结果
   */
  async executeBuyOrder(trade, validationData) {
    const { amount, commission, totalCost } = validationData;

    // 1. 扣除账户余额
    await aiAccountRepository.updateBalance(trade.accountId, -totalCost);

    // 2. 获取执行价格（考虑市价单）
    const executionPrice = await this.getExecutionPrice(
      trade.stock.code,
      parseFloat(trade.price),
      trade.orderType,
      'buy'
    );

    // 3. 计算实际金额和费用
    const actualAmount = executionPrice * trade.quantity;
    const actualCommission = this.calculateCommission(actualAmount);
    const actualTotalCost = actualAmount + actualCommission;

    // 4. 调整账户余额（如果实际金额与预期不同）
    const balanceAdjustment = totalCost - actualTotalCost;
    if (balanceAdjustment !== 0) {
      await aiAccountRepository.updateBalance(trade.accountId, balanceAdjustment);
    }

    // 5. 更新持仓
    await portfolioRepository.updatePositionOnBuy(
      trade.accountId,
      trade.stockId,
      trade.quantity,
      executionPrice
    );

    return {
      executionPrice,
      actualAmount,
      actualFee: actualCommission,
      balanceAdjustment
    };
  }

  /**
   * 执行卖出订单
   * @param {Object} trade - 交易数据
   * @param {Object} validationData - 验证数据
   * @returns {Promise<Object>} 执行结果
   */
  async executeSellOrder(trade, validationData) {
    const { amount, commission } = validationData;

    // 1. 获取执行价格（考虑市价单）
    const executionPrice = await this.getExecutionPrice(
      trade.stock.code,
      parseFloat(trade.price),
      trade.orderType,
      'sell'
    );

    // 2. 计算实际金额和费用
    const actualAmount = executionPrice * trade.quantity;
    const actualCommission = this.calculateCommission(actualAmount);
    const stampDuty = this.calculateStampDuty(actualAmount);
    const totalFee = actualCommission + stampDuty;
    const netAmount = actualAmount - totalFee;

    // 3. 增加账户余额
    await aiAccountRepository.updateBalance(trade.accountId, netAmount);

    // 4. 更新持仓
    await portfolioRepository.updatePositionOnSell(
      trade.accountId,
      trade.stockId,
      trade.quantity
    );

    return {
      executionPrice,
      actualAmount,
      actualFee: totalFee,
      commission: actualCommission,
      stampDuty,
      netAmount
    };
  }

  /**
   * 获取执行价格
   * @param {string} stockCode - 股票代码
   * @param {number} orderPrice - 订单价格
   * @param {string} orderType - 订单类型
   * @param {string} tradeType - 交易类型
   * @returns {Promise<number>} 执行价格
   */
  async getExecutionPrice(stockCode, orderPrice, orderType, tradeType) {
    if (orderType === 'market') {
      // 市价单：使用当前实时价格
      try {
        const realtimeData = await dataService.getRealtimeData(stockCode);
        const currentPrice = realtimeData.price;

        // 应用价格限制
        const priceLimit = this.tradingRules.priceLimit;
        const maxPrice = currentPrice * (1 + priceLimit);
        const minPrice = currentPrice * (1 - priceLimit);

        if (tradeType === 'buy') {
          // 买入：取当前价格和订单价格的较高者（但不超过涨停价）
          return Math.min(Math.max(currentPrice, orderPrice), maxPrice);
        } else {
          // 卖出：取当前价格和订单价格的较低者（但不低于跌停价）
          return Math.max(Math.min(currentPrice, orderPrice), minPrice);
        }
      } catch (error) {
        console.error('获取实时价格失败，使用订单价格:', error);
        return orderPrice;
      }
    } else {
      // 限价单和止损单：使用订单价格
      return orderPrice;
    }
  }

  /**
   * 计算佣金
   * @param {number} amount - 交易金额
   * @returns {number} 佣金
   */
  calculateCommission(amount) {
    const commission = amount * this.tradingRules.commissionRate;
    return Math.max(commission, this.tradingRules.minCommission);
  }

  /**
   * 计算印花税
   * @param {number} amount - 交易金额
   * @returns {number} 印花税
   */
  calculateStampDuty(amount) {
    // 印花税只在卖出时收取
    return amount * this.tradingRules.stampDutyRate;
  }

  /**
   * 计算过户费
   * @param {number} amount - 交易金额
   * @returns {number} 过户费
   */
  calculateTransferFee(amount) {
    return amount * this.tradingRules.transferFee;
  }

  /**
   * 检查是否为交易时间
   * @returns {boolean} 是否为交易时间
   */
  isTradingTime() {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = this.tradingRules.tradingHours.start.split(':').map(Number);
    const [endHour, endMinute] = this.tradingRules.tradingHours.end.split(':').map(Number);

    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * 检查价格是否有效
   * @param {number} price - 价格
   * @param {string} stockCode - 股票代码
   * @returns {boolean} 价格是否有效
   */
  async isValidPrice(price, stockCode) {
    try {
      const realtimeData = await dataService.getRealtimeData(stockCode);
      const currentPrice = realtimeData.price;
      const priceLimit = this.tradingRules.priceLimit;

      const maxPrice = currentPrice * (1 + priceLimit);
      const minPrice = currentPrice * (1 - priceLimit);

      return price >= minPrice && price <= maxPrice;
    } catch (error) {
      console.error('检查价格有效性失败:', error);
      return true; // 如果无法获取实时价格，假设价格有效
    }
  }

  /**
   * 获取交易规则
   * @returns {Object} 交易规则
   */
  getTradingRules() {
    return this.tradingRules;
  }

  /**
   * 更新交易规则
   * @param {Object} newRules - 新规则
   */
  updateTradingRules(newRules) {
    this.tradingRules = {
      ...this.tradingRules,
      ...newRules
    };
  }

  /**
   * 模拟市场波动
   * @param {number} basePrice - 基础价格
   * @param {number} volatility - 波动率
   * @returns {number} 模拟价格
   */
  simulateMarketPrice(basePrice, volatility = 0.02) {
    // 简单的随机游走模型
    const randomChange = (Math.random() * 2 - 1) * volatility;
    return basePrice * (1 + randomChange);
  }

  /**
   * 批量执行待处理订单
   * @returns {Promise<Array>} 执行结果
   */
  async executePendingOrders() {
    const pendingOrders = await tradeRepository.findMany({
      status: 'pending',
      orderType: 'market' // 只执行市价单
    });

    const results = [];

    for (const order of pendingOrders) {
      try {
        if (this.isTradingTime()) {
          const result = await this.executeTradeOrder(order.id);
          results.push({
            tradeId: order.id,
            success: true,
            result
          });
        } else {
          results.push({
            tradeId: order.id,
            success: false,
            reason: '非交易时间'
          });
        }
      } catch (error) {
        results.push({
          tradeId: order.id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }
}

// 创建单例实例
export const virtualTradingService = new VirtualTradingService();