import { virtualTradingService } from '../services/VirtualTradingService.js';
import { systemLogRepository } from '../models/index.js';

export class TradeExecutionJob {
  constructor() {
    this.jobName = 'TradeExecutionJob';
    this.interval = 30 * 1000; // 30秒执行一次（交易执行需要更频繁）
    this.isRunning = false;
    this.intervalId = null;
    this.lastExecution = null;
    this.stats = {
      totalExecutions: 0,
      totalTradesExecuted: 0,
      totalTradesFailed: 0,
      totalTradesSkipped: 0
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

      // 使用VirtualTradingService执行待处理订单
      const results = await virtualTradingService.executePendingOrders();

      // 统计结果
      const executed = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      const skipped = results.filter(r => r.reason === '非交易时间');

      // 更新统计
      this.stats.totalExecutions++;
      this.stats.totalTradesExecuted += executed.length;
      this.stats.totalTradesFailed += failed.length;
      this.stats.totalTradesSkipped += skipped.length;

      // 记录执行结果
      const executionTime = Date.now() - startTime;

      if (results.length > 0) {
        console.log(`✅ ${this.jobName} 执行完成:
          总订单: ${results.length}
          执行成功: ${executed.length}
          执行失败: ${failed.length}
          跳过(非交易时间): ${skipped.length}
          耗时: ${executionTime}ms`);

        // 记录详细日志
        await systemLogRepository.create({
          level: 'info',
          module: 'jobs',
          action: 'execute',
          message: `${this.jobName} 执行完成`,
          metadata: {
            executionTime,
            totalOrders: results.length,
            executed: executed.length,
            failed: failed.length,
            skipped: skipped.length,
            executionDetails: executed.slice(0, 3).map(e => ({
              tradeId: e.tradeId,
              result: e.result
            })),
            failureDetails: failed.slice(0, 3).map(f => ({
              tradeId: f.tradeId,
              error: f.error || f.reason
            }))
          }
        });

        // 如果有失败，记录警告日志
        if (failed.length > 0) {
          await systemLogRepository.create({
            level: 'warn',
            module: 'jobs',
            action: 'execute',
            message: `${this.jobName} 执行失败 ${failed.length} 个订单`,
            metadata: {
              failedCount: failed.length,
              failedDetails: failed.slice(0, 5)
            }
          });
        }
      } else {
        console.log(`ℹ️ ${this.jobName} 没有待执行的订单`);
      }

      this.lastExecution = new Date();

    } catch (error) {
      console.error(`❌ ${this.jobName} 执行失败:`, error);

      // 记录错误日志
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

      this.stats.totalTradesFailed++;
    } finally {
      this.executing = false;
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