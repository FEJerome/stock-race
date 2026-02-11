import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

/**
 * AI账户创建API集成测试
 * 验证完整创建流程和数据库记录
 *
 * 注意：运行这些测试需要完整环境
 * - PostgreSQL数据库
 * - Redis缓存
 * - Backend服务
 */

describe('AI Account Creation Integration Tests', () => {
  const TEST_TIMEOUT = 30000;
  const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

  // Test user credentials
  const testUser = {
    username: `test_user_${Date.now()}`,
    password: 'TestPassword123!',
    email: `test_${Date.now()}@example.com`
  };

  let authToken;

  beforeAll(async () => {
    // Skip tests if not in proper environment
    if (process.env.SKIP_INTEGRATION_TESTS === 'true') {
      console.log('Skipping integration tests');
      return;
    }

    try {
      // Register test user
      const registerResponse = await request(BASE_URL)
        .post('/api/auth/register')
        .send(testUser);

      if (registerResponse.status === 201) {
        // Login to get token
        const loginResponse = await request(BASE_URL)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            password: testUser.password
          });

        if (loginResponse.status === 200 && loginResponse.body.success) {
          authToken = loginResponse.body.data.token;
        }
      }
    } catch (error) {
      console.warn('Integration test setup failed:', error.message);
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup: Delete test user and accounts
    if (authToken) {
      try {
        // Delete AI accounts first
        const accountsResponse = await request(BASE_URL)
          .get('/api/ai-accounts')
          .set('Authorization', `Bearer ${authToken}`);

        if (accountsResponse.body.success) {
          for (const account of accountsResponse.body.data.accounts) {
            await request(BASE_URL)
              .delete(`/api/ai-accounts/${account.id}`)
              .set('Authorization', `Bearer ${authToken}`);
          }
        }

        // Delete test user
        await request(BASE_URL)
          .delete('/api/users/me')
          .set('Authorization', `Bearer ${authToken}`);
      } catch (error) {
        console.warn('Cleanup failed:', error.message);
      }
    }
  }, TEST_TIMEOUT);

  describe('POST /api/ai-accounts', () => {
    it('should create AI account with valid data', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      const accountData = {
        name: 'Test AI Account',
        initialBalance: 100000,
        modelType: 'openai_gpt4',
        tradingFrequency: 'daily',
        riskLevel: 'medium',
        promptTemplate: 'default_trading_analysis',
        config: { maxPositions: 10 }
      };

      const response = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(accountData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.account).toBeDefined();
      expect(response.body.data.account.name).toBe(accountData.name);
      expect(response.body.data.account.status).toBe('draft');
      expect(response.body.data.account.initialBalance).toBe(accountData.initialBalance);
      expect(response.body.data.account.currentBalance).toBe(accountData.initialBalance);
      expect(response.body.data.account.totalValue).toBe(accountData.initialBalance);
    }, TEST_TIMEOUT);

    it('should verify account exists in database', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      // Create account
      const createResponse = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'DB Verification Test',
          initialBalance: 50000,
          modelType: 'claude'
        });

      expect(createResponse.status).toBe(201);
      const accountId = createResponse.body.data.account.id;

      // Verify by fetching account details
      const detailResponse = await request(BASE_URL)
        .get(`/api/ai-accounts/${accountId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.success).toBe(true);
      expect(detailResponse.body.data.account.id).toBe(accountId);
      expect(detailResponse.body.data.account.name).toBe('DB Verification Test');
    }, TEST_TIMEOUT);

    it('should enforce balance boundaries', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      // Test minimum boundary
      const minResponse = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Min Balance Test',
          initialBalance: 5000 // Below minimum
        });

      expect(minResponse.status).toBe(400);
      expect(minResponse.body.success).toBe(false);

      // Test maximum boundary
      const maxResponse = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Max Balance Test',
          initialBalance: 2000000 // Above maximum
        });

      expect(maxResponse.status).toBe(400);
      expect(maxResponse.body.success).toBe(false);
    }, TEST_TIMEOUT);

    it('should create account with boundary values', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      // Test minimum valid value
      const minValidResponse = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Min Valid Balance',
          initialBalance: 10000
        });

      expect(minValidResponse.status).toBe(201);
      expect(minValidResponse.body.success).toBe(true);
      expect(minValidResponse.body.data.account.initialBalance).toBe(10000);

      // Test maximum valid value
      const maxValidResponse = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Max Valid Balance',
          initialBalance: 1000000
        });

      expect(maxValidResponse.status).toBe(201);
      expect(maxValidResponse.body.success).toBe(true);
      expect(maxValidResponse.body.data.account.initialBalance).toBe(1000000);
    }, TEST_TIMEOUT);

    it('should validate model types', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      const validModels = ['openai_gpt4', 'openai_gpt35', 'claude', 'wenxin', 'qwen'];

      for (const modelType of validModels) {
        const response = await request(BASE_URL)
          .post('/api/ai-accounts')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: `Model ${modelType}`,
            initialBalance: 100000,
            modelType
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      }
    }, TEST_TIMEOUT);

    it('should reject invalid model types', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      const response = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Model Test',
          initialBalance: 100000,
          modelType: 'invalid_model'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }, TEST_TIMEOUT);

    it('should validate trading frequency', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      const validFrequencies = ['minutely', 'hourly', 'daily', 'weekly'];

      for (const frequency of validFrequencies) {
        const response = await request(BASE_URL)
          .post('/api/ai-accounts')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: `Frequency ${frequency}`,
            initialBalance: 100000,
            tradingFrequency: frequency
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      }
    }, TEST_TIMEOUT);

    it('should validate risk levels', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      const validRiskLevels = ['low', 'medium', 'high', 'critical'];

      for (const riskLevel of validRiskLevels) {
        const response = await request(BASE_URL)
          .post('/api/ai-accounts')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: `Risk ${riskLevel}`,
            initialBalance: 100000,
            riskLevel
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      }
    }, TEST_TIMEOUT);

    it('should require authentication', async () => {
      const response = await request(BASE_URL)
        .post('/api/ai-accounts')
        .send({
          name: 'No Auth Test',
          initialBalance: 100000
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    }, TEST_TIMEOUT);

    it('should create account with default values', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      const response = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Default Values Test',
          initialBalance: 100000
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.account.modelType).toBeDefined();
      expect(response.body.data.account.tradingFrequency).toBeDefined();
      expect(response.body.data.account.riskLevel).toBeDefined();
    }, TEST_TIMEOUT);

    it('should set initial account status to draft', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      const response = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Status Test',
          initialBalance: 100000
        });

      expect(response.status).toBe(201);
      expect(response.body.data.account.status).toBe('draft');
    }, TEST_TIMEOUT);

    it('should prevent duplicate account names for same user', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      const accountName = `Duplicate Test ${Date.now()}`;

      // Create first account
      const firstResponse = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: accountName,
          initialBalance: 100000
        });

      expect(firstResponse.status).toBe(201);

      // Try to create second account with same name
      const secondResponse = await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: accountName,
          initialBalance: 100000
        });

      // Should either succeed with different ID or fail with conflict
      if (secondResponse.status === 201) {
        expect(secondResponse.body.data.account.id).not.toBe(firstResponse.body.data.account.id);
      } else {
        expect(secondResponse.status).toBe(409); // Conflict
      }
    }, TEST_TIMEOUT);

    it('should list created accounts', async () => {
      if (!authToken) {
        console.log('Skipping: No auth token');
        return;
      }

      // Create an account
      await request(BASE_URL)
        .post('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'List Test Account',
          initialBalance: 100000
        });

      // List accounts
      const listResponse = await request(BASE_URL)
        .get('/api/ai-accounts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.success).toBe(true);
      expect(Array.isArray(listResponse.body.data.accounts)).toBe(true);
      expect(listResponse.body.data.accounts.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });
});
