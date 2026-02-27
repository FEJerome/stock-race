import { portfolioRepository } from '../models/index.js';
import { aiAccountRepository } from '../models/index.js';
import { stockRepository } from '../models/index.js';
import { systemLogRepository } from '../models/index.js';

export class PortfolioController {
  /**
   * 获取持仓列表
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getPortfolios(req, res) {
    try {
      const { accountId } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      let targetAccountId = null;
      if (accountId) {
        // 验证账户权限
        const account = await aiAccountRepository.findOne({
          id: parseInt(accountId),
          userId
        });
        if (!account) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'AUTH_003',
              message: '权限不足'
            },
            message: '无权访问该账户的持仓信息'
          });
        }
        targetAccountId = parseInt(accountId);
      } else {
        // 获取用户的所有账户
        const accounts = await aiAccountRepository.getUserAccounts(userId);
        if (accounts.length === 0) {
          return res.json({
            success: true,
            data: {
              portfolio: [],
              summary: {
                totalValue: 0,
                totalCost: 0,
                totalProfitLoss: 0,
                totalProfitLossRate: 0,
                cashBalance: 0,
                stockValue: 0
              }
            },
            message: '获取持仓信息成功'
          });
        }
        // 暂时只返回第一个账户的持仓，后续可以支持多账户合并视图
        targetAccountId = accounts[0].id;
      }

      // 获取持仓列表
      const positions = await portfolioRepository.getAccountPortfolio(targetAccountId);

      // 获取账户信息
      const account = await aiAccountRepository.findOne({ id: targetAccountId });

      // 计算汇总信息
      const summary = await this.calculatePortfolioSummary(targetAccountId, positions, account);

      // 格式化持仓数据
      const formattedPortfolio = positions.map(position => {
        const marketValue = position.marketValue || (position.avgCost * position.quantity);
        const profitLoss = position.profitLoss || (marketValue - (position.avgCost * position.quantity));
        const profitLossRate = position.profitLossRate ||
          (position.avgCost > 0 ? (profitLoss / (position.avgCost * position.quantity)) * 100 : 0);

        return {
          stockCode: position.stock.code,
          stockName: position.stock.name,
          quantity: position.quantity,
          avgCost: parseFloat(position.avgCost),
          currentPrice: parseFloat(position.currentPrice),
          marketValue: parseFloat(marketValue),
          profitLoss: parseFloat(profitLoss),
          profitLossRate: parseFloat(profitLossRate),
          weight: summary.totalValue > 0 ? (parseFloat(marketValue) / summary.totalValue) * 100 : 0,
          firstBoughtAt: position.firstBoughtAt,
          lastTradedAt: position.lastTradedAt
        };
      });

      // 按权重排序
      formattedPortfolio.sort((a, b) => b.weight - a.weight);

      res.json({
        success: true,
        data: {
          portfolio: formattedPortfolio,
          summary
        },
        message: '获取持仓信息成功'
      });
    } catch (error) {
      console.error('获取持仓列表控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取持仓信息失败，请稍后重试'
      });
    }
  }

  /**
   * 获取持仓详情
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getPortfolioDetail(req, res) {
    try {
      const { stockCode } = req.params;
      const { accountId } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 获取股票信息
      const stock = await stockRepository.findOne({ code: stockCode });
      if (!stock) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: '股票不存在'
          },
          message: `股票 ${stockCode} 不存在`
        });
      }

      let targetAccountId = null;
      if (accountId) {
        // 验证账户权限
        const account = await aiAccountRepository.findOne({
          id: parseInt(accountId),
          userId
        });
        if (!account) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'AUTH_003',
              message: '权限不足'
            },
            message: '无权访问该账户的持仓信息'
          });
        }
        targetAccountId = parseInt(accountId);
      } else {
        // 获取用户的所有账户
        const accounts = await aiAccountRepository.getUserAccounts(userId);
        if (accounts.length === 0) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'NOT_FOUND_001',
              message: '未找到持仓'
            },
            message: '未持有该股票'
          });
        }
        // 暂时只检查第一个账户，后续可以支持多账户
        targetAccountId = accounts[0].id;
      }

      // 获取持仓详情
      const position = await portfolioRepository.getStockPosition(targetAccountId, stock.id);

      if (!position) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: '未找到持仓'
          },
          message: '未持有该股票'
        });
      }

      // 获取账户信息
      const account = await aiAccountRepository.findOne({ id: targetAccountId });

      // 获取股票交易历史
      const trades = await portfolioRepository.prisma.trade.findMany({
        where: {
          accountId: targetAccountId,
          stockId: stock.id,
          status: 'executed'
        },
        orderBy: { executedAt: 'desc' },
        take: 20
      });

      // 获取持仓变化历史
      const positionHistory = await this.getPositionHistory(targetAccountId, stock.id);

      // 计算持仓统计
      const positionStats = await this.calculatePositionStats(position, account);

      const formattedPosition = {
        stock: {
          code: stock.code,
          name: stock.name,
          market: stock.market,
          industry: stock.industry
        },
        position: {
          quantity: position.quantity,
          avgCost: parseFloat(position.avgCost),
          currentPrice: parseFloat(position.currentPrice),
          marketValue: parseFloat(position.marketValue),
          profitLoss: parseFloat(position.profitLoss),
          profitLossRate: parseFloat(position.profitLossRate),
          firstBoughtAt: position.firstBoughtAt,
          lastTradedAt: position.lastTradedAt
        },
        account: {
          id: account.id,
          name: account.name,
          totalValue: parseFloat(account.totalValue),
          currentBalance: parseFloat(account.currentBalance)
        },
        stats: positionStats,
        tradeHistory: trades.map(trade => ({
          id: trade.id,
          tradeType: trade.tradeType,
          quantity: trade.quantity,
          price: parseFloat(trade.price),
          amount: parseFloat(trade.amount),
          executedAt: trade.executedAt
        })),
        positionHistory,
        riskAnalysis: await portfolioRepository.checkPortfolioRisk(targetAccountId)
      };

      res.json({
        success: true,
        data: {
          position: formattedPosition
        },
        message: '获取持仓详情成功'
      });
    } catch (error) {
      console.error('获取持仓详情控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取持仓详情失败，请稍后重试'
      });
    }
  }

  /**
   * 获取持仓统计
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getPortfolioStats(req, res) {
    try {
      const { accountId } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      let targetAccountId = null;
      if (accountId) {
        // 验证账户权限
        const account = await aiAccountRepository.findOne({
          id: parseInt(accountId),
          userId
        });
        if (!account) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'AUTH_003',
              message: '权限不足'
            },
            message: '无权访问该账户的统计信息'
          });
        }
        targetAccountId = parseInt(accountId);
      } else {
        // 获取用户的所有账户
        const accounts = await aiAccountRepository.getUserAccounts(userId);
        if (accounts.length === 0) {
          return res.json({
            success: true,
            data: {
              stats: {
                totalPositions: 0,
                totalQuantity: 0,
                totalCost: 0,
                totalMarketValue: 0,
                totalProfitLoss: 0,
                byIndustry: {},
                byMarket: {}
              },
              distribution: [],
              riskAnalysis: {
                warnings: [],
                risks: []
              }
            },
            message: '获取持仓统计成功'
          });
        }
        targetAccountId = accounts[0].id;
      }

      // 获取持仓统计
      const stats = await portfolioRepository.getPortfolioStats(targetAccountId);

      // 获取持仓分布
      const distribution = await portfolioRepository.getPortfolioDistribution(targetAccountId);

      // 获取风险分析
      const riskAnalysis = await portfolioRepository.checkPortfolioRisk(targetAccountId);

      // 获取账户信息
      const account = await aiAccountRepository.findOne({ id: targetAccountId });

      // 计算收益率
      const totalReturn = account.initialBalance > 0
        ? ((parseFloat(account.totalValue) - parseFloat(account.initialBalance)) / parseFloat(account.initialBalance)) * 100
        : 0;

      res.json({
        success: true,
        data: {
          stats,
          distribution,
          riskAnalysis,
          account: {
            id: account.id,
            name: account.name,
            initialBalance: parseFloat(account.initialBalance),
            currentBalance: parseFloat(account.currentBalance),
            totalValue: parseFloat(account.totalValue),
            totalReturn: parseFloat(totalReturn.toFixed(2))
          },
          timestamp: new Date().toISOString()
        },
        message: '获取持仓统计成功'
      });
    } catch (error) {
      console.error('获取持仓统计控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取持仓统计失败，请稍后重试'
      });
    }
  }

  /**
   * 更新持仓市值
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async updatePortfolioValues(req, res) {
    try {
      const { accountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 验证账户权限
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId),
        userId
      });
      if (!account) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权操作该账户'
        });
      }

      // 获取持仓列表
      const positions = await portfolioRepository.getAccountPortfolio(parseInt(accountId));

      if (positions.length === 0) {
        return res.json({
          success: true,
          data: {
            updatedCount: 0,
            message: '没有需要更新的持仓'
          },
          message: '更新持仓市值完成'
        });
      }

      // 获取股票实时价格
      const stockCodes = positions.map(p => p.stock.code);
      const priceMap = await this.getStockPrices(stockCodes);

      // 批量更新持仓市值
      const updatePromises = positions.map(position => {
        const currentPrice = priceMap[position.stock.code];
        if (currentPrice) {
          return portfolioRepository.updatePositionValue(
            parseInt(accountId),
            position.stockId,
            currentPrice
          );
        }
        return Promise.resolve(null);
      });

      const results = await Promise.all(updatePromises.filter(p => p !== null));
      const updatedCount = results.filter(r => r !== null).length;

      // 更新账户总价值
      await aiAccountRepository.calculateTotalValue(parseInt(accountId));

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        accountId: parseInt(accountId),
        module: 'portfolio',
        action: 'update_values',
        message: `更新持仓市值: ${updatedCount} 只股票`,
        metadata: {
          updatedCount,
          stockCount: positions.length
        }
      });

      res.json({
        success: true,
        data: {
          updatedCount,
          totalPositions: positions.length,
          message: `成功更新 ${updatedCount}/${positions.length} 只股票的市值`
        },
        message: '更新持仓市值成功'
      });
    } catch (error) {
      console.error('更新持仓市值控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '更新持仓市值失败，请稍后重试'
      });
    }
  }

  /**
   * 清空持仓
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async clearPortfolio(req, res) {
    try {
      const { accountId, confirm = false } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      if (!confirm) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '需要确认操作'
          },
          message: '请确认要清空持仓，此操作不可撤销'
        });
      }

      // 验证账户权限
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId),
        userId
      });
      if (!account) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权操作该账户'
        });
      }

      // 检查是否有未完成交易
      const pendingTrades = await portfolioRepository.prisma.trade.count({
        where: {
          accountId: parseInt(accountId),
          status: 'pending'
        }
      });

      if (pendingTrades > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '有未完成交易'
          },
          message: '请先完成所有未完成交易后再清空持仓'
        });
      }

      // 获取当前持仓
      const positions = await portfolioRepository.getAccountPortfolio(parseInt(accountId));
      const positionCount = positions.length;

      if (positionCount === 0) {
        return res.json({
          success: true,
          data: {
            clearedCount: 0,
            message: '持仓已为空'
          },
          message: '清空持仓完成'
        });
      }

      // 记录清空前信息
      const portfolioValue = await portfolioRepository.calculateTotalMarketValue(parseInt(accountId));

      // 清空持仓
      await portfolioRepository.clearPortfolio(parseInt(accountId));

      // 更新账户余额（将持仓市值转为现金）
      await aiAccountRepository.updateBalance(parseInt(accountId), portfolioValue);

      // 更新账户总价值
      await aiAccountRepository.calculateTotalValue(parseInt(accountId));

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        accountId: parseInt(accountId),
        module: 'portfolio',
        action: 'clear',
        message: `清空持仓: ${positionCount} 只股票，市值 ${portfolioValue.toFixed(2)}`,
        metadata: {
          positionCount,
          portfolioValue,
          previousBalance: parseFloat(account.currentBalance),
          newBalance: parseFloat(account.currentBalance) + portfolioValue
        }
      });

      res.json({
        success: true,
        data: {
          clearedCount: positionCount,
          portfolioValue,
          message: `成功清空 ${positionCount} 只股票，市值 ${portfolioValue.toFixed(2)} 已转为现金`
        },
        message: '清空持仓成功'
      });
    } catch (error) {
      console.error('清空持仓控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '清空持仓失败，请稍后重试'
      });
    }
  }

  /**
   * 获取持仓历史
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getPortfolioHistory(req, res) {
    try {
      const { accountId, days = 30 } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      let targetAccountId = null;
      if (accountId) {
        // 验证账户权限
        const account = await aiAccountRepository.findOne({
          id: parseInt(accountId),
          userId
        });
        if (!account) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'AUTH_003',
              message: '权限不足'
            },
            message: '无权访问该账户的历史数据'
          });
        }
        targetAccountId = parseInt(accountId);
      } else {
        // 获取用户的所有账户
        const accounts = await aiAccountRepository.getUserAccounts(userId);
        if (accounts.length === 0) {
          return res.json({
            success: true,
            data: {
              history: [],
              account: null
            },
            message: '获取持仓历史成功'
          });
        }
        targetAccountId = accounts[0].id;
      }

      // 获取持仓历史
      const history = await portfolioRepository.getPortfolioHistory(targetAccountId, {
        days: parseInt(days)
      });

      // 获取账户信息
      const account = await aiAccountRepository.findOne({ id: targetAccountId });

      // 如果没有历史记录，从交易记录中重建
      if (history.length === 0) {
        const reconstructedHistory = await this.reconstructPortfolioHistory(targetAccountId, parseInt(days));
        history.push(...reconstructedHistory);
      }

      res.json({
        success: true,
        data: {
          history,
          account: {
            id: account.id,
            name: account.name
          },
          period: `${days}天`,
          timestamp: new Date().toISOString()
        },
        message: '获取持仓历史成功'
      });
    } catch (error) {
      console.error('获取持仓历史控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取持仓历史失败，请稍后重试'
      });
    }
  }

  /**
   * 计算持仓汇总信息
   * @param {number} accountId - 账户ID
   * @param {Array} positions - 持仓列表
   * @param {Object} account - 账户信息
   * @returns {Promise<Object>} 汇总信息
   */
  async calculatePortfolioSummary(accountId, positions, account) {
    // 计算持仓总市值
    const stockValue = await portfolioRepository.calculateTotalMarketValue(accountId);

    // 计算持仓总盈亏
    const { totalProfitLoss, totalProfitLossRate } = await portfolioRepository.calculateTotalProfitLoss(accountId);

    // 计算总成本
    const totalCost = positions.reduce((sum, position) => {
      return sum + (position.avgCost * position.quantity);
    }, 0);

    return {
      totalValue: parseFloat(account.totalValue),
      totalCost: parseFloat(totalCost.toFixed(2)),
      totalProfitLoss: parseFloat(totalProfitLoss.toFixed(2)),
      totalProfitLossRate: parseFloat(totalProfitLossRate.toFixed(2)),
      cashBalance: parseFloat(account.currentBalance),
      stockValue: parseFloat(stockValue.toFixed(2)),
      cashPercentage: parseFloat(account.totalValue) > 0
        ? (parseFloat(account.currentBalance) / parseFloat(account.totalValue)) * 100
        : 0,
      stockPercentage: parseFloat(account.totalValue) > 0
        ? (stockValue / parseFloat(account.totalValue)) * 100
        : 0
    };
  }

