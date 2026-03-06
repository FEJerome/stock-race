// 交易相关类型定义

// 持仓
export interface Holding {
  id: string
  stockCode: string
  stockName: string
  quantity: number
  avgCost: number
  currentPrice: number
  marketValue: number
  profit: number
  profitRate: number
  accountId?: string
  accountName?: string
  updatedAt: string
}

// 交易记录
export interface Trade {
  id: string
  stockCode: string
  stockName: string
  type: TradeType
  price: number
  quantity: number
  amount: number
  fee: number
  accountId?: string
  accountName?: string
  decisionId?: string
  createdAt: string
}

// 交易类型
export type TradeType = 'buy' | 'sell'

// 投资组合概览
export interface PortfolioOverview {
  totalAssets: number
  cashBalance: number
  holdingsValue: number
  totalProfit: number
  profitRate: number
  todayProfit: number
  todayProfitRate: number
  holdingCount: number
}

// 资产分布
export interface AssetDistribution {
  cash: number
  stocks: number
  cashRatio: number
  stockRatio: number
}

// 持仓分布（按行业/股票）
export interface HoldingDistribution {
  name: string
  value: number
  ratio: number
}

// 交易筛选条件
export interface TradeFilter {
  startDate?: string
  endDate?: string
  type?: TradeType
  accountId?: string
  stockCode?: string
}

// 收益曲线数据点
export interface ProfitPoint {
  date: string
  value: number
  profit: number
  profitRate: number
}

// 收益统计
export interface ProfitStats {
  dailyProfits: ProfitPoint[]
  weeklyProfits: ProfitPoint[]
  monthlyProfits: ProfitPoint[]
  maxProfit: number
  maxLoss: number
  avgDailyReturn: number
  volatility: number
}
