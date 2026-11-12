"""
Configuration settings for AI Service.
"""

import os
from typing import List, Optional
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    """
    Application settings.
    """
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 8000))
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"

    # CORS
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:3000")

    # Database
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", 5432))
    DB_NAME: str = os.getenv("DB_NAME", "stock_race")
    DB_USER: str = os.getenv("DB_USER", "postgres")
    # 数据库密码不设弱口令默认值；缺失为 None，连接时必须显式提供。
    DB_PASSWORD: Optional[str] = os.getenv("DB_PASSWORD")

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # AI Providers
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
    DEEPSEEK_API_KEY: Optional[str] = os.getenv("DEEPSEEK_API_KEY")
    QWEN_API_KEY: Optional[str] = os.getenv("QWEN_API_KEY")

    # Rate limiting
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", 100))
    RATE_LIMIT_PERIOD: int = int(os.getenv("RATE_LIMIT_PERIOD", 60))  # seconds

    # Trading parameters
    MAX_POSITION_SIZE: float = float(os.getenv("MAX_POSITION_SIZE", 100000.0))
    MIN_TRADE_AMOUNT: float = float(os.getenv("MIN_TRADE_AMOUNT", 1000.0))
    DEFAULT_TRADING_FEE: float = float(os.getenv("DEFAULT_TRADING_FEE", 0.001))  # 0.1%

    # Backend service URLs
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:3001")
    DATA_SERVICE_URL: str = os.getenv("DATA_SERVICE_URL", "http://localhost:8001")

    # Service communication API keys
    BACKEND_API_KEY: Optional[str] = os.getenv("BACKEND_API_KEY")

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str = os.getenv("LOG_FILE", "logs/ai_service.log")

    # Model defaults
    DEFAULT_MODEL: str = os.getenv("DEFAULT_MODEL", "gpt-4-turbo-preview")
    DEFAULT_TEMPERATURE: float = float(os.getenv("DEFAULT_TEMPERATURE", 0.7))
    DEFAULT_MAX_TOKENS: int = int(os.getenv("DEFAULT_MAX_TOKENS", 2000))

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()