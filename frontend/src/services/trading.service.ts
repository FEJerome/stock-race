import { api } from './api';
import {
  TradeOrder,
  CreateOrderRequest,
  Position,
  PortfolioSummary,
  PaginatedResponse,
  PaginationParams,
} from '../types/api.types';

export const tradingService = {
  // 获取交易订单列表
  getOrders: async (params?: PaginationParams): Promise<PaginatedResponse<TradeOrder>> => {
    // 模拟API调用
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
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      items: mockOrders.slice(start, end),
      total: mockOrders.length,
      page,
      pageSize,
      totalPages: Math.ceil(mockOrders.length / pageSize),
    };

    // 实际API调用
    // return api.get<PaginatedResponse<TradeOrder>>('/trading/orders', { params });
  },

  // 创建交易订单
  createOrder: async (order: CreateOrderRequest): Promise<TradeOrder> => {
    // 模拟API调用
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

    // 实际API调用
    // return api.post<TradeOrder>('/trading/orders', order);
  },

  // 取消订单
  cancelOrder: async (orderId: string): Promise<void> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));

    // 实际API调用
    // return api.delete(`/trading/orders/${orderId}`);
  },

  // 获取持仓列表
  getPositions: async (): Promise<Position[]> => {
    // 模拟API调用
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

    return mockPositions;

    // 实际API调用
    // return api.get<Position[]>('/trading/positions');
  },

  // 获取持仓汇总
  getPortfolioSummary: async (): Promise<PortfolioSummary> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 300));

    const mockSummary: PortfolioSummary = {
      totalValue: 125430.50,
      totalCost: 100000.00,
      totalPnl: 25430.50,
      totalPnlPercent: 25.43,
      cashBalance: 25430.50,
      positionsCount: 5,
    };

    return mockSummary;

    // 实际API调用
    // return api.get<PortfolioSummary>('/trading/portfolio/summary');
  },

  // 获取订单详情
  getOrderDetail: async (orderId: string): Promise<TradeOrder> => {
    // 模拟API调用
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

    return mockOrder;

    // 实际API调用
    // return api.get<TradeOrder>(`/trading/orders/${orderId}`);
  },

  // 获取交易历史
  getTradeHistory: async (params?: PaginationParams): Promise<PaginatedResponse<TradeOrder>> => {
    // 模拟API调用
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
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      items: mockHistory.slice(start, end),
      total: mockHistory.length,
      page,
      pageSize,
      totalPages: Math.ceil(mockHistory.length / pageSize),
    };

    // 实际API调用
    // return api.get<PaginatedResponse<TradeOrder>>('/trading/history', { params });
  },
};

export default tradingService;