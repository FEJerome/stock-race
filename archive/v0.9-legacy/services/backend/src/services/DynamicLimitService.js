/**
 * [T-013] DynamicLimitService
 * 动态限制服务
 *
 * 职责:
 * - 分层配置解析（默认→会员→账户）
 * - 会员级别限制管理
 * - 账户级别覆盖
 * - 配置热更新
 */

class DynamicLimitService {
  constructor(options = {}) {
    this.db = options.db;
    this.redis = options.redis;
    this.localCache = options.localCache || new Map();

    // 默认配置
    this.defaultLimits = {
      dailyWakeupLimit: 10,
      cooldownMinutes: 5,
      tokenBudget: 10000
    };

    // 本地缓存TTL（毫秒）
    this.localCacheTTL = 60000; // 1分钟
  }

  /**
   * 获取账户限制配置
   * @param {string} accountId - AI账户ID
   * @param {Object} options - 选项 { skipCache: boolean }
   * @returns {Promise<Object>} 限制配置
   */
  async getLimits(accountId, options = {}) {
    const { skipCache = false } = options;

    // 1. 检查本地缓存
    if (!skipCache) {
      const cached = this._getFromLocalCache(accountId);
      if (cached) return cached;
    }

    // 2. 检查Redis缓存
    if (!skipCache && this.redis) {
      const redisCached = await this.redis.get(`limits:account:${accountId}`);
      if (redisCached) {
        const limits = JSON.parse(redisCached);
        this._setLocalCache(accountId, limits);
        return limits;
      }
    }

    // 3. 从数据库加载配置
    const limits = await this._loadLimitsFromDB(accountId);

    // 4. 写入缓存
    if (this.redis) {
      await this.redis.setex(
        `limits:account:${accountId}`,
        300, // 5分钟
        JSON.stringify(limits)
      );
    }
    this._setLocalCache(accountId, limits);

    return limits;
  }

  /**
   * 从数据库加载限制配置
   * @private
   */
  async _loadLimitsFromDB(accountId) {
    let limits = { ...this.defaultLimits };
    let configSource = 'default';
    let membershipTier = null;
    let accountOverride = false;

    // 获取用户会员级别
    const tier = await this.getUserMembershipTier(accountId);

    if (tier) {
      membershipTier = tier;

      // 加载会员级别配置
      if (this.db) {
        const tierResult = await this.db.query(
          'SELECT * FROM membership_limits WHERE tier = $1',
          [tier]
        );

        if (tierResult.rows.length > 0) {
          const tierConfig = tierResult.rows[0];
          limits = {
            dailyWakeupLimit: tierConfig.daily_wakeup_limit ?? limits.dailyWakeupLimit,
            cooldownMinutes: tierConfig.cooldown_minutes ?? limits.cooldownMinutes,
            tokenBudget: tierConfig.token_budget ?? limits.tokenBudget
          };
          configSource = 'membership';
        }
      }
    }

    // 加载账户级别覆盖
    if (this.db) {
      const accountResult = await this.db.query(
        'SELECT * FROM ai_account_limits WHERE account_id = $1',
        [accountId]
      );

      if (accountResult.rows.length > 0) {
        const accountConfig = accountResult.rows[0];

        // 检查是否过期
        if (!accountConfig.effective_until ||
            new Date(accountConfig.effective_until) > new Date()) {
          if (accountConfig.daily_wakeup_limit !== null) {
            limits.dailyWakeupLimit = accountConfig.daily_wakeup_limit;
          }
          if (accountConfig.cooldown_minutes !== null) {
            limits.cooldownMinutes = accountConfig.cooldown_minutes;
          }
          if (accountConfig.token_budget !== null) {
            limits.tokenBudget = accountConfig.token_budget;
          }
          accountOverride = true;
          configSource = 'account';
        }
      }
    }

    return {
      ...limits,
      configSource,
      membershipTier,
      accountOverride
    };
  }

  /**
   * 获取用户会员级别
   * @param {string} accountId - AI账户ID
   * @returns {Promise<string|null>} 会员级别
   */
  async getUserMembershipTier(accountId) {
    if (!this.db) return null;

    // 从数据库查询用户会员级别
    const result = await this.db.query(
      `SELECT u.membership_tier
       FROM users u
       JOIN ai_accounts a ON a.user_id = u.id
       WHERE a.id = $1`,
      [accountId]
    );

    return result.rows[0]?.membership_tier || 'free';
  }

