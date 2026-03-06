import { BaseRepository } from './BaseRepository.js';

export class UserRepository extends BaseRepository {
  constructor() {
    super();
    this.modelName = 'User';
  }

  /**
   * 根据用户名查找用户
   * @param {string} username - 用户名
   * @returns {Promise<Object|null>}
   */
  async findByUsername(username) {
    return this.findOne({ username });
  }

  /**
   * 根据邮箱查找用户
   * @param {string} email - 邮箱
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email) {
    return this.findOne({ email });
  }

  /**
   * 创建用户
   * @param {Object} userData - 用户数据
   * @param {string} userData.username - 用户名
   * @param {string} userData.email - 邮箱
   * @param {string} userData.passwordHash - 密码哈希
   * @param {string} userData.salt - 盐值
   * @returns {Promise<Object>}
   */
  async createUser(userData) {
    return this.create(userData);
  }

  /**
   * 更新用户最后登录时间
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>}
   */
  async updateLastLogin(userId) {
    return this.update(userId, {
      lastLoginAt: new Date(),
      failedLoginAttempts: 0,
      lockUntil: null
    });
  }

  /**
   * 增加登录失败次数
   * @param {number} userId - 用户ID
   * @param {number} maxAttempts - 最大尝试次数
   * @param {number} lockDurationMinutes - 锁定持续时间（分钟）
   * @returns {Promise<Object>}
   */
  async incrementFailedLogin(userId, maxAttempts = 5, lockDurationMinutes = 30) {
    const user = await this.findOne({ id: userId });

    if (!user) {
      throw new Error('用户不存在');
    }

    const newAttempts = user.failedLoginAttempts + 1;
    let lockUntil = null;

    if (newAttempts >= maxAttempts) {
      lockUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000);
    }

    return this.update(userId, {
      failedLoginAttempts: newAttempts,
      lockUntil
    });
  }

  /**
   * 检查用户是否被锁定
   * @param {Object} user - 用户对象
   * @returns {boolean}
   */
  isUserLocked(user) {
    if (!user.lockUntil) {
      return false;
    }

    return new Date(user.lockUntil) > new Date();
  }

  /**
   * 解锁用户
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>}
   */
  async unlockUser(userId) {
    return this.update(userId, {
      failedLoginAttempts: 0,
      lockUntil: null
    });
  }

  /**
   * 更新用户状态
   * @param {number} userId - 用户ID
   * @param {string} status - 状态
   * @returns {Promise<Object>}
   */
  async updateStatus(userId, status) {
    return this.update(userId, { status });
  }

  /**
   * 获取用户及其设置
   * @param {number} userId - 用户ID
   * @returns {Promise<Object|null>}
   */
  async getUserWithSettings(userId) {
    return this.findOne(
      { id: userId },
      {
        include: {
          userSettings: true,
          aiAccounts: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' }
          }
        }
      }
    );
  }

  /**
   * 搜索用户
   * @param {string} searchTerm - 搜索关键词
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>}
   */
  async searchUsers(searchTerm, pagination = { page: 1, limit: 20 }) {
    const where = {
      OR: [
        { username: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } }
      ]
    };

    return this.paginate({
      ...pagination,
      where,
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * 获取活跃用户统计
   * @returns {Promise<Object>}
   */
  async getActiveUserStats() {
    const [total, active, inactive, suspended] = await Promise.all([
      this.count(),
      this.count({ status: 'active' }),
      this.count({ status: 'inactive' }),
      this.count({ status: 'suspended' })
    ]);

    return {
      total,
      active,
      inactive,
      suspended,
      activePercentage: total > 0 ? (active / total) * 100 : 0
    };
  }

  /**
   * 获取用户活动日志
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getUserActivityLogs(userId, options = { limit: 50 }) {
    return this.prisma.systemLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
      include: {
        account: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }
}