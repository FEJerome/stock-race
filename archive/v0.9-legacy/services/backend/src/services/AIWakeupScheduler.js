import Queue from 'bull';
import { eventBus } from '../events/EventBus.js';
import { aiAccountRepository } from '../models/index.js';

/**
 * AI唤醒调度器错误
 */
export class AIWakeupSchedulerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AIWakeupSchedulerError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 唤醒结果代码
 */
export const WakeupResultCode = {
  OK: 'OK',
  COOLDOWN: 'COOLDOWN',
  DAILY_LIMIT: 'DAILY_LIMIT',
  TOKEN_BUDGET: 'TOKEN_BUDGET',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  QUEUE_ERROR: 'QUEUE_ERROR'
};

/**
 * 调度器配置
 */
const DEFAULT_CONFIG = {
  // Redis连接配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD
  },
  // 冷却时间（毫秒）- 5分钟
  cooldownMs: 5 * 60 * 1000,
  // 每日最大唤醒次数
  dailyLimit: 10,
  // Token预算（每日）
  tokenBudget: 1000000, // 1M tokens
  // 队列配置
  queueName: 'ai-wakeup-queue',
  // 任务处理并发数
  concurrency: 5,
  // 任务超时时间
  jobTimeout: 30000,
  // 任务重试次数
  jobRetries: 3,
  // 任务重试延迟
  jobRetryDelay: 1000
};

/**
 * AI唤醒调度器
 * 使用Bull队列管理AI唤醒任务，实现防重保护
 */