  /**
   * 获取股票价格
   * @param {Array<string>} stockCodes - 股票代码数组
   * @returns {Promise<Object>} 价格映射
   */
  async getStockPrices(stockCodes) {
    try {
      // 这里应该调用数据服务获取实时价格
      // 暂时返回模拟数据
      const priceMap = {};
      stockCodes.forEach(code => {
        priceMap[code] = 10 + Math.random() * 20; // 模拟价格
      });
      return priceMap;
    } catch (error) {
      console.error('获取股票价格错误:', error);
      return {};
    }
  }

  /**
   * 获取持仓历史
   * @param {number} accountId - 账户ID
   * @param {number} stockId - 股票ID
   * @returns {Promise<Array>} 持仓历史
   */
  async getPositionHistory(accountId, stockId) {
    try {
      // 从交易记录中重建持仓变化历史
      const trades = await portfolioRepository.prisma.trade.findMany({
        where: {
          accountId,
          stockId,
          status: 'executed'
        },
        orderBy: { executedAt: 'asc' }
      });

      const history = [];
      let currentQuantity = 0;
      let totalCost = 0;

      trades.forEach(trade => {
        if (trade.tradeType === 'buy') {
          currentQuantity += trade.quantity;
          totalCost += parseFloat(trade.price) * trade.quantity;
        } else {
          currentQuantity -= trade.quantity;
          // 卖出时按平均成本计算成本减少
          const avgCost = totalCost / currentQuantity;
          totalCost -= avgCost * trade.quantity;
        }

        history.push({
          date: trade.executedAt,
          tradeType: trade.tradeType,
          quantity: trade.quantity,
          price: parseFloat(trade.price),
          currentQuantity,
          avgCost: currentQuantity > 0 ? totalCost / currentQuantity : 0
        });
      });

      return history;
    } catch (error) {
      console.error('获取持仓历史错误:', error);
      return [];
    }
  }

