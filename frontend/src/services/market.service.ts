import { api } from './api';
import {
  Stock,
  StockSearchResult,
  PaginatedResponse,
  PaginationParams,
} from '../types/api.types';

export const marketService = {
  // 获取股票行情
  getStockQuotes: async (symbols?: string[]): Promise<Stock[]> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 300));

    const mockStocks: Stock[] = [
      {
        symbol: 'AAPL',
        name: '苹果公司',
        currentPrice: 162.50,
        change: 1.25,
        changePercent: 0.78,
        volume: 45200000,
        marketCap: 2540000000000,
        peRatio: 28.5,
        high: 163.25,
        low: 161.75,
        open: 162.00,
        previousClose: 161.25,
        timestamp: new Date().toISOString(),
      },
      {
        symbol: 'MSFT',
        name: '微软公司',
        currentPrice: 415.75,
        change: -2.25,
        changePercent: -0.54,
        volume: 28500000,
        marketCap: 3090000000000,
        peRatio: 35.2,
        high: 418.50,
        low: 414.25,
        open: 416.50,
        previousClose: 418.00,
        timestamp: new Date().toISOString(),
      },
      {
        symbol: 'GOOGL',
        name: '谷歌',
        currentPrice: 145.25,
        change: 0.75,
        changePercent: 0.52,
        volume: 18500000,
        marketCap: 1820000000000,
        peRatio: 24.8,
        high: 146.00,
        low: 144.50,
        open: 145.00,
        previousClose: 144.50,
        timestamp: new Date().toISOString(),
      },
      {
        symbol: 'AMZN',
        name: '亚马逊',
        currentPrice: 178.50,
        change: 3.25,
        changePercent: 1.86,
        volume: 42500000,
        marketCap: 1840000000000,
        peRatio: 58.3,
        high: 179.25,
        low: 177.00,
        open: 177.50,
        previousClose: 175.25,
        timestamp: new Date().toISOString(),
      },
      {
        symbol: 'TSLA',
        name: '特斯拉',
        currentPrice: 195.50,
        change: -5.25,
        changePercent: -2.61,
        volume: 125000000,
        marketCap: 620000000000,
        peRatio: 65.8,
        high: 198.75,
        low: 194.25,
        open: 197.50,
        previousClose: 200.75,
        timestamp: new Date().toISOString(),
      },
      {
        symbol: 'NVDA',
        name: '英伟达',
        currentPrice: 950.25,
        change: 25.50,
        changePercent: 2.76,
        volume: 85000000,
        marketCap: 2370000000000,
        peRatio: 72.4,
        high: 955.00,
        low: 945.50,
        open: 948.00,
        previousClose: 924.75,
        timestamp: new Date().toISOString(),
      },
      {
        symbol: 'META',
        name: 'Meta',
        currentPrice: 485.75,
        change: 8.25,
        changePercent: 1.73,
        volume: 18500000,
        marketCap: 1240000000000,
        peRatio: 32.1,
        high: 488.50,
        low: 483.25,
        open: 484.00,
        previousClose: 477.50,
        timestamp: new Date().toISOString(),
      },
      {
        symbol: 'BABA',
        name: '阿里巴巴',
        currentPrice: 78.25,
        change: -0.75,
        changePercent: -0.95,
        volume: 28500000,
        marketCap: 198000000000,
        peRatio: 18.5,
        high: 79.50,
        low: 77.75,
        open: 78.50,
        previousClose: 79.00,
        timestamp: new Date().toISOString(),
      },
    ];

    if (symbols && symbols.length > 0) {
      return mockStocks.filter(stock => symbols.includes(stock.symbol));
    }

    return mockStocks;

    // 实际API调用
    // const params = symbols ? { symbols: symbols.join(',') } : undefined;
    // return api.get<Stock[]>('/market/quotes', { params });
  },

  // 搜索股票
  searchStocks: async (query: string): Promise<StockSearchResult[]> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 200));

    const mockResults: StockSearchResult[] = [
      { symbol: 'AAPL', name: '苹果公司', exchange: 'NASDAQ', type: '科技' },
      { symbol: 'MSFT', name: '微软公司', exchange: 'NASDAQ', type: '科技' },
      { symbol: 'GOOGL', name: '谷歌', exchange: 'NASDAQ', type: '科技' },
      { symbol: 'AMZN', name: '亚马逊', exchange: 'NASDAQ', type: '电商' },
      { symbol: 'TSLA', name: '特斯拉', exchange: 'NASDAQ', type: '汽车' },
      { symbol: 'NVDA', name: '英伟达', exchange: 'NASDAQ', type: '半导体' },
      { symbol: 'META', name: 'Meta', exchange: 'NASDAQ', type: '社交' },
      { symbol: 'BABA', name: '阿里巴巴', exchange: 'NYSE', type: '电商' },
      { symbol: 'TSM', name: '台积电', exchange: 'NYSE', type: '半导体' },
      { symbol: 'JPM', name: '摩根大通', exchange: 'NYSE', type: '金融' },
    ];

    const filteredResults = mockResults.filter(
      stock =>
        stock.symbol.toLowerCase().includes(query.toLowerCase()) ||
        stock.name.toLowerCase().includes(query.toLowerCase())
    );

    return filteredResults.slice(0, 10); // 限制返回10条结果

    // 实际API调用
    // return api.get<StockSearchResult[]>('/market/search', { params: { q: query } });
  },

  // 获取股票详情
  getStockDetail: async (symbol: string): Promise<Stock> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 300));

    const mockStock: Stock = {
      symbol,
      name: symbol === 'AAPL' ? '苹果公司' :
            symbol === 'MSFT' ? '微软公司' :
            symbol === 'GOOGL' ? '谷歌' :
            symbol === 'TSLA' ? '特斯拉' :
            symbol === 'NVDA' ? '英伟达' : '未知公司',
      currentPrice: 100 + Math.random() * 100,
      change: (Math.random() - 0.5) * 5,
      changePercent: (Math.random() - 0.5) * 3,
      volume: 10000000 + Math.random() * 50000000,
      marketCap: 100000000000 + Math.random() * 900000000000,
      peRatio: 10 + Math.random() * 40,
      high: 105 + Math.random() * 10,
      low: 95 + Math.random() * 5,
      open: 100 + Math.random() * 5,
      previousClose: 99 + Math.random() * 3,
      timestamp: new Date().toISOString(),
    };

    return mockStock;

    // 实际API调用
    // return api.get<Stock>(`/market/stocks/${symbol}`);
  },

  // 获取热门股票
  getHotStocks: async (): Promise<Stock[]> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 200));

    const mockHotStocks: Stock[] = [
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
      {
        symbol: 'NVDA',
        name: '英伟达',
        currentPrice: 950.25,
        change: 25.50,
        changePercent: 2.76,
        volume: 85000000,
        timestamp: new Date().toISOString(),
        high: 955.00,
        low: 945.50,
        open: 948.00,
        previousClose: 924.75,
      },
      {
        symbol: 'META',
        name: 'Meta',
        currentPrice: 485.75,
        change: 8.25,
        changePercent: 1.73,
        volume: 18500000,
        timestamp: new Date().toISOString(),
        high: 488.50,
        low: 483.25,
        open: 484.00,
        previousClose: 477.50,
      },
    ];

    return mockHotStocks;

    // 实际API调用
    // return api.get<Stock[]>('/market/hot');
  },

  // 获取股票历史数据
  getStockHistory: async (
    symbol: string,
    period: string = '1d',
    interval: string = '1m'
  ): Promise<any[]> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500));

    // 生成模拟历史数据
    const historyData = [];
    const now = new Date();
    const basePrice = 100 + Math.random() * 100;

    for (let i = 0; i < 100; i++) {
      const time = new Date(now.getTime() - i * 60000); // 每分钟一个数据点
      const price = basePrice + (Math.random() - 0.5) * 5;

      historyData.push({
        time: time.toISOString(),
        open: price - Math.random() * 0.5,
        high: price + Math.random() * 0.5,
        low: price - Math.random() * 0.5,
        close: price,
        volume: 1000000 + Math.random() * 5000000,
      });
    }

    return historyData.reverse(); // 按时间升序排列

    // 实际API调用
    // return api.get<any[]>(`/market/stocks/${symbol}/history`, {
    //   params: { period, interval },
    // });
  },

  // 获取市场指数
  getMarketIndices: async (): Promise<any[]> => {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 300));

    const mockIndices = [
      {
        symbol: '^GSPC',
        name: '标普500',
        price: 4958.61,
        change: 12.46,
        changePercent: 0.25,
      },
      {
        symbol: '^DJI',
        name: '道琼斯',
        price: 38467.31,
        change: 134.58,
        changePercent: 0.35,
      },
      {
        symbol: '^IXIC',
        name: '纳斯达克',
        price: 15509.90,
        change: 38.78,
        changePercent: 0.25,
      },
      {
        symbol: '000001.SS',
        name: '上证指数',
        price: 3245.35,
        change: 15.68,
        changePercent: 0.49,
      },
      {
        symbol: '399001.SZ',
        name: '深证成指',
        price: 11012.19,
        change: 28.91,
        changePercent: 0.26,
      },
    ];

    return mockIndices;

    // 实际API调用
    // return api.get<any[]>('/market/indices');
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

    return {
      items: mockStocks.slice(start, end),
      total: mockStocks.length,
      page,
      pageSize,
      totalPages: Math.ceil(mockStocks.length / pageSize),
    };

    // 实际API调用
    // return api.get<PaginatedResponse<Stock>>('/market/stocks', { params });
  },
};

export default marketService;