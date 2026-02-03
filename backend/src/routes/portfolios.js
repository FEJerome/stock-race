import express from 'express';
import { portfolioController } from '../controllers/PortfolioController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /portfolios:
 *   get:
 *     tags: [持仓]
 *     summary: 获取持仓列表
 *     description: 获取当前用户的持仓列表，支持账户过滤和分页
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: integer
 *         description: 账户ID过滤
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
 *         description: 获取持仓列表成功
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
router.get('/', authenticate, portfolioController.getPortfolios.bind(portfolioController));

/**
 * @swagger
 * /portfolios/{portfolioId}:
 *   get:
 *     tags: [持仓]
 *     summary: 获取持仓详情
 *     description: 获取指定持仓的详细信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: portfolioId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 持仓ID
 *     responses:
 *       200:
 *         description: 获取持仓详情成功
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
 *         description: 持仓不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:portfolioId', authenticate, portfolioController.getPortfolioDetail.bind(portfolioController));

/**
 * @swagger
 * /portfolios/stats:
 *   get:
 *     tags: [持仓]
 *     summary: 获取持仓统计
 *     description: 获取持仓统计信息，包括总市值、盈亏、行业分布等
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: integer
 *         description: 账户ID过滤
 *     responses:
 *       200:
 *         description: 获取持仓统计成功
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
router.get('/stats', authenticate, portfolioController.getPortfolioStats.bind(portfolioController));

/**
 * @swagger
 * /portfolios/risk-analysis:
 *   get:
 *     tags: [持仓]
 *     summary: 获取持仓风险分析
 *     description: 获取持仓风险分析报告
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: integer
 *         description: 账户ID过滤
 *     responses:
 *       200:
 *         description: 获取持仓风险分析成功
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
router.get('/risk-analysis', authenticate, portfolioController.getRiskAnalysis.bind(portfolioController));

/**
 * @swagger
 * /portfolios/history:
 *   get:
 *     tags: [持仓]
 *     summary: 获取持仓历史
 *     description: 获取持仓历史记录，支持时间范围过滤
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
 *         description: 获取持仓历史成功
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
router.get('/history', authenticate, portfolioController.getPortfolioHistory.bind(portfolioController));

/**
 * @swagger
 * /portfolios/rebalance:
 *   post:
 *     tags: [持仓]
 *     summary: 重新平衡持仓
 *     description: 重新平衡持仓，调整持仓比例
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
 *               - targetAllocation
 *             properties:
 *               accountId:
 *                 type: integer
 *                 description: 账户ID
 *               targetAllocation:
 *                 type: object
 *                 description: 目标持仓比例
 *               rebalanceMethod:
 *                 type: string
 *                 enum: [proportional, equal_weight, risk_parity]
 *                 default: 'proportional'
 *                 description: 重新平衡方法
 *     responses:
 *       200:
 *         description: 重新平衡持仓成功
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
 */
router.post('/rebalance', authenticate, portfolioController.rebalancePortfolio.bind(portfolioController));

/**
 * @swagger
 * /portfolios/update-market-values:
 *   post:
 *     tags: [持仓]
 *     summary: 更新持仓市值
 *     description: 批量更新持仓的当前市值
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: integer
 *                 description: 账户ID
 *     responses:
 *       200:
 *         description: 更新持仓市值成功
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
router.post('/update-market-values', authenticate, portfolioController.updateMarketValues.bind(portfolioController));

export default router;