  /**
   * 计算持仓统计
   * @param {Object} position - 持仓信息
   * @param {Object} account - 账户信息
   * @returns {Promise<Object>} 持仓统计
   */
  async calculatePositionStats(position, account) {
    const positionValue = position.marketValue || (position.avgCost * position.quantity);
    const positionCost = position.avgCost * position.quantity;
    const profitLoss = position.profitLoss || (positionValue - positionCost);
    const profitLossRate = position.profitLossRate ||
      (positionCost > 0 ? (profitLoss / positionCost) * 100 : 0);

    return {
      positionValue: parseFloat(positionValue.toFixed(2)),
      positionCost: parseFloat(positionCost.toFixed(2)),
      profitLoss: parseFloat(profitLoss.toFixed(2)),
      profitLossRate: parseFloat(profitLossRate.toFixed(2)),
      weight: parseFloat(account.totalValue) > 0
        ? (positionValue / parseFloat(account.totalValue)) * 100
        : 0,
      holdingDays: position.firstBoughtAt
        ? Math.floor((new Date() - new Date(position.firstBoughtAt)) / (1000 * 60 * 60 * 24))
        : 0
    };
  }

  /**
   * 重建持仓历史
   * @param {number} accountId - 账户ID
   * @param {number} days - 天数
   * @returns {Promise<Array>} 重建的历史记录
   */
  async reconstructPortfolioHistory(accountId, days) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // 获取期间内的交易记录
      const trades = await portfolioRepository.prisma.trade.findMany({
        where: {
          accountId,
          executedAt: {
            gte: startDate,
            lte: endDate
          },
          status: 'executed'
        },
        orderBy: { executedAt: 'asc' }
      });

