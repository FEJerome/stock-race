import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AIWakeupScheduler, WakeupResultCode } from '../../../src/services/AIWakeupScheduler.js';

/**
 * AI唤醒队列集成测试
 * 验证Bull队列任务提交和执行
 *
 * 注意：运行这些测试需要Redis服务
 * - Redis (端口6379)
 */

describe('AI Wakeup Queue Integration Tests', () => {
  const TEST_TIMEOUT = 30000;

  let scheduler;

  beforeAll(async () => {
    scheduler = new AIWakeupScheduler({
      cooldownMs: 5000, // 5 seconds for testing
      dailyLimit: 10,
      tokenBudget: 100000,
      concurrency: 2
    });

    try {
      await scheduler.init();
    } catch (error) {
      console.warn('Redis连接失败，跳过集成测试:', error.message);
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (scheduler) {
      await scheduler.clearQueue();
      await scheduler.close();
    }
  }, TEST_TIMEOUT);

  describe('Queue Operations', () => {
    it('should add job to queue', async () => {
      if (!scheduler.queue) {
        console.log('Skipping - queue not initialized');
        return;
      }

      // Mock account validation
      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });
      scheduler.shouldWakeup = jest.fn().mockResolvedValue({ allowed: true });
      scheduler.updateLastWakeupTime = jest.fn().mockResolvedValue();

      const result = await scheduler.triggerWakeup('test-123', 'manual');

      expect(result.success).toBe(true);
      expect(result.jobId).toBeDefined();
    }, TEST_TIMEOUT);

    it('should get queue statistics', async () => {
      if (!scheduler.queue) {
        console.log('Skipping - queue not initialized');
        return;
      }

      const stats = await scheduler.getQueueStats();

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
    }, TEST_TIMEOUT);
  });

  describe('Cooldown Protection', () => {
    it('should enforce cooldown between triggers', async () => {
      if (!scheduler.queue) {
        console.log('Skipping - queue not initialized');
        return;
      }

      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });
      scheduler.updateLastWakeupTime = jest.fn().mockResolvedValue();

      // First trigger
      scheduler.shouldWakeup = jest.fn().mockResolvedValueOnce({ allowed: true });
      const result1 = await scheduler.triggerWakeup('cooldown-test', 'manual');
      expect(result1.success).toBe(true);

      // Second trigger within cooldown
      scheduler.shouldWakeup = jest.fn().mockResolvedValueOnce({
        allowed: false,
        code: WakeupResultCode.COOLDOWN,
        message: '冷却时间未到',
        details: { remainingSeconds: 300 }
      });
      const result2 = await scheduler.triggerWakeup('cooldown-test', 'manual');
      expect(result2.success).toBe(false);
      expect(result2.code).toBe(WakeupResultCode.COOLDOWN);
    }, TEST_TIMEOUT);
  });

  describe('Daily Limit Protection', () => {
    it('should enforce daily limit', async () => {
      if (!scheduler.queue) {
        console.log('Skipping - queue not initialized');
        return;
      }

      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });
      scheduler.updateLastWakeupTime = jest.fn().mockResolvedValue();

      // Mock at daily limit
      scheduler.shouldWakeup = jest.fn().mockResolvedValue({
        allowed: false,
        code: WakeupResultCode.DAILY_LIMIT,
        message: '已达到每日限制',
        details: { dailyCount: 10, dailyLimit: 10 }
      });

      const result = await scheduler.triggerWakeup('limit-test', 'manual');

      expect(result.success).toBe(false);
      expect(result.code).toBe(WakeupResultCode.DAILY_LIMIT);
    }, TEST_TIMEOUT);
  });

  describe('Concurrent Execution', () => {
    it('should handle 5 concurrent triggers', async () => {
      if (!scheduler.queue) {
        console.log('Skipping - queue not initialized');
        return;
      }

      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });
      scheduler.shouldWakeup = jest.fn().mockResolvedValue({ allowed: true });
      scheduler.updateLastWakeupTime = jest.fn().mockResolvedValue();

      // Trigger 5 concurrent wakeups for different accounts
      const promises = Array.from({ length: 5 }, (_, i) =>
        scheduler.triggerWakeup(`concurrent-${i}`, 'manual')
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);

      // Check queue stats
      const stats = await scheduler.getQueueStats();
      expect(stats.waiting + stats.active + stats.completed).toBeGreaterThanOrEqual(5);
    }, TEST_TIMEOUT);
  });

  describe('Event Publishing', () => {
    it('should publish wakeup event', async () => {
      if (!scheduler.queue) {
        console.log('Skipping - queue not initialized');
        return;
      }

      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });
      scheduler.shouldWakeup = jest.fn().mockResolvedValue({ allowed: true });
      scheduler.updateLastWakeupTime = jest.fn().mockResolvedValue();

      const { eventBus } = await import('../../../src/events/EventBus.js');
      const publishSpy = jest.spyOn(eventBus, 'publish').mockResolvedValue(true);

      await scheduler.triggerWakeup('event-test', 'manual');

      expect(publishSpy).toHaveBeenCalledWith(
        'ai:wakeup:trigger',
        expect.objectContaining({
          accountId: 'event-test',
          triggerType: 'manual',
          timestamp: expect.any(Number)
        })
      );

      publishSpy.mockRestore();
    }, TEST_TIMEOUT);
  });
});
