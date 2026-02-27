/**
 * 三层API路由架构 (O3-004)
 *
 * 路由分层:
 * - /api/v1/public/*   - 公开API，无需认证
 * - /api/v1/guest/*    - 游客API，需要guest-token
 * - /api/v1/*          - 认证API，需要JWT
 *
 * 后端兼容路由:
 * - /api/*             - 现有API（向后兼容）
 */

import express from 'express';
import publicRoutes from './public.js';
import guestTokenRoutes from './guest-token.js';
import guestRoutes from './guest.js';
import authRoutes from './auth.js';
import aiAccountsRoutes from './aiAccounts.js';
import dialogueRoutes from './dialogue.js';
import stocksRoutes from './stocks.js';
import tradesRoutes from './trades.js';
import portfoliosRoutes from './portfolios.js';
import marketRoutes from './market.js';
import rankingsRoutes from './rankings.js';
import adminRoutes from './admin.js';
import adminDialogueRoutes from './admin-dialogue.js';
import tradingStatusRoutes from './trading-status.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import { guestAuthenticate } from '../middleware/guestAuth.js';
import { healthService } from '../services/HealthService.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 系统
 *     description: 系统管理和监控
 */

// ============================================
// 第一层: 公开API (/api/v1/public/*)
// 无需认证，用于公开数据访问
// ============================================

/**
 * @swagger
 * /api/v1/public/health:
 *   get:
 *     summary: 公开健康检查
 *     tags: [公开API]
 *     responses:
 *       200:
 *         description: 系统运行正常
 */
router.get('/public/health', (req, res) => {
  const health = healthService.getBasicHealth();
  res.json({
    success: true,
    data: health,
    message: '系统运行正常'
  });
});

// 公开API路由
router.use('/public', publicRoutes);

// ============================================
// 第二层: 游客API (/api/v1/guest/*)
// 需要guest-token认证
// ============================================

// 游客Token生成接口（无需认证）
router.use('/guest/token', guestTokenRoutes);

// 游客API路由（需要guest-token）
router.use('/guest', guestAuthenticate, guestRoutes);

// ============================================
// 第三层: 认证API (/api/v1/*)
// 需要JWT认证
// ============================================

// 认证路由（登录/注册不需要JWT）
router.use('/auth', authRoutes);

// 健康检查端点
router.get('/health', (req, res) => {
  const health = healthService.getBasicHealth();
  res.json({
    success: true,
    data: health,
    message: '系统运行正常'
  });
});

// 详细健康检查
router.get('/health/detailed', async (req, res) => {
  try {
    const health = await healthService.getDetailedHealth();

    let statusCode = 200;
    if (health.status === 'unhealthy') {
      statusCode = 503;
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
      apiLayers: {
        public: '/api/v1/public',
        guest: '/api/v1/guest',
        authenticated: '/api/v1'
      },
      endpoints: {
        auth: '/api/v1/auth',
        aiAccounts: '/api/v1/ai-accounts',
        stocks: '/api/v1/stocks',
        trades: '/api/v1/trades',
        rankings: '/api/v1/public/rankings',
        market: '/api/v1/public/market'
      },
      authentication: {
        public: '无需认证',
        guest: 'Bearer {guest_token}',
        authenticated: 'Bearer {JWT}'
      }
    },
    message: 'API信息获取成功'
  });
});

// 需要JWT认证的路由
router.use('/ai-accounts', authenticate, aiAccountsRoutes);
router.use('/ai-accounts', authenticate, dialogueRoutes);
router.use('/stocks', authenticate, stocksRoutes);
router.use('/trades', authenticate, tradesRoutes);
router.use('/portfolios', authenticate, portfoliosRoutes);
router.use('/market', authenticate, marketRoutes);
router.use('/rankings', authenticate, rankingsRoutes);
router.use('/trading-status', authenticate, tradingStatusRoutes);
router.use('/admin', authenticate, adminRoutes);
router.use('/admin/dialogue', authenticate, adminDialogueRoutes);

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
      '查看 /api/v1/api-info 获取可用端点列表',
      '确保使用了正确的认证方式'
    ]
  });
});

export default router;
