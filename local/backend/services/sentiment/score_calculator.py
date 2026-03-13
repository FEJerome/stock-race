"""
情绪得分计算器

计算聚合情绪得分和热度得分
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import math
import logging

logger = logging.getLogger(__name__)


@dataclass
class SentimentScore:
    """情绪得分结果"""
    overall_score: float  # -100 to 100
    positive_ratio: float  # 0-1
    negative_ratio: float  # 0-1
    neutral_ratio: float  # 0-1
    hot_score: float  # 0-100 热度得分
    post_count: int
    weighted_count: float  # 考虑互动量权重
    avg_confidence: float  # 平均置信度


class SentimentScoreCalculator:
    """
    情绪得分计算器

    计算聚合情绪得分和热度得分
    """

    # 热度计算权重
    HOT_POST_WEIGHT = 1.0  # 帖子基础权重
    HOT_LIKE_WEIGHT = 0.1  # 点赞权重
    HOT_COMMENT_WEIGHT = 0.5  # 评论权重
    HOT_VIEW_WEIGHT = 0.01  # 浏览权重

    # 时间衰减系数 (24小时内)
    TIME_DECAY_HOURS = 24

    def calculate_aggregate_score(
        self,
        posts: List[Dict[str, Any]]
    ) -> SentimentScore:
        """
        计算聚合情绪得分

        Args:
            posts: 帖子列表，每个帖子包含:
                - sentiment: str (positive/negative/neutral)
                - confidence: float (0-1)
                - score: float (-1 to 1)
                - likes: int
                - comments: int
                - views: int
                - timestamp: datetime (可选)

        Returns:
            SentimentScore 聚合结果
        """
        if not posts:
            return SentimentScore(
                overall_score=0.0,
                positive_ratio=0.0,
                negative_ratio=0.0,
                neutral_ratio=1.0,
                hot_score=0.0,
                post_count=0,
                weighted_count=0.0,
                avg_confidence=0.0
            )

        total_posts = len(posts)

        # 统计各情绪数量
        positive_count = sum(1 for p in posts if p.get('sentiment') == 'positive')
        negative_count = sum(1 for p in posts if p.get('sentiment') == 'negative')
        neutral_count = total_posts - positive_count - negative_count

        # 计算比例
        positive_ratio = positive_count / total_posts
        negative_ratio = negative_count / total_posts
        neutral_ratio = neutral_count / total_posts

        # 计算加权情绪得分
        total_weight = 0.0
        weighted_score = 0.0
        total_confidence = 0.0
        weighted_posts = 0.0

        for post in posts:
            sentiment = post.get('sentiment', 'neutral')
            confidence = post.get('confidence', 0.5)
            score = post.get('score', 0.0)

            # 计算帖子权重 (基于互动量)
            interaction_weight = self._calculate_interaction_weight(post)

            # 时间衰减权重
            time_weight = self._calculate_time_weight(post.get('timestamp'))

            # 综合权重
            post_weight = interaction_weight * time_weight * confidence

            weighted_score += score * post_weight
            total_weight += post_weight
            total_confidence += confidence
            weighted_posts += interaction_weight

        # 计算最终得分 (-100 to 100)
        if total_weight > 0:
            overall_score = (weighted_score / total_weight) * 100
            overall_score = max(-100, min(100, overall_score))
        else:
            overall_score = 0.0

        # 计算热度得分
        hot_score = self._calculate_hot_score(posts)

        # 平均置信度
        avg_confidence = total_confidence / total_posts if total_posts > 0 else 0.0

        return SentimentScore(
            overall_score=round(overall_score, 2),
            positive_ratio=round(positive_ratio, 3),
            negative_ratio=round(negative_ratio, 3),
            neutral_ratio=round(neutral_ratio, 3),
            hot_score=round(hot_score, 2),
            post_count=total_posts,
            weighted_count=round(weighted_posts, 2),
            avg_confidence=round(avg_confidence, 3)
        )

    def _calculate_interaction_weight(self, post: Dict[str, Any]) -> float:
        """
        计算互动权重

        基于点赞、评论、浏览量计算权重
        """
        likes = post.get('likes', 0) or 0
        comments = post.get('comments', 0) or 0
        views = post.get('views', 0) or 0

        weight = (
            self.HOT_POST_WEIGHT +
            likes * self.HOT_LIKE_WEIGHT +
            comments * self.HOT_COMMENT_WEIGHT +
            views * self.HOT_VIEW_WEIGHT
        )

        # 对数压缩，避免极端值影响
        return math.log1p(weight)

    def _calculate_time_weight(self, timestamp: Optional[datetime]) -> float:
        """
        计算时间衰减权重

        越新的帖子权重越高
        """
        if not timestamp:
            return 0.5  # 默认权重

        now = datetime.utcnow()
        if timestamp.tzinfo:
            timestamp = timestamp.replace(tzinfo=None)

        hours_ago = (now - timestamp).total_seconds() / 3600

        if hours_ago < 0:
            hours_ago = 0

        if hours_ago > self.TIME_DECAY_HOURS:
            return 0.1  # 超过24小时，低权重

        # 线性衰减
        weight = 1.0 - (hours_ago / self.TIME_DECAY_HOURS) * 0.9
        return max(0.1, weight)

    def _calculate_hot_score(self, posts: List[Dict[str, Any]]) -> float:
        """
        计算热度得分 (0-100)

        基于帖子数量、互动量和时间分布计算
        """
        if not posts:
            return 0.0

        # 基础热度 (帖子数量)
        post_count = len(posts)
        base_hot = min(post_count * 5, 50)  # 最多50分

        # 互动热度
        total_interaction = 0
        recent_posts = 0

        now = datetime.utcnow()

        for post in posts:
            likes = post.get('likes', 0) or 0
            comments = post.get('comments', 0) or 0
            views = post.get('views', 0) or 0

            # 互动得分
            interaction = likes + comments * 2 + views * 0.01
            total_interaction += interaction

            # 统计最近帖子
            timestamp = post.get('timestamp')
            if timestamp:
                if timestamp.tzinfo:
                    timestamp = timestamp.replace(tzinfo=None)
                hours_ago = (now - timestamp).total_seconds() / 3600
                if hours_ago <= 6:  # 6小时内
                    recent_posts += 1

        # 互动热度 (对数压缩)
        interaction_hot = min(math.log1p(total_interaction) * 10, 30)

        # 时效热度 (最近帖子越多越热)
        recency_hot = min(recent_posts * 4, 20)

        hot_score = base_hot + interaction_hot + recency_hot
        return min(100, hot_score)

    def calculate_trend_direction(
        self,
        current: SentimentScore,
        previous: Optional[SentimentScore] = None
    ) -> str:
        """
        判断情绪趋势方向

        Returns:
            'rising' | 'falling' | 'stable'
        """
        if not previous:
            if current.overall_score > 20:
                return 'rising'
            elif current.overall_score < -20:
                return 'falling'
            return 'stable'

        score_diff = current.overall_score - previous.overall_score

        if score_diff > 10:
            return 'rising'
        elif score_diff < -10:
            return 'falling'
        return 'stable'

    def get_hot_ranking_score(
        self,
        posts: List[Dict[str, Any]],
        symbol: str
    ) -> Dict[str, Any]:
        """
        计算热度排行得分 (综合指标)

        Returns:
            包含热度详情和排行的字典
        """
        score = self.calculate_aggregate_score(posts)

        # 计算额外指标
        total_likes = sum(p.get('likes', 0) or 0 for p in posts)
        total_comments = sum(p.get('comments', 0) or 0 for p in posts)
        total_views = sum(p.get('views', 0) or 0 for p in posts)

        # 热度变化率 (简化计算)
        hot_velocity = score.post_count * 0.5 + total_comments * 0.3

        return {
            'symbol': symbol,
            'hot_score': score.hot_score,
            'overall_sentiment': score.overall_score,
            'post_count': score.post_count,
            'total_likes': total_likes,
            'total_comments': total_comments,
            'total_views': total_views,
            'hot_velocity': round(hot_velocity, 2),
            'positive_ratio': score.positive_ratio,
            'negative_ratio': score.negative_ratio,
        }