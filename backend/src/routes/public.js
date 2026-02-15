/**
 * 公开API路由 (O3-001, O3-002)
 * 无需认证即可访问
 * 路径: /api/v1/public/*
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { rankingRepository } from '../models/index.js';
import { MarketDataClient } from '../services/MarketDataClient.js';
import { marketDataCache } from '../services/CacheService.js';
import { sessionService } from '../services/SessionService.js';
import WeightedHotStocksService from '../services/WeightedHotStocksService.js';

const router = express.Router();
const marketDataClient = new MarketDataClient();

/**
 * @swagger
 * tags:
 *   - name: 公开API
 *     description: 无需认证的公开数据接口
 */

// 公开API限流配置 - 100 req/min/IP
const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '请求过于频繁，请稍后再试'
    },
    message: '公开API请求频率限制为100次/分钟'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 行情API限流配置 - 200 req/min/IP
const marketLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 200,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '请求过于频繁，请稍后再试'
    },
    message: '行情API请求频率限制为200次/分钟'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @swagger
 * /api/v1/public/rankings:
 *   get:
 *     summary: 获取排行榜数据
 *     tags: [公开API]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: 每页数量
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [by_return, by_sharpe, by_win_rate]
 *           default: by_return
 *         description: 排序方式
 *     responses:
 *       200:
 *         description: 成功获取排行榜
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank:
 *                         type: integer
 *                       ai_manager_name:
 *                         type: string
 *                       total_return:
 *                         type: number
 *                       sharpe_ratio:
 *                         type: number
 *                       win_rate:
 *                         type: number
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 */
router.get('/rankings', publicLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sort = req.query.sort || 'by_return';

    // 验证排序参数
    const validSortFields = ['by_return', 'by_sharpe', 'by_win_rate'];
    if (!validSortFields.includes(sort)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SORT',
          message: '无效的排序参数'
        },
        message: '排序参数必须是 by_return, by_sharpe 或 by_win_rate'
      });
    }

    // 获取排行榜数据
    const result = await rankingRepository.getPublicRankings({
      page,
      limit,
      sort
    });

    res.json({
      success: true,
      data: result.data.map((item, index) => ({
        rank: (page - 1) * limit + index + 1,
        ai_manager_name: item.aiManagerName || item.name || '未命名AI',
        total_return: item.totalReturn || 0,
        sharpe_ratio: item.sharpeRatio || 0,
        win_rate: item.winRate || 0
      })),
      pagination: {
        page,
        limit,
        total: result.total
      }
    });
  } catch (error) {
    console.error('[Public API] 获取排行榜失败:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      },
      message: '获取排行榜数据失败'
    });
  }
});

/**
 * @swagger
 * /api/v1/public/market/quotes:
 *   get:
 *     summary: 获取行情数据
 *     tags: [公开API]
 *     parameters:
 *       - in: query
 *         name: symbols
 *         schema:
 *           type: string
 *         required: true
 *         description: 股票代码，逗号分隔，最多50只
 *     responses:
 *       200:
 *         description: 成功获取行情数据
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       symbol:
 *                         type: string
 *                       name:
 *                         type: string
 *                       price:
 *                         type: number
 *                       change:
 *                         type: number
 *                       change_percent:
 *                         type: number
 *                       volume:
 *                         type: integer
 */
router.get('/market/quotes', marketLimiter, async (req, res) => {
  try {
    const { symbols } = req.query;

    if (!symbols) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SYMBOLS',
          message: '缺少股票代码参数'
        },
        message: '请提供symbols参数，多个代码用逗号分隔'
      });
    }

    // 解析并限制股票数量
    const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean);
    if (symbolList.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SYMBOLS',
          message: '无效的股票代码'
        },
        message: '请提供有效的股票代码'
      });
    }

    if (symbolList.length > 50) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_SYMBOLS',
          message: '股票数量超过限制'
        },
        message: '最多支持50只股票查询'
      });
    }

    // 从缓存获取行情，5秒TTL
    const cacheKey = `quotes:${symbolList.sort().join(',')}`;
    const quotes = await marketDataCache.getOrSet(
      cacheKey,
      () => marketDataClient.getQuotes(symbolList),
      5000 // 5秒TTL
    );

    res.json({
      success: true,
      data: quotes.map(quote => ({
        symbol: quote.symbol,
        name: quote.name || quote.stockName || '-',
        price: quote.price || quote.current || 0,
        change: quote.change || 0,
        change_percent: quote.changePercent || quote.change_percent || 0,
        volume: quote.volume || 0
      }))
    });
  } catch (error) {
    console.error('[Public API] 获取行情失败:', error);

    // Market Data Service不可用时返回降级数据
    if (error.code === 'SERVICE_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        error: {
          code: 'MARKET_DATA_UNAVAILABLE',
          message: '行情数据服务暂时不可用'
        },
        message: '行情数据服务暂时不可用，请稍后重试'
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      },
      message: '获取行情数据失败'
    });
  }
});

