import { api } from './api';
import {
  Stock,
  StockSearchResult,
  PaginatedResponse,
  PaginationParams,
} from '../types/api.types';

export const marketService = {
  // 获取股票行情 - 使用真实API
  getStockQuotes: async (symbols?: string[]): Promise<Stock[]> => {
    try {
      // 如果有指定股票代码，使用批量查询
      if (symbols && symbols.length > 0) {
        // 批量获取实时数据
        const response = await api.post<Stock[]>('/stocks/realtime/batch', {
          stockCodes: symbols
        });

        // 转换数据格式
        return response.map(stock => ({
          code: stock.stockCode || stock.code,
          name: stock.stockName || stock.name,
          market: stock.market || 'sh',
          currentPrice: stock.price || stock.currentPrice || 0,
          change: stock.change || 0,
          changePercent: stock.changePercent || 0,
          volume: stock.volume || 0,
          amount: stock.amount || 0,
          timestamp: stock.timestamp || new Date().toISOString(),
          isFallback: stock.isFallback || false,
          // 兼容字段
          symbol: stock.stockCode || stock.code,
          high: stock.high || 0,
          low: stock.low || 0,
          open: stock.open || 0,
          previousClose: stock.prevClose || 0
        }));
      }

      // 获取股票列表（默认获取前50只）
      const response = await api.get<{ stocks: Stock[]; pagination: any }>('/stocks', {
        params: { page: 1, limit: 50 }
      });

      return response.stocks.map(stock => ({
        ...stock,
        // 确保兼容字段
        symbol: stock.code,
        currentPrice: stock.currentPrice || 0,
        change: stock.change || 0,
        changePercent: stock.changePercent || 0,
        timestamp: stock.timestamp || new Date().toISOString()
      }));
    } catch (error) {
      console.error('获取股票行情失败:', error);
      // 降级处理：返回模拟数据
      return getFallbackStocks(symbols);
    }
  },

  // 搜索股票 - 使用真实API
  searchStocks: async (query: string): Promise<StockSearchResult[]> => {
    try {
      if (!query || query.trim().length < 2) {
        return [];
      }

      const response = await api.get<{ stocks: StockSearchResult[]; count: number; searchTerm: string }>('/stocks/search', {
        params: { q: query.trim(), limit: 10 }
      });

      return response.stocks.map(stock => ({
        code: stock.code,
        name: stock.name,
        market: stock.market,
        industry: stock.industry,
        // 兼容字段
        symbol: stock.code,
        exchange: stock.market,
        type: stock.industry
      }));
    } catch (error) {
      console.error('搜索股票失败:', error);
      // 降级处理：返回模拟数据
      return getFallbackSearchResults(query);
    }
  },

  // 获取股票详情 - 使用真实API
  getStockDetail: async (symbol: string): Promise<Stock> => {
    try {
      const response = await api.get<{ stock: any }>(`/stocks/${symbol}`);

      const stock = response.stock;
      const realtime = stock.realtime || {};

      return {
        code: stock.code,
        name: stock.name,
        market: stock.market,
        industry: stock.industry,
        currentPrice: realtime.price || 0,
        change: realtime.change || 0,
        changePercent: realtime.changePercent || 0,
        volume: realtime.volume || 0,
        amount: realtime.amount || 0,
        peRatio: stock.peRatio || 0,
        pbRatio: stock.pbRatio || 0,
        marketCap: stock.marketCap || 0,
        circulatingMarketCap: stock.circulatingMarketCap || 0,
        timestamp: realtime.timestamp || new Date().toISOString(),
        isFallback: realtime.isFallback || false,
        // 兼容字段
        symbol: stock.code,
        high: realtime.high || 0,
        low: realtime.low || 0,
        open: realtime.open || 0,
        previousClose: realtime.prevClose || 0
      };
    } catch (error) {
      console.error('获取股票详情失败:', error);
      // 降级处理：返回模拟数据
      return getFallbackStockDetail(symbol);
    }
  },

  // 获取热门股票 - 使用真实API（获取涨跌幅排行榜）
  getHotStocks: async (): Promise<Stock[]> => {
    try {
      const response = await api.get<{ rankings: Stock[] }>('/stocks/rankings', {
        params: {
          sortBy: 'changePercent',
          order: 'desc',
          limit: 10
        }
      });

      return response.rankings.map(stock => ({
        ...stock,
        // 确保兼容字段
        symbol: stock.code,
        currentPrice: stock.currentPrice || 0,
        change: stock.change || 0,
        changePercent: stock.changePercent || 0,
        timestamp: stock.timestamp || new Date().toISOString()
      }));
    } catch (error) {
      console.error('获取热门股票失败:', error);
      // 降级处理：返回模拟数据
      return getFallbackHotStocks();
    }
  },

  // 获取股票历史数据 - 使用真实API
  getStockHistory: async (
    symbol: string,
    period: string = '1d',
    interval: string = '1m'
  ): Promise<any[]> => {
    try {
      // 将period转换为limit参数
      let limit = 100;
      if (period === '1w') limit = 7;
      if (period === '1m') limit = 30;
      if (period === '3m') limit = 90;
      if (period === '1y') limit = 365;

      const response = await api.get<{ kline: any[] }>(`/stocks/${symbol}/kline`, {
        params: {
          interval: interval === '1m' ? '1d' : interval, // 后端可能不支持1分钟线
          limit
        }
      });

      return response.kline || [];
    } catch (error) {
      console.error('获取股票历史数据失败:', error);
      // 降级处理：返回模拟数据
      return getFallbackStockHistory(symbol, period, interval);
    }
  },

  // 获取市场指数 - 使用真实API（获取中国A股指数）
  getMarketIndices: async (): Promise<any[]> => {
    try {
      // 获取主要A股指数
      const indices = [
        { code: '000001', name: '上证指数', market: 'sh' },
        { code: '399001', name: '深证成指', market: 'sz' },
        { code: '399006', name: '创业板指', market: 'sz' },
        { code: '000300', name: '沪深300', market: 'sh' },
        { code: '000905', name: '中证500', market: 'sh' }
      ];

      // 批量获取实时数据
      const stockCodes = indices.map(index => index.code);
      const response = await api.post<any[]>('/stocks/realtime/batch', {
        stockCodes
      });

      return indices.map((index, i) => {
        const realtime = response[i] || {};
        return {
          symbol: index.code,
          name: index.name,
          price: realtime.price || 0,
          change: realtime.change || 0,
          changePercent: realtime.changePercent || 0,
          market: index.market,
          isFallback: realtime.isFallback || false
        };
      });
    } catch (error) {
      console.error('获取市场指数失败:', error);
      // 降级处理：返回模拟数据
      return getFallbackMarketIndices();
    }
  },

  // 获取股票列表（分页）
  getStockList: async (params?: PaginationParams): Promise<PaginatedResponse<Stock>> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockStocks: Stock[] = [
      {
        symbol: 'AAPL',
        name: '苹果公司',
        currentPrice: 162.50,
        change: 1.25,
        changePercent: 0.78,
        volume: 45200000,
        timestamp: new Date().toISOString(),
        high: 163.25,
        low: 161.75,
        open: 162.00,
        previousClose: 161.25,
      },
      {
        symbol: 'MSFT',
        name: '微软公司',
        currentPrice: 415.75,
        change: -2.25,
        changePercent: -0.54,
        volume: 28500000,
        timestamp: new Date().toISOString(),
        high: 418.50,
        low: 414.25,
        open: 416.50,
        previousClose: 418.00,
      },
      {
        symbol: 'GOOGL',
        name: '谷歌',
        currentPrice: 145.25,
        change: 0.75,
        changePercent: 0.52,
        volume: 18500000,
        timestamp: new Date().toISOString(),
        high: 146.00,
        low: 144.50,
        open: 145.00,
        previousClose: 144.50,
      },
      {
        symbol: 'AMZN',
        name: '亚马逊',
        currentPrice: 178.50,
        change: 3.25,
        changePercent: 1.86,
        volume: 42500000,
        timestamp: new Date().toISOString(),
        high: 179.25,
        low: 177.00,
        open: 177.50,
        previousClose: 175.25,
      },
      {
        symbol: 'TSLA',
        name: '特斯拉',
        currentPrice: 195.50,
        change: -5.25,
        changePercent: -2.61,
        volume: 125000000,
        timestamp: new Date().toISOString(),
        high: 198.75,
        low: 194.25,
        open: 197.50,
        previousClose: 200.75,
      },
    ];

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 10;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    try {
      const response = await api.get<{ stocks: Stock[]; pagination: any }>('/stocks', {
        params: {
          page: params?.page || 1,
          limit: params?.pageSize || 10,
          market: params?.sortBy === 'market' ? undefined : params?.sortBy,
          search: params?.sortOrder // 这里sortOrder被误用为搜索词，需要调整
        }
      });

      return {
        items: response.stocks.map(stock => ({
          ...stock,
          // 确保兼容字段
          symbol: stock.code,
          currentPrice: stock.currentPrice || 0,
          change: stock.change || 0,
          changePercent: stock.changePercent || 0,
          timestamp: stock.timestamp || new Date().toISOString()
        })),
        total: response.pagination?.total || response.stocks.length,
        page: response.pagination?.page || (params?.page || 1),
        pageSize: response.pagination?.limit || (params?.pageSize || 10),
        totalPages: response.pagination?.pages || 1,
      };
    } catch (error) {
      console.error('获取股票列表失败:', error);
      // 降级处理：返回模拟数据
      return getFallbackStockList(params);
    }
  },
};

