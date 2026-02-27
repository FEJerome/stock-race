import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 监控服务
 * 负责收集、存储和分析系统性能指标
 */
class MonitoringService {
  constructor() {
    this.metrics = new Map();
    this.alerts = [];
    this.alertRules = [];
    this.initializeAlertRules();
  }

  /**
   * 初始化告警规则
   */
  initializeAlertRules() {
    this.alertRules = [
      {
        id: 'cpu_high',
        name: 'CPU使用率过高',
        metric: 'cpu.usage',
        condition: 'gt',
        threshold: 80,
        level: 'warning',
        duration: 300, // 5分钟
        enabled: true
      },
      {
        id: 'memory_high',
        name: '内存使用率过高',
        metric: 'memory.usage',
        condition: 'gt',
        threshold: 85,
        level: 'warning',
        duration: 300,
        enabled: true
      },
      {
        id: 'disk_high',
        name: '磁盘使用率过高',
        metric: 'disk.usage',
        condition: 'gt',
        threshold: 90,
        level: 'critical',
        duration: 600, // 10分钟
        enabled: true
      },
      {
        id: 'api_slow',
        name: 'API响应时间过慢',
        metric: 'api.response_time',
        condition: 'gt',
        threshold: 1000, // 1秒
        level: 'warning',
        duration: 180, // 3分钟
        enabled: true
      },
      {
        id: 'db_connections_high',
        name: '数据库连接数过高',
        metric: 'database.connections',
        condition: 'gt',
        threshold: 50,
        level: 'warning',
        duration: 300,
        enabled: true
      }
    ];
  }

  /**
   * 记录性能指标
   */
  async recordMetric(metricName, value, tags = {}) {
    try {
      const timestamp = new Date();
      const metricKey = `${metricName}_${JSON.stringify(tags)}`;

      // 存储到内存缓存
      if (!this.metrics.has(metricKey)) {
        this.metrics.set(metricKey, []);
      }

      const metricData = {
        timestamp,
        value,
        tags
      };

      this.metrics.get(metricKey).push(metricData);

      // 限制缓存大小
      if (this.metrics.get(metricKey).length > 1000) {
        this.metrics.get(metricKey).shift();
      }

      // 检查告警规则
      await this.checkAlerts(metricName, value, tags);

      return metricData;
    } catch (error) {
      console.error('记录性能指标失败:', error);
      throw error;
    }
  }

  /**
   * 检查告警规则
   */
  async checkAlerts(metricName, value, tags) {
    try {
      const relevantRules = this.alertRules.filter(rule =>
        rule.enabled && rule.metric === metricName
      );

      for (const rule of relevantRules) {
        let shouldAlert = false;

        switch (rule.condition) {
          case 'gt':
            shouldAlert = value > rule.threshold;
            break;
          case 'lt':
            shouldAlert = value < rule.threshold;
            break;
          case 'eq':
            shouldAlert = value === rule.threshold;
            break;
          case 'neq':
            shouldAlert = value !== rule.threshold;
            break;
        }

        if (shouldAlert) {
          await this.createAlert(rule, value, tags);
        }
      }
    } catch (error) {
      console.error('检查告警规则失败:', error);
    }
  }

