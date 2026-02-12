/**
 * [T-011] DialogueGateway 单元测试
 *
 * 测试内容:
 * - WebSocket消息转发
 * - 对话状态维护
 * - 与trading-ai-service的HTTP通信
 * - 流式响应处理
 * - 降级处理
 */

import { expect, jest, describe, it, beforeEach, afterEach } from '@jest/globals';
import DialogueGateway from '../../../src/services/DialogueGateway.js';

describe('DialogueGateway', () => {
  let gateway;
  let aiServiceClientStub;
  let wsStub;

  beforeEach(() => {
    aiServiceClientStub = {
      createDialogueSession: jest.fn(),
      extractPreference: jest.fn()
    };

    wsStub = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      readyState: 1 // OPEN
    };

    gateway = new DialogueGateway({
      aiServiceClient: aiServiceClientStub
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleConnection', () => {
    it('应该建立WebSocket连接并初始化对话状态', async () => {
      const accountId = 'acc-123';
      const userPreferences = { riskTolerance: 'medium' };

      aiServiceClientStub.createDialogueSession.resolves({
        sessionId: 'sess-456',
        status: 'active'
      });

      await gateway.handleConnection(wsStub, accountId, userPreferences);

      expect(gateway.sessions.has(accountId)).toBe(true);
      expect(gateway.sessions.get(accountId)).toMatchObject({
        accountId,
        sessionId: 'sess-456',
        roundCount: 0,
        maxRounds: 10
      });
    });

    it('应该拒绝同一账户的并发连接', async () => {
      const accountId = 'acc-123';

      // 第一个连接
      await gateway.handleConnection(wsStub, accountId, {});

      // 第二个连接应该被拒绝
      const ws2Stub = { send: jest.fn(), close: jest.fn() };
      await gateway.handleConnection(ws2Stub, accountId, {});

      expect(ws2Stub.send.toHaveBeenCalled()).toBe(true);
      const message = JSON.parse(ws2Stub.send.firstCall.args[0]);
      expect(message.error).to.include('已有活跃对话');
      expect(ws2Stub.close.toHaveBeenCalled()).toBe(true);
    });
  });

  describe('handleMessage', () => {
    it('应该将用户消息转发给trading-ai-service', async () => {
      const accountId = 'acc-123';
      const session = {
        accountId,
        sessionId: 'sess-456',
        roundCount: 0,
        maxRounds: 10,
        lastActivity: Date.now()
      };
      gateway.sessions.set(accountId, session);

      const userMessage = '我想做一个稳健的投资者';

      // 模拟AI服务流式响应
      const mockStream = [
        { type: 'message', content: '理解', roundCount: 1 },
        { type: 'message', content: '您的', roundCount: 1 },
        { type: 'message', content: '投资偏好', roundCount: 1 },
        { type: 'complete', roundCount: 1, remainingRounds: 9 }
      ];

      aiServiceClientStub.createDialogueSession.resolves(mockStream);

      await gateway.handleMessage(accountId, userMessage);

      // 验证消息被转发给用户
      expect(wsStub.send.toHaveBeenCalled()).toBe(true);
    });

    it('应该维护对话轮数', async () => {
      const accountId = 'acc-123';
      gateway.sessions.set(accountId, {
        accountId,
        sessionId: 'sess-456',
        roundCount: 5,
        maxRounds: 10,
        lastActivity: Date.now()
      });

      await gateway.handleMessage(accountId, '测试消息');

      expect(gateway.sessions.get(accountId).roundCount).toBe(6);
    });

    it('应该在达到最大轮数时拒绝新消息', async () => {
      const accountId = 'acc-123';
      gateway.sessions.set(accountId, {
        accountId,
        sessionId: 'sess-456',
        roundCount: 10,
        maxRounds: 10,
        lastActivity: Date.now()
      });

      await gateway.handleMessage(accountId, '新消息');

      expect(wsStub.send.toHaveBeenCalled()).toBe(true);
      const message = JSON.parse(wsStub.send.firstCall.args[0]);
      expect(message.error).to.include('已达到最大对话轮数');
    });

    it('应该检查冷却时间', async () => {
      const accountId = 'acc-123';
      gateway.sessions.set(accountId, {
        accountId,
        sessionId: 'sess-456',
        roundCount: 1,
        maxRounds: 10,
        lastActivity: Date.now(), // 刚刚活跃
        cooldownMs: 1000
      });

      await gateway.handleMessage(accountId, '新消息');

      expect(wsStub.send.toHaveBeenCalled()).toBe(true);
      const message = JSON.parse(wsStub.send.firstCall.args[0]);
      expect(message.error).to.include('冷却中');
    });
  });

  describe('流式响应处理', () => {
    it('应该正确处理AI服务的流式响应', async () => {
      const accountId = 'acc-123';
      gateway.sessions.set(accountId, {
        accountId,
        sessionId: 'sess-456',
        roundCount: 0,
        maxRounds: 10,
        ws: wsStub,
        lastActivity: Date.now()
      });

      const streamEvents = [
        { type: 'message', content: '您好', roundCount: 1 },
        { type: 'message', content: '，', roundCount: 1 },
        { type: 'message', content: '我是您的AI投资顾问', roundCount: 1 },
        { type: 'preference_update', extractedPreference: { riskTolerance: 'low' } },
        { type: 'complete', roundCount: 1, remainingRounds: 9 }
      ];

      await gateway.processStreamResponse(accountId, streamEvents);

      // 验证所有消息都被转发
      expect(wsStub.send.callCount).toBe(5);

      // 验证最后一条消息包含剩余轮数
      const lastMessage = JSON.parse(wsStub.send.lastCall.args[0]);
      expect(lastMessage.type).toBe('complete');
      expect(lastMessage.remainingRounds).toBe(9);
    });

    it('应该提取并保存投资偏好更新', async () => {
      const accountId = 'acc-123';
      gateway.sessions.set(accountId, {
        accountId,
        sessionId: 'sess-456',
        roundCount: 1,
        preferences: {},
        lastActivity: Date.now()
      });

      const streamEvents = [
        { type: 'preference_update', extractedPreference: { riskTolerance: 'conservative' } },
        { type: 'complete', roundCount: 1 }
      ];

      await gateway.processStreamResponse(accountId, streamEvents);

      expect(gateway.sessions.get(accountId).preferences).toEqual({
        riskTolerance: 'conservative'
      });
    });
  });

  describe('连接管理', () => {
    it('应该在用户断开时清理会话', async () => {
      const accountId = 'acc-123';
      gateway.sessions.set(accountId, {
        accountId,
        sessionId: 'sess-456',
        roundCount: 3
      });

      await gateway.handleDisconnection(accountId);

      expect(gateway.sessions.has(accountId)).toBe(false);
    });

    it('应该清理1小时无活动的会话', async () => {
      const oldSession = {
        accountId: 'acc-old',
        sessionId: 'sess-old',
        lastActivity: Date.now() - 2 * 60 * 60 * 1000 // 2小时前
      };
      gateway.sessions.set('acc-old', oldSession);

      const activeSession = {
        accountId: 'acc-active',
        sessionId: 'sess-active',
        lastActivity: Date.now()
      };
      gateway.sessions.set('acc-active', activeSession);

      await gateway.cleanupInactiveSessions(60 * 60 * 1000); // 1小时阈值

      expect(gateway.sessions.has('acc-old')).toBe(false);
      expect(gateway.sessions.has('acc-active')).toBe(true);
    });
  });

  describe('降级处理', () => {
    it('应该在trading-ai-service不可用时返回友好错误', async () => {
      const accountId = 'acc-123';
      gateway.sessions.set(accountId, {
        accountId,
        sessionId: 'sess-456',
        roundCount: 0,
        ws: wsStub,
        lastActivity: Date.now()
      });

      aiServiceClientStub.createDialogueSession.rejects(
        new Error('Service Unavailable')
      );

      await gateway.handleMessage(accountId, '测试消息');

      expect(wsStub.send.toHaveBeenCalled()).toBe(true);
      const message = JSON.parse(wsStub.send.firstCall.args[0]);
      expect(message.error).to.include('AI服务暂时不可用');
      expect(message.fallback).toBe(true);
    });

    it('应该在超时时返回超时提示', async () => {
      const accountId = 'acc-123';
      gateway.sessions.set(accountId, {
        accountId,
        sessionId: 'sess-456',
        roundCount: 0,
        ws: wsStub,
        lastActivity: Date.now()
      });

      aiServiceClientStub.createDialogueSession.rejects(
        new Error('Request timeout')
      );

      await gateway.handleMessage(accountId, '测试消息');

      const message = JSON.parse(wsStub.send.firstCall.args[0]);
      expect(message.error).to.include('响应超时');
    });
  });

  describe('消息格式验证', () => {
    it('应该验证发送给用户的消息格式', async () => {
      const accountId = 'acc-123';
      gateway.sessions.set(accountId, {
        accountId,
        sessionId: 'sess-456',
        roundCount: 3,
        maxRounds: 10,
        ws: wsStub,
        lastActivity: Date.now()
      });

      const message = {
        type: 'message',
        content: 'AI回复内容',
        roundCount: 3,
        remainingRounds: 7,
        timestamp: Date.now()
      };

      await gateway.sendToUser(accountId, message);

      expect(wsStub.send.toHaveBeenCalled()Once).toBe(true);
      const sentMessage = JSON.parse(wsStub.send.firstCall.args[0]);
      expect(sentMessage).toHaveProperty('type');
      expect(sentMessage).toHaveProperty('content');
      expect(sentMessage).toHaveProperty('roundCount');
      expect(sentMessage).toHaveProperty('remainingRounds');
    });
  });
});
