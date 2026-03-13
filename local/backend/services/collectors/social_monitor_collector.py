"""
社交舆情监控采集器

增强的舆情采集器，支持：
1. AI情绪分析
2. 热度追踪
3. 趋势聚合
"""
import asyncio
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
import logging

from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from .base import BaseCollector, CollectionResult
from ..sentiment.base import SentimentSource
from ..sentiment.xueqiu_source import XueqiuSentimentSource
from ..sentiment.eastmoney_guba_source import EastmoneyGubaSource
from ..sentiment.ai_analyzer import SentimentAIAnalyzer
from ..sentiment.score_calculator import SentimentScoreCalculator
from models.database import SentimentTrendModel

logger = logging.getLogger(__name__)


class SocialMonitorCollector(BaseCollector):
    """
    社交舆情监控采集器

    继承BaseCollector，整合多个舆情源：
    - 雪球网 (Xueqiu)
    - 东方财富股吧 (Guba)

    增强功能：
    1. AI情绪分析（可选）
    2. 热度追踪
    3. 情绪趋势聚合
    """

    def __init__(
        self,
        sources: Optional[List[SentimentSource]] = None,
        use_ai_analysis: bool = False,
        ai_adapter=None,
        db_session: Optional[AsyncSession] = None,
        priority: int = 70
    ):
        """
        初始化社交监控采集器

        Args:
            sources: 舆情源列表，默认使用雪球+股吧
            use_ai_analysis: 是否启用AI情绪分析
            ai_adapter: AI适配器实例（启用AI分析时必需）
            db_session: 数据库会话
            priority: 采集器优先级
        """
        super().__init__(name="social_monitor", priority=priority)

        self.sources = sources or [
            XueqiuSentimentSource(priority=60),
            EastmoneyGubaSource(priority=80)
        ]
        self.use_ai_analysis = use_ai_analysis
        self.ai_analyzer = SentimentAIAnalyzer(ai_adapter) if (use_ai_analysis and ai_adapter) else None
        self.score_calculator = SentimentScoreCalculator()
        self.db_session = db_session

    async def collect(
        self,
        symbol: str,
        since: Optional[datetime] = None,
        limit: int = 50
    ) -> CollectionResult:
        """
        采集社交舆情数据

        Args:
            symbol: 股票代码 (如 "000001.SZ")
            since: 增量采集时间起点
            limit: 每个源最大采集数量

        Returns:
            CollectionResult 采集结果
        """
        self._set_running()
        start_time = datetime.now(timezone.utc)

        # 默认采集最近24小时
        if since is None:
            since = start_time - timedelta(hours=24)

        try:
            all_posts = []
            source_stats = {}

            # 1. 从所有源采集帖子
            for source in self.sources:
                try:
                    posts = await source.fetch_posts(symbol, limit=limit)
                    all_posts.extend(posts)
                    source_stats[source.name] = len(posts)
                    logger.info(f"从 {source.name} 采集到 {len(posts)} 条帖子")
                except Exception as e:
                    logger.warning(f"采集源 {source.name} 失败: {e}")
                    source_stats[source.name] = 0

            if not all_posts:
                return CollectionResult(
                    source_name=self.get_source_name(),
                    symbol=symbol,
                    items=[],
                    count=0,
                    start_time=start_time,
                    end_time=datetime.now(timezone.utc),
                    success=True,
                    next_since=start_time
                )

            # 2. 过滤时间范围
            filtered_posts = self._filter_by_time(all_posts, since)

            # 3. 情绪分析
            analyzed_posts = await self._analyze_sentiment(filtered_posts)

            # 4. 计算聚合得分
            score_result = self.score_calculator.calculate_aggregate_score(
                [p.__dict__ if hasattr(p, '__dict__') else p for p in analyzed_posts]
            )

            # 5. 保存趋势数据
            trend_record = await self._save_trend(
                symbol=symbol,
                score_result=score_result,
                source_stats=source_stats,
                posts=analyzed_posts
            )

            # 6. 更新健康状态
            duration_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            self._update_health_success(duration_ms)
            self.update_last_since(symbol, start_time)

            # 7. 构建结果
            items = [{
                'post_id': p.id if hasattr(p, 'id') else str(i),
                'content': p.content if hasattr(p, 'content') else str(p),
                'sentiment': p.sentiment if hasattr(p, 'sentiment') else 'neutral',
                'score': p.score if hasattr(p, 'score') else 0,
                'source': p.source if hasattr(p, 'source') else 'unknown',
            } for i, p in enumerate(analyzed_posts)]

            return CollectionResult(
                source_name=self.get_source_name(),
                symbol=symbol,
                items=items,
                count=len(items),
                start_time=start_time,
                end_time=datetime.now(timezone.utc),
                success=True,
                next_since=start_time
            )

        except Exception as e:
            self._update_health_error(str(e))
            logger.error(f"社交舆情采集失败 {symbol}: {e}")
            return CollectionResult(
                source_name=self.get_source_name(),
                symbol=symbol,
                items=[],
                count=0,
                start_time=start_time,
                end_time=datetime.now(timezone.utc),
                success=False,
                error_message=str(e),
                next_since=since
            )

    def _filter_by_time(self, posts: List[Any], since: datetime) -> List[Any]:
        """按时间过滤帖子"""
        filtered = []
        for post in posts:
            publish_time = getattr(post, 'publish_time', None)
            if publish_time:
                # 统一时区处理
                if publish_time.tzinfo and not since.tzinfo:
                    publish_time = publish_time.replace(tzinfo=None)
                elif not publish_time.tzinfo and since.tzinfo:
                    since = since.replace(tzinfo=None)

                if publish_time >= since:
                    filtered.append(post)
            else:
                # 没有时间戳的帖子默认包含
                filtered.append(post)
        return filtered

    async def _analyze_sentiment(self, posts: List[Any]) -> List[Any]:
        """
        分析帖子情绪

        如果启用AI分析，使用AI；否则使用基于规则的分类
        """
        if not self.ai_analyzer or len(posts) == 0:
            # 使用基于规则的分类
            for post in posts:
                content = getattr(post, 'content', '') or getattr(post, 'title', '')
                sentiment = self._rule_based_classify(content)
                post.sentiment = sentiment
                post.score = self._sentiment_to_score(sentiment)
                post.confidence = 0.5
            return posts

        # 使用AI分析
        try:
            texts = [
                getattr(post, 'content', '') or getattr(post, 'title', '')
                for post in posts
            ]

            results = await self.ai_analyzer.analyze_batch(texts, batch_size=5)

            for post, result in zip(posts, results):
                post.sentiment = result.sentiment
                post.score = result.score
                post.confidence = result.confidence
                post.keywords = result.keywords

        except Exception as e:
            logger.warning(f"AI情绪分析失败，降级到规则分类: {e}")
            for post in posts:
                content = getattr(post, 'content', '') or getattr(post, 'title', '')
                sentiment = self._rule_based_classify(content)
                post.sentiment = sentiment
                post.score = self._sentiment_to_score(sentiment)
                post.confidence = 0.5

        return posts

    def _rule_based_classify(self, text: str) -> str:
        """基于规则的情绪分类"""
        if not text:
            return 'neutral'

        text = text.lower()

        positive_words = [
            '涨', '涨停', '大涨', '暴涨', '涨涨涨', '起飞', '吃肉',
            '牛市', '看多', '买入', '加仓', '抄底', '反弹', '突破',
            '看好', '优质', '龙头', '利好', '增长', '爆发', '翻倍',
            '牛', '强', '稳了', '冲', '上', '赢', '赚'
        ]

        negative_words = [
            '跌', '跌停', '大跌', '暴跌', '跌跌不休', '亏', '割肉',
            '熊市', '看空', '卖出', '减仓', '清仓', '跳水', '崩盘',
            '看衰', '垃圾', '跑路', '利空', '亏损', '套牢', '血亏',
            '熊', '弱', '完了', '崩', '输', '赔', '坑'
        ]

        pos_count = sum(1 for word in positive_words if word in text)
        neg_count = sum(1 for word in negative_words if word in text)

        if pos_count > neg_count:
            return 'positive'
        elif neg_count > pos_count:
            return 'negative'
        return 'neutral'

    def _sentiment_to_score(self, sentiment: str) -> float:
        """情绪标签转换为得分"""
        mapping = {
            'positive': 0.5,
            'negative': -0.5,
            'neutral': 0.0
        }
        return mapping.get(sentiment, 0.0)

    async def _save_trend(
        self,
        symbol: str,
        score_result: Any,
        source_stats: Dict[str, int],
        posts: List[Any]
    ) -> Optional[SentimentTrendModel]:
        """
        保存情绪趋势数据
        """
        if not self.db_session:
            return None

        try:
            # 按小时粒度聚合
            timestamp = datetime.now(timezone.utc).replace(
                minute=0, second=0, microsecond=0
            )

            trend_id = f"{symbol}_{timestamp.isoformat()}"

            # 统计数据源
            xueqiu_count = source_stats.get('xueqiu', 0)
            guba_count = source_stats.get('eastmoney_guba', 0)

            # 计算互动总量
            total_interaction = sum(
                (getattr(p, 'likes', 0) or 0) +
                (getattr(p, 'comments', 0) or 0) +
                (getattr(p, 'views', 0) or 0)
                for p in posts
            )

            # 构建详情
            sentiment_details = {
                'avg_confidence': score_result.avg_confidence,
                'weighted_count': score_result.weighted_count,
                'sources': source_stats,
            }

            # 检查是否已存在该时段记录
            stmt = select(SentimentTrendModel).where(
                and_(
                    SentimentTrendModel.symbol == symbol,
                    SentimentTrendModel.timestamp == timestamp
                )
            )
            result = await self.db_session.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                # 更新现有记录
                existing.post_count += score_result.post_count
                existing.positive_count += int(score_result.positive_ratio * score_result.post_count)
                existing.negative_count += int(score_result.negative_ratio * score_result.post_count)
                existing.neutral_count += int(score_result.neutral_ratio * score_result.post_count)
                existing.hot_score = max(existing.hot_score, score_result.hot_score)
                existing.mention_count += score_result.post_count
                existing.interaction_count += total_interaction
                existing.xueqiu_count += xueqiu_count
                existing.guba_count += guba_count
                existing.sentiment_details = sentiment_details
            else:
                # 创建新记录
                trend = SentimentTrendModel(
                    id=trend_id,
                    symbol=symbol,
                    timestamp=timestamp,
                    sentiment_score=score_result.overall_score,
                    sentiment_label=self._score_to_label(score_result.overall_score),
                    post_count=score_result.post_count,
                    positive_count=int(score_result.positive_ratio * score_result.post_count),
                    negative_count=int(score_result.negative_ratio * score_result.post_count),
                    neutral_count=int(score_result.neutral_ratio * score_result.post_count),
                    hot_score=score_result.hot_score,
                    mention_count=score_result.post_count,
                    interaction_count=total_interaction,
                    xueqiu_count=xueqiu_count,
                    guba_count=guba_count,
                    sentiment_details=sentiment_details
                )
                self.db_session.add(trend)

            await self.db_session.commit()

            return existing if existing else trend

        except Exception as e:
            logger.error(f"保存情绪趋势失败: {e}")
            return None

    def _score_to_label(self, score: float) -> str:
        """得分转换为标签"""
        if score > 20:
            return 'positive'
        elif score < -20:
            return 'negative'
        return 'neutral'

    async def get_sentiment_trend(
        self,
        symbol: str,
        days: int = 7
    ) -> List[Dict[str, Any]]:
        """
        获取情绪趋势历史

        Args:
            symbol: 股票代码
            days: 天数

        Returns:
            趋势数据列表
        """
        if not self.db_session:
            return []

        try:
            start_time = datetime.now(timezone.utc) - timedelta(days=days)

            stmt = select(SentimentTrendModel).where(
                and_(
                    SentimentTrendModel.symbol == symbol,
                    SentimentTrendModel.timestamp >= start_time
                )
            ).order_by(SentimentTrendModel.timestamp)

            result = await self.db_session.execute(stmt)
            records = result.scalars().all()

            return [
                {
                    'timestamp': r.timestamp.isoformat(),
                    'sentiment_score': r.sentiment_score,
                    'sentiment_label': r.sentiment_label,
                    'hot_score': r.hot_score,
                    'post_count': r.post_count,
                    'positive_ratio': r.positive_count / r.post_count if r.post_count > 0 else 0,
                    'negative_ratio': r.negative_count / r.post_count if r.post_count > 0 else 0,
                    'interaction_count': r.interaction_count,
                }
                for r in records
            ]

        except Exception as e:
            logger.error(f"获取情绪趋势失败: {e}")
            return []

    async def get_hot_ranking(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        获取热度排行榜

        Args:
            limit: 返回数量

        Returns:
            热度排行列表
        """
        if not self.db_session:
            return []

        try:
            # 获取最近24小时的数据
            start_time = datetime.now(timezone.utc) - timedelta(hours=24)

            stmt = select(SentimentTrendModel).where(
                SentimentTrendModel.timestamp >= start_time
            ).order_by(desc(SentimentTrendModel.hot_score)).limit(limit)

            result = await self.db_session.execute(stmt)
            records = result.scalars().all()

            return [
                {
                    'symbol': r.symbol,
                    'hot_score': r.hot_score,
                    'sentiment_score': r.sentiment_score,
                    'sentiment_label': r.sentiment_label,
                    'mention_count': r.mention_count,
                    'interaction_count': r.interaction_count,
                    'post_count': r.post_count,
                }
                for r in records
            ]

        except Exception as e:
            logger.error(f"获取热度排行失败: {e}")
            return []

    def get_source_name(self) -> str:
        """返回数据源名称"""
        return "social_monitor"

    async def close(self):
        """关闭所有源"""
        for source in self.sources:
            if hasattr(source, 'close'):
                await source.close()
