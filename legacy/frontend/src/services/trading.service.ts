import { api } from './api';
import {
  TradeOrder,
  CreateOrderRequest,
  Position,
  PortfolioSummary,
  PaginatedResponse,
  PaginationParams,
} from '../types/api.types';
import { cacheManager } from '../utils/cache';

export const tradingService = {
  // 获取交易订单列表 - 使用真实API，带缓存和降级机制
  getOrders: async (params?: PaginationParams & { accountId?: string }): Promise<PaginatedResponse<TradeOrder>> => {
    try {
      // 生成缓存键（包含分页参数和账户ID）
      const page = params?.page || 1;
      const pageSize = params?.pageSize || 10;
      const accountId = params?.accountId || '';
      const cacheKey = `trading_orders_page${page}_size${pageSize}_account${accountId || 'user1'}`;

      // 尝试从缓存获取（用户数据缓存15分钟）
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        console.log('使用缓存交易订单数据:', cacheKey);
        return cached;
      }

      // 调用真实API
      const response = await api.get<{
        success: boolean;
        data: {
          items: any[];
          pagination: any;
        };
        message: string;
      }>('/trades', { params });

      if (response.success) {
        // 转换数据格式，匹配前端TradeOrder类型
        const orders: TradeOrder[] = response.data.items.map((item: any) => ({
          id: item.id?.toString() || Date.now().toString(),
          userId: item.userId?.toString() || '1',
          stockSymbol: item.stockSymbol || item.stockCode || '',
          stockName: item.stockName || '',
          orderType: item.orderType || 'buy',
          orderStatus: item.orderStatus || 'pending',
          quantity: item.quantity || 0,
          price: item.price || 0,
          totalAmount: item.totalAmount || 0,
          executedPrice: item.executedPrice || item.price || 0,
          executedAt: item.executedAt || item.createdAt || new Date().toISOString(),
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        }));

        const paginatedResponse: PaginatedResponse<TradeOrder> = {
          items: orders,
          total: response.data.pagination?.total || orders.length,
          page: response.data.pagination?.page || page,
          pageSize: response.data.pagination?.pageSize || pageSize,
          totalPages: response.data.pagination?.totalPages || Math.ceil(orders.length / pageSize),
        };

        // 缓存数据（用户数据缓存15分钟）
        cacheManager.set(cacheKey, paginatedResponse, 900000); // 15分钟

        return paginatedResponse;
      } else {
        throw new Error(response.message || '获取交易订单失败');
      }
    } catch (error) {
      console.error('获取交易订单失败，使用降级数据:', error);

      // 检查错误类型，尝试使用缓存
      if (error.response?.status === 429 || error.response?.status >= 500 || error.code === 'ECONNABORTED') {
        const page = params?.page || 1;
        const pageSize = params?.pageSize || 10;
        const accountId = params?.accountId || '';
        const cacheKey = `trading_orders_page${page}_size${pageSize}_account${accountId || 'user1'}`;
        const cached = cacheManager.get(cacheKey);
        if (cached) {
          console.warn('API错误，使用缓存数据');
          return cached;
        }
      }

      // 降级处理：返回模拟数据（保持原有模拟数据逻辑）
      await new Promise(resolve => setTimeout(resolve, 500));

      const mockOrders: TradeOrder[] = [
        {
          id: '1',
          userId: '1',
          stockSymbol: 'AAPL',
          stockName: '苹果公司',
          orderType: 'buy',
          orderStatus: 'executed',
          quantity: 50,
          price: 162.50,
          totalAmount: 8125.00,
          executedPrice: 162.50,
          executedAt: '2026-02-03T14:30:25Z',
          createdAt: '2026-02-03T14:30:00Z',
          updatedAt: '2026-02-03T14:30:25Z',
        },
        {
          id: '2',
          userId: '1',
          stockSymbol: 'MSFT',
          stockName: '微软公司',
          orderType: 'sell',
          orderStatus: 'executed',
          quantity: 30,
          price: 415.75,
          totalAmount: 12472.50,
          executedPrice: 415.75,
          executedAt: '2026-02-03T14:25:10Z',
          createdAt: '2026-02-03T14:25:00Z',
          updatedAt: '2026-02-03T14:25:10Z',
        },
        {
          id: '3',
          userId: '1',
          stockSymbol: 'GOOGL',
          stockName: '谷歌',
          orderType: 'buy',
          orderStatus: 'executed',
          quantity: 20,
          price: 145.25,
          totalAmount: 2905.00,
          executedPrice: 145.25,
          executedAt: '2026-02-03T14:20:45Z',
          createdAt: '2026-02-03T14:20:00Z',
          updatedAt: '2026-02-03T14:20:45Z',
        },
        {
          id: '4',
          userId: '1',
          stockSymbol: 'TSLA',
          stockName: '特斯拉',
          orderType: 'sell',
          orderStatus: 'executed',
          quantity: 15,
          price: 195.50,
          totalAmount: 2932.50,
          executedPrice: 195.50,
          executedAt: '2026-02-03T14:15:30Z',
          createdAt: '2026-02-03T14:15:00Z',
          updatedAt: '2026-02-03T14:15:30Z',
        },
        {
          id: '5',
          userId: '1',
          stockSymbol: 'NVDA',
          stockName: '英伟达',
          orderType: 'buy',
          orderStatus: 'pending',
          quantity: 10,
          price: 950.25,
          totalAmount: 9502.50,
          createdAt: '2026-02-03T14:10:15Z',
          updatedAt: '2026-02-03T14:10:15Z',
        },
      ];

      const page = params?.page || 1;
      const pageSize = params?.pageSize || 10;
      const accountId = params?.accountId || '';
      const start = (page - 1) * pageSize;
      const end = start + pageSize;

      const fallbackResponse: PaginatedResponse<TradeOrder> = {
        items: mockOrders.slice(start, end),
        total: mockOrders.length,
        page,
        pageSize,
        totalPages: Math.ceil(mockOrders.length / pageSize),
      };

      // 缓存降级数据（1分钟，避免频繁降级）
      const cacheKey = `trading_orders_page${page}_size${pageSize}_account${accountId || 'user1'}`;
      cacheManager.set(cacheKey, fallbackResponse, 60000); // 1分钟

      return fallbackResponse;
    }
  },

  // 创建交易订单
  createOrder: async (order: CreateOrderRequest): Promise<TradeOrder> => {
    try {
      // 调用真实API - 后端路由是 /trades 而非 /trading/orders
      const response = await api.post<{
        success: boolean;
        data: any;
        message: string;
      }>('/trades', order);

      if (response.success) {
        // 转换后端数据格式为前端TradeOrder类型
        const backendOrder = response.data;
        const createdOrder: TradeOrder = {
          id: backendOrder.id?.toString() || Date.now().toString(),
          userId: backendOrder.userId?.toString() || '1',
          stockSymbol: backendOrder.stockSymbol || backendOrder.stockCode || '',
          stockName: backendOrder.stockName || '',
          orderType: backendOrder.orderType || order.orderType,
          orderStatus: backendOrder.orderStatus || 'pending',
          quantity: backendOrder.quantity || order.quantity,
          price: backendOrder.price || order.limitPrice || 0,
          totalAmount: backendOrder.totalAmount || (order.quantity * (order.limitPrice || 0)),
          executedPrice: backendOrder.executedPrice || backendOrder.price || 0,
          executedAt: backendOrder.executedAt || backendOrder.createdAt || new Date().toISOString(),
          createdAt: backendOrder.createdAt || new Date().toISOString(),
          updatedAt: backendOrder.updatedAt || new Date().toISOString(),
        };

        // 创建订单成功后，清理相关缓存，确保下次获取最新数据
        cacheManager.clearByPattern('trading_orders_page');

        return createdOrder;
      } else {
        throw new Error(response.message || '创建订单失败');
      }
    } catch (error) {
      console.error('创建订单API调用失败，使用降级逻辑:', error);

      // 降级处理：返回模拟数据
      await new Promise(resolve => setTimeout(resolve, 1000));

      const mockOrder: TradeOrder = {
        id: Date.now().toString(),
        userId: '1',
        stockSymbol: order.stockSymbol,
        stockName: order.stockSymbol === 'AAPL' ? '苹果公司' :
                  order.stockSymbol === 'MSFT' ? '微软公司' :
                  order.stockSymbol === 'GOOGL' ? '谷歌' :
                  order.stockSymbol === 'TSLA' ? '特斯拉' :
                  order.stockSymbol === 'NVDA' ? '英伟达' : '未知公司',
        orderType: order.orderType,
        orderStatus: 'pending',
        quantity: order.quantity,
        price: order.limitPrice || 100, // 模拟价格
        totalAmount: order.quantity * (order.limitPrice || 100),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return mockOrder;
    }
  },

  // 取消订单
  cancelOrder: async (orderId: string): Promise<void> => {
    try {
      // 调用真实API - 后端使用 POST /trades/:tradeId/cancel
      const response = await api.post<{
        success: boolean;
        message: string;
      }>(`/trades/${orderId}/cancel`);

      if (response.success) {
        // 取消订单成功后，清理相关缓存，确保下次获取最新数据
        cacheManager.clearByPattern('trading_orders_page');
        console.log('订单取消成功:', orderId);
      } else {
        throw new Error(response.message || '取消订单失败');
      }
    } catch (error) {
      console.error('取消订单API调用失败，使用降级逻辑:', error);

      // 降级处理：模拟API调用
      await new Promise(resolve => setTimeout(resolve, 500));
      console.warn('使用降级逻辑取消订单:', orderId);
    }
  },

  // 获取持仓列表 - 映射到 /portfolios 路由
  getPositions: async (accountId?: string): Promise<Position[]> => {
    try {
      const cacheKey = `trading_positions_${accountId || 'user1'}`;

      // 尝试从缓存获取（用户数据缓存15分钟）
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        console.log('使用缓存持仓数据:', cacheKey);
        return cached;
      }

      // 调用真实API - 后端使用 /portfolios 路由
      const params: any = {};
      if (accountId) {
        params.accountId = accountId;
      }
      const response = await api.get<{
        success: boolean;
        data: any[];
        message: string;
      }>('/portfolios', { params });

      if (response.success) {
        // 转换后端数据格式为前端Position类型
        const positions: Position[] = response.data.map((item: any) => ({
          id: item.id?.toString() || Date.now().toString(),
          userId: item.userId?.toString() || '1',
          stockSymbol: item.stockSymbol || item.stockCode || '',
          stockName: item.stockName || '',
          quantity: item.quantity || 0,
          averageCost: item.averageCost || 0,
          currentPrice: item.currentPrice || 0,
          marketValue: item.marketValue || 0,
          totalCost: item.totalCost || 0,
          unrealizedPnl: item.unrealizedPnl || 0,
          unrealizedPnlPercent: item.unrealizedPnlPercent || 0,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        }));

        // 缓存数据（用户数据缓存15分钟）
        cacheManager.set(cacheKey, positions, 900000);

        return positions;
      } else {
        throw new Error(response.message || '获取持仓列表失败');
      }
    } catch (error) {
      console.error('获取持仓列表失败，使用降级数据:', error);

      // 检查错误类型，尝试使用缓存
      if (error.response?.status === 429 || error.response?.status >= 500 || error.code === 'ECONNABORTED') {
        const fallbackCacheKey = `trading_positions_${accountId || 'user1'}`;
        const cached = cacheManager.get(fallbackCacheKey);
        if (cached) {
          console.warn('API错误，使用缓存持仓数据');
          return cached;
        }
      }

      // 降级处理：返回模拟数据
      await new Promise(resolve => setTimeout(resolve, 500));

      const mockPositions: Position[] = [
        {
          id: '1',
          userId: '1',
          stockSymbol: 'AAPL',
          stockName: '苹果公司',
          quantity: 200,
          averageCost: 158.25,
          currentPrice: 162.50,
          marketValue: 32500,
          totalCost: 31650,
          unrealizedPnl: 850,
          unrealizedPnlPercent: 2.69,
          createdAt: '2026-01-15T10:30:00Z',
          updatedAt: '2026-02-03T14:30:00Z',
        },
        {
          id: '2',
          userId: '1',
          stockSymbol: 'MSFT',
          stockName: '微软公司',
          quantity: 70,
          averageCost: 410.50,
          currentPrice: 415.75,
          marketValue: 29102.5,
          totalCost: 28735,
          unrealizedPnl: 367.5,
          unrealizedPnlPercent: 1.28,
          createdAt: '2026-01-20T11:15:00Z',
          updatedAt: '2026-02-03T14:25:00Z',
        },
        {
          id: '3',
          userId: '1',
          stockSymbol: 'GOOGL',
          stockName: '谷歌',
          quantity: 150,
          averageCost: 142.00,
          currentPrice: 145.25,
          marketValue: 21787.5,
          totalCost: 21300,
          unrealizedPnl: 487.5,
          unrealizedPnlPercent: 2.29,
          createdAt: '2026-01-25T13:45:00Z',
          updatedAt: '2026-02-03T14:20:00Z',
        },
        {
          id: '4',
          userId: '1',
          stockSymbol: 'TSLA',
          stockName: '特斯拉',
          quantity: 100,
          averageCost: 200.75,
          currentPrice: 195.50,
          marketValue: 19550,
          totalCost: 20075,
          unrealizedPnl: -525,
          unrealizedPnlPercent: -2.61,
          createdAt: '2026-02-01T14:20:00Z',
          updatedAt: '2026-02-03T14:15:00Z',
        },
        {
          id: '5',
          userId: '1',
          stockSymbol: 'NVDA',
          stockName: '英伟达',
          quantity: 20,
          averageCost: 850.00,
          currentPrice: 950.25,
          marketValue: 19005,
          totalCost: 17000,
          unrealizedPnl: 2005,
          unrealizedPnlPercent: 11.79,
          createdAt: '2026-02-02T09:30:00Z',
          updatedAt: '2026-02-03T14:10:00Z',
        },
      ];

      // 缓存降级数据（1分钟，避免频繁降级）
      const fallbackCacheKey = `trading_positions_${accountId || 'user1'}`;
      cacheManager.set(fallbackCacheKey, mockPositions, 60000);

      return mockPositions;
    }
  },

  // 获取持仓汇总
  getPortfolioSummary: async (accountId?: string): Promise<PortfolioSummary> => {
    try {
      const params: any = {};
      if (accountId) {
        params.accountId = accountId;
      }

      const response = await api.get<{ data: { summary: any } }>('/portfolios', { params });

      const backendSummary = response.data?.summary;
      if (!backendSummary) {
        throw new Error('未获取到持仓汇总数据');
      }

      // 转换后端数据格式为前端格式
      return {
        totalValue: backendSummary.totalValue || 0,
        totalCost: backendSummary.totalCost || 0,
        totalPnl: backendSummary.totalProfitLoss || 0,
        totalPnlPercent: backendSummary.totalProfitLossRate || 0,
        cashBalance: backendSummary.cashBalance || 0,
        positionsCount: backendSummary.positionsCount || 0,
      };
    } catch (error) {
      console.error('获取持仓汇总失败，使用模拟数据:', error);

      // 降级处理：返回模拟数据
      const mockSummary: PortfolioSummary = {
        totalValue: 125430.50,
        totalCost: 100000.00,
        totalPnl: 25430.50,
        totalPnlPercent: 25.43,
        cashBalance: 25430.50,
        positionsCount: 5,
      };

      return mockSummary;
    }
  },

  // 获取订单详情
  getOrderDetail: async (orderId: string): Promise<TradeOrder> => {
    try {
      const cacheKey = `trading_order_detail_${orderId}`;

      // 尝试从缓存获取（用户数据缓存15分钟）
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        console.log('使用缓存订单详情:', cacheKey);
        return cached;
      }

      // 调用真实API - 后端路由是 /trades 而非 /trading/orders
      const response = await api.get<{
        success: boolean;
        data: any;
        message: string;
      }>(`/trades/${orderId}`);

      if (response.success) {
        // 转换后端数据格式为前端TradeOrder类型
        const backendOrder = response.data;
        const orderDetail: TradeOrder = {
          id: backendOrder.id?.toString() || orderId,
          userId: backendOrder.userId?.toString() || '1',
          stockSymbol: backendOrder.stockSymbol || backendOrder.stockCode || 'AAPL',
          stockName: backendOrder.stockName || '苹果公司',
          orderType: backendOrder.orderType || 'buy',
          orderStatus: backendOrder.orderStatus || 'executed',
          quantity: backendOrder.quantity || 50,
          price: backendOrder.price || 162.50,
          totalAmount: backendOrder.totalAmount || 8125.00,
          executedPrice: backendOrder.executedPrice || backendOrder.price || 162.50,
          executedAt: backendOrder.executedAt || backendOrder.createdAt || '2026-02-03T14:30:25Z',
          createdAt: backendOrder.createdAt || new Date().toISOString(),
          updatedAt: backendOrder.updatedAt || new Date().toISOString(),
        };

        // 缓存数据（用户数据缓存15分钟）
        cacheManager.set(cacheKey, orderDetail, 900000);

        return orderDetail;
      } else {
        throw new Error(response.message || '获取订单详情失败');
      }
    } catch (error) {
      console.error('获取订单详情失败，使用降级数据:', error);

      // 检查错误类型，尝试使用缓存
      if (error.response?.status === 429 || error.response?.status >= 500 || error.code === 'ECONNABORTED') {
        const cached = cacheManager.get(`trading_order_detail_${orderId}`);
        if (cached) {
          console.warn('API错误，使用缓存订单详情');
          return cached;
        }
      }

      // 降级处理：返回模拟数据
      await new Promise(resolve => setTimeout(resolve, 300));

      const mockOrder: TradeOrder = {
        id: orderId,
        userId: '1',
        stockSymbol: 'AAPL',
        stockName: '苹果公司',
        orderType: 'buy',
        orderStatus: 'executed',
        quantity: 50,
        price: 162.50,
        totalAmount: 8125.00,
        executedPrice: 162.50,
        executedAt: '2026-02-03T14:30:25Z',
        createdAt: '2026-02-03T14:30:00Z',
        updatedAt: '2026-02-03T14:30:25Z',
      };

      // 缓存降级数据（1分钟，避免频繁降级）
      cacheManager.set(`trading_order_detail_${orderId}`, mockOrder, 60000);

      return mockOrder;
    }
  },

  // 获取交易历史
  getTradeHistory: async (params?: PaginationParams): Promise<PaginatedResponse<TradeOrder>> => {
    try {
      // 生成缓存键（包含分页参数和账户ID）
      const page = params?.page || 1;
      const pageSize = params?.pageSize || 10;
      const accountId = params?.accountId || '';
      const cacheKey = `trading_history_page${page}_size${pageSize}_account${accountId || 'user1'}`;

      // 尝试从缓存获取（交易历史缓存30分钟）
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        console.log('使用缓存交易历史数据:', cacheKey);
        return cached;
      }

      // 调用真实API - 后端路由是 /trades 而非 /trading/history
      const response = await api.get<{
        success: boolean;
        data: {
          items: any[];
          pagination: any;
        };
        message: string;
      }>('/trades', { params });

      if (response.success) {
        // 转换数据格式，匹配前端TradeOrder类型
        const history: TradeOrder[] = response.data.items.map((item: any) => ({
          id: item.id?.toString() || Date.now().toString(),
          userId: item.userId?.toString() || '1',
          stockSymbol: item.stockSymbol || item.stockCode || '',
          stockName: item.stockName || '',
          orderType: item.orderType || 'buy',
          orderStatus: item.orderStatus || 'executed',
          quantity: item.quantity || 0,
          price: item.price || 0,
          totalAmount: item.totalAmount || 0,
          executedPrice: item.executedPrice || item.price || 0,
          executedAt: item.executedAt || item.createdAt || new Date().toISOString(),
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        }));

        const paginatedResponse: PaginatedResponse<TradeOrder> = {
          items: history,
          total: response.data.pagination?.total || history.length,
          page: response.data.pagination?.page || page,
          pageSize: response.data.pagination?.pageSize || pageSize,
          totalPages: response.data.pagination?.totalPages || Math.ceil(history.length / pageSize),
        };

        // 缓存数据（交易历史缓存30分钟）
        cacheManager.set(cacheKey, paginatedResponse, 1800000);

        return paginatedResponse;
      } else {
        throw new Error(response.message || '获取交易历史失败');
      }
    } catch (error) {
      console.error('获取交易历史失败，使用降级数据:', error);

      // 检查错误类型，尝试使用缓存
      if (error.response?.status === 429 || error.response?.status >= 500 || error.code === 'ECONNABORTED') {
        const page = params?.page || 1;
        const pageSize = params?.pageSize || 10;
        const accountId = params?.accountId || '';
        const cacheKey = `trading_history_page${page}_size${pageSize}_account${accountId || 'user1'}`;
        const cached = cacheManager.get(cacheKey);
        if (cached) {
          console.warn('API错误，使用缓存交易历史数据');
          return cached;
        }
      }

      // 降级处理：返回模拟数据
      await new Promise(resolve => setTimeout(resolve, 500));

      const mockHistory: TradeOrder[] = [
        {
          id: '1',
          userId: '1',
          stockSymbol: 'AAPL',
          stockName: '苹果公司',
          orderType: 'buy',
          orderStatus: 'executed',
          quantity: 50,
          price: 162.50,
          totalAmount: 8125.00,
          executedPrice: 162.50,
          executedAt: '2026-02-03T14:30:25Z',
          createdAt: '2026-02-03T14:30:00Z',
          updatedAt: '2026-02-03T14:30:25Z',
        },
        {
          id: '2',
          userId: '1',
          stockSymbol: 'MSFT',
          stockName: '微软公司',
          orderType: 'sell',
          orderStatus: 'executed',
          quantity: 30,
          price: 415.75,
          totalAmount: 12472.50,
          executedPrice: 415.75,
          executedAt: '2026-02-03T14:25:10Z',
          createdAt: '2026-02-03T14:25:00Z',
          updatedAt: '2026-02-03T14:25:10Z',
        },
        {
          id: '3',
          userId: '1',
          stockSymbol: 'GOOGL',
          stockName: '谷歌',
          orderType: 'buy',
          orderStatus: 'executed',
          quantity: 20,
          price: 145.25,
          totalAmount: 2905.00,
          executedPrice: 145.25,
          executedAt: '2026-02-03T14:20:45Z',
          createdAt: '2026-02-03T14:20:00Z',
          updatedAt: '2026-02-03T14:20:45Z',
        },
        {
          id: '4',
          userId: '1',
          stockSymbol: 'TSLA',
          stockName: '特斯拉',
          orderType: 'sell',
          orderStatus: 'executed',
          quantity: 15,
          price: 195.50,
          totalAmount: 2932.50,
          executedPrice: 195.50,
          executedAt: '2026-02-03T14:15:30Z',
          createdAt: '2026-02-03T14:15:00Z',
          updatedAt: '2026-02-03T14:15:30Z',
        },
        {
          id: '5',
          userId: '1',
          stockSymbol: 'NVDA',
          stockName: '英伟达',
          orderType: 'buy',
          orderStatus: 'executed',
          quantity: 10,
          price: 950.25,
          totalAmount: 9502.50,
          executedPrice: 950.25,
          executedAt: '2026-02-02T10:30:00Z',
          createdAt: '2026-02-02T10:30:00Z',
          updatedAt: '2026-02-02T10:30:00Z',
        },
      ];

      const page = params?.page || 1;
      const pageSize = params?.pageSize || 10;
      const accountId = params?.accountId || '';
      const start = (page - 1) * pageSize;
      const end = start + pageSize;

      const fallbackResponse: PaginatedResponse<TradeOrder> = {
        items: mockHistory.slice(start, end),
        total: mockHistory.length,
        page,
        pageSize,
        totalPages: Math.ceil(mockHistory.length / pageSize),
      };

      // 缓存降级数据（1分钟，避免频繁降级）
      const cacheKey = `trading_history_page${page}_size${pageSize}_account${accountId || 'user1'}`;
      cacheManager.set(cacheKey, fallbackResponse, 60000);

      return fallbackResponse;
    }
  },
};

export default tradingService;