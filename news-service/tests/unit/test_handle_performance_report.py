"""
AI决策反馈处理器单元测试 (C3-003C)

测试内容:
1. _handle_ai_performance_report事件处理器
2. 事件Payload解析
3. 优化策略调用
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


class TestHandleAIPerformanceReport:
    """AI决策反馈处理器测试"""

    @pytest.fixture
    def service(self):
        """创建News Service实例"""
        return NewsService()

    @pytest.mark.asyncio
    async def test_handle_ai_performance_report_positive(self):
        """测试处理AI决策反馈事件 - Positive反馈 (C3-003C)"""
        service = NewsService()

        # Mock优化策略方法
        service._optimize_prompt_strategy = AsyncMock()
        service._record_ai_feedback_metrics = AsyncMock()

        # 创建测试事件 - 高准确率Positive反馈
        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "stock_code": "000001.SZ",
                "decision_id": "dec-001",
                "performance": {
                    "accuracy": 0.85,
                    "profit_loss": 5000.0,
                    "feedback_type": "positive"
                },
                "used_intelligence": ["intel-001", "intel-002"]
            }
        )

        # 执行处理
        await service._handle_ai_performance_report(event)

        # 验证优化策略被调用（enhance动作）
        service._optimize_prompt_strategy.assert_called_with(
            "000001.SZ", ["intel-001", "intel-002"], "enhance"
        )

        # 验证指标记录被调用
        service._record_ai_feedback_metrics.assert_called()

    @pytest.mark.asyncio
    async def test_handle_ai_performance_report_negative(self):
        """测试处理AI决策反馈事件 - Negative反馈 (C3-003C)"""
        service = NewsService()

        # Mock优化策略方法
        service._optimize_prompt_strategy = AsyncMock()
        service._record_ai_feedback_metrics = AsyncMock()

        # 创建测试事件 - 低准确率Negative反馈
        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "stock_code": "000001.SZ",
                "decision_id": "dec-002",
                "performance": {
                    "accuracy": 0.20,
                    "profit_loss": -3000.0,
                    "feedback_type": "negative"
                },
                "used_intelligence": ["intel-003"]
            }
        )

        # 执行处理
        await service._handle_ai_performance_report(event)

        # 验证优化策略被调用（adjust动作）
        service._optimize_prompt_strategy.assert_called_with(
            "000001.SZ", ["intel-003"], "adjust"
        )

        # 验证指标记录被调用
        service._record_ai_feedback_metrics.assert_called()

    @pytest.mark.asyncio
    async def test_handle_ai_performance_report_neutral(self):
        """测试处理AI决策反馈事件 - Neutral反馈 (C3-003C)"""
        service = NewsService()

        # Mock优化策略方法
        service._optimize_prompt_strategy = AsyncMock()
        service._record_ai_feedback_metrics = AsyncMock()

        # 创建测试事件 - 中等准确率Neutral反馈
        event = EventSchema(
            event_type=EventType.AI_PERFORMANCE_REPORT,
            source="trading-ai-service",
            payload={
                "stock_code": "000001.SZ",
                "decision_id": "dec-003",
                "performance": {
                    "accuracy": 0.50,
                    "profit_loss": 500.0,
                    "feedback_type": "neutral"
                },
                "used_intelligence": []
            }
        )

        # 执行处理
        await service._handle_ai_performance_report(event)

        # 验证优化策略未被调用（neutral情况）
        service._optimize_prompt_strategy.assert_not_called()

        # 验证指标记录仍然被调用
        service._record_ai_feedback_metrics.assert_called()

    @pytest.mark.asyncio
    async def test_optimize_prompt_strategy(self):
        """测试Prompt策略优化方法 (C3-003C)"""
        service = NewsService()

        # 测试enhance动作
        await service._optimize_prompt_strategy(
            "000001.SZ",
            ["intel-001", "intel-002"],
            "enhance"
        )

        # 测试adjust动作
        await service._optimize_prompt_strategy(
            "000001.SZ",
            ["intel-003"],
            "adjust"
        )

        # 验证方法执行不抛出异常

    @pytest.mark.asyncio
    async def test_record_ai_feedback_metrics(self):
        """测试AI反馈指标记录方法 (C3-003C)"""
        service = NewsService()

        performance = {
            "accuracy": 0.75,
            "profit_loss": 2000.0,
            "feedback_type": "positive"
        }

        # 执行记录
        await service._record_ai_feedback_metrics(
            stock_code="000001.SZ",
            decision_id="dec-004",
            performance=performance,
            intelligence_items=["intel-004", "intel-005"]
        )

        # 验证方法执行不抛出异常

    @pytest.mark.asyncio
    async def test_log_prompt_optimization_suggestion(self):
        """测试Prompt优化建议记录方法 (C3-003C)"""
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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
