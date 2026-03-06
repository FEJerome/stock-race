/**
 * Cache Service [O6-004]
 * 通用缓存服务，支持Redis和内存缓存
 *
 * 职责:
 * - 提供统一的缓存接口
 * - 支持TTL过期
 * - 支持缓存前缀
 * - 提供缓存统计
 */

import redis from '../database/redis.js';

class CacheService {
  constructor(options = {}) {
    this.prefix = options.prefix || 'stock-race:';
    this.defaultTTL = options.defaultTTL || 5000; // 默认5秒
    this.useRedis = options.useRedis !== false;
    this.localCache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * 生成缓存键
   * @private
   * @param {string} key - 原始键
   * @returns {string} 带前缀的键
   */
  _makeKey(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {Promise<any>} 缓存值
   */
  async get(key) {
    const fullKey = this._makeKey(key);

    try {
      if (this.useRedis && redis.isConnected) {
        const value = await redis.get(fullKey);
        if (value) {
          this.stats.hits++;
          return JSON.parse(value);
        }
      } else {
        // 降级到内存缓存
        const cached = this.localCache.get(fullKey);
        if (cached && Date.now() < cached.expiry) {
          this.stats.hits++;
          return cached.data;
        }
        // 清理过期缓存
        if (cached) {
          this.localCache.delete(fullKey);
        }
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      console.error(`[CacheService] 获取缓存失败 (${key}):`, error.message);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} ttl - TTL（毫秒）
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttl = this.defaultTTL) {
    const fullKey = this._makeKey(key);

    try {
      if (this.useRedis && redis.isConnected) {
        await redis.setex(fullKey, Math.ceil(ttl / 1000), JSON.stringify(value));
      } else {
        // 降级到内存缓存
        this.localCache.set(fullKey, {
          data: value,
          expiry: Date.now() + ttl
        });
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      console.error(`[CacheService] 设置缓存失败 (${key}):`, error.message);
      return false;
    }
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    const fullKey = this._makeKey(key);

    try {
      if (this.useRedis && redis.isConnected) {
        await redis.del(fullKey);
      } else {
        this.localCache.delete(fullKey);
      }

      this.stats.deletes++;
      return true;
    } catch (error) {
      console.error(`[CacheService] 删除缓存失败 (${key}):`, error.message);
      return false;
    }
  }

  /**
   * 批量获取缓存
   * @param {Array<string>} keys - 缓存键数组
   * @returns {Promise<Object>} 键值对
   */
  async mget(keys) {
    const results = {};

    await Promise.all(
      keys.map(async (key) => {
        const value = await this.get(key);
        if (value !== null) {
          results[key] = value;
        }
      })
    );

    return results;
  }

  /**
   * 批量设置缓存
   * @param {Object} data - 键值对
   * @param {number} ttl - TTL（毫秒）
   * @returns {Promise<boolean>}
   */
  async mset(data, ttl = this.defaultTTL) {
    await Promise.all(
      Object.entries(data).map(([key, value]) => this.set(key, value, ttl))
    );
    return true;
  }

  /**
   * 获取缓存或设置
   * @param {string} key - 缓存键
   * @param {Function} factory - 数据生成函数
   * @param {number} ttl - TTL（毫秒）
   * @returns {Promise<any>}
   */
  async getOrSet(key, factory, ttl = this.defaultTTL) {
    // 尝试获取缓存
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // 生成数据
    const value = await factory();

    // 设置缓存
    if (value !== null && value !== undefined) {
      await this.set(key, value, ttl);
    }

    return value;
  }

  /**
   * 清空缓存
   * @param {string} pattern - 匹配模式
   * @returns {Promise<boolean>}
   */
  async clear(pattern = '*') {
    try {
      if (this.useRedis && redis.isConnected) {
        const keys = await redis.keys(this._makeKey(pattern));
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } else {
        // 清理内存缓存
        const fullPattern = this._makeKey(pattern);
        for (const key of this.localCache.keys()) {
          if (key.match(fullPattern.replace('*', '.*'))) {
            this.localCache.delete(key);
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`[CacheService] 清空缓存失败:`, error.message);
      return false;
    }
  }

  /**
   * 获取缓存统计
   * @returns {Object}
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      total,
      localCacheSize: this.localCache.size
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }
}

// 创建专用缓存实例
export const marketDataCache = new CacheService({
  prefix: 'market-data:',
  defaultTTL: 5000 // 5秒
});

export const tradingStatusCache = new CacheService({
  prefix: 'trading-status:',
  defaultTTL: 30000 // 30秒
});

export const rankingsCache = new CacheService({
  prefix: 'rankings:',
  defaultTTL: 60000 // 60秒
});

export { CacheService };
export default CacheService;
