// 游客模式API类型定义
// 对应架构文档: 005-MINIPROGRAM-GUEST-MODE.md

// ==================== 游客Token相关类型 ====================

// 游客Token请求
export interface GuestTokenRequest {
  code: string        // wx.login获取的code
  deviceId?: string   // 设备指纹（可选，用于增强安全）
}

// 游客Token响应
export interface GuestTokenResponse {
  guestToken: string    // 临时访问令牌
  openid: string        // 匿名标识（后端返回哈希值）
  expiresIn: number     // 过期时间（秒）：86400(24h) 或 259200(72h)
  hasAIAccount: boolean // 是否已创建AI账户
}

// 游客会话信息
export interface GuestSession {
  token: string
  openid: string
  expiresAt: number     // 过期时间戳
  hasAIAccount: boolean
  lastActivityAt: number // 最后活跃时间
}

// ==================== 临时AI账户类型 ====================

// 临时AI账户
export interface GuestAIAccount {
  id: string
  name: string
  avatar?: string
  school?: string
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
  initialCapital: number
  currentAssets: number
  returnRate: number
  returnAmount: number
  tradeCount: number
  createdAt: string
}

// 创建临时AI账户请求
export interface CreateGuestAIAccountRequest {
  name: string
  school?: string
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
  initialCapital: number
  maxDailyDecisions?: number
}

// ==================== AI对话类型 ====================

// 游客AI对话请求
export interface GuestChatRequest {
  message: string
  context?: GuestChatMessage[]  // 上下文（最近几轮对话）
}

// 游客AI对话响应
export interface GuestChatResponse {
  reply: string
  remainingTurns: number  // 剩余对话次数
  confidence?: number
}

// 对话消息
export interface GuestChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// 对话历史
export interface GuestChatHistory {
  accountId: string
  messages: GuestChatMessage[]
  totalTurns: number      // 已使用次数
  maxTurns: number        // 最大次数（默认10）
  remainingTurns: number  // 剩余次数
}

// ==================== 数据绑定类型 ====================

// 游客数据绑定请求（登录后迁移数据）
export interface GuestBindRequest {
  guestToken: string
  userInfo?: {
    nickName?: string
    avatarUrl?: string
  }
}

// 游客数据绑定响应
export interface GuestBindResponse {
  success: boolean
  migratedAccounts: number  // 迁移的AI账户数量
  message: string
}

// ==================== 游客状态类型 ====================

// 游客状态信息（用于UI展示）
export interface GuestStatus {
  isGuest: boolean
  expiresAt: number
  remainingHours: number
  hasAIAccount: boolean
  aiAccountCount: number
  maxAIAccounts: number
  remainingChatTurns: number
  maxChatTurns: number
}

// 游客状态检查响应
export interface GuestStatusCheckResponse {
  isValid: boolean        // token是否有效
  isExpired: boolean      // 是否过期
  hasAIAccount: boolean   // 是否创建过AI账户
  expiresAt: number       // 过期时间戳
  remainingHours: number   // 剩余小时数
}

// 游客初始化结果
export interface GuestInitResult {
  success: boolean
  isNewGuest: boolean      // 是否新游客
  isExpired: boolean      // 是否已过期
  hasAIAccount: boolean  // 是否创建过AI账户
}

// ==================== 游客限制配置 ====================
export const GUEST_LIMITS = {
  // AI账户限制
  MAX_AI_ACCOUNTS: 2,

  // 对话次数限制
  MAX_CHAT_TURNS: 10,

  // Token有效期（秒）
  EXPIRY_PURE_GUEST: 24 * 60 * 60,      // 24小时（未创建AI账户）
  EXPIRY_WITH_AI_ACCOUNT: 72 * 60 * 60, // 72小时（已创建AI账户）

  // 本地存储键
  STORAGE_KEY: 'stock_race_guest_session',
  WELCOME_SHOWN_KEY: 'stock_race_welcome_shown',
}
