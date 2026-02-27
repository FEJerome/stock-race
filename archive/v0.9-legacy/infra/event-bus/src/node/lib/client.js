/**
 * 事件总线客户端
 * Redis Streams 连接管理
 */

const Redis = require('ioredis');
const { ConnectionError } = require('./exceptions');

/**
 * 事件总线客户端类
 */
class EventBusClient {
  /**
   * 创建事件总线客户端
   * @param {Object} options - 配置选项
   * @param {string} [options.redisUrl] - Redis连接URL
   * @param {string} [options.host='localhost'] - Redis主机
   * @param {number} [options.port=6379] - Redis端口
   * @param {number} [options.db=0] - Redis数据库
   * @param {string} [options.password] - Redis密码
   */
  constructor(options = {}) {
    this.redisUrl = options.redisUrl;
    this.host = options.host || 'localhost';
    this.port = options.port || 6379;
    this.db = options.db || 0;
    this.password = options.password;
    this.client = null;
  }

  /**
   * 连接到Redis
   * @returns {Redis}
   * @throws {ConnectionError}
   */
  async connect() {
    try {
      if (this.redisUrl) {
        this.client = new Redis(this.redisUrl);
      } else {
        this.client = new Redis({
          host: this.host,
          port: this.port,
          db: this.db,
          password: this.password,
        });
      }

      // 验证连接
      await this.client.ping();
      console.log('EventBus connected to Redis successfully');
      return this.client;
    } catch (error) {
      throw new ConnectionError(`Failed to connect to Redis: ${error.message}`);
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      console.log('EventBus disconnected from Redis');
    }
  }

  /**
   * 获取Redis客户端（懒连接）
   * @returns {Redis}
   */
  getClient() {
    if (!this.client) {
      throw new ConnectionError('Not connected to Redis. Call connect() first.');
    }
    return this.client;
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      if (this.client) {
        const result = await this.client.ping();
        return result === 'PONG';
      }
      return false;
    } catch (error) {
      return false;
    }
  }
}

module.exports = EventBusClient;
