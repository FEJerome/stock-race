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
  code: string;           // 股票代码，如 "000001"
  name: string;           // 股票名称
  market: string;         // 市场代码，如 "sh", "sz"
  industry?: string;      // 行业
  currentPrice: number;   // 当前价格
  change: number;         // 涨跌额
  changePercent: number;  // 涨跌幅
  volume: number;         // 成交量
  amount: number;         // 成交额
  peRatio?: number;       // 市盈率
  pbRatio?: number;       // 市净率
  marketCap?: number;     // 总市值
  circulatingMarketCap?: number; // 流通市值
  timestamp: string;      // 数据时间戳
  isFallback?: boolean;   // 是否为降级数据
  // 兼容旧字段
  symbol?: string;        // 兼容字段，等同于code
  high?: number;          // 最高价
  low?: number;           // 最低价
  open?: number;          // 开盘价
  previousClose?: number; // 前收盘价
  // 后端API返回字段兼容
  stockCode?: string;     // 兼容后端stockCode字段
  stockName?: string;     // 兼容后端stockName字段
  price?: number;         // 兼容后端price字段
  prevClose?: number;     // 兼容后端prevClose字段
}

// 实时行情数据
export interface RealtimeStockData {
  stockCode: string;
  stockName: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  timestamp: string;
  bidAsk?: {
    bidPrice: number;
    bidVolume: number;
    askPrice: number;
    askVolume: number;
  };
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
  marketStatus?: string;
  isFallback: boolean;
}

export interface StockSearchResult {
  code: string;      // 股票代码
  name: string;      // 股票名称
  market?: string;   // 市场代码
  industry?: string; // 行业
  // 兼容旧字段
  symbol?: string;   // 兼容字段，等同于code
  exchange?: string; // 兼容字段，等同于market
  type?: string;     // 兼容字段，等同于industry
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