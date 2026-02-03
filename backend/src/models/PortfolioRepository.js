import { BaseRepository } from './BaseRepository.js';

export class PortfolioRepository extends BaseRepository {
  constructor() {
    super();
    this.modelName = 'portfolio';
  }

  /**
   * 获取账户持仓
   * @param {number} accountId - 账户ID
   * @returns {Promise<Array>}
   */
  async getAccountPortfolio(accountId) {
    return this.findMany(
      { accountId },
      { updatedAt: 'desc' },
      undefined,
      {
        stock: true
      }
    );
  }

  /**
   * 获取股票持仓详情
   * @param {number} accountId - 账户ID
   * @param {number} stockId - 股票ID
   * @returns {Promise<Object|null>}
   */
  async getStockPosition(accountId, stockId) {
    return this.findOne(
      { accountId, stockId },
      {
        include: {
          stock: true
        }
      }
    );
  }

  /**
   * 更新持仓（买入）
   * @param {number} accountId - 账户ID
   * @param {number} stockId - 股票ID
   * @param {number} quantity - 买入数量
   * @param {number} price - 买入价格
   * @returns {Promise<Object>}
   */
  async updatePositionOnBuy(accountId, stockId, quantity, price) {
    const existingPosition = await this.getStockPosition(accountId, stockId);

    if (existingPosition) {
      // 更新现有持仓
      const newQuantity = existingPosition.quantity + quantity;
      const totalCost = (existingPosition.avgCost * existingPosition.quantity) + (price * quantity);
      const newAvgCost = totalCost / newQuantity;

      return this.update(
        { id: existingPosition.id },
        {
          quantity: newQuantity,
          avgCost: newAvgCost,
          lastTradedAt: new Date(),
          updatedAt: new Date()
        }
      );
    } else {
      // 创建新持仓
      return this.create({
        accountId,
        stockId,
        quantity,
        avgCost: price,
        firstBoughtAt: new Date(),
        lastTradedAt: new Date()
      });
    }
  }

  /**
   * 更新持仓（卖出）
   * @param {number} accountId - 账户ID
   * @param {number} stockId - 股票ID
   * @param {number} quantity - 卖出数量
   * @returns {Promise<Object>}
   */
  async updatePositionOnSell(accountId, stockId, quantity) {
    const existingPosition = await this.getStockPosition(accountId, stockId);

    if (!existingPosition) {
      throw new Error('持仓不存在');
    }

    if (existingPosition.quantity < quantity) {
      throw new Error('持仓数量不足');
    }

    const newQuantity = existingPosition.quantity - quantity;

    if (newQuantity === 0) {
      // 清仓，删除持仓记录
      return this.delete({ id: existingPosition.id });
    } else {
      // 更新持仓数量，平均成本不变
      return this.update(
        { id: existingPosition.id },
        {
          quantity: newQuantity,
          lastTradedAt: new Date(),
          updatedAt: new Date()
        }
      );
    }
  }

  /**
   * 更新持仓市值和盈亏
   * @param {number} accountId - 账户ID
   * @param {number} stockId - 股票ID
   * @param {number} currentPrice - 当前价格
   * @returns {Promise<Object>}
   */
  async updatePositionValue(accountId, stockId, currentPrice) {
    const position = await this.getStockPosition(accountId, stockId);

    if (!position) {
      throw new Error('持仓不存在');
    }

    const marketValue = currentPrice * position.quantity;
    const profitLoss = marketValue - (position.avgCost * position.quantity);
    const profitLossRate = position.avgCost > 0 ? (profitLoss / (position.avgCost * position.quantity)) * 100 : 0;

    return this.update(
      { id: position.id },
      {
        currentPrice,
        marketValue,
        profitLoss,
        profitLossRate,
        updatedAt: new Date()
      }
    );
  }

  /**
   * 批量更新持仓市值
   * @param {number} accountId - 账户ID
   * @param {Object} priceMap - 股票价格映射 {stockId: currentPrice}
   * @returns {Promise<Array>}
   */
  async batchUpdatePositionValues(accountId, priceMap) {
    const positions = await this.getAccountPortfolio(accountId);

    const updatePromises = positions.map(position => {
      const currentPrice = priceMap[position.stockId];
      if (currentPrice) {
        return this.updatePositionValue(accountId, position.stockId, currentPrice);
      }
      return Promise.resolve(null);
    });

    return Promise.all(updatePromises.filter(p => p !== null));
  }

  /**
   * 计算持仓总市值
   * @param {number} accountId - 账户ID
   * @returns {Promise<number>}
   */
  async calculateTotalMarketValue(accountId) {
    const positions = await this.getAccountPortfolio(accountId);

    return positions.reduce((total, position) => {
      if (position.marketValue) {
        return total + parseFloat(position.marketValue);
      }
      return total;
    }, 0);
  }

