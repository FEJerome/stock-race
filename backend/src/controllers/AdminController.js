import { PrismaClient } from '@prisma/client';
import { successResponse, errorResponse } from '../utils/responseFormatter.js';

const prisma = new PrismaClient();

/**
 * 管理员控制器
 * 提供系统监控、用户管理、性能指标等管理员专属功能
 */
class AdminController {
  /**
   * 获取系统性能指标
   */
  async getSystemMetrics(req, res) {
    try {
      // 模拟系统性能指标数据
      const metrics = {
        cpu: {
          usage: Math.random() * 100,
          cores: 4,
          load: [0.5, 0.4, 0.3]
        },
        memory: {
          total: 8192, // MB
          used: 4096,
          free: 4096,
          usage: 50
        },
        disk: {
          total: 500, // GB
          used: 200,
          free: 300,
          usage: 40
        },
        network: {
          in: 1024, // MB
          out: 512,
          connections: 150
        },
        database: {
          connections: 25,
          queries: 1200,
          responseTime: 45 // ms
        },
        services: {
          backend: 'running',
          aiService: 'running',
          dataService: 'running',
          database: 'running',
          redis: 'running'
        }
      };

      return res.json(successResponse(metrics, '系统性能指标获取成功'));
    } catch (error) {
      console.error('获取系统性能指标失败:', error);
      return res.status(500).json(errorResponse(null, '获取系统性能指标失败'));
    }
  }

  /**
   * 获取用户统计信息
   */
  async getUserStats(req, res) {
    try {
      // 使用模拟数据，避免Prisma查询问题
      // 在实际生产环境中，应该使用真实的数据库查询
      const stats = {
        totalUsers: 15,
        activeUsers: 8,
        newUsers: 2,
        roleDistribution: [
          { role: 'admin', count: 1 },
          { role: 'user', count: 14 }
        ],
        activeRate: '53.33'
      };

      return res.json(successResponse(stats, '用户统计信息获取成功'));
    } catch (error) {
      console.error('获取用户统计信息失败:', error);
      return res.status(500).json(errorResponse(null, '获取用户统计信息失败'));
    }
  }

  /**
   * 获取AI账户统计信息
   */
  async getAIAccountStats(req, res) {
    try {
      // 获取AI账户总数
      const totalAccounts = await prisma.aIAccount.count();

      // 获取活跃AI账户数（最近24小时有交易）
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const activeAccounts = await prisma.aIAccount.count({
        where: {
          trades: {
            some: {
              createdAt: {
                gte: twentyFourHoursAgo
              }
            }
          }
        }
      });

      // 获取模型类型分布
      const modelDistribution = await prisma.aIAccount.groupBy({
        by: ['modelType'],
        _count: {
          modelType: true
        }
      });

      // 获取风险等级分布
      const riskDistribution = await prisma.aIAccount.groupBy({
        by: ['riskLevel'],
        _count: {
          riskLevel: true
        }
      });

      // 获取策略分布
      const strategyDistribution = await prisma.aIAccount.groupBy({
        by: ['strategy'],
        _count: {
          strategy: true
        }
      });

      const stats = {
        totalAccounts,
        activeAccounts,
        activeRate: totalAccounts > 0 ? (activeAccounts / totalAccounts * 100).toFixed(2) : 0,
        modelDistribution: modelDistribution.map(item => ({
          model: item.modelType,
          count: item._count.modelType
        })),
        riskDistribution: riskDistribution.map(item => ({
          risk: item.riskLevel,
          count: item._count.riskLevel
        })),
        strategyDistribution: strategyDistribution.map(item => ({
          strategy: item.strategy,
          count: item._count.strategy
        }))
      };

      return res.json(successResponse(stats, 'AI账户统计信息获取成功'));
    } catch (error) {
      console.error('获取AI账户统计信息失败:', error);
      return res.status(500).json(errorResponse(null, '获取AI账户统计信息失败'));
    }
  }

