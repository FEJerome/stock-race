"""
T-019: High Frequency Layer Integration Service
高频层动态调整集成服务

职责：
1. 监听系统健康状态变化
2. 从 Backend API 获取加权热股票列表
3. 根据健康状态动态调整高频层股票数量
4. 处理 Backend API 故障时的降级策略
5. 与全量采集层协调，避免重复采集

健康状态映射：
- 4源(Excellent): 200只, 10秒间隔
- 3源(Good): 150只, 10秒间隔
- 2源(Normal): 100只, 10秒间隔
- 1源(Poor): 50只, 15秒间隔
- 0源(Critical): 停止高频层
"""

import asyncio
import logging
import aiohttp
from typing import List, Dict, Any, Optional, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass

from data_service.services.dynamic_high_freq_scheduler import (
    DynamicHighFreqScheduler,
    HealthStatus,
    DynamicConfig
)
from data_service.services.hot_stock_selector import HotStockSelector

logger = logging.getLogger(__name__)


@dataclass
class IntegrationConfig:
    """集成服务配置"""
    backend_url: str = "http://localhost:3001"
    api_endpoint: str = "/api/v1/public/hot-stocks"
    cache_ttl: int = 60  # 本地缓存TTL（秒）
    request_timeout: int = 5  # 请求超时（秒）
    max_retries: int = 3  # 最大重试次数
    retry_delay: float = 1.0  # 重试间隔（秒）


@dataclass
class AdjustmentResult:
    """调整结果"""
    success: bool
    old_config: Optional[DynamicConfig]
    new_config: Optional[DynamicConfig]
    selected_stocks: List[str]
    source: str  # 'backend', 'cache', 'fallback'
    message: str
    timestamp: datetime


