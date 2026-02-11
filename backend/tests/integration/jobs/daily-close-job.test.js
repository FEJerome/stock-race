import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { DailyAICloseJob } from '../../../src/jobs/DailyAICloseJob.js';
import { aiWakeupScheduler } from '../../../src/services/AIWakeupScheduler.js';

/**
 * 每日收盘批量更新任务集成测试
 * 验证定时触发逻辑、分批执行、错误处理
 *
 * 注意：运行这些测试需要Redis服务
 * - Redis (端口6379)
 */

describe('Daily AI Close Job Integration Tests', () => {
  const TEST_TIMEOUT = 60000;

  let job;

  beforeAll(async () => {
    job = new DailyAICloseJob({
      batchSize: 5,
      batchIntervalMs: 100,
      rateLimitPerSecond: 10,
      cron: '* * * * *', // Every minute for testing
      enabled: false // Don't actually start cron in tests
    });

    try {
      await job.init();
    } catch (error) {
      console.warn('Redis连接失败，跳过集成测试:', error.message);
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (job) {
      await job.close();
    }
  }, TEST_TIMEOUT);

  beforeEach(async () => {
    if (job.queue) {
      await job.clearQueue();
    }
    job.resetMetrics();
  });

  describe('Batch Execution', () => {
    it('should split 100 accounts into 20 batches of 5', async () => {
      // Mock getActiveAccounts to return 100 accounts
      const mockAccounts = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Account ${i + 1}`,
        userId: i + 1
      }));

      job.getActiveAccounts = jest.fn().mockResolvedValue(mockAccounts);

      // Mock aiWakeupScheduler.triggerWakeup
      aiWakeupScheduler.triggerWakeup = jest.fn().mockResolvedValue({
        success: true,
        code: 'OK'
      });

      aiWakeupScheduler.init = jest.fn().mockResolvedValue();

      const results = await job.execute();

      expect(results.total).toBe(100);
      expect(results.batches.length).toBe(20); // 100 / 5 = 20 batches
      expect(results.batches[0].accountCount).toBe(5);
    }, TEST_TIMEOUT);

    it('should execute batches with interval', async () => {
      const mockAccounts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Account ${i + 1}`,
        userId: i + 1
      }));

      job.getActiveAccounts = jest.fn().mockResolvedValue(mockAccounts);

      aiWakeupScheduler.triggerWakeup = jest.fn().mockResolvedValue({
        success: true,
        code: 'OK'
      });

      aiWakeupScheduler.init = jest.fn().mockResolvedValue();

      const startTime = Date.now();
      await job.execute();
      const executionTime = Date.now() - startTime;

      // With 10 accounts and batchSize 5, we have 2 batches
      // With batchIntervalMs 100, there should be at least 100ms delay between batches
      expect(executionTime).toBeGreaterThanOrEqual(100);
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should continue processing when some accounts fail', async () => {
      const mockAccounts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Account ${i + 1}`,
        userId: i + 1
      }));

      job.getActiveAccounts = jest.fn().mockResolvedValue(mockAccounts);

      // Make every 3rd account fail
      let callCount = 0;
      aiWakeupScheduler.triggerWakeup = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 3 === 0) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ success: true, code: 'OK' });
      });

      aiWakeupScheduler.init = jest.fn().mockResolvedValue();

      const results = await job.execute();

      expect(results.total).toBe(10);
      expect(results.failed).toBe(3); // accounts 3, 6, 9
      expect(results.queued).toBe(7);
    }, TEST_TIMEOUT);

    it('should handle account rejection (cooldown/limit) gracefully', async () => {
      const mockAccounts = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `Account ${i + 1}`,
        userId: i + 1
      }));

      job.getActiveAccounts = jest.fn().mockResolvedValue(mockAccounts);

      // Make some accounts be rejected
      aiWakeupScheduler.triggerWakeup = jest.fn().mockImplementation((accountId) => {
        if (accountId === '2' || accountId === '4') {
          return Promise.resolve({
            success: false,
            code: 'COOLDOWN',
            message: '冷却时间未到'
          });
        }
        return Promise.resolve({ success: true, code: 'OK' });
      });

      aiWakeupScheduler.init = jest.fn().mockResolvedValue();

      const results = await job.execute();

      expect(results.total).toBe(5);
      expect(results.queued).toBe(3); // 1, 3, 5
      expect(results.rejected).toBe(2); // 2, 4
    }, TEST_TIMEOUT);
  });

  describe('Rate Limiting', () => {
    it('should limit requests to 5 per second', async () => {
      job.config.rateLimitPerSecond = 5;
      job.config.batchSize = 10; // Process all in one batch

      const mockAccounts = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `Account ${i + 1}`,
        userId: i + 1
      }));

      job.getActiveAccounts = jest.fn().mockResolvedValue(mockAccounts);

      const triggerTimes = [];
      aiWakeupScheduler.triggerWakeup = jest.fn().mockImplementation(() => {
        triggerTimes.push(Date.now());
        return Promise.resolve({ success: true, code: 'OK' });
      });

      aiWakeupScheduler.init = jest.fn().mockResolvedValue();

      const startTime = Date.now();
      await job.execute();
      const executionTime = Date.now() - startTime;

      // With 5 accounts and 5 req/s, each request should be at least 200ms apart
      // Total time should be at least 800ms (4 intervals of 200ms)
      expect(executionTime).toBeGreaterThanOrEqual(800);

      // Verify spacing between requests
      for (let i = 1; i < triggerTimes.length; i++) {
        const spacing = triggerTimes[i] - triggerTimes[i - 1];
        expect(spacing).toBeGreaterThanOrEqual(190); // Allow 10ms tolerance
      }
    }, TEST_TIMEOUT);
  });

  describe('Job Status', () => {
    it('should return correct status', () => {
      const status = job.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('cron');
      expect(status).toHaveProperty('timezone');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('metrics');
    });

    it('should track metrics correctly', async () => {
      const mockAccounts = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Account ${i + 1}`,
        userId: i + 1
      }));

      job.getActiveAccounts = jest.fn().mockResolvedValue(mockAccounts);

      aiWakeupScheduler.triggerWakeup = jest.fn().mockResolvedValue({
        success: true,
        code: 'OK'
      });

      aiWakeupScheduler.init = jest.fn().mockResolvedValue();

      await job.execute();

      const status = job.getStatus();
      expect(status.metrics.totalExecutions).toBe(1);
      expect(status.metrics.totalAccounts).toBe(10);
      expect(status.metrics.totalQueued).toBe(10);
    }, TEST_TIMEOUT);
  });

  describe('Queue Stats', () => {
    it('should return queue statistics', async () => {
      if (!job.queue) {
        console.log('Skipping - queue not initialized');
        return;
      }

      const stats = await job.getQueueStats();

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('delayed');
      expect(stats).toHaveProperty('total');
    }, TEST_TIMEOUT);
  });

  describe('Empty Account List', () => {
    it('should handle empty account list', async () => {
      job.getActiveAccounts = jest.fn().mockResolvedValue([]);

      const results = await job.execute();

      expect(results.total).toBe(0);
      expect(results.queued).toBe(0);
      expect(results.batches).toHaveLength(0);
    }, TEST_TIMEOUT);
  });

  describe('Cron Scheduling', () => {
    it('should start with correct cron pattern', async () => {
      if (!job.queue) {
        console.log('Skipping - queue not initialized');
        return;
      }

      job.config.enabled = true;

      // Mock the queue.add to capture the cron pattern
      const addSpy = jest.spyOn(job.queue, 'add').mockResolvedValue({
        opts: { repeat: { key: 'test-key' } }
      });

      await job.start();

      expect(addSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          repeat: expect.objectContaining({
            cron: '* * * * *',
            tz: 'Asia/Shanghai'
          })
        })
      );

      addSpy.mockRestore();
    }, TEST_TIMEOUT);
  });
});