/**
 * @swagger
 * /api/v1/public/market/snapshot:
 *   get:
 *     summary: 获取市场快照
 *     tags: [公开API]
 *     responses:
 *       200:
 *         description: 成功获取市场快照
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     indices:
 *                       type: array
 *                       items:
 *                         type: object
 *                     hotStocks:
 *                       type: array
 *                       items:
 *                         type: object
 *                     timestamp:
 *                       type: string
 */
router.get('/market/snapshot', marketLimiter, async (req, res) => {
  try {
    // 从缓存获取市场快照，5秒TTL
    const snapshot = await marketDataCache.getOrSet(
      'market:snapshot',
      () => marketDataClient.getMarketSnapshot(),
      5000 // 5秒TTL
    );

    res.json({
      success: true,
      data: {
        indices: snapshot.indices || [],
        hotStocks: snapshot.hotStocks || [],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Public API] 获取市场快照失败:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      },
      message: '获取市场快照失败'
    });
  }
});

/**
 * @swagger
 * /api/v1/public/hot-stocks:
 *   get:
 *     summary: 获取加权热股票列表（公开API）
 *     tags: [公开API]
 *     description: |
 *       获取根据用户活动、交易活跃度等多因子计算的加权热股票列表。
 *       供Market Data Service动态高频层采集使用。
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *         description: 返回股票数量限制
 *       - in: query
 *         name: minWeight
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           default: 0
 *         description: 最小权重过滤
 *     responses:
 *       200:
 *         description: 获取热股票列表成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     stocks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           symbol:
 *                             type: string
 *                             description: 股票代码
 *                           weight:
 *                             type: number
 *                             description: 权重值(0-100)
 *                           factors:
 *                             type: object
 *                             description: 权重因子详情
 *                     totalCount:
 *                       type: integer
 *                     updatedAt:
 *                       type: string
 *                     nextUpdateIn:
 *                       type: integer
 *                       description: 下次更新倒计时(秒)
 *       503:
 *         description: 缓存未就绪
 */
router.get('/hot-stocks', marketLimiter, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const minWeight = parseFloat(req.query.minWeight) || 0;

    // 获取Redis客户端（从sessionService）
    const redis = sessionService.redisClient;
    if (!redis || !redis.isReady) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'REDIS_UNAVAILABLE',
          message: 'Redis服务暂不可用'
        },
        message: '热股票服务暂时不可用，请稍后重试'
      });
    }

    // 创建服务实例并获取热股票
    const hotStocksService = new WeightedHotStocksService(redis);
    const result = await hotStocksService.getWeightedHotStocks({ limit, minWeight });

    if (!result.success) {
      return res.status(result.error.code === 'CACHE_NOT_READY' ? 503 : 500).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Public API] 获取热股票列表失败:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '获取热股票列表失败'
      },
      message: '服务器内部错误'
    });
  }
});

/**
 * @swagger
 * /api/v1/public/hot-stocks/status:
 *   get:
 *     summary: 获取热股票缓存状态（公开API）
 *     tags: [公开API]
 *     responses:
 *       200:
 *         description: 获取状态成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isReady:
 *                       type: boolean
 *                     lastUpdate:
 *                       type: string
 *                     nextUpdateIn:
 *                       type: integer
 *                     stockCount:
 *                       type: integer
 */
router.get('/hot-stocks/status', marketLimiter, async (req, res) => {
  try {
    const redis = sessionService.redisClient;
    if (!redis || !redis.isReady) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'REDIS_UNAVAILABLE',
          message: 'Redis服务暂不可用'
        },
        message: '热股票服务暂时不可用'
      });
    }

    const hotStocksService = new WeightedHotStocksService(redis);
    const status = await hotStocksService.getCacheStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[Public API] 获取热股票状态失败:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '获取缓存状态失败'
      },
      message: '服务器内部错误'
    });
  }
});

export default router;
