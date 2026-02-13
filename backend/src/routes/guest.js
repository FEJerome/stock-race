import express from 'express';
import { GuestService } from '../services/GuestService.js';
import { body, validationResult, query } from 'express-validator';

const router = express.Router();
const guestService = new GuestService();

// [C5-001] POST /api/guest/auth/token
router.post('/auth/token', async (req, res) => {
  try {
    const { openid } = req.body;
    if (!openid) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_OPENID',
        message: 'openid 是必填字段'
      });
    }

    if (!guestService.redis) await guestService.initialize();
    const result = await guestService.createGuestToken(openid);

    res.json({
      success: true,
      data: {
        token: result.token,
        expiresIn: result.expiresIn,
        expiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('创建游客 Token 失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// [C5-002] POST /api/guest/ai-accounts
router.post('/ai-accounts', [
  body('name').optional().isString().trim(),
  body('modelType').optional().isIn(['deepseek', 'openai', 'claude']),
  body('initialBalance').optional().isInt({ min: 10000, max: 10000000 })
], async (req, res) => {
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

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    if (!guestService.redis) await guestService.initialize();

    const account = await guestService.createAIAccount(token, {
      name: req.body.name,
      modelType: req.body.modelType || 'deepseek',
      initialBalance: req.body.initialBalance || 100000
    });

    res.status(201).json({ success: true, data: account });
  } catch (error) {
    console.error('创建游客 AI 账户失败:', error);
    if (error.message === 'INVALID_TOKEN') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: '游客 Token 无效或已过期'
      });
    }
    if (error.code === 'ACCOUNT_LIMIT_REACHED') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_LIMIT_REACHED',
        message: '已达到游客 AI 账户数量上限（最多3个活跃账户）'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// [C5-003] POST /api/guest/ai-accounts/:id/chat
router.post('/ai-accounts/:id/chat', [
  body('message').isString().trim().isLength({ min: 1, max: 500 })
], async (req, res) => {
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

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    if (!guestService.redis) await guestService.initialize();

    const result = await guestService.dialogue(token, req.params.id, req.body.message);

    res.json({
      success: true,
      data: {
        message: '对话已记录',
        roundCount: result.roundCount,
        remainingRounds: result.remainingRounds
      }
    });
  } catch (error) {
    console.error('游客 AI 对话失败:', error);
    if (error.message === 'INVALID_TOKEN') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: '游客 Token 无效或已过期'
      });
    }
    if (error.message === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'AI 账户不存在或不属于当前游客'
      });
    }
    if (error.message === 'ROUND_LIMIT_REACHED') {
      return res.status(403).json({
        success: false,
        error: 'ROUND_LIMIT_REACHED',
        message: '已达到对话轮数上限（最多10轮）'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// [C5-004] POST /api/guest/migrate
router.post('/migrate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    const userId = req.body.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_USER_ID',
        message: '用户 ID 是必填字段'
      });
    }

    if (!guestService.redis) await guestService.initialize();
    const result = await guestService.migrateToUser(token, userId);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('游客数据迁移失败:', error);
    if (error.message === 'INVALID_TOKEN') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: '游客 Token 无效或已过期'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// [C5-006] GET /api/guest/ai-accounts
router.get('/ai-accounts', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    if (!guestService.redis) await guestService.initialize();

    const accounts = await guestService.getAIAccounts(token);
    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('获取游客 AI 账户列表失败:', error);
    if (error.message === 'INVALID_TOKEN') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: '游客 Token 无效或已过期'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// ============================================================================
// 新增接口：AI账户详情、持仓、交易记录、绩效、余额
// ============================================================================

// GET /api/guest/ai-accounts/:id - 获取AI账户详情（含持仓、余额）
router.get('/ai-accounts/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    const account = await guestService.getAIAccountDetail(token, req.params.id);

    res.json({ success: true, data: account });
  } catch (error) {
    console.error('获取游客 AI 账户详情失败:', error);
    if (error.code === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'AI 账户不存在或不属于当前游客'
      });
    }
    if (error.code === 'ACCOUNT_DELETED') {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_DELETED',
        message: 'AI 账户已被删除'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// DELETE /api/guest/ai-accounts/:id - 删除AI账户（软删除）
router.delete('/ai-accounts/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    const result = await guestService.deleteAIAccount(token, req.params.id);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('删除游客 AI 账户失败:', error);
    if (error.code === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'AI 账户不存在或不属于当前游客'
      });
    }
    if (error.code === 'ACCOUNT_ALREADY_DELETED') {
      return res.status(400).json({
        success: false,
        error: 'ACCOUNT_ALREADY_DELETED',
        message: 'AI 账户已被删除'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// GET /api/guest/ai-accounts/:id/positions - 获取AI账户持仓
router.get('/ai-accounts/:id/positions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    const positions = await guestService.getAIAccountPositions(token, req.params.id);

    res.json({
      success: true,
      data: {
        positions,
        count: positions.length,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('获取游客 AI 账户持仓失败:', error);
    if (error.code === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'AI 账户不存在或不属于当前游客'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// GET /api/guest/ai-accounts/:id/trades - 获取AI账户交易记录
router.get('/ai-accounts/:id/trades', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    const { page = 1, limit = 20 } = req.query;

    const result = await guestService.getAIAccountTrades(token, req.params.id, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('获取游客 AI 账户交易记录失败:', error);
    if (error.code === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'AI 账户不存在或不属于当前游客'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// GET /api/guest/ai-accounts/:id/performance - 获取AI账户绩效
router.get('/ai-accounts/:id/performance', [
  query('period').optional().isIn(['day', 'week', 'month', 'quarter', 'year', 'all'])
], async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    const period = req.query.period || 'month';

    const performance = await guestService.getAIAccountPerformance(token, req.params.id, period);

    res.json({ success: true, data: performance });
  } catch (error) {
    console.error('获取游客 AI 账户绩效失败:', error);
    if (error.code === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'AI 账户不存在或不属于当前游客'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

// GET /api/guest/ai-accounts/:id/balance - 获取AI账户余额
router.get('/ai-accounts/:id/balance', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少游客 Token'
      });
    }

    const token = authHeader.substring(7);
    const balance = await guestService.getAIAccountBalance(token, req.params.id);

    res.json({ success: true, data: balance });
  } catch (error) {
    console.error('获取游客 AI 账户余额失败:', error);
    if (error.code === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'AI 账户不存在或不属于当前游客'
      });
    }
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: '服务器内部错误'
    });
  }
});

export default router;
