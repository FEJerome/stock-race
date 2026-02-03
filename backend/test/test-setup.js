// 测试环境配置
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/stock_race_test';

// 设置测试超时时间
jest.setTimeout(30000);

// 全局测试钩子
beforeAll(async () => {
  // 初始化测试数据库连接
  console.log('测试环境初始化...');
});

afterAll(async () => {
  // 清理测试资源
  console.log('测试环境清理...');
});

// 测试辅助函数
global.createTestUser = () => ({
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  role: 'user'
});

global.createTestToken = (user) => {
  // 简化版测试token
  return `test-token-${user.id}`;
};

// 模拟请求和响应对象
global.mockRequest = (options = {}) => {
  const {
    body = {},
    params = {},
    query = {},
    headers = {},
    user = global.createTestUser()
  } = options;

  return {
    body,
    params,
    query,
    headers,
    user,
    get: (headerName) => headers[headerName]
  };
};

global.mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn();
  return res;
};

// 模拟服务
global.mockServices = {
  aiService: {
    requestDecision: jest.fn(),
    requestBatchDecisions: jest.fn(),
    analyzeAccount: jest.fn(),
    checkModelStatus: jest.fn()
  },
  dataService: {
    getRealtimeData: jest.fn(),
    getKlineData: jest.fn(),
    getTechnicalIndicators: jest.fn(),
    getMarketStats: jest.fn()
  },
  virtualTradingService: {
    validateTradeOrder: jest.fn(),
    executeTradeOrder: jest.fn(),
    getTradingRules: jest.fn()
  },
  webSocketService: {
    broadcastStockPrice: jest.fn(),
    broadcastTradeNotification: jest.fn(),
    broadcastAIDecision: jest.fn()
  }
};