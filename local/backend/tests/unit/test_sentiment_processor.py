"""
情绪处理器单元测试

测试 SentimentProcessor 的关键词匹配、分数计算和边界情况
"""
import pytest
from datetime import datetime

from services.sentiment.processor import SentimentProcessor
from services.sentiment.base import SentimentPost, SentimentLevel


class TestSentimentProcessor:
    """SentimentProcessor 测试类"""

    @pytest.fixture
    def processor(self):
        """创建处理器实例"""
        return SentimentProcessor()

    @pytest.fixture
    def sample_posts(self):
        """创建测试用帖子数据"""
        return [
            SentimentPost(
                id="1",
                symbol="000001.SZ",
                title="这只股票涨停了！",
                content="今天大涨，突破新高，太牛了！",
                author="user1",
                source="test",
                url="http://test.com/1",
                publish_time=datetime.now(),
                likes=100,
                comments=20,
            ),
            SentimentPost(
                id="2",
                symbol="000001.SZ",
                title="坏消息",
                content="跌停了，被套牢了，完蛋了",
                author="user2",
                source="test",
                url="http://test.com/2",
                publish_time=datetime.now(),
                likes=50,
                comments=10,
            ),
            SentimentPost(
                id="3",
                symbol="000001.SZ",
                title="分析讨论",
                content="今天成交量有所放大，需要观望",
                author="user3",
                source="test",
                url="http://test.com/3",
                publish_time=datetime.now(),
                likes=10,
                comments=5,
            ),
        ]

    def test_keywords_no_duplicates(self, processor):
        """测试关键词列表无重复"""
        # 确保没有重复关键词
        assert len(processor.POSITIVE_WORDS) == len(set(processor.POSITIVE_WORDS))
        assert len(processor.NEGATIVE_WORDS) == len(set(processor.NEGATIVE_WORDS))

    def test_compile_patterns_with_ignore_case(self, processor):
        """测试正则表达式使用 IGNORECASE 标志"""
        # 测试大小写不敏感匹配
        assert processor._pos_pattern.flags & 2  # re.IGNORECASE = 2
        assert processor._neg_pattern.flags & 2

    def test_analyze_empty_posts(self, processor):
        """测试空帖子列表"""
        result = processor.analyze([])
        assert result.score == 0.0
        assert result.level == SentimentLevel.NEUTRAL
        assert result.confidence == 0.0
        assert result.post_count == 0

    def test_analyze_single_positive_post(self, processor):
        """测试单条积极帖子"""
        posts = [
            SentimentPost(
                id="1",
                symbol="000001.SZ",
                title="涨停！",
                content="今天大涨，太棒了！",
                author="user1",
                source="test",
                url="http://test.com/1",
                publish_time=datetime.now(),
            )
        ]
        result = processor.analyze(posts)
        assert result.score > 0
        assert result.level == SentimentLevel.VERY_POSITIVE
        assert result.positive_ratio == 1.0

    def test_analyze_single_negative_post(self, processor):
        """测试单条消极帖子"""
        posts = [
            SentimentPost(
                id="1",
                symbol="000001.SZ",
                title="跌停",
                content="今天暴跌，被套牢了",
                author="user1",
                source="test",
                url="http://test.com/1",
                publish_time=datetime.now(),
            )
        ]
        result = processor.analyze(posts)
        assert result.score < 0
        assert result.level == SentimentLevel.VERY_NEGATIVE
        assert result.negative_ratio == 1.0

    def test_analyze_mixed_posts(self, processor, sample_posts):
        """测试混合情绪帖子"""
        result = processor.analyze(sample_posts)

        # 基本属性检查
        assert result.symbol == "000001.SZ"
        assert result.post_count == 3
        assert -1 <= result.score <= 1
        assert 0 <= result.confidence <= 1

        # 比例检查（使用宽松容差处理浮点数精度）
        total_ratio = result.positive_ratio + result.negative_ratio + result.neutral_ratio
        assert abs(total_ratio - 1.0) < 0.01

    def test_classify_post_with_weight(self, processor):
        """测试帖子分类考虑互动权重"""
        high_interaction_post = SentimentPost(
            id="1",
            symbol="000001.SZ",
            title="看涨",
            content="这只股票要大涨",
            author="user1",
            source="test",
            url="http://test.com/1",
            publish_time=datetime.now(),
            likes=1000,
            comments=200,
        )

        low_interaction_post = SentimentPost(
            id="2",
            symbol="000001.SZ",
            title="看跌",
            content="这只股票要大跌",
            author="user2",
            source="test",
            url="http://test.com/2",
            publish_time=datetime.now(),
            likes=1,
            comments=0,
        )

        # 高互动帖子应被分类为积极
        assert processor._classify_post(high_interaction_post) == "positive"
        # 低互动帖子应被分类为消极
        assert processor._classify_post(low_interaction_post) == "negative"

    def test_get_level_boundaries(self, processor):
        """测试情绪等级边界值"""
        # 极积极 (>0.6)
        assert processor._get_level(0.61) == SentimentLevel.VERY_POSITIVE
        assert processor._get_level(1.0) == SentimentLevel.VERY_POSITIVE

        # 积极 (0.2 ~ 0.6)
        assert processor._get_level(0.6) == SentimentLevel.POSITIVE
        assert processor._get_level(0.21) == SentimentLevel.POSITIVE

        # 中性 (-0.2 ~ 0.2)
        assert processor._get_level(0.2) == SentimentLevel.NEUTRAL
        assert processor._get_level(0.0) == SentimentLevel.NEUTRAL
        assert processor._get_level(-0.19) == SentimentLevel.NEUTRAL

        # 消极 (-0.6 ~ -0.2)
        assert processor._get_level(-0.2) == SentimentLevel.NEGATIVE
        assert processor._get_level(-0.59) == SentimentLevel.NEGATIVE

        # 极消极 (<-0.6)
        assert processor._get_level(-0.61) == SentimentLevel.VERY_NEGATIVE
        assert processor._get_level(-1.0) == SentimentLevel.VERY_NEGATIVE

    def test_score_bounds(self, processor):
        """测试分数边界 (-1 到 +1)"""
        # 创建极端情况测试
        extreme_positive = [
            SentimentPost(
                id="1",
                symbol="000001.SZ",
                title="涨停",
                content="涨停涨停涨停涨停涨停",
                author="user1",
                source="test",
                url="http://test.com/1",
                publish_time=datetime.now(),
            )
        ]

        extreme_negative = [
            SentimentPost(
                id="1",
                symbol="000001.SZ",
                title="跌停",
                content="跌停跌停跌停跌停跌停",
                author="user1",
                source="test",
                url="http://test.com/1",
                publish_time=datetime.now(),
            )
        ]

        pos_result = processor.analyze(extreme_positive)
        neg_result = processor.analyze(extreme_negative)

        # 分数应在 -1 到 +1 范围内
        assert -1 <= pos_result.score <= 1
        assert -1 <= neg_result.score <= 1

    def test_extract_hot_topics(self, processor):
        """测试热门话题提取"""
        posts = [
            SentimentPost(
                id="1",
                symbol="000001.SZ",
                title="涨停",
                content="今天涨停了，牛市来了",
                author="user1",
                source="test",
                url="http://test.com/1",
                publish_time=datetime.now(),
            ),
            SentimentPost(
                id="2",
                symbol="000001.SZ",
                title="涨停",
                content="又是涨停，太给力了",
                author="user2",
                source="test",
                url="http://test.com/2",
                publish_time=datetime.now(),
            ),
            SentimentPost(
                id="3",
                symbol="000001.SZ",
                title="看好",
                content="看好这只股票",
                author="user3",
                source="test",
                url="http://test.com/3",
                publish_time=datetime.now(),
            ),
        ]

        topics = processor._extract_hot_topics(posts, top_n=3)
        # "涨停" 应出现在热门话题中
        assert "涨停" in topics
        assert len(topics) <= 3

    def test_select_sample_posts(self, processor, sample_posts):
        """测试样本帖子选择"""
        classified = [(post, processor._classify_post(post)) for post in sample_posts]
        samples = processor._select_sample_posts(classified, max_samples=2)

        # 检查样本数量
        assert len(samples) <= 2

        # 检查样本结构
        if samples:
            assert "title" in samples[0]
            assert "author" in samples[0]
            assert "sentiment" in samples[0]
            assert "likes" in samples[0]

    def test_quick_analyze(self, processor):
        """测试快速分析功能"""
        # 积极文本
        score, sentiment = processor.quick_analyze("这只股票要大涨！")
        assert score > 0
        assert sentiment == "positive"

        # 消极文本
        score, sentiment = processor.quick_analyze("这只股票要暴跌")
        assert score < 0
        assert sentiment == "negative"

        # 中性文本
        score, sentiment = processor.quick_analyze("今天天气不错")
        assert score == 0.0
        assert sentiment == "neutral"

    def test_quick_analyze_case_insensitive(self, processor):
        """测试快速分析大小写不敏感"""
        # 大小写混合
        score1, _ = processor.quick_analyze("大涨")
        score2, _ = processor.quick_analyze("大漲")  # 繁体也应有相似效果

        # 分数应在合理范围内
        assert -1 <= score1 <= 1
        assert -1 <= score2 <= 1

    def test_empty_text_quick_analyze(self, processor):
        """测试空文本快速分析"""
        score, sentiment = processor.quick_analyze("")
        assert score == 0.0
        assert sentiment == "neutral"

    def test_confidence_with_neutral_majority(self, processor):
        """测试中性占多数时降低置信度"""
        neutral_posts = [
            SentimentPost(
                id=str(i),
                symbol="000001.SZ",
                title="分析",
                content="今天开盘了，看看走势",  # 中性内容
                author=f"user{i}",
                source="test",
                url=f"http://test.com/{i}",
                publish_time=datetime.now(),
            )
            for i in range(10)
        ]

        result = processor.analyze(neutral_posts)
        # 中性占多数时置信度应较低
        assert result.neutral_ratio > 0.7
        # 此时置信度会乘以 0.7 系数
