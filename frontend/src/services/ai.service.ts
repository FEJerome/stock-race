import { api } from './api';
import {
  AIAccount,
  AIDecision,
  PaginatedResponse,
  PaginationParams,
} from '../types/api.types';

export const aiService = {
  // 获取AI账户列表
  getAIAccounts: async (): Promise<AIAccount[]> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockAccounts: AIAccount[] = [
      {
        id: '1',
        userId: '1',
        name: '量化策略AI',
        modelType: 'openai',
        isActive: true,
        createdAt: '2026-01-15T10:30:00Z',
        updatedAt: '2026-02-03T14:30:00Z',
      },
      {
        id: '2',
        userId: '1',
        name: '价值投资助手',
        modelType: 'claude',
        isActive: true,
        createdAt: '2026-01-20T11:15:00Z',
        updatedAt: '2026-02-03T14:25:00Z',
      },
      {
        id: '3',
        userId: '1',
        name: '技术分析大师',
        modelType: 'wenxin',
        isActive: false,
        createdAt: '2026-01-25T13:45:00Z',
        updatedAt: '2026-02-03T14:20:00Z',
      },
      {
        id: '4',
        userId: '1',
        name: '风险控制专家',
        modelType: 'qwen',
        isActive: false,
        createdAt: '2026-02-01T14:20:00Z',
        updatedAt: '2026-02-03T14:15:00Z',
      },
    ];

    return mockAccounts;

    // 实际API调用
    // return api.get<AIAccount[]>('/ai/accounts');
  },

  // 创建AI账户
  createAIAccount: async (account: Omit<AIAccount, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<AIAccount> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000));

    const mockAccount: AIAccount = {
      id: Date.now().toString(),
      userId: '1',
      ...account,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return mockAccount;

    // 实际API调用
    // return api.post<AIAccount>('/ai/accounts', account);
  },

  // 更新AI账户
  updateAIAccount: async (id: string, updates: Partial<AIAccount>): Promise<AIAccount> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockAccount: AIAccount = {
      id,
      userId: '1',
      name: updates.name || '量化策略AI',
      modelType: updates.modelType || 'openai',
      isActive: updates.isActive !== undefined ? updates.isActive : true,
      createdAt: '2026-01-15T10:30:00Z',
      updatedAt: new Date().toISOString(),
    };

    return mockAccount;

    // 实际API调用
    // return api.put<AIAccount>(`/ai/accounts/${id}`, updates);
  },

  // 删除AI账户
  deleteAIAccount: async (id: string): Promise<void> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 300));

    // 实际API调用
    // return api.delete(`/ai/accounts/${id}`);
  },

  // 获取AI决策记录
  getAIDecisions: async (params?: PaginationParams): Promise<PaginatedResponse<AIDecision>> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockDecisions: AIDecision[] = [
      {
        id: '1',
        aiAccountId: '1',
        stockSymbol: 'AAPL',
        action: 'buy',
        confidence: 0.85,
        reason: '技术面显示突破形态，基本面业绩超预期，建议买入',
        suggestedPrice: 163.00,
        suggestedQuantity: 50,
        createdAt: '2026-02-03T14:30:25Z',
      },
      {
        id: '2',
        aiAccountId: '2',
        stockSymbol: 'MSFT',
        action: 'hold',
        confidence: 0.72,
        reason: '估值合理，等待季度财报发布后再做决策',
        suggestedPrice: 415.75,
        createdAt: '2026-02-03T14:25:10Z',
      },
      {
        id: '3',
        aiAccountId: '3',
        stockSymbol: 'TSLA',
        action: 'sell',
        confidence: 0.68,
        reason: '技术指标显示超买，短期回调压力较大',
        suggestedPrice: 195.50,
        suggestedQuantity: 30,
        createdAt: '2026-02-03T14:20:45Z',
      },
      {
        id: '4',
        aiAccountId: '4',
        stockSymbol: 'NVDA',
        action: 'buy',
        confidence: 0.92,
        reason: 'AI芯片需求持续增长，业绩指引强劲，强烈建议买入',
        suggestedPrice: 945.00,
        suggestedQuantity: 20,
        createdAt: '2026-02-03T14:15:30Z',
      },
      {
        id: '5',
        aiAccountId: '1',
        stockSymbol: 'GOOGL',
        action: 'buy',
        confidence: 0.78,
        reason: '广告业务复苏，云计算增长强劲，估值有吸引力',
        suggestedPrice: 144.50,
        suggestedQuantity: 40,
        createdAt: '2026-02-03T14:10:15Z',
      },
    ];

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 10;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      items: mockDecisions.slice(start, end),
      total: mockDecisions.length,
      page,
      pageSize,
      totalPages: Math.ceil(mockDecisions.length / pageSize),
    };

    // 实际API调用
    // return api.get<PaginatedResponse<AIDecision>>('/ai/decisions', { params });
  },

  // 触发AI分析
  triggerAIAnalysis: async (symbol: string, aiAccountId?: string): Promise<AIDecision> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 2000));

    const mockDecision: AIDecision = {
      id: Date.now().toString(),
      aiAccountId: aiAccountId || '1',
      stockSymbol: symbol,
      action: Math.random() > 0.5 ? 'buy' : Math.random() > 0.5 ? 'sell' : 'hold',
      confidence: 0.7 + Math.random() * 0.3,
      reason: `基于技术分析和基本面评估，${symbol}当前${Math.random() > 0.5 ? '呈现买入机会' : '存在调整压力'}`,
      suggestedPrice: 100 + Math.random() * 100,
      suggestedQuantity: Math.floor(Math.random() * 100) + 10,
      createdAt: new Date().toISOString(),
    };

    return mockDecision;

    // 实际API调用
    // return api.post<AIDecision>('/ai/analyze', { symbol, aiAccountId });
  },

  // 获取AI账户详情
  getAIAccountDetail: async (id: string): Promise<AIAccount> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 300));

    const mockAccount: AIAccount = {
      id,
      userId: '1',
      name: '量化策略AI',
      modelType: 'openai',
      isActive: true,
      createdAt: '2026-01-15T10:30:00Z',
      updatedAt: '2026-02-03T14:30:00Z',
    };

    return mockAccount;

    // 实际API调用
    // return api.get<AIAccount>(`/ai/accounts/${id}`);
  },

  // 获取AI决策详情
  getAIDecisionDetail: async (id: string): Promise<AIDecision> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 300));

    const mockDecision: AIDecision = {
      id,
      aiAccountId: '1',
      stockSymbol: 'AAPL',
      action: 'buy',
      confidence: 0.85,
      reason: '技术面显示突破形态，基本面业绩超预期，建议买入',
      suggestedPrice: 163.00,
      suggestedQuantity: 50,
      createdAt: '2026-02-03T14:30:25Z',
    };

    return mockDecision;

    // 实际API调用
    // return api.get<AIDecision>(`/ai/decisions/${id}`);
  },

  // 获取AI性能统计
  getAIPerformance: async (aiAccountId?: string): Promise<any> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 400));

    const mockPerformance = {
      totalDecisions: 156,
      successfulDecisions: 122,
      successRate: 78.2,
      averageConfidence: 0.76,
      averageResponseTime: 1.2,
      todayDecisions: 24,
      weeklyDecisions: 85,
      monthlyDecisions: 156,
    };

    return mockPerformance;

    // 实际API调用
    // const url = aiAccountId ? `/ai/performance/${aiAccountId}` : '/ai/performance';
    // return api.get<any>(url);
  },

  // 批量触发AI分析
  batchAIAnalysis: async (symbols: string[]): Promise<AIDecision[]> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 3000));

    const mockDecisions: AIDecision[] = symbols.map((symbol, index) => ({
      id: (Date.now() + index).toString(),
      aiAccountId: '1',
      stockSymbol: symbol,
      action: Math.random() > 0.5 ? 'buy' : Math.random() > 0.5 ? 'sell' : 'hold',
      confidence: 0.6 + Math.random() * 0.4,
      reason: `对${symbol}的综合分析结果`,
      suggestedPrice: 100 + Math.random() * 100,
      suggestedQuantity: Math.floor(Math.random() * 100) + 10,
      createdAt: new Date().toISOString(),
    }));

    return mockDecisions;

    // 实际API调用
    // return api.post<AIDecision[]>('/ai/analyze/batch', { symbols });
  },

  // 测试AI账户连接
  testAIConnection: async (aiAccountId: string): Promise<{ success: boolean; message: string }> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1500));

    const success = Math.random() > 0.2; // 80%成功率

    return {
      success,
      message: success
        ? 'AI账户连接测试成功'
        : 'AI账户连接测试失败，请检查API密钥和网络连接',
    };

    // 实际API调用
    // return api.post<{ success: boolean; message: string }>(`/ai/accounts/${aiAccountId}/test`);
  },
};

export default aiService;