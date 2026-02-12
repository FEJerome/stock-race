/**
 * DialogueAuditService
 * AI对话审计服务
 *
 * 职责:
 * - 记录所有AI对话内容
 * - 敏感词检测和敏感度评分
 * - 审计状态管理（pending, approved, flagged, blocked）
 * - 审计日志查询（管理员接口）
 */

import crypto from 'crypto';
import { getRedisClient } from '../database/redis.js';

class DialogueAuditService {
  constructor(options = {}) {
    this.db = options.db || null;
    this.redis = options.redis || null;

    // 敏感词列表（可从配置动态加载）
    this.sensitiveWords = options.sensitiveWords || [
      '赌博', '色情', '暴力', '恐怖主义', '毒品', '洗钱',
      '诈骗', '传销', '非法集资', '走私', '黑客', '攻击'
    ];
  }

  /**
   * 初始化服务
   */
  async initialize() {
    try {
      this.redis = getRedisClient();
      console.log('✅ DialogueAuditService initialized with Redis');
    } catch (error) {
      console.warn('⚠️ DialogueAuditService running without Redis:', error.message);
    }
  }

  /**
   * 记录对话消息
   */
  async recordMessage(data) {
    const {
      sessionId,
      accountId,
      userId,
      role,
      content,
      tokenCount,
      roundNumber,
      ipAddress,
      userAgent
    } = data;

    // 计算内容哈希
    const messageHash = this._calculateHash(content);

    // 敏感词检测
    const sensitivityCheck = this._checkSensitiveContent(content);

    // 确定审计状态
    let auditStatus = 'pending';
    if (sensitivityCheck.hasSensitive && sensitivityCheck.sensitivityScore >= 0.6) {
      auditStatus = 'blocked';
    } else if (sensitivityCheck.hasSensitive) {
      auditStatus = 'flagged';
    } else {
      auditStatus = 'approved';
    }

    const auditRecord = {
      sessionId,
      accountId,
      userId,
      messageRole: role,
      messageContent: content,
      messageHash,
      tokenCount,
      roundNumber,
      auditStatus,
      sensitivityScore: sensitivityCheck.sensitivityScore,
      flaggedKeywords: sensitivityCheck.matchedWords,
      auditReason: sensitivityCheck.hasSensitive ? '包含敏感内容' : null,
      ipAddress,
      userAgent,
      createdAt: new Date().toISOString()
    };

    // 保存到数据库
    if (this.db) {
      await this._saveToDB(auditRecord);
    }

    // 如果内容被拦截，发送告警
    if (auditStatus === 'blocked') {
      await this._sendAlert(auditRecord);
    }

    return {
      ...auditRecord,
      isBlocked: auditStatus === 'blocked',
      isFlagged: auditStatus === 'flagged'
    };
  }

  /**
   * 批量查询审计日志（管理员接口）
   */
  async queryAuditLogs(filters = {}) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const {
      sessionId,
      accountId,
      userId,
      auditStatus,
      startDate,
      endDate,
      hasSensitive,
      limit = 50,
      offset = 0
    } = filters;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (sessionId) {
      whereClause += ` AND session_id = $${paramIndex++}`;
      params.push(sessionId);
    }

    if (accountId) {
      whereClause += ` AND account_id = $${paramIndex++}`;
      params.push(accountId);
    }

