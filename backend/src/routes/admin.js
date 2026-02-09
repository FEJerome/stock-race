import express from 'express';
import { authenticate, checkRole } from '../middleware/auth.js';
import AdminController from '../controllers/AdminController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 管理员
 *     description: 系统管理员专属功能
 */

/**
 * @swagger
 * /api/admin/metrics/system:
 *   get:
 *     tags: [管理员]
 *     summary: 获取系统性能指标
 *     description: 获取CPU、内存、磁盘、网络等系统性能指标（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 系统性能指标获取成功
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
 *                     cpu:
 *                       type: object
 *                       properties:
 *                         usage:
 *                           type: number
 *                         cores:
 *                           type: integer
 *                         load:
 *                           type: array
 *                           items:
 *                             type: number
 *                     memory:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         used:
 *                           type: integer
 *                         free:
 *                           type: integer
 *                         usage:
 *                           type: number
 *                     disk:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         used:
 *                           type: integer
 *                         free:
 *                           type: integer
 *                         usage:
 *                           type: number
 *                     network:
 *                       type: object
 *                       properties:
 *                         in:
 *                           type: integer
 *                         out:
 *                           type: integer
 *                         connections:
 *                           type: integer
 *                     database:
 *                       type: object
 *                       properties:
 *                         connections:
 *                           type: integer
 *                         queries:
 *                           type: integer
 *                         responseTime:
 *                           type: integer
 *                     services:
 *                       type: object
 *                       properties:
 *                         backend:
 *                           type: string
 *                         aiService:
 *                           type: string
 *                         dataService:
 *                           type: string
 *                         database:
 *                           type: string
 *                         redis:
 *                           type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/metrics/system', authenticate, checkRole('admin'), AdminController.getSystemMetrics);

/**
 * @swagger
 * /api/admin/stats/users:
 *   get:
 *     tags: [管理员]
 *     summary: 获取用户统计信息
 *     description: 获取用户总数、活跃用户、新用户等统计信息（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 用户统计信息获取成功
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
 *                     totalUsers:
 *                       type: integer
 *                     activeUsers:
 *                       type: integer
 *                     newUsers:
 *                       type: integer
 *                     roleDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     activeRate:
 *                       type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/stats/users', authenticate, checkRole('admin'), AdminController.getUserStats);

/**
 * @swagger
 * /api/admin/stats/ai-accounts:
 *   get:
 *     tags: [管理员]
 *     summary: 获取AI账户统计信息
 *     description: 获取AI账户总数、活跃账户、模型分布等统计信息（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI账户统计信息获取成功
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
 *                     totalAccounts:
 *                       type: integer
 *                     activeAccounts:
 *                       type: integer
 *                     activeRate:
 *                       type: string
 *                     modelDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           model:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     riskDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           risk:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     strategyDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           strategy:
 *                             type: string
 *                           count:
 *                             type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/stats/ai-accounts', authenticate, checkRole('admin'), AdminController.getAIAccountStats);

/**
 * @swagger
 * /api/admin/stats/trades:
 *   get:
 *     tags: [管理员]
 *     summary: 获取交易统计信息
 *     description: 获取今日交易、本周交易、交易类型分布等统计信息（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 交易统计信息获取成功
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
 *                     todayTrades:
 *                       type: integer
 *                     weekTrades:
 *                       type: integer
 *                     totalTrades:
 *                       type: integer
 *                     actionDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           action:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     statusDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     amountStats:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         average:
 *                           type: number
 *                         min:
 *                           type: number
 *                         max:
 *                           type: number
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/stats/trades', authenticate, checkRole('admin'), AdminController.getTradeStats);

/**
 * @swagger
 * /api/admin/logs/system:
 *   get:
 *     tags: [管理员]
 *     summary: 获取系统日志
 *     description: 获取系统日志信息，支持按级别和时间过滤（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: 返回日志条数限制
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [info, warning, error, critical]
 *         description: 日志级别过滤
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 开始时间
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 结束时间
 *     responses:
 *       200:
 *         description: 系统日志获取成功
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
 *                       id:
 *                         type: string
 *                       level:
 *                         type: string
 *                       message:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       source:
 *                         type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/logs/system', authenticate, checkRole('admin'), AdminController.getSystemLogs);

/**
 * @swagger
 * /api/admin/health/services:
 *   get:
 *     tags: [管理员]
 *     summary: 获取服务健康状态
 *     description: 获取各个服务的健康状态和响应时间（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 服务健康状态获取成功
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
 *                       name:
 *                         type: string
 *                       endpoint:
 *                         type: string
 *                       status:
 *                         type: string
 *                       responseTime:
 *                         type: integer
 *                       lastCheck:
 *                         type: string
 *                         format: date-time
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/health/services', authenticate, checkRole('admin'), AdminController.getServiceHealth);

/**
 * @swagger
 * /api/admin/metrics/realtime:
 *   get:
 *     tags: [管理员]
 *     summary: 获取实时性能指标
 *     description: 获取CPU、内存、网络等实时性能指标（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: duration
 *         schema:
 *           type: string
 *           enum: [1h, 6h, 24h]
 *           default: 1h
 *         description: 时间范围
 *     responses:
 *       200:
 *         description: 实时性能指标获取成功
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
 *                     cpu:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           value:
 *                             type: number
 *                     memory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           value:
 *                             type: number
 *                     network:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           in:
 *                             type: number
 *                           out:
 *                             type: number
 *                     current:
 *                       type: object
 *                       properties:
 *                         cpu:
 *                           type: number
 *                         memory:
 *                           type: number
 *                         networkIn:
 *                           type: number
 *                         networkOut:
 *                           type: number
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/metrics/realtime', authenticate, checkRole('admin'), AdminController.getRealtimeMetrics);

/**
 * @swagger
 * /api/admin/logs/activities:
 *   get:
 *     tags: [管理员]
 *     summary: 获取用户活动日志
 *     description: 获取用户登录、操作等活动日志（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 返回日志条数限制
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: 用户ID过滤
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: 操作类型过滤
 *     responses:
 *       200:
 *         description: 用户活动日志获取成功
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
 *                       id:
 *                         type: string
 *                       userId:
 *                         type: integer
 *                       username:
 *                         type: string
 *                       action:
 *                         type: string
 *                       ip:
 *                         type: string
 *                       userAgent:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/logs/activities', authenticate, checkRole('admin'), AdminController.getUserActivities);

/**
 * @swagger
 * /api/admin/cache/clear:
 *   post:
 *     tags: [管理员]
 *     summary: 清理系统缓存
 *     description: 清理指定类型或全部系统缓存（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cacheType:
 *                 type: string
 *                 enum: [user, stock, ai, all]
 *                 default: all
 *                 description: 缓存类型
 *     responses:
 *       200:
 *         description: 系统缓存清理成功
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
 *                     cacheType:
 *                       type: string
 *                     clearedAt:
 *                       type: string
 *                       format: date-time
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.post('/cache/clear', authenticate, checkRole('admin'), AdminController.clearSystemCache);

/**
 * @swagger
 * /api/admin/stats/database:
 *   get:
 *     tags: [管理员]
 *     summary: 获取数据库统计信息
 *     description: 获取数据库表记录数、大小、备份等信息（仅管理员）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 数据库统计信息获取成功
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
 *                     tables:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           size:
 *                             type: string
 *                     totalRecords:
 *                       type: integer
 *                     totalSize:
 *                       type: string
 *                     lastBackup:
 *                       type: string
 *                       format: date-time
 *                     backupSize:
 *                       type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/stats/database', authenticate, checkRole('admin'), AdminController.getDatabaseStats);

/**
 * @swagger
 * /api/admin/status:
 *   get:
 *     tags: [管理员]
 *     summary: 获取管理员仪表盘状态
 *     description: 获取系统状态概览，包括数据库统计、交易统计、服务状态等
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 管理员状态获取成功
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
 *                     system:
 *                       type: object
 *                     database:
 *                       type: object
 *                     trading:
 *                       type: object
 *                     services:
 *                       type: object
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/status', authenticate, checkRole('admin'), AdminController.getAdminStatus);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [管理员]
 *     summary: 获取用户列表
 *     description: 获取系统用户列表，支持分页、搜索和筛选
 *     security:
 *       - bearerAuth: []
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
 *         description: 每页数量
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词（用户名或邮箱）
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: 角色筛选
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: 状态筛选
 *     responses:
 *       200:
 *         description: 用户列表获取成功
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
 *                     users:
 *                       type: array
 *                     pagination:
 *                       type: object
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/users', authenticate, checkRole('admin'), AdminController.getUsers);

export default router;