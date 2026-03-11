"""
事件窗口管理器

实现30天滚动窗口管理，每日收盘后聚合计算事件链特征。
基于学术论文的时序分析方法，维护股票的事件记忆。
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, desc, and_

from models.database import EventModel, EventRelationModel, EventWindowModel
from .intensity_calculator import EventIntensityCalculator
from .temporal_analyzer import BooleanTemporalAnalyzer, Event, EventIntensity, EventRelation
from .narrative_builder import EventNarrativeBuilder, EventChain, ChainFeatures


@dataclass
class WindowConfig:
    """窗口配置"""
    window_days: int = 30  # 窗口天数
    max_events_per_symbol: int = 100  # 单股票最大事件数
    lambda_decay: float = 0.05  # 指数衰减系数（半衰期约14天）


class EventWindowManager:
    """
    30天滚动窗口事件管理器

    核心职责:
    1. 维护股票的事件时间窗口（最近30天）
    2. 每日收盘后聚合计算事件链特征
    3. 生成叙事摘要供AI决策使用
    4. 定期清理过期数据

    成本控制:
    - 单股票单日最多处理3个事件
    - 只处理用户持仓和自选股票
    """

    def __init__(
        self,
        intensity_calculator: EventIntensityCalculator,
        temporal_analyzer: BooleanTemporalAnalyzer,
        narrative_builder: EventNarrativeBuilder,
        config: Optional[WindowConfig] = None
    ):
        self.intensity_calc = intensity_calculator
        self.temporal_analyzer = temporal_analyzer
        self.narrative_builder = narrative_builder
        self.config = config or WindowConfig()

    async def add_events(
        self,
        symbol: str,
        events_data: List[Dict[str, Any]],
        db: AsyncSession
    ) -> List[EventModel]:
        """
        添加新事件到窗口

        Args:
            symbol: 股票代码
            events_data: 事件数据列表
            db: 数据库会话

        Returns:
            保存的事件模型列表
        """
        saved_events = []

        for event_data in events_data:
            # 检查是否已存在
            existing = await db.execute(
                select(EventModel).where(EventModel.id == event_data['id'])
            )
            if existing.scalar_one_or_none():
                continue

            # 创建事件模型
            event_model = EventModel(
                id=event_data['id'],
                symbol=symbol,
                news_id=event_data.get('news_id'),
                event_type=event_data['event_type'],
                trigger_word=event_data['trigger_word'],
                subject=event_data.get('subject'),
                object=event_data.get('object'),
                event_date=event_data.get('event_date'),
                sentiment=event_data.get('sentiment', 'neutral'),
                source_text=event_data.get('source_text'),
                publish_time=event_data.get('publish_time', datetime.utcnow()),
                expires_at=datetime.utcnow() + timedelta(days=self.config.window_days)
            )

            db.add(event_model)
            saved_events.append(event_model)

        await db.commit()

        # 触发窗口特征重计算
        if saved_events:
            await self._recalculate_window_features(symbol, db)

        return saved_events

    async def get_event_chain(
        self,
        symbol: str,
        db: AsyncSession,
        as_of_date: Optional[datetime] = None
    ) -> Optional[EventChain]:
        """
        获取当前事件链

        Args:
            symbol: 股票代码
            db: 数据库会话
            as_of_date: 截止日期，默认为今天

        Returns:
            事件链对象，无事件时返回None
        """
        if as_of_date is None:
            as_of_date = datetime.utcnow()

        window_start = as_of_date - timedelta(days=self.config.window_days)

        # 获取窗口内事件
        result = await db.execute(
            select(EventModel)
            .where(and_(
                EventModel.symbol == symbol,
                EventModel.created_at >= window_start,
                EventModel.created_at <= as_of_date
            ))
            .order_by(desc(EventModel.created_at))
            .limit(self.config.max_events_per_symbol)
        )

        events = result.scalars().all()
        if not events:
            return None

        # 转换为领域模型
        domain_events = self._to_domain_events(events)

        # 获取事件关系
        event_ids = [e.id for e in events]
        relations_result = await db.execute(
            select(EventRelationModel)
            .where(
                and_(
                    EventRelationModel.event_a_id.in_(event_ids),
                    EventRelationModel.event_b_id.in_(event_ids)
                )
            )
        )
        relations = relations_result.scalars().all()
        domain_relations = self._to_domain_relations(relations)

        # 计算链特征
        features = self._calculate_chain_features(domain_events)

        return EventChain(
            symbol=symbol,
            window_start=window_start,
            window_end=as_of_date,
            events=domain_events,
            relations=domain_relations,
            features=features
        )

    async def get_narrative_summary(
        self,
        symbol: str,
        db: AsyncSession
    ) -> Optional[str]:
        """
        获取叙事摘要（供AI决策使用）

        Args:
            symbol: 股票代码
            db: 数据库会话

        Returns:
            叙事摘要文本，无事件时返回None
        """
        # 优先从缓存获取
        today = datetime.utcnow().date()
        cached = await db.execute(
            select(EventWindowModel)
            .where(and_(
                EventWindowModel.symbol == symbol,
                EventWindowModel.window_date == today
            ))
        )
        window_record = cached.scalar_one_or_none()

        if window_record and window_record.narrative_summary:
            return window_record.narrative_summary

        # 实时生成
        event_chain = await self.get_event_chain(symbol, db)
        if not event_chain:
            return None

        narrative = self.narrative_builder.build_narrative(event_chain)

        # 缓存结果
        await self._save_window_cache(symbol, event_chain, narrative, db)

        return narrative

    async def cleanup_expired(self, db: AsyncSession) -> int:
        """
        清理过期数据

        Returns:
            清理的记录数
        """
        cutoff_date = datetime.utcnow() - timedelta(days=self.config.window_days)

        # 清理过期事件
        events_result = await db.execute(
            delete(EventModel).where(EventModel.expires_at < datetime.utcnow())
        )

        # 清理过期关系
        relations_result = await db.execute(
            delete(EventRelationModel).where(
                EventRelationModel.created_at < cutoff_date
            )
        )

        # 清理过期窗口
        windows_result = await db.execute(
            delete(EventWindowModel).where(
                EventWindowModel.window_date < cutoff_date.date()
            )
        )

        await db.commit()

        total = (events_result.rowcount + relations_result.rowcount +
                 windows_result.rowcount)
        return total

    async def _recalculate_window_features(
        self,
        symbol: str,
        db: AsyncSession
    ):
        """重新计算窗口特征并缓存"""
        event_chain = await self.get_event_chain(symbol, db)
        if not event_chain:
            return

        narrative = self.narrative_builder.build_narrative(event_chain)
        await self._save_window_cache(symbol, event_chain, narrative, db)

    async def _save_window_cache(
        self,
        symbol: str,
        event_chain: EventChain,
        narrative: str,
        db: AsyncSession
    ):
        """保存窗口缓存"""
        today = datetime.utcnow().date()

        # 检查是否已存在
        existing = await db.execute(
            select(EventWindowModel).where(and_(
                EventWindowModel.symbol == symbol,
                EventWindowModel.window_date == today
            ))
        )
        window_record = existing.scalar_one_or_none()

        if window_record:
            # 更新
            window_record.narrative_summary = narrative
            window_record.net_expectation = event_chain.features.net_expectation
            window_record.dominant_sentiment = event_chain.features.dominant_sentiment
            window_record.logical_consistency = event_chain.features.logical_consistency
            window_record.sentiment_volatility = event_chain.features.sentiment_volatility
            window_record.temporal_pattern = self.narrative_builder._classify_temporal_pattern(event_chain)
            window_record.event_count = len(event_chain.events)
        else:
            # 新建
            window_record = EventWindowModel(
                id=f"{symbol}_{today.isoformat()}",
                symbol=symbol,
                window_date=today,
                narrative_summary=narrative,
                net_expectation=event_chain.features.net_expectation,
                dominant_sentiment=event_chain.features.dominant_sentiment,
                logical_consistency=event_chain.features.logical_consistency,
                sentiment_volatility=event_chain.features.sentiment_volatility,
                temporal_pattern=self.narrative_builder._classify_temporal_pattern(event_chain),
                event_count=len(event_chain.events)
            )
            db.add(window_record)

        await db.commit()

    def _to_domain_events(self, db_events: List[EventModel]) -> List[Event]:
        """转换为领域事件模型"""
        return [
            Event(
                id=e.id,
                event_type=e.event_type,
                description=f"{e.trigger_word}({e.subject or ''}->{e.object or ''})",
                intensity=EventIntensity(
                    strength=e.intensity,
                    p_up=e.p_up,
                    p_down=e.p_down
                ),
                publish_time=e.publish_time,
                symbol=e.symbol,
                sentiment=e.sentiment,
                is_merged=e.is_merged == "true",
                merged_count=e.merged_count
            )
            for e in db_events
        ]

    def _to_domain_relations(
        self,
        db_relations: List[EventRelationModel]
    ) -> List[EventRelation]:
        """转换为领域关系模型"""
        return [
            EventRelation(
                event_a_id=r.event_a_id,
                event_b_id=r.event_b_id,
                relation=r.relation,
                confidence=r.confidence
            )
            for r in db_relations
        ]

    def _calculate_chain_features(
        self,
        events: List[Event]
    ) -> ChainFeatures:
        """计算事件链特征"""
        if not events:
            return ChainFeatures(
                net_expectation=0.0,
                dominant_sentiment="neutral",
                logical_consistency=0.0,
                sentiment_volatility=0.0
            )

        # 计算净预期强度（Fa值）
        intensities = [e.intensity for e in events]
        fa_value = self.intensity_calc.calculate_chain_fa(intensities)

        # 推导主导情绪
        dominant = self.narrative_builder._derive_dominant_sentiment(fa_value)

        # 计算情绪波动性
        sentiment_scores = [
            1.0 if e.sentiment == "positive" else
            -1.0 if e.sentiment == "negative" else 0.0
            for e in events
        ]
        import statistics
        volatility = statistics.stdev(sentiment_scores) if len(sentiment_scores) > 1 else 0.0

        # 逻辑一致性（简化计算：基于情绪方向一致性）
        positive_count = sum(1 for s in sentiment_scores if s > 0)
        negative_count = sum(1 for s in sentiment_scores if s < 0)
        total = len(sentiment_scores)

        if total == 0:
            consistency = 0.0
        else:
            # 同向情绪占比
            max_same_direction = max(positive_count, negative_count)
            consistency = max_same_direction / total

        return ChainFeatures(
            net_expectation=fa_value,
            dominant_sentiment=dominant,
            logical_consistency=consistency,
            sentiment_volatility=volatility
        )


# 全局实例（单例模式）
_window_manager: Optional[EventWindowManager] = None


def get_window_manager() -> EventWindowManager:
    """获取窗口管理器实例"""
    global _window_manager
    if _window_manager is None:
        from .intensity_calculator import EventIntensityCalculator
        from .temporal_analyzer import BooleanTemporalAnalyzer
        from .narrative_builder import EventNarrativeBuilder

        _window_manager = EventWindowManager(
            intensity_calculator=EventIntensityCalculator(),
            temporal_analyzer=BooleanTemporalAnalyzer(),
            narrative_builder=EventNarrativeBuilder()
        )
    return _window_manager
