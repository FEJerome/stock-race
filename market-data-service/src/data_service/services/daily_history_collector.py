"""
T-020: DailyHistoryCollector - 日终历史数据采集器

功能：
1. 每日收盘后批量采集全市场日K线数据
2. 支持 Baostock/Tushare 多数据源备用
3. 分批采集控制频率，避免限流
4. 数据完整性校验
5. 错误重试机制

存储策略：仅采集日K线（1d），确保数据库压缩后<1GB
"""

import asyncio
import logging
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional, Callable, Tuple
from dataclasses import dataclass

from data_service.collectors.baostock import BaostockCollector

logger = logging.getLogger(__name__)


class DataSourceError(Exception):
    """数据源错误"""
    pass


class DataValidationError(Exception):
    """数据校验错误"""
    pass


@dataclass
class CollectionResult:
    """采集结果"""
    symbol: str
    success: bool
    records_collected: int
    data_source: Optional[str]
    error: Optional[str] = None
    data: Optional[List[Dict[str, Any]]] = None


class DailyHistoryCollector:
    """
    日终历史数据采集器

    职责：
    1. 批量采集股票日K线数据
    2. 数据源故障自动切换
    3. 数据完整性校验
    4. 采集统计和进度报告
    """

    def __init__(
        self,
        batch_size: int = 100,
        batch_interval: float = 5.0,
        max_retries: int = 3,
        retry_delay: float = 2.0,
        baostock_collector: Optional[BaostockCollector] = None,
        tushare_collector: Optional[Any] = None
    ):
        """
        初始化采集器

        Args:
            batch_size: 每批采集股票数量，默认100只
            batch_interval: 批次间隔（秒），默认5秒
            max_retries: 最大重试次数，默认3次
            retry_delay: 重试间隔（秒），默认2秒
            baostock_collector: Baostock采集器实例
            tushare_collector: Tushare采集器实例
        """
        self.batch_size = batch_size
        self.batch_interval = batch_interval
        self.max_retries = max_retries
        self.retry_delay = retry_delay

        # 数据源
        self.baostock_collector = baostock_collector or BaostockCollector()
        self.tushare_collector = tushare_collector
        self.primary_source = "baostock"

        # 统计数据
        self.stats = {
            "total_processed": 0,
            "total_success": 0,
            "total_failed": 0,
            "success_rate": 0.0
        }

        logger.info(f"DailyHistoryCollector initialized: batch_size={batch_size}, "
                   f"batch_interval={batch_interval}s, max_retries={max_retries}")

    async def collect_single_stock(
        self,
        symbol: str,
        trade_date: date
    ) -> CollectionResult:
        """
        采集单只股票日K线

        Args:
            symbol: 股票代码，如 "000001.SZ"
            trade_date: 交易日期

        Returns:
            CollectionResult 采集结果
        """
        # 尝试主数据源
        result = await self._try_collect_with_retry(
            symbol=symbol,
            trade_date=trade_date,
            collector=self.baostock_collector,
            source_name="baostock"
        )

        if result.success:
            return result

        # 主数据源失败，尝试备用数据源
        if self.tushare_collector:
            logger.warning(f"Primary source failed for {symbol}, trying Tushare")
            result = await self._try_collect_with_retry(
                symbol=symbol,
                trade_date=trade_date,
                collector=self.tushare_collector,
                source_name="tushare"
            )

            if result.success:
                return result

        # 所有数据源都失败
        return CollectionResult(
            symbol=symbol,
            success=False,
            records_collected=0,
            data_source=None,
            error=f"All datasources failed for {symbol}"
        )

    async def _try_collect_with_retry(
        self,
        symbol: str,
        trade_date: date,
        collector: Any,
        source_name: str
    ) -> CollectionResult:
        """
        带重试的采集尝试

        Args:
            symbol: 股票代码
            trade_date: 交易日期
            collector: 采集器实例
            source_name: 数据源名称

        Returns:
            CollectionResult 采集结果
        """
        last_error = None

        for attempt in range(1, self.max_retries + 1):
            try:
                # 调用数据源采集
                history_data = await collector.get_stock_history(
                    symbol=symbol,
                    start_date=trade_date,
                    end_date=trade_date,
                    interval="1d"
                )

                if not history_data:
                    return CollectionResult(
                        symbol=symbol,
                        success=False,
                        records_collected=0,
                        data_source=source_name,
                        error="No data returned"
                    )

                # 数据校验
                valid_data = []
                for data in history_data:
                    is_valid, error = self.verify_data_integrity(data)
                    if is_valid:
                        valid_data.append(data)
                    else:
                        logger.warning(f"Data validation failed for {symbol}: {error}")

                if not valid_data:
                    return CollectionResult(
                        symbol=symbol,
                        success=False,
                        records_collected=0,
                        data_source=source_name,
                        error="No valid data after validation"
                    )

                return CollectionResult(
                    symbol=symbol,
                    success=True,
                    records_collected=len(valid_data),
                    data_source=source_name,
                    data=valid_data
                )

            except Exception as e:
                last_error = str(e)
                logger.warning(f"Attempt {attempt}/{self.max_retries} failed for {symbol} "
                              f"from {source_name}: {last_error}")

                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay)

        # 重试耗尽
        return CollectionResult(
            symbol=symbol,
            success=False,
            records_collected=0,
            data_source=source_name,
            error=f"All {self.max_retries} attempts failed: {last_error}"
        )

    def verify_data_integrity(self, data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        校验数据完整性

        检查项：
        1. 必填字段存在
        2. 高开低收逻辑正确（高 >= 低，高 >= 收 >= 低）
        3. 价格非负
        4. 成交量 > 0

        Args:
            data: 单条K线数据

        Returns:
            (是否有效, 错误信息)
        """
        # 检查必填字段
        required_fields = ["symbol", "open", "high", "low", "close", "volume"]
        for field in required_fields:
            if field not in data:
                return False, f"Missing required field: {field}"

        try:
            open_price = float(data["open"])
            high_price = float(data["high"])
            low_price = float(data["low"])
            close_price = float(data["close"])
            volume = int(data["volume"])
        except (ValueError, TypeError) as e:
            return False, f"Invalid data type: {e}"

        # 检查价格非负
        if any(p < 0 for p in [open_price, high_price, low_price, close_price]):
            return False, "Price cannot be negative"

        # 检查高开低收逻辑
        if high_price < low_price:
            return False, f"High price ({high_price}) < Low price ({low_price})"

        if high_price < open_price or high_price < close_price:
            return False, f"High price ({high_price}) should be >= Open ({open_price}) and Close ({close_price})"

        if low_price > open_price or low_price > close_price:
            return False, f"Low price ({low_price}) should be <= Open ({open_price}) and Close ({close_price})"

        # 检查成交量
        if volume <= 0:
            return False, f"Volume should be > 0, got {volume}"

        return True, None

    async def collect_batch(
        self,
        symbols: List[str],
        trade_date: date,
        progress_callback: Optional[Callable[[int, int, int], None]] = None
    ) -> List[CollectionResult]:
        """
        批量采集股票日K线

        Args:
            symbols: 股票代码列表
            trade_date: 交易日期
            progress_callback: 进度回调函数(completed, total, failed)

        Returns:
            List[CollectionResult] 采集结果列表
        """
        results = []
        completed = 0
        failed = 0

        for i, symbol in enumerate(symbols):
            # 采集单只股票
            result = await self.collect_single_stock(symbol, trade_date)
            results.append(result)

            # 更新统计
            if result.success:
                completed += 1
            else:
                failed += 1

            self.stats["total_processed"] += 1
            if result.success:
                self.stats["total_success"] += 1
            else:
                self.stats["total_failed"] += 1

            # 进度回调
            if progress_callback:
                await progress_callback(completed, len(symbols), failed)

            # 批次间隔（除了最后一只）
            if i < len(symbols) - 1:
                await asyncio.sleep(self.batch_interval)

        # 更新成功率
        if self.stats["total_processed"] > 0:
            self.stats["success_rate"] = self.stats["total_success"] / self.stats["total_processed"]

        return results

    async def collect_all_stocks(
        self,
        symbols: List[str],
        trade_date: date,
        progress_callback: Optional[Callable[[int, int, int], None]] = None
    ) -> List[CollectionResult]:
        """
        采集全市场股票日K线（分批处理）

        Args:
            symbols: 全市场股票代码列表（约5300只）
            trade_date: 交易日期
            progress_callback: 进度回调函数(completed, total, failed)

        Returns:
            List[CollectionResult] 采集结果列表
        """
        if not symbols:
            logger.warning("No symbols to collect")
            return []

        logger.info(f"Starting daily history collection for {len(symbols)} stocks on {trade_date}")

        all_results = []
        total_batches = (len(symbols) + self.batch_size - 1) // self.batch_size

        for batch_idx in range(total_batches):
            start_idx = batch_idx * self.batch_size
            end_idx = min(start_idx + self.batch_size, len(symbols))
            batch_symbols = symbols[start_idx:end_idx]

            logger.info(f"Processing batch {batch_idx + 1}/{total_batches}: "
                       f"{len(batch_symbols)} stocks")

            # 采集本批次
            batch_results = await self.collect_batch(
                symbols=batch_symbols,
                trade_date=trade_date,
                progress_callback=progress_callback
            )
            all_results.extend(batch_results)

            # 批次间额外延迟（除了最后一批）
            if batch_idx < total_batches - 1:
                await asyncio.sleep(self.batch_interval)

        logger.info(f"Collection completed: {len(all_results)} stocks processed, "
                   f"success rate: {self.stats['success_rate']:.2%}")

        return all_results

    def get_stats(self) -> Dict[str, Any]:
        """
        获取采集统计信息

        Returns:
            Dict 统计信息
        """
        return {
            "total_processed": self.stats["total_processed"],
            "total_success": self.stats["total_success"],
            "total_failed": self.stats["total_failed"],
            "success_rate": self.stats["success_rate"]
        }

    def reset_stats(self):
        """重置统计数据"""
        self.stats = {
            "total_processed": 0,
            "total_success": 0,
            "total_failed": 0,
            "success_rate": 0.0
        }

    async def close(self):
        """关闭采集器，释放资源"""
        try:
            if self.baostock_collector:
                await self.baostock_collector.close()
        except Exception as e:
            logger.error(f"Error closing baostock collector: {e}")

        try:
            if self.tushare_collector:
                await self.tushare_collector.close()
        except Exception as e:
            logger.error(f"Error closing tushare collector: {e}")

        logger.info("DailyHistoryCollector closed")