  /**
   * 计算持仓总盈亏
   * @param {number} accountId - 账户ID
   * @returns {Promise<{totalProfitLoss: number, totalProfitLossRate: number}>}
   */
  async calculateTotalProfitLoss(accountId) {
    const positions = await this.getAccountPortfolio(accountId);

    let totalCost = 0;
    let totalMarketValue = 0;

    positions.forEach(position => {
      const positionCost = position.avgCost * position.quantity;
      totalCost += positionCost;

      if (position.marketValue) {
        totalMarketValue += parseFloat(position.marketValue);
      } else {
        totalMarketValue += positionCost; // 如果没有市值，使用成本价
      }
    });

    const totalProfitLoss = totalMarketValue - totalCost;
    const totalProfitLossRate = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

    return {
      totalProfitLoss,
      totalProfitLossRate
    };
  }

  /**
   * 获取持仓统计
   * @param {number} accountId - 账户ID
   * @returns {Promise<Object>}
   */
  async getPortfolioStats(accountId) {
    const positions = await this.getAccountPortfolio(accountId);

    const stats = {
      totalPositions: positions.length,
      totalQuantity: 0,
      totalCost: 0,
      totalMarketValue: 0,
      totalProfitLoss: 0,
      byIndustry: {},
      byMarket: {}
    };

    positions.forEach(position => {
      const positionCost = position.avgCost * position.quantity;
      const positionValue = position.marketValue || positionCost;

      stats.totalQuantity += position.quantity;
      stats.totalCost += positionCost;
      stats.totalMarketValue += parseFloat(positionValue);
      stats.totalProfitLoss += (parseFloat(positionValue) - positionCost);

      // 按行业统计
      const industry = position.stock.industry || '未知';
      if (!stats.byIndustry[industry]) {
        stats.byIndustry[industry] = {
          count: 0,
          value: 0,
          weight: 0
        };
      }
      stats.byIndustry[industry].count++;
      stats.byIndustry[industry].value += parseFloat(positionValue);

      // 按市场统计
      const market = position.stock.market;
      if (!stats.byMarket[market]) {
        stats.byMarket[market] = {
          count: 0,
          value: 0,
          weight: 0
        };
      }
      stats.byMarket[market].count++;
      stats.byMarket[market].value += parseFloat(positionValue);
    });

    // 计算权重
    if (stats.totalMarketValue > 0) {
      Object.keys(stats.byIndustry).forEach(industry => {
        stats.byIndustry[industry].weight = (stats.byIndustry[industry].value / stats.totalMarketValue) * 100;
      });

      Object.keys(stats.byMarket).forEach(market => {
        stats.byMarket[market].weight = (stats.byMarket[market].value / stats.totalMarketValue) * 100;
      });
    }

    return stats;
  }

  /**
   * 获取持仓分布
   * @param {number} accountId - 账户ID
   * @returns {Promise<Array>}
   */
  async getPortfolioDistribution(accountId) {
    const positions = await this.getAccountPortfolio(accountId);
    const totalValue = await this.calculateTotalMarketValue(accountId);

    return positions.map(position => {
      const positionValue = position.marketValue || (position.avgCost * position.quantity);
      const weight = totalValue > 0 ? (positionValue / totalValue) * 100 : 0;

      return {
        stock: position.stock,
        quantity: position.quantity,
        avgCost: position.avgCost,
        currentPrice: position.currentPrice,
        marketValue: positionValue,
        profitLoss: position.profitLoss,
        profitLossRate: position.profitLossRate,
        weight
      };
    });
  }

  /**
   * 清空账户持仓
   * @param {number} accountId - 账户ID
   * @returns {Promise<Object>}
   */
  async clearPortfolio(accountId) {
    return this.deleteMany({ accountId });
  }

  /**
   * 获取持仓变化历史
   * @param {number} accountId - 账户ID
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getPortfolioHistory(accountId, options = {}) {
    const { days = 30 } = options;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 这里需要记录持仓快照历史
    // 暂时返回空数组，后续实现
    return [];
  }

  /**
   * 检查持仓风险
   * @param {number} accountId - 账户ID
   * @returns {Promise<{warnings: Array<string>, risks: Array<string>}>}
   */
  async checkPortfolioRisk(accountId) {
    const positions = await this.getAccountPortfolio(accountId);
    const stats = await this.getPortfolioStats(accountId);

    const warnings = [];
    const risks = [];

    // 检查持仓集中度
    if (stats.totalPositions > 0) {
      const maxWeight = Math.max(...Object.values(stats.byIndustry).map(i => i.weight));
      if (maxWeight > 30) {
        warnings.push('行业集中度过高');
      }
      if (maxWeight > 50) {
        risks.push('行业集中度风险');
      }
    }

    // 检查持仓数量
    if (stats.totalPositions > 20) {
      warnings.push('持仓股票数量过多，可能影响管理效率');
    }

    // 检查单只股票权重
    const distribution = await this.getPortfolioDistribution(accountId);
    distribution.forEach(item => {
      if (item.weight > 20) {
        warnings.push(`股票 ${item.stock.code} 权重过高: ${item.weight.toFixed(2)}%`);
      }
      if (item.weight > 30) {
        risks.push(`股票 ${item.stock.code} 权重风险`);
      }
    });

    return {
      warnings,
      risks
    };
  }
}