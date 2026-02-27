/**
 * 通用类型定义
 */

// 基础响应类型
export interface BaseResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: Record<string, any>;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
  message: string;
  meta: {
    timestamp: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// 分页参数
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// 查询参数
export interface QueryParams {
  [key: string]: any;
}

// 用户相关类型
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
}

// 股票相关类型
export interface Stock {
  id: string;
  code: string;
  name: string;
  fullName: string;
  market: 'sh' | 'sz' | 'bj' | 'hk' | 'us';
  industry: string;
  subIndustry?: string;
  listingDate: Date;
  totalShares: number;
  circulatingShares: number;
  status: 'listed' | 'delisted' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

export interface StockQuote {
  stockCode: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  bidAsk?: {
    bid1: { price: number; volume: number };
    bid2: { price: number; volume: number };
    ask1: { price: number; volume: number };
    ask2: { price: number; volume: number };
  };
  timestamp: string;
  marketStatus: 'trading' | 'closed' | 'halted';
  dataSource: 'real' | 'simulated' | 'fallback';
  isFallback: boolean;
}

export interface KlineData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
}

// 交易相关类型
export interface Trade {
  id: string;
  accountId: string;
  stockCode: string;
  tradeType: 'buy' | 'sell';
  quantity: number;
  price: number;
  amount: number;
  fee: number;
  status: 'pending' | 'executed' | 'cancelled' | 'failed';
  executedAt: Date;
  createdAt: Date;
}

export interface TradeOrder {
  accountId: string;
  stockCode: string;
  tradeType: 'buy' | 'sell';
  quantity: number;
  price?: number;
  orderType: 'market' | 'limit' | 'stop';
}

// 持仓相关类型
export interface Portfolio {
  id: string;
  accountId: string;
  stockCode: string;
  quantity: number;
  averageCost: number;
  marketValue: number;
  profitLoss: number;
  profitLossPercent: number;
  createdAt: Date;
  updatedAt: Date;
}

// AI账户相关类型
export interface AIAccount {
  id: string;
  userId: string;
  name: string;
  description?: string;
  aiModel: 'openai' | 'claude' | 'deepseek' | 'custom';
  promptTemplate: string;
  initialBalance: number;
  currentBalance: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  status: 'active' | 'paused' | 'stopped';
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIDecision {
  accountId: string;
  stockCode: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  quantity?: number;
  price?: number;
  reasoning: string;
  riskAssessment: string;
  timestamp: string;
}

// 市场相关类型
export interface MarketStats {
  up: number;
  down: number;
  unchanged: number;
  limitUp: number;
  limitDown: number;
  total: number;
  totalTurnover: number;
  totalMarketCap: number;
  isFallback: boolean;
}

// 技术指标
export interface TechnicalIndicators {
  ma5: number;
  ma10: number;
  ma20: number;
  ma30: number;
  ma60: number;
  rsi: number;
  macd: number;
  kdj_k: number;
  kdj_d: number;
  kdj_j: number;
  boll_upper: number;
  boll_middle: number;
  boll_lower: number;
  isFallback: boolean;
}

// 配置类型
export interface AppConfig {
  server: {
    port: number;
    host: string;
    env: string;
    apiPrefix: string;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    maxConnections: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  externalServices: {
    aiService: {
      url: string;
      apiKey: string;
      timeout: number;
    };
    dataService: {
      url: string;
      apiKey: string;
      timeout: number;
      maxRetries: number;
      retryDelay: number;
    };
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  logging: {
    level: string;
    format: string;
  };
}

// 函数类型
export type AsyncFunction<T = any> = (...args: any[]) => Promise<T>;
export type ControllerFunction = (req: any, res: any, next?: any) => Promise<void> | void;
export type MiddlewareFunction = (req: any, res: any, next: any) => Promise<void> | void;