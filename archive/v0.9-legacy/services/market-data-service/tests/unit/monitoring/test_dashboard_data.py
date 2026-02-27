"""
Unit tests for Dashboard data aggregation.

Tests dashboard data collection and aggregation for visualization.
"""

import pytest
import asyncio
from typing import Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import deque


@dataclass
class TimeSeriesPoint:
    """A single point in a time series."""
    timestamp: datetime
    value: float
    metadata: Dict[str, Any] = field(default_factory=dict)


class DashboardDataCollector:
    """
    Collector for dashboard visualization data.

    Aggregates metrics from various sources for real-time dashboard display.
    """

    def __init__(self, metrics_collector, health_checker, cache_monitor):
        self.metrics = metrics_collector
        self.health = health_checker
        self.cache = cache_monitor

        # Time series storage
        self._time_series: Dict[str, deque] = {}
        self._max_points = 1000  # Keep last 1000 points per series

    async def get_summary(self) -> Dict[str, Any]:
        """Get dashboard summary data."""
        collection_stats = await self.metrics.get_collection_stats()
        health_status = await self.health.check_all()
        cache_stats = await self.cache.get_stats()

        return {
            "collection_rate": collection_stats.get("success_rate", 0),
            "active_sources": collection_stats.get("active_sources", 0),
            "active_alerts": len(await self.metrics.get_active_alerts()),
            "hot_stocks_count": collection_stats.get("hot_stocks_count", 0),
            "cache_hit_rate": cache_stats.get("hit_rate", 0),
            "avg_latency_ms": collection_stats.get("avg_latency_ms", 0),
            "timestamp": datetime.now().isoformat()
        }

    async def get_realtime_chart_data(
        self,
        metric: str,
        period: str = "1h",
        interval: str = "1m"
    ) -> List[Dict[str, Any]]:
        """
        Get time series data for chart rendering.

        Args:
            metric: Metric name (e.g., 'collection_rate', 'latency')
            period: Time period ('1h', '1d', '7d')
            interval: Data point interval ('1m', '5m', '1h')
        """
        series_key = f"{metric}_{period}_{interval}"

        # Get from time series storage
        if series_key in self._time_series:
            points = list(self._time_series[series_key])
            return [
                {
                    "timestamp": p.timestamp.isoformat(),
                    "value": p.value,
                    **p.metadata
                }
                for p in points
            ]

        return []

    def add_time_series_point(self, metric: str, value: float,
                              metadata: Dict[str, Any] = None):
        """Add a point to time series."""
        if metric not in self._time_series:
            self._time_series[metric] = deque(maxlen=self._max_points)

        point = TimeSeriesPoint(
            timestamp=datetime.now(),
            value=value,
            metadata=metadata or {}
        )
        self._time_series[metric].append(point)

    async def get_data_source_status(self) -> List[Dict[str, Any]]:
        """Get status of all data sources for dashboard."""
        sources = await self.metrics.get_data_source_health()

        return [
            {
                "name": name,
                "healthy": stats.get("healthy", False),
                "success_rate": stats.get("success_rate", 0),
                "avg_latency_ms": stats.get("avg_latency_ms", 0),
                "requests_per_min": stats.get("requests_per_min", 0),
                "status_color": self._get_status_color(stats)
            }
            for name, stats in sources.items()
        ]

    def _get_status_color(self, stats: Dict[str, Any]) -> str:
        """Get color code for status indicator."""
        if not stats.get("healthy", False):
            return "red"
        if stats.get("success_rate", 0) < 0.95:
            return "yellow"
        if stats.get("avg_latency_ms", 0) > 500:
            return "orange"
        return "green"

    async def get_recent_alerts(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent alerts for dashboard display."""
        alerts = await self.metrics.get_active_alerts()

        # Sort by timestamp descending and limit
        sorted_alerts = sorted(
            alerts,
            key=lambda a: a.get("timestamp", ""),
            reverse=True
        )[:limit]

        return [
            {
                "id": alert.get("id"),
                "severity": alert.get("severity", "warning"),
                "message": alert.get("message", ""),
                "source": alert.get("data_source", "unknown"),
                "time": alert.get("timestamp"),
                "acknowledged": alert.get("acknowledged", False)
            }
            for alert in sorted_alerts
        ]


class MockMetricsCollector:
    """Mock metrics collector."""

    async def get_collection_stats(self) -> Dict[str, Any]:
        return {
            "success_rate": 0.995,
            "active_sources": 3,
            "hot_stocks_count": 250,
            "avg_latency_ms": 150
        }

    async def get_active_alerts(self) -> List[Dict]:
        return [
            {
                "id": 1,
                "severity": "warning",
                "message": "High latency detected",
                "data_source": "tencent",
                "timestamp": datetime.now().isoformat(),
                "acknowledged": False
            }
        ]

    async def get_data_source_health(self) -> Dict[str, Any]:
        return {
            "sina": {
                "healthy": True,
                "success_rate": 0.998,
                "avg_latency_ms": 120,
                "requests_per_min": 500
            },
            "tencent": {
                "healthy": True,
                "success_rate": 0.99,
                "avg_latency_ms": 180,
                "requests_per_min": 300
            }
        }


class MockHealthChecker:
    """Mock health checker."""

    async def check_all(self) -> Dict[str, Any]:
        return {
            "status": "healthy",
            "dependencies": {
                "timescaledb": {"status": "healthy"},
                "redis": {"status": "healthy"}
            }
        }


class MockCacheMonitor:
    """Mock cache monitor."""

    async def get_stats(self) -> Dict[str, Any]:
        return {
            "hit_rate": 0.92,
            "total_requests": 10000,
            "hits": 9200
        }


class TestDashboardDataCollector:
    """Test dashboard data collection."""

    @pytest.fixture
    def collector(self):
        metrics = MockMetricsCollector()
        health = MockHealthChecker()
        cache = MockCacheMonitor()
        return DashboardDataCollector(metrics, health, cache)

    @pytest.mark.asyncio
    async def test_get_summary(self, collector):
        """Test summary data collection."""
        summary = await collector.get_summary()

        assert "collection_rate" in summary
        assert "active_sources" in summary
        assert "active_alerts" in summary
        assert "hot_stocks_count" in summary
        assert "cache_hit_rate" in summary
        assert summary["collection_rate"] == 0.995

    @pytest.mark.asyncio
    async def test_get_data_source_status(self, collector):
        """Test data source status collection."""
        status = await collector.get_data_source_status()

        assert len(status) == 2
        assert status[0]["name"] in ["sina", "tencent"]
        assert "healthy" in status[0]
        assert "success_rate" in status[0]
        assert "status_color" in status[0]

    @pytest.mark.asyncio
    async def test_status_color_logic(self, collector):
        """Test status color determination."""
        # Healthy
        assert collector._get_status_color({
            "healthy": True, "success_rate": 0.99, "avg_latency_ms": 100
        }) == "green"

        # Unhealthy
        assert collector._get_status_color({
            "healthy": False
        }) == "red"

        # Low success rate
        assert collector._get_status_color({
            "healthy": True, "success_rate": 0.90
        }) == "yellow"

        # High latency
        assert collector._get_status_color({
            "healthy": True, "success_rate": 0.99, "avg_latency_ms": 600
        }) == "orange"

    @pytest.mark.asyncio
    async def test_get_recent_alerts(self, collector):
        """Test recent alerts retrieval."""
        alerts = await collector.get_recent_alerts(limit=5)

        assert len(alerts) <= 5
        if alerts:
            assert "id" in alerts[0]
            assert "severity" in alerts[0]
            assert "message" in alerts[0]

    def test_time_series_storage(self, collector):
        """Test time series data storage."""
        # Add points
        for i in range(10):
            collector.add_time_series_point("collection_rate", 0.95 + i * 0.01)

        assert "collection_rate" in collector._time_series
        assert len(collector._time_series["collection_rate"]) == 10

    @pytest.mark.asyncio
    async def test_get_realtime_chart_data(self, collector):
        """Test chart data retrieval."""
        # Add some points
        for i in range(5):
            collector.add_time_series_point("collection_rate_1h_1m", 0.95 + i * 0.01)

        data = await collector.get_realtime_chart_data("collection_rate", "1h", "1m")

        assert len(data) == 5
        assert "timestamp" in data[0]
        assert "value" in data[0]

    @pytest.mark.asyncio
    async def test_empty_chart_data(self, collector):
        """Test chart data for non-existent metric."""
        data = await collector.get_realtime_chart_data("unknown_metric")

        assert data == []


class TestDashboardDataEdgeCases:
    """Test edge cases."""

    @pytest.mark.asyncio
    async def test_time_series_max_size(self):
        """Test time series size limit."""
        collector = DashboardDataCollector(
            MockMetricsCollector(),
            MockHealthChecker(),
            MockCacheMonitor()
        )
        collector._max_points = 5

        # Add more points than max
        for i in range(10):
            collector.add_time_series_point("metric", float(i))

        # Should only keep last 5
        assert len(collector._time_series["metric"]) == 5
        # Should contain last values
        values = [p.value for p in collector._time_series["metric"]]
        assert values == [5.0, 6.0, 7.0, 8.0, 9.0]
