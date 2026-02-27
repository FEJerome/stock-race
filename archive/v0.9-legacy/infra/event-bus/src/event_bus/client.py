"""
事件总线客户端
Redis Streams 连接管理
"""

import redis
from typing import Optional, Dict, Any
import logging

from .exceptions import ConnectionError

logger = logging.getLogger(__name__)


class EventBusClient:
    """
    事件总线客户端

    负责管理Redis连接，提供基础操作接口
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        **kwargs
    ):
        """
        初始化事件总线客户端

        Args:
            redis_url: Redis连接URL (如: redis://localhost:6379/0)
            host: Redis主机地址
            port: Redis端口
            db: Redis数据库编号
            password: Redis密码
            **kwargs: 其他redis连接参数
        """
        self._redis_url = redis_url
        self._host = host
        self._port = port
        self._db = db
        self._password = password
        self._extra_kwargs = kwargs
        self._client: Optional[redis.Redis] = None

    def connect(self) -> redis.Redis:
        """
        连接到Redis

        Returns:
            redis.Redis: Redis客户端实例

        Raises:
            ConnectionError: 连接失败时抛出
        """
        try:
            if self._redis_url:
                self._client = redis.from_url(
                    self._redis_url,
                    decode_responses=True,
                    **self._extra_kwargs
                )
            else:
                self._client = redis.Redis(
                    host=self._host,
                    port=self._port,
                    db=self._db,
                    password=self._password,
                    decode_responses=True,
                    **self._extra_kwargs
                )

            # 验证连接
            self._client.ping()
            logger.info("EventBus connected to Redis successfully")
            return self._client

        except redis.ConnectionError as e:
            raise ConnectionError(f"Failed to connect to Redis: {e}")
        except Exception as e:
            raise ConnectionError(f"Unexpected error connecting to Redis: {e}")

    def disconnect(self):
        """断开Redis连接"""
        if self._client:
            self._client.close()
            self._client = None
            logger.info("EventBus disconnected from Redis")

    @property
    def client(self) -> redis.Redis:
        """获取Redis客户端（懒连接）"""
        if self._client is None:
            self.connect()
        return self._client

    def health_check(self) -> bool:
        """健康检查"""
        try:
            if self._client:
                return self._client.ping()
            return False
        except Exception:
            return False

    def __enter__(self):
        """上下文管理器入口"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口"""
        self.disconnect()
        return False
