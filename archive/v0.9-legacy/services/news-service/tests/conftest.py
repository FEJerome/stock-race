"""
Pytest 配置文件

提供共享的fixture和测试配置
"""

import pytest
import asyncio
from datetime import datetime
from typing import Dict, List

# 设置异步fixture模式
pytest_plugins = ('pytest_asyncio',)


@pytest.fixture(scope="session")
def event_loop():
    """创建session级别的事件循环"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def sample_news_article() -> Dict:
    """示例新闻数据"""
    return {
        "id": "test_news_001",
        "title": "测试新闻标题",
        "content": "这是测试新闻的内容，包含股票代码如000001.SZ和600519.SH",
        "url": "https://test.example.com/news/001",
        "source": "test_source",
        "published_at": datetime.now(),
        "collected_at": datetime.now(),
        "category": "finance",
        "tags": ["test", "股票", "A股"],
        "related_stocks": ["000001.SZ", "600519.SH"],
        "related_sectors": ["金融", "白酒"],
        "sentiment_score": 0.5,
        "sentiment_type": "positive"
    }


@pytest.fixture
def sample_social_post() -> Dict:
    """示例社交媒体帖子"""
    return {
        "id": "test_social_001",
        "platform": "xueqiu",
        "author": "test_user",
        "author_followers": 10000,
        "content": "这只股票要涨停了！宁德时代太厉害了！",
        "title": None,
        "read_count": 5000,
        "comment_count": 100,
        "like_count": 200,
        "forward_count": 50,
        "mentioned_stocks": ["300750.SZ"],
        "stock_sentiment": {"300750.SZ": "看涨"},
        "sentiment_score": 0.8,
        "sentiment_type": "positive",
        "crowd_emotion": "greed",
        "published_at": datetime.now(),
        "collected_at": datetime.now()
    }


@pytest.fixture
def mock_weibo_response() -> Dict:
    """模拟微博热搜API响应"""
    return {
        "data": {
            "realtime": [
                {
                    "note": "A股大涨",
                    "rank": 1,
                    "raw_hot": 5000000,
                    "category": "财经",
                    "word": "A股"
                },
                {
                    "note": "宁德时代发布新电池",
                    "rank": 2,
                    "raw_hot": 3000000,
                    "category": "财经",
                    "word": "宁德时代"
                }
            ]
        }
    }


@pytest.fixture
def mock_xueqiu_response() -> Dict:
    """模拟雪球API响应"""
    return {
        "articles": [
            {
                "id": 12345,
                "title": "看好这只股票",
                "description": "详细分析...",
                "user": {
                    "screen_name": "test_user",
                    "followers_count": 5000
                },
                "view_count": 10000,
                "reply_count": 100,
                "like_count": 200,
                "created_at": int(datetime.now().timestamp() * 1000)
            }
        ]
    }


@pytest.fixture
def sample_sentiment_result() -> Dict:
    """示例情感分析结果"""
    return {
        "overall": "positive",
        "score": 0.75,
        "confidence": 0.85,
        "analyzed_at": datetime.now(),
        "analyzer": "hybrid"
    }


@pytest.fixture
def sample_sentiment_index() -> Dict:
    """示例市场情绪指数"""
    return {
        "timestamp": datetime.now(),
        "overall": "positive",
        "score": 0.65,
        "fear_greed_index": 75,
        "crowd_attention": "high",
        "hot_topics": ["新能源", "AI", "医药"],
        "source_breakdown": {
            "sina": {"positive": 10, "negative": 3, "neutral": 5},
            "weibo": {"positive": 20, "negative": 5, "neutral": 10}
        },
        "stock_sentiment": {
            "000001.SZ": 0.5,
            "600519.SH": 0.8
        }
    }


# 标记慢测试
slow = pytest.mark.slow

# 标记集成测试
integration = pytest.mark.integration

# 标记E2E测试
e2e = pytest.mark.e2e
