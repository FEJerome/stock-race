/**
 * DialogueConfigService
 * AI对话动态配置服务
 *
 * 职责:
 * - 管理对话配置的CRUD操作
 * - 支持分层配置（默认→系统→账户）
 * - 配置缓存和热更新
 * - 配置变更历史记录
 */

import { getRedisClient } from '../database/redis.js';

class DialogueConfigService {
  constructor(options = {}) {
    this.db = options.db || null;
    this.redis = options.redis || null;

    // 默认配置
    this.defaultConfig = {
      max_rounds: 10,
      max_tokens_per_message: 2000,
      total_token_budget: 10000,
      session_expiry_hours: 24,
      enable_content_audit: true,
      sensitive_words: ['赌博', '色情', '暴力', '恐怖主义', '毒品', '洗钱']
    };

    // 本地缓存
    this.localCache = new Map();
    this.cacheTTL = 60000; // 1分钟
  }

  /**
   * 初始化服务
   */
  async initialize() {
    try {
      this.redis = getRedisClient();
      console.log('✅ DialogueConfigService initialized with Redis');
    } catch (error) {
      console.warn('⚠️ DialogueConfigService running without Redis:', error.message);
    }

    // 确保默认配置存在于数据库
    await this._ensureDefaultConfigs();
  }

  /**
   * 获取配置值
   * @param {string} key - 配置键
   * @param {string} accountId - 可选，账户ID用于获取账户级配置
   */
  async getConfig(key, accountId = null) {
    // 1. 检查本地缓存
    const cacheKey = accountId ? `${key}:${accountId}` : key;
    const cached = this._getFromLocalCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // 2. 检查Redis缓存
    if (this.redis) {
      const redisKey = accountId ? `config:dialogue:${key}:${accountId}` : `config:dialogue:${key}`;
      const redisValue = await this.redis.get(redisKey);
      if (redisValue) {
        const config = JSON.parse(redisValue);
        const configValue = config.value !== undefined ? config.value : config;
        this._setLocalCache(cacheKey, configValue);
        return configValue;
      }
    }

    // 3. 从数据库获取
    const config = await this._loadFromDB(key, accountId);
    if (config !== null) {
      // 写入缓存
      if (this.redis) {
        const redisKey = accountId ? `config:dialogue:${key}:${accountId}` : `config:dialogue:${key}`;
        await this.redis.setEx(redisKey, 300, JSON.stringify(config)); // 5分钟
      }
      this._setLocalCache(cacheKey, config);
      return config;
    }

    // 4. 返回默认值
    return this.defaultConfig[key];
  }

  /**
   * 批量获取配置
   */
  async getAllConfigs(accountId = null) {
    const keys = Object.keys(this.defaultConfig);
    const configs = {};

    for (const key of keys) {
      configs[key] = await this.getConfig(key, accountId);
    }

    return configs;
  }