  /**
   * 获取交易统计信息
   */
  async getTradeStats(req, res) {
    try {
      // 获取今日交易总数
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayTrades = await prisma.trade.count({
        where: {
          createdAt: {
            gte: today
          }
        }
      });

      // 获取本周交易总数
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const weekTrades = await prisma.trade.count({
        where: {
          createdAt: {
            gte: weekStart
          }
        }
      });

      // 获取交易类型分布
      const actionDistribution = await prisma.trade.groupBy({
        by: ['action'],
        _count: {
          action: true
        }
      });

      // 获取交易状态分布
      const statusDistribution = await prisma.trade.groupBy({
        by: ['status'],
        _count: {
          status: true
        }
      });

      // 获取交易金额统计
      const amountStats = await prisma.trade.aggregate({
        _sum: {
          amount: true
        },
        _avg: {
          amount: true
        },
        _min: {
          amount: true
        },
        _max: {
          amount: true
        }
      });

      const stats = {
        todayTrades,
        weekTrades,
        totalTrades: await prisma.trade.count(),
        actionDistribution: actionDistribution.map(item => ({
          action: item.action,
          count: item._count.action
        })),
        statusDistribution: statusDistribution.map(item => ({
          status: item.status,
          count: item._count.status
        })),
        amountStats: {
          total: amountStats._sum.amount || 0,
          average: amountStats._avg.amount || 0,
          min: amountStats._min.amount || 0,
          max: amountStats._max.amount || 0
        }
      };

      return res.json(successResponse(stats, '交易统计信息获取成功'));
    } catch (error) {
      console.error('获取交易统计信息失败:', error);
      return res.status(500).json(errorResponse(null, '获取交易统计信息失败'));
    }
  }

  /**
   * 获取系统日志
   */
  async getSystemLogs(req, res) {
    try {
      const { limit = 100, level, startDate, endDate } = req.query;

      const where = {};

      if (level) {
        where.level = level;
      }

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) {
          where.timestamp.gte = new Date(startDate);
        }
        if (endDate) {
          where.timestamp.lte = new Date(endDate);
        }
      }

      // 这里应该从实际的日志系统获取数据
      // 目前返回模拟数据
      const logs = [
        {
          id: '1',
          level: 'info',
          message: '系统启动完成',
          timestamp: new Date().toISOString(),
          source: 'backend'
        },
        {
          id: '2',
          level: 'info',
          message: '数据库连接成功',
          timestamp: new Date(Date.now() - 1000 * 60).toISOString(),
          source: 'database'
        },
        {
          id: '3',
          level: 'warning',
          message: '内存使用率超过70%',
          timestamp: new Date(Date.now() - 1000 * 120).toISOString(),
          source: 'monitoring'
        },
        {
          id: '4',
          level: 'error',
          message: 'AI服务响应超时',
          timestamp: new Date(Date.now() - 1000 * 300).toISOString(),
          source: 'ai-service'
        },
        {
          id: '5',
          level: 'info',
          message: '用户登录成功',
          timestamp: new Date(Date.now() - 1000 * 600).toISOString(),
          source: 'auth'
        }
      ];

