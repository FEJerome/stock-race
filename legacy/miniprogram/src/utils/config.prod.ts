// 生产环境配置

// API 基础配置 - 生产环境
export const API_BASE_URL = 'https://api.stock-race.example.com/api'
export const AI_SERVICE_URL = 'https://ai.stock-race.example.com/api/v1'
export const DATA_SERVICE_URL = 'https://data.stock-race.example.com'

// 请求超时时间
export const REQUEST_TIMEOUT = 30000

// 缓存时间配置（秒）
export const CACHE_TTL = {
  // 交易时间使用较短的缓存
  MARKET_DATA: 30,        // 行情数据 30秒
  STOCK_QUOTE: 60,        // 个股报价 1分钟
  USER_INFO: 900,         // 用户信息 15分钟
  HOLDINGS: 300,          // 持仓数据 5分钟
  TRADES: 600,            // 交易记录 10分钟
  AI_ACCOUNTS: 300,       // AI账户 5分钟
  AI_DECISIONS: 60,       // AI决策 1分钟
  RANKING: 300,           // 排行榜 5分钟
  // 非交易时间使用较长的缓存
  MARKET_DATA_OFFLINE: 3600,    // 行情数据离线 1小时
  HISTORICAL_DATA: 86400,       // 历史数据 1天
}

// 分页配置
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
}

// 风险等级配置
export const RISK_LEVELS = [
  { value: 'conservative', label: '保守型', color: '#52C41A', desc: '稳健投资，追求保本' },
  { value: 'moderate', label: '稳健型', color: '#1890FF', desc: '平衡风险与收益' },
  { value: 'aggressive', label: '激进型', color: '#FAAD14', desc: '追求高收益，承担高风险' },
]

// AI模型提供商配置
export const MODEL_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek', university: 'DeepSeek大学', color: '#1890FF' },
  { value: 'glm', label: 'GLM', university: '智谱大学', color: '#52C41A' },
  { value: 'claude', label: 'Claude', university: 'Anthropic大学', color: '#722ED1' },
  { value: 'openai', label: 'OpenAI', university: 'OpenAI大学', color: '#10B981' },
  { value: 'qwen', label: '通义千问', university: '阿里大学', color: '#FF6A00' },
]

// AI账户状态配置
export const AI_ACCOUNT_STATUS = {
  active: { label: '启用中', color: '#52C41A', icon: 'checkmark-circle' },
  inactive: { label: '已停用', color: '#8C8C8C', icon: 'pause-circle' },
  deciding: { label: '决策中', color: '#1890FF', icon: 'reload' },
  error: { label: '异常', color: '#FF4D4F', icon: 'close-circle' },
}

// 决策类型配置
export const DECISION_TYPES = {
  buy: { label: '买入', color: '#FF4D4F', icon: 'arrow-up' },
  sell: { label: '卖出', color: '#52C41A', icon: 'arrow-down' },
  hold: { label: '持有', color: '#8C8C8C', icon: 'minus' },
}

// 交易类型配置
export const TRADE_TYPES = {
  buy: { label: '买入', color: '#FF4D4F' },
  sell: { label: '卖出', color: '#52C41A' },
}

// 用户等级头衔
export const USER_TITLES = [
  { minRate: -100, title: '投资新手', icon: '🌱' },
  { minRate: 0, title: '见习经理', icon: '🌿' },
  { minRate: 10, title: '投资主管', icon: '🌲' },
  { minRate: 25, title: '投资经理', icon: '🏆' },
  { minRate: 50, title: '投资总监', icon: '👑' },
  { minRate: 100, title: '传奇大师', icon: '💎' },
]

// A股交易时间配置
export const TRADING_HOURS = {
  MORNING_START: { hour: 9, minute: 30 },
  MORNING_END: { hour: 11, minute: 30 },
  AFTERNOON_START: { hour: 13, minute: 0 },
  AFTERNOON_END: { hour: 15, minute: 0 },
}

// 默认演示账户 - 生产环境禁用
export const DEMO_ACCOUNT = null

// 应用配置
export const APP_CONFIG = {
  // 应用名称
  name: 'Stock-Race AI基金经理',
  // 版本号
  version: '1.0.0',
  // 版本代码
  versionCode: 100,
  // 是否启用日志
  enableLog: false,
  // 是否启用调试
  enableDebug: false,
  // 隐私协议URL
  privacyUrl: 'https://stock-race.example.com/privacy.html',
  // 用户协议URL
  termsUrl: 'https://stock-race.example.com/terms.html',
}
