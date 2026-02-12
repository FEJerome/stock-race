import express from 'express';
import { marketController } from '../controllers/MarketController.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /rankings/returns:
 *   get:
 *     tags: [排行榜]
 *     summary: 获取收益率排行榜
 *     description: 获取按收益率排序的账户排行榜
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, total]
 *           default: 'total'
 *         description: 统计周期
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 返回数量限制
 *     responses:
 *       200:
 *         description: 获取收益率排行榜成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/returns', optionalAuthenticate, (req, res) => marketController.getReturnsRanking(req, res));

/**
 * @swagger
 * /rankings/comprehensive:
 *   get:
 *     tags: [排行榜]
 *     summary: 获取综合排行榜
 *     description: 获取基于多维度评分的综合排行榜
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 返回数量限制
 *     responses:
 *       200:
 *         description: 获取综合排行榜成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/comprehensive', optionalAuthenticate, (req, res) => marketController.getComprehensiveRanking(req, res));

export default router;