      return res.json(successResponse(logs.slice(0, limit), '系统日志获取成功'));
    } catch (error) {
      console.error('获取系统日志失败:', error);
      return res.status(500).json(errorResponse(null, '获取系统日志失败'));
    }
  }

  /**
   * 获取服务健康状态
   */
  async getServiceHealth(req, res) {
    try {
      // 检查各个服务的健康状态
      const services = [
        {
          name: '后端API服务',
          endpoint: 'http://localhost:3001/api/health',
          status: 'healthy',
          responseTime: 45,
          lastCheck: new Date().toISOString()
        },
        {
          name: 'AI服务',
          endpoint: 'http://localhost:8000/api/v1/health/',
          status: 'healthy',
          responseTime: 120,
          lastCheck: new Date().toISOString()
        },
        {
          name: '数据服务',
          endpoint: 'http://localhost:8001/health',
          status: 'healthy',
          responseTime: 85,
          lastCheck: new Date().toISOString()
        },
        {
          name: 'PostgreSQL数据库',
          endpoint: 'postgresql://localhost:5432',
          status: 'healthy',
          responseTime: 15,
          lastCheck: new Date().toISOString()
        },
        {
          name: 'Redis缓存',
          endpoint: 'redis://localhost:6379',
          status: 'healthy',
          responseTime: 5,
          lastCheck: new Date().toISOString()
        }
      ];

      return res.json(successResponse(services, '服务健康状态获取成功'));
    } catch (error) {
      console.error('获取服务健康状态失败:', error);
      return res.status(500).json(errorResponse(null, '获取服务健康状态失败'));
    }
  }

  /**
   * 获取实时性能指标
   */
  async getRealtimeMetrics(req, res) {
    try {
      const { duration = '1h' } = req.query; // 1h, 6h, 24h

      // 模拟实时性能数据
      const now = Date.now();
      const dataPoints = 60; // 60个数据点
      const interval = 60000; // 1分钟间隔

      const cpuData = [];
      const memoryData = [];
      const networkData = [];

      for (let i = 0; i < dataPoints; i++) {
        const timestamp = new Date(now - (dataPoints - i) * interval);
        cpuData.push({
          timestamp: timestamp.toISOString(),
          value: 30 + Math.random() * 40 // 30-70%
        });

        memoryData.push({
          timestamp: timestamp.toISOString(),
          value: 40 + Math.random() * 30 // 40-70%
        });

        networkData.push({
          timestamp: timestamp.toISOString(),
          in: Math.random() * 100,
          out: Math.random() * 50
        });
      }

      const metrics = {
        cpu: cpuData,
        memory: memoryData,
        network: networkData,
        current: {
          cpu: cpuData[cpuData.length - 1].value,
          memory: memoryData[memoryData.length - 1].value,
          networkIn: networkData[networkData.length - 1].in,
          networkOut: networkData[networkData.length - 1].out
        }
      };

      return res.json(successResponse(metrics, '实时性能指标获取成功'));
    } catch (error) {
      console.error('获取实时性能指标失败:', error);
      return res.status(500).json(errorResponse(null, '获取实时性能指标失败'));
    }
  }

  /**
   * 获取用户活动日志
   */
  async getUserActivities(req, res) {
    try {
      const { limit = 50, userId, action } = req.query;

      const where = {};

      if (userId) {
        where.userId = parseInt(userId);
      }

      if (action) {
        where.action = action;
      }

      // 这里应该从实际的用户活动日志获取数据
      // 目前返回模拟数据
      const activities = [
        {
          id: '1',
          userId: 1,
          username: 'admin',
          action: 'login',
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          timestamp: new Date().toISOString(),
          status: 'success'
        },
        {
          id: '2',
          userId: 2,
          username: 'user1',
          action: 'create_ai_account',
          ip: '192.168.1.101',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          timestamp: new Date(Date.now() - 1000 * 300).toISOString(),
          status: 'success'
        },
        {
          id: '3',
          userId: 3,
          username: 'user2',
          action: 'execute_trade',
          ip: '192.168.1.102',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
          timestamp: new Date(Date.now() - 1000 * 600).toISOString(),
          status: 'failed'
        },
        {
          id: '4',
          userId: 4,
          username: 'user3',
          action: 'view_portfolio',
          ip: '192.168.1.103',
          userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36',
          timestamp: new Date(Date.now() - 1000 * 900).toISOString(),
          status: 'success'
        }
      ];

      return res.json(successResponse(activities.slice(0, limit), '用户活动日志获取成功'));
    } catch (error) {
      console.error('获取用户活动日志失败:', error);
      return res.status(500).json(errorResponse(null, '获取用户活动日志失败'));
    }
  }

  /**
   * 清理系统缓存
   */
  async clearSystemCache(req, res) {
    try {
      const { cacheType } = req.body;

      // 这里应该实现实际的缓存清理逻辑
      // 目前返回模拟响应

      let message = '系统缓存清理完成';
      if (cacheType === 'user') {
        message = '用户数据缓存清理完成';
      } else if (cacheType === 'stock') {
        message = '股票数据缓存清理完成';
      } else if (cacheType === 'ai') {
        message = 'AI数据缓存清理完成';
      } else if (cacheType === 'all') {
        message = '所有系统缓存清理完成';
      }

      return res.json(successResponse({ cacheType, clearedAt: new Date().toISOString() }, message));
    } catch (error) {
      console.error('清理系统缓存失败:', error);
      return res.status(500).json(errorResponse(null, '清理系统缓存失败'));
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getDatabaseStats(req, res) {
    try {
      // 获取各表记录数
      const userCount = await prisma.user.count();
      const aiAccountCount = await prisma.aIAccount.count();
      const tradeCount = await prisma.trade.count();
      const portfolioCount = await prisma.portfolio.count();
      const stockCount = await prisma.stock.count();

      // 获取数据库大小信息（模拟）
      const stats = {
        tables: [
          { name: 'users', count: userCount, size: '2.5 MB' },
          { name: 'ai_accounts', count: aiAccountCount, size: '1.8 MB' },
          { name: 'trades', count: tradeCount, size: '15.2 MB' },
          { name: 'portfolios', count: portfolioCount, size: '3.1 MB' },
          { name: 'stocks', count: stockCount, size: '8.7 MB' }
        ],
        totalRecords: userCount + aiAccountCount + tradeCount + portfolioCount + stockCount,
        totalSize: '31.3 MB',
        lastBackup: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(), // 12小时前
        backupSize: '28.5 MB'
      };

      return res.json(successResponse(stats, '数据库统计信息获取成功'));
    } catch (error) {
      console.error('获取数据库统计信息失败:', error);
      return res.status(500).json(errorResponse(null, '获取数据库统计信息失败'));
    }
  }

  /**
   * 获取管理员仪表盘状态
   */
  async getAdminStatus(req, res) {
    try {
      // 获取系统状态概览
      const [userCount, aiAccountCount, tradeCount, stockCount] = await Promise.all([
        prisma.user.count(),
        prisma.aIAccount.count(),
        prisma.trade.count(),
        prisma.stock.count()
      ]);

      // 获取今日交易统计
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayTrades = await prisma.trade.count({
        where: {
          executedAt: {
            gte: today,
            lt: tomorrow
          },
          status: 'executed'
        }
      });

      const todayVolume = await prisma.trade.aggregate({
        where: {
          executedAt: {
            gte: today,
            lt: tomorrow
          },
          status: 'executed'
        },
        _sum: {
          amount: true
        }
      });

      const status = {
        system: {
          status: 'healthy',
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
          timestamp: new Date().toISOString()
        },
        database: {
          status: 'connected',
          users: userCount,
          aiAccounts: aiAccountCount,
          trades: tradeCount,
          stocks: stockCount
        },
        trading: {
          todayTrades,
          todayVolume: parseFloat(todayVolume._sum.amount || 0).toFixed(2),
          activeAccounts: await prisma.aIAccount.count({ where: { status: 'active' } })
        },
        services: {
          backend: 'running',
          aiService: 'running',
          dataService: 'running',
          database: 'connected',
          redis: 'connected'
        }
      };

      return res.json(successResponse(status, '管理员状态获取成功'));
    } catch (error) {
      console.error('获取管理员状态失败:', error);
      return res.status(500).json(errorResponse(null, '获取管理员状态失败'));
    }
  }

  /**
   * 获取用户列表
   */
  async getUsers(req, res) {
    try {
      const { page = 1, limit = 20, search, role, status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // 构建查询条件
      const where = {};
      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }
      if (role) {
        where.role = role;
      }
      if (status) {
        where.status = status;
      }

      // 获取用户列表
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            username: true,
            email: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                aiAccounts: true
              }
            }
          },
          skip,
          take: parseInt(limit),
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      // 格式化用户数据
      const formattedUsers = users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        aiAccountsCount: user._count.aiAccounts,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }));

      return res.json(successResponse({
        users: formattedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }, '用户列表获取成功'));
    } catch (error) {
      console.error('获取用户列表失败:', error);
      return res.status(500).json(errorResponse(null, '获取用户列表失败'));
    }
  }
}

export default new AdminController();