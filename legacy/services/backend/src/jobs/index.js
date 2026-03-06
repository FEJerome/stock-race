import { DecisionExecutionJob } from './DecisionExecutionJob.js';
import { TradeExecutionJob } from './TradeExecutionJob.js';
import { AIDecisionRequestJob } from './AIDecisionRequestJob.js';
import { SystemCleanupJob } from './SystemCleanupJob.js';

// 任务实例存储
let decisionExecutionJob = null;
let tradeExecutionJob = null;
let aiDecisionRequestJob = null;
let systemCleanupJob = null;

/**
 * 设置定时任务
 */
export async function setupJobs() {
  console.log('🔄 设置后台任务...');

  try {
    // 初始化任务实例
    decisionExecutionJob = new DecisionExecutionJob();
    tradeExecutionJob = new TradeExecutionJob();
    aiDecisionRequestJob = new AIDecisionRequestJob();
    systemCleanupJob = new SystemCleanupJob();

    // 启动任务
    await decisionExecutionJob.start();
    await tradeExecutionJob.start();
    await aiDecisionRequestJob.start();
    await systemCleanupJob.start();

    console.log('✅ 后台任务设置完成');
  } catch (error) {
    console.error('❌ 设置后台任务失败:', error);
    throw error;
  }
}

/**
 * 停止所有任务
 */
export async function stopJobs() {
  console.log('🛑 停止后台任务...');

  try {
    // 停止所有任务
    if (decisionExecutionJob) {
      decisionExecutionJob.stop();
    }
    if (tradeExecutionJob) {
      tradeExecutionJob.stop();
    }
    if (aiDecisionRequestJob) {
      aiDecisionRequestJob.stop();
    }
    if (systemCleanupJob) {
      systemCleanupJob.stop();
    }

    console.log('✅ 后台任务已停止');
  } catch (error) {
    console.error('❌ 停止后台任务失败:', error);
    throw error;
  }
}

/**
 * 获取任务状态
 */
export function getJobStatus() {
  const jobs = [];

  if (decisionExecutionJob) {
    jobs.push(decisionExecutionJob.getStatus());
  }
  if (tradeExecutionJob) {
    jobs.push(tradeExecutionJob.getStatus());
  }
  if (aiDecisionRequestJob) {
    jobs.push(aiDecisionRequestJob.getStatus());
  }
  if (systemCleanupJob) {
    jobs.push(systemCleanupJob.getStatus());
  }

  return {
    jobs,
    lastUpdated: new Date().toISOString()
  };
}