"""
Tests for AI Performance Report Event Publisher.

Implements tests for:
- C3-004B: Publish ai:performance:report events
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timedelta

import sys
from pathlib import Path

# Add paths for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "src"))
sys.path.insert(0, str(project_root.parent / "infra" / "service-state" / "src"))
sys.path.insert(0, str(project_root.parent / "infra" / "event-bus" / "src"))

from ai_service.services.performance_event_publisher import (
    PerformanceEventPublisher,
    PerformanceMetrics,
    DecisionSummary,
)


class TestPerformanceEventPublisher:
    """Test cases for PerformanceEventPublisher"""

    @pytest.fixture
    def publisher(self):
        """Create a performance event publisher with mocked event bus."""
        publisher = PerformanceEventPublisher()
        publisher._event_bus = Mock()
        publisher._event_bus.is_initialized = True
        publisher._event_bus.publish = AsyncMock(return_value=None)
        return publisher

    @pytest.mark.asyncio
    async def test_publish_performance_report_success(self, publisher):
        """Test successful performance report publishing."""
        performance = PerformanceMetrics(
            total_return=15000.0,
            total_return_percent=15.0,
            win_rate=0.65,
            total_trades=100,
            profitable_trades=65,
            average_return_per_trade=150.0,
            max_drawdown=5.0,
            sharpe_ratio=1.5,
            volatility=0.2,
        )

        decision_summary = DecisionSummary(
            total_decisions=150,
            buy_decisions=50,
            sell_decisions=40,
            hold_decisions=60,
            average_confidence=0.75,
            average_risk_level="medium",
        )

        result = await publisher.publish_performance_report(
            account_id="acc_123",
            performance=performance,
            decision_summary=decision_summary,
            period="daily",
        )

        assert result is True
        publisher._event_bus.publish.assert_called_once()

        # Verify call arguments
        call_args = publisher._event_bus.publish.call_args
        assert call_args.kwargs["event_type"] == "ai:performance:report"
        assert call_args.kwargs["payload"]["account_id"] == "acc_123"
        assert call_args.kwargs["payload"]["period"] == "daily"

    @pytest.mark.asyncio
    async def test_publish_performance_report_event_bus_not_initialized(self, publisher):
        """Test publishing when event bus is not initialized."""
        publisher._event_bus.is_initialized = False

        performance = PerformanceMetrics(
            total_return=0.0,
            total_return_percent=0.0,
            win_rate=0.5,
            total_trades=10,
            profitable_trades=5,
            average_return_per_trade=0.0,
            max_drawdown=0.0,
        )

        decision_summary = DecisionSummary(
            total_decisions=10,
            buy_decisions=3,
            sell_decisions=3,
            hold_decisions=4,
            average_confidence=0.5,
            average_risk_level="medium",
        )

        with pytest.raises(Exception) as exc_info:
            await publisher.publish_performance_report(
                account_id="acc_123",
                performance=performance,
                decision_summary=decision_summary,
            )

        assert "EventBusManager not initialized" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_publish_simple_report(self, publisher):
        """Test publishing simplified performance report."""
        result = await publisher.publish_simple_report(
            account_id="acc_456",
            total_return_percent=10.5,
            win_rate=0.6,
            total_trades=50,
            period="weekly",
        )

        assert result is True
        publisher._event_bus.publish.assert_called_once()

        call_args = publisher._event_bus.publish.call_args
        payload = call_args.kwargs["payload"]
        assert payload["account_id"] == "acc_456"
        assert payload["period"] == "weekly"
        assert payload["performance"]["total_return_percent"] == 10.5
        assert payload["performance"]["win_rate"] == 0.6
        assert payload["performance"]["total_trades"] == 50

    @pytest.mark.asyncio
    async def test_publish_batch_reports(self, publisher):
        """Test publishing batch performance reports."""
        reports = [
            {
                "account_id": "acc_001",
                "performance": PerformanceMetrics(
                    total_return=1000.0,
                    total_return_percent=10.0,
                    win_rate=0.6,
                    total_trades=20,
                    profitable_trades=12,
                    average_return_per_trade=50.0,
                    max_drawdown=3.0,
                ),
                "decision_summary": DecisionSummary(
                    total_decisions=30,
                    buy_decisions=10,
                    sell_decisions=8,
                    hold_decisions=12,
                    average_confidence=0.7,
                    average_risk_level="low",
                ),
            },
            {
                "account_id": "acc_002",
                "performance": PerformanceMetrics(
                    total_return=2000.0,
                    total_return_percent=20.0,
                    win_rate=0.7,
                    total_trades=30,
                    profitable_trades=21,
                    average_return_per_trade=66.67,
                    max_drawdown=5.0,
                ),
                "decision_summary": DecisionSummary(
                    total_decisions=40,
                    buy_decisions=15,
                    sell_decisions=10,
                    hold_decisions=15,
                    average_confidence=0.8,
                    average_risk_level="medium",
                ),
            },
        ]

        results = await publisher.publish_batch_reports(reports)

        assert len(results) == 2
        assert all(results)
        assert publisher._event_bus.publish.call_count == 2

    @pytest.mark.asyncio
    async def test_publish_performance_report_with_optional_fields(self, publisher):
        """Test publishing report with top/worst performers."""
        performance = PerformanceMetrics(
            total_return=15000.0,
            total_return_percent=15.0,
            win_rate=0.65,
            total_trades=100,
            profitable_trades=65,
            average_return_per_trade=150.0,
            max_drawdown=5.0,
        )

        decision_summary = DecisionSummary(
            total_decisions=150,
            buy_decisions=50,
            sell_decisions=40,
            hold_decisions=60,
            average_confidence=0.75,
            average_risk_level="medium",
        )

        top_performers = [
            {"symbol": "000001.SZ", "return_percent": 25.0},
            {"symbol": "000002.SZ", "return_percent": 18.5},
        ]

        worst_performers = [
            {"symbol": "000003.SZ", "return_percent": -12.0},
            {"symbol": "000004.SZ", "return_percent": -8.5},
        ]

        start_date = datetime.utcnow() - timedelta(days=7)
        end_date = datetime.utcnow()

        result = await publisher.publish_performance_report(
            account_id="acc_789",
            performance=performance,
            decision_summary=decision_summary,
            period="weekly",
            start_date=start_date,
            end_date=end_date,
            top_performers=top_performers,
            worst_performers=worst_performers,
        )

        assert result is True

        call_args = publisher._event_bus.publish.call_args
        payload = call_args.kwargs["payload"]
        assert "top_performers" in payload
        assert "worst_performers" in payload
        assert payload["top_performers"] == top_performers
        assert payload["worst_performers"] == worst_performers
        assert payload["start_date"] == start_date.isoformat()
        assert payload["end_date"] == end_date.isoformat()

    @pytest.mark.asyncio
    async def test_generate_and_publish_mock_report(self, publisher):
        """Test generating and publishing mock report."""
        result = await publisher.generate_and_publish_mock_report(
            account_id="acc_test",
            period="daily",
        )

        assert result is True
        publisher._event_bus.publish.assert_called_once()

        call_args = publisher._event_bus.publish.call_args
        payload = call_args.kwargs["payload"]
        assert payload["account_id"] == "acc_test"
        assert payload["period"] == "daily"
        assert "performance" in payload
        assert "decision_summary" in payload
        assert "top_performers" in payload
        assert "worst_performers" in payload


class TestPerformanceMetrics:
    """Test cases for PerformanceMetrics dataclass"""

    def test_performance_metrics_creation(self):
        """Test creating PerformanceMetrics."""
        metrics = PerformanceMetrics(
            total_return=10000.0,
            total_return_percent=10.0,
            win_rate=0.6,
            total_trades=50,
            profitable_trades=30,
            average_return_per_trade=200.0,
            max_drawdown=5.0,
            sharpe_ratio=1.2,
            volatility=0.15,
        )

        assert metrics.total_return == 10000.0
        assert metrics.total_return_percent == 10.0
        assert metrics.win_rate == 0.6
        assert metrics.total_trades == 50
        assert metrics.profitable_trades == 30
        assert metrics.average_return_per_trade == 200.0
        assert metrics.max_drawdown == 5.0
        assert metrics.sharpe_ratio == 1.2
        assert metrics.volatility == 0.15


class TestDecisionSummary:
    """Test cases for DecisionSummary dataclass"""

    def test_decision_summary_creation(self):
        """Test creating DecisionSummary."""
        summary = DecisionSummary(
            total_decisions=100,
            buy_decisions=30,
            sell_decisions=25,
            hold_decisions=45,
            average_confidence=0.75,
            average_risk_level="medium",
        )

        assert summary.total_decisions == 100
        assert summary.buy_decisions == 30
        assert summary.sell_decisions == 25
        assert summary.hold_decisions == 45
        assert summary.average_confidence == 0.75
        assert summary.average_risk_level == "medium"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
