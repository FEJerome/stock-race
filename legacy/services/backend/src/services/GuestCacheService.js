/**
 * GuestCacheService - 游客数据缓存服务
 * G-008: 缓存一致性保障
 *
 * 功能:
 * - 游客Token缓存 (Redis)
 * - AI账户列表缓存
 * - 缓存穿透防护 (空值缓存)
 * - 缓存一致性保障 (删除同步清缓存)
 * - 缓存统计和监控
 */

class GuestCacheService {
  /**
   * @param {Object} redis - Redis客户端
   * @param {Object} config - 配置选项
   */
  constructor(redis, config = {}) {
    this.redis = redis;
    this.config = {
      defaultTTL: 3600,           // 默认缓存1小时
      keyPrefix: 'guest:',        // 缓存键前缀
      nullValueTTL: 60,           // 空值缓存60秒（防穿透）
      maxNullValues: 10000,       // 最大空值缓存数量
      ...config
    };

    // 命中率统计
    this.stats = {
      hits: 0,
      misses: 0
    };

    // 内存中的空值缓存索引（用于快速检查）
    this.nullValueCache = new Set();
  }

  // ============================================================================
  // 缓存键生成
  // ============================================================================

  _getTokenKey(token) {
    return `${this.config.keyPrefix}token:${token}`;
  }

  _getOpenIdKey(openidHash) {
    return `${this.config.keyPrefix}openid:${openidHash}`;
  }

  _getAccountsKey(sessionId) {
    return `${this.config.keyPrefix}accounts:${sessionId}`;
  }

  _getNullValueKey(type, identifier) {
    return `${this.config.keyPrefix}null:${type}:${identifier}`;
  }

  // ============================================================================
  // Token缓存
  // ============================================================================

  /**
   * 缓存游客Token
   *
   * @param {string} token - 游客Token
   * @param {Object} session - 会话数据
   * @param {number} ttl - 过期时间（秒）
   */
  async cacheToken(token, session, ttl = null) {
    if (!token || !session) return;

    const key = this._getTokenKey(token);
    const expiry = ttl || this.config.defaultTTL;

    try {
      await this.redis.setEx(key, expiry, JSON.stringify(session));

      // 清除可能存在的空值缓存
      this._clearNullValueCache('token', token);

      // 同时缓存OpenID映射（用于快速查找）
      if (session.openid_hash) {
        await this.cacheSessionByOpenId(session.openid_hash, session, ttl);
      }
    } catch (error) {
      console.error('[GuestCache] Failed to cache token:', error.message);
    }
  }

  /**
   * 获取缓存的Token
   *
   * @param {string} token - 游客Token
   * @param {Object} options - 选项
   * @param {boolean} options.preventPenetration - 是否启用防穿透
   * @returns {Promise<Object|null>}
   */
  async getCachedToken(token, options = {}) {
    if (!token) return null;

    const key = this._getTokenKey(token);

    try {
      // 检查空值缓存（防穿透）
      if (options.preventPenetration && this._hasNullValue('token', token)) {
        return null;
      }

      const cached = await this.redis.get(key);

      if (cached) {
        this.stats.hits++;
        return JSON.parse(cached);
      }

      // 缓存未命中
      this.stats.misses++;

      // 设置空值缓存（防穿透）
      if (options.preventPenetration) {
        await this._setNullValue('token', token);
      }

      return null;
    } catch (error) {
      console.error('[GuestCache] Failed to get cached token:', error.message);
      return null;
    }
  }

  /**
   * 使Token缓存失效
   *
   * @param {string} token - 游客Token
   */
  async invalidateToken(token) {
    if (!token) return;

    const key = this._getTokenKey(token);

    try {
      await this.redis.del(key);
      this._clearNullValueCache('token', token);
    } catch (error) {
      console.error('[GuestCache] Failed to invalidate token:', error.message);
    }
  }

  // ============================================================================
  // OpenID缓存
  // ============================================================================

  /**
   * 通过OpenID哈希缓存会话
   *
   * @param {string} openidHash - OpenID哈希
   * @param {Object} session - 会话数据
   * @param {number} ttl - 过期时间
   */
  async cacheSessionByOpenId(openidHash, session, ttl = null) {
    if (!openidHash || !session) return;

    const key = this._getOpenIdKey(openidHash);
    const expiry = ttl || this.config.defaultTTL;

    try {
      await this.redis.setEx(key, expiry, JSON.stringify(session));
    } catch (error) {
      console.error('[GuestCache] Failed to cache session by openid:', error.message);
    }
  }