      // 按日期分组
      const dailyTrades = {};
      trades.forEach(trade => {
        const date = trade.executedAt.toISOString().split('T')[0];
        if (!dailyTrades[date]) {
          dailyTrades[date] = [];
        }
        dailyTrades[date].push(trade);
      });

      // 重建每日持仓快照
      const history = [];
      const date = new Date(startDate);
      let currentPortfolio = {};

      while (date <= endDate) {
        const dateStr = date.toISOString().split('T')[0];

        // 应用当日的交易
        if (dailyTrades[dateStr]) {
          dailyTrades[dateStr].forEach(trade => {
            const stockId = trade.stockId;
            if (!currentPortfolio[stockId]) {
              currentPortfolio[stockId] = {
                quantity: 0,
                totalCost: 0
              };
            }

            if (trade.tradeType === 'buy') {
              currentPortfolio[stockId].quantity += trade.quantity;
              currentPortfolio[stockId].totalCost += parseFloat(trade.price) * trade.quantity;
            } else {
              currentPortfolio[stockId].quantity -= trade.quantity;
              // 简化处理：按平均成本计算
              const avgCost = currentPortfolio[stockId].totalCost / currentPortfolio[stockId].quantity;
              currentPortfolio[stockId].totalCost -= avgCost * trade.quantity;
            }
          });
        }

        // 计算当日持仓价值
        const positions = Object.keys(currentPortfolio)
          .filter(stockId => currentPortfolio[stockId].quantity > 0)
          .map(stockId => ({
            stockId: parseInt(stockId),
            quantity: currentPortfolio[stockId].quantity,
            avgCost: currentPortfolio[stockId].totalCost / currentPortfolio[stockId].quantity
          }));

        // 获取股票价格计算市值
        let totalValue = 0;
        for (const position of positions) {
          // 这里应该获取当日价格，暂时使用平均成本
          totalValue += position.avgCost * position.quantity;
        }

        history.push({
          date: dateStr,
          positionCount: positions.length,
          totalValue: parseFloat(totalValue.toFixed(2)),
          positions: positions.map(p => ({
            stockId: p.stockId,
            quantity: p.quantity,
            avgCost: parseFloat(p.avgCost.toFixed(4))
          }))
        });

        date.setDate(date.getDate() + 1);
      }

