import express from 'express';
import { aiController } from '../controllers/AIController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 内部API
 *     description: 服务间通信使用的内部API
 */

/**
 * @swagger
 * /internal/ai-decisions:
 *   post:
 *     tags: [内部API]
 *     summary: 执行AI交易决策
 *     description: |
 *       接收 trading-ai-service 的交易决策结果并执行虚拟交易。
 *       这是一个内部API端点，用于服务间通信。
 *     security:
 *       - internalApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountId
 *               - decision
 *             properties:
 *               accountId:
 *                 type: string
 *                 description: AI账户ID
 *               decision:
 *                 type: object
 *                 required:
 *                   - action
 *                   - symbol
 *                   - quantity
 *                   - price
 *                 properties:
 *                   decisionId:
 *                     type: string
 *                     description: 决策唯一标识（用于幂等性）
 *                   action:
 *                     type: string
 *                     enum: [buy, sell, hold]
 *                     description: 交易动作
 *                   symbol:
 *                     type: string
 *                     description: 股票代码
 *                   quantity:
 *                     type: number
 *                     description: 交易数量
 *                   price:
 *                     type: number
 *                     description: 交易价格
 *                   reasoning:
 *                     type: string
 *                     description: 决策理由
 *     responses:
 *       200:
 *         description: 决策执行成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     tradeId:
 *                       type: number
 *                     status:
 *                       type: string
 *                       example: executed
 *                     action:
 *                       type: string
 *                     symbol:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     price:
 *                       type: number
 *                 message:
 *                   type: string
 *       400:
 *         description: 请求参数错误或余额/持仓不足
 *       404:
 *         description: 账户或股票不存在
 *       409:
 *         description: 决策已执行（幂等性冲突）
 *       500:
 *         description: 服务器内部错误
 */
router.post('/ai-decisions', (req, res) => aiController.executeAIDecision(req, res));

/**
 * @swagger
 * /internal/ai-decisions/batch:
 *   post:
 *     tags: [内部API]
 *     summary: 批量执行AI交易决策
 *     description: 批量接收并执行多个AI交易决策
 *     security:
 *       - internalApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - decisions
 *             properties:
 *               decisions:
 *                 type: array
 *                 description: 决策数组
 *                 items:
 *                   type: object
 *                   properties:
 *                     accountId:
 *                       type: string
 *                     decision:
 *                       type: object
 *     responses:
 *       200:
 *         description: 批量执行完成
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
 *                     total:
 *                       type: number
 *                     succeeded:
 *                       type: number
 *                     failed:
 *                       type: number
 *                     details:
 *                       type: array
 *                 message:
 *                   type: string
 */
router.post('/ai-decisions/batch', (req, res) => aiController.batchExecuteAIDecisions(req, res));

export default router;
