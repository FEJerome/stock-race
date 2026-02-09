#!/usr/bin/env node
/**
 * Performance Monitor for Claude Code Hooks
 *
 * Cross-platform performance monitoring and logging for hook scripts
 * Tracks execution time, memory usage, and success/failure rates
 *
 * Features:
 * 1. Hook execution time tracking
 * 2. Memory usage monitoring (RSS, heap used/total)
 * 3. Success/failure rate tracking
 * 4. Performance threshold alerts
 * 5. Log rotation and cleanup
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./utils');

// Performance stats storage directory
const STATS_DIR = path.join(require('os').homedir(), '.claude', 'performance-stats');

/**
 * Performance Monitor class
 */
class PerformanceMonitor {
  constructor(hookName, options = {}) {
    this.hookName = hookName;
    this.startTime = null;
    this.startMemory = null;
    this.options = {
      enableMemoryTracking: true,
      enableLogging: true,
      logThresholdMs: 1000, // Log if execution > 1000ms
      memoryThresholdMB: 100, // Warn if memory > 100MB
      ...options
    };

    // Ensure stats directory exists
    if (!fs.existsSync(STATS_DIR)) {
      fs.mkdirSync(STATS_DIR, { recursive: true });
    }
  }

  /**
   * Start monitoring
   */
  start() {
    this.startTime = process.hrtime();
    if (this.options.enableMemoryTracking) {
      this.startMemory = process.memoryUsage();
    }
    return this;
  }

  /**
   * Stop monitoring and record stats
   * @param {boolean} success - Whether the hook succeeded
   * @param {string} errorMessage - Error message if failed
   */
  stop(success = true, errorMessage = null) {
    if (!this.startTime) {
      log(`[PerformanceMonitor] ${this.hookName}: Monitor not started`);
      return null;
    }

    const elapsed = process.hrtime(this.startTime);
    const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1000000;

    let memoryInfo = null;
    if (this.options.enableMemoryTracking && this.startMemory) {
      const endMemory = process.memoryUsage();
      memoryInfo = {
        rssStartMB: this.startMemory.rss / 1024 / 1024,
        rssEndMB: endMemory.rss / 1024 / 1024,
        rssDeltaMB: (endMemory.rss - this.startMemory.rss) / 1024 / 1024,
        heapUsedStartMB: this.startMemory.heapUsed / 1024 / 1024,
        heapUsedEndMB: endMemory.heapUsed / 1024 / 1024,
        heapUsedDeltaMB: (endMemory.heapUsed - this.startMemory.heapUsed) / 1024 / 1024,
        heapTotalStartMB: this.startMemory.heapTotal / 1024 / 1024,
        heapTotalEndMB: endMemory.heapTotal / 1024 / 1024,
        heapTotalDeltaMB: (endMemory.heapTotal - this.startMemory.heapTotal) / 1024 / 1024
      };
    }

    const stats = {
      hookName: this.hookName,
      timestamp: new Date().toISOString(),
      elapsedMs: Math.round(elapsedMs * 100) / 100, // 2 decimal places
      success: success,
      errorMessage: errorMessage,
      memoryInfo: memoryInfo,
      pid: process.pid,
      platform: process.platform
    };

    // Save stats to file
    this._saveStats(stats);

    // Log if thresholds exceeded
    this._checkThresholds(stats);

    // Return stats for immediate use
    return stats;
  }

  /**
   * Save stats to JSON file
   */
  _saveStats(stats) {
    try {
      const date = new Date();
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const statsFile = path.join(STATS_DIR, `${dateStr}-performance.jsonl`);

      // Append as JSON lines format
      fs.appendFileSync(statsFile, JSON.stringify(stats) + '\n', 'utf8');
    } catch (err) {
      log(`[PerformanceMonitor] Error saving stats: ${err.message}`);
    }
  }

  /**
   * Check performance thresholds and log warnings
   */
  _checkThresholds(stats) {
    if (stats.elapsedMs > this.options.logThresholdMs) {
      log(`[PerformanceMonitor] ${this.hookName}: Slow execution ${stats.elapsedMs}ms > ${this.options.logThresholdMs}ms threshold`);
    }

    if (stats.memoryInfo && stats.memoryInfo.rssEndMB > this.options.memoryThresholdMB) {
      log(`[PerformanceMonitor] ${this.hookName}: High memory usage ${stats.memoryInfo.rssEndMB.toFixed(2)}MB > ${this.options.memoryThresholdMB}MB threshold`);
    }

    if (!stats.success && stats.errorMessage) {
      log(`[PerformanceMonitor] ${this.hookName}: Failed with error: ${stats.errorMessage}`);
    }
  }

