/**
 * 游客认证中间件
 * 验证游客Token并将会话信息添加到请求对象
 * 对应需求: O3-003
 */

import GuestService from '../services/GuestService.js';

const guestService = GuestService;

/**
 * 游客认证中间件
 * 验证请求头中的guest-token
 */
export const guestAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'GUEST_AUTH_001',
          message: '缺少游客认证令牌'
        },
        message: '请先获取游客Token'
      });
    }

    const token = authHeader.substring(7);

    // 验证Token
    const session = await guestService.getSession(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'GUEST_AUTH_002',
          message: '游客Token无效或已过期'
        },
        message: '游客Token无效或已过期，请重新获取'
      });
    }

    // 将会话信息添加到请求对象
    req.guestSession = session;
    req.guestToken = token;
    req.isGuest = true;

    next();
  } catch (error) {
    console.error('游客认证中间件错误:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      },
      message: '游客认证失败，请稍后重试'
    });
  }
};

/**
 * 可选游客认证中间件
 * 如果提供了游客Token则验证，否则继续执行
 */
export const optionalGuestAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const session = await guestService.getSession(token);

      if (session) {
        req.guestSession = session;
        req.guestToken = token;
        req.isGuest = true;
        req.guestAuthenticated = true;
      } else {
        req.guestAuthenticated = false;
      }
    } else {
      req.guestAuthenticated = false;
    }

    next();
  } catch (error) {
    console.error('可选游客认证中间件错误:', error);
    req.guestAuthenticated = false;
    next();
  }
};

/**
 * 设备指纹中间件
 * 提取并验证设备指纹
 */
export const deviceFingerprint = async (req, res, next) => {
  try {
    const fingerprint = req.headers['x-device-fingerprint'] ||
                       req.body.device_fingerprint ||
                       req.headers['user-agent'];

    if (!fingerprint) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DEVICE_FINGERPRINT',
          message: '缺少设备指纹'
        },
        message: '请提供设备指纹用于游客认证'
      });
    }

    req.deviceFingerprint = fingerprint;
    next();
  } catch (error) {
    console.error('设备指纹中间件错误:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      },
      message: '设备指纹验证失败'
    });
  }
};

export default {
  guestAuthenticate,
  optionalGuestAuthenticate,
  deviceFingerprint
};
