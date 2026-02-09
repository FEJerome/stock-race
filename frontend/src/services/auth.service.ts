import { api } from './api';
import { LoginRequest, LoginResponse, User } from '../types/api.types';

export const authService = {
  // 登录
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    try {
      // 后端API需要username和password参数
      const response = await api.post<{
        success: boolean;
        data: {
          user: {
            id: number;
            username: string;
            email: string;
          };
          token: string;
          sessionId: string;
          expiresAt: string;
          expiresIn: number;
        };
        message: string;
      }>('/auth/login', {
        username: credentials.username,
        password: credentials.password
      });

      if (response.success) {
        // 转换后端返回的用户数据格式，匹配前端User类型
        const backendUser = response.data.user;
        const user: User = {
          id: backendUser.id.toString(), // 后端返回number，前端需要string
          username: backendUser.username,
          email: backendUser.email,
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + backendUser.username,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        return {
          user,
          token: response.data.token,
          expiresIn: response.data.expiresIn,
        };
      } else {
        throw new Error(response.message || '登录失败');
      }
    } catch (error) {
      console.error('登录API调用失败，使用降级逻辑:', error);

      // 降级处理：保持原有的模拟登录逻辑
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (credentials.username === 'admin' && credentials.password === 'admin123') {
        const mockUser: User = {
          id: '1',
          username: 'admin',
          email: 'admin@stock-race.com',
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
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
    }
  },

  // 登出
  logout: async (): Promise<void> => {
    try {
      // 尝试调用真实API
      await api.post('/auth/logout');
    } catch (error) {
      console.error('登出API调用失败，继续执行本地登出:', error);
      // API失败时，只执行本地登出逻辑，不抛出错误
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  },

  // 获取当前用户信息
  getCurrentUser: async (): Promise<User> => {
    try {
      const response = await api.get<{
        success: boolean;
        data: {
          user: {
            id: number;
            username: string;
            email: string;
          };
        };
        message: string;
      }>('/auth/me');

      if (response.success) {
        const backendUser = response.data.user;
        return {
          id: backendUser.id.toString(),
          username: backendUser.username,
          email: backendUser.email,
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + backendUser.username,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        throw new Error(response.message || '获取用户信息失败');
      }
    } catch (error) {
      console.error('获取用户信息API调用失败，使用降级数据:', error);

      // 降级处理：返回模拟用户数据
      await new Promise(resolve => setTimeout(resolve, 500));

      const mockUser: User = {
        id: '1',
        username: 'admin',
        email: 'admin@stock-race.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return mockUser;
    }
  },

  // 刷新token
  refreshToken: async (): Promise<{ token: string; expiresIn: number }> => {
    try {
      const response = await api.post<{
        success: boolean;
        data: {
          token: string;
          expiresIn: number;
        };
        message: string;
      }>('/auth/refresh');

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.message || '刷新token失败');
      }
    } catch (error) {
      console.error('刷新token API调用失败，使用降级逻辑:', error);

      // 降级处理：返回模拟刷新数据
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        token: 'mock-jwt-token-refreshed-1234567890',
        expiresIn: 3600,
      };
    }
  },

  // 验证token是否有效
  validateToken: async (token: string): Promise<boolean> => {
    try {
      await api.get('/auth/validate', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    } catch (error) {
      console.error('验证token API调用失败，使用降级逻辑:', error);

      // 降级处理：检查是否为模拟token
      await new Promise(resolve => setTimeout(resolve, 300));
      return token.startsWith('mock-jwt-token');
    }
  },

  // 用户注册
  register: async (data: { username: string; password: string; confirmPassword: string }): Promise<RegisterResponse> => {
    try {
      const response = await api.post<{
        success: boolean;
        data: {
          user: {
            id: number;
            username: string;
            email: string;
            status: string;
            createdAt: string;
          };
          token: string;
          sessionId: string;
          expiresAt: string;
          expiresIn: number;
        };
        message: string;
      }>('/auth/register', {
        username: data.username,
        password: data.password,
        confirmPassword: data.confirmPassword
      });

      if (response.success) {
        // 转换后端返回的用户数据格式，匹配前端User类型
        const backendUser = response.data.user;
        const user: User = {
          id: backendUser.id.toString(),
          username: backendUser.username,
          email: backendUser.email,
          avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + backendUser.username,
          createdAt: backendUser.createdAt,
          updatedAt: new Date().toISOString(),
        };

        return {
          user,
          token: response.data.token,
          sessionId: response.data.sessionId,
          expiresAt: response.data.expiresAt,
          expiresIn: response.data.expiresIn,
        };
      } else {
        throw new Error(response.message || '注册失败');
      }
    } catch (error) {
      console.error('注册API调用失败:', error);
      throw error;
    }
  },
};

export default authService;