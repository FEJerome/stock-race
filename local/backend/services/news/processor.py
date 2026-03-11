"""
News Sentiment Processor - Keyword-based sentiment analysis

No AI model calls, zero token cost.
Reference: archive/v0.9-legacy/docs/modules/news-service/HAVE_DONE.md
"""
from dataclasses import dataclass
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import re


@dataclass
class NewsIntelligence:
    """Structured intelligence - stored in SQLite"""
    id: str
    symbol: str
    headline: str              # One-line summary (≤50 chars)
    sentiment: str             # positive/negative/neutral
    confidence: float          # Confidence 0-1
    relevance_score: float     # Relevance 0-1
    key_points: List[str]      # Key information points
    source: str
    url: str
    publish_time: datetime
    expires_at: datetime       # Expire after 7 days


class SentimentProcessor:
    """
    News sentiment analysis processor using keyword matching

    Zero token cost for Local edition.
    Reference: v0.9 design, simplified for Local version.
    """

    # Positive word list
    POSITIVE_WORDS = [
        "预增", "增长", "突破", "利好", "上涨", "买入", "增持",
        "涨停", "新高", "强劲", "反弹", "复苏", "超预期",
        "合作", "签约", "订单", "中标", "获批", "并购", "收购",
        "盈利", "净利润增长", "营收增长", "扩张", "进军"
    ]

    # Negative word list
    NEGATIVE_WORDS = [
        "预减", "亏损", "下跌", "利空", "减持", "卖出",
        "跌停", "新低", "疲软", "下滑", "衰退", "低于预期",
        "违规", "处罚", "调查", "召回", "事故", "违约",
        "亏损", "净利润下降", "营收下降", "裁员", "关闭"
    ]

    # Neutral context words (for relevance calculation)
    NEUTRAL_CONTEXT = [
        "公告", "报告", "会议", "计划", "进展", "完成", "发布"
    ]

    def __init__(self):
        self._compile_patterns()

    def _compile_patterns(self):
        """Pre-compile regex patterns"""
        self._pos_pattern = re.compile('|'.join(self.POSITIVE_WORDS))
        self._neg_pattern = re.compile('|'.join(self.NEGATIVE_WORDS))

    def process(self, news_item) -> Optional[NewsIntelligence]:
        """
        Process single news item into structured intelligence

        Returns:
            NewsIntelligence object, or None if filtered out
        """
        # 1. Calculate relevance
        relevance = self._calculate_relevance(news_item)
        if relevance < 0.6:
            return None  # Low relevance, discard

        # 2. Check time (news within 24 hours)
        if news_item.publish_time:
            age = datetime.utcnow() - news_item.publish_time
            if age > timedelta(hours=24):
                return None  # Old news, discard

        # 3. Sentiment analysis
        sentiment, confidence = self._analyze_sentiment(news_item)

        # 4. Extract key points
        key_points = self._extract_key_points(news_item)

        # 5. Generate headline
        headline = self._generate_headline(news_item, sentiment)

        return NewsIntelligence(
            id=news_item.id,
            symbol=news_item.symbol,
            headline=headline,
            sentiment=sentiment,
            confidence=confidence,
            relevance_score=relevance,
            key_points=key_points,
            source=news_item.source,
            url=news_item.url,
            publish_time=news_item.publish_time,
            expires_at=datetime.utcnow() + timedelta(days=7)
        )

    def _calculate_relevance(self, news_item) -> float:
        """Calculate news-stock relevance"""
        text = news_item.title + " " + news_item.summary

        # High relevance if stock code in text
        code = news_item.symbol.split('.')[0]
        if code in text:
            return 0.95

        # Calculate based on keyword density
        pos_count = len(self._pos_pattern.findall(text))
        neg_count = len(self._neg_pattern.findall(text))
        total = len(text) / 10  # One scoring unit per 10 chars

        if total == 0:
            return 0.0

        relevance = min(0.9, (pos_count + neg_count) / total * 0.5 + 0.5)
        return relevance

    def _analyze_sentiment(self, news_item) -> tuple:
        """Analyze sentiment using keyword matching"""
        text = news_item.title + " " + news_item.summary

        pos_count = len(self._pos_pattern.findall(text))
        neg_count = len(self._neg_pattern.findall(text))
        total_words = len(text)

        if pos_count > neg_count:
            sentiment = "positive"
            confidence = min(1.0, pos_count / (pos_count + neg_count + 1) + 0.3)
        elif neg_count > pos_count:
            sentiment = "negative"
            confidence = min(1.0, neg_count / (pos_count + neg_count + 1) + 0.3)
        else:
            sentiment = "neutral"
            confidence = 0.5

        return sentiment, round(confidence, 2)

    def _extract_key_points(self, news_item) -> List[str]:
        """Extract key information points"""
        points = []
        text = news_item.title

        # Extract keywords contained in title
        for word in self.POSITIVE_WORDS + self.NEGATIVE_WORDS:
            if word in text and word not in points:
                points.append(word)
                if len(points) >= 3:
                    break

        return points[:3]

    def _generate_headline(self, news_item, sentiment: str) -> str:
        """Generate one-line summary"""
        headline = news_item.title[:50]
        if len(news_item.title) > 50:
            headline += "..."
        return headline


class DuplicateDetector:
    """
    News duplicate detector using title similarity

    Reference: v0.9 design, similarity threshold 0.9
    """

    def __init__(self, similarity_threshold: float = 0.9):
        self.threshold = similarity_threshold
        self._seen_titles: Dict[str, str] = {}  # normalized -> original

    def is_duplicate(self, title: str) -> bool:
        """Check if news is duplicate"""
        normalized = self._normalize(title)

        for seen_normalized in self._seen_titles:
            similarity = self._calculate_similarity(normalized, seen_normalized)
            if similarity > self.threshold:
                return True

        self._seen_titles[normalized] = title
        return False

    def _normalize(self, title: str) -> str:
        """Normalize title for comparison"""
        # Remove punctuation, spaces, convert to lowercase
        return re.sub(r'[^\w]', '', title.lower())

    def _calculate_similarity(self, s1: str, s2: str) -> float:
        """Calculate string similarity (simplified version)"""
        if not s1 or not s2:
            return 0.0

        # Simple containment check
        if s1 in s2 or s2 in s1:
            longer = max(len(s1), len(s2))
            shorter = min(len(s1), len(s2))
            return shorter / longer

        # Calculate common character ratio
        set1, set2 = set(s1), set(s2)
        intersection = len(set1 & set2)
        union = len(set1 | set2)

        return intersection / union if union > 0 else 0.0

    def clear(self):
        """Clear seen titles (call periodically to prevent memory growth)"""
        self._seen_titles.clear()
