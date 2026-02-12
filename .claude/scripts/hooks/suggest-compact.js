#!/usr/bin/env node
/**
 * Strategic Compact Suggester - 智能压缩建议钩子
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs on PreToolUse or periodically to suggest manual compaction at logical intervals
 *
 * 为什么选择手动压缩而非自动压缩：
 * - 自动压缩发生在任意时间点，经常在任务中途打断
 * - 战略压缩在逻辑阶段转换时保护上下文连续性
 * - 在探索阶段后、执行阶段前压缩
 * - 在完成里程碑后、开始下一个任务前压缩
 */

const path = require('path');
const fs = require('fs');

// 尝试加载工具模块，失败时静默退出
let utils;
try {
  utils = require('../lib/utils');
} catch (error) {
  // 模块加载失败时静默退出，避免控制台错误
  process.exit(0);
}

const {
  getTempDir,
  readFile,
  writeFile,
  log
} = utils;

async function main() {
  // 跟踪工具调用次数（在临时文件中递增）
  // 使用基于父进程PID或环境变量中的会话ID的会话特定计数器文件
  const sessionId = process.env.CLAUDE_SESSION_ID || process.ppid || 'default';
  const counterFile = path.join(getTempDir(), `claude-tool-count-${sessionId}`);
  const threshold = parseInt(process.env.CLAUDE_COMPACT_THRESHOLD || '50', 10);
  const checkInterval = parseInt(process.env.CLAUDE_COMPACT_CHECK_INTERVAL || '25', 10);
  const phaseAware = process.env.CLAUDE_COMPACT_PHASE_AWARE !== 'false';
  const verboseMode = process.env.CLAUDE_COMPACT_VERBOSE === 'true';

  let count = 1;

  // 读取现有计数或从1开始
  const existing = readFile(counterFile);
  if (existing) {
    count = parseInt(existing.trim(), 10) + 1;
  }

  // 保存更新后的计数
  writeFile(counterFile, String(count));

  // 分析上下文状态（可选）
  let currentPhase = 'unknown';
  if (phaseAware) {
    currentPhase = analyzeWorkingPhase(count);
  }

  // 在达到阈值时建议压缩
  if (count === threshold) {
    const suggestion = getSuggestionMessage('tool_threshold', {
      count: threshold,
      phase: currentPhase
    });
    log(suggestion);

    if (verboseMode) {
      log(`[StrategicCompact] Detailed: Phase: ${currentPhase}, Count: ${count}/${threshold}`);
    }
  }

  // 达到阈值后定期建议
  if (count > threshold && count % checkInterval === 0) {
    const suggestion = getSuggestionMessage('regular_interval', {
      count: count,
      interval: checkInterval,
      phase: currentPhase
    });
    log(suggestion);

    if (verboseMode) {
      log(`[StrategicCompact] Detailed: ${count} tool calls, last compact at ${threshold}`);
    }
  }

  // 阶段转换检测（如果启用）
  if (phaseAware && detectPhaseTransition(count, currentPhase)) {
    const suggestion = getSuggestionMessage('phase_transition', {
      fromPhase: getPreviousPhase(count),
      toPhase: currentPhase,
      count: count
    });
    log(suggestion);

    if (verboseMode) {
      log(`[StrategicCompact] Detailed: Phase transition detected (${getPreviousPhase(count)} → ${currentPhase})`);
    }
  }

  process.exit(0);
}

/**
 * 分析工作阶段
 */
function analyzeWorkingPhase(toolCallCount) {
  if (toolCallCount < 10) {
    return 'exploration';  // 探索阶段：了解问题，研究代码
  } else if (toolCallCount < 40) {
    return 'execution';    // 执行阶段：实现功能，编写代码
  } else if (toolCallCount < 70) {
    return 'testing';      // 测试阶段：验证功能，修复问题
  } else {
    return 'refinement';   // 优化阶段：改进代码，文档编写
  }
}

/**
 * 检测阶段转换
 */
function detectPhaseTransition(count, currentPhase) {
  // 简单的基于工具调用次数的阶段转换检测
  const previousPhase = getPreviousPhase(count);
  return previousPhase !== currentPhase;
}

/**
 * 获取前一个阶段
 */
function getPreviousPhase(count) {
  return analyzeWorkingPhase(count - 1);
}

/**
 * 获取建议消息
 */
function getSuggestionMessage(type, data) {
  const messages = {
    tool_threshold: `[StrategicCompact] ${data.count} 工具调用达到阈值 - 如果正在切换阶段，考虑使用 /compact`,
    regular_interval: `[StrategicCompact] ${data.count} 工具调用 - 如果上下文已过时，这是使用 /compact 的好时机`,
    phase_transition: `[StrategicCompact] 检测到阶段转换 (${data.fromPhase} → ${data.toPhase}) - 使用 /compact 可以保护上下文连续性`,
    milestone: `[StrategicCompact] 达到里程碑 (${data.count} 工具调用) - 使用 /compact 保存上下文`
  };

  return messages[type] || `[StrategicCompact] 考虑使用 /compact 来优化上下文使用`;
}

main().catch(err => {
  console.error('[StrategicCompact] 错误:', err.message);
  process.exit(0); // 错误时不阻塞
});