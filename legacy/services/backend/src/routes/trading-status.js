/**
 * 交易状态API路由 [T-015, T-011]
 *
 * 路径: /api/v1/trading-status/*
 */

import express from 'express';
import { TradingStatusService } from '../services/TradingStatusService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const tradingStatusService = new TradingStatusService();

/**
 * @swagger
 * tags:
 *   - name: 交易状态
 *     description: 股票交易状态和市场规则查询
 */

/**
 * @swagger
 * /api/v1/trading-status/{symbol}:
 *   get:
 *     summary: 获取股票交易状态 [T-015]
 *     tags: [交易状态]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: 股票代码 (如 000001.SZ)
 *     responses:
 *       200:
 *         description: 成功获取交易状态
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
 *                     symbol:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [normal, suspended, limit_up, limit_down, auction]
 *                     priceLimits:
 *                       type: object
 *                       properties:
 *                         upper:
 *                           type: number
 *                         lower:
 *                           type: number
 *                     tradingPhase:
 *                       type: string
 *                       enum: [continuous, auction, closed]
 *                     isST:
 *                       type: boolean
 *                     isSuspended:
 *                       type: boolean
 *                     isFallback:
 *                       type: boolean
 *                       description: 是否为降级数据
 *       401:
 *         description: 未认证
 *       503:
 *         description: 服务不可用
 */
router.get('/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;

    const status = await tradingStatusService.getTradingStatus(symbol);

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error(`[TradingStatus API] 获取交易状态失败:`, error.message);

    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: '交易状态服务暂时不可用'
      },
      message: '请稍后重试'
    });
  }
});

/**
 * @swagger
 * /api/v1/trading-status/batch:
 *   post:
 *     summary: 批量获取股票交易状态 [T-015]
 *     tags: [交易状态]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - symbols
 *             properties:
 *               symbols:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 50
 *     responses:
 *       200:
 *         description: 成功获取批量交易状态
 */
router.post('/batch', authenticate, async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SYMBOLS',
          message: '请提供有效的股票代码数组'
        },
        message: 'symbols参数必须是包含股票代码的数组'
      });
    }

    if (symbols.length > 50) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_SYMBOLS',
          message: '股票数量超过限制'
        },
        message: '最多支持50只股票'
      });
    }

    const results = await tradingStatusService.getBatchTradingStatus(symbols);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error(`[TradingStatus API] 批量获取交易状态失败:`, error.message);

    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: '交易状态服务暂时不可用'
      },
      message: '请稍后重试'
    });
  }
});

/**
 * @swagger
 * /api/v1/trading-status/market/{market}/rules:
 *   get:
 *     summary: 获取市场规则 [T-011]
 *     tags: [交易状态]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: market
 *         required: true
 *         schema:
 *           type: string
 *           enum: [SH, SZ, CYB, KCB, BJ]
 *         description: 市场代码
 *     responses:
 *       200:
 *         description: 成功获取市场规则
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
 *                     market:
 *                       type: string
 *                     priceLimit:
 *                       type: number
 *                       description: 涨跌幅限制比例
 *                     minQuantity:
 *                       type: number
 *                       description: 最小交易数量
 *                     maxQuantityPerOrder:
 *                       type: number
 *                       description: 单笔最大交易数量
 *                     tradingHours:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                           end:
 *                             type: string
 *                     isFallback:
 *                       type: boolean
 */
router.get('/market/:market/rules', authenticate, async (req, res) => {
  try {
    const { market } = req.params;

    const validMarkets = ['SH', 'SZ', 'CYB', 'KCB', 'BJ'];
    if (!validMarkets.includes(market)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MARKET',
          message: '无效的市场代码'
        },
        message: `市场代码必须是: ${validMarkets.join(', ')}`
      });
    }

    const rules = await tradingStatusService.getMarketRules(market);

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error(`[TradingStatus API] 获取市场规则失败:`, error.message);

    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: '市场规则服务暂时不可用'
      },
      message: '请稍后重试'
    });
  }
});

/**
 * @swagger
 * /api/v1/trading-status/service/status:
 *   get:
 *     summary: 获取交易状态服务状态
 *     tags: [交易状态]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取服务状态
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
 *                     circuitBreaker:
 *                       type: object
 *                       properties:
 *                         isOpen:
 *                           type: boolean
 *                         failureCount:
 *                           type: number
 *                         successCount:
 *                           type: number
 *                     cache:
 *                       type: object
 *                       properties:
 *                         size:
 *                           type: number
 *                         ttl:
 *                           type: number
 */
router.get('/service/status', authenticate, async (req, res) => {
  try {
    const status = tradingStatusService.getStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error(`[TradingStatus API] 获取服务状态失败:`, error.message);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '获取服务状态失败'
      }
    });
  }
});

export default router;
