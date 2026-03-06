import Queue from 'bull';
import { aiAccountRepository } from '../models/index.js';
import { aiWakeupScheduler } from '../services/AIWakeupScheduler.js';

/**
 * 每日收盘批量更新任务错误
 */
export class DailyAICloseJobError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DailyAICloseJobError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 任务配置
 */
const DEFAULT_CONFIG = {
  // Redis连接配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD
  },
  // 队列名称
  queueName: 'daily-ai-close-queue',
  // Cron表达式：工作日15:30（周一到周五）
  // cron: '30 15 * * 1-5',
  // 为了测试，可以修改为每分钟执行
  cron: process.env.DAILY_CLOSE_CRON || '30 15 * * 1-5',
  // 时区
  timezone: 'Asia/Shanghai',
  // 批处理大小
  batchSize: 5,
  // 批次间隔（毫秒）
  batchIntervalMs: 1000,
  // 每秒最大请求数
  rateLimitPerSecond: 5,
  // 最大并发数
  concurrency: 3,
  // 任务超时时间
  jobTimeout: 60000,
  // 是否启用
  enabled: true
};

/**
 * 每日收盘批量更新任务
 * Cron定时任务（工作日15:30），批量触发活跃AI账户的唤醒更新
 */
export class DailyAICloseJob {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queue = null;
    this.repeatableJobId = null;
    this.isRunning = false;
    this.metrics = {
      totalExecutions: 0,
      totalAccounts: 0,
      totalQueued: 0,
      totalRejected: 0,
      totalFailed: 0,
      avgExecutionTimeMs: 0,
      errors: []
    };
  }

  /**
   * 初始化任务队列
   */
  async init() {
    if (this.queue) {
      return;
    }

    // 创建Bull队列
    this.queue = new Queue(this.config.queueName, {
      redis: this.config.redis,
      defaultJobOptions: {
        timeout: this.config.jobTimeout,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 5000
        },
        removeOnComplete: 50,
        removeOnFail: 20
      }
    });

    // 设置事件处理器
    this.setupQueueEvents();

    // 设置任务处理器
    this.queue.process(this.config.concurrency, async (job) => {
      return this.processJob(job);
    });

    console.log('[DailyAICloseJob] 队列初始化完成');
  }

  /**
   * 设置队列事件处理器
   */
  setupQueueEvents() {
    this.queue.on('completed', (job, result) => {
      console.log(`[DailyAICloseJob] 任务完成: ${job.id}, 处理账户数: ${result?.total || 0}`);
    });

    this.queue.on('failed', (job, err) => {
      console.error(`[DailyAICloseJob] 任务失败: ${job.id}, error: ${err.message}`);
      this.metrics.errors.push({
        timestamp: new Date().toISOString(),
        jobId: job.id,
        error: err.message
      });

      // 只保留最近100个错误
      if (this.metrics.errors.length > 100) {
        this.metrics.errors = this.metrics.errors.slice(-100);
      }
    });

    this.queue.on('stalled', (job) => {
      console.warn(`[DailyAICloseJob] 任务停滞: ${job.id}`);
    });
  }

  /**
   * 启动定时任务
   */
  async start() {
    if (!this.config.enabled) {
      console.log('[DailyAICloseJob] 任务已禁用');
      return;
    }

    await this.init();

    // 移除之前的repeatable job（如果有）
    if (this.repeatableJobId) {
      await this.queue.removeRepeatableByKey(this.repeatableJobId);
    }

    // 添加定时任务
    const job = await this.queue.add(
      { type: 'daily-close', scheduledAt: Date.now() },
      {
        repeat: {
          cron: this.config.cron,
          tz: this.config.timezone
        },
        jobId: 'daily-close-repeatable'
      }
    );

    this.repeatableJobId = job.opts.repeat.key;
    this.isRunning = true;

    console.log(`[DailyAICloseJob] 定时任务已启动: ${this.config.cron} (${this.config.timezone})`);
  }

  /**
   * 停止定时任务
   */
  async stop() {
    if (!this.queue) {
      return;
    }

    // 移除repeatable job
    if (this.repeatableJobId) {
      await this.queue.removeRepeatableByKey(this.repeatableJobId);
      this.repeatableJobId = null;
    }

    this.isRunning = false;
    console.log('[DailyAICloseJob] 定时任务已停止');
  }

  /**
   * 手动执行任务
   */
  async execute() {
    const startTime = Date.now();
    console.log('[DailyAICloseJob] 开始执行每日收盘批量更新...');

    const results = {
      total: 0,
      queued: 0,
      rejected: 0,
      failed: 0,
      batches: [],
      errors: []
    };

    try {
      // 1. 获取活跃账户
      const activeAccounts = await this.getActiveAccounts();
      results.total = activeAccounts.length;

      console.log(`[DailyAICloseJob] 活跃账户数: ${activeAccounts.length}`);

      if (activeAccounts.length === 0) {
        console.log('[DailyAICloseJob] 没有活跃账户，跳过本次执行');
        return results;
      }

      // 2. 分批处理
      const batches = this.chunkArray(activeAccounts, this.config.batchSize);
      console.log(`[DailyAICloseJob] 分${batches.length}批执行，每批${this.config.batchSize}个账户`);

      // 3. 按批次执行，每批间隔一定时间
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchStartTime = Date.now();

        console.log(`[DailyAICloseJob] 执行第${i + 1}/${batches.length}批，${batch.length}个账户`);

        // 应用限流：每秒最多5个请求
        const batchResults = await this.executeBatchWithRateLimit(batch, i);

        results.batches.push({
          batchNumber: i + 1,
          accountCount: batch.length,
          queued: batchResults.queued,
          rejected: batchResults.rejected,
          failed: batchResults.failed,
          executionTimeMs: Date.now() - batchStartTime
        });

        results.queued += batchResults.queued;
        results.rejected += batchResults.rejected;
        results.failed += batchResults.failed;

        // 如果不是最后一批，等待间隔时间
        if (i < batches.length - 1) {
          await this.sleep(this.config.batchIntervalMs);
        }
      }

      // 4. 更新指标
      this.updateMetrics(startTime, results.total, results.queued, results.rejected);

      console.log(`[DailyAICloseJob] 执行完成: 总计${results.total}, 排队${results.queued}, 拒绝${results.rejected}, 失败${results.failed}`);

      return results;
    } catch (error) {
      console.error('[DailyAICloseJob] 执行失败:', error);
      results.errors.push({
        timestamp: new Date().toISOString(),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 处理任务
   * @private
   */
  async processJob(job) {
    const { type } = job.data;

    if (type === 'daily-close') {
      return this.execute();
    }

    throw new Error(`Unknown job type: ${type}`);
  }

  /**
   * 获取活跃AI账户
   * @private
   */
  async getActiveAccounts() {
    try {
      const accounts = await aiAccountRepository.prisma.aIAccount.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          name: true,
          userId: true
        }
      });

      return accounts;
    } catch (error) {
      throw new DailyAICloseJobError(
        'FETCH_ACCOUNTS_FAILED',
        '获取活跃账户失败',
        { originalError: error.message }
      );
    }
  }

  /**
   * 使用限流执行批次
   * @private
   */
  async executeBatchWithRateLimit(accounts, batchIndex) {
    const results = {
      queued: 0,
      rejected: 0,
      failed: 0
    };

    // 计算每个账户之间的延迟（毫秒）
    const delayBetweenRequests = Math.ceil(1000 / this.config.rateLimitPerSecond);

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      try {
        // 使用aiWakeupScheduler触发唤醒
        const result = await aiWakeupScheduler.triggerWakeup(
          account.id.toString(),
          'scheduled', // 定时任务触发
          { jobOptions: { jobId: `daily-close-${account.id}-${Date.now()}` } }
        );

        if (result.success) {
          results.queued++;
        } else {
          results.rejected++;
          console.warn(`[DailyAICloseJob] 账户${account.id}被拒绝: ${result.code} - ${result.message}`);
        }
      } catch (error) {
        results.failed++;
        console.error(`[DailyAICloseJob] 账户${account.id}处理失败:`, error.message);
        // 继续处理下一个，不影响其他账户
      }

      // 应用限流延迟（最后一个不需要延迟）
      if (i < accounts.length - 1) {
        await this.sleep(delayBetweenRequests);
      }
    }

    return results;
  }

  /**
   * 将数组分块
   * @private
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 睡眠函数
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 更新指标
   * @private
   */
  updateMetrics(startTime, totalAccounts, queued, rejected) {
    const executionTime = Date.now() - startTime;

    this.metrics.totalExecutions++;
    this.metrics.totalAccounts += totalAccounts;
    this.metrics.totalQueued += queued;
    this.metrics.totalRejected += rejected;

    // 计算平均执行时间
    const prevAvg = this.metrics.avgExecutionTimeMs;
    const count = this.metrics.totalExecutions;
    this.metrics.avgExecutionTimeMs = (prevAvg * (count - 1) + executionTime) / count;

    console.log(`[DailyAICloseJob] 执行时间: ${executionTime}ms, 平均: ${Math.round(this.metrics.avgExecutionTimeMs)}ms`);
  }

  /**
   * 获取任务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      cron: this.config.cron,
      timezone: this.config.timezone,
      config: {
        batchSize: this.config.batchSize,
        batchIntervalMs: this.config.batchIntervalMs,
        rateLimitPerSecond: this.config.rateLimitPerSecond
      },
      metrics: { ...this.metrics }
    };
  }

  /**
   * 获取队列统计
   */
  async getQueueStats() {
    if (!this.queue) {
      return null;
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed
    };
  }

  /**
   * 清空队列
   */
  async clearQueue() {
    if (!this.queue) {
      return;
    }

    await this.queue.clean(0, 'completed');
    await this.queue.clean(0, 'failed');
    console.log('[DailyAICloseJob] 队列已清空');
  }

  /**
   * 关闭任务
   */
  async close() {
    await this.stop();

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
      console.log('[DailyAICloseJob] 任务已关闭');
    }
  }

  /**
   * 重置指标
   */
  resetMetrics() {
    this.metrics = {
      totalExecutions: 0,
      totalAccounts: 0,
      totalQueued: 0,
      totalRejected: 0,
      totalFailed: 0,
      avgExecutionTimeMs: 0,
      errors: []
    };
    console.log('[DailyAICloseJob] 指标已重置');
  }
}

// 创建单例实例
export const dailyAICloseJob = new DailyAICloseJob();

export default DailyAICloseJob;
