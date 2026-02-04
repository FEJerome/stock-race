import express from 'express';
import { stockController } from '../controllers/StockController.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /stocks:
 *   get:
 *     tags: [股票]
 *     summary: 获取股票列表
 *     description: 获取股票列表，支持市场、行业、搜索过滤和分页
 *     parameters:
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *         description: 市场代码过滤 (如 SH, SZ)
 *       - in: query
 *         name: industry
 *         schema:
 *           type: string
 *         description: 行业过滤
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词（股票代码或名称）
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 获取股票列表成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/', optionalAuthenticate, (req, res) => stockController.getStocks(req, res));

/**
 * @swagger
 * /stocks/search:
 *   get:
 *     tags: [股票]
 *     summary: 搜索股票
 *     description: 根据关键词搜索股票
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: 搜索关键词
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: 结果数量限制
 *     responses:
 *       200:
 *         description: 搜索股票成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: 搜索关键词太短
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/search', optionalAuthenticate, (req, res) => stockController.searchStocks(req, res));

/**
 * @swagger
 * /stocks/{stockCode}:
 *   get:
 *     tags: [股票]
 *     summary: 获取股票详情
 *     description: 获取指定股票的详细信息，包括实时行情、K线数据、技术指标等
 *     parameters:
 *       - in: path
 *         name: stockCode
 *         required: true
 *         schema:
 *           type: string
 *         description: 股票代码
 *     responses:
 *       200:
 *         description: 获取股票详情成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: 股票不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:stockCode', optionalAuthenticate, (req, res) => stockController.getStockDetail(req, res));

/**
 * @swagger
 * /stocks/{stockCode}/kline:
 *   get:
 *     tags: [股票]
 *     summary: 获取K线数据
 *     description: 获取指定股票的K线数据
 *     parameters:
 *       - in: path
 *         name: stockCode
 *         required: true
 *         schema:
 *           type: string
 *         description: 股票代码
 *       - in: query
 *         name: interval
 *         schema:
 *           type: string
 *           enum: [1m, 5m, 15m, 30m, 1h, 1d, 1w, 1M]
 *           default: '1d'
 *         description: 时间间隔
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 开始时间
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 结束时间
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: 数据条数
 *     responses:
 *       200:
 *         description: 获取K线数据成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: 股票不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:stockCode/kline', optionalAuthenticate, (req, res) => stockController.getKline(req, res));

/**
 * @swagger
 * /stocks/{stockCode}/realtime:
 *   get:
 *     tags: [股票]
 *     summary: 获取实时行情
 *     description: 获取指定股票的实时行情数据
 *     parameters:
 *       - in: path
 *         name: stockCode
 *         required: true
 *         schema:
 *           type: string
 *         description: 股票代码
 *     responses:
 *       200:
 *         description: 获取实时行情成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: 股票不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:stockCode/realtime', optionalAuthenticate, (req, res) => stockController.getRealtime(req, res));

/**
 * @swagger
 * /stocks/market/stats:
 *   get:
 *     tags: [股票]
 *     summary: 获取市场统计
 *     description: 获取市场统计数据，包括股票数量、行业分布、涨跌统计等
 *     parameters:
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *         description: 市场代码过滤
 *     responses:
 *       200:
 *         description: 获取市场统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/market/stats', optionalAuthenticate, (req, res) => stockController.getMarketStats(req, res));

/**
 * @swagger
 * /stocks/realtime/batch:
 *   post:
 *     tags: [股票]
 *     summary: 批量获取股票实时数据
 *     description: 批量获取多个股票的实时数据
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stockCodes
 *             properties:
 *               stockCodes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 100
 *                 description: 股票代码数组
 *     responses:
 *       200:
 *         description: 批量获取股票实时数据成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 部分股票不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/realtime/batch', optionalAuthenticate, (req, res) => stockController.batchGetRealtime(req, res));

/**
 * @swagger
 * /stocks/rankings:
 *   get:
 *     tags: [股票]
 *     summary: 获取股票排行榜
 *     description: 获取股票排行榜，支持按涨跌幅、成交量等排序
 *     parameters:
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [changePercent, volume, amount, price]
 *           default: 'changePercent'
 *         description: 排序字段
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: 'desc'
 *         description: 排序顺序
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *         description: 市场代码过滤
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: 结果数量限制
 *     responses:
 *       200:
 *         description: 获取股票排行榜成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/rankings', optionalAuthenticate, (req, res) => stockController.getStockRankings(req, res));

export default router;