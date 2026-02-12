"""
采集器基类单元测试

TDD流程:
1. 编写测试 (Red)
2. 运行测试确认失败
3. 实现最小代码 (Green)
4. 重构优化
"""

import pytest
import sys
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock

sys.path.insert(0, '/home/fe-jerome/projects/stock-race/worktrees/worktree-news-service/news-service/src')

from news_service.collectors.base import BaseCollector, DataSourceError, RateLimitError


class TestBaseCollector:
    """采集器基类测试"""

    @pytest.fixture
    def concrete_collector(self):
        """创建一个具体的采集器实例用于测试"""
        class TestCollector(BaseCollector):
            def __init__(self):
                super().__init__(name="test_source", priority=1)
                self.session = Mock()

            async def collect(self):
                return [{"title": "Test News", "url": "http://test.com"}]

            async def health_check(self):
                return True

            @property
            def source_name(self):
                return "test_source"

        return TestCollector()

    def test_base_collector_initialization(self, concrete_collector):
        """测试采集器初始化"""
        assert concrete_collector.name == "test_source"
        assert concrete_collector.priority == 1
        assert concrete_collector.request_count == 0
        assert concrete_collector.error_count == 0

    def test_base_collector_stats(self, concrete_collector):
        """测试统计信息"""
        # 初始状态
        stats = concrete_collector.get_stats()
        assert stats["name"] == "test_source"
        assert stats["request_count"] == 0
        assert stats["error_count"] == 0
        assert stats["success_rate"] == 1.0

        # 模拟请求和错误
        concrete_collector.request_count = 100
        concrete_collector.error_count = 10

        stats = concrete_collector.get_stats()
        assert stats["request_count"] == 100
        assert stats["error_count"] == 10
        assert stats["success_rate"] == 0.9

    @pytest.mark.asyncio
    async def test_base_collector_collect(self, concrete_collector):
        """测试采集方法"""
        result = await concrete_collector.collect()

        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["title"] == "Test News"

    @pytest.mark.asyncio
    async def test_base_collector_health_check(self, concrete_collector):
        """测试健康检查"""
        result = await concrete_collector.health_check()
        assert result is True

    def test_base_collector_abstract_methods(self):
        """测试抽象方法必须实现"""
        with pytest.raises(TypeError):
            # 不能直接实例化抽象基类
            BaseCollector(name="test")

    def test_error_rate_calculation(self, concrete_collector):
        """测试错误率计算"""
        # 无请求时错误率应为0
        assert concrete_collector.error_rate == 0.0

        # 有请求时
        concrete_collector.request_count = 100
        concrete_collector.error_count = 5
        assert concrete_collector.error_rate == 0.05

        # 错误率100%
        concrete_collector.error_count = 100
        assert concrete_collector.error_rate == 1.0


class TestDataSourceError:
    """数据源错误异常测试"""

    def test_error_with_message(self):
        """测试带消息的错误"""
        error = DataSourceError("Connection failed")
        assert str(error) == "Connection failed"
        assert error.source is None

    def test_error_with_source(self):
        """测试带数据源的错误"""
        error = DataSourceError("API Error", source="sina")
        assert str(error) == "API Error"
        assert error.source == "sina"


class TestRateLimitError:
    """速率限制错误异常测试"""

    def test_rate_limit_error(self):
        """测试速率限制错误"""
        error = RateLimitError("Too many requests")
        assert str(error) == "Too many requests"

    def test_rate_limit_with_retry_after(self):
        """测试带重试时间的速率限制错误"""
        error = RateLimitError("Rate limited", retry_after=60)
        assert error.retry_after == 60


class TestCollectorMetrics:
    """采集器指标测试"""

    @pytest.fixture
    def collector_with_metrics(self):
        """创建带指标的采集器"""
        class MetricsCollector(BaseCollector):
            def __init__(self):
                super().__init__(name="metrics_test", priority=1)
                self.request_count = 50
                self.error_count = 5
                self.total_response_time = 10.0  # 10秒总响应时间

            async def collect(self):
                return []

            async def health_check(self):
                return True

            @property
            def source_name(self):
                return "metrics_test"

            @property
            def average_response_time(self):
                if self.request_count == 0:
                    return 0.0
                return self.total_response_time / self.request_count

        return MetricsCollector()

    def test_average_response_time(self, collector_with_metrics):
        """测试平均响应时间"""
        assert collector_with_metrics.average_response_time == 0.2  # 10/50

    def test_metrics_report(self, collector_with_metrics):
        """测试指标报告"""
        stats = collector_with_metrics.get_stats()

        assert stats["name"] == "metrics_test"
        assert stats["request_count"] == 50
        assert stats["error_count"] == 5
        assert stats["success_rate"] == 0.9
        assert stats["error_rate"] == 0.1
