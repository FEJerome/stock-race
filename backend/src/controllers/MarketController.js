import { rankingRepository } from '../models/index.js';
import { aiAccountRepository } from '../models/index.js';
import { stockRepository } from '../models/index.js';
import { tradeRepository } from '../models/index.js';
import WeightedHotStocksService from '../services/WeightedHotStocksService.js';
import { createClient } from 'redis';

// 初始化加权热股票服务
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);
const weightedHotStocksService = new WeightedHotStocksService(redisClient);

// 启动定时更新任务 (B-006)
// 注意: 需要在应用启动时调用 startScheduledUpdates
export function startHotStocksScheduler(interval = 30000) {
  console.log('[MarketController] 启动热股票定时更新任务...');
  weightedHotStocksService.startScheduledUpdates(interval);
}

// 停止定时更新任务
export function stopHotStocksScheduler() {
  console.log('[MarketController] 停止热股票定时更新任务...');
  weightedHotStocksService.stopScheduledUpdates();
}

// 设置活动追踪器 (用于B-005)
export function setActivityTracker(activityTracker) {
  weightedHotStocksService.setActivityTracker(activityTracker);
}

export class MarketController {
  /**
   * 获取排行榜
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getRankings(req, res) {
    try {
      const {
        period = 'total',
        date,
        metric = 'return',
        page = 1,
        limit = 20
      } = req.query;

      const userId = req.user?.id;

      // 验证周期类型
      const validPeriods = ['daily', 'weekly', 'monthly', 'total'];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的统计周期'
          },
          message: `统计周期必须是: ${validPeriods.join(', ')}`
        });
      }

      // 验证排名指标
      const validMetrics = ['return', 'sharpe', 'winRate'];
      if (!validMetrics.includes(metric)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '无效的排名指标'
          },
          message: `排名指标必须是: ${validMetrics.join(', ')}`
        });
      }

      // 确定统计日期
      let targetDate = new Date();
      if (date) {
        targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: '无效的日期格式'
            },
            message: '日期格式不正确，请使用 YYYY-MM-DD 格式'
          });
        }
      }

      // 根据周期调整日期
      if (period === 'daily') {
        targetDate.setHours(0, 0, 0, 0);
      } else if (period === 'weekly') {
        // 设置为本周一
        const day = targetDate.getDay();
        const diff = targetDate.getDate() - day + (day === 0 ? -6 : 1);
        targetDate.setDate(diff);
        targetDate.setHours(0, 0, 0, 0);
      } else if (period === 'monthly') {
        // 设置为本月第一天
        targetDate.setDate(1);
        targetDate.setHours(0, 0, 0, 0);
      }

      // 获取排行榜数据
      const rankings = await rankingRepository.getRankings(
        period,
        targetDate,
        parseInt(limit),
        metric
      );

      // 格式化排行榜数据
      const formattedRankings = rankings.map(item => ({
        rank: item.rank,
        accountId: item.accountId,
        accountName: item.account.name,
        userName: item.account.user.username,
        totalReturn: parseFloat(item.totalReturn),
        annualizedReturn: parseFloat(item.annualizedReturn),
        sharpeRatio: parseFloat(item.sharpeRatio),
        maxDrawdown: parseFloat(item.maxDrawdown),
        winRate: parseFloat(item.winRate),
        profitFactor: parseFloat(item.profitFactor),
        totalTrades: item.totalTrades,
        totalVolume: parseFloat(item.totalVolume),
        modelType: item.account.modelType,
        riskLevel: item.account.riskLevel
      }));

      // 获取当前用户的排名（如果已登录）
      let myRanking = null;
      if (userId) {
        const userAccounts = await aiAccountRepository.getUserAccounts(userId);
        const accountIds = userAccounts.map(account => account.id);

        if (accountIds.length > 0) {
          const userRankings = rankings.filter(item => accountIds.includes(item.accountId));
          if (userRankings.length > 0) {
            // 取最佳排名
            const bestRanking = userRankings.reduce((best, current) =>
              current.rank < best.rank ? current : best
            );

            myRanking = {
              rank: bestRanking.rank,
              accountId: bestRanking.accountId,
              accountName: bestRanking.account.name,
              totalReturn: parseFloat(bestRanking.totalReturn),
              annualizedReturn: parseFloat(bestRanking.annualizedReturn),
              sharpeRatio: parseFloat(bestRanking.sharpeRatio),
              maxDrawdown: parseFloat(bestRanking.maxDrawdown),
              winRate: parseFloat(bestRanking.winRate),
              totalTrades: bestRanking.totalTrades,
              totalVolume: parseFloat(bestRanking.totalVolume)
            };
          }
        }
      }

      // 分页处理
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedRankings = formattedRankings.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          period,
          date: targetDate.toISOString().split('T')[0],
          metric,
          rankings: paginatedRankings,
          myRanking,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: formattedRankings.length,
            pages: Math.ceil(formattedRankings.length / parseInt(limit))
          }
        },
        message: '获取排行榜成功'
      });
    } catch (error) {
      console.error('获取排行榜控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取排行榜失败，请稍后重试'
      });
    }
  }

  /**
   * 获取市场数据
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getMarketData(req, res) {
    try {
      const { market } = req.query;

      // 获取市场统计
      const marketStats = await this.getMarketStatistics(market);

      // 获取热门股票
      const hotStocks = await tradeRepository.getHotTradingStocks({
        days: 7,
        limit: 10
      });

      // 获取涨跌榜
      const gainersLosers = await this.getGainersAndLosers(market);

      // 获取交易统计
      const tradeStats = await this.getTradeStatistics();

      // 获取AI账户统计
      const aiStats = await aiAccountRepository.getActiveAccountStats();

      res.json({
        success: true,
        data: {
          market: market || '全部',
          marketStats,
          hotStocks: hotStocks.map(item => ({
            stock: {
              code: item.stock.code,
              name: item.stock.name,
              market: item.stock.market,
              industry: item.stock.industry
            },
            tradeCount: item.tradeCount,
            totalQuantity: item.totalQuantity,
            totalAmount: parseFloat(item.totalAmount)
          })),
          gainersLosers,
          tradeStats,
          aiStats,
          timestamp: new Date().toISOString()
        },
        message: '获取市场数据成功'
      });
    } catch (error) {
      console.error('获取市场数据控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取市场数据失败，请稍后重试'
      });
    }
  }

  /**
   * 获取竞赛信息
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getCompetitionInfo(req, res) {
    try {
      const { competitionId } = req.params;

      // 获取竞赛基本信息
      const competitionInfo = await this.getCompetitionDetails(competitionId);

      // 获取竞赛排行榜
      const rankings = await rankingRepository.getCompetitionRankings(competitionId);

      // 获取竞赛规则
      const rules = this.getCompetitionRules(competitionId);

      // 获取竞赛时间表
      const schedule = this.getCompetitionSchedule(competitionId);

      // 获取参赛者统计
      const participantStats = await this.getParticipantStatistics(competitionId);

      res.json({
        success: true,
        data: {
          competition: competitionInfo,
          rankings: rankings.map(item => ({
            rank: item.rank,
            accountId: item.accountId,
            accountName: item.account.name,
            userName: item.account.user.username,
            totalReturn: parseFloat(item.totalReturn),
            totalTrades: item.totalTrades,
            joinDate: item.joinDate
          })),
          rules,
          schedule,
          participantStats,
          timestamp: new Date().toISOString()
        },
        message: '获取竞赛信息成功'
      });
    } catch (error) {
      console.error('获取竞赛信息控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取竞赛信息失败，请稍后重试'
      });
    }
  }

  /**
   * 获取市场公告
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getMarketAnnouncements(req, res) {
    try {
      const { type, limit = 20 } = req.query;

      // 获取市场公告
      const announcements = await this.getAnnouncements(type, parseInt(limit));

      // 获取重要通知
      const importantNotices = await this.getImportantNotices();

      res.json({
        success: true,
        data: {
          announcements: announcements.map(announcement => ({
            id: announcement.id,
            type: announcement.type,
            title: announcement.title,
            content: announcement.content,
            priority: announcement.priority,
            publishedAt: announcement.publishedAt,
            expiresAt: announcement.expiresAt
          })),
          importantNotices: importantNotices.map(notice => ({
            id: notice.id,
            title: notice.title,
            message: notice.message,
            type: notice.type,
            timestamp: notice.timestamp
          })),
          timestamp: new Date().toISOString()
        },
        message: '获取市场公告成功'
      });
    } catch (error) {
      console.error('获取市场公告控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取市场公告失败，请稍后重试'
      });
    }
  }

  /**
   * 获取市场趋势
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getMarketTrends(req, res) {
    try {
      const { days = 30, market } = req.query;

      // 获取市场指数趋势
      const indexTrends = await this.getIndexTrends(market, parseInt(days));

      // 获取行业表现
      const sectorPerformance = await this.getSectorPerformance(market);

      // 获取资金流向
      const capitalFlows = await this.getCapitalFlows(market);

      // 获取市场情绪
      const marketSentiment = await this.getMarketSentiment();

      res.json({
        success: true,
        data: {
          period: `${days}天`,
          market: market || '全部',
          indexTrends,
          sectorPerformance,
          capitalFlows,
          marketSentiment,
          timestamp: new Date().toISOString()
        },
        message: '获取市场趋势成功'
      });
    } catch (error) {
      console.error('获取市场趋势控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取市场趋势失败，请稍后重试'
      });
    }
  }

  /**
   * 获取交易大厅数据
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getTradingHallData(req, res) {
    try {
      // 获取实时交易数据
      const realtimeTrades = await this.getRealtimeTrades();

      // 获取大单交易
      const blockTrades = await this.getBlockTrades();

      // 获取资金异动
      const capitalChanges = await this.getCapitalChanges();

      // 获取市场热度
      const marketHeat = await this.getMarketHeat();

      res.json({
        success: true,
        data: {
          realtimeTrades: realtimeTrades.map(trade => ({
            time: trade.time,
            stockCode: trade.stockCode,
            stockName: trade.stockName,
            tradeType: trade.tradeType,
            quantity: trade.quantity,
            price: parseFloat(trade.price),
            amount: parseFloat(trade.amount)
          })),
          blockTrades: blockTrades.map(trade => ({
            stockCode: trade.stockCode,
            stockName: trade.stockName,
            quantity: trade.quantity,
            price: parseFloat(trade.price),
            amount: parseFloat(trade.amount),
            time: trade.time
          })),
          capitalChanges: capitalChanges.map(change => ({
            stockCode: change.stockCode,
            stockName: change.stockName,
            changeType: change.changeType,
            amount: parseFloat(change.amount),
            percentage: parseFloat(change.percentage)
          })),
          marketHeat,
          timestamp: new Date().toISOString()
        },
        message: '获取交易大厅数据成功'
      });
    } catch (error) {
      console.error('获取交易大厅数据控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取交易大厅数据失败，请稍后重试'
      });
    }
  }

  /**
   * 获取市场统计
   * @param {string} market - 市场代码
   * @returns {Promise<Object>} 市场统计
   */
  async getMarketStatistics(market) {
    try {
      const where = {};
      if (market) {
        where.market = market;
      }

      // 获取股票总数
      const totalStocks = await stockRepository.count(where);

      // 获取交易股票数
      const tradingStocks = await stockRepository.count({
        ...where,
        status: 'normal'
      });

      // 获取涨跌统计
      const priceStats = {
        up: Math.floor(Math.random() * 1000), // 模拟数据
        down: Math.floor(Math.random() * 800),
        unchanged: Math.floor(Math.random() * 200),
        limitUp: Math.floor(Math.random() * 50),
        limitDown: Math.floor(Math.random() * 30)
      };

      // 获取交易额统计
      const tradeStats = await tradeRepository.getTradeTrendStats({
        days: 1,
        accountId: null
      });

      const todayVolume = tradeStats.reduce((sum, stat) => sum + parseFloat(stat.total_volume), 0);

      return {
        totalStocks,
        tradingStocks,
        suspendedStocks: totalStocks - tradingStocks,
        priceStats: {
          ...priceStats,
          total: priceStats.up + priceStats.down + priceStats.unchanged
        },
        todayVolume: parseFloat(todayVolume.toFixed(2)),
        marketCap: 45000000000000, // 模拟总市值
        turnoverRate: 1.23 // 模拟换手率
      };
    } catch (error) {
      console.error('获取市场统计错误:', error);
      return {
        totalStocks: 0,
        tradingStocks: 0,
        suspendedStocks: 0,
        priceStats: {
          up: 0,
          down: 0,
          unchanged: 0,
          limitUp: 0,
          limitDown: 0,
          total: 0
        },
        todayVolume: 0,
        marketCap: 0,
        turnoverRate: 0
      };
    }
  }

