import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { userRepository } from '../models/index.js';
import { systemLogRepository } from '../models/index.js';
import { config } from '../config.js';

export class AuthService {
  constructor() {
    this.jwtSecret = config.jwtSecret;
    this.jwtExpiresIn = config.jwtExpiresIn;
    this.adminPassword = config.adminPassword;
  }

  /**
   * 验证用户密码
   * @param {string} inputPassword - 输入的密码
   * @param {string} storedHash - 存储的哈希
   * @param {string} salt - 盐值
   * @returns {Promise<boolean>}
   */
  async verifyPassword(inputPassword, storedHash, salt) {
    try {
      const hash = await bcrypt.hash(inputPassword, salt);
      return hash === storedHash;
    } catch (error) {
      console.error('密码验证失败:', error);
      return false;
    }
  }

  /**
   * 生成JWT令牌
   * @param {Object} user - 用户对象
   * @returns {string}
   */
  generateToken(user) {
    const payload = {
      userId: user.id,
      username: user.username,
      email: user.email
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });
  }

  /**
   * 验证JWT令牌
   * @param {string} token - JWT令牌
   * @returns {Promise<Object|null>}
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return decoded;
    } catch (error) {
      console.error('令牌验证失败:', error.message);
      return null;
    }
  }

  /**
   * 标准登录（用户名和密码验证）
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @param {Object} clientInfo - 客户端信息
   * @returns {Promise<{success: boolean, token?: string, user?: Object, message: string}>}
   */
  async standardLogin(username, password, clientInfo = {}) {
    try {
      // 查找用户
      const user = await userRepository.findByUsername(username);

      if (!user) {
        // 记录登录失败
        await this.logLoginAttempt(null, false, '用户不存在', clientInfo);
        return {
          success: false,
          message: '用户名或密码错误'
        };
      }

      // 验证密码
      const isValidPassword = await this.verifyPassword(password, user.passwordHash, user.salt);

      if (!isValidPassword) {
        // 记录登录失败
        await this.logLoginAttempt(user.id, false, '密码错误', clientInfo);
        return {
          success: false,
          message: '用户名或密码错误'
        };
      }

      // 检查用户状态
      if (user.status !== 'active') {
        await this.logLoginAttempt(user.id, false, '用户状态异常', clientInfo);
        return {
          success: false,
          message: '用户已被禁用'
        };
      }

      // 更新最后登录时间
      await userRepository.updateLastLogin(user.id);

      // 生成令牌
      const token = this.generateToken(user);

      // 记录登录成功
      await this.logLoginAttempt(user.id, true, '登录成功', clientInfo);

      return {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        message: '登录成功'
      };
    } catch (error) {
      console.error('登录失败:', error);
      return {
        success: false,
        message: '登录失败，请稍后重试'
      };
    }
  }

  /**
   * 简化登录（兼容旧版本，只检查admin密码）
   * @param {string} password - 密码
   * @param {Object} clientInfo - 客户端信息
   * @returns {Promise<{success: boolean, token?: string, user?: Object, message: string}>}
   */
  async simpleLogin(password, clientInfo = {}) {
    try {
      // 首先尝试使用admin密码登录
      if (password === this.adminPassword) {
        // 获取或创建管理员用户
        let user = await userRepository.findByUsername('admin');

        if (!user) {
          // 创建管理员用户（简化版）
          const salt = await bcrypt.genSalt(10);
          const passwordHash = await bcrypt.hash(this.adminPassword, salt);

          user = await userRepository.createUser({
            username: 'admin',
            email: 'admin@stockrace.com',
            passwordHash,
            salt,
            status: 'active'
          });

          // 创建用户设置
          await this.createDefaultUserSettings(user.id);
        }

        // 更新最后登录时间
        await userRepository.updateLastLogin(user.id);

        // 生成令牌
        const token = this.generateToken(user);

        // 记录登录成功
        await this.logLoginAttempt(user.id, true, '登录成功', clientInfo);

        return {
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email
          },
          message: '登录成功'
        };
      }

      // 如果不是admin密码，尝试查找其他用户
      // 注意：这里简化处理，实际应该根据用户名查找
      // 由于前端只传密码，我们暂时不支持普通用户通过simpleLogin登录
      // 记录登录失败
      await this.logLoginAttempt(null, false, '密码错误', clientInfo);
      return {
        success: false,
        message: '密码错误'
      };
    } catch (error) {
      console.error('登录失败:', error);
      return {
        success: false,
        message: '登录失败，请稍后重试'
      };
    }
  }

  /**
   * 创建默认用户设置
   * @param {number} userId - 用户ID
   */
  async createDefaultUserSettings(userId) {
    try {
      await userRepository.prisma.userSettings.create({
        data: {
          userId,
          theme: 'light',
          language: 'zh_CN',
          timezone: 'Asia/Shanghai',
          currency: 'CNY',
          notifications: {
            tradeExecuted: true,
            aiDecision: true,
            priceAlert: false,
            systemMaintenance: true,
            marketing: false
          },
          chartSettings: {
            defaultPeriod: '1d',
            showVolume: true,
            showMA: true,
            theme: 'light'
          }
        }
      });
    } catch (error) {
      console.error('创建用户设置失败:', error);
    }
  }

  /**
   * 记录登录尝试
   * @param {number|null} userId - 用户ID
   * @param {boolean} success - 是否成功
   * @param {string} message - 消息
   * @param {Object} clientInfo - 客户端信息
   */
  async logLoginAttempt(userId, success, message, clientInfo = {}) {
    try {
      await systemLogRepository.logUserActivity({
        userId,
        module: 'auth',
        action: 'login',
        message: `登录${success ? '成功' : '失败'}: ${message}`,
        ipAddress: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        metadata: {
          success,
          clientInfo
        }
      });
    } catch (error) {
      console.error('记录登录尝试失败:', error);
    }
  }

  /**
   * 验证请求令牌
   * @param {string} authHeader - 认证头
   * @returns {Promise<{valid: boolean, user?: Object, message?: string}>}
   */
  async validateRequest(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        valid: false,
        message: '缺少认证令牌'
      };
    }

    const token = authHeader.substring(7);
    const decoded = await this.verifyToken(token);

    if (!decoded) {
      return {
        valid: false,
        message: '令牌无效或已过期'
      };
    }

    // 检查用户是否存在且活跃
    const user = await userRepository.findOne({
      id: decoded.userId,
      status: 'active'
    });

    if (!user) {
      return {
        valid: false,
        message: '用户不存在或已被禁用'
      };
    }

    return {
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    };
  }

  /**
   * 刷新令牌
   * @param {string} token - 旧令牌
   * @returns {Promise<{success: boolean, token?: string, message: string}>}
   */
  async refreshToken(token) {
    try {
      const decoded = await this.verifyToken(token);

      if (!decoded) {
        return {
          success: false,
          message: '令牌无效或已过期'
        };
      }

      // 检查用户是否存在
      const user = await userRepository.findOne({ id: decoded.userId });

      if (!user) {
        return {
          success: false,
          message: '用户不存在'
        };
      }

      // 生成新令牌
      const newToken = this.generateToken(user);

      return {
        success: true,
        token: newToken,
        message: '令牌刷新成功'
      };
    } catch (error) {
      console.error('刷新令牌失败:', error);
      return {
        success: false,
        message: '刷新令牌失败'
      };
    }
  }

  /**
   * 退出登录
   * @param {string} token - 令牌
   * @param {Object} clientInfo - 客户端信息
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async logout(token, clientInfo = {}) {
    try {
      const decoded = await this.verifyToken(token);

      if (decoded) {
        // 记录退出日志
        await systemLogRepository.logUserActivity({
          userId: decoded.userId,
          module: 'auth',
          action: 'logout',
          message: '用户退出登录',
          ipAddress: clientInfo.ip,
          userAgent: clientInfo.userAgent
        });
      }

      return {
        success: true,
        message: '退出成功'
      };
    } catch (error) {
      console.error('退出失败:', error);
      return {
        success: false,
        message: '退出失败'
      };
    }
  }

  /**
   * 获取当前用户信息
   * @param {number} userId - 用户ID
   * @returns {Promise<{success: boolean, user?: Object, message: string}>}
   */
  async getCurrentUser(userId) {
    try {
      const user = await userRepository.getUserWithSettings(userId);

      if (!user) {
        return {
          success: false,
          message: '用户不存在'
        };
      }

      // 移除敏感信息
      const safeUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        settings: user.userSettings,
        aiAccounts: user.aiAccounts
      };

      return {
        success: true,
        user: safeUser,
        message: '获取用户信息成功'
      };
    } catch (error) {
      console.error('获取用户信息失败:', error);
      return {
        success: false,
        message: '获取用户信息失败'
      };
    }
  }

  /**
   * 更新用户设置
   * @param {number} userId - 用户ID
   * @param {Object} settings - 设置数据
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async updateUserSettings(userId, settings) {
    try {
      await userRepository.prisma.userSettings.update({
        where: { userId },
        data: settings
      });

      // 记录设置更新
      await systemLogRepository.logUserActivity({
        userId,
        module: 'user',
        action: 'update_settings',
        message: '更新用户设置',
        metadata: { settings }
      });

      return {
        success: true,
        message: '更新用户设置成功'
      };
    } catch (error) {
      console.error('更新用户设置失败:', error);
      return {
        success: false,
        message: '更新用户设置失败'
      };
    }
  }

  /**
   * 检查用户权限
   * @param {number} userId - 用户ID
   * @param {string} permission - 权限
   * @returns {Promise<boolean>}
   */
  async checkPermission(userId, permission) {
    // 简化版：所有管理员用户都有所有权限
    const user = await userRepository.findOne({ id: userId });

    if (!user || user.status !== 'active') {
      return false;
    }

    // 这里可以扩展更复杂的权限检查
    return true;
  }

  /**
   * 获取认证统计
   * @returns {Promise<Object>}
   */
  async getAuthStats() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // 获取今日登录统计
      const todayLogs = await systemLogRepository.findMany({
        module: 'auth',
        action: 'login',
        createdAt: {
          gte: today,
          lt: tomorrow
        }
      });

      const stats = {
        today: {
          total: todayLogs.length,
          success: todayLogs.filter(log => log.metadata?.success).length,
          failed: todayLogs.filter(log => !log.metadata?.success).length
        },
        activeUsers: await userRepository.count({ status: 'active' }),
        totalUsers: await userRepository.count()
      };

      return stats;
    } catch (error) {
      console.error('获取认证统计失败:', error);
      return {
        today: { total: 0, success: 0, failed: 0 },
        activeUsers: 0,
        totalUsers: 0
      };
    }
  }

  /**
   * 用户注册
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @param {Object} clientInfo - 客户端信息
   * @returns {Promise<{success: boolean, user?: Object, token?: string, message: string}>}
   */
  async register(username, password, clientInfo = {}) {
    try {
      // 生成盐值和密码哈希
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // 创建用户数据
      const userData = {
        username,
        email: `${username}@example.com`, // 简化版，使用示例邮箱
        passwordHash,
        salt,
        status: 'active'
      };

      // 创建用户
      const user = await userRepository.createUser(userData);

      if (!user) {
        await this.logLoginAttempt(null, false, '用户创建失败', clientInfo);
        return {
          success: false,
          message: '用户创建失败'
        };
      }

      // 生成JWT令牌
      const token = this.generateToken(user);

      // 记录注册成功
      await this.logLoginAttempt(user.id, true, '注册成功', clientInfo);

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          status: user.status,
          createdAt: user.createdAt
        },
        token,
        message: '注册成功'
      };

    } catch (error) {
      console.error('用户注册失败:', error);

      // 记录注册失败
      await this.logLoginAttempt(null, false, `注册失败: ${error.message}`, clientInfo);

      return {
        success: false,
        message: '注册失败，请稍后重试'
      };
    }
  }
}

// 创建单例实例
export const authService = new AuthService();