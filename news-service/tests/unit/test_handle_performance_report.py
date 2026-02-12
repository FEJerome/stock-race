"""
AI决策反馈处理器单元测试 (C3-003C)

测试内容:
1. _handle_performance_report事件处理器
2. 事件Payload解析
3. 优化建议记录
4. 异常处理

使用Mock测试，不依赖外部服务
"""

import sys
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))
sys.path.insert(0, str(project_root / "news-service" / "src"))

import pytest
import asyncio
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock

from event_bus import EventSchema, EventType

from news_service.main import NewsService


class TestHandlePerformanceReport:
    """AI决策反馈处理器测试"""

    @pytest.fixture
    def service(self):
        """创建News Service实例"""
        return NewsService()

    @pytest.mark.asyncio
    async def test_handle_performance_report_success(self):
        """测试正常处理AI决策反馈报告"""
        service = NewsService()

        # 创建测试事件
        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "account_id": "ai-acc-12345",
                "period": "daily",
                "metrics": {
                    "total_trades": 10,
                    "win_rate": 0.6,
                    "avg_return": 2.5,
                    "max_drawdown": -3.2,
                    "decision_accuracy": 0.75
                },
                "timestamp": "2026-02-12T10:00:00Z"
            }
        )

        # 执行处理（不应抛出异常）
        with patch('news_service.main.logger') as mock_logger:
            await service._handle_performance_report(event)

            # 验证日志记录
            assert mock_logger.info.called
            log_messages = [str(call) for call in mock_logger.info.call_args_list]
            assert any("AI决策反馈报告" in msg for msg in log_messages)
            assert any("AI性能指标记录" in msg for msg in log_messages)

    @pytest.mark.asyncio
    async def test_handle_low_decision_accuracy(self):
        """测试低决策准确度时的警告"""
        service = NewsService()

        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "account_id": "ai-acc-12345",
                "period": "daily",
                "metrics": {
                    "total_trades": 10,
                    "win_rate": 0.4,
                    "avg_return": -1.5,
                    "max_drawdown": -5.0,
                    "decision_accuracy": 0.5  # 低于0.6阈值
                },
                "timestamp": "2026-02-12T10:00:00Z"
            }
        )

        with patch('news_service.main.logger') as mock_logger:
            await service._handle_performance_report(event)

            # 验证警告日志
            assert mock_logger.warning.called
            log_messages = [str(call) for call in mock_logger.warning.call_args_list]
            assert any("决策准确度低" in msg for msg in log_messages)

    @pytest.mark.asyncio
    async def test_handle_low_win_rate(self):
        """测试低胜率时的警告"""
        service = NewsService()

        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "account_id": "ai-acc-12345",
                "period": "daily",
                "metrics": {
                    "total_trades": 10,
                    "win_rate": 0.3,  # 低于0.5阈值
                    "avg_return": 1.0,
                    "max_drawdown": -2.0,
                    "decision_accuracy": 0.7
                },
                "timestamp": "2026-02-12T10:00:00Z"
            }
        )

        with patch('news_service.main.logger') as mock_logger:
            await service._handle_performance_report(event)

            # 验证警告日志
            assert mock_logger.warning.called
            log_messages = [str(call) for call in mock_logger.warning.call_args_list]
            assert any("胜率低" in msg for msg in log_messages)

    @pytest.mark.asyncio
    async def test_handle_negative_return(self):
        """测试负收益时的警告"""
        service = NewsService()

        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "account_id": "ai-acc-12345",
                "period": "daily",
                "metrics": {
                    "total_trades": 10,
                    "win_rate": 0.5,
                    "avg_return": -2.0,  # 负收益
                    "max_drawdown": -4.0,
                    "decision_accuracy": 0.7
                },
                "timestamp": "2026-02-12T10:00:00Z"
            }
        )

        with patch('news_service.main.logger') as mock_logger:
            await service._handle_performance_report(event)

            # 验证警告日志
            assert mock_logger.warning.called
            log_messages = [str(call) for call in mock_logger.warning.call_args_list]
            assert any("平均收益为负" in msg for msg in log_messages)

    @pytest.mark.asyncio
    async def test_handle_missing_metrics(self):
        """测试缺失metrics字段时的处理"""
        service = NewsService()

        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "account_id": "ai-acc-12345",
                "period": "daily",
                # 缺少metrics字段
                "timestamp": "2026-02-12T10:00:00Z"
            }
        )

        # 不应抛出异常
        with patch('news_service.main.logger') as mock_logger:
            await service._handle_performance_report(event)
            # 验证记录
            assert mock_logger.info.called

    @pytest.mark.asyncio
    async def test_handle_empty_payload(self):
        """测试空Payload时的处理"""
        service = NewsService()

        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={}
        )

        # 不应抛出异常
        with patch('news_service.main.logger') as mock_logger:
            await service._handle_performance_report(event)
            # 验证记录
            assert mock_logger.info.called

    @pytest.mark.asyncio
    async def test_handle_exception(self):
        """测试处理器异常处理"""
        service = NewsService()

        # 创建一个会导致异常的payload（非字典类型metrics）
        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "account_id": "ai-acc-12345",
                "period": "daily",
                "metrics": "invalid_metrics_type",  # 应该是dict
                "timestamp": "2026-02-12T10:00:00Z"
            }
        )

        with patch('news_service.main.logger') as mock_logger:
            await service._handle_performance_report(event)

            # 验证错误被记录
            assert mock_logger.error.called

    @pytest.mark.asyncio
    async def test_log_optimization_suggestion(self):
        """测试优化建议记录方法"""
        service = NewsService()

        with patch('news_service.main.logger') as mock_logger:
            service._log_prompt_optimization_suggestion(
                account_id="ai-acc-12345",
                reason="decision_accuracy_low",
                current_value=0.5,
                threshold=0.6
            )

            # 验证日志记录
            assert mock_logger.info.called
            log_messages = [str(call) for call in mock_logger.info.call_args_list]
            assert any("Prompt优化建议" in msg for msg in log_messages)
            assert any("ai-acc-12345" in msg for msg in log_messages)
            assert any("decision_accuracy_low" in msg for msg in log_messages)

    @pytest.mark.asyncio
    async def test_payload_field_parsing(self):
        """测试Payload字段解析"""
        service = NewsService()

        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "account_id": "test-account-001",
                "period": "weekly",
                "metrics": {
                    "total_trades": 50,
                    "win_rate": 0.65,
                    "avg_return": 5.2,
                    "max_drawdown": -8.1,
                    "decision_accuracy": 0.82
                },
                "timestamp": "2026-02-12T10:00:00Z"
            }
        )

        with patch('news_service.main.logger') as mock_logger:
            await service._handle_performance_report(event)

            # 验证account_id被正确记录
            log_messages = [str(call) for call in mock_logger.info.call_args_list]
            assert any("test-account-001" in msg for msg in log_messages)
            assert any("weekly" in msg for msg in log_messages)

    @pytest.mark.asyncio
    async def test_different_periods(self):
        """测试不同周期报告的处理"""
        service = NewsService()

        periods = ["daily", "weekly", "monthly"]

        for period in periods:
            event = EventSchema(
                event_type=EventType.AI_PERFORMANCE_REPORT,
                source="trading-ai-service",
                payload={
                    "account_id": f"ai-acc-{period}",
                    "period": period,
                    "metrics": {
                        "total_trades": 10,
                        "win_rate": 0.6,
                        "avg_return": 2.5,
                        "max_drawdown": -3.0,
                        "decision_accuracy": 0.75
                    },
                    "timestamp": "2026-02-12T10:00:00Z"
                }
            )

            with patch('news_service.main.logger') as mock_logger:
                await service._handle_performance_report(event)

                # 验证每个周期都被正确处理
                log_messages = [str(call) for call in mock_logger.info.call_args_list]
                assert any(f"ai-acc-{period}" in msg for msg in log_messages)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