  /**
   * 获取涨跌榜
   * @param {string} market - 市场代码
   * @returns {Promise<Object>} 涨跌榜
   */
  async getGainersAndLosers(market) {
    try {
      // 获取股票列表
      const where = {};
      if (market) {
        where.market = market;
      }

      const stocks = await stockRepository.findMany(
        where,
        { code: 'asc' },
        100 // 限制数量
      );

      // 模拟价格变化
      const stocksWithChanges = stocks.map(stock => ({
        code: stock.code,
        name: stock.name,
        price: 10 + Math.random() * 20,
        change: (Math.random() * 10 - 5),
        changePercent: (Math.random() * 20 - 10)
      }));

      // 排序
      const gainers = [...stocksWithChanges]
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 10);

      const losers = [...stocksWithChanges]
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 10);

      return {
        gainers: gainers.map(stock => ({
          ...stock,
          price: parseFloat(stock.price.toFixed(2)),
          change: parseFloat(stock.change.toFixed(2)),
          changePercent: parseFloat(stock.changePercent.toFixed(2))
        })),
        losers: losers.map(stock => ({
          ...stock,
          price: parseFloat(stock.price.toFixed(2)),
          change: parseFloat(stock.change.toFixed(2)),
          changePercent: parseFloat(stock.changePercent.toFixed(2))
        }))
      };
    } catch (error) {
      console.error('获取涨跌榜错误:', error);
      return {
        gainers: [],
        losers: []
      };
    }
  }

  /**
   * 获取交易统计
   * @returns {Promise<Object>} 交易统计
   */
  async getTradeStatistics() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // 获取今日交易统计
      const todayTrades = await tradeRepository.prisma.trade.count({
        where: {
          executedAt: {
            gte: today,
            lt: tomorrow
          },
          status: 'executed'
        }
      });

      // 获取今日交易额
      const todayVolume = await tradeRepository.prisma.trade.aggregate({
        where: {
          executedAt: {
            gte: today,
            lt: tomorrow
          },
          status: 'executed'
        },
        _sum: {
          amount: true
        }
      });

      // 获取活跃账户数
      const activeAccounts = await aiAccountRepository.count({
        status: 'active'
      });

      // 获取总交易数
      const totalTrades = await tradeRepository.count({
        status: 'executed'
      });

      return {
        todayTrades,
        todayVolume: parseFloat(todayVolume._sum.amount || 0),
        activeAccounts,
        totalTrades,
        avgDailyTrades: Math.floor(totalTrades / 30), // 简化计算
        avgTradeAmount: totalTrades > 0
          ? parseFloat((todayVolume._sum.amount || 0) / todayTrades)
          : 0
      };
    } catch (error) {
      console.error('获取交易统计错误:', error);
      return {
        todayTrades: 0,
        todayVolume: 0,
        activeAccounts: 0,
        totalTrades: 0,
        avgDailyTrades: 0,
        avgTradeAmount: 0
      };
    }
  }

  /**
   * 获取竞赛详情
   * @param {string} competitionId - 竞赛ID
   * @returns {Promise<Object>} 竞赛详情
   */
  async getCompetitionDetails(competitionId) {
    // 模拟竞赛数据
    const competitions = {
      'monthly-challenge': {
        id: 'monthly-challenge',
        name: '月度挑战赛',
        description: '每月一度的AI交易竞赛，展示你的交易策略',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        status: 'ongoing',
        prizePool: 50000,
        participants: 150,
        rules: {
          minTrades: 10,
          maxRisk: 'high',
          allowedMarkets: ['sh', 'sz']
        }
      },
      'newbie-cup': {
        id: 'newbie-cup',
        name: '新手杯',
        description: '专为新用户设计的入门级竞赛',
        startDate: '2026-02-15',
        endDate: '2026-03-15',
        status: 'upcoming',
        prizePool: 10000,
        participants: 0,
        rules: {
          minTrades: 5,
          maxRisk: 'medium',
          allowedMarkets: ['sh', 'sz', 'bj']
        }
      }
    };

    return competitions[competitionId] || {
      id: competitionId,
      name: '未知竞赛',
      description: '竞赛信息暂不可用',
      status: 'unknown'
    };
  }

  /**
   * 获取竞赛规则
   * @param {string} competitionId - 竞赛ID
   * @returns {Object} 竞赛规则
   */
  getCompetitionRules(competitionId) {
    const rules = {
      'monthly-challenge': [
        '参赛账户初始资金为10万元',
        '最少完成10笔交易',
        '风险等级不能超过high',
        '只能交易沪深市场股票',
        '禁止使用高频交易策略',
        '最终排名按总收益率计算'
      ],
      'newbie-cup': [
        '参赛账户初始资金为5万元',
        '最少完成5笔交易',
        '风险等级不能超过medium',
        '可以交易沪深京市场股票',
        '禁止日内频繁交易',
        '最终排名按夏普比率计算'
      ]
    };

    return rules[competitionId] || ['竞赛规则暂未公布'];
  }

  /**
   * 获取竞赛时间表
   * @param {string} competitionId - 竞赛ID
   * @returns {Object} 竞赛时间表
   */
  getCompetitionSchedule(competitionId) {
    const schedules = {
      'monthly-challenge': [
        { date: '2026-02-01', event: '竞赛开始', description: '月度挑战赛正式开始' },
        { date: '2026-02-15', event: '中期检查', description: '检查参赛账户合规性' },
        { date: '2026-02-28', event: '竞赛结束', description: '月度挑战赛结束' },
        { date: '2026-03-01', event: '结果公布', description: '公布获奖名单' }
      ],
      'newbie-cup': [
        { date: '2026-02-15', event: '报名开始', description: '新手杯开始报名' },
        { date: '2026-02-28', event: '报名截止', description: '新手杯报名截止' },
        { date: '2026-03-01', event: '竞赛开始', description: '新手杯正式开始' },
        { date: '2026-03-15', event: '竞赛结束', description: '新手杯结束' }
      ]
    };

    return schedules[competitionId] || [];
  }

  /**
   * 获取参赛者统计
   * @param {string} competitionId - 竞赛ID
   * @returns {Promise<Object>} 参赛者统计
   */
  async getParticipantStatistics(competitionId) {
    // 模拟数据
    return {
      totalParticipants: 150,
      activeParticipants: 120,
      byModelType: {
        openai_gpt4: 60,
        claude: 40,
        wenxin: 30,
        qwen: 20
      },
      byRiskLevel: {
        low: 30,
        medium: 70,
        high: 40,
        critical: 10
      },
      avgReturn: 8.5,
      avgTrades: 15,
      completionRate: 80
    };
  }

  /**
   * 获取市场公告
   * @param {string} type - 公告类型
   * @param {number} limit - 限制数量
   * @returns {Promise<Array>} 市场公告
   */
  async getAnnouncements(type, limit) {
    // 模拟公告数据
    const announcements = [
      {
        id: 1,
        type: 'system',
        title: '系统维护通知',
        content: '系统将于今晚23:00-01:00进行维护，期间服务可能中断',
        priority: 'high',
        publishedAt: '2026-02-02T10:00:00Z',
        expiresAt: '2026-02-03T01:00:00Z'
      },
      {
        id: 2,
        type: 'competition',
        title: '月度挑战赛开始',
        content: '2月月度挑战赛已开始，欢迎各位AI交易员参加',
        priority: 'medium',
        publishedAt: '2026-02-01T09:00:00Z',
        expiresAt: '2026-02-28T23:59:59Z'
      },
      {
        id: 3,
        type: 'market',
        title: '春节休市安排',
        content: '根据交易所安排，春节期间2月8日至2月14日休市',
        priority: 'medium',
        publishedAt: '2026-01-30T15:00:00Z',
        expiresAt: '2026-02-14T23:59:59Z'
      }
    ];

    let filtered = announcements;
    if (type) {
      filtered = filtered.filter(ann => ann.type === type);
    }

    return filtered.slice(0, limit);
  }

  /**
   * 获取重要通知
   * @returns {Promise<Array>} 重要通知
   */
  async getImportantNotices() {
    // 模拟通知数据
    return [
      {
        id: 1,
        title: '风险提示',
        message: '市场波动加大，请注意控制风险',
        type: 'warning',
        timestamp: '2026-02-02T14:30:00Z'
      },
      {
        id: 2,
        title: '新功能上线',
        message: '实时K线图功能已上线，欢迎体验',
        type: 'info',
        timestamp: '2026-02-01T10:00:00Z'
      }
    ];
  }

  /**
   * 获取市场指数趋势
   * @param {string} market - 市场代码
   * @param {number} days - 天数
   * @returns {Promise<Array>} 指数趋势
   */
  async getIndexTrends(market, days) {
    // 模拟指数数据
    const trends = [];
    const baseIndex = 3000;
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      const change = Math.random() * 2 - 1; // -1% 到 +1%
      const index = baseIndex * (1 + change / 100 * i / days);

      trends.push({
        date: date.toISOString().split('T')[0],
        index: parseFloat(index.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        volume: Math.floor(Math.random() * 1000000000)
      });
    }

    return trends;
  }

  /**
   * 获取行业表现
   * @param {string} market - 市场代码
   * @returns {Promise<Array>} 行业表现
   */
  async getSectorPerformance(market) {
    // 模拟行业数据
    const sectors = ['银行', '证券', '保险', '科技', '医药', '消费', '能源', '制造'];

    return sectors.map(sector => ({
      sector,
      change: (Math.random() * 10 - 5), // -5% 到 +5%
      volume: Math.floor(Math.random() * 500000000),
      leadingStock: `00000${Math.floor(Math.random() * 9) + 1}`,
      stockCount: Math.floor(Math.random() * 50) + 10
    })).sort((a, b) => b.change - a.change);
  }

  /**
   * 获取资金流向
   * @param {string} market - 市场代码
   * @returns {Promise<Object>} 资金流向
   */
  async getCapitalFlows(market) {
    // 模拟资金流向数据
    return {
      mainInflow: Math.random() * 1000000000,
      mainOutflow: Math.random() * 800000000,
      smallInflow: Math.random() * 500000000,
      smallOutflow: Math.random() * 400000000,
      netInflow: Math.random() * 300000000 - 150000000, // 正负波动
      bySector: {
        '银行': Math.random() * 200000000,
        '科技': Math.random() * 300000000,
        '医药': Math.random() * 150000000,
        '消费': Math.random() * 180000000
      }
    };
  }

  /**
   * 获取市场情绪
   * @returns {Promise<Object>} 市场情绪
   */
  async getMarketSentiment() {
    // 模拟市场情绪数据
    return {
      sentimentIndex: 65.4, // 0-100，越高越乐观
      fearGreedIndex: 58.2,
      volatilityIndex: 22.1,
      bullRatio: 68.5, // 看涨比例
      bearRatio: 21.3, // 看跌比例
      neutralRatio: 10.2 // 中性比例
    };
  }

  /**
   * 获取实时交易数据
   * @returns {Promise<Array>} 实时交易数据
   */
  async getRealtimeTrades() {
    // 模拟实时交易数据
    const trades = [];
    const now = new Date();

    for (let i = 0; i < 20; i++) {
      const time = new Date(now.getTime() - i * 30000); // 每30秒一笔
      const stockCodes = ['000001', '000002', '600000', '600036', '000858'];

      trades.push({
        time: time.toISOString(),
        stockCode: stockCodes[Math.floor(Math.random() * stockCodes.length)],
        stockName: '模拟股票',
        tradeType: Math.random() > 0.5 ? 'buy' : 'sell',
        quantity: Math.floor(Math.random() * 10000) + 100,
        price: 10 + Math.random() * 20,
        amount: Math.random() * 200000
      });
    }

    return trades;
  }

  /**
   * 获取大单交易
   * @returns {Promise<Array>} 大单交易
   */
  async getBlockTrades() {
    // 模拟大单交易数据
    return [
      {
        stockCode: '000001',
        stockName: '平安银行',
        quantity: 500000,
        price: 16.50,
        amount: 8250000,
        time: '2026-02-02T14:30:00Z'
      },
      {
        stockCode: '600000',
        stockName: '浦发银行',
        quantity: 300000,
        price: 8.20,
        amount: 2460000,
        time: '2026-02-02T14:25:00Z'
      }
    ];
  }

  /**
   * 获取资金异动
   * @returns {Promise<Array>} 资金异动
   */
  async getCapitalChanges() {
    // 模拟资金异动数据
    return [
      {
        stockCode: '000002',
        stockName: '万科A',
        changeType: 'inflow',
        amount: 12345678,
        percentage: 2.34
      },
      {
        stockCode: '600036',
        stockName: '招商银行',
        changeType: 'outflow',
        amount: 8765432,
        percentage: -1.56
      }
    ];
  }

  /**
   * 获取市场热度
   * @returns {Promise<Object>} 市场热度
   */
  async getMarketHeat() {
    // 模拟市场热度数据
    return {
      heatIndex: 75.6, // 0-100
      activeStocks: 1250,
      tradingIntensity: 8.9, // 交易强度
      attentionStocks: ['000001', '000002', '600000'],
      hotTopics: ['AI交易', '量化策略', '价值投资']
    };
  }

  /**
   * 获取指数数据
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getIndices(req, res) {
    try {
      const { indices } = req.query;
      const indexCodes = indices ? indices.split(',') : ['000001', '399001', '399006'];

      // 模拟指数数据
      const indexData = {
        '000001': { name: '上证指数', code: '000001', market: 'sh', price: 3250.50, change: 15.30, changePercent: 0.47 },
        '399001': { name: '深证成指', code: '399001', market: 'sz', price: 10280.30, change: 45.20, changePercent: 0.44 },
        '399006': { name: '创业板指', code: '399006', market: 'sz', price: 2150.80, change: 12.60, changePercent: 0.59 },
        '000016': { name: '上证50', code: '000016', market: 'sh', price: 2680.40, change: 8.90, changePercent: 0.33 },
        '000300': { name: '沪深300', code: '000300', market: 'sh', price: 3850.20, change: 18.50, changePercent: 0.48 },
        '000905': { name: '中证500', code: '000905', market: 'sh', price: 5620.10, change: 32.40, changePercent: 0.58 }
      };

      const result = indexCodes.map(code => ({
        code: indexData[code]?.code || code,
        name: indexData[code]?.name || '未知指数',
        market: indexData[code]?.market || 'sh',
        price: indexData[code]?.price || 0,
        change: indexData[code]?.change || 0,
        changePercent: indexData[code]?.changePercent || 0,
        timestamp: new Date().toISOString()
      }));

      res.json({
        success: true,
        data: {
          indices: result,
          timestamp: new Date().toISOString()
        },
        message: '获取指数数据成功'
      });
    } catch (error) {
      console.error('获取指数数据控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取指数数据失败，请稍后重试'
      });
    }
  }

  /**
   * 获取竞赛列表
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getCompetitions(req, res) {
    try {
      const { status, page = 1, limit = 10 } = req.query;

      // 模拟竞赛数据
      const competitions = [
        {
          id: 'monthly-challenge',
          name: '月度挑战赛',
          description: '每月一度的AI交易竞赛，展示你的交易策略',
          startDate: '2026-02-01',
          endDate: '2026-02-28',
          status: 'active',
          prizePool: 50000,
          participants: 150,
          rules: { minTrades: 10, maxRisk: 'high', allowedMarkets: ['sh', 'sz'] }
        },
        {
          id: 'newbie-cup',
          name: '新手杯',
          description: '专为新用户设计的入门级竞赛',
          startDate: '2026-02-15',
          endDate: '2026-03-15',
          status: 'upcoming',
          prizePool: 10000,
          participants: 0,
          rules: { minTrades: 5, maxRisk: 'medium', allowedMarkets: ['sh', 'sz', 'bj'] }
        },
        {
          id: 'quarterly-cup',
          name: '季度杯',
          description: '季度交易大赛，角逐最强AI交易员',
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          status: 'active',
          prizePool: 100000,
          participants: 280,
          rules: { minTrades: 30, maxRisk: 'high', allowedMarkets: ['sh', 'sz'] }
        }
      ];

      let filtered = competitions;
      if (status) {
        filtered = competitions.filter(c => c.status === status);
      }

      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginated = filtered.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          competitions: paginated,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: filtered.length,
            pages: Math.ceil(filtered.length / parseInt(limit))
          }
        },
        message: '获取竞赛列表成功'
      });
    } catch (error) {
      console.error('获取竞赛列表控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取竞赛列表失败，请稍后重试'
      });
    }
  }

  /**
   * 获取竞赛详情
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getCompetitionDetail(req, res) {
    try {
      const { competitionId } = req.params;

      const competition = this.getCompetitionDetails(competitionId);
      const rules = this.getCompetitionRules(competitionId);
      const schedule = this.getCompetitionSchedule(competitionId);
      const participantStats = await this.getParticipantStatistics(competitionId);

      res.json({
        success: true,
        data: {
          competition,
          rules,
          schedule,
          participantStats
        },
        message: '获取竞赛详情成功'
      });
    } catch (error) {
      console.error('获取竞赛详情控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取竞赛详情失败，请稍后重试'
      });
    }
  }

  /**
   * 加入竞赛
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async joinCompetition(req, res) {
    try {
      const { competitionId } = req.params;
      const { accountId } = req.body;
      const userId = req.user?.id;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '缺少账户ID'
          },
          message: '请选择要参赛的AI账户'
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
          message: '无权访问该账户'
        });
      }

      // 模拟加入竞赛
      res.json({
        success: true,
        data: {
          competitionId,
          accountId: parseInt(accountId),
          joinedAt: new Date().toISOString(),
          status: 'joined'
        },
        message: '成功加入竞赛'
      });
    } catch (error) {
      console.error('加入竞赛控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '加入竞赛失败，请稍后重试'
      });
    }
  }

  /**
   * 退出竞赛
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async leaveCompetition(req, res) {
    try {
      const { competitionId } = req.params;
      const { accountId } = req.body;
      const userId = req.user?.id;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '缺少账户ID'
          },
          message: '请选择要退出的账户'
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
          message: '无权访问该账户'
        });
      }

      // 模拟退出竞赛
      res.json({
        success: true,
        data: {
          competitionId,
          accountId: parseInt(accountId),
          leftAt: new Date().toISOString(),
          status: 'left'
        },
        message: '成功退出竞赛'
      });
    } catch (error) {
      console.error('退出竞赛控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '退出竞赛失败，请稍后重试'
      });
    }
  }

  /**
   * 获取账户排名
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getAccountRanking(req, res) {
    try {
      const { accountId } = req.params;
      const { type = 'all_time' } = req.query;
      const userId = req.user?.id;

      // 验证账户权限
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId)
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '账户不存在'
          },
          message: '找不到该账户'
        });
      }

      // 验证用户权限
      if (account.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '无权查看该账户排名'
        });
      }

      // 模拟排名数据
      res.json({
        success: true,
        data: {
          accountId: parseInt(accountId),
          rank: 15,
          totalParticipants: 150,
          type,
          metrics: {
            totalReturn: 12.5,
            sharpeRatio: 1.8,
            winRate: 65.5,
            maxDrawdown: -8.2
          },
          updatedAt: new Date().toISOString()
        },
        message: '获取账户排名成功'
      });
    } catch (error) {
      console.error('获取账户排名控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取账户排名失败，请稍后重试'
      });
    }
  }

  /**
   * 获取市场状态
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getMarketStatus(req, res) {
    try {
      // 导入DataService
      const { dataService } = await import('../services/DataService.js');

      // 获取市场状态
      const marketStatus = await dataService.getEnhancedMarketStatus();

      res.json({
        success: true,
        data: {
          is_trading: marketStatus.isTrading,
          status: marketStatus.status,
          description: marketStatus.description,
          next_trading_time: marketStatus.nextTradingTime,
          current_time: marketStatus.currentTime,
          recommended_interval: marketStatus.recommendedInterval,
          data_service_status: marketStatus.dataServiceStatus,
          data_quality: marketStatus.dataQuality,
          data_status: marketStatus.dataStatus,
          active_sources: marketStatus.activeSources,
          success_rate: marketStatus.successRate,
          timestamp: marketStatus.timestamp
        },
        message: '市场状态获取成功',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('获取市场状态控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取市场状态失败，请稍后重试'
      });
    }
  }

  /**
   * 获取实时市场数据
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getRealtime(req, res) {
    try {
      const { market } = req.query;

      // 获取市场统计
      const marketStats = await this.getMarketStatistics(market);

      // 获取涨跌榜
      const { gainers, losers } = await this.getGainersAndLosers(market, 10);

      // 获取热门行业（简化实现）
      const hotIndustries = [
        { name: '科技', changePercent: 2.5 },
        { name: '金融', changePercent: 1.8 },
        { name: '医药', changePercent: 1.2 },
        { name: '消费', changePercent: 0.9 },
        { name: '能源', changePercent: 0.5 }
      ];

      res.json({
        success: true,
        data: {
          market: market || 'all',
          timestamp: new Date().toISOString(),
          statistics: marketStats,
          gainers,
          losers,
          hotIndustries
        },
        message: '获取实时市场数据成功'
      });
    } catch (error) {
      console.error('获取实时市场数据错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取实时市场数据失败'
      });
    }
  }

  /**
   * 获取市场历史数据
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getHistory(req, res) {
    try {
      const { symbol, days = 30 } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '股票代码不能为空'
          },
          message: '请提供股票代码'
        });
      }

      // 生成模拟历史数据
      const historyData = [];
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      let currentPrice = 100;
      for (let i = 0; i < parseInt(days); i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);

        // 模拟价格波动
        const change = (Math.random() - 0.5) * 10;
        currentPrice = Math.max(10, currentPrice + change);

        historyData.push({
          date: date.toISOString().split('T')[0],
          open: parseFloat((currentPrice - Math.random() * 5).toFixed(2)),
          close: parseFloat(currentPrice.toFixed(2)),
          high: parseFloat((currentPrice + Math.random() * 3).toFixed(2)),
          low: parseFloat((currentPrice - Math.random() * 3).toFixed(2)),
          volume: Math.floor(Math.random() * 1000000) + 100000
        });
      }

      res.json({
        success: true,
        data: {
          symbol,
          days: parseInt(days),
          history: historyData,
          timestamp: new Date().toISOString()
        },
        message: '获取市场历史数据成功'
      });
    } catch (error) {
      console.error('获取市场历史数据错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取市场历史数据失败'
      });
    }
  }

  /**
   * 获取收益率排行榜
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getReturnsRanking(req, res) {
    try {
      const { period = 'total', limit = 20 } = req.query;

      // 获取排行榜数据（简化实现，返回模拟数据）
      const rankings = await rankingRepository.findMany(
        { periodType: period },
        { rank: 'asc' },
        parseInt(limit)
      );

      res.json({
        success: true,
        data: {
          period,
          rankings: rankings.map((r, index) => ({
            rank: index + 1,
            accountId: r.accountId,
            accountName: r.accountName,
            totalReturn: r.totalReturn,
            totalReturnRate: r.totalReturnRate,
            sharpeRatio: r.sharpeRatio,
            maxDrawdown: r.maxDrawdown,
            winRate: r.winRate
          })),
          timestamp: new Date().toISOString()
        },
        message: '获取收益率排行榜成功'
      });
    } catch (error) {
      console.error('获取收益率排行榜错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取收益率排行榜失败'
      });
    }
  }

  /**
   * 获取综合排行榜
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getComprehensiveRanking(req, res) {
    try {
      const { limit = 20 } = req.query;

      // 获取综合排名（基于多维度评分）
      const rankings = await rankingRepository.findMany(
        {},
        { rank: 'asc' },
        parseInt(limit)
      );

      // 计算综合得分
      const comprehensiveRankings = rankings.map((r, index) => ({
        rank: index + 1,
        accountId: r.accountId,
        accountName: r.accountName,
        compositeScore: this.calculateCompositeScore(r),
        metrics: {
          totalReturn: r.totalReturn,
          sharpeRatio: r.sharpeRatio,
          maxDrawdown: r.maxDrawdown,
          winRate: r.winRate,
          tradeFrequency: r.tradeFrequency
        },
        timestamp: new Date().toISOString()
      }));

      // 按综合得分排序
      comprehensiveRankings.sort((a, b) => b.compositeScore - a.compositeScore);

      // 重新排名
      comprehensiveRankings.forEach((r, index) => {
        r.rank = index + 1;
      });

      res.json({
        success: true,
        data: {
          rankings: comprehensiveRankings.slice(0, parseInt(limit)),
          timestamp: new Date().toISOString()
        },
        message: '获取综合排行榜成功'
      });
    } catch (error) {
      console.error('获取综合排行榜错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取综合排行榜失败'
      });
    }
  }

  /**
   * 计算综合得分
   * @param {Object} ranking - 排名数据
   * @returns {number} 综合得分
   */
  calculateCompositeScore(ranking) {
    const weights = {
      return: 0.3,
      sharpe: 0.25,
      drawdown: 0.25,
      winRate: 0.2
    };

    // 收益得分 (0-100)
    const returnScore = Math.min(100, Math.max(0, (ranking.totalReturnRate || 0) * 2));

    // 夏普比率得分 (0-100)
    const sharpeScore = Math.min(100, Math.max(0, (ranking.sharpeRatio || 0) * 20));

    // 回撤得分 (越低越好，0-100)
    const drawdownScore = Math.min(100, Math.max(0, 100 - Math.abs(ranking.maxDrawdown || 0) * 2));

    // 胜率得分 (0-100)
    const winRateScore = (ranking.winRate || 0) * 100;

    return (
      returnScore * weights.return +
      sharpeScore * weights.sharpe +
      drawdownScore * weights.drawdown +
      winRateScore * weights.winRate
    );
  }

  /**
   * 获取加权热股票列表
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getWeightedHotStocks(req, res) {
    try {
      const {
        limit = 50,
        minWeight = 0
      } = req.query;

      // 验证参数
      const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      const parsedMinWeight = Math.min(100, Math.max(0, parseFloat(minWeight) || 0));

      // 获取热股票列表
      const result = await weightedHotStocksService.getWeightedHotStocks({
        limit: parsedLimit,
        minWeight: parsedMinWeight
      });

      if (!result.success) {
        return res.status(503).json(result);
      }

      return res.json(result);
    } catch (error) {
      console.error('[MarketController] Failed to get weighted hot stocks:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取热股票列表失败'
        }
      });
    }
  }

  /**
   * 手动触发热股票列表更新（管理员接口）
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async refreshHotStocks(req, res) {
    try {
      // 检查权限
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '只有管理员可以手动刷新热股票列表'
          }
        });
      }

      const result = await weightedHotStocksService.performFullUpdate();

      if (result.success) {
        return res.json({
          success: true,
          message: '热股票列表已更新',
          data: {
            count: result.count,
            topStock: result.topStock
          }
        });
      } else {
        return res.status(500).json({
          success: false,
          error: {
            code: 'UPDATE_FAILED',
            message: result.error || '更新失败'
          }
        });
      }
    } catch (error) {
      console.error('[MarketController] Failed to refresh hot stocks:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '刷新热股票列表失败'
        }
      });
    }
  }

  /**
   * 获取热股票缓存状态
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getHotStocksStatus(req, res) {
    try {
      const status = await weightedHotStocksService.getCacheStatus();

      return res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('[MarketController] Failed to get hot stocks status:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取缓存状态失败'
        }
      });
    }
  }
}

// 创建控制器实例
export const marketController = new MarketController();