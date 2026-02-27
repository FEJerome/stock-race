"""
新闻服务配置管理

使用Pydantic Settings进行配置管理
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, ConfigDict


class Settings(BaseSettings):
    """新闻服务配置类"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    # 服务配置
    HOST: str = Field(default="0.0.0.0", description="服务监听地址")
    PORT: int = Field(default=8002, ge=1, le=65535, description="服务端口")
    DEBUG: bool = Field(default=False, description="调试模式")

    # 数据库配置
    DB_HOST: str = Field(default="localhost", description="数据库主机")
    DB_PORT: int = Field(default=5432, ge=1, le=65535, description="数据库端口")
    DB_NAME: str = Field(default="stock_race_news", description="数据库名称")
    DB_USER: str = Field(default="postgres", description="数据库用户")
    DB_PASSWORD: str = Field(default="postgres", description="数据库密码")

    # Redis配置
    REDIS_URL: str = Field(default="redis://localhost:6379/2", description="Redis连接URL")

    # AI服务配置
    AI_SERVICE_URL: str = Field(default="http://localhost:8000", description="AI服务URL")
    AI_SERVICE_API_KEY: str = Field(default="stock-race-ai-key", description="AI服务API密钥")

    # 采集配置
    COLLECTION_INTERVAL_MINUTES: int = Field(default=5, ge=1, description="采集间隔（分钟）")
    ENABLE_AI_SENTIMENT: bool = Field(default=True, description="启用AI情感分析")
    MAX_NEWS_PER_DAY: int = Field(default=10000, ge=100, description="每日最大新闻数")

    # 数据源配置
    SINA_FINANCE_ENABLED: bool = Field(default=True, description="启用新浪财经")
    EASTMONEY_NEWS_ENABLED: bool = Field(default=True, description="启用东方财富新闻")
    CLS_CN_ENABLED: bool = Field(default=True, description="启用财联社")
    WALLSTREETCN_ENABLED: bool = Field(default=True, description="启用华尔街见闻")
    WEIBO_ENABLED: bool = Field(default=True, description="启用微博")
    XUEQIU_ENABLED: bool = Field(default=True, description="启用雪球")
    EASTMONEY_GUBA_ENABLED: bool = Field(default=True, description="启用东方财富股吧")
    THS_GUBA_ENABLED: bool = Field(default=True, description="启用同花顺股吧")

    @property
    def DATABASE_URL(self) -> str:
        """构建数据库连接URL"""
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


# 全局配置实例
settings = Settings()
