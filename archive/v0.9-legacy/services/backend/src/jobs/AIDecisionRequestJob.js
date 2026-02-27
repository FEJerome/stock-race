import { aiAccountRepository } from '../models/index.js';
import { stockRepository } from '../models/index.js';
import { portfolioRepository } from '../models/index.js';
import { dataService } from '../services/DataService.js';
import { aiService } from '../services/AIService.js';
import { decisionLogRepository } from '../models/index.js';
import { systemLogRepository } from '../models/index.js';

export class AIDecisionRequestJob {
  constructor() {
    this.jobName = 'AIDecisionRequestJob';
    this.interval = 15 * 60 * 1000; // 15分钟执行一次
    this.maxAccountsPerExecution = 10; // 每次最多处理10个账户
    this.maxStocksPerAccount = 5; // 每个账户最多分析5只股票
    this.isRunning = false;
    this.intervalId = null;
    this.lastExecution = null;
    this.stats = {
      totalExecutions: 0,
      totalAccountsProcessed: 0,
      totalDecisionsRequested: 0,
      totalDecisionsSuccessful: 0,
      totalDecisionsFailed: 0
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
        maxAccountsPerExecution: this.maxAccountsPerExecution,
        maxStocksPerAccount: this.maxStocksPerAccount
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

      // 1. 获取活跃的AI账户
      const activeAccounts = await this.getActiveAIAccounts();

      if (activeAccounts.length === 0) {
        console.log(`ℹ️ ${this.jobName} 没有活跃的AI账户`);
        this.lastExecution = new Date();
        return;
      }

      console.log(`📊 ${this.jobName} 找到 ${activeAccounts.length} 个活跃账户`);

      let totalDecisionsRequested = 0;
      let totalDecisionsSuccessful = 0;
      let totalDecisionsFailed = 0;

      // 2. 为每个账户请求AI决策
      for (const account of activeAccounts) {
        try {
          console.log(`🤖 为账户 ${account.name} (ID: ${account.id}) 请求AI决策...`);

          // 获取账户持仓股票
          const accountStocks = await this.getAccountStocksForAnalysis(account.id);

          if (accountStocks.length === 0) {
            console.log(`ℹ️ 账户 ${account.name} 没有可分析的股票`);
            continue;
          }

          // 为每只股票请求决策
          for (const stock of accountStocks) {
            try {
              const result = await this.requestAIDecisionForStock(account, stock);

              totalDecisionsRequested++;
              if (result.success) {
                totalDecisionsSuccessful++;
              } else {
                totalDecisionsFailed++;
              }

              // 记录决策日志
              await this.logDecisionResult(account, stock, result);

            } catch (stockError) {
              console.error(`❌ 为股票 ${stock.code} 请求AI决策失败:`, stockError);
              totalDecisionsFailed++;
            }

            // 限制每只账户的股票数量
            if (accountStocks.indexOf(stock) >= this.maxStocksPerAccount - 1) {
              break;
            }
          }

          // 更新统计
          this.stats.totalAccountsProcessed++;

        } catch (accountError) {
          console.error(`❌ 为账户 ${account.name} 处理失败:`, accountError);
        }

        // 限制处理的账户数量
        if (activeAccounts.indexOf(account) >= this.maxAccountsPerExecution - 1) {
          break;
        }
      }

      // 3. 更新全局统计
      this.stats.totalExecutions++;
      this.stats.totalDecisionsRequested += totalDecisionsRequested;
      this.stats.totalDecisionsSuccessful += totalDecisionsSuccessful;
      this.stats.totalDecisionsFailed += totalDecisionsFailed;

      // 4. 记录执行结果
      const executionTime = Date.now() - startTime;

      console.log(`✅ ${this.jobName} 执行完成:
        处理账户: ${Math.min(activeAccounts.length, this.maxAccountsPerExecution)}
        请求决策: ${totalDecisionsRequested}
        成功: ${totalDecisionsSuccessful}
        失败: ${totalDecisionsFailed}
        耗时: ${executionTime}ms`);

      await systemLogRepository.create({
        level: 'info',
        module: 'jobs',
        action: 'execute',
        message: `${this.jobName} 执行完成`,
        metadata: {
          executionTime,
          accountsProcessed: Math.min(activeAccounts.length, this.maxAccountsPerExecution),
          decisionsRequested: totalDecisionsRequested,
          decisionsSuccessful: totalDecisionsSuccessful,
          decisionsFailed: totalDecisionsFailed
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

      this.stats.totalDecisionsFailed++;
    } finally {
      this.executing = false;
    }
  }

  /**
   * 获取活跃的AI账户
   */
  async getActiveAIAccounts() {
    return await aiAccountRepository.findMany(
      {
        status: 'active'
      },
      { updatedAt: 'desc' },
      this.maxAccountsPerExecution * 2, // limit
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
   * 获取账户需要分析的股票
   */
  async getAccountStocksForAnalysis(accountId) {
    const stocks = [];

    try {
      // 1. 获取账户持仓股票
      const portfolios = await portfolioRepository.getAccountPortfolio(accountId);

      for (const portfolio of portfolios) {
        if (portfolio.quantity > 0) {
          const stock = await stockRepository.findOne({ id: portfolio.stockId });
          if (stock) {
            stocks.push({
              ...stock,
              positionQuantity: portfolio.quantity,
              positionValue: portfolio.marketValue
            });
          }
        }
      }

      // 2. 如果没有持仓，获取热门股票
      if (stocks.length === 0) {
        const hotStocks = await stockRepository.getHotStocks({ limit: this.maxStocksPerAccount });
        stocks.push(...hotStocks.map(stock => ({
          ...stock,
          positionQuantity: 0,
          positionValue: 0
        })));
      }

      // 3. 获取实时数据，过滤掉无法获取数据的股票
      const stocksWithData = [];
      for (const stock of stocks) {
        try {
          const marketData = await dataService.getRealtimeData(stock.code);
          if (marketData && !marketData.isFallback) {
            stocksWithData.push({
              ...stock,
              marketData
            });
          }
        } catch (error) {
          console.warn(`无法获取股票 ${stock.code} 的实时数据:`, error);
        }
      }

      return stocksWithData.slice(0, this.maxStocksPerAccount * 2); // 返回稍多一些

    } catch (error) {
      console.error(`获取账户 ${accountId} 的分析股票失败:`, error);
      return [];
    }
  }

  /**
   * 为特定股票请求AI决策
   */
  async requestAIDecisionForStock(account, stock) {
    try {
      const requestData = {
        accountId: account.id,
        stockCode: stock.code,
        marketData: stock.marketData,
        portfolioData: {
          positionQuantity: stock.positionQuantity || 0,
          positionValue: stock.positionValue || 0,
          averageCost: stock.avgCost || 0
        },
        strategy: account.tradingFrequency || 'daily'
      };

      const decision = await aiService.requestDecision(requestData);

      return {
        success: decision.success !== false,
        decision: decision.decision,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        riskLevel: decision.risk_level,
        suggestedQuantity: decision.suggested_quantity,
        suggestedPrice: decision.suggested_price,
        metadata: decision.metadata,
        isFallback: decision.is_fallback || false
      };

    } catch (error) {
      console.error(`请求AI决策失败:`, error);
      return {
        success: false,
        error: error.message,
        isFallback: true
      };
    }
  }

  /**
   * 记录决策结果
   */
  async logDecisionResult(account, stock, result) {
    try {
      const decisionLogData = {
        accountId: account.id,
        stockId: stock.id,
        decisionType: result.decision || 'hold',
        reasoning: result.reasoning || '无理由',
        confidence: result.confidence || 0.5,
        riskLevel: result.riskLevel || 'medium',
        marketAnalysis: result.metadata?.market_analysis || null,
        technicalIndicators: result.metadata?.technical_indicators || null,
        fundamentalAnalysis: result.metadata?.fundamental_analysis || null,
        inputData: {
          stockCode: stock.code,
          marketPrice: stock.marketData?.price,
          positionQuantity: stock.positionQuantity,
          accountBalance: account.currentBalance
        },
        outputData: {
          decision: result.decision,
          reasoning: result.reasoning,
          confidence: result.confidence,
          suggested_quantity: result.suggestedQuantity,
          suggested_price: result.suggestedPrice,
          risk_level: result.riskLevel
        },
        modelUsed: account.modelType || 'unknown',
        processingTimeMs: result.metadata?.processing_time || 0,
        apiCost: result.metadata?.api_cost || 0
      };

      await decisionLogRepository.createDecisionLog(decisionLogData);

      console.log(`📝 记录AI决策: 账户=${account.name}, 股票=${stock.code}, 决策=${result.decision}, 置信度=${result.confidence}`);

    } catch (error) {
      console.error(`记录决策结果失败:`, error);
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