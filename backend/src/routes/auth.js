import express from 'express';
import { authController } from '../controllers/AuthController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 用户登录
 *     description: 使用密码登录系统
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 description: 登录密码
 *     responses:
 *       200:
 *         description: 登录成功
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
 *                     user:
 *                       type: object
 *                     token:
 *                       type: string
 *                     sessionId:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                     expiresIn:
 *                       type: number
 *                 message:
 *                   type: string
 *       400:
 *         description: 密码不能为空
 *       401:
 *         description: 密码错误
 *       500:
 *         description: 服务器内部错误
 */
router.post('/login', (req, res) => authController.login(req, res));

/**
 * @swagger
 * /api/auth/validate:
 *   get:
 *     summary: 验证令牌
 *     description: 验证JWT令牌的有效性
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 令牌有效
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
 *                     user:
 *                       type: object
 *                     valid:
 *                       type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: 令牌无效或已过期
 *       500:
 *         description: 服务器内部错误
 */
router.get('/validate', (req, res) => authController.validate(req, res));

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: 刷新令牌
 *     description: 刷新JWT令牌
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 令牌刷新成功
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
 *                     token:
 *                       type: string
 *                     expiresIn:
 *                       type: number
 *                 message:
 *                   type: string
 *       400:
 *         description: 缺少认证令牌
 *       401:
 *         description: 令牌无效或已过期
 *       500:
 *         description: 服务器内部错误
 */
router.post('/refresh', (req, res) => authController.refresh(req, res));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: 退出登录
 *     description: 退出当前会话
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: 会话ID（可选）
 *     responses:
 *       200:
 *         description: 退出成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: null
 *                 message:
 *                   type: string
 *       400:
 *         description: 退出失败
 *       500:
 *         description: 服务器内部错误
 */
router.post('/logout', (req, res) => authController.logout(req, res));

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: 获取当前用户信息
 *     description: 获取当前登录用户的详细信息
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取用户信息成功
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
 *                     user:
 *                       type: object
 *                 message:
 *                   type: string
 *       401:
 *         description: 用户未认证
 *       404:
 *         description: 用户不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get('/me', authenticate, (req, res) => authController.getCurrentUser(req, res));

/**
 * @swagger
 * /api/auth/settings:
 *   put:
 *     summary: 更新用户设置
 *     description: 更新当前用户的个人设置
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: [light, dark]
 *               language:
 *                 type: string
 *               timezone:
 *                 type: string
 *               currency:
 *                 type: string
 *               notifications:
 *                 type: object
 *               chartSettings:
 *                 type: object
 *     responses:
 *       200:
 *         description: 更新设置成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: null
 *                 message:
 *                   type: string
 *       400:
 *         description: 设置数据不能为空
 *       401:
 *         description: 用户未认证
 *       500:
 *         description: 服务器内部错误
 */
router.put('/settings', authenticate, (req, res) => authController.updateUserSettings(req, res));

/**
 * @swagger
 * /api/auth/sessions:
 *   get:
 *     summary: 获取用户会话
 *     description: 获取当前用户的所有活跃会话
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取会话成功
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
 *                     sessions:
 *                       type: array
 *                     count:
 *                       type: number
 *                 message:
 *                   type: string
 *       401:
 *         description: 用户未认证
 *       500:
 *         description: 服务器内部错误
 */
router.get('/sessions', authenticate, (req, res) => authController.getUserSessions(req, res));

/**
 * @swagger
 * /api/auth/sessions/force-logout:
 *   post:
 *     summary: 强制退出其他会话
 *     description: 强制退出当前用户的其他会话
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               keepCurrent:
 *                 type: boolean
 *                 description: 是否保留当前会话
 *                 default: true
 *     responses:
 *       200:
 *         description: 强制退出成功
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
 *                     deletedCount:
 *                       type: number
 *                     message:
 *                       type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: 用户未认证
 *       500:
 *         description: 服务器内部错误
 */
router.post('/sessions/force-logout', authenticate, (req, res) => authController.forceLogoutOtherSessions(req, res));

/**
 * @swagger
 * /api/auth/stats:
 *   get:
 *     summary: 获取认证统计
 *     description: 获取系统认证相关的统计数据（需要权限）
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取统计成功
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
 *                     auth:
 *                       type: object
 *                     sessions:
 *                       type: object
 *                     timestamp:
 *                       type: string
 *                 message:
 *                   type: string
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
 */
router.get('/stats', authenticate, (req, res) => authController.getAuthStats(req, res));

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: 用户注册
 *     description: 注册新用户账号
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - confirmPassword
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名（3-20个字符）
 *               password:
 *                 type: string
 *                 description: 密码（至少6个字符）
 *               confirmPassword:
 *                 type: string
 *                 description: 确认密码
 *     responses:
 *       201:
 *         description: 注册成功
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
 *                     user:
 *                       type: object
 *                     token:
 *                       type: string
 *                     sessionId:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                     expiresIn:
 *                       type: number
 *                 message:
 *                   type: string
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: object
 *                 message:
 *                   type: string
 *       500:
 *         description: 服务器内部错误
 */
router.post('/register', (req, res) => authController.register(req, res));

/**
 * @swagger
 * /api/auth/health:
 *   get:
 *     summary: 健康检查
 *     description: 检查认证服务的健康状态
 *     tags: [认证]
 *     responses:
 *       200:
 *         description: 服务健康
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
 *                     auth:
 *                       type: string
 *                     session:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                     version:
 *                       type: string
 *                 message:
 *                   type: string
 *       503:
 *         description: 服务异常
 */
router.get('/health', (req, res) => authController.healthCheck(req, res));

export default router;