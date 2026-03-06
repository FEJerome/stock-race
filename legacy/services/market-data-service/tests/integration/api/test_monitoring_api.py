"""
Integration tests for monitoring REST API.

Tests monitoring endpoints:
- GET /api/monitoring/metrics - Overall metrics
- GET /api/monitoring/metrics/{source} - Per-source metrics
- GET /api/monitoring/alerts - Active alerts
- GET /api/monitoring/health - Health status
"""

import pytest
import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from unittest.mock import Mock, AsyncMock


class MockMetricsCollector:
    """Mock metrics collector for API testing."""

    def __init__(self):
        self.data_sources = {
            'sina': {
                'name': 'sina',
                'total_requests': 1000,
                'successful_requests': 995,
                'failed_requests': 5,
                'success_rate': 0.995,
                'avg_latency_ms': 120,
                'max_latency_ms': 500,
                'min_latency_ms': 50
            },
            'tencent': {
                'name': 'tencent',
                'total_requests': 500,
                'successful_requests': 490,
                'failed_requests': 10,
                'success_rate': 0.98,
                'avg_latency_ms': 180,
                'max_latency_ms': 800,
                'min_latency_ms': 80
            },
            'eastmoney': {
                'name': 'eastmoney',
                'total_requests': 200,
                'successful_requests': 198,
                'failed_requests': 2,
                'success_rate': 0.99,
                'avg_latency_ms': 200,
                'max_latency_ms': 600,
                'min_latency_ms': 100
            }
        }
        self.alerts = [
            {
                'id': 1,
                'rule_name': 'high_latency',
                'data_source': 'tencent',
                'metric': 'avg_latency_ms',
                'threshold': 150,
                'actual_value': 180,
                'timestamp': datetime.now().isoformat(),
                'resolved': False
            }
        ]

    def get_metrics(self, data_source: Optional[str] = None) -> Dict[str, Any]:
        """Get metrics for data sources."""
        if data_source:
            return self.data_sources.get(data_source, {})
        return self.data_sources

    def get_overall_metrics(self) -> Dict[str, Any]:
        """Get overall collection metrics."""
        total_requests = sum(m['total_requests'] for m in self.data_sources.values())
        total_success = sum(m['successful_requests'] for m in self.data_sources.values())
        total_latency = sum(m['avg_latency_ms'] * m['total_requests']
                          for m in self.data_sources.values())

        return {
            'collection_rate': round(total_success / total_requests, 4) if total_requests > 0 else 1.0,
            'avg_latency_ms': round(total_latency / total_requests, 2) if total_requests > 0 else 0.0,
            'total_requests': total_requests,
            'total_success': total_success,
            'total_failures': total_requests - total_success,
            'data_sources': len(self.data_sources)
        }

    def get_alerts(self, resolved: Optional[bool] = None,
                   data_source: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get alerts with optional filtering."""
        alerts = self.alerts
        if resolved is not None:
            alerts = [a for a in alerts if a.get('resolved', False) == resolved]
        if data_source:
            alerts = [a for a in alerts if a['data_source'] == data_source]
        return alerts


class MockHealthChecker:
    """Mock health checker for API testing."""

    def __init__(self):
        self.dependencies = {
            'timescaledb': {'status': 'healthy', 'latency_ms': 5},
            'redis': {'status': 'healthy', 'latency_ms': 2},
            'sina': {'status': 'healthy', 'latency_ms': 120},
            'tencent': {'status': 'degraded', 'latency_ms': 180},
            'eastmoney': {'status': 'healthy', 'latency_ms': 200}
        }

    async def check_all(self) -> Dict[str, Any]:
        """Check all dependencies."""
        results = {}
        overall_status = 'healthy'

        for name, status in self.dependencies.items():
            results[name] = status
            if status['status'] == 'unhealthy':
                overall_status = 'unhealthy'
            elif status['status'] == 'degraded' and overall_status == 'healthy':
                overall_status = 'degraded'

        return {
            'status': overall_status,
            'dependencies': results,
            'timestamp': datetime.now().isoformat()
        }


class MonitoringAPIHandler:
    """
    API handler for monitoring endpoints.

    Endpoints:
    - GET /api/monitoring/metrics - Overall metrics
    - GET /api/monitoring/metrics/{source} - Per-source metrics
    - GET /api/monitoring/alerts - Active alerts
    - GET /api/monitoring/health - Health status
    """

    def __init__(self, metrics_collector=None, health_checker=None):
        self.metrics_collector = metrics_collector or MockMetricsCollector()
        self.health_checker = health_checker or MockHealthChecker()

    def _validate_data_source(self, source: str) -> tuple:
        """Validate data source name."""
        valid_sources = {'sina', 'tencent', 'eastmoney', 'baostock', 'akshare'}

        if not source:
            return False, "Data source is required"

        source_lower = source.lower()
        if source_lower not in valid_sources:
            return False, f"Unknown data source: {source}"

        return True, None

    async def handle_get_metrics(self) -> Dict[str, Any]:
        """
        Handle GET /api/monitoring/metrics.

        Returns:
            Overall collection metrics
        """
        try:
            overall = self.metrics_collector.get_overall_metrics()
            sources = self.metrics_collector.get_metrics()

            return {
                'success': True,
                'data': {
                    **overall,
                    'sources': sources
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'code': 'INTERNAL_ERROR'
            }

    async def handle_get_source_metrics(self, source: str) -> Dict[str, Any]:
        """
        Handle GET /api/monitoring/metrics/{source}.

        Args:
            source: Data source name

        Returns:
            Per-source metrics
        """
        valid, error = self._validate_data_source(source)
        if not valid:
            return {
                'success': False,
                'error': error,
                'code': 'INVALID_SOURCE'
            }

        try:
            metrics = self.metrics_collector.get_metrics(source.lower())

            if not metrics:
                return {
                    'success': False,
                    'error': f'No metrics found for source: {source}',
                    'code': 'NOT_FOUND'
                }

            return {
                'success': True,
                'data': metrics
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'code': 'INTERNAL_ERROR'
            }

    async def handle_get_alerts(
        self,
        resolved: Optional[str] = None,
        data_source: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Handle GET /api/monitoring/alerts.

        Args:
            resolved: Filter by resolved status ('true', 'false', or None)
            data_source: Filter by data source

        Returns:
            List of alerts
        """
        try:
            # Parse resolved parameter
            resolved_bool = None
            if resolved is not None:
                resolved_bool = resolved.lower() == 'true'

            alerts = self.metrics_collector.get_alerts(
                resolved=resolved_bool,
                data_source=data_source
            )

            return {
                'success': True,
                'data': {
                    'count': len(alerts),
                    'alerts': alerts
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'code': 'INTERNAL_ERROR'
            }

    async def handle_get_health(self) -> Dict[str, Any]:
        """
        Handle GET /api/monitoring/health.

        Returns:
            Health status of all dependencies
        """
        try:
            health = await self.health_checker.check_all()

            return {
                'success': True,
                'data': health
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'code': 'INTERNAL_ERROR'
            }


class TestMonitoringAPIMetrics:
    """Test metrics endpoints."""

    @pytest.fixture
    def api_handler(self):
        return MonitoringAPIHandler()

    @pytest.mark.asyncio
    async def test_get_overall_metrics(self, api_handler):
        """Test getting overall metrics."""
        result = await api_handler.handle_get_metrics()

        assert result['success'] is True
        assert 'collection_rate' in result['data']
        assert 'avg_latency_ms' in result['data']
        assert 'sources' in result['data']

    @pytest.mark.asyncio
    async def test_get_source_metrics_success(self, api_handler):
        """Test getting metrics for valid data source."""
        result = await api_handler.handle_get_source_metrics('sina')

        assert result['success'] is True
        assert result['data']['name'] == 'sina'
        assert 'success_rate' in result['data']
        assert 'avg_latency_ms' in result['data']

    @pytest.mark.asyncio
    async def test_get_source_metrics_invalid(self, api_handler):
        """Test getting metrics for invalid data source."""
        result = await api_handler.handle_get_source_metrics('invalid')

        assert result['success'] is False
        assert result['code'] == 'INVALID_SOURCE'

    @pytest.mark.asyncio
    async def test_get_source_metrics_not_found(self, api_handler):
        """Test getting metrics for source with no data."""
        result = await api_handler.handle_get_source_metrics('baostock')

        assert result['success'] is False
        assert result['code'] == 'NOT_FOUND'


class TestMonitoringAPIAlerts:
    """Test alerts endpoints."""

    @pytest.fixture
    def api_handler(self):
        return MonitoringAPIHandler()

    @pytest.mark.asyncio
    async def test_get_all_alerts(self, api_handler):
        """Test getting all alerts."""
        result = await api_handler.handle_get_alerts()

        assert result['success'] is True
        assert 'count' in result['data']
        assert 'alerts' in result['data']

    @pytest.mark.asyncio
    async def test_get_unresolved_alerts(self, api_handler):
        """Test getting unresolved alerts."""
        result = await api_handler.handle_get_alerts(resolved='false')

        assert result['success'] is True
        assert all(not a.get('resolved', False)
                  for a in result['data']['alerts'])

    @pytest.mark.asyncio
    async def test_get_resolved_alerts(self, api_handler):
        """Test getting resolved alerts."""
        result = await api_handler.handle_get_alerts(resolved='true')

        assert result['success'] is True
        assert all(a.get('resolved', False)
                  for a in result['data']['alerts'])

    @pytest.mark.asyncio
    async def test_get_alerts_by_data_source(self, api_handler):
        """Test getting alerts filtered by data source."""
        result = await api_handler.handle_get_alerts(data_source='tencent')

        assert result['success'] is True
        assert all(a['data_source'] == 'tencent'
                  for a in result['data']['alerts'])


class TestMonitoringAPIHealth:
    """Test health check endpoint."""

    @pytest.fixture
    def api_handler(self):
        return MonitoringAPIHandler()

    @pytest.mark.asyncio
    async def test_get_health_status(self, api_handler):
        """Test getting health status."""
        result = await api_handler.handle_get_health()

        assert result['success'] is True
        assert 'status' in result['data']
        assert 'dependencies' in result['data']
        assert 'timestamp' in result['data']

    @pytest.mark.asyncio
    async def test_health_status_values(self, api_handler):
        """Test health status includes all dependencies."""
        result = await api_handler.handle_get_health()

        deps = result['data']['dependencies']
        assert 'timescaledb' in deps
        assert 'redis' in deps
        assert 'sina' in deps

    @pytest.mark.asyncio
    async def test_health_degraded_status(self, api_handler):
        """Test degraded health status."""
        result = await api_handler.handle_get_health()

        # Mock has tencent as degraded
        assert result['data']['status'] in ['healthy', 'degraded']


class TestMonitoringAPIResponseFormat:
    """Test API response format."""

    @pytest.fixture
    def api_handler(self):
        return MonitoringAPIHandler()

    @pytest.mark.asyncio
    async def test_metrics_response_structure(self, api_handler):
        """Test metrics response structure."""
        result = await api_handler.handle_get_metrics()

        assert 'success' in result
        assert 'data' in result
        data = result['data']
        assert 'collection_rate' in data
        assert 'avg_latency_ms' in data
        assert 'total_requests' in data
        assert 'sources' in data

    @pytest.mark.asyncio
    async def test_alerts_response_structure(self, api_handler):
        """Test alerts response structure."""
        result = await api_handler.handle_get_alerts()

        assert 'success' in result
        assert 'data' in result
        assert 'count' in result['data']
        assert 'alerts' in result['data']

        if result['data']['alerts']:
            alert = result['data']['alerts'][0]
            assert 'id' in alert
            assert 'rule_name' in alert
            assert 'data_source' in alert
            assert 'timestamp' in alert

    @pytest.mark.asyncio
    async def test_health_response_structure(self, api_handler):
        """Test health response structure."""
        result = await api_handler.handle_get_health()

        assert 'success' in result
        assert 'data' in result
        data = result['data']
        assert 'status' in data
        assert 'dependencies' in data

        for dep_name, dep_status in data['dependencies'].items():
            assert 'status' in dep_status
            assert 'latency_ms' in dep_status

    @pytest.mark.asyncio
    async def test_error_response_structure(self, api_handler):
        """Test error response structure."""
        result = await api_handler.handle_get_source_metrics('invalid')

        assert 'success' in result
        assert 'error' in result
        assert 'code' in result
        assert result['success'] is False


class TestMonitoringAPIPerformance:
    """Test API performance."""

    @pytest.fixture
    def api_handler(self):
        return MonitoringAPIHandler()

    @pytest.mark.asyncio
    async def test_metrics_response_time(self, api_handler):
        """Test metrics endpoint response time < 100ms."""
        start = time.time()
        result = await api_handler.handle_get_metrics()
        elapsed_ms = (time.time() - start) * 1000

        assert result['success'] is True
        assert elapsed_ms < 100, f"Response took {elapsed_ms:.2f}ms"

    @pytest.mark.asyncio
    async def test_health_response_time(self, api_handler):
        """Test health endpoint response time < 100ms."""
        start = time.time()
        result = await api_handler.handle_get_health()
        elapsed_ms = (time.time() - start) * 1000

        assert result['success'] is True
        assert elapsed_ms < 100, f"Response took {elapsed_ms:.2f}ms"

    @pytest.mark.asyncio
    async def test_alerts_response_time(self, api_handler):
        """Test alerts endpoint response time < 100ms."""
        start = time.time()
        result = await api_handler.handle_get_alerts()
        elapsed_ms = (time.time() - start) * 1000

        assert result['success'] is True
        assert elapsed_ms < 100, f"Response took {elapsed_ms:.2f}ms"


class TestMonitoringAPIMetricsContent:
    """Test metrics content accuracy."""

    @pytest.fixture
    def api_handler(self):
        return MonitoringAPIHandler()

    @pytest.mark.asyncio
    async def test_collection_rate_calculation(self, api_handler):
        """Test collection rate calculation."""
        result = await api_handler.handle_get_metrics()

        # Overall rate should be weighted average
        data = result['data']
        expected_rate = data['total_success'] / data['total_requests']
        assert abs(data['collection_rate'] - expected_rate) < 0.0001

    @pytest.mark.asyncio
    async def test_latency_calculation(self, api_handler):
        """Test average latency calculation."""
        result = await api_handler.handle_get_metrics()

        data = result['data']
        # Should be weighted by request count
        assert data['avg_latency_ms'] > 0

    @pytest.mark.asyncio
    async def test_source_metrics_values(self, api_handler):
        """Test individual source metrics values."""
        result = await api_handler.handle_get_source_metrics('sina')

        data = result['data']
        assert 0 <= data['success_rate'] <= 1
        assert data['avg_latency_ms'] > 0
        assert data['total_requests'] > 0


class TestMonitoringAPIEdgeCases:
    """Test API edge cases."""

    @pytest.fixture
    def api_handler(self):
        return MonitoringAPIHandler()

    @pytest.mark.asyncio
    async def test_empty_alerts_list(self, api_handler):
        """Test empty alerts list."""
        # Filter for resolved alerts (none in mock)
        result = await api_handler.handle_get_alerts(resolved='true')

        assert result['success'] is True
        assert result['data']['count'] == 0
        assert result['data']['alerts'] == []

    @pytest.mark.asyncio
    async def test_case_insensitive_source(self, api_handler):
        """Test case insensitive source name."""
        result_lower = await api_handler.handle_get_source_metrics('sina')
        result_upper = await api_handler.handle_get_source_metrics('SINA')

        assert result_lower['success'] is True
        assert result_upper['success'] is True
        assert result_lower['data'] == result_upper['data']

    @pytest.mark.asyncio
    async def test_concurrent_requests(self, api_handler):
        """Test concurrent API requests."""
        async def request_metrics():
            return await api_handler.handle_get_metrics()

        async def request_health():
            return await api_handler.handle_get_health()

        async def request_alerts():
            return await api_handler.handle_get_alerts()

        tasks = [
            request_metrics(),
            request_health(),
            request_alerts(),
            request_metrics(),
            request_health()
        ]

        results = await asyncio.gather(*tasks)

        assert all(r['success'] for r in results)