  /**
   * 设置账户级别限制（管理员接口）
   * @param {string} accountId - AI账户ID
   * @param {Object} limits - 限制配置
   * @param {Object} context - 上下文 { adminId, reason }
   * @returns {Promise<Object>} 结果
   */
  async setAccountLimit(accountId, limits, context = {}) {
    const { adminId, reason } = context;

    if (!this.db) {
      throw new Error('Database not configured');
    }

    const effectiveUntil = limits.effectiveDays
      ? new Date(Date.now() + limits.effectiveDays * 86400000)
      : null;

    // 更新或插入账户限制
    await this.db.query(
      `INSERT INTO ai_account_limits
       (account_id, daily_wakeup_limit, cooldown_minutes, token_budget, effective_until, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (account_id)
       DO UPDATE SET
         daily_wakeup_limit = COALESCE($2, ai_account_limits.daily_wakeup_limit),
         cooldown_minutes = COALESCE($3, ai_account_limits.cooldown_minutes),
         token_budget = COALESCE($4, ai_account_limits.token_budget),
         effective_until = $5,
         updated_at = NOW()`,
      [
        accountId,
        limits.dailyWakeupLimit || null,
        limits.cooldownMinutes || null,
        limits.tokenBudget || null,
        effectiveUntil
      ]
    );

    // 记录审计日志
    if (adminId) {
      await this.db.query(
        `INSERT INTO audit_log (admin_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          adminId,
          'UPDATE_ACCOUNT_LIMIT',
          'ai_account',
          accountId,
          JSON.stringify({ limits, reason })
        ]
      );
    }

    // 清除缓存
    await this.invalidateCache(accountId);

    return {
      success: true,
      accountId,
      limits,
      effectiveUntil
    };
  }

  /**
   * 更新会员级别配置（管理员接口）
   * @param {string} tier - 会员级别
   * @param {Object} limits - 限制配置
   * @param {Object} context - 上下文
   */
  async updateMembershipLimit(tier, limits, context = {}) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    await this.db.query(
      `INSERT INTO membership_limits (tier, daily_wakeup_limit, cooldown_minutes, token_budget, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tier)
       DO UPDATE SET
         daily_wakeup_limit = COALESCE($2, membership_limits.daily_wakeup_limit),
         cooldown_minutes = COALESCE($3, membership_limits.cooldown_minutes),
         token_budget = COALESCE($4, membership_limits.token_budget),
         updated_at = NOW()`,
      [
        tier,
        limits.dailyWakeupLimit || null,
        limits.cooldownMinutes || null,
        limits.tokenBudget || null
      ]
    );

    // 记录审计日志
    if (context.adminId) {
      await this.db.query(
        `INSERT INTO audit_log (admin_id, action, target_type, target_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          context.adminId,
          'UPDATE_MEMBERSHIP_LIMIT',
          'membership_tier',
          tier,
          JSON.stringify({ limits, reason: context.reason })
        ]
      );
    }

    // 清除该会员级别所有用户的缓存
    await this.invalidateCacheByPattern(`limits:*`);

    return { success: true, tier, limits };
  }

  /**
   * 清除账户缓存
   * @param {string} accountId - AI账户ID
   */
  async invalidateCache(accountId) {
    this.localCache.delete(accountId);
    if (this.redis) {
      await this.redis.del(`limits:account:${accountId}`);
    }
  }

  /**
   * 按模式清除缓存
   * @param {string} pattern - 匹配模式
   */
  async invalidateCacheByPattern(pattern) {
    // 清除本地缓存
    for (const key of this.localCache.keys()) {
      this.localCache.delete(key);
    }

    // 清除Redis缓存
    if (this.redis) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * 从本地缓存获取
   * @private
   */
  _getFromLocalCache(accountId) {
    const cached = this.localCache.get(accountId);
    if (!cached) return null;

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.localCacheTTL) {
      this.localCache.delete(accountId);
      return null;
    }

    return cached.data;
  }

  /**
   * 设置本地缓存
   * @private
   */
  _setLocalCache(accountId, data) {
    this.localCache.set(accountId, {
      data,
      timestamp: Date.now()
    });
  }
}

export { DynamicLimitService };
export default DynamicLimitService;
