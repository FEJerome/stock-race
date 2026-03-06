"""
AI Performance Report Event Publisher for Trading AI Service.

Implements C3-004B: Publish ai:performance:report events periodically.

Publishes AI account performance reports to the event bus for consumption by Backend service.
"""

import sys
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass
from loguru import logger

# Add event-bus SDK to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))

from .event_bus_manager import EventBusManager
from ..core.exceptions import ProviderError


@dataclass
class PerformanceMetrics:
    """Performance metrics for an AI account."""
    total_return: float
    total_return_percent: float
    win_rate: float
    total_trades: int
    profitable_trades: int
    average_return_per_trade: float
    max_drawdown: float
    sharpe_ratio: Optional[float] = None
    volatility: Optional[float] = None


@dataclass
class DecisionSummary:
    """Summary of AI decisions."""
    total_decisions: int
    buy_decisions: int
    sell_decisions: int
    hold_decisions: int
    average_confidence: float
    average_risk_level: str


class PerformanceEventPublisher:
    """
    Publisher for AI performance report events.

    Publishes periodic performance reports to the event bus so Backend can
    receive and display AI account performance analytics.
    """

    def __init__(self):
        """Initialize the performance event publisher."""
        self._event_bus = EventBusManager()

    async def publish_performance_report(
        self,
        account_id: str,
        performance: PerformanceMetrics,
        decision_summary: DecisionSummary,
        period: str = "daily",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        top_performers: Optional[List[Dict[str, Any]]] = None,
        worst_performers: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """
        Publish a performance report event.

        Args:
            account_id: The account ID for the report
            performance: Performance metrics
            decision_summary: Decision summary statistics
            period: Report period (daily, weekly, monthly)
            start_date: Report start date
            end_date: Report end date
            top_performers: List of top performing stocks
            worst_performers: List of worst performing stocks

        Returns:
            True if published successfully, False otherwise

        Raises:
            ProviderError: If EventBusManager is not initialized
        """
        if not self._event_bus.is_initialized:
            raise ProviderError(
                message="EventBusManager not initialized",
                error_code="EVENT_BUS_NOT_INITIALIZED"
            )

        try:
            from event_bus import EventType

            # Build payload
            payload = {
                "account_id": account_id,
                "period": period,
                "timestamp": datetime.utcnow().isoformat(),
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "performance": {
                    "total_return": performance.total_return,
                    "total_return_percent": performance.total_return_percent,
                    "win_rate": performance.win_rate,
                    "total_trades": performance.total_trades,
                    "profitable_trades": performance.profitable_trades,
                    "average_return_per_trade": performance.average_return_per_trade,
                    "max_drawdown": performance.max_drawdown,
                    "sharpe_ratio": performance.sharpe_ratio,
                    "volatility": performance.volatility,
                },
                "decision_summary": {
                    "total_decisions": decision_summary.total_decisions,
                    "buy_decisions": decision_summary.buy_decisions,
                    "sell_decisions": decision_summary.sell_decisions,
                    "hold_decisions": decision_summary.hold_decisions,
                    "average_confidence": decision_summary.average_confidence,
                    "average_risk_level": decision_summary.average_risk_level,
                },
            }

            # Add optional fields
            if top_performers:
                payload["top_performers"] = top_performers
            if worst_performers:
                payload["worst_performers"] = worst_performers

            # Generate correlation ID
            correlation_id = f"perf_{account_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

            # Publish event
            await self._event_bus.publish(
                event_type=EventType.AI_PERFORMANCE_REPORT.value,
                payload=payload,
                correlation_id=correlation_id
            )

            logger.info(
                f"📊 Published performance report for account {account_id}: "
                f"{performance.total_return_percent:.2f}% return, "
                f"{performance.win_rate:.1%} win rate"
            )

            return True

        except Exception as e:
            logger.error(f"❌ Failed to publish performance report: {e}")
            return False

    async def publish_simple_report(
        self,
        account_id: str,
        total_return_percent: float,
        win_rate: float,
        total_trades: int,
        period: str = "daily",
    ) -> bool:
        """
        Publish a simplified performance report.

        Args:
            account_id: The account ID
            total_return_percent: Total return percentage
            win_rate: Win rate (0-1)
            total_trades: Total number of trades
            period: Report period

        Returns:
            True if published successfully
        """
        performance = PerformanceMetrics(
            total_return=0.0,  # Not provided in simplified version
            total_return_percent=total_return_percent,
            win_rate=win_rate,
            total_trades=total_trades,
            profitable_trades=int(total_trades * win_rate),
            average_return_per_trade=0.0,  # Not provided
            max_drawdown=0.0,  # Not provided
        )

        decision_summary = DecisionSummary(
            total_decisions=total_trades,
            buy_decisions=0,  # Not provided
            sell_decisions=0,  # Not provided
            hold_decisions=0,  # Not provided
            average_confidence=0.5,  # Default
            average_risk_level="medium",  # Default
        )

        return await self.publish_performance_report(
            account_id=account_id,
            performance=performance,
            decision_summary=decision_summary,
            period=period,
        )

    async def publish_batch_reports(
        self,
        reports: List[Dict[str, Any]]
    ) -> List[bool]:
        """
        Publish multiple performance reports in batch.

        Args:
            reports: List of report dictionaries with keys:
                - account_id
                - performance (PerformanceMetrics)
                - decision_summary (DecisionSummary)
                - period (optional)
                - start_date (optional)
                - end_date (optional)

        Returns:
            List of boolean results for each publish operation
        """
        results = []

        for report_data in reports:
            try:
                account_id = report_data["account_id"]
                performance = report_data["performance"]
                decision_summary = report_data["decision_summary"]

                result = await self.publish_performance_report(
                    account_id=account_id,
                    performance=performance,
                    decision_summary=decision_summary,
                    period=report_data.get("period", "daily"),
                    start_date=report_data.get("start_date"),
                    end_date=report_data.get("end_date"),
                    top_performers=report_data.get("top_performers"),
                    worst_performers=report_data.get("worst_performers"),
                )
                results.append(result)
            except Exception as e:
                logger.error(f"❌ Failed to publish batch performance report: {e}")
                results.append(False)

        logger.info(f"📊 Published {sum(results)}/{len(reports)} batch performance reports")

        return results

    async def generate_and_publish_mock_report(
        self,
        account_id: str,
        period: str = "daily"
    ) -> bool:
        """
        Generate and publish a mock performance report for testing.

        Args:
            account_id: The account ID
            period: Report period

        Returns:
            True if published successfully
        """
        import random

        # Generate mock data
        performance = PerformanceMetrics(
            total_return=random.uniform(-10000, 20000),
            total_return_percent=random.uniform(-10, 20),
            win_rate=random.uniform(0.4, 0.7),
            total_trades=random.randint(10, 100),
            profitable_trades=random.randint(5, 50),
            average_return_per_trade=random.uniform(-100, 500),
            max_drawdown=random.uniform(0, 15),
            sharpe_ratio=random.uniform(0.5, 2.0),
            volatility=random.uniform(0.1, 0.3),
        )

        decision_summary = DecisionSummary(
            total_decisions=random.randint(20, 200),
            buy_decisions=random.randint(5, 50),
            sell_decisions=random.randint(5, 50),
            hold_decisions=random.randint(10, 100),
            average_confidence=random.uniform(0.6, 0.9),
            average_risk_level=random.choice(["low", "medium", "high"]),
        )

        # Calculate dates
        end_date = datetime.utcnow()
        if period == "daily":
            start_date = end_date - timedelta(days=1)
        elif period == "weekly":
            start_date = end_date - timedelta(weeks=1)
        elif period == "monthly":
            start_date = end_date - timedelta(days=30)
        else:
            start_date = end_date - timedelta(days=1)

        # Mock top/worst performers
        top_performers = [
            {"symbol": "000001.SZ", "return_percent": random.uniform(5, 20)},
            {"symbol": "000002.SZ", "return_percent": random.uniform(3, 15)},
        ]

        worst_performers = [
            {"symbol": "000003.SZ", "return_percent": random.uniform(-15, -3)},
            {"symbol": "000004.SZ", "return_percent": random.uniform(-10, -2)},
        ]

        return await self.publish_performance_report(
            account_id=account_id,
            performance=performance,
            decision_summary=decision_summary,
            period=period,
            start_date=start_date,
            end_date=end_date,
            top_performers=top_performers,
            worst_performers=worst_performers,
        )
