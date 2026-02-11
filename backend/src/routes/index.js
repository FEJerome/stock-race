import express from 'express';
import authRoutes from './auth.js';
import aiAccountsRoutes from './aiAccounts.js';
import stocksRoutes from './stocks.js';
import tradesRoutes from './trades.js';
import portfoliosRoutes from './portfolios.js';
import marketRoutes from './market.js';
import rankingsRoutes from './rankings.js';
import adminRoutes from './admin.js';
import { authenticate, optionalAuthenticate, checkPermission, checkRole } from '../middleware/auth.js';
import { healthService } from '../services/HealthService.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 认证
 *     description: 用户认证和会话管理
 *   - name: 用户
 *     description: 用户信息管理
 *   - name: AI账户
 *     description: AI交易账户管理
 *   - name: 股票
 *     description: 股票数据管理
 *   - name: 交易
 *     description: 虚拟交易管理
 *   - name: 排行榜
 *     description: 竞赛排行榜
 *   - name: 系统
 *     description: 系统管理和监控
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *             message:
 *               type: string
 *         message:
 *           type: string
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *         message:
 *           type: string
 */

// 健康检查端点
router.get('/health', (req, res) => {
  const health = healthService.getBasicHealth();
  res.json({
    success: true,
    data: health,
    message: '系统运行正常'
  });
});

// 详细健康检查端点
router.get('/health/detailed', async (req, res) => {
  try {
    const health = await healthService.getDetailedHealth();

    // 根据状态设置HTTP状态码
    let statusCode = 200;
    if (health.status === 'unhealthy') {
      statusCode = 503;
    } else if (health.status === 'degraded') {
      statusCode = 200; // 仍然返回200，但状态标记为degraded
    }

    res.status(statusCode).json({
      success: health.status !== 'unhealthy',
      data: health,
      message: health.status === 'healthy' ? '所有服务正常运行' :
               health.status === 'degraded' ? '部分服务降级' : '服务不可用'
    });
  } catch (error) {
    console.error('[Health] 详细健康检查失败:', error);
    res.status(503).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: error.message
      },
      message: '健康检查执行失败'
    });
  }
});

// 服务统计端点
router.get('/health/stats', (req, res) => {
  const stats = healthService.getStats();
  res.json({
    success: true,
    data: stats,
    message: '获取服务统计成功'
  });
});

// API信息端点
router.get('/api-info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Stock Race API',
      version: '1.0.0',
      description: '股票竞赛平台API',
      endpoints: {
        auth: '/api/auth',
        users: '/api/users',
        aiAccounts: '/api/ai-accounts',
        stocks: '/api/stocks',
        trades: '/api/trades',
        rankings: '/api/rankings',
        system: '/api/system'
      },
      authentication: {
        type: 'JWT Bearer Token',
        endpoints: {
          login: '/api/auth/login',
          validate: '/api/auth/validate',
          refresh: '/api/auth/refresh'
        }
      }
    },
    message: 'API信息获取成功'
  });
});

// 认证路由
router.use('/auth', authRoutes);

// AI账户路由
router.use('/ai-accounts', aiAccountsRoutes);

// 股票路由
router.use('/stocks', stocksRoutes);

// 交易路由
router.use('/trades', tradesRoutes);

// 持仓路由
router.use('/portfolios', portfoliosRoutes);

// 市场路由
router.use('/market', marketRoutes);

// 排行榜路由
router.use('/rankings', rankingsRoutes);

// 管理员路由（需要管理员权限）
router.use('/admin', adminRoutes);

// 受保护的路由示例（需要认证）
router.get('/protected', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      message: '这是一个受保护的端点',
      user: req.user,
      timestamp: new Date().toISOString()
    },
    message: '访问成功'
  });
});

// 需要管理员权限的路由示例
router.get('/admin-only', authenticate, checkRole('admin'), (req, res) => {
  res.json({
    success: true,
    data: {
      message: '这是一个管理员专属端点',
      user: req.user,
      timestamp: new Date().toISOString()
    },
    message: '管理员访问成功'
  });
});

// 需要特定权限的路由示例
router.get('/stats-only', authenticate, checkPermission('view_stats'), (req, res) => {
  res.json({
    success: true,
    data: {
      message: '这是一个需要查看统计权限的端点',
      user: req.user,
      timestamp: new Date().toISOString()
    },
    message: '访问成功'
  });
});

// 可选认证的路由示例
router.get('/public-or-private', optionalAuthenticate, (req, res) => {
  const message = req.authenticated
    ? `欢迎回来，${req.user.username}！这是您的个性化内容。`
    : '欢迎访客！这是公开内容。';

  res.json({
    success: true,
    data: {
      message,
      authenticated: req.authenticated,
      user: req.user || null,
      timestamp: new Date().toISOString()
    },
    message: '访问成功'
  });
});

// 404处理
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: '请求的端点不存在'
    },
    message: `找不到端点: ${req.originalUrl}`,
    suggestions: [
      '检查端点URL是否正确',
      '查看 /api-info 获取可用端点列表',
      '确保使用了正确的HTTP方法'
    ]
  });
});

export default router;