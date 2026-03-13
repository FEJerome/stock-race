"""
EventWindowManager - 事件窗口管理器

Phase 1.4 事件舆情数据层 - 包4核心实现
功能：30天滚动窗口管理、事件淘汰策略、FIFO容量控制

参考文档：
- docs/research/B-1.4.9-window-management.md
- docs/modules/local/ARCHITECTURE.md §3.4
"""

import json
import uuid
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dataclasses import dataclass

from sqlalchemy import select, delete, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.event import Event, EventWindow, WindowFeatures, EventSentiment


@dataclass
class WindowConfig:
    """窗口配置数据类"""
    window_days: int = 30  # 窗口天数
    max_events: int = 100  # 最大事件数
    ema_alpha: float = 0.9  # EMA平滑因子（对应约20日半衰期）


class EventWindowManager:
    """
    事件窗口管理器

    负责：
    1. 30天滚动窗口管理
    2. 事件容量控制（FIFO淘汰）
    3. 过期事件清理
    4. 窗口特征聚合入口

    包4与包5的边界：此管理器是数据层（包4）的终点，
    事件抽取/LLM分类由包5实现，通过add_event()接口接入。
    """

    def __init__(
        self,
        db_session: AsyncSession,
        window_days: int = 30,
        max_events: int = 100,
        ema_alpha: float = 0.9
    ):
        """
        初始化窗口管理器

        Args:
            db_session: SQLAlchemy异步会话
            window_days: 窗口天数（默认30天）
            max_events: 单股票最大事件数（默认100）
            ema_alpha: EMA平滑因子（默认0.9）
        """
        self.db = db_session
        self.config = WindowConfig(
            window_days=window_days,
            max_events=max_events,
            ema_alpha=ema_alpha
        )

    async def add_event(self, event: Event) -> bool:
        """
        添加事件到窗口，触发淘汰策略

        流程：
        1. 保存事件到数据库
        2. 触发过期淘汰（30天）
        3. 触发FIFO容量控制
        4. 更新对应股票的窗口聚合

        Args:
            event: 事件对象（已填充所有字段）

        Returns:
            bool: 是否成功添加
        """
        try:
            # 1. 保存事件
            self.db.add(event)
            await self.db.flush()

            # 2. 触发淘汰策略
            await self._evict_expired(event.stock_code)
            await self._evict_fifo_if_needed(event.stock_code)

            # 3. 更新窗口聚合
            await self._update_window_aggregation(event.stock_code)

            return True

        except Exception as e:
            # 记录错误但不抛出，保持接口稳定性
            print(f"[EventWindowManager] Failed to add event: {e}")
            return False

    async def get_window_events(
        self,
        stock_code: str,
        as_of_date: Optional[datetime] = None
    ) -> List[Event]:
        """
        获取指定股票当前窗口内的事件

        Args:
            stock_code: 股票代码
            as_of_date: 查询日期（默认当前时间）

        Returns:
            窗口内的事件列表（按时间倒序）
        """
        if as_of_date is None:
            as_of_date = datetime.utcnow()

        window_start = as_of_date - timedelta(days=self.config.window_days)

        stmt = (
            select(Event)
            .where(
                and_(
                    Event.stock_code == stock_code,
                    Event.timestamp >= window_start,
                    Event.timestamp <= as_of_date
                )
            )
            .order_by(Event.timestamp.desc())
        )

        result = await self.db.execute(stmt)
        events = result.scalars().all()
        return list(events)

    async def get_window_count(self, stock_code: str) -> int:
        """
        获取窗口内事件数量

        Args:
            stock_code: 股票代码

        Returns:
            事件数量
        """
        window_start = datetime.utcnow() - timedelta(days=self.config.window_days)

        stmt = (
            select(func.count())
            .where(
                and_(
                    Event.stock_code == stock_code,
                    Event.timestamp >= window_start
                )
            )
        )

        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def _evict_expired(self, stock_code: str) -> int:
        """
        淘汰过期事件（超过30天）

        Args:
            stock_code: 股票代码

        Returns:
            淘汰的事件数量
        """
        cutoff_date = datetime.utcnow() - timedelta(days=self.config.window_days)

        stmt = (
            delete(Event)
            .where(
                and_(
                    Event.stock_code == stock_code,
                    Event.timestamp < cutoff_date
                )
            )
        )

        result = await self.db.execute(stmt)
        evicted_count = result.rowcount

        if evicted_count > 0:
            print(f"[EventWindowManager] Evicted {evicted_count} expired events for {stock_code}")

        return evicted_count

    async def _evict_fifo_if_needed(self, stock_code: str) -> int:
        """
        FIFO淘汰：超出容量时淘汰最旧事件

        策略：
        - 最大事件数：100
        - 超出容量时，按时间顺序淘汰最旧的事件

        Args:
            stock_code: 股票代码

        Returns:
            淘汰的事件数量
        """
        # 获取当前事件数
        current_count = await self.get_window_count(stock_code)

        if current_count <= self.config.max_events:
            return 0

        # 计算需要淘汰的数量
        to_evict = current_count - self.config.max_events

        # 找出最旧的事件
        stmt = (
            select(Event)
            .where(Event.stock_code == stock_code)
            .order_by(Event.timestamp.asc())
            .limit(to_evict)
        )

        result = await self.db.execute(stmt)
        oldest_events = result.scalars().all()

        # 删除这些事件
        evicted_ids = [e.id for e in oldest_events]
        if evicted_ids:
            delete_stmt = delete(Event).where(Event.id.in_(evicted_ids))
            await self.db.execute(delete_stmt)
            print(f"[EventWindowManager] FIFO evicted {len(evicted_ids)} oldest events for {stock_code}")

        return len(evicted_ids)

    async def _update_window_aggregation(self, stock_code: str) -> Optional[EventWindow]:
        """
        更新窗口聚合结果

        计算当前窗口的特征并保存到EventWindow表

        Args:
            stock_code: 股票代码

        Returns:
            更新后的EventWindow对象
        """
        from services.window_aggregation import calculate_window_features

        # 获取窗口内事件
        events = await self.get_window_events(stock_code)

        if not events:
            return None

        # 计算窗口特征
        features = calculate_window_features(events, self.config.ema_alpha)

        # 确定窗口时间范围
        window_end = max(e.timestamp for e in events)
        window_start = min(e.timestamp for e in events)

        # 检查是否已存在该股票的窗口记录
        # 使用最新的窗口记录进行更新
        stmt = (
            select(EventWindow)
            .where(EventWindow.stock_code == stock_code)
            .order_by(EventWindow.window_end.desc())
            .limit(1)
        )

        result = await self.db.execute(stmt)
        existing_window = result.scalar_one_or_none()

        if existing_window:
            # 更新现有记录
            existing_window.event_count = len(events)
            existing_window.features_json = json.dumps(features.to_dict())
            existing_window.window_start = window_start
            existing_window.updated_at = datetime.utcnow()
            return existing_window
        else:
            # 创建新记录
            window = EventWindow(
                id=str(uuid.uuid4()),
                stock_code=stock_code,
                window_start=window_start,
                window_end=window_end,
                event_count=len(events),
                features_json=json.dumps(features.to_dict())
            )
            self.db.add(window)
            return window

    async def get_window_features(
        self,
        stock_code: str,
        as_of_date: Optional[datetime] = None
    ) -> Optional[WindowFeatures]:
        """
        获取窗口特征（从缓存或实时计算）

        Args:
            stock_code: 股票代码
            as_of_date: 查询日期

        Returns:
            WindowFeatures对象，无数据时返回None
        """
        # 优先从EventWindow表读取最新记录
        stmt = (
            select(EventWindow)
            .where(EventWindow.stock_code == stock_code)
            .order_by(EventWindow.window_end.desc())
            .limit(1)
        )

        result = await self.db.execute(stmt)
        cached = result.scalar_one_or_none()

        if cached and cached.features_json:
            return WindowFeatures.from_dict(json.loads(cached.features_json))

        # 缓存未命中，实时计算
        events = await self.get_window_events(stock_code)
        if not events:
            return None

        from .window_aggregation import calculate_window_features
        return calculate_window_features(events, self.config.ema_alpha)

    async def clear_window(self, stock_code: str) -> int:
        """
        清空指定股票的窗口

        Args:
            stock_code: 股票代码

        Returns:
            删除的事件数量
        """
        # 删除事件
        stmt = delete(Event).where(Event.stock_code == stock_code)
        result = await self.db.execute(stmt)
        deleted_count = result.rowcount

        # 删除窗口聚合记录
        window_stmt = delete(EventWindow).where(EventWindow.stock_code == stock_code)
        await self.db.execute(window_stmt)

        print(f"[EventWindowManager] Cleared window for {stock_code}, deleted {deleted_count} events")
        return deleted_count

    async def get_all_stock_codes(self) -> List[str]:
        """
        获取所有有事件的股票代码

        Returns:
            股票代码列表
        """
        stmt = select(Event.stock_code).distinct()
        result = await self.db.execute(stmt)
        return [row[0] for row in result.all()]
