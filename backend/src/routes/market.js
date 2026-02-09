import express from 'express';
import { marketController } from '../controllers/MarketController.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /market/rankings:
 *   get:
 *     tags: [排行榜]
 *     summary: 获取排行榜
 *     description: 获取竞赛排行榜，支持按收益率、总资产等排序
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, all_time]
 *           default: 'all_time'
 *         description: 排行榜类型
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [total_return, total_assets, win_rate, sharpe_ratio]
 *           default: 'total_return'
 *         description: 排序字段
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: 'desc'
 *         description: 排序顺序
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
 *         description: 获取排行榜成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/rankings', optionalAuthenticate, (req, res) => marketController.getRankings(req, res));

/**
 * @swagger
 * /market/rankings/{accountId}:
 *   get:
 *     tags: [排行榜]
 *     summary: 获取账户排名
 *     description: 获取指定账户在排行榜中的排名信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 账户ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, all_time]
 *           default: 'all_time'
 *         description: 排行榜类型
 *     responses:
 *       200:
 *         description: 获取账户排名成功
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
 *         description: 账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/rankings/:accountId', authenticate, (req, res) => marketController.getAccountRanking(req, res));

/**
 * @swagger
 * /market/data:
 *   get:
 *     tags: [市场]
 *     summary: 获取市场数据
 *     description: 获取市场整体数据，包括指数、涨跌统计、成交量等
 *     parameters:
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *         description: 市场代码过滤
 *     responses:
 *       200:
 *         description: 获取市场数据成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/data', optionalAuthenticate, (req, res) => marketController.getMarketData(req, res));

/**
 * @swagger
 * /market/competitions:
 *   get:
 *     tags: [市场]
 *     summary: 获取竞赛信息
 *     description: 获取当前和历史的竞赛信息
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, upcoming, ended]
 *         description: 竞赛状态过滤
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
 *           maximum: 50
 *           default: 10
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 获取竞赛信息成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/competitions', optionalAuthenticate, (req, res) => marketController.getCompetitions(req, res));

/**
 * @swagger
 * /market/competitions/{competitionId}:
 *   get:
 *     tags: [市场]
 *     summary: 获取竞赛详情
 *     description: 获取指定竞赛的详细信息
 *     parameters:
 *       - in: path
 *         name: competitionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 竞赛ID
 *     responses:
 *       200:
 *         description: 获取竞赛详情成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: 竞赛不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/competitions/:competitionId', optionalAuthenticate, (req, res) => marketController.getCompetitionDetail(req, res));

/**
 * @swagger
 * /market/competitions/{competitionId}/join:
 *   post:
 *     tags: [市场]
 *     summary: 加入竞赛
 *     description: 加入指定的竞赛
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: competitionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 竞赛ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountId
 *             properties:
 *               accountId:
 *                 type: integer
 *                 description: 账户ID
 *     responses:
 *       200:
 *         description: 加入竞赛成功
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
 *         description: 竞赛不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/competitions/:competitionId/join', authenticate, (req, res) => marketController.joinCompetition(req, res));

/**
 * @swagger
 * /market/competitions/{competitionId}/leave:
 *   post:
 *     tags: [市场]
 *     summary: 退出竞赛
 *     description: 退出指定的竞赛
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: competitionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 竞赛ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountId
 *             properties:
 *               accountId:
 *                 type: integer
 *                 description: 账户ID
 *     responses:
 *       200:
 *         description: 退出竞赛成功
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
 *         description: 竞赛不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/competitions/:competitionId/leave', authenticate, (req, res) => marketController.leaveCompetition(req, res));

/**
 * @swagger
 * /market/trading-hall:
 *   get:
 *     tags: [市场]
 *     summary: 获取交易大厅数据
 *     description: 获取交易大厅的实时数据，包括热门交易、活跃用户等
 *     parameters:
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
 *         description: 获取交易大厅数据成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/trading-hall', optionalAuthenticate, (req, res) => marketController.getTradingHallData(req, res));

/**
 * @swagger
 * /market/trends:
 *   get:
 *     tags: [市场]
 *     summary: 获取市场趋势
 *     description: 获取市场趋势数据，包括热门行业、资金流向等
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: 'week'
 *         description: 统计周期
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 10
 *         description: 结果数量限制
 *     responses:
 *       200:
 *         description: 获取市场趋势成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/trends', optionalAuthenticate, (req, res) => marketController.getMarketTrends(req, res));

/**
 * @swagger
 * /market/indices:
 *   get:
 *     tags: [市场]
 *     summary: 获取指数数据
 *     description: 获取主要指数的实时数据
 *     parameters:
 *       - in: query
 *         name: indices
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: 指数代码数组
 *     responses:
 *       200:
 *         description: 获取指数数据成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/indices', optionalAuthenticate, (req, res) => marketController.getIndices(req, res));

/**
 * @swagger
 * /market/status:
 *   get:
 *     tags: [市场]
 *     summary: 获取市场状态
 *     description: 获取当前市场状态，包括交易时间、数据服务状态、下次交易时间等信息
 *     responses:
 *       200:
 *         description: 获取市场状态成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/status', (req, res) => marketController.getMarketStatus(req, res));

export default router;