# 集成测试完善方案

## 概述
本方案旨在完善stock-race后端的集成测试，确保系统各组件协同工作正常，提高软件质量和可靠性。

## 当前测试状态分析

### 现有测试
- **单元测试**：部分控制器和服务测试
- **集成测试**：少量端到端测试
- **测试覆盖**：未知，缺乏覆盖率报告
- **测试数据**：硬编码测试数据
- **测试环境**：与开发环境混合

### 问题识别
1. **测试覆盖不足**：关键业务逻辑缺乏测试
2. **测试数据管理差**：缺乏测试数据工厂
3. **测试执行慢**：缺乏并行执行
4. **测试维护难**：测试代码重复
5. **环境依赖强**：依赖外部服务

## 优化目标

### 短期目标（1-2周）
1. **测试覆盖率提升**：核心功能覆盖率>80%
2. **测试数据管理**：实现测试数据工厂
3. **测试执行优化**：并行执行，减少50%时间

### 中期目标（3-4周）
4. **集成测试完善**：关键流程端到端测试
5. **测试环境隔离**：独立的测试数据库
6. **测试报告完善**：详细的测试报告和覆盖率

### 长期目标（5-8周）
7. **性能测试集成**：负载测试和压力测试
8. **安全测试集成**：安全漏洞测试
9. **自动化测试流水线**：CI/CD集成

## 测试策略

### 1. 测试金字塔
```
        E2E测试 (10%)
           |
    集成测试 (20%)
           |
     单元测试 (70%)
```

### 2. 测试类型
1. **单元测试**：测试单个函数或类
2. **集成测试**：测试组件间交互
3. **端到端测试**：测试完整业务流程
4. **性能测试**：测试系统性能
5. **安全测试**：测试安全漏洞

### 3. 测试工具栈
- **测试框架**：Jest
- **断言库**：Jest内置
- **HTTP测试**：Supertest
- **数据库测试**：Prisma + 测试数据库
- **模拟工具**：Jest Mocks
- **覆盖率**：Jest Coverage
- **报告工具**：Jest HTML Reporter

## 优化措施

### 1. 测试基础设施

