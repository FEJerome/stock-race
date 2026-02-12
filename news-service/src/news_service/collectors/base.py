"""
采集器基类定义

定义所有数据采集器的通用接口和基础功能
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio


class DataSourceError(Exception):
    """数据源错误异常"""
    def __init__(self, message: str, source: Optional[str] = None):
        super().__init__(message)
        self.source = source
        self.message = message


class RateLimitError(DataSourceError):
    """速率限制错误异常"""
    def __init__(self, message: str, source: Optional[str] = None, retry_after: Optional[int] = None):
        super().__init__(message, source)
        self.retry_after = retry_after


class BaseCollector(ABC):
    """
    数据采集器抽象基类

    所有具体采集器必须继承此类并实现抽象方法
    """

    def __init__(self, name: str, priority: int = 1):
        """
        初始化采集器

        Args:
            name: 采集器名称
            priority: 优先级（数字越小优先级越高）
        """
        self.name = name
        self.priority = priority
        self.request_count = 0
        self.error_count = 0
        self.total_response_time = 0.0
        self.last_request_time: Optional[datetime] = None
        self.session: Optional[Any] = None

    @abstractmethod
    async def collect(self) -> List[Dict[str, Any]]:
        """
        执行数据采集

        Returns:
            采集到的数据列表
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        健康检查

        Returns:
            数据源是否可用
        """
        pass

    @property
    @abstractmethod
    def source_name(self) -> str:
        """
        数据源名称

        Returns:
            数据源标识名称
        """
        pass

    def get_stats(self) -> Dict[str, Any]:
        """
        获取采集器统计信息

        Returns:
            包含统计信息的字典
        """
        return {
            "name": self.name,
            "priority": self.priority,
            "request_count": self.request_count,
            "error_count": self.error_count,
            "success_rate": self.success_rate,
            "error_rate": self.error_rate,
            "average_response_time": self.average_response_time,
            "last_request_time": self.last_request_time.isoformat() if self.last_request_time else None,
        }

    @property
    def success_rate(self) -> float:
        """
        成功率

        Returns:
            成功请求比例 (0.0 - 1.0)
        """
        if self.request_count == 0:
            return 1.0
        return (self.request_count - self.error_count) / self.request_count

    @property
    def error_rate(self) -> float:
        """
        错误率

        Returns:
            错误请求比例 (0.0 - 1.0)
        """
        if self.request_count == 0:
            return 0.0
        return self.error_count / self.request_count

    @property
    def average_response_time(self) -> float:
        """
        平均响应时间

        Returns:
            平均响应时间（秒）
        """
        if self.request_count == 0:
            return 0.0
        return self.total_response_time / self.request_count

    def _record_request(self, success: bool = True, response_time: float = 0.0):
        """
        记录请求统计

        Args:
            success: 请求是否成功
            response_time: 响应时间（秒）
        """
        self.request_count += 1
        self.total_response_time += response_time
        self.last_request_time = datetime.now()

        if not success:
            self.error_count += 1

    async def _rate_limit(self, min_interval: float = 1.0):
        """
        速率限制控制

        Args:
            min_interval: 最小请求间隔（秒）
        """
        if self.last_request_time:
            elapsed = (datetime.now() - self.last_request_time).total_seconds()
            if elapsed < min_interval:
                await asyncio.sleep(min_interval - elapsed)

    async def close(self):
        """
        关闭采集器，清理资源
        """
        if self.session:
            await self.session.close()
            self.session = None
