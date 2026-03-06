/**
 * Admin Dialogue Routes
 * AI对话管理接口（管理员专用）
 *
 * 功能：
 * - 对话配置管理（CRUD）
 * - 审计日志查询
 * - 敏感内容审核
 * - 统计数据查看
 */

import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { DialogueConfigService } from '../services/DialogueConfigService.js';
import { DialogueAuditService } from '../services/DialogueAuditService.js';
import { authenticate, checkRole } from '../middleware/auth.js';

const router = express.Router();
const configService = new DialogueConfigService();
const auditService = new DialogueAuditService();

// 所有路由都需要管理员权限
router.use(authenticate, checkRole('admin'));

/**
 * GET /api/admin/dialogue/configs
 * 获取所有对话配置
 */
router.get('/configs', async (req, res) => {
  try {
    if (!configService.db) await configService.initialize();
    const configs = await configService.getAllConfigsForAdmin();
    res.json({ success: true, data: configs });
  } catch (error) {
    console.error('获取对话配置失败:', error);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' });
  }
});

/**
 * PUT /api/admin/dialogue/configs/:key
 * 更新对话配置
 */
router.put('/configs/:key',
  [
    body('value').exists(),
    body('reason').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: errors.array() });
      }

      if (!configService.db) await configService.initialize();

      const { key } = req.params;
      const { value, reason } = req.body;
      const adminId = req.user.id;

      const result = await configService.updateConfig(key, value, adminId, reason);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('更新对话配置失败:', error);
      if (error.message === 'INVALID_CONFIG_KEY') {
        return res.status(400).json({ success: false, error: 'INVALID_CONFIG_KEY', message: '无效的配置键' });
      }
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' });
    }
  }
);

/**
 * GET /api/admin/dialogue/configs/:key/history
 * 获取配置变更历史
 */
router.get('/configs/:key/history', async (req, res) => {
  try {
    if (!configService.db) await configService.initialize();

    const { key } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const history = await configService.getConfigHistory(key, limit);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('获取配置历史失败:', error);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' });
  }
});

/**
 * GET /api/admin/dialogue/audit-logs
 * 查询审计日志
 */
router.get('/audit-logs',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: errors.array() });
      }

      if (!auditService.db) await auditService.initialize();

      const filters = {
        sessionId: req.query.sessionId,
        accountId: req.query.accountId,
        userId: req.query.userId,
        auditStatus: req.query.auditStatus,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        hasSensitive: req.query.hasSensitive === 'true' ? true :
                     req.query.hasSensitive === 'false' ? false : undefined,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await auditService.queryAuditLogs(filters);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('查询审计日志失败:', error);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' });
    }
  }
);

/**
 * GET /api/admin/dialogue/audit-stats
 * 获取审计统计
 */
router.get('/audit-stats', async (req, res) => {
  try {
    if (!auditService.db) await auditService.initialize();

    const endDate = req.query.endDate || new Date().toISOString();
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const stats = await auditService.getAuditStats(startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('获取审计统计失败:', error);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' });
  }
});

/**
 * POST /api/admin/dialogue/audit/:id/review
 * 审核消息
 */
router.post('/audit/:id/review',
  [
    body('decision').isIn(['approve', 'block']),
    body('reason').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: errors.array() });
      }

      if (!auditService.db) await auditService.initialize();

      const { id } = req.params;
      const { decision, reason } = req.body;
      const adminId = req.user.id;

      const result = await auditService.reviewMessage(id, adminId, decision, reason);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('审核消息失败:', error);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/admin/dialogue/sensitive-words
 * 更新敏感词列表
 */
router.put('/sensitive-words',
  [
    body('words').isArray().custom((value) => value.every(item => typeof item === 'string'))
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: errors.array() });
      }

      if (!auditService.db) await auditService.initialize();

      const { words } = req.body;
      const adminId = req.user.id;

      const result = await auditService.updateSensitiveWords(words, adminId);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('更新敏感词失败:', error);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' });
    }
  }
);

/**
 * GET /api/admin/dialogue/sessions/:id/audit
 * 获取会话审计详情
 */
router.get('/sessions/:id/audit', async (req, res) => {
  try {
    if (!auditService.db) await auditService.initialize();

    const { id } = req.params;
    const check = await auditService.checkSessionForReview(id);

    res.json({
      success: true,
      data: {
        sessionId: id,
        flaggedCount: parseInt(check.flagged_count) || 0,
        blockedCount: parseInt(check.blocked_count) || 0,
        maxSensitivity: parseFloat(check.max_sensitivity) || 0,
        needsReview: parseInt(check.flagged_count) > 0 || parseInt(check.blocked_count) > 0
      }
    });
  } catch (error) {
    console.error('获取会话审计详情失败:', error);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' });
  }
});

export default router;
