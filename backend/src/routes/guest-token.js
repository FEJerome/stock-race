/**
 * 游客Token接口 (O3-003)
 * 路径: /api/v1/guest/token
 * 无需JWT认证，但需要设备指纹
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import GuestService from '../services/GuestService.js';
import crypto from 'crypto';

const router = express.Router();

// 游客Token生成限流 - 10 req/min/IP
const guestTokenLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '请求过于频繁，请稍后再试'
    },
    message: '游客Token请求频率限制为10次/分钟'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @swagger
 * tags:
 *   - name: 游客API
 *     description: 游客模式相关接口
 */

/**
 * @swagger
 * /api/v1/guest/token:
 *   post:
 *     summary: 创建游客Token
 *     tags: [游客API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - device_fingerprint
 *             properties:
 *               device_fingerprint:
 *                 type: string
 *                 description: 设备指纹，用于标识游客设备
 *     responses:
 *       200:
 *         description: 成功创建游客Token
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
 *                     guest_token:
 *                       type: string
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: 参数错误
 *       429:
 *         description: 请求过于频繁
 */
router.post('/token', guestTokenLimiter, [
  body('device_fingerprint')
    .notEmpty()
    .withMessage('设备指纹是必填字段')
    .isString()
    .withMessage('设备指纹必须是字符串')
    .isLength({ min: 10, max: 500 })
    .withMessage('设备指纹长度必须在10-500字符之间')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          details: errors.array()
        },
        message: '请提供有效的设备指纹'
      });
    }

    const { device_fingerprint } = req.body;

    // 使用设备指纹生成唯一的openid
    const openid = crypto.createHash('sha256')
      .update(device_fingerprint)
      .digest('hex');

    // 创建游客Token
    const result = await GuestService.createGuestToken(openid);

    res.json({
      success: true,
      data: {
        guest_token: result.token,
        expires_at: result.expiresAt
      },
      message: '游客Token创建成功'
    });
  } catch (error) {
    console.error('[Guest API] 创建游客Token失败:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      },
      message: '创建游客Token失败，请稍后重试'
    });
  }
});

/**
 * @swagger
 * /api/v1/guest/token/refresh:
 *   post:
 *     summary: 刷新游客Token
 *     tags: [游客API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功刷新游客Token
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
 *                     guest_token:
 *                       type: string
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Token无效或已过期
 */
router.post('/token/refresh', guestTokenLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '缺少游客Token'
        },
        message: '请先获取游客Token'
      });
    }

    const oldToken = authHeader.substring(7);

    // 验证旧Token并获取会话
    const session = await GuestService.getSession(oldToken);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: '游客Token无效或已过期'
        },
        message: '游客Token无效或已过期，请重新获取'
      });
    }

    // 使用相同的openid生成新Token
    const openidHash = session.openidHash;
    // 从hash反推openid（这里简化处理，实际应该从存储中获取）
    // 实际实现应该重新使用设备指纹
    const result = await GuestService.createGuestToken(openidHash);

    res.json({
      success: true,
      data: {
        guest_token: result.token,
        expires_at: result.expiresAt
      },
      message: '游客Token刷新成功'
    });
  } catch (error) {
    console.error('[Guest API] 刷新游客Token失败:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      },
      message: '刷新游客Token失败，请稍后重试'
    });
  }
});

/**
 * @swagger
 * /api/v1/guest/token/validate:
 *   get:
 *     summary: 验证游客Token
 *     tags: [游客API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token有效
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
 *                     valid:
 *                       type: boolean
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Token无效或已过期
 */
router.get('/token/validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '缺少游客Token'
        },
        message: '请先获取游客Token'
      });
    }

    const token = authHeader.substring(7);
    const session = await GuestService.getSession(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: '游客Token无效或已过期'
        },
        message: '游客Token无效或已过期'
      });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        expires_at: session.expiresAt
      },
      message: 'Token验证成功'
    });
  } catch (error) {
    console.error('[Guest API] 验证游客Token失败:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      },
      message: '验证游客Token失败'
    });
  }
});

export default router;
