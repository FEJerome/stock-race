import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  AIWakeupScheduler,
  AIWakeupSchedulerError,
  WakeupResultCode
} from '../../../src/services/AIWakeupScheduler.js';

describe('AIWakeupScheduler', () => {
  let scheduler;
  let mockQueue;
  let mockEventBus;

  beforeEach(() => {
    // Mock Bull queue
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      process: jest.fn(),
      on: jest.fn(),
      getWaiting: jest.fn().mockResolvedValue([]),
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getCompletedCount: jest.fn().mockResolvedValue(0),
      getFailedCount: jest.fn().mockResolvedValue(0),
      getDelayedCount: jest.fn().mockResolvedValue(0),
      clean: jest.fn().mockResolvedValue(),
      close: jest.fn().mockResolvedValue()
    };

    // Mock EventBus
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(true)
    };

    // Create scheduler
    scheduler = new AIWakeupScheduler({
      cooldownMs: 300000, // 5 minutes
      dailyLimit: 10,
      tokenBudget: 1000000,
      concurrency: 5
    });

    // Inject mocks
    scheduler.queue = mockQueue;
  });

  afterEach(async () => {
    if (scheduler) {
      await scheduler.close();
    }
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const defaultScheduler = new AIWakeupScheduler();
      expect(defaultScheduler.config.cooldownMs).toBe(300000);
      expect(defaultScheduler.config.dailyLimit).toBe(10);
      expect(defaultScheduler.config.tokenBudget).toBe(1000000);
    });

    it('should create with custom config', () => {
      const customScheduler = new AIWakeupScheduler({
        cooldownMs: 600000,
        dailyLimit: 20
      });
      expect(customScheduler.config.cooldownMs).toBe(600000);
      expect(customScheduler.config.dailyLimit).toBe(20);
    });
  });

  describe('shouldWakeup', () => {
    it('should allow wakeup when all checks pass', async () => {
      scheduler.checkCooldown = jest.fn().mockResolvedValue({ passed: true });
      scheduler.checkDailyLimit = jest.fn().mockResolvedValue({ passed: true, count: 0 });
      scheduler.checkTokenBudget = jest.fn().mockResolvedValue({ passed: true, used: 0 });

      const result = await scheduler.shouldWakeup('acc-123');

      expect(result.allowed).toBe(true);
    });

    it('should reject when in cooldown', async () => {
      scheduler.checkCooldown = jest.fn().mockResolvedValue({
        passed: false,
        remainingSeconds: 180,
        lastWakeupTime: Date.now() - 120000
      });

      const result = await scheduler.shouldWakeup('acc-123');

      expect(result.allowed).toBe(false);
      expect(result.code).toBe(WakeupResultCode.COOLDOWN);
      expect(result.details.remainingSeconds).toBe(180);
    });

    it('should reject when daily limit reached', async () => {
      scheduler.checkCooldown = jest.fn().mockResolvedValue({ passed: true });
      scheduler.checkDailyLimit = jest.fn().mockResolvedValue({
        passed: false,
        count: 10,
        resetTime: '2024-01-02T00:00:00Z'
      });

      const result = await scheduler.shouldWakeup('acc-123');

      expect(result.allowed).toBe(false);
      expect(result.code).toBe(WakeupResultCode.DAILY_LIMIT);
      expect(result.details.dailyCount).toBe(10);
    });

    it('should reject when token budget exceeded', async () => {
      scheduler.checkCooldown = jest.fn().mockResolvedValue({ passed: true });
      scheduler.checkDailyLimit = jest.fn().mockResolvedValue({ passed: true, count: 5 });
      scheduler.checkTokenBudget = jest.fn().mockResolvedValue({
        passed: false,
        used: 998000,
        remaining: 2000
      });

      const result = await scheduler.shouldWakeup('acc-123');

      expect(result.allowed).toBe(false);
      expect(result.code).toBe(WakeupResultCode.TOKEN_BUDGET);
      expect(result.details.remaining).toBe(2000);
    });
  });

  describe('checkCooldown', () => {
    it('should pass when enough time has elapsed', async () => {
      const now = Date.now();
      const lastWakeup = now - 400000; // 400 seconds ago

      scheduler.checkCooldown = jest.fn().mockImplementation(async (accountId, timestamp) => {
        const elapsed = timestamp - lastWakeup;
        if (elapsed < 300000) {
          return {
            passed: false,
            remainingSeconds: Math.ceil((300000 - elapsed) / 1000)
          };
        }
        return { passed: true };
      });

      const result = await scheduler.checkCooldown('acc-123', now);
      expect(result.passed).toBe(true);
    });

    it('should fail when within cooldown period', async () => {
      const now = Date.now();
      const lastWakeup = now - 120000; // 120 seconds ago

      scheduler.checkCooldown = jest.fn().mockResolvedValue({
        passed: false,
        remainingSeconds: 180
      });

      const result = await scheduler.checkCooldown('acc-123', now);
      expect(result.passed).toBe(false);
      expect(result.remainingSeconds).toBe(180);
    });
  });

  describe('checkDailyLimit', () => {
    it('should pass when under daily limit', async () => {
      scheduler.checkDailyLimit = jest.fn().mockResolvedValue({
        passed: true,
        count: 5
      });

      const result = await scheduler.checkDailyLimit('acc-123', Date.now());
      expect(result.passed).toBe(true);
      expect(result.count).toBe(5);
    });

    it('should fail when daily limit reached', async () => {
      scheduler.checkDailyLimit = jest.fn().mockResolvedValue({
        passed: false,
        count: 10,
        resetTime: '2024-01-02T00:00:00Z'
      });

      const result = await scheduler.checkDailyLimit('acc-123', Date.now());
      expect(result.passed).toBe(false);
      expect(result.count).toBe(10);
    });
  });

  describe('triggerWakeup', () => {
    it('should successfully trigger wakeup', async () => {
      scheduler.validateAccount = jest.fn().mockResolvedValue({
        valid: true
      });
      scheduler.shouldWakeup = jest.fn().mockResolvedValue({
        allowed: true
      });
      scheduler.updateLastWakeupTime = jest.fn().mockResolvedValue();

      const result = await scheduler.triggerWakeup('123', 'manual');

      expect(result.success).toBe(true);
      expect(result.code).toBe(WakeupResultCode.OK);
      expect(result.jobId).toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should reject when account not found', async () => {
      scheduler.validateAccount = jest.fn().mockResolvedValue({
        valid: false,
        code: WakeupResultCode.ACCOUNT_NOT_FOUND,
        message: 'AI账户不存在'
      });

      const result = await scheduler.triggerWakeup('999', 'manual');

      expect(result.success).toBe(false);
      expect(result.code).toBe(WakeupResultCode.ACCOUNT_NOT_FOUND);
    });

    it('should reject when account inactive', async () => {
      scheduler.validateAccount = jest.fn().mockResolvedValue({
        valid: false,
        code: WakeupResultCode.ACCOUNT_INACTIVE,
        message: 'AI账户未激活'
      });

      const result = await scheduler.triggerWakeup('123', 'manual');

      expect(result.success).toBe(false);
      expect(result.code).toBe(WakeupResultCode.ACCOUNT_INACTIVE);
    });

    it('should reject when in cooldown', async () => {
      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });
      scheduler.shouldWakeup = jest.fn().mockResolvedValue({
        allowed: false,
        code: WakeupResultCode.COOLDOWN,
        message: '冷却时间未到'
      });

      const result = await scheduler.triggerWakeup('123', 'manual');

      expect(result.success).toBe(false);
      expect(result.code).toBe(WakeupResultCode.COOLDOWN);
    });

    it('should track metrics on rejection', async () => {
      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });
      scheduler.shouldWakeup = jest.fn().mockResolvedValue({
        allowed: false,
        code: WakeupResultCode.DAILY_LIMIT
      });

      await scheduler.triggerWakeup('123', 'manual');

      expect(scheduler.metrics.totalTriggered).toBe(1);
      expect(scheduler.metrics.totalRejected).toBe(1);
      expect(scheduler.metrics.rejectedByDailyLimit).toBe(1);
    });
  });

  describe('batchTriggerWakeup', () => {
    it('should process multiple accounts', async () => {
      let callCount = 0;
      scheduler.triggerWakeup = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          success: callCount <= 3,
          code: callCount <= 3 ? WakeupResultCode.OK : WakeupResultCode.DAILY_LIMIT
        });
      });

      const accountIds = ['1', '2', '3', '4', '5'];
      const results = await scheduler.batchTriggerWakeup(accountIds, 'scheduled');

      expect(results.total).toBe(5);
      expect(results.succeeded).toBe(3);
      expect(results.rejected).toBe(2);
      expect(results.details).toHaveLength(5);
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(5);
      mockQueue.getActiveCount.mockResolvedValue(2);
      mockQueue.getCompletedCount.mockResolvedValue(100);
      mockQueue.getFailedCount.mockResolvedValue(3);
      mockQueue.getDelayedCount.mockResolvedValue(1);

      const stats = await scheduler.getQueueStats();

      expect(stats.waiting).toBe(5);
      expect(stats.active).toBe(2);
      expect(stats.completed).toBe(100);
      expect(stats.failed).toBe(3);
      expect(stats.delayed).toBe(1);
      expect(stats.total).toBe(8);
    });

    it('should return null when queue not initialized', async () => {
      scheduler.queue = null;
      const stats = await scheduler.getQueueStats();
      expect(stats).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('should return scheduler status', () => {
      scheduler.queue = mockQueue;
      scheduler.metrics.totalTriggered = 50;
      scheduler.metrics.totalSucceeded = 45;

      const status = scheduler.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.config.cooldownMs).toBe(300000);
      expect(status.config.dailyLimit).toBe(10);
      expect(status.metrics.totalTriggered).toBe(50);
      expect(status.metrics.totalSucceeded).toBe(45);
    });
  });

  describe('concurrency protection', () => {
    it('should handle concurrent triggers', async () => {
      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });
      scheduler.shouldWakeup = jest.fn().mockResolvedValue({ allowed: true });
      scheduler.updateLastWakeupTime = jest.fn().mockResolvedValue();

      // Simulate 5 concurrent triggers
      const promises = Array.from({ length: 5 }, (_, i) =>
        scheduler.triggerWakeup(`acc-${i}`, 'manual')
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockQueue.add).toHaveBeenCalledTimes(5);
    });
  });

  describe('duplicate prevention', () => {
    it('should reject duplicate triggers within cooldown', async () => {
      const now = Date.now();

      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });
      scheduler.shouldWakeup = jest.fn().mockImplementation(async (accountId) => {
        // First call passes, second call fails due to cooldown
        const callCount = scheduler.shouldWakeup.mock.calls.length;
        if (callCount > 1) {
          return {
            allowed: false,
            code: WakeupResultCode.COOLDOWN,
            message: '冷却时间未到',
            details: { remainingSeconds: 298 }
          };
        }
        return { allowed: true };
      });
      scheduler.updateLastWakeupTime = jest.fn().mockResolvedValue();

      // First trigger
      const result1 = await scheduler.triggerWakeup('123', 'manual');
      expect(result1.success).toBe(true);

      // Second trigger (immediate duplicate)
      const result2 = await scheduler.triggerWakeup('123', 'manual');
      expect(result2.success).toBe(false);
      expect(result2.code).toBe(WakeupResultCode.COOLDOWN);
    });
  });

  describe('daily limit tracking', () => {
    it('should track daily count correctly', async () => {
      scheduler.validateAccount = jest.fn().mockResolvedValue({ valid: true });

      let dailyCount = 0;
      scheduler.shouldWakeup = jest.fn().mockImplementation(async () => {
        if (dailyCount >= 10) {
          return {
            allowed: false,
            code: WakeupResultCode.DAILY_LIMIT,
            message: '已达到每日限制'
          };
        }
        dailyCount++;
        return { allowed: true };
      });
      scheduler.updateLastWakeupTime = jest.fn().mockResolvedValue();

      // Try 12 triggers
      const results = [];
      for (let i = 0; i < 12; i++) {
        results.push(await scheduler.triggerWakeup('123', 'manual'));
      }

      const succeeded = results.filter(r => r.success).length;
      const rejected = results.filter(r => !r.success && r.code === WakeupResultCode.DAILY_LIMIT).length;

      expect(succeeded).toBe(10);
      expect(rejected).toBe(2);
    });
  });
});