  /**
   * 创建告警
   */
  async createAlert(rule, value, tags) {
    try {
      const now = new Date();
      const existingAlert = this.alerts.find(alert =>
        alert.ruleId === rule.id &&
        !alert.resolved &&
        (now - new Date(alert.createdAt)) < rule.duration * 1000
      );

      if (existingAlert) {
        // 更新现有告警
        existingAlert.lastOccurrence = now;
        existingAlert.occurrenceCount += 1;
        return existingAlert;
      }

      const alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ruleId: rule.id,
        name: rule.name,
        level: rule.level,
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        condition: rule.condition,
        tags,
        createdAt: now,
        lastOccurrence: now,
        occurrenceCount: 1,
        resolved: false,
        acknowledged: false,
        resolvedAt: null
      };

      this.alerts.push(alert);

      // 限制告警数量
      if (this.alerts.length > 1000) {
        this.alerts.shift();
      }

      // 发送通知（这里可以集成邮件、短信、Webhook等）
      await this.sendNotification(alert);

      return alert;
    } catch (error) {
      console.error('创建告警失败:', error);
      throw error;
    }
  }

  /**
   * 发送通知
   */
  async sendNotification(alert) {
    try {
      // 这里可以实现邮件、短信、Webhook等通知方式
      // 目前只记录到控制台
      console.log(`[${alert.level.toUpperCase()}] ${alert.name}: ${alert.metric}=${alert.value}, threshold=${alert.threshold}`);

      // 模拟发送通知
      return true;
    } catch (error) {
      console.error('发送通知失败:', error);
      throw error;
    }
  }

  /**
   * 获取性能指标
   */
  async getMetrics(metricName, tags = {}, startTime, endTime, limit = 100) {
    try {
      const metricKey = `${metricName}_${JSON.stringify(tags)}`;

      if (!this.metrics.has(metricKey)) {
        return [];
      }

      let metrics = this.metrics.get(metricKey);

      // 时间过滤
      if (startTime) {
        const start = new Date(startTime);
        metrics = metrics.filter(m => m.timestamp >= start);
      }

      if (endTime) {
        const end = new Date(endTime);
        metrics = metrics.filter(m => m.timestamp <= end);
      }

      // 限制数量
      if (limit && metrics.length > limit) {
        metrics = metrics.slice(-limit);
      }

      return metrics;
    } catch (error) {
      console.error('获取性能指标失败:', error);
      throw error;
    }
  }

  /**
   * 获取告警列表
   */
  async getAlerts(filters = {}) {
    try {
      let alerts = [...this.alerts];

      // 应用过滤器
      if (filters.level) {
        alerts = alerts.filter(alert => alert.level === filters.level);
      }

      if (filters.resolved !== undefined) {
        alerts = alerts.filter(alert => alert.resolved === filters.resolved);
      }

      if (filters.acknowledged !== undefined) {
        alerts = alerts.filter(alert => alert.acknowledged === filters.acknowledged);
      }

      if (filters.startTime) {
        const start = new Date(filters.startTime);
        alerts = alerts.filter(alert => alert.createdAt >= start);
      }

      if (filters.endTime) {
        const end = new Date(filters.endTime);
        alerts = alerts.filter(alert => alert.createdAt <= end);
      }

      // 排序：未确认的告警在前，按时间倒序
      alerts.sort((a, b) => {
        if (a.acknowledged !== b.acknowledged) {
          return a.acknowledged ? 1 : -1;
        }
        return b.createdAt - a.createdAt;
      });

      // 限制数量
      if (filters.limit && alerts.length > filters.limit) {
        alerts = alerts.slice(0, filters.limit);
      }

      return alerts;
    } catch (error) {
      console.error('获取告警列表失败:', error);
      throw error;
    }
  }

  /**
   * 确认告警
   */
  async acknowledgeAlert(alertId) {
    try {
      const alert = this.alerts.find(a => a.id === alertId);

      if (!alert) {
        throw new Error('告警不存在');
      }

      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();

      return alert;
    } catch (error) {
      console.error('确认告警失败:', error);
      throw error;
    }
  }

  /**
   * 解决告警
   */
  async resolveAlert(alertId) {
    try {
      const alert = this.alerts.find(a => a.id === alertId);

      if (!alert) {
        throw new Error('告警不存在');
      }

      alert.resolved = true;
      alert.resolvedAt = new Date();

      return alert;
    } catch (error) {
      console.error('解决告警失败:', error);
      throw error;
    }
  }

  /**
   * 获取系统概览统计
   */
  async getSystemOverview() {
    try {
      // 获取用户统计
      const userCount = await prisma.user.count();
      const activeUsers = await prisma.user.count({
        where: {
          lastLogin: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 最近7天
          }
        }
      });

      // 获取AI账户统计
      const aiAccountCount = await prisma.aiAccount.count();
      const activeAIAccounts = await prisma.aiAccount.count({
        where: {
          isActive: true
        }
      });

      // 获取交易统计
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayTrades = await prisma.trade.count({
        where: {
          createdAt: {
            gte: today
          }
        }
      });

      const totalTrades = await prisma.trade.count();

      // 获取持仓统计
      const portfolioCount = await prisma.portfolio.count();
      const totalPortfolioValue = await prisma.portfolio.aggregate({
        _sum: {
          currentValue: true
        }
      });

      // 获取告警统计
      const activeAlerts = this.alerts.filter(a => !a.resolved).length;
      const unacknowledgedAlerts = this.alerts.filter(a => !a.acknowledged && !a.resolved).length;

      return {
        users: {
          total: userCount,
          active: activeUsers,
          activeRate: userCount > 0 ? (activeUsers / userCount * 100).toFixed(2) : 0
        },
        aiAccounts: {
          total: aiAccountCount,
          active: activeAIAccounts,
          activeRate: aiAccountCount > 0 ? (activeAIAccounts / aiAccountCount * 100).toFixed(2) : 0
        },
        trades: {
          today: todayTrades,
          total: totalTrades,
          dailyAverage: totalTrades > 0 ? (totalTrades / 30).toFixed(2) : 0 // 假设30天
        },
        portfolios: {
          count: portfolioCount,
          totalValue: totalPortfolioValue._sum.currentValue || 0
        },
        alerts: {
          active: activeAlerts,
          unacknowledged: unacknowledgedAlerts,
          total: this.alerts.length
        },
        metrics: {
          cpu: this.getCurrentMetric('cpu.usage') || 0,
          memory: this.getCurrentMetric('memory.usage') || 0,
          disk: this.getCurrentMetric('disk.usage') || 0
        }
      };
    } catch (error) {
      console.error('获取系统概览统计失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前指标值
   */
  getCurrentMetric(metricName) {
    try {
      const metricKeys = Array.from(this.metrics.keys()).filter(key => key.startsWith(metricName));

      if (metricKeys.length === 0) {
        return null;
      }

      // 获取最新的指标值
      let latestValue = null;
      let latestTime = 0;

      for (const key of metricKeys) {
        const metrics = this.metrics.get(key);
        if (metrics.length > 0) {
          const lastMetric = metrics[metrics.length - 1];
          if (lastMetric.timestamp.getTime() > latestTime) {
            latestTime = lastMetric.timestamp.getTime();
            latestValue = lastMetric.value;
          }
        }
      }

      return latestValue;
    } catch (error) {
      console.error('获取当前指标值失败:', error);
      return null;
    }
  }

  /**
   * 清理旧数据
   */
  async cleanupOldData(retentionDays = 30) {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // 清理指标数据
      for (const [key, metrics] of this.metrics.entries()) {
        const filteredMetrics = metrics.filter(m => m.timestamp >= cutoffDate);
        if (filteredMetrics.length === 0) {
          this.metrics.delete(key);
        } else {
          this.metrics.set(key, filteredMetrics);
        }
      }

      // 清理已解决的旧告警
      const oldResolvedAlerts = this.alerts.filter(a =>
        a.resolved && a.resolvedAt && a.resolvedAt < cutoffDate
      );

      this.alerts = this.alerts.filter(a => !oldResolvedAlerts.includes(a));

      return {
        metricsCleaned: this.metrics.size,
        alertsCleaned: oldResolvedAlerts.length,
        totalAlerts: this.alerts.length
      };
    } catch (error) {
      console.error('清理旧数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取服务状态
   */
  async getServiceStatus() {
    try {
      // 这里可以检查各个服务的实际状态
      // 目前返回模拟数据
      return [
        {
          name: '后端API服务',
          status: 'running',
          uptime: '5天12小时',
          responseTime: 45,
          lastCheck: new Date().toISOString(),
          health: 'healthy'
        },
        {
          name: 'AI服务',
          status: 'running',
          uptime: '5天10小时',
          responseTime: 120,
          lastCheck: new Date().toISOString(),
          health: 'healthy'
        },
        {
          name: '数据服务',
          status: 'running',
          uptime: '5天11小时',
          responseTime: 85,
          lastCheck: new Date().toISOString(),
          health: 'healthy'
        },
        {
          name: 'PostgreSQL数据库',
          status: 'running',
          uptime: '5天12小时',
          responseTime: 15,
          lastCheck: new Date().toISOString(),
          health: 'healthy'
        },
        {
          name: 'Redis缓存',
          status: 'running',
          uptime: '5天12小时',
          responseTime: 5,
          lastCheck: new Date().toISOString(),
          health: 'healthy'
        }
      ];
    } catch (error) {
      console.error('获取服务状态失败:', error);
      throw error;
    }
  }
}

export default new MonitoringService();