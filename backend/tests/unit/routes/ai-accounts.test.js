import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock all dependencies before importing the controller
const mockCreateAccount = jest.fn();
const mockGetUserAccounts = jest.fn();
const mockLogUserActivity = jest.fn();
const mockFindOne = jest.fn();
const mockValidateRequest = jest.fn();

// Setup mocks before any imports
jest.unstable_mockModule('../../../src/models/index.js', () => ({
  aiAccountRepository: {
    createAccount: mockCreateAccount,
    getUserAccounts: mockGetUserAccounts,
    findOne: mockFindOne
  },
  decisionLogRepository: {
    getRecentDecisions: jest.fn()
  },
  systemLogRepository: {
    logUserActivity: mockLogUserActivity
  }
}));

jest.unstable_mockModule('../../../src/services/AuthService.js', () => ({
  authService: {
    validateRequest: mockValidateRequest
  }
}));

jest.unstable_mockModule('../../../src/services/AIService.js', () => ({
  aiService: {
    getModelStatus: jest.fn()
  }
}));

jest.unstable_mockModule('../../../src/services/DataService.js', () => ({
  dataService: {
    getRealtimeData: jest.fn()
  }
}));

// Import after mocking
const { AIController } = await import('../../../src/controllers/AIController.js');

describe('AI Accounts API - Unit Tests', () => {
  let app;
  let aiController;

  beforeEach(() => {
    jest.clearAllMocks();
    aiController = new AIController();

    app = express();
    app.use(express.json());

    // Mock auth middleware
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTH_001', message: '缺少认证令牌' }
        });
      }

      // Simulate auth validation
      const result = mockValidateRequest(authHeader);
      if (!result || !result.valid) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTH_001', message: result?.message || '认证失败' }
        });
      }

      req.user = result.user;
      next();
    });

    // Routes
    app.post('/api/ai-accounts', (req, res) => aiController.createAIAccount(req, res));
  });

  describe('POST /api/ai-accounts', () => {
    const validToken = 'Bearer valid-token';
    const mockUser = { id: 1, username: 'testuser' };

    beforeEach(() => {
      mockValidateRequest.mockReturnValue({ valid: true, user: mockUser });
      mockLogUserActivity.mockResolvedValue({});
    });

    describe('Authentication', () => {
      it('should reject request without authentication', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .send({ name: 'Test AI', initialBalance: 100000 });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      it('should reject request with invalid token', async () => {
        mockValidateRequest.mockReturnValue({ valid: false, message: '无效的令牌' });

        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', 'Bearer invalid-token')
          .send({ name: 'Test AI', initialBalance: 100000 });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      it('should allow request with valid token', async () => {
        mockCreateAccount.mockResolvedValue({
          id: 1,
          name: 'Test AI',
          modelType: 'openai_gpt4',
          initialBalance: 100000,
          currentBalance: 100000,
          totalValue: 100000,
          status: 'draft',
          tradingFrequency: 'daily',
          riskLevel: 'medium',
          createdAt: new Date().toISOString()
        });

        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 100000 });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    });

    describe('Validation - Required Fields', () => {
      it('should reject request without name', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ initialBalance: 100000 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject request with empty name', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: '', initialBalance: 100000 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('Validation - Initial Balance Boundaries', () => {
      it('should reject initial balance below minimum (10000)', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 5000 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject initial balance above maximum (1000000)', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 2000000 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should accept minimum valid balance (10000)', async () => {
        mockCreateAccount.mockResolvedValue({
          id: 1,
          name: 'Test AI',
          initialBalance: 10000,
          currentBalance: 10000,
          totalValue: 10000,
          status: 'draft',
          modelType: 'openai_gpt4',
          tradingFrequency: 'daily',
          riskLevel: 'medium',
          createdAt: new Date().toISOString()
        });

        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 10000 });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(mockCreateAccount).toHaveBeenCalledWith(
          expect.objectContaining({ initialBalance: 10000 })
        );
      });

      it('should accept maximum valid balance (1000000)', async () => {
        mockCreateAccount.mockResolvedValue({
          id: 1,
          name: 'Test AI',
          initialBalance: 1000000,
          currentBalance: 1000000,
          totalValue: 1000000,
          status: 'draft',
          modelType: 'openai_gpt4',
          tradingFrequency: 'daily',
          riskLevel: 'medium',
          createdAt: new Date().toISOString()
        });

        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 1000000 });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(mockCreateAccount).toHaveBeenCalledWith(
          expect.objectContaining({ initialBalance: 1000000 })
        );
      });

      it('should reject zero balance', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 0 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject negative balance', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: -10000 });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('Validation - Model Type', () => {
      it('should reject invalid model type', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 100000, modelType: 'invalid_model' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should accept valid model types', async () => {
        const validModels = ['openai_gpt4', 'openai_gpt35', 'claude', 'wenxin', 'qwen'];

        for (const modelType of validModels) {
          jest.clearAllMocks();
          mockValidateRequest.mockReturnValue({ valid: true, user: mockUser });
          mockCreateAccount.mockResolvedValue({
            id: 1,
            name: 'Test AI',
            initialBalance: 100000,
            currentBalance: 100000,
            totalValue: 100000,
            status: 'draft',
            modelType: modelType,
            tradingFrequency: 'daily',
            riskLevel: 'medium',
            createdAt: new Date().toISOString()
          });

          const response = await request(app)
            .post('/api/ai-accounts')
            .set('Authorization', validToken)
            .send({ name: 'Test AI', initialBalance: 100000, modelType });

          expect(response.status).toBe(201);
          expect(response.body.success).toBe(true);
        }
      });
    });

    describe('Validation - Trading Strategy', () => {
      it('should reject invalid trading frequency', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 100000, tradingFrequency: 'yearly' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should reject invalid risk level', async () => {
        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 100000, riskLevel: 'extreme' });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('Database Operations', () => {
      it('should create account with correct data structure', async () => {
        const accountData = {
          name: 'My AI Trader',
          initialBalance: 100000,
          modelType: 'openai_gpt4',
          tradingFrequency: 'daily',
          riskLevel: 'medium',
          promptTemplate: 'custom_template',
          config: { maxPositions: 10 }
        };

        mockCreateAccount.mockResolvedValue({
          id: 123,
          name: accountData.name,
          modelType: accountData.modelType,
          initialBalance: accountData.initialBalance,
          currentBalance: accountData.initialBalance,
          totalValue: accountData.initialBalance,
          status: 'draft',
          tradingFrequency: accountData.tradingFrequency,
          riskLevel: accountData.riskLevel,
          promptTemplate: accountData.promptTemplate,
          createdAt: new Date().toISOString()
        });

        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send(accountData);

        expect(response.status).toBe(201);
        expect(mockCreateAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: mockUser.id,
            name: accountData.name,
            initialBalance: accountData.initialBalance,
            currentBalance: accountData.initialBalance,
            totalValue: accountData.initialBalance,
            modelType: accountData.modelType,
            tradingFrequency: accountData.tradingFrequency,
            riskLevel: accountData.riskLevel,
            promptTemplate: accountData.promptTemplate,
            config: JSON.stringify(accountData.config)
          })
        );
      });

      it('should set initial status as draft', async () => {
        mockCreateAccount.mockResolvedValue({
          id: 1,
          name: 'Test AI',
          status: 'draft',
          createdAt: new Date().toISOString()
        });

        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 100000 });

        expect(response.status).toBe(201);
        expect(response.body.data.account.status).toBe('draft');
      });

      it('should log user activity after creation', async () => {
        mockCreateAccount.mockResolvedValue({
          id: 1,
          name: 'Test AI',
          modelType: 'openai_gpt4',
          initialBalance: 100000,
          status: 'draft',
          createdAt: new Date().toISOString()
        });

        await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 100000 });

        expect(mockLogUserActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: mockUser.id,
            module: 'ai',
            action: 'create_account',
            message: expect.stringContaining('Test AI')
          })
        );
      });
    });

    describe('Error Handling', () => {
      it('should handle database errors gracefully', async () => {
        mockCreateAccount.mockRejectedValue(new Error('Database connection failed'));

        const response = await request(app)
          .post('/api/ai-accounts')
          .set('Authorization', validToken)
          .send({ name: 'Test AI', initialBalance: 100000 });

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('INTERNAL_ERROR');
      });
    });
  });
});
