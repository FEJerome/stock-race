import { systemLogRepository } from '../models/index.js';
import { decisionLogRepository } from '../models/index.js';

export class SystemCleanupJob {
  constructor() {
    this.jobName = 'SystemCleanupJob';
    this.interval = 24 * 60 * 60 * 1000; // 每天执行一次
    this.isRunning = false;
    this.intervalId = null;
    this.lastExecution = null;
    this.stats = {
      totalExecutions: 0,
      logsCleaned: 0,
      decisionsArchived: 0,
      errors: 0
    };
  }

  /**
   * 启动任务
   */
  async start() {
    if (this.isRunning) {
      console.log(`⚠️ ${this.jobName} 已经在运行`);
      return;
    }

    console.log(`🚀 启动 ${this.jobName}`);

    // 立即执行一次
    await this.execute();

    // 设置定时执行
    this.intervalId = setInterval(() => {
      this.execute().catch(error => {
        console.error(`❌ ${this.jobName} 执行失败:`, error);
      });
    }, this.interval);

    this.isRunning = true;

    // 记录系统日志
    await systemLogRepository.create({
      level: 'info',
      module: 'jobs',
      action: 'start',
      message: `${this.jobName} 已启动`,
      metadata: {
        interval: this.interval
      }
    });
  }

  /**
   * 停止任务
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log(`🛑 停止 ${this.jobName}`);

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;

    // 记录系统日志
    systemLogRepository.create({
      level: 'info',
      module: 'jobs',
      action: 'stop',
      message: `${this.jobName} 已停止`,
      metadata: {
        lastExecution: this.lastExecution,
        stats: this.stats
      }
    }).catch(console.error);
  }

  /**
   * 执行任务
   */
  async execute() {
    // 防止并发执行
    if (this.executing) {
      console.log(`⏳ ${this.jobName} 正在执行，跳过此次执行`);
      return;
    }

    this.executing = true;
    const startTime = Date.now();

    try {
      console.log(`🔍 ${this.jobName} 开始执行...`);

      let logsCleaned = 0;
      let decisionsArchived = 0;

      // 1. 清理旧的系统日志（保留30天）
      logsCleaned += await this.cleanupOldSystemLogs();

      // 2. 归档旧的AI决策日志（保留90天）
      decisionsArchived += await this.archiveOldDecisionLogs();

      // 3. 清理临时文件等（如果有）
      await this.cleanupTemporaryFiles();

      // 更新统计
      this.stats.totalExecutions++;
      this.stats.logsCleaned += logsCleaned;
      this.stats.decisionsArchived += decisionsArchived;

      // 记录执行结果
      const executionTime = Date.now() - startTime;

      console.log(`✅ ${this.jobName} 执行完成:
        清理系统日志: ${logsCleaned} 条
        归档决策日志: ${decisionsArchived} 条
        耗时: ${executionTime}ms`);

      await systemLogRepository.create({
        level: 'info',
        module: 'jobs',
        action: 'execute',
        message: `${this.jobName} 执行完成`,
        metadata: {
          executionTime,
          logsCleaned,
          decisionsArchived
        }
      });

      this.lastExecution = new Date();

    } catch (error) {
      console.error(`❌ ${this.jobName} 执行失败:`, error);

      await systemLogRepository.create({
        level: 'error',
        module: 'jobs',
        action: 'execute',
        message: `${this.jobName} 执行失败: ${error.message}`,
        metadata: {
          error: error.message,
          stack: error.stack
        }
      });

      this.stats.errors++;
    } finally {
      this.executing = false;
    }
  }

  /**
   * 清理旧的系统日志
   */
  async cleanupOldSystemLogs() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // 删除30天前的调试和信息级别日志
      const result = await systemLogRepository.deleteMany({
        createdAt: {
          lt: thirtyDaysAgo
        },
        level: {
          in: ['debug', 'info']
        }
      });
      console.log(`🧹 清理了 ${result.count || 0} 条旧系统日志`);
      return result.count || 0;
    } catch (error) {
      console.error('清理系统日志失败:', error);
      return 0;
    }
  }

  /**
   * 归档旧的AI决策日志
   */
  async archiveOldDecisionLogs() {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // 这里应该将旧数据移动到归档表
      // 由于没有归档表，我们暂时只记录而不删除
      const oldDecisions = await decisionLogRepository.findMany(
        {
          createdAt: {
            lt: ninetyDaysAgo
          },
          tradeId: null // 只归档未关联交易的决策
        },
        { id: 'desc' }, // orderBy
        1000, // limit
        undefined // include
      );
      console.log(`📦 找到 ${oldDecisions.length} 条待归档的旧决策日志`);

      // 在实际生产中，这里应该将数据移动到归档表
      // 然后从主表中删除
      // 目前我们只记录而不删除

      return oldDecisions.length;
    } catch (error) {
      console.error('归档决策日志失败:', error);
      return 0;
    }
  }

  /**
   * 清理临时文件
   */
  async cleanupTemporaryFiles() {
    try {
      // 这里可以清理临时文件、缓存等
      // 目前没有实现

      console.log(`🗑️  临时文件清理（暂未实现）`);
      return 0;
    } catch (error) {
      console.error('清理临时文件失败:', error);
      return 0;
    }
  }

  /**
   * 获取任务状态
   */
  getStatus() {
    return {
      name: this.jobName,
      isRunning: this.isRunning,
      lastExecution: this.lastExecution,
      stats: { ...this.stats },
      interval: this.interval,
      nextExecution: this.lastExecution
        ? new Date(this.lastExecution.getTime() + this.interval)
        : null
    };
  }
}