export class AIWakeupScheduler {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queue = null;
    this.metrics = {
      totalTriggered: 0,
      totalSucceeded: 0,
      totalRejected: 0,
      rejectedByCooldown: 0,
      rejectedByDailyLimit: 0,
      rejectedByTokenBudget: 0,
      errors: []
    };
  }

  /**
   * 初始化队列
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
        attempts: this.config.jobRetries,
        backoff: {
          type: 'exponential',
          delay: this.config.jobRetryDelay
        },
        removeOnComplete: 100, // 保留最近100个完成的任务
        removeOnFail: 50 // 保留最近50个失败的任务
      }
    });

    // 设置事件处理器
    this.setupQueueEvents();

    // 设置任务处理器
    this.queue.process(this.config.concurrency, async (job) => {
      return this.processWakeupJob(job);
    });

    console.log('[AIWakeupScheduler] 队列初始化完成');
  }

  /**
   * 设置队列事件处理器
   */
  setupQueueEvents() {
    this.queue.on('completed', (job, result) => {
      console.log(`[AIWakeupScheduler] 任务完成: ${job.id}, account: ${job.data.accountId}`);
    });

    this.queue.on('failed', (job, err) => {
      console.error(`[AIWakeupScheduler] 任务失败: ${job.id}, error: ${err.message}`);
      this.metrics.errors.push({
        timestamp: new Date().toISOString(),
        jobId: job.id,
        accountId: job.data.accountId,
        error: err.message
      });
    });

    this.queue.on('stalled', (job) => {
      console.warn(`[AIWakeupScheduler] 任务停滞: ${job.id}`);
    });
  }

  /**
   * 触发AI唤醒
   * @param {string} accountId - AI账户ID
   * @param {string} triggerType - 触发类型 (manual | scheduled | market_event)
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 触发结果
   */
  async triggerWakeup(accountId, triggerType = 'manual', options = {}) {
    try {
      await this.init();

      this.metrics.totalTriggered++;

      // 1. 验证账户
      const accountCheck = await this.validateAccount(accountId);
      if (!accountCheck.valid) {
        this.metrics.totalRejected++;
        return {
          success: false,
          code: accountCheck.code,
          message: accountCheck.message,
          accountId
        };
      }

      // 2. 检查是否应该唤醒
      const shouldWakeup = await this.shouldWakeup(accountId, options);
      if (!shouldWakeup.allowed) {
        this.metrics.totalRejected++;
        this.incrementRejectionCounter(shouldWakeup.code);
        return {
          success: false,
          code: shouldWakeup.code,
          message: shouldWakeup.message,
          accountId,
          details: shouldWakeup.details
        };
      }

      // 3. 添加到队列
      const job = await this.queue.add({
        accountId,
        triggerType,
        timestamp: Date.now(),
        options
      }, {
        jobId: `wakeup-${accountId}-${Date.now()}`, // 确保任务ID唯一
        ...options.jobOptions
      });

      this.metrics.totalSucceeded++;

      // 4. 更新最后唤醒时间
      await this.updateLastWakeupTime(accountId);

      // 5. 发布事件
      await this.publishWakeupEvent(accountId, triggerType, job.id);

      return {
        success: true,
        code: WakeupResultCode.OK,
        message: 'AI唤醒任务已加入队列',
        accountId,
        jobId: job.id,
        queuePosition: await this.getQueuePosition(job.id)
      };
    } catch (error) {
      console.error('[AIWakeupScheduler] 触发唤醒失败:', error);
      this.metrics.errors.push({
        timestamp: new Date().toISOString(),
        accountId,
        error: error.message
      });

      return {
        success: false,
        code: WakeupResultCode.QUEUE_ERROR,
        message: '队列操作失败',
        accountId,
        error: error.message
      };
    }
  }

  /**
   * 验证账户
   * @private
   */
  async validateAccount(accountId) {
    try {
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId)
      });

      if (!account) {
        return {
          valid: false,
          code: WakeupResultCode.ACCOUNT_NOT_FOUND,
          message: 'AI账户不存在'
        };
      }

      if (account.status !== 'active') {
        return {
          valid: false,
          code: WakeupResultCode.ACCOUNT_INACTIVE,
          message: `AI账户状态为 ${account.status}，无法唤醒`
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        code: WakeupResultCode.QUEUE_ERROR,
        message: '验证账户失败'
      };
    }
  }

  /**
   * 检查是否应该唤醒（防重保护）
   * @param {string} accountId - AI账户ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async shouldWakeup(accountId, options = {}) {
    const now = Date.now();

    // 1. 检查冷却时间
    const cooldownCheck = await this.checkCooldown(accountId, now);
    if (!cooldownCheck.passed) {
      return {
        allowed: false,
        code: WakeupResultCode.COOLDOWN,
        message: `冷却时间未到，还需等待 ${cooldownCheck.remainingSeconds} 秒`,
        details: {
          remainingSeconds: cooldownCheck.remainingSeconds,
          lastWakeupTime: cooldownCheck.lastWakeupTime,
          cooldownPeriod: this.config.cooldownMs
        }
      };
    }

    // 2. 检查每日限制
    const dailyLimitCheck = await this.checkDailyLimit(accountId, now);
    if (!dailyLimitCheck.passed) {
      return {
        allowed: false,
        code: WakeupResultCode.DAILY_LIMIT,
        message: `已达到每日最大唤醒次数 (${this.config.dailyLimit}次)`,
        details: {
          dailyCount: dailyLimitCheck.count,
          dailyLimit: this.config.dailyLimit,
          resetTime: dailyLimitCheck.resetTime
        }
      };
    }

    // 3. 检查Token预算
    const tokenBudgetCheck = await this.checkTokenBudget(accountId, now);
    if (!tokenBudgetCheck.passed) {
      return {
        allowed: false,
        code: WakeupResultCode.TOKEN_BUDGET,
        message: 'Token预算不足',
        details: {
          usedTokens: tokenBudgetCheck.used,
          budget: this.config.tokenBudget,
          remaining: tokenBudgetCheck.remaining
        }
      };
    }

    return { allowed: true };
  }

  /**
   * 检查冷却时间
   * @private
   */
  async checkCooldown(accountId, now) {
    // 这里可以使用Redis来存储最后唤醒时间
    // 简化实现：从账户配置中读取
    try {
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId)
      });

      const config = account?.config ? JSON.parse(account.config) : {};
      const lastWakeupTime = config.lastWakeupTime || 0;
      const elapsed = now - lastWakeupTime;

      if (elapsed < this.config.cooldownMs) {
        return {
          passed: false,
          lastWakeupTime,
          remainingSeconds: Math.ceil((this.config.cooldownMs - elapsed) / 1000)
        };
      }

      return { passed: true, lastWakeupTime };
    } catch (error) {
      // 如果查询失败，允许唤醒（降级策略）
      return { passed: true };
    }
  }

  /**
   * 检查每日限制
   * @private
   */
  async checkDailyLimit(accountId, now) {
    try {
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId)
      });

      const config = account?.config ? JSON.parse(account.config) : {};
      const wakeupStats = config.wakeupStats || {};

      // 获取今天的日期字符串
      const today = new Date(now).toISOString().split('T')[0];
      const lastDate = wakeupStats.date;

      let count = 0;
      if (lastDate === today) {
        count = wakeupStats.count || 0;
      }

      if (count >= this.config.dailyLimit) {
        // 计算下次重置时间（明天零点）
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        return {
          passed: false,
          count,
          resetTime: tomorrow.toISOString()
        };
      }

      return { passed: true, count };
    } catch (error) {
      // 如果查询失败，允许唤醒（降级策略）
      return { passed: true, count: 0 };
    }
  }

  /**
   * 检查Token预算
   * @private
   */
  async checkTokenBudget(accountId, now) {
    try {
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId)
      });

      const config = account?.config ? JSON.parse(account.config) : {};
      const tokenStats = config.tokenStats || {};

      // 获取今天的日期字符串
      const today = new Date(now).toISOString().split('T')[0];
      const lastDate = tokenStats.date;

      let used = 0;
      if (lastDate === today) {
        used = tokenStats.used || 0;
      }

      // 预估每次唤醒需要的tokens（这里使用固定值，实际应根据模型计算）
      const estimatedTokens = 4000;

      if (used + estimatedTokens > this.config.tokenBudget) {
        return {
          passed: false,
          used,
          remaining: Math.max(0, this.config.tokenBudget - used)
        };
      }

      return { passed: true, used, remaining: this.config.tokenBudget - used };
    } catch (error) {
      // 如果查询失败，允许唤醒（降级策略）
      return { passed: true, used: 0 };
    }
  }

  /**
   * 更新最后唤醒时间
   * @private
   */
  async updateLastWakeupTime(accountId) {
    try {
      const account = await aiAccountRepository.findOne({
        id: parseInt(accountId)
      });

      const config = account?.config ? JSON.parse(account.config) : {};
      const now = Date.now();
      const today = new Date(now).toISOString().split('T')[0];

      // 更新最后唤醒时间
      config.lastWakeupTime = now;

      // 更新唤醒统计
      if (!config.wakeupStats || config.wakeupStats.date !== today) {
        config.wakeupStats = { date: today, count: 1 };
      } else {
        config.wakeupStats.count++;
      }

      await aiAccountRepository.update(parseInt(accountId), {
        config: JSON.stringify(config)
      });
    } catch (error) {
      console.error('[AIWakeupScheduler] 更新唤醒时间失败:', error);
    }
  }

  /**
   * 处理唤醒任务
   * @private
   */
  async processWakeupJob(job) {
    const { accountId, triggerType, options } = job.data;

    console.log(`[AIWakeupScheduler] 处理唤醒任务: account=${accountId}, type=${triggerType}`);

    try {
      // 这里执行实际的AI唤醒逻辑
      // 例如：调用AI服务生成决策
      const result = await this.executeWakeup(accountId, triggerType, options);

      // 发布唤醒完成事件
      await eventBus.publish('ai:wakeup:completed', {
        accountId,
        triggerType,
        jobId: job.id,
        result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.error(`[AIWakeupScheduler] 唤醒任务处理失败: ${accountId}`, error);
      throw error;
    }
  }

  /**
   * 执行唤醒
   * @private
   */
  async executeWakeup(accountId, triggerType, options) {
    // 实际实现中这里会调用AI服务
    // 简化实现：模拟执行
    console.log(`[AIWakeupScheduler] 执行唤醒: account=${accountId}, trigger=${triggerType}`);

    return {
      success: true,
      accountId,
      triggerType,
      timestamp: Date.now()
    };
  }

  /**
   * 发布唤醒事件
   * @private
   */
  async publishWakeupEvent(accountId, triggerType, jobId) {
    try {
      await eventBus.publish('ai:wakeup:trigger', {
        accountId,
        triggerType,
        jobId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[AIWakeupScheduler] 发布事件失败:', error);
    }
  }

  /**
   * 获取队列位置
   * @private
   */
  async getQueuePosition(jobId) {
    try {
      const jobs = await this.queue.getWaiting();
      const position = jobs.findIndex(job => job.id === jobId);
      return position >= 0 ? position + 1 : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 批量触发唤醒
   * @param {Array<string>} accountIds - AI账户ID数组
   * @param {string} triggerType - 触发类型
   * @returns {Promise<Object>}
   */
  async batchTriggerWakeup(accountIds, triggerType = 'scheduled') {
    const results = {
      total: accountIds.length,
      succeeded: 0,
      rejected: 0,
      details: []
    };

    for (const accountId of accountIds) {
      const result = await this.triggerWakeup(accountId, triggerType);
      results.details.push(result);

      if (result.success) {
        results.succeeded++;
      } else {
        results.rejected++;
      }
    }

    return results;
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
   * 获取调度器状态
   */
  getStatus() {
    return {
      initialized: !!this.queue,
      config: {
        cooldownMs: this.config.cooldownMs,
        dailyLimit: this.config.dailyLimit,
        tokenBudget: this.config.tokenBudget,
        concurrency: this.config.concurrency
      },
      metrics: { ...this.metrics }
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
    console.log('[AIWakeupScheduler] 队列已清空');
  }

  /**
   * 关闭调度器
   */
  async close() {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
      console.log('[AIWakeupScheduler] 调度器已关闭');
    }
  }

  /**
   * 增加拒绝计数器
   * @private
   */
  incrementRejectionCounter(code) {
    switch (code) {
      case WakeupResultCode.COOLDOWN:
        this.metrics.rejectedByCooldown++;
        break;
      case WakeupResultCode.DAILY_LIMIT:
        this.metrics.rejectedByDailyLimit++;
        break;
      case WakeupResultCode.TOKEN_BUDGET:
        this.metrics.rejectedByTokenBudget++;
        break;
    }
  }
}

// 创建单例实例
export const aiWakeupScheduler = new AIWakeupScheduler();

export default AIWakeupScheduler;
