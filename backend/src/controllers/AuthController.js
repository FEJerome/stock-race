import { authService } from '../services/AuthService.js';
import { sessionService } from '../services/SessionService.js';
import { userRepository } from '../models/index.js';

export class AuthController {
  /**
   * 简化登录
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!password) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '密码不能为空'
          },
          message: '密码不能为空'
        });
      }

      // 获取客户端信息
      const clientInfo = {
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      // 执行登录
      let result;
      if (username) {
        // 使用标准登录（用户名+密码）
        result = await authService.standardLogin(username, password, clientInfo);
      } else {
        // 使用简化登录（只检查admin密码，兼容旧版本）
        result = await authService.simpleLogin(password, clientInfo);
      }

      if (!result.success) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: result.message
          },
          message: result.message
        });
      }

      // 创建会话
      const session = await sessionService.createSession(
        result.user.id,
        result.user,
        clientInfo
      );

      // 返回响应
      res.json({
        success: true,
        data: {
          user: result.user,
          token: result.token,
          sessionId: session.sessionId,
          expiresAt: session.expiresAt,
          expiresIn: 24 * 60 * 60 // 24小时
        },
        message: result.message
      });
    } catch (error) {
      console.error('登录控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '登录失败，请稍后重试'
      });
    }
  }

  /**
   * 验证令牌
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async validate(req, res) {
    try {
      const authHeader = req.headers.authorization;

      const result = await authService.validateRequest(authHeader);

      if (!result.valid) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: result.message
          },
          message: result.message
        });
      }

      res.json({
        success: true,
        data: {
          user: result.user,
          valid: true
        },
        message: '令牌验证成功'
      });
    } catch (error) {
      console.error('验证令牌控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '验证失败，请稍后重试'
      });
    }
  }

  /**
   * 刷新令牌
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async refresh(req, res) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '缺少认证令牌'
          },
          message: '缺少认证令牌'
        });
      }

      const token = authHeader.substring(7);
      const result = await authService.refreshToken(token);

      if (!result.success) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_002',
            message: result.message
          },
          message: result.message
        });
      }

      res.json({
        success: true,
        data: {
          token: result.token,
          expiresIn: 24 * 60 * 60 // 24小时
        },
        message: result.message
      });
    } catch (error) {
      console.error('刷新令牌控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '刷新令牌失败，请稍后重试'
      });
    }
  }

  /**
   * 退出登录
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async logout(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const { sessionId } = req.body;

      // 获取客户端信息
      const clientInfo = {
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      let token = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }

      // 删除会话
      if (sessionId) {
        await sessionService.deleteSession(sessionId);
      }

      // 执行退出
      const result = await authService.logout(token, clientInfo);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: result.message
          },
          message: result.message
        });
      }

      res.json({
        success: true,
        data: null,
        message: result.message
      });
    } catch (error) {
      console.error('退出登录控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '退出失败，请稍后重试'
      });
    }
  }

  /**
   * 获取当前用户信息
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getCurrentUser(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '用户未认证'
        });
      }

      const result = await authService.getCurrentUser(userId);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND_001',
            message: result.message
          },
          message: result.message
        });
      }

      res.json({
        success: true,
        data: {
          user: result.user
        },
        message: result.message
      });
    } catch (error) {
      console.error('获取用户信息控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取用户信息失败，请稍后重试'
      });
    }
  }

  /**
   * 更新用户设置
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async updateUserSettings(req, res) {
    try {
      const userId = req.user?.id;
      const settings = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '用户未认证'
        });
      }

      if (!settings || Object.keys(settings).length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '设置数据不能为空'
          },
          message: '设置数据不能为空'
        });
      }

      const result = await authService.updateUserSettings(userId, settings);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: result.message
          },
          message: result.message
        });
      }

      res.json({
        success: true,
        data: null,
        message: result.message
      });
    } catch (error) {
      console.error('更新用户设置控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '更新用户设置失败，请稍后重试'
      });
    }
  }

  /**
   * 获取认证统计
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getAuthStats(req, res) {
    try {
      // 检查权限
      const userId = req.user?.id;
      const hasPermission = await authService.checkPermission(userId, 'view_stats');

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: '权限不足'
          },
          message: '权限不足'
        });
      }

      const [authStats, sessionStats] = await Promise.all([
        authService.getAuthStats(),
        sessionService.getSessionStats()
      ]);

      res.json({
        success: true,
        data: {
          auth: authStats,
          sessions: sessionStats,
          timestamp: new Date().toISOString()
        },
        message: '获取认证统计成功'
      });
    } catch (error) {
      console.error('获取认证统计控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取认证统计失败，请稍后重试'
      });
    }
  }

  /**
   * 获取用户会话
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async getUserSessions(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '用户未认证'
        });
      }

      const sessions = await sessionService.getUserSessions(userId);

      res.json({
        success: true,
        data: {
          sessions,
          count: sessions.length
        },
        message: '获取用户会话成功'
      });
    } catch (error) {
      console.error('获取用户会话控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '获取用户会话失败，请稍后重试'
      });
    }
  }

  /**
   * 强制退出其他会话
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async forceLogoutOtherSessions(req, res) {
    try {
      const userId = req.user?.id;
      const { keepCurrent = true } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_001',
            message: '用户未认证'
          },
          message: '用户未认证'
        });
      }

      const currentSessionId = req.headers['x-session-id'];

      let deletedCount = 0;
      if (keepCurrent && currentSessionId) {
        // 获取所有会话
        const allSessions = await sessionService.getUserSessions(userId);

        // 删除除当前会话外的所有会话
        for (const session of allSessions) {
          if (session.sessionId !== currentSessionId) {
            await sessionService.deleteSession(session.sessionId);
            deletedCount++;
          }
        }
      } else {
        // 删除所有会话
        deletedCount = await sessionService.forceLogoutUser(userId);
      }

      res.json({
        success: true,
        data: {
          deletedCount,
          message: `已退出 ${deletedCount} 个其他会话`
        },
        message: '强制退出其他会话成功'
      });
    } catch (error) {
      console.error('强制退出其他会话控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '强制退出其他会话失败，请稍后重试'
      });
    }
  }

  /**
   * 健康检查
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async healthCheck(req, res) {
    try {
      const [authHealthy, sessionHealthy] = await Promise.all([
        authService.getAuthStats().then(() => true).catch(() => false),
        sessionService.getSessionStats().then(() => true).catch(() => false)
      ]);

      const healthStatus = {
        auth: authHealthy ? 'healthy' : 'unhealthy',
        session: sessionHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      };

      const overallHealthy = authHealthy && sessionHealthy;

      res.status(overallHealthy ? 200 : 503).json({
        success: overallHealthy,
        data: healthStatus,
        message: overallHealthy ? '认证服务健康' : '认证服务异常'
      });
    } catch (error) {
      console.error('健康检查控制器错误:', error);
      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: '健康检查失败'
        },
        message: '认证服务异常'
      });
    }
  }

  /**
   * 用户注册
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   */
  async register(req, res) {
    try {
      const { username, password, confirmPassword } = req.body;

      // 验证必填字段
      if (!username || !password || !confirmPassword) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '用户名、密码和确认密码不能为空'
          },
          message: '用户名、密码和确认密码不能为空'
        });
      }

      // 验证密码一致性
      if (password !== confirmPassword) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '密码和确认密码不一致'
          },
          message: '密码和确认密码不一致'
        });
      }

      // 验证用户名长度
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '用户名长度必须在3-20个字符之间'
          },
          message: '用户名长度必须在3-20个字符之间'
        });
      }

      // 验证密码强度
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '密码长度不能少于6个字符'
          },
          message: '密码长度不能少于6个字符'
        });
      }

      // 检查用户名是否已存在
      const existingUser = await userRepository.findByUsername(username);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: '用户名已存在'
          },
          message: '用户名已存在'
        });
      }

      // 获取客户端信息
      const clientInfo = {
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      // 执行注册
      const result = await authService.register(username, password, clientInfo);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: result.message
          },
          message: result.message
        });
      }

      // 创建会话
      const session = await sessionService.createSession(
        result.user.id,
        result.user,
        clientInfo
      );

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email,
            status: result.user.status,
            createdAt: result.user.createdAt
          },
          token: result.token,
          sessionId: session.id,
          expiresAt: session.expiresAt,
          expiresIn: session.expiresIn
        },
        message: '注册成功'
      });

    } catch (error) {
      console.error('注册控制器错误:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        },
        message: '服务器内部错误'
      });
    }
  }
}

// 创建控制器实例
export const authController = new AuthController();