// ==================== 降级处理函数 ====================

// 降级处理：获取股票行情
function getFallbackStocks(symbols?: string[]): Stock[] {
  console.warn('使用降级数据：股票行情');

  const fallbackStocks: Stock[] = [
    {
      code: '000001',
      name: '平安银行',
      market: 'sz',
      industry: '银行',
      currentPrice: 16.50,
      change: 0.25,
      changePercent: 1.54,
      volume: 45200000,
      amount: 745800000,
      peRatio: 8.5,
      pbRatio: 0.85,
      marketCap: 320000000000,
      circulatingMarketCap: 280000000000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '000001'
    },
    {
      code: '600000',
      name: '浦发银行',
      market: 'sh',
      industry: '银行',
      currentPrice: 8.20,
      change: -0.05,
      changePercent: -0.61,
      volume: 28500000,
      amount: 233700000,
      peRatio: 7.2,
      pbRatio: 0.72,
      marketCap: 240000000000,
      circulatingMarketCap: 210000000000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '600000'
    },
    {
      code: '000002',
      name: '万科A',
      market: 'sz',
      industry: '房地产',
      currentPrice: 12.35,
      change: 0.15,
      changePercent: 1.23,
      volume: 18500000,
      amount: 228475000,
      peRatio: 15.8,
      pbRatio: 1.25,
      marketCap: 145000000000,
      circulatingMarketCap: 130000000000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '000002'
    },
    {
      code: '600036',
      name: '招商银行',
      market: 'sh',
      industry: '银行',
      currentPrice: 35.80,
      change: 0.45,
      changePercent: 1.27,
      volume: 42500000,
      amount: 1521500000,
      peRatio: 9.2,
      pbRatio: 1.35,
      marketCap: 900000000000,
      circulatingMarketCap: 780000000000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '600036'
    },
    {
      code: '000858',
      name: '五粮液',
      market: 'sz',
      industry: '食品饮料',
      currentPrice: 195.50,
      change: -2.25,
      changePercent: -1.14,
      volume: 12500000,
      amount: 2443750000,
      peRatio: 28.5,
      pbRatio: 8.2,
      marketCap: 760000000000,
      circulatingMarketCap: 680000000000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '000858'
    },
  ];

  if (symbols && symbols.length > 0) {
    return fallbackStocks.filter(stock => symbols.includes(stock.code));
  }

  return fallbackStocks;
}

