import { tradeRepository } from '../models/index.js';
import { aiAccountRepository } from '../models/index.js';
import { portfolioRepository } from '../models/index.js';
import { systemLogRepository } from '../models/index.js';
import { virtualTradingService } from '../services/VirtualTradingService.js';
import { asyncHandler, predefinedErrors } from '../utils/responseFormatter.js';

export class TradeController {
  /**
   * 序列化BigInt数据
   * @param {any} data - 要序列化的数据
   * @returns {any} 序列化后的数据
   */
  serializeBigInt(data) {
    if (typeof data === 'bigint') {
      return data.toString();
    } else if (Array.isArray(data)) {
      return data.map(item => this.serializeBigInt(item));
    } else if (data !== null && typeof data === 'object') {
      const result = {};
      for (const key in data) {
        result[key] = this.serializeBigInt(data[key]);
      }
      return result;
    }
    return data;
  }

  /**
   * 获取交易记录
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getTrades(req, res) {
    try {
      const {
        accountId,
        stockCode,
        tradeType,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 20
      } = req.query;

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

      // 构建查询条件
      const filters = {};

      if (accountId) {
        // 验证用户是否有权限访问该账户
        const account = await aiAccountRepository.findOne({ id: parseInt(accountId), userId });
        if (!account) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'AUTH_003',
              message: '权限不足'
            },
            message: '无权访问该账户的交易记录'
          });
        }
        filters.accountId = parseInt(accountId);
      } else {
        // 获取用户的所有账户
        const accounts = await aiAccountRepository.getUserAccounts(userId);
        const accountIds = accounts.map(account => account.id);
        if (accountIds.length === 0) {
          return res.json({
            success: true,
            data: {
              trades: [],
              pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: 0,
                pages: 0
              }
            },
            message: '获取交易记录成功'
          });
        }
        filters.accountId = { in: accountIds };
      }

      if (stockCode) {
        // 需要先查询股票ID
        const stock = await tradeRepository.prisma.stock.findUnique({
          where: { code: stockCode }
        });
        if (stock) {
          filters.stockId = stock.id;
        }
      }

      if (tradeType) {
        filters.tradeType = tradeType;
      }

      if (status) {
        filters.status = status;
      }

      if (startDate || endDate) {
        filters.executedAt = {};
        if (startDate) {
          filters.executedAt.gte = new Date(startDate);
        }
        if (endDate) {
          filters.executedAt.lte = new Date(endDate);
        }
      }

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit)
      };

      const result = await tradeRepository.paginate({
        ...pagination,
        where: filters,
        orderBy: { createdAt: 'desc' },
        include: {
          stock: true,
          account: {
            select: {
              id: true,
              name: true,
              user: {
                select: {
                  id: true,
                  username: true
                }
              }
            }
          }
        }
      });

      // 格式化响应数据
      const formattedTrades = result.data.map(trade => ({
        id: trade.id,
        accountId: trade.accountId,
        accountName: trade.account.name,
        stockCode: trade.stock.code,
        stockName: trade.stock.name,
        tradeType: trade.tradeType,
        orderType: trade.orderType,
        quantity: trade.quantity,
        price: parseFloat(trade.price),
        amount: parseFloat(trade.amount),
        fee: parseFloat(trade.fee),
        netAmount: parseFloat(trade.netAmount),
        status: trade.status,
        reason: trade.reason,
        executedAt: trade.executedAt,
        createdAt: trade.createdAt
      }));

      res.json({
        success: true,
        data: {
          trades: formattedTrades,
          pagination: result.pagination
        },
        message: '获取交易记录成功'
      });
    } catch (error) {
      console.error('获取交易记录控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取交易记录失败，请稍后重试'
      });
    }
  }

  /**
   * 创建交易订单
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   *
   * 注意：根据业务需求，用户不能直接创建交易订单，所有交易必须由AI账户自主执行。
   * 此方法已禁用，如需启用需修改逻辑。
   */
  async createTrade(req, res) {
    try {
      // 根据业务需求，用户不能直接创建交易订单，所有交易必须由AI账户自主执行
      return res.status(403).json({
        success: false,
        error: {
          code: 'TRADE_DISABLED',
          message: '交易功能已禁用'
        },
        message: '用户不能直接创建交易订单，所有交易必须由AI账户自主执行。请通过AI账户进行交易决策。'
      });

      const {
        accountId,
        stockCode,
        tradeType,
        orderType = 'market',
        quantity,
        price,
        reason
      } = req.body;

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

      // 验证必填字段
      if (!accountId || !stockCode || !tradeType || !quantity || !price) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '缺少必要参数'
          },
          message: '账户ID、股票代码、交易类型、数量和价格不能为空'
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

      // 获取股票信息
      const stock = await tradeRepository.prisma.stock.findUnique({
        where: { code: stockCode }
      });
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

      // 验证交易类型
      if (!['buy', 'sell'].includes(tradeType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的交易类型'
          },
          message: '交易类型必须是 buy 或 sell'
        });
      }

      // 验证订单类型
      if (!['market', 'limit', 'stop'].includes(orderType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的订单类型'
          },
          message: '订单类型必须是 market、limit 或 stop'
        });
      }

      // 验证数量
      const quantityNum = parseInt(quantity);
      if (quantityNum <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的交易数量'
          },
          message: '交易数量必须大于0'
        });
      }

      // 验证价格
      const priceNum = parseFloat(price);
      if (priceNum <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的交易价格'
          },
          message: '交易价格必须大于0'
        });
      }

      // 计算交易金额（费用将在执行时由虚拟交易服务计算）
      const amount = priceNum * quantityNum;
      // 费用和净金额将在交易执行时由VirtualTradingService计算
      const fee = 0; // 临时值，执行时会重新计算
      const netAmount = amount; // 临时值，执行时会重新计算

      // 验证交易是否可执行
      const validationResult = await virtualTradingService.validateTradeOrder({
        accountId: parseInt(accountId),
        stockId: stock.id,
        tradeType,
        orderType,
        quantity: quantityNum,
        price: priceNum
      });

      if (!validationResult.valid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TRADING_001',
            message: '交易验证失败'
          },
          message: validationResult.errors.join(', '),
          warnings: validationResult.warnings
        });
      }

      // 创建交易记录
      const tradeData = {
        accountId: parseInt(accountId),
        stockId: stock.id,
        tradeType,
        orderType,
        quantity: quantityNum,
        price: priceNum,
        amount,
        fee,
        netAmount,
        status: 'pending',
        reason: reason || '手动交易'
      };

      const trade = await tradeRepository.createTrade(tradeData);

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        accountId: parseInt(accountId),
        module: 'trade',
        action: 'create',
        message: `创建${tradeType}交易订单: ${stockCode} ${quantityNum}股 @ ${priceNum}`,
        metadata: {
          tradeId: trade.id,
          stockCode,
          quantity: quantityNum,
          price: priceNum,
          amount,
          fee
        }
      });

      // 如果是市价单，立即执行
      // 暂时注释掉，先让交易创建成功
      // if (orderType === 'market') {
      //   await this.executeTrade(trade.id);
      // }

      res.status(201).json({
        success: true,
        data: {
          trade: {
            id: trade.id,
            accountId: trade.accountId,
            stockCode,
            stockName: stock.name,
            tradeType,
            orderType,
            quantity: quantityNum,
            price: priceNum,
            amount,
            fee,
            netAmount,
            status: trade.status,
            reason: trade.reason,
            createdAt: trade.createdAt
          }
        },
        message: '创建交易订单成功'
      });
    } catch (error) {
      console.error('创建交易订单控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '创建交易订单失败，请稍后重试'
      });
    }
  }

  /**
   * 执行交易
   * @param {number} tradeId - 交易ID
   */
  async executeTrade(tradeId) {
    try {
      // 使用虚拟交易服务执行交易
      const executionResult = await virtualTradingService.executeTradeOrder(tradeId);

      // 记录系统日志
      const trade = await tradeRepository.findOne(
        { id: tradeId },
        {
          account: true,
          stock: true
        }
      );

      if (trade) {
        await systemLogRepository.logUserActivity({
          userId: trade.account.userId,
          accountId: trade.accountId,
          module: 'trade',
          action: 'execute',
          message: `执行${trade.tradeType}交易: ${trade.stock.code} ${trade.quantity}股 @ ${trade.price}`,
          metadata: {
            tradeId,
            stockCode: trade.stock.code,
            quantity: trade.quantity,
            price: parseFloat(trade.price),
            amount: parseFloat(trade.amount),
            executionResult
          }
        });
      }

      return executionResult;
    } catch (error) {
      console.error('执行交易错误:', error);

      // 记录失败日志
      try {
        const trade = await tradeRepository.findOne(
          { id: tradeId },
          {
            account: true
          }
        );

        if (trade) {
          await systemLogRepository.logUserActivity({
            userId: trade.account.userId,
            accountId: trade.accountId,
            module: 'trade',
            action: 'execute_failed',
            message: `执行交易失败: ${error.message}`,
            metadata: {
              tradeId,
              error: error.message
            }
          });
        }
      } catch (logError) {
        console.error('记录执行失败日志错误:', logError);
      }

      throw error;
    }
  }

  /**
   * 获取交易详情
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getTradeDetail(req, res) {
    try {
      const { tradeId } = req.params;
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

      // 验证tradeId是否为有效数字
      const tradeIdNum = parseInt(tradeId);
      if (isNaN(tradeIdNum) || tradeIdNum <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_001',
            message: '交易ID无效'
          },
          message: '交易ID必须为有效的正整数'
        });
      }

      const trade = await tradeRepository.findOne(
        { id: tradeIdNum },
        {
          stock: true,
          account: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true
                }
              }
            }
          },
          decisionLogs: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          }
        }
      );

      if (!trade) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: '交易不存在'
          },
          message: '交易记录不存在'
        });
      }

      // 验证权限
      if (trade.account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权查看该交易详情'
        });
      }

      const formattedTrade = {
        id: trade.id,
        accountId: trade.accountId,
        accountName: trade.account.name,
        stockCode: trade.stock.code,
        stockName: trade.stock.name,
        tradeType: trade.tradeType,
        orderType: trade.orderType,
        quantity: trade.quantity,
        price: parseFloat(trade.price),
        amount: parseFloat(trade.amount),
        fee: parseFloat(trade.fee),
        netAmount: parseFloat(trade.netAmount),
        status: trade.status,
        reason: trade.reason,
        executedAt: trade.executedAt,
        cancelledAt: trade.cancelledAt,
        createdAt: trade.createdAt,
        updatedAt: trade.updatedAt,
        decisionLogs: trade.decisionLogs.map(log => ({
          id: log.id,
          decisionType: log.decisionType,
          reasoning: log.reasoning,
          confidence: parseFloat(log.confidence),
          riskLevel: log.riskLevel,
          createdAt: log.createdAt
        }))
      };

      res.json({
        success: true,
        data: {
          trade: formattedTrade
        },
        message: '获取交易详情成功'
      });
    } catch (error) {
      console.error('获取交易详情控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取交易详情失败，请稍后重试'
      });
    }
  }

  /**
   * 取消交易订单
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   *
   * 注意：根据业务需求，用户不能直接取消交易订单，所有交易操作必须由AI账户自主执行。
   * 此方法已禁用，如需启用需修改逻辑。
   */
  async cancelTrade(req, res) {
    try {
      // 根据业务需求，用户不能直接取消交易订单，所有交易操作必须由AI账户自主执行
      return res.status(403).json({
        success: false,
        error: {
          code: 'TRADE_DISABLED',
          message: '交易取消功能已禁用'
        },
        message: '用户不能直接取消交易订单，所有交易操作必须由AI账户自主执行。'
      });

      const { tradeId } = req.params;
      const { reason = '用户取消' } = req.body;
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

      const trade = await tradeRepository.findOne(
        { id: parseInt(tradeId) },
        {
          account: true
        }
      );

      if (!trade) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: '交易不存在'
          },
          message: '交易记录不存在'
        });
      }

      // 验证权限
      if (trade.account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权取消该交易'
        });
      }

      // 验证交易状态
      if (trade.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TRADING_003',
            message: '交易状态不可取消'
          },
          message: `交易状态为 ${trade.status}，无法取消`
        });
      }

      // 取消交易
      await tradeRepository.cancelTrade(parseInt(tradeId), reason);

      // 记录系统日志
      await systemLogRepository.logUserActivity({
        userId,
        accountId: trade.accountId,
        module: 'trade',
        action: 'cancel',
        message: `取消交易订单: ${tradeId}`,
        metadata: {
          tradeId: parseInt(tradeId),
          reason
        }
      });

      res.json({
        success: true,
        data: null,
        message: '取消交易订单成功'
      });
    } catch (error) {
      console.error('取消交易订单控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '取消交易订单失败，请稍后重试'
      });
    }
  }

  /**
   * 执行交易订单
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   *
   * 注意：根据业务需求，用户不能直接执行交易订单，所有交易必须由AI账户自主执行。
   * 此方法主要供AI服务调用，用于执行AI决策产生的交易。
   */
  async executeTrade(req, res) {
    try {
      const { tradeId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '用户未认证'
          },
          message: '请先登录'
        });
      }

      // 检查交易是否存在且属于当前用户
      const trade = await tradeRepository.findOne(
        { id: parseInt(tradeId) },
        {
          account: true
        }
      );

      if (!trade) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '交易不存在'
          },
          message: '找不到指定的交易'
        });
      }

      // 检查权限：交易必须属于当前用户
      if (trade.account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '无权执行此交易'
          },
          message: '您无权执行此交易'
        });
      }

      // 检查交易状态
      if (trade.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: '交易状态不可执行'
          },
          message: `交易状态为${trade.status}，无法执行`
        });
      }

      // 执行交易
      const executionResult = await virtualTradingService.executeTradeOrder(parseInt(tradeId));

      return res.status(200).json({
        success: true,
        data: {
          tradeId: parseInt(tradeId),
          executionResult
        },
        message: '交易执行成功'
      });
    } catch (error) {
      console.error('执行交易控制器错误:', error);

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '执行交易时发生错误'
        },
        message: error.message || '执行交易失败',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * 获取交易统计
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getTradeStats(req, res) {
    try {
      const { accountId, startDate, endDate } = req.query;
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
      }

      const options = {};
      if (startDate) options.startDate = new Date(startDate);
      if (endDate) options.endDate = new Date(endDate);

      const performance = await tradeRepository.getTradePerformance(
        targetAccountId,
        options
      );

      // 获取今日统计
      const todayStats = await tradeRepository.getTodayTradeStats(
        targetAccountId
      );

      // 获取交易趋势
      const trendStats = await tradeRepository.getTradeTrendStats({
        days: 30,
        accountId: targetAccountId
      });

      // 序列化BigInt数据
      const serializedData = {
        performance: this.serializeBigInt(performance),
        todayStats: this.serializeBigInt(todayStats),
        trendStats: this.serializeBigInt(trendStats),
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: serializedData,
        message: '获取交易统计成功'
      });
    } catch (error) {
      console.error('获取交易统计控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取交易统计失败，请稍后重试'
      });
    }
  }

  /**
   * 获取热门交易股票
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getHotTradingStocks(req, res) {
    try {
      const { days = 7, limit = 10 } = req.query;

      const hotStocks = await tradeRepository.getHotTradingStocks({
        days: parseInt(days),
        limit: parseInt(limit)
      });

      const formattedStocks = hotStocks.map(item => ({
        stock: {
          code: item.stock.code,
          name: item.stock.name,
          market: item.stock.market,
          industry: item.stock.industry
        },
        tradeCount: item.tradeCount,
        totalQuantity: item.totalQuantity,
        totalAmount: parseFloat(item.totalAmount)
      }));

      res.json({
        success: true,
        data: {
          hotStocks: formattedStocks,
          period: `${days}天`,
          timestamp: new Date().toISOString()
        },
        message: '获取热门交易股票成功'
      });
    } catch (error) {
      console.error('获取热门交易股票控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取热门交易股票失败，请稍后重试'
      });
    }
  }

  /**
   * 计算交易费用
   * @param {number} amount - 交易金额
   * @returns {number} 交易费用
   */
  calculateFee(amount) {
    // 简化费用计算：0.1% 的交易费，最低1元
    const fee = amount * 0.001;
    return Math.max(fee, 1);
  }
}

// 创建控制器实例
export const tradeController = new TradeController();