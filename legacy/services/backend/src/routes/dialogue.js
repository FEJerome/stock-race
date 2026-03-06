/**
 * [C4-001~C4-003] AI Dialogue Routes
 * AI对话路由
 */

import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { DialogueService } from '../services/DialogueService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const dialogueService = new DialogueService();

/**
 * [C4-001] POST /api/ai-accounts/:id/dialogue/session
 * 创建对话会话
 */
router.post('/:id/dialogue/session',
  authenticate,
  async (req, res) => {
    try {
      if (!dialogueService.redis) await dialogueService.initialize();

      const accountId = req.params.id;
      const userId = req.user.id;

      // TODO: 验证账户所有权

      const result = await dialogueService.createSession(accountId, req.body.userPreferences || {});

      res.status(201).json({
        success: true,
        data: {
          sessionId: result.sessionId,
          roundCount: result.roundCount,
          remainingRounds: result.remainingRounds,
          expiresAt: new Date(result.expiresAt).toISOString()
        }
      });
    } catch (error) {
      console.error('创建对话会话失败:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * [C4-002] POST /api/ai-accounts/:id/dialogue/message
 * 发送对话消息（SSE流式响应）
 */
router.post('/:id/dialogue/message',
  authenticate,
  [
    body('message').isString().trim().isLength({ min: 1, max: 500 }),
    body('sessionId').isString().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          details: errors.array()
        });
      }

      if (!dialogueService.redis) await dialogueService.initialize();

      const { message, sessionId } = req.body;
      const accountId = req.params.id;

      // TODO: 验证账户所有权和会话有效性

      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // 收集客户端信息用于审计
      const clientInfo = {
        userId: req.user?.id || null,
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null
      };

      // 发送消息并处理流式响应
      await dialogueService.sendMessage(sessionId, message, (chunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }, clientInfo);

      // 发送完成标记
      res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
      res.end();
    } catch (error) {
      console.error('发送对话消息失败:', error);

      if (error.message === 'SESSION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: 'SESSION_NOT_FOUND',
          message: '对话会话不存在或已过期'
        });
      }

      if (error.message === 'ROUND_LIMIT_REACHED') {
        return res.status(403).json({
          success: false,
          error: 'ROUND_LIMIT_REACHED',
          message: '已达到对话轮数上限'
        });
      }

      if (error.message === 'TOKEN_BUDGET_EXHAUSTED') {
        return res.status(403).json({
          success: false,
          error: 'TOKEN_BUDGET_EXHAUSTED',
          message: 'Token预算已用完'
        });
      }

      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * [C4-003] POST /api/ai-accounts/:id/finalize
 * 提取画像并激活账户
 */
router.post('/:id/finalize',
  authenticate,
  [
    body('sessionId').isString().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          details: errors.array()
        });
      }

      if (!dialogueService.redis) await dialogueService.initialize();

      const { sessionId } = req.body;
      const accountId = req.params.id;

      // TODO: 验证账户所有权

      const result = await dialogueService.finalizeAccount(sessionId);

      res.json({
        success: true,
        data: {
          accountId: result.accountId,
          extractedPreference: result.extractedPreference,
          totalRounds: result.totalRounds,
          totalTokens: result.totalTokens,
          status: 'activated'
        }
      });
    } catch (error) {
      console.error('提取画像失败:', error);

      if (error.message === 'SESSION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: 'SESSION_NOT_FOUND',
          message: '对话会话不存在或已过期'
        });
      }

      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      });
    }
  }
);

/**
 * GET /api/ai-accounts/:id/dialogue/history
 * 获取对话历史
 */
router.get('/:id/dialogue/history',
  authenticate,
  async (req, res) => {
    try {
      const { sessionId } = req.query;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_SESSION_ID',
          message: '缺少会话ID'
        });
      }

      if (!dialogueService.redis) await dialogueService.initialize();

      const history = await dialogueService.getHistory(sessionId);

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('获取对话历史失败:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      });
    }
  }
);

export default router;
