/**
 * 环境变量类型定义
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // 服务器配置
    NODE_ENV: 'development' | 'production' | 'test';
    PORT: string;
    API_PREFIX: string;
    HOST: string;

    // 数据库配置
    DB_HOST: string;
    DB_PORT: string;
    DB_NAME: string;
    DB_USER: string;
    DB_PASSWORD: string;
    DATABASE_URL: string;

    // Redis配置
    REDIS_HOST: string;
    REDIS_PORT: string;
    REDIS_PASSWORD: string;
    REDIS_DB: string;

    // JWT配置
    JWT_SECRET: string;
    JWT_EXPIRES_IN: string;
    JWT_REFRESH_SECRET: string;
    JWT_REFRESH_EXPIRES_IN: string;

    // 外部服务配置
    AI_SERVICE_URL: string;
    AI_SERVICE_API_KEY: string;
    DATA_SERVICE_URL: string;
    DATA_SERVICE_API_KEY: string;
    DATA_SERVICE_TIMEOUT: string;
    DATA_SERVICE_MAX_RETRIES: string;
    DATA_SERVICE_RETRY_DELAY: string;
    DATA_SERVICE_HEALTH_CHECK_INTERVAL: string;
    DATA_SERVICE_MAX_FALLBACK_DURATION: string;
    DATA_SERVICE_QUALITY_THRESHOLD: string;

    // 第三方API密钥
    OPENAI_API_KEY: string;
    DEEPSEEK_API_KEY: string;
    CLAUDE_API_KEY: string;

    // 应用配置
    APP_NAME: string;
    APP_VERSION: string;
    LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
    CORS_ORIGIN: string;
    RATE_LIMIT_WINDOW_MS: string;
    RATE_LIMIT_MAX_REQUESTS: string;

    // 邮件配置
    SMTP_HOST: string;
    SMTP_PORT: string;
    SMTP_USER: string;
    SMTP_PASSWORD: string;
    EMAIL_FROM: string;

    // 文件上传配置
    UPLOAD_MAX_SIZE: string;
    UPLOAD_ALLOWED_TYPES: string;
    UPLOAD_PATH: string;

    // 监控配置
    SENTRY_DSN: string;
    NEW_RELIC_LICENSE_KEY: string;
    NEW_RELIC_APP_NAME: string;
  }
}