  /**
   * Get summary statistics for a hook
   */
  static getHookStats(hookName, days = 7) {
    const stats = PerformanceMonitor._readStats(days);
    const hookStats = stats.filter(s => s.hookName === hookName);

    if (hookStats.length === 0) {
      return null;
    }

    const successful = hookStats.filter(s => s.success);
    const failed = hookStats.filter(s => !s.success);
    const executionTimes = hookStats.map(s => s.elapsedMs);

    return {
      hookName: hookName,
      totalExecutions: hookStats.length,
      successRate: hookStats.length > 0 ? (successful.length / hookStats.length) * 100 : 0,
      avgExecutionTime: executionTimes.length > 0 ?
        executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length : 0,
      minExecutionTime: executionTimes.length > 0 ? Math.min(...executionTimes) : 0,
      maxExecutionTime: executionTimes.length > 0 ? Math.max(...executionTimes) : 0,
      recentExecutions: hookStats.slice(0, 10), // Last 10 executions
      lastExecution: hookStats.length > 0 ? hookStats[0] : null
    };
  }

  /**
   * Get overall performance summary
   */
  static getOverallStats(days = 7) {
    const stats = PerformanceMonitor._readStats(days);
    if (stats.length === 0) {
      return null;
    }

    const byHook = {};
    stats.forEach(stat => {
      if (!byHook[stat.hookName]) {
        byHook[stat.hookName] = [];
      }
      byHook[stat.hookName].push(stat);
    });

    const summary = {
      totalRecords: stats.length,
      uniqueHooks: Object.keys(byHook).length,
      hooks: {},
      overallSuccessRate: 0,
      avgExecutionTime: 0
    };

    let totalSuccess = 0;
    let totalExecutionTime = 0;

    for (const [hookName, hookStats] of Object.entries(byHook)) {
      const successful = hookStats.filter(s => s.success);
      const executionTimes = hookStats.map(s => s.elapsedMs);

      summary.hooks[hookName] = {
        totalExecutions: hookStats.length,
        successRate: (successful.length / hookStats.length) * 100,
        avgExecutionTime: executionTimes.length > 0 ?
          executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length : 0
      };

      totalSuccess += successful.length;
      totalExecutionTime += executionTimes.reduce((a, b) => a + b, 0);
    }

    summary.overallSuccessRate = (totalSuccess / stats.length) * 100;
    summary.avgExecutionTime = totalExecutionTime / stats.length;

    return summary;
  }

  /**
   * Read stats from files
   */
  static _readStats(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const stats = [];

    try {
      const files = fs.readdirSync(STATS_DIR);
      const jsonlFiles = files.filter(f => f.endsWith('-performance.jsonl'));

      for (const file of jsonlFiles) {
        // Extract date from filename (YYYY-MM-DD-performance.jsonl)
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})-/);
        if (!dateMatch) continue;

        const fileDate = new Date(dateMatch[1]);
        if (fileDate < cutoffDate) {
          continue; // Skip old files
        }

        const filePath = path.join(STATS_DIR, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const stat = JSON.parse(line);
              stats.push(stat);
            } catch (err) {
              // Skip invalid JSON lines
            }
          }
        } catch (err) {
          // Skip unreadable files
        }
      }

      // Sort by timestamp descending (newest first)
      stats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (err) {
      // Stats directory might not exist yet
    }

    return stats;
  }

  /**
   * Clean up old stats files
   */
  static cleanupOldStats(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      if (!fs.existsSync(STATS_DIR)) {
        return 0;
      }

      const files = fs.readdirSync(STATS_DIR);
      const jsonlFiles = files.filter(f => f.endsWith('-performance.jsonl'));

      let deletedCount = 0;
      for (const file of jsonlFiles) {
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})-/);
        if (!dateMatch) continue;

        const fileDate = new Date(dateMatch[1]);
        if (fileDate < cutoffDate) {
          const filePath = path.join(STATS_DIR, file);
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (err) {
            log(`[PerformanceMonitor] Error deleting old stats file ${file}: ${err.message}`);
          }
        }
      }

      log(`[PerformanceMonitor] Cleaned up ${deletedCount} old stats files (keeping last ${daysToKeep} days)`);
      return deletedCount;
    } catch (err) {
      log(`[PerformanceMonitor] Error cleaning up old stats: ${err.message}`);
      return 0;
    }
  }
}

/**
 * Utility function to wrap hook execution with performance monitoring
 */
function monitorHook(hookName, hookFunction, options = {}) {
  return async function(...args) {
    const monitor = new PerformanceMonitor(hookName, options);
    monitor.start();

    try {
      const result = await hookFunction(...args);
      monitor.stop(true);
      return result;
    } catch (error) {
      monitor.stop(false, error.message);
      throw error;
    }
  };
}

// Export the PerformanceMonitor class and utility functions
module.exports = {
  PerformanceMonitor,
  monitorHook,
  STATS_DIR
};