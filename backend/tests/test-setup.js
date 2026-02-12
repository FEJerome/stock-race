/**
 * Jest 测试环境设置
 */

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5434';
process.env.REDIS_URL = 'redis://localhost:6379';

// 全局测试超时
jest.setTimeout(30000);

// 清理所有 mock
afterEach(() => {
  jest.clearAllMocks();
});