// 降级处理：搜索股票
function getFallbackSearchResults(query: string): StockSearchResult[] {
  console.warn('使用降级数据：搜索股票');

  const fallbackResults: StockSearchResult[] = [
    { code: '000001', name: '平安银行', market: 'sz', industry: '银行' },
    { code: '600000', name: '浦发银行', market: 'sh', industry: '银行' },
    { code: '000002', name: '万科A', market: 'sz', industry: '房地产' },
    { code: '600036', name: '招商银行', market: 'sh', industry: '银行' },
    { code: '000858', name: '五粮液', market: 'sz', industry: '食品饮料' },
    { code: '000333', name: '美的集团', market: 'sz', industry: '家电' },
    { code: '600519', name: '贵州茅台', market: 'sh', industry: '食品饮料' },
    { code: '000651', name: '格力电器', market: 'sz', industry: '家电' },
    { code: '002415', name: '海康威视', market: 'sz', industry: '电子' },
    { code: '300750', name: '宁德时代', market: 'sz', industry: '电力设备' },
  ];

  const filtered = fallbackResults.filter(
    stock =>
      stock.code.includes(query) ||
      stock.name.toLowerCase().includes(query.toLowerCase())
  );

  return filtered.slice(0, 10);
}

// 降级处理：获取股票详情
function getFallbackStockDetail(symbol: string): Stock {
  console.warn('使用降级数据：股票详情');

  const stockMap: Record<string, Stock> = {
    '000001': {
      code: '000001',
      name: '平安银行',
      market: 'sz',
      industry: '银行',
      currentPrice: 16.50,
      change: 0.25,
      changePercent: 1.54,
      volume: 45200000,
      amount: 745800000,
      peRatio: 8.5,
      pbRatio: 0.85,
      marketCap: 320000000000,
      circulatingMarketCap: 280000000000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '000001'
    },
    '600000': {
      code: '600000',
      name: '浦发银行',
      market: 'sh',
      industry: '银行',
      currentPrice: 8.20,
      change: -0.05,
      changePercent: -0.61,
      volume: 28500000,
      amount: 233700000,
      peRatio: 7.2,
      pbRatio: 0.72,
      marketCap: 240000000000,
      circulatingMarketCap: 210000000000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '600000'
    },
    '000002': {
      code: '000002',
      name: '万科A',
      market: 'sz',
      industry: '房地产',
      currentPrice: 12.35,
      change: 0.15,
      changePercent: 1.23,
      volume: 18500000,
      amount: 228475000,
      peRatio: 15.8,
      pbRatio: 1.25,
      marketCap: 145000000000,
      circulatingMarketCap: 130000000000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '000002'
    },
  };

  return stockMap[symbol] || {
    code: symbol,
    name: '未知股票',
    market: 'sh',
    currentPrice: 0,
    change: 0,
    changePercent: 0,
    volume: 0,
    amount: 0,
    timestamp: new Date().toISOString(),
    isFallback: true,
    symbol: symbol
  };
}

