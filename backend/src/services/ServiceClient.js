import axios from 'axios';

/**
 * 服务不可用错误
 * 当服务调用失败时抛出，可被全局异常处理器捕获
 */
export class ServiceUnavailableError extends Error {
  constructor(serviceName, message, originalError = null) {
    super(`[${serviceName}] ${message}`);
    this.name = 'ServiceUnavailableError';
    this.serviceName = serviceName;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * 熔断器状态
 */
const CircuitState = {
  CLOSED: 'CLOSED',     // 正常状态，请求正常通过
  OPEN: 'OPEN',         // 熔断状态，请求直接失败
  HALF_OPEN: 'HALF_OPEN' // 半开状态，尝试恢复
};

/**
 * 熔断器配置
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,        // 失败次数阈值
  successThreshold: 3,        // 半开状态下成功次数阈值
  timeout: 60000,             // 熔断持续时间（毫秒）
  monitorPeriod: 60000        // 监控周期（毫秒）
};

/**
 * 熔断器
 * 实现熔断器模式，防止服务雪崩
 */
export class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = Date.now();
  }

  /**
   * 执行带熔断保护的函数
   * @param {Function} fn - 要执行的函数
   * @returns {Promise<any>} 执行结果
   */
  async execute(fn) {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new ServiceUnavailableError(
          this.name,
          `熔断器已开启，请等待 ${Math.ceil((this.nextAttempt - Date.now()) / 1000)} 秒后重试`
        );
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * 成功处理
   */
  onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        console.log(`[CircuitBreaker:${this.name}] 熔断器关闭，服务恢复正常`);
      }
    }
  }

  /**
   * 失败处理
   */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
      console.warn(`[CircuitBreaker:${this.name}] 熔断器开启（半开状态失败），将在 ${this.config.timeout}ms 后尝试恢复`);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
      console.warn(`[CircuitBreaker:${this.name}] 熔断器开启（失败次数: ${this.failureCount}），将在 ${this.config.timeout}ms 后尝试恢复`);
    }
  }

  /**
   * 获取熔断器状态
   * @returns {Object} 熔断器状态信息
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      config: this.config
    };
  }

  /**
   * 重置熔断器
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = Date.now();
    console.log(`[CircuitBreaker:${this.name}] 熔断器已重置`);
  }
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  timeout: 10000,           // 请求超时（毫秒）
  retries: 3,               // 重试次数
  retryDelay: 1000,         // 重试延迟（毫秒）
  retryMultiplier: 2,       // 重试延迟倍数（指数退避）
  enableCircuitBreaker: true // 是否启用熔断器
};

/**
 * 服务客户端基类
 * 统一封装HTTP调用，提供超时、重试、熔断等功能
 */
export class ServiceClient {
  constructor(serviceName, baseURL, config = {}) {
    this.serviceName = serviceName;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 创建axios实例
    this.client = axios.create({
      baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      }
    });

    // 初始化熔断器
    if (this.config.enableCircuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(serviceName, config.circuitBreaker);
    }

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[${this.serviceName}] Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error(`[${this.serviceName}] Response Error:`, error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * 带重试的请求
   * @param {Function} requestFn - 请求函数
   * @returns {Promise<any>} 请求结果
   */
  async requestWithRetry(requestFn) {
    let lastError;

    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        // 如果是客户端错误（4xx），不重试
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }

        console.warn(`[${this.serviceName}] 请求失败（第${attempt}次尝试）:`, error.message);

        if (attempt < this.config.retries) {
          const delay = this.config.retryDelay * Math.pow(this.config.retryMultiplier, attempt - 1);
          console.log(`[${this.serviceName}] ${delay}ms 后重试...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 执行请求（带熔断保护）
   * @param {Function} requestFn - 请求函数
   * @returns {Promise<any>} 请求结果
   */
  async execute(requestFn) {
    if (this.config.enableCircuitBreaker && this.circuitBreaker) {
      return this.circuitBreaker.execute(() => this.requestWithRetry(requestFn));
    }
    return this.requestWithRetry(requestFn);
  }

  /**
   * GET请求
   * @param {string} url - 请求路径
   * @param {Object} options - 请求选项
   * @returns {Promise<any>} 响应数据
   */
  async get(url, options = {}) {
    return this.execute(() => this.client.get(url, options));
  }

  /**
   * POST请求
   * @param {string} url - 请求路径
   * @param {Object} data - 请求数据
   * @param {Object} options - 请求选项
   * @returns {Promise<any>} 响应数据
   */
  async post(url, data, options = {}) {
    return this.execute(() => this.client.post(url, data, options));
  }

  /**
   * PUT请求
   * @param {string} url - 请求路径
   * @param {Object} data - 请求数据
   * @param {Object} options - 请求选项
   * @returns {Promise<any>} 响应数据
   */
  async put(url, data, options = {}) {
    return this.execute(() => this.client.put(url, data, options));
  }

  /**
   * DELETE请求
   * @param {string} url - 请求路径
   * @param {Object} options - 请求选项
   * @returns {Promise<any>} 响应数据
   */
  async delete(url, options = {}) {
    return this.execute(() => this.client.delete(url, options));
  }

  /**
   * 健康检查
   * @param {string} healthEndpoint - 健康检查端点
   * @returns {Promise<Object>} 健康检查结果
   */
  async healthCheck(healthEndpoint = '/health') {
    try {
      const startTime = Date.now();
      const response = await this.client.get(healthEndpoint, { timeout: 5000 });
      const endTime = Date.now();

      return {
        success: true,
        status: 'healthy',
        responseTime: endTime - startTime,
        timestamp: new Date().toISOString(),
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 获取熔断器状态
   * @returns {Object|null} 熔断器状态
   */
  getCircuitBreakerState() {
    if (this.circuitBreaker) {
      return this.circuitBreaker.getState();
    }
    return null;
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker() {
    if (this.circuitBreaker) {
      this.circuitBreaker.reset();
    }
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ServiceClient;
