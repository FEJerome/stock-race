"""
情感变化检测器

检测股票情感分析结果的变化，并在变化时触发事件通知。
用于C3-002B：完善情感变化事件发布
"""

import asyncio
from typing import Dict, Optional, Callable, Any
from datetime import datetime, timezone
from dataclasses import dataclass
from loguru import logger


@dataclass
class SentimentRecord:
    """情感记录"""
    stock_code: str
    sentiment: str  # positive / negative / neutral
    confidence: float
    timestamp: datetime
    source: str


@dataclass
class SentimentChangeEvent:
    """情感变化事件"""
    stock_code: str
    old_sentiment: str
    new_sentiment: str
    change_reason: str
    timestamp: datetime
    old_confidence: float
    new_confidence: float


class SentimentChangeDetector:
    """
    情感变化检测器

    功能：
    1. 维护股票情感历史记录
    2. 检测情感变化
    3. 触发情感变化事件
    4. 支持变化原因推断
    """

    def __init__(
        self,
        event_callback: Optional[Callable[[SentimentChangeEvent], Any]] = None,
        confidence_threshold: float = 0.7
    ):
        """
        初始化检测器

        Args:
            event_callback: 情感变化事件回调函数
            confidence_threshold: 触发变化事件的置信度阈值
        """
        self._sentiment_history: Dict[str, SentimentRecord] = {}
        self._event_callback = event_callback
        self._confidence_threshold = confidence_threshold
        self._lock = asyncio.Lock()

        logger.info(f"情感变化检测器初始化完成，置信度阈值: {confidence_threshold}")

    async def update_sentiment(
        self,
        stock_code: str,
        sentiment: str,
        confidence: float,
        source: str = "deepseek",
        reason: Optional[str] = None
    ) -> Optional[SentimentChangeEvent]:
        """
        更新股票情感并检测变化

        Args:
            stock_code: 股票代码
            sentiment: 新情感值 (positive/negative/neutral)
            confidence: 置信度
            source: 情感来源
            reason: 变化原因（可选）

        Returns:
            SentimentChangeEvent: 如果情感发生变化，返回变化事件；否则返回None
        """
        async with self._lock:
            # 创建新记录
            new_record = SentimentRecord(
                stock_code=stock_code,
                sentiment=sentiment,
                confidence=confidence,
                timestamp=datetime.now(timezone.utc),
                source=source
            )

            # 检查是否有历史记录
            old_record = self._sentiment_history.get(stock_code)

            # 更新历史记录
            self._sentiment_history[stock_code] = new_record

            # 如果没有历史记录，不触发变化事件（首次记录）
            if old_record is None:
                logger.debug(f"股票 {stock_code} 首次记录情感: {sentiment}")
                return None

            # 检查情感是否发生变化
            if old_record.sentiment == new_record.sentiment:
                logger.debug(f"股票 {stock_code} 情感未变化: {sentiment}")
                return None

            # 检查置信度是否达到阈值
            if confidence < self._confidence_threshold:
                logger.debug(
                    f"股票 {stock_code} 情感变化但置信度不足: "
                    f"{old_record.sentiment} -> {sentiment} (置信度: {confidence:.2f})"
                )
                return None

            # 推断变化原因
            change_reason = reason or self._infer_change_reason(
                old_record.sentiment,
                new_record.sentiment
            )

            # 创建变化事件
            change_event = SentimentChangeEvent(
                stock_code=stock_code,
                old_sentiment=old_record.sentiment,
                new_sentiment=new_record.sentiment,
                change_reason=change_reason,
                timestamp=datetime.now(timezone.utc),
                old_confidence=old_record.confidence,
                new_confidence=new_record.confidence
            )

            logger.info(
                f"检测到股票 {stock_code} 情感变化: "
                f"{old_record.sentiment} -> {new_record.sentiment}, "
                f"原因: {change_reason}"
            )

            # 触发事件回调
            if self._event_callback:
                try:
                    await self._trigger_event_callback(change_event)
                except Exception as e:
                    logger.error(f"触发情感变化事件回调失败: {e}")

            return change_event

    async def _trigger_event_callback(self, event: SentimentChangeEvent):
        """触发事件回调"""
        if asyncio.iscoroutinefunction(self._event_callback):
            await self._event_callback(event)
        else:
            self._event_callback(event)

    def _infer_change_reason(
        self,
        old_sentiment: str,
        new_sentiment: str
    ) -> str:
        """
        推断情感变化原因

        根据情感变化方向推断可能的原因
        """
        # 定义常见的情感变化原因映射
        reason_mapping = {
            ("negative", "positive"): "利好消息影响，市场情绪转暖",
            ("positive", "negative"): "利空消息影响，市场情绪转冷",
            ("neutral", "positive"): "出现积极信号，市场情绪升温",
            ("neutral", "negative"): "出现消极信号，市场情绪降温",
            ("positive", "neutral"): "利好消息消化，情绪回归中性",
            ("negative", "neutral"): "利空影响减弱，情绪趋于稳定",
        }

        return reason_mapping.get(
            (old_sentiment, new_sentiment),
            "市场情绪发生转变"
        )

    def get_sentiment_history(self, stock_code: str) -> Optional[SentimentRecord]:
        """
        获取股票情感历史记录

        Args:
            stock_code: 股票代码

        Returns:
            SentimentRecord: 历史记录，如果不存在返回None
        """
        return self._sentiment_history.get(stock_code)

    def get_all_sentiments(self) -> Dict[str, SentimentRecord]:
        """
        获取所有股票情感记录

        Returns:
            Dict[str, SentimentRecord]: 股票代码到情感记录的映射
        """
        return self._sentiment_history.copy()

    async def batch_update_sentiments(
        self,
        updates: list
    ) -> list:
        """
        批量更新股票情感

        Args:
            updates: 更新列表，每项为字典包含 stock_code, sentiment, confidence, source, reason

        Returns:
            list: 触发的情感变化事件列表
        """
        change_events = []

        for update in updates:
            event = await self.update_sentiment(
                stock_code=update["stock_code"],
                sentiment=update["sentiment"],
                confidence=update.get("confidence", 0.8),
                source=update.get("source", "deepseek"),
                reason=update.get("reason")
            )
            if event:
                change_events.append(event)

        logger.info(f"批量更新完成，触发 {len(change_events)} 个情感变化事件")
        return change_events

    def clear_history(self, stock_code: Optional[str] = None):
        """
        清除情感历史记录

        Args:
            stock_code: 股票代码，如果为None则清除所有记录
        """
        if stock_code:
            self._sentiment_history.pop(stock_code, None)
            logger.debug(f"清除股票 {stock_code} 的情感历史")
        else:
            self._sentiment_history.clear()
            logger.info("清除所有股票的情感历史")

    def get_statistics(self) -> Dict[str, Any]:
        """
        获取检测器统计信息

        Returns:
            Dict: 统计信息
        """
        sentiments = list(self._sentiment_history.values())

        if not sentiments:
            return {
                "total_stocks": 0,
                "sentiment_distribution": {},
                "avg_confidence": 0.0
            }

        # 统计情感分布
        sentiment_counts = {}
        for record in sentiments:
            sentiment_counts[record.sentiment] = sentiment_counts.get(
                record.sentiment, 0
            ) + 1

        # 计算平均置信度
        avg_confidence = sum(r.confidence for r in sentiments) / len(sentiments)

        return {
            "total_stocks": len(sentiments),
            "sentiment_distribution": sentiment_counts,
            "avg_confidence": round(avg_confidence, 2)
        }
