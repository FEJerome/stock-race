import { BaseRepository } from './BaseRepository.js';

export class SystemLogRepository extends BaseRepository {
  constructor() {
    super();
    this.modelName = 'systemLog';
  }

  /**
   * 创建系统日志
   * @param {Object} logData - 日志数据
   * @returns {Promise<Object>}
   */
  async createLog(logData) {
    return this.create(logData);
  }

  /**
   * 批量创建系统日志
   * @param {Array} logs - 日志数据数组
   * @returns {Promise<Object>}
   */
  async batchCreateLogs(logs) {
    return this.createMany(logs);
  }

  /**
   * 获取日志列表
   * @param {Object} filters - 过滤器
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>}
   */
  async getLogs(filters = {}, pagination = { page: 1, limit: 50 }) {
    const where = { ...filters };

    return this.paginate({
      ...pagination,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        },
        account: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }

  /**
   * 按级别获取日志
   * @param {string} level - 日志级别
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getLogsByLevel(level, options = {}) {
    const { limit = 100, days = 7 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.findMany(
      {
        level,
        createdAt: {
          gte: startDate
        }
      },
      { createdAt: 'desc' },
      limit,
      {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    );
  }

  /**
   * 按模块获取日志
   * @param {string} module - 模块名称
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getLogsByModule(module, options = {}) {
    const { limit = 100, days = 7 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.findMany(
      {
        module,
        createdAt: {
          gte: startDate
        }
      },
      { createdAt: 'desc' },
      limit,
      {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    );
  }

  /**
   * 获取错误日志
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getErrorLogs(options = {}) {
    const { limit = 100, days = 7 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.findMany(
      {
        level: {
          in: ['error', 'fatal']
        },
        createdAt: {
          gte: startDate
        }
      },
      { createdAt: 'desc' },
      limit,
      {
        user: {
          select: {
            id: true,
            username: true
          }
        },
        account: {
          select: {
            id: true,
            name: true
          }
        }
      }
    );
  }

  /**
   * 获取日志统计
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async getLogStats(options = {}) {
    const { days = 7 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where = {
      createdAt: {
        gte: startDate
      }
    };

    const [total, byLevel, byModule, byDay] = await Promise.all([
      this.count(where),
      this.prisma.systemLog.groupBy({
        by: ['level'],
        where,
        _count: {
          _all: true
        }
      }),
      this.prisma.systemLog.groupBy({
        by: ['module'],
        where,
        _count: {
          _all: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 10
      }),
      this.prisma.$queryRaw`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as log_count,
          COUNT(CASE WHEN level IN ('error', 'fatal') THEN 1 END) as error_count
        FROM "system_logs"
        WHERE created_at >= ${startDate}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `
    ]);

    return {
      total,
      byLevel: byLevel.reduce((acc, stat) => {
        acc[stat.level] = stat._count._all;
        return acc;
      }, {}),
      byModule: byModule.reduce((acc, stat) => {
        acc[stat.module] = stat._count._all;
        return acc;
      }, {}),
      byDay,
      errorRate: total > 0 ? (byLevel.find(s => s.level === 'error')?._count._all || 0) / total * 100 : 0
    };
  }

  /**
   * 搜索日志
   * @param {string} searchTerm - 搜索关键词
   * @param {Object} filters - 过滤器
   * @param {Object} pagination - 分页参数
   * @returns {Promise<Object>}
   */
  async searchLogs(searchTerm, filters = {}, pagination = { page: 1, limit: 50 }) {
    const where = {
      ...filters,
      OR: [
        { module: { contains: searchTerm, mode: 'insensitive' } },
        { action: { contains: searchTerm, mode: 'insensitive' } },
        { message: { contains: searchTerm, mode: 'insensitive' } },
        { ipAddress: { contains: searchTerm, mode: 'insensitive' } },
        { userAgent: { contains: searchTerm, mode: 'insensitive' } }
      ]
    };

    return this.paginate({
      ...pagination,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        },
        account: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }

  /**
   * 获取用户活动日志
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getUserActivityLogs(userId, options = {}) {
    const { limit = 100, days = 30 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.findMany(
      {
        userId,
        createdAt: {
          gte: startDate
        }
      },
      { createdAt: 'desc' },
      limit,
      {
        account: {
          select: {
            id: true,
            name: true
          }
        }
      }
    );
  }

  /**
   * 获取API调用日志
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async getApiCallLogs(options = {}) {
    const { limit = 100, days = 1 } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.findMany(
      {
        module: 'api',
        createdAt: {
          gte: startDate
        }
      },
      { createdAt: 'desc' },
      limit,
      {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    );
  }

  /**
   * 清理过期日志
   * @param {Date} cutoffDate - 截止日期
   * @param {Array<string>} keepLevels - 保留的日志级别
   * @returns {Promise<Object>}
   */
  async cleanupOldLogs(cutoffDate, keepLevels = ['error', 'fatal']) {
    const where = {
      createdAt: {
        lt: cutoffDate
      }
    };

    if (keepLevels.length > 0) {
      where.level = {
        notIn: keepLevels
      };
    }

    return this.deleteMany(where);
  }

  /**
   * 导出日志
   * @param {Object} filters - 过滤器
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async exportLogs(filters = {}, options = {}) {
    const { limit = 1000 } = options;

    const logs = await this.findMany(
      filters,
      { createdAt: 'desc' },
      limit,
      {
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        account: {
          select: {
            id: true,
            name: true
          }
        }
      }
    );

    return logs.map(log => ({
      id: log.id,
      timestamp: log.createdAt,
      level: log.level,
      module: log.module,
      action: log.action,
      userId: log.userId,
      username: log.user?.username,
      accountId: log.accountId,
      accountName: log.account?.name,
      message: log.message,
      metadata: log.metadata,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      durationMs: log.durationMs
    }));
  }

  /**
   * 记录API调用
   * @param {Object} data - API调用数据
   * @returns {Promise<Object>}
   */
  async logApiCall(data) {
    const {
      userId,
      accountId,
      method,
      path,
      statusCode,
      durationMs,
      ipAddress,
      userAgent,
      metadata = {}
    } = data;

    return this.createLog({
      level: statusCode >= 400 ? 'error' : 'info',
      module: 'api',
      action: `${method} ${path}`,
      userId,
      accountId,
      message: `API调用: ${method} ${path} - ${statusCode}`,
      metadata: {
        ...metadata,
        method,
        path,
        statusCode,
        durationMs
      },
      ipAddress,
      userAgent,
      durationMs
    });
  }

  /**
   * 记录错误
   * @param {Object} data - 错误数据
   * @returns {Promise<Object>}
   */
  async logError(data) {
    const {
      userId,
      accountId,
      module,
      action,
      error,
      ipAddress,
      userAgent,
      metadata = {}
    } = data;

    return this.createLog({
      level: 'error',
      module,
      action,
      userId,
      accountId,
      message: error.message || '未知错误',
      metadata: {
        ...metadata,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code
        }
      },
      ipAddress,
      userAgent
    });
  }

  /**
   * 记录用户活动
   * @param {Object} data - 活动数据
   * @returns {Promise<Object>}
   */
  async logUserActivity(data) {
    const {
      userId,
      accountId,
      module,
      action,
      message,
      ipAddress,
      userAgent,
      metadata = {}
    } = data;

    return this.createLog({
      level: 'info',
      module,
      action,
      userId,
      accountId,
      message,
      metadata,
      ipAddress,
      userAgent
    });
  }
}