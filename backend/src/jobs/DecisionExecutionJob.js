import { aiTradeService } from '../services/AITradeService.js';
import { systemLogRepository } from '../models/index.js';

export class DecisionExecutionJob {
  constructor() {
    this.jobName = 'DecisionExecutionJob';
    this.interval = 5 * 60 * 1000; // 5分钟执行一次
    this.minInterval = 60 * 1000; // 最小间隔1分钟
    this.maxBatchSize = 20; // 每次最大处理数量
    this.isRunning = false;
    this.intervalId = null;
    this.lastExecution = null;
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalDecisionsProcessed: 0,
      totalTradesCreated: 0
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
        interval: this.interval,
        maxBatchSize: this.maxBatchSize
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

      // 1. 获取待处理的AI决策
      const pendingDecisions = await aiTradeService.getPendingAIDecisions({
        limit: this.maxBatchSize,
        minConfidence: 0.6
      });

      if (pendingDecisions.length === 0) {
        console.log(`ℹ️ ${this.jobName} 没有待处理的AI决策`);
        this.lastExecution = new Date();
        return;
      }

      console.log(`📊 ${this.jobName} 找到 ${pendingDecisions.length} 个待处理决策`);

      // 2. 转换为交易订单
      const formattedDecisions = pendingDecisions.map(decision => ({
        id: decision.id,
        accountId: decision.accountId,
        stockCode: decision.stock?.code,
        decisionType: decision.decisionType,
        confidence: parseFloat(decision.confidence || 0),
        reasoning: decision.reasoning || '无理由',
        suggestedQuantity: this.extractSuggestedQuantity(decision),
        suggestedPrice: this.extractSuggestedPrice(decision),
        riskLevel: decision.riskLevel || 'medium'
      }));

      // 3. 批量处理决策
      const results = await aiTradeService.processAIDecisions(formattedDecisions);

      // 4. 统计结果
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      const tradesCreated = successful.length;

      // 5. 更新统计
      this.stats.totalExecutions++;
      this.stats.successfulExecutions += successful.length > 0 ? 1 : 0;
      this.stats.failedExecutions += failed.length > 0 ? 1 : 0;
      this.stats.totalDecisionsProcessed += pendingDecisions.length;
      this.stats.totalTradesCreated += tradesCreated;

      // 6. 记录执行结果
      const executionTime = Date.now() - startTime;

      console.log(`✅ ${this.jobName} 执行完成:
        处理决策: ${pendingDecisions.length}
        创建交易: ${tradesCreated}
        成功: ${successful.length}
        失败: ${failed.length}
        耗时: ${executionTime}ms`);

      // 7. 记录系统日志
      await systemLogRepository.create({
        level: 'info',
        module: 'jobs',
        action: 'execute',
        message: `${this.jobName} 执行完成`,
        metadata: {
          executionTime,
          decisionsProcessed: pendingDecisions.length,
          tradesCreated,
          successful: successful.length,
          failed: failed.length,
          failedDetails: failed.map(f => ({
            decisionId: f.decisionId,
            error: f.error
          }))
        }
      });

      // 8. 如果有失败，记录错误日志
      if (failed.length > 0) {
        await systemLogRepository.create({
          level: 'warn',
          module: 'jobs',
          action: 'execute',
          message: `${this.jobName} 处理失败 ${failed.length} 个决策`,
          metadata: {
            failedCount: failed.length,
            failedDetails: failed.slice(0, 5) // 只记录前5个失败详情
          }
        });
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

      this.stats.failedExecutions++;
    } finally {
      this.executing = false;
    }
  }

  /**
   * 从决策数据中提取建议数量
   */
  extractSuggestedQuantity(decision) {
    try {
      // 尝试从outputData中提取
      if (decision.outputData) {
        const output = typeof decision.outputData === 'string'
          ? JSON.parse(decision.outputData)
          : decision.outputData;

        if (output.suggested_quantity) {
          return parseInt(output.suggested_quantity);
        }
      }

      // 尝试从inputData中提取
      if (decision.inputData) {
        const input = typeof decision.inputData === 'string'
          ? JSON.parse(decision.inputData)
          : decision.inputData;

        if (input.quantity) {
          return parseInt(input.quantity);
        }
      }

      return null;
    } catch (error) {
      console.warn(`提取建议数量失败:`, error);
      return null;
    }
  }

  /**
   * 从决策数据中提取建议价格
   */
  extractSuggestedPrice(decision) {
    try {
      // 尝试从outputData中提取
      if (decision.outputData) {
        const output = typeof decision.outputData === 'string'
          ? JSON.parse(decision.outputData)
          : decision.outputData;

        if (output.suggested_price) {
          return parseFloat(output.suggested_price);
        }
      }

      // 尝试从inputData中提取
      if (decision.inputData) {
        const input = typeof decision.inputData === 'string'
          ? JSON.parse(decision.inputData)
          : decision.inputData;

        if (input.price) {
          return parseFloat(input.price);
        }

        if (input.market_data?.price) {
          return parseFloat(input.market_data.price);
        }
      }

      return null;
    } catch (error) {
      console.warn(`提取建议价格失败:`, error);
      return null;
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