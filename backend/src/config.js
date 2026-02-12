import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 导出环境配置
export const config = {
  // 应用配置
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || '/api',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // 数据库配置
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/stock_race',

  // Redis配置
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisPassword: process.env.REDIS_PASSWORD || '',
  redisDb: parseInt(process.env.REDIS_DB || '0', 10),

  // 会话配置
  sessionTtl: parseInt(process.env.SESSION_TTL || '86400', 10),
  maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER || '5', 10),

  // JWT配置
  jwtSecret: process.env.JWT_SECRET || 'stock-race-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  // 管理员密码
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',

  // API Keys (for external services)
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || 'your-alpha-vantage-api-key',
  tiingoApiKey: process.env.TIINGO_API_KEY || 'your-tiingo-api-key',

  // AI Service Configuration
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  dataServiceUrl: process.env.DATA_SERVICE_URL || 'http://localhost:8001',
  dataServiceApiPrefix: process.env.DATA_SERVICE_API_PREFIX || '/api/v1',
  dataServiceHealthCheckInterval: parseInt(process.env.DATA_SERVICE_HEALTH_CHECK_INTERVAL || '30000', 10),
  dataServiceMaxFallbackDuration: parseInt(process.env.DATA_SERVICE_MAX_FALLBACK_DURATION || '300000', 10),
  dataServiceQualityThreshold: parseFloat(process.env.DATA_SERVICE_QUALITY_THRESHOLD || '0.8'),

  // Frontend URL
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Email Configuration
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || 'your-email@gmail.com',
  smtpPass: process.env.SMTP_PASS || 'your-email-password',

  // Security
  corsOriginList: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
};

// 验证必需的环境变量
export function validateConfig() {
  const required = ['JWT_SECRET', 'DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`警告: 缺少必需的环境变量: ${missing.join(', ')}`);
    console.warn('将使用默认值，可能影响生产环境安全性');
  }

  return missing.length === 0;
}

// 初始化时验证配置
validateConfig();