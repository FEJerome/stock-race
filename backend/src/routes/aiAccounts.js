import express from 'express';
import { aiController } from '../controllers/AIController.js';
import { authenticate, checkPermission } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /ai-accounts:
 *   get:
 *     tags: [AI账户]
 *     summary: 获取AI账户列表
 *     description: 获取当前用户的AI账户列表，支持分页和状态过滤
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended]
 *         description: 账户状态过滤
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
 *         description: 获取AI账户列表成功
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
router.get('/', authenticate, (req, res) => aiController.getAIAccounts(req, res));

/**
 * @swagger
 * /ai-accounts/{accountId}:
 *   get:
 *     tags: [AI账户]
 *     summary: 获取AI账户详情
 *     description: 获取指定AI账户的详细信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: AI账户ID
 *     responses:
 *       200:
 *         description: 获取AI账户详情成功
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
 *         description: AI账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:accountId', authenticate, (req, res) => aiController.getAIAccountDetail(req, res));

/**
 * @swagger
 * /ai-accounts:
 *   post:
 *     tags: [AI账户]
 *     summary: 创建AI账户
 *     description: 创建新的AI交易账户
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - initialBalance
 *               - strategy
 *             properties:
 *               name:
 *                 type: string
 *                 description: 账户名称
 *               description:
 *                 type: string
 *                 description: 账户描述
 *               initialBalance:
 *                 type: number
 *                 minimum: 10000
 *                 description: 初始资金
 *               strategy:
 *                 type: string
 *                 enum: [conservative, moderate, aggressive]
 *                 description: 交易策略
 *               modelType:
 *                 type: string
 *                 default: 'gpt-4'
 *                 description: AI模型类型
 *               promptTemplate:
 *                 type: string
 *                 default: 'default_trading_analysis'
 *                 description: 提示词模板
 *               config:
 *                 type: object
 *                 description: 账户配置
 *     responses:
 *       201:
 *         description: 创建AI账户成功
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
 */
router.post('/', authenticate, (req, res) => aiController.createAIAccount(req, res));

/**
 * @swagger
 * /ai-accounts/{accountId}:
 *   put:
 *     tags: [AI账户]
 *     summary: 更新AI账户
 *     description: 更新AI账户信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: AI账户ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: 账户名称
 *               description:
 *                 type: string
 *                 description: 账户描述
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended]
 *                 description: 账户状态
 *               strategy:
 *                 type: string
 *                 enum: [conservative, moderate, aggressive]
 *                 description: 交易策略
 *               modelType:
 *                 type: string
 *                 description: AI模型类型
 *               promptTemplate:
 *                 type: string
 *                 description: 提示词模板
 *               config:
 *                 type: object
 *                 description: 账户配置
 *     responses:
 *       200:
 *         description: 更新AI账户成功
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
 *         description: AI账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/:accountId', authenticate, (req, res) => aiController.updateAIAccount(req, res));

/**
 * @swagger
 * /ai-accounts/{accountId}:
 *   delete:
 *     tags: [AI账户]
 *     summary: 删除AI账户
 *     description: 删除指定的AI账户
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: AI账户ID
 *     responses:
 *       200:
 *         description: 删除AI账户成功
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
 *         description: AI账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:accountId', authenticate, (req, res) => aiController.deleteAIAccount(req, res));

/**
 * @swagger
 * /ai-accounts/{accountId}/performance:
 *   get:
 *     tags: [AI账户]
 *     summary: 获取AI账户绩效
 *     description: 获取AI账户的交易绩效数据
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: AI账户ID
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, quarter, year, all]
 *           default: 'month'
 *         description: 统计周期
 *     responses:
 *       200:
 *         description: 获取AI账户绩效成功
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
 *         description: AI账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:accountId/performance', authenticate, (req, res) => aiController.getAccountPerformance(req, res));

/**
 * @swagger
 * /ai-accounts/{accountId}/decisions:
 *   get:
 *     tags: [AI账户]
 *     summary: 获取AI决策历史
 *     description: 获取AI账户的决策历史记录
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: AI账户ID
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
 *         description: 获取AI决策历史成功
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
 *         description: AI账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:accountId/decisions', authenticate, (req, res) => aiController.getAIDecisionHistory(req, res));

/**
 * @swagger
 * /ai-accounts/{accountId}/decisions/request:
 *   post:
 *     tags: [AI账户]
 *     summary: 请求AI决策
 *     description: 请求AI账户进行交易决策分析
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: AI账户ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [analyze, trade]
 *                 description: 决策类型
 *               data:
 *                 type: object
 *                 description: 决策数据
 *     responses:
 *       200:
 *         description: 请求AI决策成功
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
 *         description: AI账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:accountId/decisions/request', authenticate, (req, res) => aiController.requestAIDecision(req, res));

/**
 * @swagger
 * /ai-accounts/{accountId}/balance:
 *   get:
 *     tags: [AI账户]
 *     summary: 获取AI账户余额
 *     description: 获取AI账户的当前余额和总价值
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: AI账户ID
 *     responses:
 *       200:
 *         description: 获取AI账户余额成功
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
 *         description: AI账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:accountId/balance', authenticate, (req, res) => aiController.getAccountBalance(req, res));

/**
 * @swagger
 * /ai-accounts/{accountId}/balance/deposit:
 *   post:
 *     tags: [AI账户]
 *     summary: 充值AI账户
 *     description: 为AI账户充值资金
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: AI账户ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 100
 *                 description: 充值金额
 *               reason:
 *                 type: string
 *                 description: 充值原因
 *     responses:
 *       200:
 *         description: 充值AI账户成功
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
 *         description: AI账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:accountId/balance/deposit', authenticate, (req, res) => aiController.depositBalance(req, res));

/**
 * @swagger
 * /ai-accounts/{accountId}/balance/withdraw:
 *   post:
 *     tags: [AI账户]
 *     summary: 提现AI账户
 *     description: 从AI账户提现资金
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: integer
 *         description: AI账户ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 100
 *                 description: 提现金额
 *               reason:
 *                 type: string
 *                 description: 提现原因
 *     responses:
 *       200:
 *         description: 提现AI账户成功
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
 *         description: AI账户不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:accountId/balance/withdraw', authenticate, (req, res) => aiController.withdrawBalance(req, res));

/**
 * @swagger
 * /ai-accounts/health:
 *   get:
 *     tags: [AI账户]
 *     summary: 检查AI服务健康状态
 *     description: 检查AI服务的健康状态和连接状态
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取AI服务健康状态成功
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
router.get('/health', authenticate, (req, res) => aiController.checkAIServiceHealth(req, res));

export default router;