#### 1.1 测试环境配置
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testTimeout: 30000,
  maxWorkers: '50%', // 使用50% CPU核心并行执行
  verbose: true,
  reporters: [
    'default',
    ['jest-html-reporter', {
      pageTitle: 'Stock Race Test Report',
      outputPath: './test-reports/test-report.html',
      includeFailureMsg: true,
      includeConsoleLog: true
    }]
  ]
};
```

#### 1.2 测试数据库管理
```javascript
// test/utils/testDatabase.js
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class TestDatabase {
  constructor() {
    this.prisma = new PrismaClient();
    this.testDbName = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.originalDatabaseUrl = process.env.DATABASE_URL;
  }

  async setup() {
    // 创建测试数据库
    await this.createTestDatabase();

    // 更新环境变量
    process.env.DATABASE_URL = this.getTestDatabaseUrl();

    // 运行迁移
    await this.runMigrations();

    // 重新连接Prisma
    await this.prisma.$disconnect();
    this.prisma = new PrismaClient();

    return this.prisma;
  }

  async teardown() {
    // 断开连接
    await this.prisma.$disconnect();

    // 恢复原始数据库URL
    process.env.DATABASE_URL = this.originalDatabaseUrl;

    // 删除测试数据库
    await this.dropTestDatabase();
  }

  async createTestDatabase() {
    const sql = `CREATE DATABASE "${this.testDbName}"`;
    await execAsync(`psql -c "${sql}"`);
  }

  async dropTestDatabase() {
    const sql = `DROP DATABASE IF EXISTS "${this.testDbName}"`;
    await execAsync(`psql -c "${sql}"`);
  }

  async runMigrations() {
    await execAsync(`DATABASE_URL=${this.getTestDatabaseUrl()} npx prisma migrate deploy`);
  }

  getTestDatabaseUrl() {
    const url = new URL(this.originalDatabaseUrl);
    url.pathname = `/${this.testDbName}`;
    return url.toString();
  }

  async truncateAllTables() {
    const tables = await this.prisma.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;

    for (const table of tables) {
      await this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "${table.tablename}" CASCADE`
      );
    }
  }
}

export default TestDatabase;
```

#### 1.3 测试数据工厂
```javascript
// test/factories/index.js
import { faker } from '@faker-js/faker';

export class TestDataFactory {
  // 用户工厂
  static createUser(overrides = {}) {
    return {
      username: faker.internet.userName(),
      email: faker.internet.email(),
      password: 'Test123!',
      role: 'user',
      status: 'active',
      ...overrides
    };
  }

  // 股票工厂
  static createStock(overrides = {}) {
    const markets = ['sh', 'sz', 'bj', 'hk', 'us'];
    const industries = ['科技', '金融', '医疗', '消费', '能源'];

    return {
      code: `TEST${faker.string.numeric(6)}`,
      name: faker.company.name(),
      fullName: `${faker.company.name()}股份有限公司`,
      market: faker.helpers.arrayElement(markets),
      industry: faker.helpers.arrayElement(industries),
      listingDate: faker.date.past({ years: 5 }),
      totalShares: faker.number.int({ min: 1000000, max: 1000000000 }),
      circulatingShares: faker.number.int({ min: 500000, max: 500000000 }),
      status: 'listed',
      ...overrides
    };
  }

  // AI账户工厂
  static createAIAccount(overrides = {}) {
    const models = ['openai', 'claude', 'deepseek', 'custom'];

    return {
      name: faker.finance.accountName(),
      description: faker.lorem.sentence(),
      aiModel: faker.helpers.arrayElement(models),
      promptTemplate: '作为AI交易助手，请分析以下股票...',
      initialBalance: 1000000,
      currentBalance: 1000000,
      status: 'active',
      settings: {
        riskLevel: 'medium',
        maxPositionSize: 0.1,
        stopLoss: 0.05
      },
      ...overrides
    };
  }

  // 交易工厂
  static createTrade(overrides = {}) {
    const tradeTypes = ['buy', 'sell'];

    return {
      stockCode: `TEST${faker.string.numeric(6)}`,
      tradeType: faker.helpers.arrayElement(tradeTypes),
      quantity: faker.number.int({ min: 100, max: 10000 }),
      price: faker.number.float({ min: 10, max: 100, precision: 0.01 }),
      status: 'executed',
      executedAt: new Date(),
      ...overrides
    };
  }

  // 批量创建
  static createMany(factoryFn, count, overrides = {}) {
    return Array.from({ length: count }, (_, i) =>
      factoryFn({ ...overrides, id: i + 1 })
    );
  }
}

export default TestDataFactory;
```

### 2. 测试工具和辅助函数

#### 2.1 测试工具类
```javascript
// test/utils/testHelpers.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export class TestHelpers {
  // 创建测试用户并返回token
  static async createAuthenticatedUser(prisma, userData = {}) {
    const user = await prisma.user.create({
      data: {
        ...TestDataFactory.createUser(userData),
        password: await bcrypt.hash('Test123!', 10)
      }
    });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    return { user, token };
  }

  // 创建测试股票
  static async createTestStock(prisma, stockData = {}) {
    return await prisma.stock.create({
      data: TestDataFactory.createStock(stockData)
    });
  }

  // 创建测试AI账户
  static async createTestAIAccount(prisma, userId, accountData = {}) {
    return await prisma.aiAccount.create({
      data: {
        ...TestDataFactory.createAIAccount(accountData),
        userId
      }
    });
  }

  // 创建测试交易
  static async createTestTrade(prisma, accountId, tradeData = {}) {
    return await prisma.trade.create({
      data: {
        ...TestDataFactory.createTrade(tradeData),
        accountId
      }
    });
  }

  // 等待条件满足
  static async waitForCondition(conditionFn, timeout = 5000, interval = 100) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await conditionFn()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  // 模拟外部服务响应
  static mockExternalService(serviceName, response, error = null) {
    const mock = {
      response,
      error,
      calls: []
    };

    const handler = async (...args) => {
      mock.calls.push({ args, timestamp: new Date() });

      if (error) {
        throw error;
      }

      return response;
    };

    return { mock, handler };
  }
}
```

#### 2.2 HTTP测试辅助
```javascript
// test/utils/httpTestHelpers.js
import request from 'supertest';
import { app } from '../../src/app.js';

export class HttpTestHelpers {
  // 创建认证的请求
  static createAuthenticatedRequest(token) {
    return request(app)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json');
  }

  // 测试GET请求
  static async testGet(endpoint, token = null, query = {}) {
    const req = token
      ? this.createAuthenticatedRequest(token)
      : request(app);

    return await req
      .get(endpoint)
      .query(query)
      .set('Accept', 'application/json');
  }

  // 测试POST请求
  static async testPost(endpoint, data, token = null) {
    const req = token
      ? this.createAuthenticatedRequest(token)
      : request(app);

    return await req
      .post(endpoint)
      .send(data)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json');
  }

  // 测试PUT请求
  static async testPut(endpoint, data, token = null) {
    const req = token
      ? this.createAuthenticatedRequest(token)
      : request(app);

    return await req
      .put(endpoint)
      .send(data)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json');
  }

  // 测试DELETE请求
  static async testDelete(endpoint, token = null) {
    const req = token
      ? this.createAuthenticatedRequest(token)
      : request(app);

    return await req
      .delete(endpoint)
      .set('Accept', 'application/json');
  }

  // 验证响应格式
  static validateResponse(response, expectedStatus = 200) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('message');

    if (response.body.success) {
      expect(response.body).toHaveProperty('data');
    } else {
      expect(response.body).toHaveProperty('error');
    }

    return response.body;
  }
}
```

### 3. 集成测试用例设计

#### 3.1 认证流程测试
```javascript
// test/integration/auth.test.js
import TestDatabase from '../utils/testDatabase.js';
import { TestHelpers, HttpTestHelpers } from '../utils/testHelpers.js';
import TestDataFactory from '../factories/index.js';

describe('认证流程集成测试', () => {
  let testDatabase;
  let prisma;

  beforeAll(async () => {
    testDatabase = new TestDatabase();
    prisma = await testDatabase.setup();
  });

  afterAll(async () => {
    await testDatabase.teardown();
  });

  beforeEach(async () => {
    await testDatabase.truncateAllTables();
  });

  describe('用户注册', () => {
    test('应该成功注册新用户', async () => {
      const userData = TestDataFactory.createUser();

      const response = await HttpTestHelpers.testPost('/api/auth/register', userData);
      const body = HttpTestHelpers.validateResponse(response, 201);

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('user');
      expect(body.data.user).toHaveProperty('id');
      expect(body.data.user).toHaveProperty('username', userData.username);
      expect(body.data.user).toHaveProperty('email', userData.email);
      expect(body.data.user).not.toHaveProperty('password');
      expect(body.data).toHaveProperty('token');
    });

    test('应该拒绝重复用户名注册', async () => {
      const userData = TestDataFactory.createUser();

      // 第一次注册
      await HttpTestHelpers.testPost('/api/auth/register', userData);

      // 第二次注册相同用户名
      const response = await HttpTestHelpers.testPost('/api/auth/register', userData);
      const body = HttpTestHelpers.validateResponse(response, 409);

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  describe('用户登录', () => {
    test('应该成功登录', async () => {
      const userData = TestDataFactory.createUser();

      // 先注册用户
      await HttpTestHelpers.testPost('/api/auth/register', userData);

      // 登录
      const loginData = {
        username: userData.username,
        password: userData.password
      };

      const response = await HttpTestHelpers.testPost('/api/auth/login', loginData);
      const body = HttpTestHelpers.validateResponse(response);

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('user');
      expect(body.data).toHaveProperty('token');
    });

    test('应该拒绝错误密码', async () => {
      const userData = TestDataFactory.createUser();

      // 先注册用户
      await HttpTestHelpers.testPost('/api/auth/register', userData);

      // 使用错误密码登录
      const loginData = {
        username: userData.username,
        password: 'WrongPassword123!'
      };

      const response = await HttpTestHelpers.testPost('/api/auth/login', loginData);
      const body = HttpTestHelpers.validateResponse(response, 401);

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('令牌验证', () => {
    test('应该验证有效令牌', async () => {
      const { token } = await TestHelpers.createAuthenticatedUser(prisma);

      const response = await HttpTestHelpers.testPost('/api/auth/validate', { token });
      const body = HttpTestHelpers.validateResponse(response);

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('valid', true);
      expect(body.data).toHaveProperty('user');
    });

    test('应该拒绝无效令牌', async () => {
      const response = await HttpTestHelpers.testPost('/api/auth/validate', {
        token: 'invalid.token.here'
      });
      const body = HttpTestHelpers.validateResponse(response, 401);

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
```

#### 3.2 股票交易流程测试
```javascript
// test/integration/trade-flow.test.js
import TestDatabase from '../utils/testDatabase.js';
import { TestHelpers, HttpTestHelpers } from '../utils/testHelpers.js';
import TestDataFactory from '../factories/index.js';

describe('股票交易流程集成测试', () => {
  let testDatabase;
  let prisma;
  let user;
  let token;
  let aiAccount;
  let stock;

  beforeAll(async () => {
    testDatabase = new TestDatabase();
    prisma = await testDatabase.setup();
  });

  afterAll(async () => {
    await testDatabase.teardown();
  });

  beforeEach(async () => {
    await testDatabase.truncateAllTables();

    // 创建测试用户
    const auth = await TestHelpers.createAuthenticatedUser(prisma);
    user = auth.user;
    token = auth.token;

    // 创建AI账户
    aiAccount = await TestHelpers.createTestAIAccount(prisma, user.id);

    // 创建测试股票
    stock = await TestHelpers.createTestStock(prisma);
  });

  describe('股票查询', () => {
    test('应该获取股票列表', async () => {
      // 创建多个测试股票
      const stocks = await Promise.all(
        Array.from({ length: 5 }, () =>
          TestHelpers.createTestStock(prisma)
        )
      );

      const response = await HttpTestHelpers.testGet('/api/stocks', token);
      const body = HttpTestHelpers.validateResponse(response);

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('stocks');
      expect(body.data.stocks.length).toBeGreaterThanOrEqual(5);
      expect(body.data).toHaveProperty('pagination');
    });

    test('应该搜索股票', async () => {
      const searchTerm = stock.name.substring(0, 3);

      const response = await HttpTestHelpers.testGet('/api/stocks/search', token, {
        q: searchTerm
      });
      const body = HttpTestHelpers.validateResponse(response);

      expect(body.success).toBe(true);
      expect(body.data.stocks.length).toBeGreaterThan(0);
      expect(body.data.stocks[0].name).toContain(searchTerm);
    });
  });

  describe('交易执行', () => {
    test('应该成功买入股票', async () => {
      const tradeData = {
        accountId: aiAccount.id,
        stockCode: stock.code,
        tradeType: 'buy',
        quantity: 100,
        price: 50.00
      };

      const response = await HttpTestHelpers.testPost('/api/trades', tradeData, token);
      const body = HttpTestHelpers.validateResponse(response, 201);

      expect(body.success).toBe(true);
      expect(body.data.trade).toHaveProperty('id');
      expect(body.data.trade.tradeType).toBe('buy');
      expect(body.data.trade.status).toBe('executed');

      // 验证持仓更新
      const portfolio = await prisma.portfolio.findFirst({
        where: {
          accountId: aiAccount.id,
          stockCode: stock.code
        }
      });

      expect(portfolio).not.toBeNull();
      expect(portfolio.quantity).toBe(100);
    });

    test('应该成功卖出股票', async () => {
      // 先买入
      await TestHelpers.createTestTrade(prisma, aiAccount.id, {
        stockCode: stock.code,
        tradeType: 'buy',
        quantity: 200,
        price: 50.00
      });

      // 卖出部分
      const tradeData = {
        accountId: aiAccount.id,
        stockCode: stock.code,
        tradeType: 'sell',
        quantity: 100,
        price: 55.00
      };

      const response = await HttpTestHelpers.testPost('/api/trades', tradeData, token);
      const body = HttpTestHelpers.validateResponse(response, 201);

      expect(body.success).toBe(true);

      // 验证持仓减少
      const portfolio = await prisma.portfolio.findFirst({
        where: {
          accountId: aiAccount.id,
          stockCode: stock.code
        }
      });

      expect(portfolio.quantity).toBe(100);
    });

    test('应该拒绝卖出超过持仓数量', async () => {
      // 先买入100股
      await TestHelpers.createTestTrade(prisma, aiAccount.id, {
        stockCode: stock.code,
        tradeType: 'buy',
        quantity: 100,
        price: 50.00
      });

      // 尝试卖出200股
      const tradeData = {
        accountId: aiAccount.id,
        stockCode: stock.code,
        tradeType: 'sell',
        quantity: 200,
        price: 55.00
      };

      const response = await HttpTestHelpers.testPost('/api/trades', tradeData, token);
      const body = HttpTestHelpers.validateResponse(response, 400);

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INSUFFICIENT_SHARES');
    });
  });

  describe('持仓管理', () => {
    test('应该获取账户持仓', async () => {
      // 创建多个交易
      await Promise.all([
        TestHelpers.createTestTrade(prisma, aiAccount.id, {
          stockCode: stock.code,
          tradeType: 'buy',
          quantity: 100,
          price: 50.00
        }),
        TestHelpers.createTestTrade(prisma, aiAccount.id, {
          stockCode: 'TEST000002',
          tradeType: 'buy',
          quantity: 200,
          price: 30.00
        })
      ]);

      const response = await HttpTestHelpers.testGet(`/api/portfolios/${aiAccount.id}`, token);
      const body = HttpTestHelpers.validateResponse(response);

      expect(body.success).toBe(true);
      expect(body.data.portfolios.length).toBe(2);
      expect(body.data.totalValue).toBeGreaterThan(0);
    });

    test('应该计算持仓收益', async () => {
      // 买入股票
      await TestHelpers.createTestTrade(prisma, aiAccount.id, {
        stockCode: stock.code,
        tradeType: 'buy',
        quantity: 100,
        price: 50.00
      });

      const response = await HttpTestHelpers.testGet(`/api/portfolios/${aiAccount.id}/performance`, token);
      const body = HttpTestHelpers.validateResponse(response);

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('totalProfitLoss');
      expect(body.data).toHaveProperty('totalProfitLossPercent');
      expect(body.data).toHaveProperty('dailyChange');
    });
  });
});
```

#### 3.3 AI决策流程测试
```javascript
// test/integration/ai-decision.test.js
import TestDatabase from '../utils/testDatabase.js';
import { TestHelpers, HttpTestHelpers } from '../utils/testHelpers.js';
import TestDataFactory from '../factories/index.js';

// 模拟AI服务
jest.mock('../../src/services/AIService.js', () => {
  return {
    AIService: jest.fn().mockImplementation(() => ({
      generateDecision: jest.fn().mockResolvedValue({
        success: true,
        decision: {
          action: 'buy',
          confidence: 0.85,
          quantity: 100,
          price: 52.50,
          reasoning: '基于技术分析，该股票呈现上涨趋势',
          riskAssessment: '中等风险，建议设置止损'
        }
      })
    }))
  };
});

describe('AI决策流程集成测试', () => {
  let testDatabase;
  let prisma;
  let user;
  let token;
  let aiAccount;
  let stock;

  beforeAll(async () => {
    testDatabase = new TestDatabase();
    prisma = await testDatabase.setup();
  });

  afterAll(async () => {
    await testDatabase.teardown();
  });

  beforeEach(async () => {
    await testDatabase.truncateAllTables();

    const auth = await TestHelpers.createAuthenticatedUser(prisma);
    user = auth.user;
    token = auth.token;

    aiAccount = await TestHelpers.createTestAIAccount(prisma, user.id);
    stock = await TestHelpers.createTestStock(prisma);
  });

  describe('AI决策生成', () => {
    test('应该生成AI交易决策', async () => {
      const decisionData = {
        accountId: aiAccount.id,
        stockCode: stock.code,
        marketData: {
          currentPrice: 50.00,
          changePercent: 2.5,
          volume: 1000000
        }
      };

      const response = await HttpTestHelpers.testPost('/api/ai/decision', decisionData, token);
      const body = HttpTestHelpers.validateResponse(response);

      expect(body.success).toBe(true);
      expect(body.data.decision).toHaveProperty('action');
      expect(body.data.decision).toHaveProperty('confidence');
      expect(body.data.decision).toHaveProperty('reasoning');
      expect(body.data.decision).toHaveProperty('riskAssessment');
    });

    test('应该执行AI决策交易', async () => {
      // 模拟AI决策
      const decisionData = {
        accountId: aiAccount.id,
        stockCode: stock.code,
        action: 'buy',
        confidence: 0.85,
        quantity: 100,
        price: 52.50,
        reasoning: '测试决策',
        riskAssessment: '低风险'
      };

      const response = await HttpTestHelpers.testPost('/api/ai/execute', decisionData, token);
      const body = HttpTestHelpers.validateResponse(response, 201);

      expect(body.success).toBe(true);
      expect(body.data.trade).toHaveProperty('id');
      expect(body.data.trade.tradeType).toBe('buy');

      // 验证决策记录
      const decisionRecord = await prisma.aiDecision.findFirst({
        where: { accountId: aiAccount.id }
      });

      expect(decisionRecord).not.toBeNull();
      expect(decisionRecord.action).toBe('buy');
    });
  });

  describe('AI账户管理', () => {
    test('应该获取AI账户列表', async () => {
      // 创建多个AI账户
      await Promise.all(
        Array.from({ length: 3 }, () =>
          TestHelpers.createTestAIAccount(prisma, user.id)
        )
      );

      const response = await HttpTestHelpers.testGet('/api/ai-accounts', token);
      const body = HttpTestHelpers.validateResponse(response);

      expect(body.success).toBe(true);
      expect(body.data.accounts.length).toBe(4); // 包括beforeEach创建的
    });

    test('应该更新AI账户设置', async () => {
      const updateData = {
        name: 'Updated AI Account',
        settings: {
          riskLevel: 'high',
          maxPositionSize: 0.2,
          stopLoss: 0.1
        }
      };

      const response = await HttpTestHelpers.testPut(
        `/api/ai-accounts/${aiAccount.id}`,
        updateData,
        token
      );
      const body = HttpTestHelpers.validateResponse(response);

      expect(body.success).toBe(true);
      expect(body.data.account.name).toBe('Updated AI Account');
      expect(body.data.account.settings.riskLevel).toBe('high');
    });
  });
});
```

### 4. 测试执行优化

#### 4.1 并行测试执行
```javascript
// package.json scripts更新
{
  "scripts": {
    "test": "jest --coverage --maxWorkers=50%",
    "test:unit": "jest test/unit --maxWorkers=50%",
    "test:integration": "jest test/integration --maxWorkers=50%",
    "test:e2e": "jest test/e2e --runInBand", // E2E测试串行执行
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

#### 4.2 测试数据清理
```javascript
// test/setup.js
import TestDatabase from './utils/testDatabase.js';

let testDatabase;

beforeAll(async () => {
  // 只在集成测试中设置测试数据库
  if (process.env.NODE_ENV === 'test' &&
      (process.argv.includes('--testPathPattern=integration') ||
       process.argv.includes('--testPathPattern=e2e'))) {
    testDatabase = new TestDatabase();
    global.testDatabase = await testDatabase.setup();
  }
});

afterAll(async () => {
  if (testDatabase) {
    await testDatabase.teardown();
  }
});

// 全局测试超时
jest.setTimeout(30000);
```

## 实施步骤

### 阶段1：测试基础设施（1周）
1. **测试环境配置**
   - 配置Jest测试框架
   - 设置测试数据库
   - 创建测试数据工厂

2. **测试工具开发**
   - 实现TestHelpers
   - 实现HttpTestHelpers
   - 创建测试辅助函数

### 阶段2：核心流程测试（2周）
3. **认证流程测试**
   - 注册/登录测试
   - 令牌验证测试
   - 权限控制测试

4. **交易流程测试**
   - 股票查询测试
   - 买卖交易测试
   - 持仓管理测试

5. **AI决策测试**
   - AI决策生成测试
   - 决策执行测试
   - AI账户管理测试

### 阶段3：扩展测试（1周）
6. **性能测试**
   - API性能测试
   - 数据库性能测试
   - 并发测试

7. **错误处理测试**
   - 异常场景测试
   - 边界条件测试
   - 错误恢复测试

### 阶段4：优化和集成（1周）
8. **测试执行优化**
   - 并行执行配置
   - 测试数据清理
   - 测试报告生成

9. **CI/CD集成**
   - GitHub Actions配置
   - 自动化测试流水线
   - 测试覆盖率报告

## 成功指标

### 测试覆盖率
1. **单元测试覆盖率**：>80%
2. **集成测试覆盖率**：>70%
3. **关键路径覆盖率**：100%
4. **错误场景覆盖率**：>90%

### 测试质量
1. **测试通过率**：>95%
2. **测试稳定性**：<5%随机失败
3. **测试执行时间**：<10分钟（全量）
4. **测试维护成本**：减少50%

### 测试效率
1. **测试开发速度**：提高30%
2. **问题发现时间**：减少50%
3. **回归测试时间**：<5分钟
4. **测试环境准备**：<1分钟

## 监控和报告

### 测试报告
1. **HTML测试报告**：详细测试结果
2. **覆盖率报告**：代码覆盖率分析
3. **性能报告**：测试执行性能
4. **趋势报告**：测试质量趋势

### 监控指标
1. **测试通过率趋势**
2. **测试执行时间趋势**
3. **代码覆盖率趋势**
4. **缺陷发现率趋势**

## 附录

### A. 测试数据示例
```javascript
// 测试数据配置文件
export const testData = {
  users: {
    admin: {
      username: 'test_admin',
      email: 'admin@test.com',
      password: 'Admin123!',
      role: 'admin'
    },
    user: {
      username: 'test_user',
      email: 'user@test.com',
      password: 'User123!',
      role: 'user'
    }
  },
  stocks: {
    sh600000: {
      code: 'SH600000',
      name: '浦发银行',
      market: 'sh',
      industry: '金融'
    },
    sz000001: {
      code: 'SZ000001',
      name: '平安银行',
      market: 'sz',
      industry: '金融'
    }
  }
};
```

### B. 测试命令示例
```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行E2E测试
npm run test:e2e

# 运行特定测试文件
npm test -- test/integration/auth.test.js

# 运行测试并生成覆盖率报告
npm test -- --coverage

# 监视模式运行测试
npm run test:watch
```

### C. CI/CD配置示例
```yaml
# GitHub Actions配置
name: Test

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      run: npm run test:ci
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
        REDIS_URL: redis://localhost:6379
        JWT_SECRET: test-secret

    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

## 更新记录

| 日期 | 版本 | 更新内容 | 负责人 |
|------|------|----------|--------|
| 2026-02-04 | 1.0 | 创建集成测试完善方案 | 后端模块智能体 |

## 联系方式
- 测试负责人：后端模块智能体
- 问题反馈：通过项目issue系统
- 测试报告：CI/CD流水线输出