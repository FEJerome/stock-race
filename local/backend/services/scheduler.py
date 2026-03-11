"""
定时任务调度器

管理数据清理等周期性任务
"""
from datetime import datetime, timedelta
from typing import Callable
import asyncio

from sqlalchemy import delete, select

from models.database import MarketQuoteModel


class DataCleanupScheduler:
    """数据清理调度器"""

    def __init__(self, db_session_factory):
        self._db_factory = db_session_factory
        self._running = False
        self._task = None

    def start(self):
        """启动调度器"""
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._run_cleanup_loop())
            print("[Scheduler] Data cleanup scheduler started")

    def shutdown(self):
        """关闭调度器"""
        self._running = False
        if self._task:
            self._task.cancel()
            print("[Scheduler] Data cleanup scheduler stopped")

    async def _run_cleanup_loop(self):
        """运行清理循环"""
        while self._running:
            try:
                # 计算距离下次凌晨3点的时间 (UTC)
                # 注意：UTC时间3点对应北京时间11点，如需中国凌晨3点请改用 datetime.now()
                now = datetime.utcnow()
                next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
                if next_run <= now:
                    next_run += timedelta(days=1)

                wait_seconds = (next_run - now).total_seconds()
                print(f"[Scheduler] Next cleanup at {next_run} UTC, waiting {wait_seconds}s")

                await asyncio.sleep(wait_seconds)

                # 执行清理
                await self.cleanup_old_quotes()

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[Scheduler] Error in cleanup loop: {e}")
                await asyncio.sleep(3600)  # 出错后1小时重试

    async def cleanup_old_quotes(self):
        """
        执行数据清理

        策略:
        - 最近7天：保留完整数据
        - 7-30天：每小时只保留1条（降采样）
        - 30天前：删除
        """
        print(f"[Scheduler] Starting data cleanup at {datetime.utcnow()}")

        try:
            async with self._db_factory() as session:
                now = datetime.utcnow()

                # 1. 删除30天前的数据
                cutoff_30d = now - timedelta(days=30)
                stmt = delete(MarketQuoteModel).where(MarketQuoteModel.timestamp < cutoff_30d)
                result = await session.execute(stmt)
                deleted_30d = result.rowcount

                # 2. 对7-30天的数据进行降采样
                cutoff_7d = now - timedelta(days=7)

                # 获取需要降采样的时间段内的数据
                stmt = select(MarketQuoteModel).where(
                    MarketQuoteModel.timestamp >= cutoff_30d,
                    MarketQuoteModel.timestamp < cutoff_7d
                ).order_by(MarketQuoteModel.symbol, MarketQuoteModel.timestamp)

                result = await session.execute(stmt)
                old_quotes = result.scalars().all()

                # 按小时分组，每小时只保留第一条
                to_delete = []
                current_hour = None
                current_symbol = None

                for quote in old_quotes:
                    hour_key = quote.timestamp.replace(minute=0, second=0, microsecond=0)

                    if quote.symbol != current_symbol or hour_key != current_hour:
                        # 保留这条，更新当前小时
                        current_symbol = quote.symbol
                        current_hour = hour_key
                    else:
                        # 同一小时内，删除这条
                        to_delete.append((quote.symbol, quote.timestamp))

                # 批量删除
                deleted_downsample = 0
                for symbol, timestamp in to_delete:
                    stmt = delete(MarketQuoteModel).where(
                        MarketQuoteModel.symbol == symbol,
                        MarketQuoteModel.timestamp == timestamp
                    )
                    result = await session.execute(stmt)
                    deleted_downsample += result.rowcount

                await session.commit()

                print(f"[Scheduler] Cleanup completed: deleted {deleted_30d} old, "
                      f"{deleted_downsample} downsampled")

        except Exception as e:
            print(f"[Scheduler] Cleanup failed: {e}")