class HighFreqIntegrationService:
    """
    高频层动态调整集成服务

    实现 T-019 需求：
    - 监听健康状态变化
    - 对接 Backend 热股票 API
    - 动态调整高频层股票数量
    - 故障时自动降级
    """

    def __init__(
        self,
        scheduler: Optional[DynamicHighFreqScheduler] = None,
        selector: Optional[HotStockSelector] = None,
        config: Optional[IntegrationConfig] = None
    ):
        """
        初始化集成服务

        Args:
            scheduler: 动态高频层调度器
            selector: 热股票选取器
            config: 集成配置
        """
        self.scheduler = scheduler or DynamicHighFreqScheduler()
        self.selector = selector or HotStockSelector()
        self.config = config or IntegrationConfig()

        # 本地缓存
        self._cached_stocks: List[Dict[str, Any]] = []
        self._cache_timestamp: Optional[datetime] = None
        self._cache_valid: bool = False

        # 状态回调
        self._status_change_callbacks: List[Callable] = []

        # 运行状态
        self._running: bool = False
        self._last_adjustment: Optional[AdjustmentResult] = None

        logger.info("HighFreqIntegrationService initialized")

    def register_status_change_callback(self, callback: Callable):
        """
        注册状态变化回调函数

        Args:
            callback: 回调函数，接收 (old_config, new_config, selected_stocks) 参数
        """
        self._status_change_callbacks.append(callback)
        logger.debug(f"Registered status change callback. Total: {len(self._status_change_callbacks)}")

    def unregister_status_change_callback(self, callback: Callable):
        """注销状态变化回调函数"""
        if callback in self._status_change_callbacks:
            self._status_change_callbacks.remove(callback)

    async def _fetch_hot_stocks_from_backend(self, limit: int) -> Dict[str, Any]:
        """
        从 Backend API 获取热股票列表

        Args:
            limit: 获取股票数量

        Returns:
            Backend API 响应数据

        Raises:
            ConnectionError: 网络连接失败
            asyncio.TimeoutError: 请求超时
        """
        url = f"{self.config.backend_url}{self.config.api_endpoint}"
        params = {"limit": limit}

        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    url,
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=self.config.request_timeout)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.debug(f"Fetched {len(data.get('data', {}).get('stocks', []))} hot stocks from backend")
                        return data
                    elif response.status == 503:
                        logger.warning("Backend hot stocks cache not ready")
                        return {"success": False, "error": {"code": "CACHE_NOT_READY"}}
                    else:
                        logger.error(f"Backend API error: {response.status}")
                        raise ConnectionError(f"Backend API returned {response.status}")

            except asyncio.TimeoutError:
                logger.error("Backend API request timeout")
                raise
            except aiohttp.ClientError as e:
                logger.error(f"Backend API connection error: {e}")
                raise ConnectionError(f"Failed to connect to backend: {e}")

    async def _get_hot_stocks_with_fallback(self, limit: int) -> tuple[List[Dict[str, Any]], str]:
        """
        获取热股票列表（带降级处理）

        Args:
            limit: 需要获取的股票数量

        Returns:
            (股票列表, 数据来源) 元组
            数据来源: 'backend', 'cache', 'fallback'
        """
        # 1. 尝试从 Backend 获取
        for attempt in range(self.config.max_retries):
            try:
                result = await self._fetch_hot_stocks_from_backend(limit)

                if result.get("success") and "data" in result:
                    stocks = result["data"].get("stocks", [])
                    if stocks:
                        # 更新本地缓存
                        self._update_cache(stocks)
                        return stocks, "backend"

                # 缓存未就绪或其他问题，等待后重试
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)

            except (ConnectionError, asyncio.TimeoutError) as e:
                logger.warning(f"Backend fetch attempt {attempt + 1} failed: {e}")
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)

        # 2. Backend 失败，尝试使用本地缓存
        if self._is_cache_valid():
            logger.info("Using cached hot stocks due to backend failure")
            return self._cached_stocks, "cache"

        # 3. 缓存也无效，使用默认股票列表（fallback）
        logger.warning("Using fallback stock list")
        fallback_stocks = self._get_fallback_stocks(limit)
        return fallback_stocks, "fallback"

    def _update_cache(self, stocks: List[Dict[str, Any]]):
        """更新本地缓存"""
        self._cached_stocks = stocks
        self._cache_timestamp = datetime.now()
        self._cache_valid = True
        logger.debug(f"Updated local cache with {len(stocks)} stocks")

    def _is_cache_valid(self) -> bool:
        """检查缓存是否有效"""
        if not self._cache_valid or not self._cache_timestamp:
            return False

        age = (datetime.now() - self._cache_timestamp).total_seconds()
        return age < self.config.cache_ttl

    def _get_fallback_stocks(self, limit: int) -> List[Dict[str, Any]]:
        """
        获取默认股票列表（当 Backend 和缓存都不可用时）

        Returns:
            默认股票列表（权重设为50）
        """
        # 默认股票列表（沪深300成分股中的部分）
        default_symbols = [
            "000001.SZ", "600519.SH", "000858.SZ", "002594.SZ", "601318.SH",
            "600036.SH", "000333.SZ", "600276.SH", "002415.SZ", "601888.SH",
            "600009.SH", "000002.SZ", "600030.SH", "601166.SH", "600887.SH",
            "000568.SZ", "002304.SZ", "600000.SH", "601398.SH", "601857.SH",
        ]

        return [
            {"symbol": symbol, "weight": 50.0, "source": "fallback"}
            for symbol in default_symbols[:limit]
        ]

    async def adjust_high_freq_layer(
        self,
        source_count: int,
        force: bool = False
    ) -> AdjustmentResult:
        """
        调整高频层

        Args:
            source_count: 当前健康数据源数量
            force: 是否强制调整（忽略状态变化检查）

        Returns:
            调整结果
        """
        timestamp = datetime.now()

        # 1. 检查是否需要调整
        old_config = self.scheduler.get_current_config()

        if not force and not self.scheduler.should_adjust_high_freq_layer():
            return AdjustmentResult(
                success=True,
                old_config=old_config,
                new_config=old_config,
                selected_stocks=self.selector.get_last_selection().get("stocks", []),
                source="unchanged",
                message="No adjustment needed",
                timestamp=timestamp
            )

        # 2. 更新调度器状态
        self.scheduler.force_adjustment(source_count)
        new_config = self.scheduler.get_current_config()

        # 3. 如果处于 CRITICAL 状态，停止高频层
        if new_config.status == HealthStatus.CRITICAL:
            return AdjustmentResult(
                success=True,
                old_config=old_config,
                new_config=new_config,
                selected_stocks=[],
                source="critical",
                message="High freq layer stopped due to critical status",
                timestamp=timestamp
            )

        # 4. 获取热股票列表
        stock_count = new_config.stock_count
        hot_stocks, source = await self._get_hot_stocks_with_fallback(stock_count)

        # 5. 选取高频层股票
        selected_symbols = self.selector.select_stocks_for_high_freq(
            hot_stocks,
            stock_count
        )

        # 6. 构建结果
        result = AdjustmentResult(
            success=len(selected_symbols) > 0,
            old_config=old_config,
            new_config=new_config,
            selected_stocks=selected_symbols,
            source=source,
            message=f"Adjusted to {len(selected_symbols)} stocks ({new_config.status.value})",
            timestamp=timestamp
        )

        self._last_adjustment = result

        # 7. 触发回调
        self._notify_status_change(old_config, new_config, selected_symbols)

        logger.info(f"High freq layer adjusted: {old_config.status.value} -> {new_config.status.value}, "
                   f"stocks={len(selected_symbols)}, source={source}")

        return result

    def _notify_status_change(
        self,
        old_config: DynamicConfig,
        new_config: DynamicConfig,
        selected_stocks: List[str]
    ):
        """通知状态变化回调"""
        for callback in self._status_change_callbacks:
            try:
                callback(old_config, new_config, selected_stocks)
            except Exception as e:
                logger.error(f"Status change callback failed: {e}")

    async def start_monitoring(self, check_interval: int = 10):
        """
        启动健康状态监控

        Args:
            check_interval: 检查间隔（秒）
        """
        self._running = True
        logger.info(f"Started health monitoring (interval={check_interval}s)")

        while self._running:
            try:
                # 检查是否需要调整
                if self.scheduler.should_adjust_high_freq_layer():
                    source_count = self.scheduler._get_healthy_source_count()
                    await self.adjust_high_freq_layer(source_count)

                await asyncio.sleep(check_interval)

            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(check_interval)

    def stop_monitoring(self):
        """停止健康状态监控"""
        self._running = False
        logger.info("Stopped health monitoring")

    def get_current_status(self) -> Dict[str, Any]:
        """
        获取当前状态

        Returns:
            当前状态信息
        """
        scheduler_stats = self.scheduler.get_stats()
        last_selection = self.selector.get_last_selection()

        return {
            "scheduler": scheduler_stats,
            "last_selection": last_selection,
            "cache_valid": self._is_cache_valid(),
            "cache_age": (
                (datetime.now() - self._cache_timestamp).total_seconds()
                if self._cache_timestamp else None
            ),
            "last_adjustment": {
                "success": self._last_adjustment.success if self._last_adjustment else None,
                "source": self._last_adjustment.source if self._last_adjustment else None,
                "timestamp": self._last_adjustment.timestamp.isoformat() if self._last_adjustment else None,
            } if self._last_adjustment else None
        }

    async def manual_adjust(self, source_count: int) -> AdjustmentResult:
        """
        手动触发调整

        Args:
            source_count: 指定的健康源数量

        Returns:
            调整结果
        """
        logger.info(f"Manual adjustment triggered with source_count={source_count}")
        return await self.adjust_high_freq_layer(source_count, force=True)


# 全局服务实例（单例模式）
_integration_service: Optional[HighFreqIntegrationService] = None


def get_integration_service() -> HighFreqIntegrationService:
    """
    获取全局集成服务实例

    Returns:
        HighFreqIntegrationService 实例
    """
    global _integration_service
    if _integration_service is None:
        _integration_service = HighFreqIntegrationService()
    return _integration_service


def reset_integration_service():
    """重置全局集成服务实例（主要用于测试）"""
    global _integration_service
    _integration_service = None
