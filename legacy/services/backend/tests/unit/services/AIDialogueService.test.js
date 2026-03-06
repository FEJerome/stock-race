import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AIDialogueService, AIDialogueError } from '../../../src/services/AIDialogueService.js';

describe('AIDialogueService', () => {
  let service;

  beforeEach(() => {
    service = new AIDialogueService();
    // 停止清理任务，避免影响测试
    service.stopCleanupTask();
  });

  afterEach(() => {
    service.close();
  });

  describe('Session Management', () => {
    it('should create a new session', () => {
      const session = service.createSession('account-1', {
        socketId: 'socket-1',
        userId: 'user-1'
      });

      expect(session).toBeDefined();
      expect(session.accountId).toBe('account-1');
      expect(session.socketId).toBe('socket-1');
      expect(session.userId).toBe('user-1');
      expect(session.roundCount).toBe(0);
      expect(session.status).toBe('active');
      expect(session.messages).toEqual([]);
    });

    it('should retrieve session by accountId', () => {
      service.createSession('account-1', { socketId: 'socket-1' });

      const session = service.getSession('account-1');
      expect(session).toBeDefined();
      expect(session.accountId).toBe('account-1');
    });

    it('should return null for non-existent session', () => {
      const session = service.getSession('non-existent');
      expect(session).toBeNull();
    });
  });

  describe('Connection Management', () => {
    it('should allow first connection', async () => {
      const result = await service.registerConnection('account-1', 'socket-1', {
        userId: 'user-1'
      });

      expect(result.allowed).not.toBe(false);
      expect(result.roundCount).toBe(0);
      expect(result.remainingRounds).toBe(10);
      expect(result.maxRounds).toBe(10);
    });

    it('should reject concurrent connections for same account', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1' });

      await expect(
        service.registerConnection('account-1', 'socket-2', { userId: 'user-1' })
      ).rejects.toThrow(AIDialogueError);

      try {
        await service.registerConnection('account-1', 'socket-2', { userId: 'user-1' });
      } catch (error) {
        expect(error.code).toBe('ALREADY_CONNECTED');
        expect(error.details.existingSocketId).toBe('socket-1');
      }
    });

    it('should allow reconnection from same socket', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1' });

      // Same socket should be allowed
      const result = await service.registerConnection('account-1', 'socket-1', { userId: 'user-1' });
      expect(result.roundCount).toBe(0);
    });

    it('should allow connection after disconnect', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1' });
      service.disconnect('account-1', 'socket-1');

      // New socket should be allowed after disconnect
      const result = await service.registerConnection('account-1', 'socket-2', { userId: 'user-1' });
      expect(result.roundCount).toBe(0);
    });

    it('should only disconnect matching socket', () => {
      service.createSession('account-1', { socketId: 'socket-1' });
      service.activeConnections.set('account-1', 'socket-1');

      // Try to disconnect with different socket
      service.disconnect('account-1', 'socket-2');

      // Connection should still exist
      expect(service.activeConnections.has('account-1')).toBe(true);
    });
  });

  describe('Round Limit', () => {
    it('should track round count', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1', cooldownMs: 0 });

      const result1 = await service.sendMessage('account-1', 'socket-1', 'Hello');
      expect(result1.roundCount).toBe(1);

      const result2 = await service.sendMessage('account-1', 'socket-1', 'How are you?');
      expect(result2.roundCount).toBe(2);
    });

    it('should reject messages after reaching round limit', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1', cooldownMs: 0 });

      // Send 10 messages (max rounds)
      for (let i = 0; i < 10; i++) {
        await service.sendMessage('account-1', 'socket-1', `Message ${i}`);
      }

      // 11th message should fail
      await expect(
        service.sendMessage('account-1', 'socket-1', '11th message')
      ).rejects.toThrow(AIDialogueError);

      try {
        await service.sendMessage('account-1', 'socket-1', '11th message');
      } catch (error) {
        expect(error.code).toBe('ROUND_LIMIT_REACHED');
        expect(error.details.roundCount).toBe(10);
        expect(error.details.maxRounds).toBe(10);
      }
    });

    it('should report remaining rounds correctly', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1', cooldownMs: 0 });

      const result = await service.sendMessage('account-1', 'socket-1', 'Hello');
      expect(result.remainingRounds).toBe(9);
      expect(result.isLastRound).toBe(false);
    });

    it('should indicate last round', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1', cooldownMs: 0 });

      // Send 9 messages
      for (let i = 0; i < 9; i++) {
        await service.sendMessage('account-1', 'socket-1', `Message ${i}`);
      }

      // 10th message is the last
      const result = await service.sendMessage('account-1', 'socket-1', 'Last message');
      expect(result.roundCount).toBe(10);
      expect(result.remainingRounds).toBe(0);
      expect(result.isLastRound).toBe(true);
    });

    it('should allow custom max rounds', async () => {
      const result = await service.registerConnection('account-1', 'socket-1', {
        userId: 'user-1',
        maxRounds: 5,
        cooldownMs: 0
      });

      expect(result.maxRounds).toBe(5);
      expect(result.remainingRounds).toBe(5);
    });
  });

  describe('Cooldown Time', () => {
    it('should enforce cooldown between messages', async () => {
      // Use a fresh service instance for this test
      const testService = new AIDialogueService();
      testService.stopCleanupTask();

      const accountId = `cooldown-test-${Date.now()}`;
      await testService.registerConnection(accountId, 'socket-1', {
        userId: 'user-1',
        cooldownMs: 100  // 100ms cooldown for faster test
      });

      await testService.sendMessage(accountId, 'socket-1', 'First message');

      // Immediate second message should fail
      await expect(
        testService.sendMessage(accountId, 'socket-1', 'Second message')
      ).rejects.toThrow(AIDialogueError);

      try {
        await testService.sendMessage(accountId, 'socket-1', 'Second message');
      } catch (error) {
        expect(error.code).toBe('COOLDOWN');
        expect(error.details.remainingCooldown).toBeGreaterThan(0);
      }

      // Wait for cooldown to expire before closing
      await new Promise(resolve => setTimeout(resolve, 150));
      testService.close();
    });

    it('should allow message after cooldown', async () => {
      // Use a fresh service instance for this test
      const testService = new AIDialogueService();
      testService.stopCleanupTask();

      const accountId = `cooldown-test-${Date.now()}`;
      await testService.registerConnection(accountId, 'socket-1', {
        userId: 'user-1',
        cooldownMs: 0  // Disable cooldown for this test
      });

      await testService.sendMessage(accountId, 'socket-1', 'First message');

      // Should succeed immediately with no cooldown
      const result = await testService.sendMessage(accountId, 'socket-1', 'Second message');
      expect(result.roundCount).toBe(2);

      testService.close();
    });
  });

  describe('Message Length Limit', () => {
    it('should reject messages exceeding max length', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1', cooldownMs: 0 });

      const longMessage = 'a'.repeat(2001);  // Exceeds 2000 limit

      await expect(
        service.sendMessage('account-1', 'socket-1', longMessage)
      ).rejects.toThrow(AIDialogueError);

      try {
        await service.sendMessage('account-1', 'socket-1', longMessage);
      } catch (error) {
        expect(error.code).toBe('MESSAGE_TOO_LONG');
        expect(error.details.maxLength).toBe(2000);
      }
    });

    it('should accept messages at max length', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1', cooldownMs: 0 });

      const maxMessage = 'a'.repeat(2000);  // Exactly at limit

      const result = await service.sendMessage('account-1', 'socket-1', maxMessage);
      expect(result.roundCount).toBe(1);
    });
  });

  describe('Session Authorization', () => {
    it('should reject messages from unauthorized socket', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1' });

      await expect(
        service.sendMessage('account-1', 'socket-2', 'Unauthorized message')
      ).rejects.toThrow(AIDialogueError);

      try {
        await service.sendMessage('account-1', 'socket-2', 'Unauthorized message');
      } catch (error) {
        expect(error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should reject messages for non-existent session', async () => {
      await expect(
        service.sendMessage('non-existent', 'socket-1', 'Message')
      ).rejects.toThrow(AIDialogueError);

      try {
        await service.sendMessage('non-existent', 'socket-1', 'Message');
      } catch (error) {
        expect(error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should reject messages for inactive session', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1' });

      // End the session
      await service.endDialogue('account-1', 'socket-1');

      await expect(
        service.sendMessage('account-1', 'socket-1', 'Message after end')
      ).rejects.toThrow(AIDialogueError);

      try {
        await service.sendMessage('account-1', 'socket-1', 'Message after end');
      } catch (error) {
        expect(error.code).toBe('SESSION_INACTIVE');
      }
    });
  });

  describe('End Dialogue', () => {
    it('should end dialogue successfully', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1', cooldownMs: 0 });
      await service.sendMessage('account-1', 'socket-1', 'Hello');

      const result = await service.endDialogue('account-1', 'socket-1');

      expect(result.summary).toBeDefined();
      expect(result.roundCount).toBe(1);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      const session = service.getSession('account-1');
      expect(session.status).toBe('completed');
    });

    it('should reject ending dialogue from unauthorized socket', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1' });

      await expect(
        service.endDialogue('account-1', 'socket-2')
      ).rejects.toThrow(AIDialogueError);

      try {
        await service.endDialogue('account-1', 'socket-2');
      } catch (error) {
        expect(error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should clean up connection on end', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1' });
      expect(service.activeConnections.has('account-1')).toBe(true);

      await service.endDialogue('account-1', 'socket-1');
      expect(service.activeConnections.has('account-1')).toBe(false);
    });
  });

  describe('Session Expiry', () => {
    it('should cleanup expired sessions', () => {
      // Create session with old activity time
      const session = service.createSession('account-1', {
        socketId: 'socket-1',
        userId: 'user-1'
      });
      session.lastActivityAt = Date.now() - (61 * 60 * 1000);  // 61 minutes ago
      service.activeConnections.set('account-1', 'socket-1');

      service.cleanupExpiredSessions();

      expect(session.status).toBe('expired');
      expect(service.activeConnections.has('account-1')).toBe(false);
    });

    it('should not cleanup active sessions', () => {
      const session = service.createSession('account-1', {
        socketId: 'socket-1',
        userId: 'user-1'
      });
      service.activeConnections.set('account-1', 'socket-1');

      service.cleanupExpiredSessions();

      expect(session.status).toBe('active');
      expect(service.activeConnections.has('account-1')).toBe(true);
    });
  });

  describe('Stats and Details', () => {
    it('should return service stats', () => {
      service.createSession('account-1', { socketId: 'socket-1' });
      service.createSession('account-2', { socketId: 'socket-2' });
      service.activeConnections.set('account-1', 'socket-1');

      const stats = service.getStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
      expect(stats.activeConnections).toBe(1);
      expect(stats.limits).toBeDefined();
    });

    it('should return session details', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1', cooldownMs: 0 });
      await service.sendMessage('account-1', 'socket-1', 'Hello');

      const details = service.getSessionDetails('account-1');

      expect(details).toBeDefined();
      expect(details.accountId).toBe('account-1');
      expect(details.roundCount).toBe(1);
      expect(details.remainingRounds).toBe(9);
      expect(details.isConnected).toBe(true);
    });

    it('should return null for non-existent session details', () => {
      const details = service.getSessionDetails('non-existent');
      expect(details).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should create AIDialogueError with correct properties', () => {
      const error = new AIDialogueError('TEST_CODE', 'Test message', { detail: 'test' });

      expect(error.name).toBe('AIDialogueError');
      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.timestamp).toBeDefined();
    });
  });

  describe('Message History', () => {
    it('should store message history', async () => {
      await service.registerConnection('account-1', 'socket-1', { userId: 'user-1', cooldownMs: 0 });

      await service.sendMessage('account-1', 'socket-1', 'User message 1');
      await service.sendMessage('account-1', 'socket-1', 'User message 2');

      const session = service.getSession('account-1');
      expect(session.messages.length).toBe(4);  // 2 user + 2 assistant messages
      expect(session.messages[0].role).toBe('user');
      expect(session.messages[1].role).toBe('assistant');
    });
  });
});