  /**
   * 更新配置（管理员接口）
   */
  async updateConfig(key, value, adminId, reason = '') {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    // 验证配置键是否合法
    if (!this.defaultConfig.hasOwnProperty(key)) {
      throw new Error('INVALID_CONFIG_KEY');
    }

    // 获取旧值用于历史记录
    const oldConfig = await this._loadFromDB(key, null);
    const oldValue = oldConfig !== null ? oldConfig : this.defaultConfig[key];

    // 验证值范围（如果有min/max限制）
    const validatedValue = this._validateConfigValue(key, value);

    // 更新数据库
    await this.db.query(
      `INSERT INTO dialogue_config (config_key, config_value, config_type, updated_by)
       VALUES ($1, $2, 'system', $3)
       ON CONFLICT (config_key)
       DO UPDATE SET
         config_value = $2,
         updated_by = $3,
         updated_at = NOW()
       RETURNING *`,
      [key, JSON.stringify({ value: validatedValue }), adminId]
    );

    // 记录变更历史
    await this.db.query(
      `INSERT INTO dialogue_config_history (config_key, old_value, new_value, changed_by, change_reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [key, JSON.stringify({ value: oldValue }), JSON.stringify({ value: validatedValue }), adminId, reason]
    );

    // 清除缓存
    await this.invalidateCache(key);

    return {
      success: true,
      key,
      oldValue,
      newValue: validatedValue,
      updatedBy: adminId,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 获取配置变更历史
   */
  async getConfigHistory(key, limit = 50) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const result = await this.db.query(
      `SELECT h.*, u.username as changed_by_name
       FROM dialogue_config_history h
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE h.config_key = $1
       ORDER BY h.created_at DESC
       LIMIT $2`,
      [key, limit]
    );

    return result.rows;
  }

  /**
   * 获取所有配置（管理员视图）
   */
  async getAllConfigsForAdmin() {
    if (!this.db) {
      // 返回默认配置
      return Object.entries(this.defaultConfig).map(([key, value]) => ({
        config_key: key,
        config_value: { value },
        config_type: 'system',
        description: this._getConfigDescription(key),
        is_default: true
      }));
    }

    const result = await this.db.query(
      `SELECT c.*, u.username as updated_by_name
       FROM dialogue_config c
       LEFT JOIN users u ON c.updated_by = u.id
       ORDER BY c.config_key`
    );

    // 合并默认值和数据库值
    const dbConfigs = result.rows;
    const allConfigs = Object.keys(this.defaultConfig).map(key => {
      const dbConfig = dbConfigs.find(c => c.config_key === key);
      if (dbConfig) {
        return { ...dbConfig, is_default: false };
      }
      return {
        config_key: key,
        config_value: { value: this.defaultConfig[key] },
        config_type: 'system',
        description: this._getConfigDescription(key),
        is_default: true,
        updated_at: null
      };
    });

    return allConfigs;
  }

  /**
   * 清除配置缓存
   */
  async invalidateCache(key) {
    // 清除本地缓存
    for (const cacheKey of this.localCache.keys()) {
      if (cacheKey.startsWith(key)) {
        this.localCache.delete(cacheKey);
      }
    }

    // 清除Redis缓存
    if (this.redis) {
      const pattern = `config:dialogue:${key}*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * 从数据库加载配置
   * @private
   */
  async _loadFromDB(key, accountId = null) {
    if (!this.db) {
      return null;
    }

    // 优先查询账户级配置
    if (accountId) {
      const accountResult = await this.db.query(
        'SELECT config_value FROM dialogue_config WHERE config_key = $1 AND config_type = $2',
        [`${key}:${accountId}`, 'account']
      );
      if (accountResult.rows.length > 0) {
        return accountResult.rows[0].config_value.value;
      }
    }

    // 查询系统级配置
    const result = await this.db.query(
      'SELECT config_value FROM dialogue_config WHERE config_key = $1 AND config_type = $2',
      [key, 'system']
    );

    if (result.rows.length > 0) {
      return result.rows[0].config_value.value;
    }

    return null;
  }

  /**
   * 确保默认配置存在于数据库
   * @private
   */
  async _ensureDefaultConfigs() {
    if (!this.db) {
      return;
    }

    for (const [key, value] of Object.entries(this.defaultConfig)) {
      await this.db.query(
        `INSERT INTO dialogue_config (config_key, config_value, config_type, description)
         VALUES ($1, $2, 'system', $3)
         ON CONFLICT (config_key) DO NOTHING`,
        [key, JSON.stringify({ value }), this._getConfigDescription(key)]
      );
    }
  }

  /**
   * 验证配置值
   * @private
   */
  _validateConfigValue(key, value) {
    const validations = {
      max_rounds: { min: 1, max: 50 },
      max_tokens_per_message: { min: 500, max: 8000 },
      total_token_budget: { min: 1000, max: 50000 },
      session_expiry_hours: { min: 1, max: 168 }
    };

    const validation = validations[key];
    if (validation) {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        throw new Error(`Config ${key} must be a number`);
      }
      if (numValue < validation.min || numValue > validation.max) {
        throw new Error(`Config ${key} must be between ${validation.min} and ${validation.max}`);
      }
      return numValue;
    }

    return value;
  }

  /**
   * 获取配置描述
   * @private
   */
  _getConfigDescription(key) {
    const descriptions = {
      max_rounds: '每轮对话最大轮数限制',
      max_tokens_per_message: '单条消息最大Token数',
      total_token_budget: '对话总Token预算',
      session_expiry_hours: '会话过期时间（小时）',
      enable_content_audit: '是否启用内容审查',
      sensitive_words: '敏感词列表'
    };
    return descriptions[key] || '';
  }

  /**
   * 本地缓存操作
   * @private
   */
  _getFromLocalCache(key) {
    const cached = this.localCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.localCache.delete(key);
      return null;
    }

    return cached.value;
  }

  _setLocalCache(key, value) {
    this.localCache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
}

export { DialogueConfigService };
export default DialogueConfigService;
