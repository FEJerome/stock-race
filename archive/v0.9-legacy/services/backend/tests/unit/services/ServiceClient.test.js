import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import ServiceClient, {
  CircuitBreaker,
  ServiceUnavailableError
} from '../../../src/services/ServiceClient.js';

describe('ServiceClient', () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();

    client = new ServiceClient('test-service', 'http://test-service:8080', {
      timeout: 10000,
      retries: 3,
      retryDelay: 100,
      retryMultiplier: 1,
      enableCircuitBreaker: true,
      circuitBreaker: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000
      }
    });
  });

  describe('Constructor', () => {
    it('should create client with correct configuration', () => {
      expect(client.serviceName).toBe('test-service');
      expect(client.config.timeout).toBe(10000);
      expect(client.config.retries).toBe(3);
      expect(client.circuitBreaker).toBeDefined();
    });

    it('should create axios instance with correct config', () => {
      expect(client.client).toBeDefined();
      expect(client.client.defaults.baseURL).toBe('http://test-service:8080');
      expect(client.client.defaults.timeout).toBe(10000);
    });
  });

  describe('HTTP Methods', () => {
    it('should support GET requests', async () => {
      // Mock the execute method
      const mockResponse = { data: { id: 1 } };
      jest.spyOn(client, 'execute').mockResolvedValue(mockResponse);

      const result = await client.get('/users/1');

      expect(client.execute).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should support POST requests', async () => {
      const mockResponse = { data: { id: 1 } };
      jest.spyOn(client, 'execute').mockResolvedValue(mockResponse);

      const payload = { name: 'Test' };
      const result = await client.post('/users', payload);

      expect(client.execute).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should support PUT requests', async () => {
      const mockResponse = { data: { id: 1 } };
      jest.spyOn(client, 'execute').mockResolvedValue(mockResponse);

      const payload = { name: 'Updated' };
      const result = await client.put('/users/1', payload);

      expect(client.execute).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should support DELETE requests', async () => {
      const mockResponse = { data: { deleted: true } };
      jest.spyOn(client, 'execute').mockResolvedValue(mockResponse);

      const result = await client.delete('/users/1');

      expect(client.execute).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });
  });

  describe('Request with Retry', () => {
    it('should return response on successful request', async () => {
      const mockResponse = { data: { success: true } };
      const requestFn = jest.fn().mockResolvedValue(mockResponse);

      const result = await client.requestWithRetry(requestFn);

      expect(result).toEqual(mockResponse);
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure then succeed', async () => {
      const mockResponse = { data: { success: true } };
      const requestFn = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse);

      const result = await client.requestWithRetry(requestFn);

      expect(result).toEqual(mockResponse);
      expect(requestFn).toHaveBeenCalledTimes(2);
    });

    it('should retry up to max retries then throw', async () => {
      const requestFn = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(client.requestWithRetry(requestFn)).rejects.toThrow('Network error');
      expect(requestFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after threshold failures', async () => {
      const requestFn = jest.fn().mockRejectedValue(new Error('Service down'));

      // Trigger failures up to threshold
      for (let i = 0; i < 3; i++) {
        try {
          await client.execute(requestFn);
        } catch (e) {
          // Expected
        }
      }

      // Circuit should be open now
      const state = client.getCircuitBreakerState();
      expect(state.state).toBe('OPEN');
    });

    it('should reset circuit breaker', async () => {
      // Trigger failures
      const requestFn = jest.fn().mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 3; i++) {
        try {
          await client.execute(requestFn);
        } catch (e) {
          // Expected
        }
      }

      // Reset circuit breaker
      client.resetCircuitBreaker();

      // Should be able to make requests again
      const state = client.getCircuitBreakerState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status on success', async () => {
      // Mock the underlying axios client get method
      const mockGet = jest.fn().mockResolvedValue({
        data: { version: '1.0.0', status: 'ok' }
      });
      client.client.get = mockGet;

      const result = await client.healthCheck();

      expect(result.success).toBe(true);
      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBeDefined();
    });

    it('should return unhealthy status on failure', async () => {
      const mockGet = jest.fn().mockRejectedValue(new Error('Connection refused'));
      client.client.get = mockGet;

      const result = await client.healthCheck();

      expect(result.success).toBe(false);
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBeDefined();
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create error with correct properties', () => {
      const originalError = new Error('Original error');
      const error = new ServiceUnavailableError('test-service', 'Service down', originalError);

      expect(error.name).toBe('ServiceUnavailableError');
      expect(error.serviceName).toBe('test-service');
      expect(error.message).toContain('test-service');
      expect(error.message).toContain('Service down');
      expect(error.originalError).toBe(originalError);
      expect(error.timestamp).toBeDefined();
    });
  });
});

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-breaker', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000
    });
  });

  it('should start in CLOSED state', () => {
    expect(breaker.state).toBe('CLOSED');
  });

  it('should open after threshold failures', async () => {
    const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));

    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // Expected
      }
    }

    expect(breaker.state).toBe('OPEN');
    expect(breaker.failureCount).toBe(3);
  });

  it('should close after success threshold in HALF_OPEN', async () => {
    // First open the circuit
    const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // Expected
      }
    }

    expect(breaker.state).toBe('OPEN');

    // Wait for timeout
    breaker.nextAttempt = Date.now();

    // Now succeed twice
    const successFn = jest.fn().mockResolvedValue('success');
    await breaker.execute(successFn);
    await breaker.execute(successFn);

    expect(breaker.state).toBe('CLOSED');
  });

  it('should reset to initial state', () => {
    breaker.state = 'OPEN';
    breaker.failureCount = 5;

    breaker.reset();

    expect(breaker.state).toBe('CLOSED');
    expect(breaker.failureCount).toBe(0);
  });

  it('should return correct state info', () => {
    const state = breaker.getState();

    expect(state.name).toBe('test-breaker');
    expect(state.state).toBe('CLOSED');
    expect(state.failureCount).toBe(0);
    expect(state.config.failureThreshold).toBe(3);
  });
});