// 降级处理：获取热门股票
function getFallbackHotStocks(): Stock[] {
  console.warn('使用降级数据：热门股票');

  return [
    {
      code: '000001',
      name: '平安银行',
      market: 'sz',
      industry: '银行',
      currentPrice: 16.50,
      change: 0.25,
      changePercent: 1.54,
      volume: 45200000,
      amount: 745800000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '000001'
    },
    {
      code: '600036',
      name: '招商银行',
      market: 'sh',
      industry: '银行',
      currentPrice: 35.80,
      change: 0.45,
      changePercent: 1.27,
      volume: 42500000,
      amount: 1521500000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '600036'
    },
    {
      code: '000858',
      name: '五粮液',
      market: 'sz',
      industry: '食品饮料',
      currentPrice: 195.50,
      change: -2.25,
      changePercent: -1.14,
      volume: 12500000,
      amount: 2443750000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '000858'
    },
    {
      code: '600519',
      name: '贵州茅台',
      market: 'sh',
      industry: '食品饮料',
      currentPrice: 1850.00,
      change: 15.00,
      changePercent: 0.82,
      volume: 850000,
      amount: 1572500000,
      timestamp: new Date().toISOString(),
      isFallback: true,
      symbol: '600519'
    },
  ];
}

// 降级处理：获取股票历史数据
function getFallbackStockHistory(symbol: string, period: string = '1d', interval: string = '1m'): any[] {
  console.warn('使用降级数据：股票历史数据');

  const historyData = [];
  const now = new Date();
  const basePrice = 10 + Math.random() * 20;
  let dataPoints = 100;

  if (period === '1w') dataPoints = 7;
  if (period === '1m') dataPoints = 30;
  if (period === '3m') dataPoints = 90;
  if (period === '1y') dataPoints = 365;

  for (let i = 0; i < dataPoints; i++) {
    const time = new Date(now.getTime() - i * 24 * 60 * 60 * 1000); // 每天一个数据点
    const price = basePrice + (Math.random() - 0.5) * 2;

    historyData.push({
      time: time.toISOString(),
      open: price - Math.random() * 0.5,
      high: price + Math.random() * 0.5,
      low: price - Math.random() * 0.5,
      close: price,
      volume: 1000000 + Math.random() * 5000000,
    });
  }

  return historyData.reverse();
}

// 降级处理：获取市场指数
function getFallbackMarketIndices(): any[] {
  console.warn('使用降级数据：市场指数');

  return [
    {
      symbol: '000001',
      name: '上证指数',
      price: 3245.35,
      change: 15.68,
      changePercent: 0.49,
      market: 'sh',
      isFallback: true
    },
    {
      symbol: '399001',
      name: '深证成指',
      price: 11012.19,
      change: 28.91,
      changePercent: 0.26,
      market: 'sz',
      isFallback: true
    },
    {
      symbol: '399006',
      name: '创业板指',
      price: 2256.38,
      change: 12.45,
      changePercent: 0.55,
      market: 'sz',
      isFallback: true
    },
    {
      symbol: '000300',
      name: '沪深300',
      price: 3856.72,
      change: 18.34,
      changePercent: 0.48,
      market: 'sh',
      isFallback: true
    },
  ];
}

// 降级处理：获取股票列表
function getFallbackStockList(params?: PaginationParams): PaginatedResponse<Stock> {
  console.warn('使用降级数据：股票列表');

  const fallbackStocks = getFallbackStocks();
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 10;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: fallbackStocks.slice(start, end),
    total: fallbackStocks.length,
    page,
    pageSize,
    totalPages: Math.ceil(fallbackStocks.length / pageSize),
  };
}

export default marketService;