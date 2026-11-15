import { api } from './api';
import { LoginRequest, LoginResponse, User } from '../types/api.types';

export const authService = {
  // 登录
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    // 模拟API调用 - 实际项目中替换为真实API
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test-only mock credentials for local development; never use in production
    if (credentials.username === 'mock-admin' && credentials.password === 'TEST_ONLY_password') {
      const mockUser: User = {
        id: '1',
        username: 'mock-admin',
        email: 'mock-admin@stock-race.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mock-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return {
        user: mockUser,
        token: 'mock-jwt-token-1234567890',
        expiresIn: 3600,
      };
    } else {
      throw new Error('用户名或密码错误');
    }

    // 实际API调用
    // return api.post<LoginResponse>('/auth/login', credentials);
  },

  // 登出
  logout: async (): Promise<void> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));

    // 实际API调用
    // return api.post('/auth/logout');
  },

  // 获取当前用户信息
  getCurrentUser: async (): Promise<User> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockUser: User = {
      id: '1',
      username: 'mock-admin',
      email: 'mock-admin@stock-race.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mock-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return mockUser;

    // 实际API调用
    // return api.get<User>('/auth/me');
  },

  // 刷新token
  refreshToken: async (): Promise<{ token: string; expiresIn: number }> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      token: 'mock-jwt-token-refreshed-1234567890',
      expiresIn: 3600,
    };

    // 实际API调用
    // return api.post<{ token: string; expiresIn: number }>('/auth/refresh');
  },

  // 验证token是否有效
  validateToken: async (token: string): Promise<boolean> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 300));

    return token.startsWith('mock-jwt-token');

    // 实际API调用
    // try {
    //   await api.get('/auth/validate', {
    //     headers: { Authorization: `Bearer ${token}` },
    //   });
    //   return true;
    // } catch {
    //   return false;
    // }
  },
};

export default authService;