// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: number;
}

// 分页参数
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// 分页响应
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 用户相关类型
export interface User {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
  expiresIn: number;
}

// 股票相关类型
export interface Stock {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  peRatio?: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
}

// 交易相关类型
export interface TradeOrder {
  id: string;
  userId: string;
  stockSymbol: string;
  stockName: string;
  orderType: 'buy' | 'sell';
  orderStatus: 'pending' | 'executed' | 'cancelled' | 'rejected';
  quantity: number;
  price: number;
  totalAmount: number;
  executedPrice?: number;
  executedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderRequest {
  stockSymbol: string;
  orderType: 'buy' | 'sell';
  quantity: number;
  priceType: 'market' | 'limit';
  limitPrice?: number;
}

// 持仓相关类型
export interface Position {
  id: string;
  userId: string;
  stockSymbol: string;
  stockName: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  marketValue: number;
  totalCost: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPercent: number;
  cashBalance: number;
  positionsCount: number;
}

// AI相关类型
export interface AIAccount {
  id: string;
  userId: string;
  name: string;
  modelType: 'openai' | 'claude' | 'wenxin' | 'qwen';
  apiKey?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AIDecision {
  id: string;
  aiAccountId: string;
  stockSymbol: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reason: string;
  suggestedPrice?: number;
  suggestedQuantity?: number;
  createdAt: string;
}

// 排行榜相关类型
export interface RankingEntry {
  userId: string;
  username: string;
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  rank: number;
  change?: number;
}

// 系统通知类型
export interface Notification {
  id: string;
  userId: string;
  type: 'trade' | 'ai' | 'system' | 'warning';
  title: string;
  message: string;
  read: boolean;
  data?: any;
  createdAt: string;
}