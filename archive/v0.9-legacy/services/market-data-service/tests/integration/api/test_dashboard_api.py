"""
Integration tests for Dashboard API.

Tests REST API endpoints for dashboard data.
"""

import pytest
import asyncio
from typing import Dict, Any


class DashboardAPIHandler:
    """
    API handler for dashboard endpoints.

    Endpoints:
    - GET /api/dashboard/summary - Dashboard summary
    - GET /api/dashboard/chart?metric={metric}&period={period} - Chart data
    - GET /api/dashboard/sources - Data source status
    - GET /api/dashboard/alerts - Recent alerts
    - GET /dashboard - HTML dashboard page
    """

    def __init__(self, data_collector):
        self.collector = data_collector

    async def handle_get_summary(self) -> Dict[str, Any]:
        """Handle GET /api/dashboard/summary."""
        try:
            summary = await self.collector.get_summary()
            return {
                "success": True,
                "data": summary
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": "SUMMARY_ERROR"
            }

    async def handle_get_chart(self, metric: str, period: str = "1h") -> Dict[str, Any]:
        """Handle GET /api/dashboard/chart."""
        try:
            data = await self.collector.get_realtime_chart_data(metric, period)
            return {
                "success": True,
                "data": {
                    "metric": metric,
                    "period": period,
                    "points": data
                }
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": "CHART_ERROR"
            }

    async def handle_get_sources(self) -> Dict[str, Any]:
        """Handle GET /api/dashboard/sources."""
        try:
            sources = await self.collector.get_data_source_status()
            return {
                "success": True,
                "data": sources
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": "SOURCES_ERROR"
            }

    async def handle_get_alerts(self, limit: int = 10) -> Dict[str, Any]:
        """Handle GET /api/dashboard/alerts."""
        try:
            alerts = await self.collector.get_recent_alerts(limit)
            return {
                "success": True,
                "data": alerts,
                "meta": {"count": len(alerts), "limit": limit}
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": "ALERTS_ERROR"
            }

    def handle_get_dashboard_page(self) -> str:
        """Handle GET /dashboard - returns HTML page."""
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Market Data Service Dashboard</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .metric { display: inline-block; margin: 10px; padding: 15px;
                         border: 1px solid #ccc; border-radius: 5px; }
                .status-green { color: green; }
                .status-yellow { color: orange; }
                .status-red { color: red; }
            </style>
        </head>
        <body>
            <h1>Market Data Service Dashboard</h1>
            <div id="summary">Loading...</div>
            <script>
                fetch('/api/dashboard/summary')
                    .then(r => r.json())
                    .then(data => {
                        document.getElementById('summary').innerHTML =
                            JSON.stringify(data, null, 2);
                    });
            </script>
        </body>
        </html>
        """


# Import test implementations
import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/worktrees/worktree-market-data-service/market-data-service/tests/unit/monitoring')
from test_dashboard_data import DashboardDataCollector, MockMetricsCollector, MockHealthChecker, MockCacheMonitor


class TestDashboardAPI:
    """Test dashboard API endpoints."""

    @pytest.fixture
    def api_handler(self):
        collector = DashboardDataCollector(
            MockMetricsCollector(),
            MockHealthChecker(),
            MockCacheMonitor()
        )
        return DashboardAPIHandler(collector)

    @pytest.mark.asyncio
    async def test_get_summary(self, api_handler):
        """Test summary endpoint."""
        result = await api_handler.handle_get_summary()

        assert result["success"] is True
        assert "data" in result
        assert "collection_rate" in result["data"]

    @pytest.mark.asyncio
    async def test_get_chart(self, api_handler):
        """Test chart endpoint."""
        # Add some data
        api_handler.collector.add_time_series_point("collection_rate_1h_1m", 0.99)

        result = await api_handler.handle_get_chart("collection_rate", "1h")

        assert result["success"] is True
        assert result["data"]["metric"] == "collection_rate"
        assert result["data"]["period"] == "1h"

    @pytest.mark.asyncio
    async def test_get_sources(self, api_handler):
        """Test sources endpoint."""
        result = await api_handler.handle_get_sources()

        assert result["success"] is True
        assert isinstance(result["data"], list)
        assert len(result["data"]) > 0

    @pytest.mark.asyncio
    async def test_get_alerts(self, api_handler):
        """Test alerts endpoint."""
        result = await api_handler.handle_get_alerts(limit=5)

        assert result["success"] is True
        assert "data" in result
        assert "meta" in result
        assert result["meta"]["limit"] == 5

    def test_get_dashboard_page(self, api_handler):
        """Test HTML dashboard page."""
        html = api_handler.handle_get_dashboard_page()

        assert "Market Data Service Dashboard" in html
        assert "summary" in html
        assert "<script>" in html


class TestDashboardAPIErrors:
    """Test dashboard API error handling."""

    @pytest.mark.asyncio
    async def test_summary_error_handling(self):
        """Test error handling in summary endpoint."""
        # Create collector that raises exception
        class FailingCollector:
            async def get_summary(self):
                raise Exception("Database error")

        handler = DashboardAPIHandler(FailingCollector())
        result = await handler.handle_get_summary()

        assert result["success"] is False
        assert "error" in result

    @pytest.mark.asyncio
    async def test_chart_error_handling(self):
        """Test error handling in chart endpoint."""
        class FailingCollector:
            async def get_realtime_chart_data(self, metric, period):
                raise Exception("Invalid metric")

        handler = DashboardAPIHandler(FailingCollector())
        result = await handler.handle_get_chart("invalid")

        assert result["success"] is False