  /**
   * 通过OpenID哈希获取缓存会话
   *
   * @param {string} openidHash - OpenID哈希
   * @returns {Promise<Object|null>}
   */
  async getCachedSessionByOpenId(openidHash) {
    if (!openidHash) return null;

    const key = this._getOpenIdKey(openidHash);

    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('[GuestCache] Failed to get cached session by openid:', error.message);
      return null;
    }
  }

  /**
   * 使OpenID缓存失效
   *
   * @param {string} openidHash - OpenID哈希
   */
  async invalidateSessionByOpenId(openidHash) {
    if (!openidHash) return;

    const key = this._getOpenIdKey(openidHash);

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('[GuestCache] Failed to invalidate session by openid:', error.message);
    }
  }

  // ============================================================================
  // AI账户列表缓存
  // ============================================================================

  /**
   * 缓存AI账户列表
   *
   * @param {number} sessionId - 会话ID
   * @param {Array} accounts - AI账户列表
   * @param {number} ttl - 过期时间
   */
  async cacheAIAccounts(sessionId, accounts, ttl = null) {
    if (!sessionId || !accounts) return;

    const key = this._getAccountsKey(sessionId);
    const expiry = ttl || this.config.defaultTTL;

    try {
      await this.redis.setEx(key, expiry, JSON.stringify(accounts));
    } catch (error) {
      console.error('[GuestCache] Failed to cache AI accounts:', error.message);
    }
  }

  /**
   * 获取缓存的AI账户列表
   *
   * @param {number} sessionId - 会话ID
   * @returns {Promise<Array|null>}
   */
  async getCachedAIAccounts(sessionId) {
    if (!sessionId) return null;

    const key = this._getAccountsKey(sessionId);

    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('[GuestCache] Failed to get cached AI accounts:', error.message);
      return null;
    }
  }

  /**
   * 使AI账户列表缓存失效
   *
   * @param {number} sessionId - 会话ID
   */
  async invalidateAIAccounts(sessionId) {
    if (!sessionId) return;

    const key = this._getAccountsKey(sessionId);

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('[GuestCache] Failed to invalidate AI accounts:', error.message);
    }
  }

  // ============================================================================
  // 缓存一致性保障（级联删除）
  // ============================================================================

  /**
   * 级联删除会话相关所有缓存
   *
   * @param {number} sessionId - 会话ID
   * @param {Object} refs - 关联引用
   * @param {string} refs.token - 游客Token
   * @param {string} refs.openidHash - OpenID哈希
   */
  async invalidateSessionCascade(sessionId, refs = {}) {
    if (!sessionId) return;

    const keysToDelete = [
      this._getAccountsKey(sessionId)
    ];

    if (refs.token) {
      keysToDelete.push(this._getTokenKey(refs.token));
      this._clearNullValueCache('token', refs.token);
    }

    if (refs.openidHash) {
      keysToDelete.push(this._getOpenIdKey(refs.openidHash));
    }

    try {
      // 使用pipeline批量删除提高性能
      await this.invalidateMultiple(keysToDelete);
      console.log(`[GuestCache] Cascade invalidated ${keysToDelete.length} keys for session ${sessionId}`);
    } catch (error) {
      console.error('[GuestCache] Failed to cascade invalidate:', error.message);
    }
  }

  /**
   * 批量删除缓存
   *
   * @param {Array} keys - 缓存键数组
   * @returns {Promise<number>} 删除的键数量
   */
  async invalidateMultiple(keys) {
    if (!keys || keys.length === 0) return 0;

    try {
      // 使用pipeline提高批量删除性能
      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.del(key));
      const results = await pipeline.exec();

      // 统计删除数量
      const deletedCount = results.reduce((sum, result) => sum + (result || 0), 0);
      return deletedCount;
    } catch (error) {
      console.error('[GuestCache] Failed to batch invalidate:', error.message);
      return 0;
    }
  }

  // ============================================================================
  // 缓存穿透防护
  // ============================================================================

  /**
   * 设置空值缓存（防穿透）
   *
   * @param {string} type - 类型
   * @param {string} identifier - 标识符
   */
  async _setNullValue(type, identifier) {
    // 检查空值缓存数量上限
    if (this.nullValueCache.size >= this.config.maxNullValues) {
      // 清理最早的空值缓存（FIFO）
      const firstKey = this.nullValueCache.values().next().value;
      this._clearNullValueCacheByKey(firstKey);
    }

    const key = this._getNullValueKey(type, identifier);
    const cacheKey = `${type}:${identifier}`;

    try {
      await this.redis.setEx(key, this.config.nullValueTTL, '1');
      this.nullValueCache.add(cacheKey);
    } catch (error) {
      console.error('[GuestCache] Failed to set null value:', error.message);
    }
  }

  /**
   * 检查是否有空值缓存
   *
   * @param {string} type - 类型
   * @param {string} identifier - 标识符
   * @returns {boolean}
   */
  _hasNullValue(type, identifier) {
    return this.nullValueCache.has(`${type}:${identifier}`);
  }

  /**
   * 清除空值缓存
   *
   * @param {string} type - 类型
   * @param {string} identifier - 标识符
   */
  _clearNullValueCache(type, identifier) {
    const cacheKey = `${type}:${identifier}`;
    this._clearNullValueCacheByKey(cacheKey);
  }

  _clearNullValueCacheByKey(cacheKey) {
    if (this.nullValueCache.has(cacheKey)) {
      this.nullValueCache.delete(cacheKey);

      // 异步清理Redis中的空值缓存
      const [type, identifier] = cacheKey.split(':');
      const key = this._getNullValueKey(type, identifier);
      this.redis.del(key).catch(() => {});
    }
  }

  // ============================================================================
  // 批量操作
  // ============================================================================

  /**
   * 批量获取多个Token
   *
   * @param {Array} tokens - Token数组
   * @returns {Promise<Map>}
   */
  async getMultipleTokens(tokens) {
    if (!tokens || tokens.length === 0) return new Map();

    const keys = tokens.map(t => this._getTokenKey(t));
    const results = new Map();

    try {
      // 使用mget批量获取
      const values = await this.redis.mGet(...keys);

      tokens.forEach((token, index) => {
        const value = values[index];
        if (value) {
          results.set(token, JSON.parse(value));
          this.stats.hits++;
        } else {
          results.set(token, null);
          this.stats.misses++;
        }
      });
    } catch (error) {
      console.error('[GuestCache] Failed to get multiple tokens:', error.message);
      tokens.forEach(token => results.set(token, null));
    }

    return results;
  }

  /**
   * 缓存预热
   *
   * @param {Array} sessions - 会话数组
   */
  async warmupCache(sessions) {
    if (!sessions || sessions.length === 0) return;

    console.log(`[GuestCache] Warming up cache with ${sessions.length} sessions...`);

    for (const session of sessions) {
      if (session.guest_token) {
        await this.cacheToken(session.guest_token, session);
      }
    }

    console.log('[GuestCache] Cache warmup completed');
  }

  // ============================================================================
  // 统计和监控
  // ============================================================================

  /**
   * 获取缓存统计
   *
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      const keys = await this.redis.keys(`${this.config.keyPrefix}*`);

      const tokenKeys = keys.filter(k => k.includes(':token:')).length;
      const accountKeys = keys.filter(k => k.includes(':accounts:')).length;
      const openidKeys = keys.filter(k => k.includes(':openid:')).length;
      const nullKeys = keys.filter(k => k.includes(':null:')).length;

      return {
        totalKeys: keys.length,
        tokenKeys,
        accountKeys,
        openidKeys,
        nullKeys,
        memoryNullValues: this.nullValueCache.size
      };
    } catch (error) {
      console.error('[GuestCache] Failed to get stats:', error.message);
      return {
        totalKeys: 0,
        tokenKeys: 0,
        accountKeys: 0,
        openidKeys: 0,
        nullKeys: 0,
        memoryNullValues: this.nullValueCache.size
      };
    }
  }

  /**
   * 获取命中率统计
   *
   * @returns {Object}
   */
  getHitStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      total,
      hitRate: parseFloat(hitRate)
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * 健康检查
   *
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    try {
      await this.redis.ping?.() || await this.redis.get('health:check');
      return {
        status: 'healthy',
        redisConnected: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        redisConnected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // ============================================================================
  // 配置更新
  // ============================================================================

  /**
   * 运行时更新配置
   *
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('[GuestCache] Configuration updated:', newConfig);
  }

  /**
   * 清除所有缓存
   */
  async clearAll() {
    try {
      const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      this.nullValueCache.clear();
      console.log(`[GuestCache] Cleared ${keys.length} keys`);
    } catch (error) {
      console.error('[GuestCache] Failed to clear all:', error.message);
    }
  }
}

module.exports = { GuestCacheService };
