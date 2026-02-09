// AI 相关类型定义

// AI账户（基金经理）
export interface AIAccount {
  id: string
  name: string
  modelProvider: ModelProvider
  modelName: string
  status: AIAccountStatus
  initialBalance: number
  currentBalance: number
  totalProfit: number
  profitRate: number
  riskLevel: RiskLevel
  maxDailyDecisions: number
  todayDecisions: number
  createdAt: string
  updatedAt: string
}

// AI账户状态
export type AIAccountStatus = 'active' | 'inactive' | 'deciding' | 'error'

// 模型提供商
export type ModelProvider = 'deepseek' | 'glm' | 'claude' | 'openai' | 'qwen'

// 风险等级
export type RiskLevel = 'conservative' | 'moderate' | 'aggressive'

// 创建AI账户请求
export interface CreateAIAccountRequest {
  name: string
  modelProvider: ModelProvider
  modelName: string
  initialBalance: number
  riskLevel: RiskLevel
  maxDailyDecisions: number
  apiKey?: string
}

// 更新AI账户请求
export interface UpdateAIAccountRequest {
  name?: string
  riskLevel?: RiskLevel
  maxDailyDecisions?: number
  status?: AIAccountStatus
}

// AI决策
export interface AIDecision {
  id: string
  accountId: string
  accountName: string
  type: DecisionType
  stockCode: string
  stockName: string
  price: number
  quantity: number
  confidence: number
  reason: string
  promptText?: string
  executedAt?: string
  result?: DecisionResult
  createdAt: string
}

// 决策类型
export type DecisionType = 'buy' | 'sell' | 'hold'

// 决策结果
export interface DecisionResult {
  executedPrice: number
  executedQuantity: number
  profit?: number
  status: 'success' | 'failed' | 'pending'
}

// 决策统计
export interface DecisionStats {
  totalDecisions: number
  buyCount: number
  sellCount: number
  holdCount: number
  successRate: number
  avgConfidence: number
}

// 基金经理表现
export interface ManagerPerformance {
  accountId: string
  accountName: string
  totalReturn: number
  returnRate: number
  sharpeRatio: number
  maxDrawdown: number
  winRate: number
  tradeCount: number
}