      return history;
    } catch (error) {
      console.error('重建持仓历史错误:', error);
      return [];
    }
  }

  /**
   * 获取风险分析
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getRiskAnalysis(req, res) {
    try {
      const { accountId } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      let targetAccountId = null;
      if (accountId) {
        const account = await aiAccountRepository.findOne({
          id: parseInt(accountId),
          userId
        });
        if (!account) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'AUTH_003',
              message: '权限不足'
            },
            message: '无权访问该账户的风险分析'
          });
        }
        targetAccountId = parseInt(accountId);
      } else {
        const accounts = await aiAccountRepository.getUserAccounts(userId);
        if (accounts.length === 0) {
          return res.json({
            success: true,
            data: {
              riskLevel: 'low',
              riskScore: 0,
              warnings: [],
              suggestions: [],
              diversification: {
                industry: { score: 100, status: 'good' },
                market: { score: 100, status: 'good' }
              }
            },
            message: '获取风险分析成功'
          });
        }
        targetAccountId = accounts[0].id;
      }

      const riskAnalysis = await portfolioRepository.checkPortfolioRisk(targetAccountId);

      res.json({
        success: true,
        data: {
          ...riskAnalysis,
          timestamp: new Date().toISOString()
        },
        message: '获取风险分析成功'
      });
    } catch (error) {
      console.error('获取风险分析控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取风险分析失败，请稍后重试'
      });
    }
  }

  /**
   * 重新平衡持仓
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async rebalancePortfolio(req, res) {
    try {
      const { accountId, targetAllocation, rebalanceMethod = 'proportional' } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      if (!accountId || !targetAllocation) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '缺少必要参数'
          },
          message: '请提供账户ID和目标配置'
        });
      }

      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId),
        userId
      });

      if (!account) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权操作该账户'
        });
      }

      // 模拟重新平衡逻辑
      res.json({
        success: true,
        data: {
          accountId: parseInt(accountId),
          rebalanceMethod,
          targetAllocation,
          status: 'pending',
          message: '重新平衡请求已提交'
        },
        message: '重新平衡请求已提交'
      });
    } catch (error) {
      console.error('重新平衡持仓控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '重新平衡持仓失败，请稍后重试'
      });
    }
  }

  /**
   * 更新持仓市值（别名方法，兼容路由）
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async updateMarketValues(req, res) {
    return this.updatePortfolioValues(req, res);
  }
}

// 创建控制器实例
export const portfolioController = new PortfolioController();