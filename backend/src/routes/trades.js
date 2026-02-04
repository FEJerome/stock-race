import express from 'express';
import { tradeController } from '../controllers/TradeController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /trades:
 *   get:
 *     tags: [交易]
 *     summary: 获取交易记录
 *     description: 获取交易记录列表，支持账户、股票、交易类型、状态过滤和分页
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: integer
 *         description: 账户ID过滤
 *       - in: query
 *         name: stockCode
 *         schema:
 *           type: string
 *         description: 股票代码过滤
 *       - in: query
 *         name: tradeType
 *         schema:
 *           type: string
 *           enum: [buy, sell]
 *         description: 交易类型过滤
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, executed, cancelled, rejected]
 *         description: 交易状态过滤
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 开始日期过滤
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 结束日期过滤
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
 *           default: 20
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 获取交易记录成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', authenticate, (req, res) => tradeController.getTrades(req, res));

/**
 * @swagger
 * /trades:
 *   post:
 *     tags: [交易]
 *     summary: 创建交易订单
 *     description: 创建新的交易订单
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountId
 *               - stockCode
 *               - tradeType
 *               - quantity
 *               - price
 *             properties:
 *               accountId:
 *                 type: integer
 *                 description: 账户ID
 *               stockCode:
 *                 type: string
 *                 description: 股票代码
 *               tradeType:
 *                 type: string
 *                 enum: [buy, sell]
 *                 description: 交易类型
 *               orderType:
 *                 type: string
 *                 enum: [market, limit, stop]
 *                 default: 'market'
 *                 description: 订单类型
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: 交易数量
 *               price:
 *                 type: number
 *                 minimum: 0.01
 *                 description: 交易价格
 *               reason:
 *                 type: string
 *                 description: 交易原因
 *     responses:
 *       201:
 *         description: 创建交易订单成功
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
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 权限不足
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 股票不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', authenticate, (req, res) => tradeController.createTrade(req, res));

/**
 * @swagger
 * /trades/{tradeId}:
 *   get:
 *     tags: [交易]
 *     summary: 获取交易详情
 *     description: 获取指定交易的详细信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tradeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 交易ID
 *     responses:
 *       200:
 *         description: 获取交易详情成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 权限不足
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 交易不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:tradeId', authenticate, (req, res) => tradeController.getTradeDetail(req, res));

/**
 * @swagger
 * /trades/{tradeId}/cancel:
 *   post:
 *     tags: [交易]
 *     summary: 取消交易订单
 *     description: 取消指定的交易订单
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tradeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 交易ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: 取消原因
 *     responses:
 *       200:
 *         description: 取消交易订单成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: 交易状态不可取消
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 权限不足
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 交易不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:tradeId/cancel', authenticate, (req, res) => tradeController.cancelTrade(req, res));

/**
 * @swagger
 * /trades/stats:
 *   get:
 *     tags: [交易]
 *     summary: 获取交易统计
 *     description: 获取交易统计信息，包括绩效、今日统计、交易趋势等
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: integer
 *         description: 账户ID过滤
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 开始日期
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 结束日期
 *     responses:
 *       200:
 *         description: 获取交易统计成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 权限不足
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/stats', authenticate, (req, res) => tradeController.getTradeStats(req, res));

/**
 * @swagger
 * /trades/hot:
 *   get:
 *     tags: [交易]
 *     summary: 获取热门交易股票
 *     description: 获取近期热门交易股票
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 30
 *           default: 7
 *         description: 统计天数
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: 结果数量限制
 *     responses:
 *       200:
 *         description: 获取热门交易股票成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: 未认证
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/hot', authenticate, (req, res) => tradeController.getHotTradingStocks(req, res));

export default router;