    if (userId) {
      whereClause += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (auditStatus) {
      whereClause += ` AND audit_status = $${paramIndex++}`;
      params.push(auditStatus);
    }

    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (hasSensitive !== undefined) {
      if (hasSensitive) {
        whereClause += ` AND array_length(flagged_keywords, 1) > 0`;
      } else {
        whereClause += ` AND (flagged_keywords IS NULL OR array_length(flagged_keywords, 1) = 0)`;
      }
    }

    // 查询总数
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM dialogue_audit ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // 查询数据
    params.push(limit, offset);
    const dataResult = await this.db.query(
      `SELECT da.*, u.username, u.email
       FROM dialogue_audit da
       LEFT JOIN users u ON da.user_id = u.id
       ${whereClause}
       ORDER BY da.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    return {
      total,
      limit,
      offset,
      data: dataResult.rows
    };
  }

  /**
   * 获取审计统计（管理员仪表盘）
   */
  async getAuditStats(startDate, endDate) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const result = await this.db.query(
      `SELECT
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE audit_status = 'flagged') as flagged_count,
        COUNT(*) FILTER (WHERE audit_status = 'blocked') as blocked_count,
        COUNT(*) FILTER (WHERE audit_status = 'approved') as approved_count,
        AVG(sensitivity_score) as avg_sensitivity,
        COUNT(DISTINCT session_id) as unique_sessions
       FROM dialogue_audit
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY date DESC`,
      [startDate, endDate]
    );

    return result.rows;
  }

  /**
   * 审核消息（管理员操作）
   */
  async reviewMessage(auditId, adminId, decision, reason = '') {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const status = decision === 'approve' ? 'approved' : 'blocked';

    await this.db.query(
      `UPDATE dialogue_audit
       SET audit_status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           audit_reason = COALESCE(audit_reason, '') || ' | 审核: ' || $3
       WHERE id = $4`,
      [status, adminId, reason, auditId]
    );

    return {
      success: true,
      auditId,
      status,
      reviewedBy: adminId,
      reviewedAt: new Date().toISOString()
    };
  }

  /**
   * 更新敏感词列表
   */
  async updateSensitiveWords(words, adminId) {
    this.sensitiveWords = words;

    // 保存到数据库配置表
    if (this.db) {
      await this.db.query(
        `INSERT INTO dialogue_config (config_key, config_value, config_type, updated_by)
         VALUES ('sensitive_words', $1, 'system', $2)
         ON CONFLICT (config_key)
         DO UPDATE SET
           config_value = $1,
           updated_by = $2,
           updated_at = NOW()`,
        [JSON.stringify({ words }), adminId]
      );
    }

    // 清除缓存
    if (this.redis) {
      await this.redis.del('config:dialogue:sensitive_words');
    }

    return { success: true, words };
  }

  /**
   * 检查会话是否需要审查
   */
  async checkSessionForReview(sessionId) {
    if (!this.db) {
      return { flaggedCount: 0, blockedCount: 0 };
    }

    const result = await this.db.query(
      `SELECT
        COUNT(*) FILTER (WHERE audit_status = 'flagged') as flagged_count,
        COUNT(*) FILTER (WHERE audit_status = 'blocked') as blocked_count,
        MAX(sensitivity_score) as max_sensitivity
       FROM dialogue_audit
       WHERE session_id = $1`,
      [sessionId]
    );

    return result.rows[0];
  }

  /**
   * 保存到数据库
   * @private
   */
  async _saveToDB(record) {
    await this.db.query(
      `INSERT INTO dialogue_audit (
        session_id, account_id, user_id, message_role, message_content,
        message_hash, token_count, round_number, audit_status, sensitivity_score,
        flagged_keywords, audit_reason, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        record.sessionId,
        record.accountId,
        record.userId,
        record.messageRole,
        record.messageContent,
        record.messageHash,
        record.tokenCount,
        record.roundNumber,
        record.auditStatus,
        record.sensitivityScore,
        record.flaggedKeywords,
        record.auditReason,
        record.ipAddress,
        record.userAgent
      ]
    );
  }

  /**
   * 计算内容哈希
   * @private
   */
  _calculateHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 检查敏感内容
   * @private
   */
  _checkSensitiveContent(content) {
    const matchedWords = [];
    let matchCount = 0;

    for (const word of this.sensitiveWords) {
      if (content.toLowerCase().includes(word.toLowerCase())) {
        matchedWords.push(word);
        matchCount++;
      }
    }

    // 计算敏感度分数：每个敏感词+0.15，最高1.0
    const sensitivityScore = Math.min(matchCount * 0.15, 1.0);

    return {
      hasSensitive: matchCount > 0,
      matchedWords,
      sensitivityScore: parseFloat(sensitivityScore.toFixed(2))
    };
  }

  /**
   * 发送告警（敏感内容拦截）
   * @private
   */
  async _sendAlert(auditRecord) {
    console.warn('🚨 敏感内容告警:', {
      sessionId: auditRecord.sessionId,
      keywords: auditRecord.flaggedKeywords,
      score: auditRecord.sensitivityScore,
      time: auditRecord.createdAt
    });

    // TODO: 可以集成告警系统（邮件、短信、Webhook等）
    if (this.redis) {
      await this.redis.publish('alert:sensitive_content', JSON.stringify({
        type: 'SENSITIVE_CONTENT_BLOCKED',
        sessionId: auditRecord.sessionId,
        accountId: auditRecord.accountId,
        keywords: auditRecord.flaggedKeywords,
        timestamp: auditRecord.createdAt
      }));
    }
  }
}

export { DialogueAuditService };
export default DialogueAuditService;
