"""
Unit tests for collector metrics collection.

Tests metrics tracking for data collection:
- Collection success/failure rates
- Latency tracking
- Data source health status
- Alert triggering
"""

import pytest
import time
import asyncio
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import deque


@dataclass
class DataSourceMetrics:
    """Metrics for a single data source."""
    name: str
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    total_latency_ms: float = 0
    max_latency_ms: float = 0
    min_latency_ms: float = float('inf')
    last_request_time: Optional[datetime] = None
    last_success_time: Optional[datetime] = None
    last_failure_time: Optional[datetime] = None
    consecutive_failures: int = 0
    consecutive_successes: int = 0
    recent_latencies: deque = field(default_factory=lambda: deque(maxlen=100))

    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        if self.total_requests == 0:
            return 1.0
        return self.successful_requests / self.total_requests

    @property
    def avg_latency_ms(self) -> float:
        """Calculate average latency."""
        if self.total_requests == 0:
            return 0.0
        return self.total_latency_ms / self.total_requests

    def record_success(self, latency_ms: float):
        """Record a successful request."""
        self.total_requests += 1
        self.successful_requests += 1
        self.consecutive_failures = 0
        self.consecutive_successes += 1
        self.total_latency_ms += latency_ms
        self.max_latency_ms = max(self.max_latency_ms, latency_ms)
        self.min_latency_ms = min(self.min_latency_ms, latency_ms)
        self.last_request_time = datetime.now()
        self.last_success_time = datetime.now()
        self.recent_latencies.append(latency_ms)

    def record_failure(self, latency_ms: float = 0):
        """Record a failed request."""
        self.total_requests += 1
        self.failed_requests += 1
        self.consecutive_failures += 1
        self.consecutive_successes = 0
        self.last_request_time = datetime.now()
        self.last_failure_time = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'name': self.name,
            'total_requests': self.total_requests,
            'successful_requests': self.successful_requests,
            'failed_requests': self.failed_requests,
            'success_rate': round(self.success_rate, 4),
            'avg_latency_ms': round(self.avg_latency_ms, 2),
            'max_latency_ms': round(self.max_latency_ms, 2) if self.max_latency_ms > 0 else 0,
            'min_latency_ms': round(self.min_latency_ms, 2) if self.min_latency_ms < float('inf') else 0,
            'last_request_time': self.last_request_time.isoformat() if self.last_request_time else None,
            'last_success_time': self.last_success_time.isoformat() if self.last_success_time else None,
            'last_failure_time': self.last_failure_time.isoformat() if self.last_failure_time else None,
            'consecutive_failures': self.consecutive_failures,
            'consecutive_successes': self.consecutive_successes,
        }


@dataclass
class AlertRule:
    """Alert rule configuration."""
    name: str
    metric: str  # 'success_rate', 'consecutive_failures', 'avg_latency_ms'
    threshold: float
    operator: str  # 'lt', 'gt', 'eq'
    duration_seconds: int = 0
    data_source: Optional[str] = None  # None = all sources


class CollectorMetricsCollector:
    """
    Collector for data collection metrics.

    Tracks:
    - Collection rates per data source
    - Latency statistics
    - Health status
    - Alert generation
    """

    def __init__(self):
        self.data_sources: Dict[str, DataSourceMetrics] = {}
        self.alert_rules: List[AlertRule] = []
        self.alerts: List[Dict[str, Any]] = []
        self.start_time = datetime.now()

    def register_data_source(self, name: str):
        """Register a data source for tracking."""
        if name not in self.data_sources:
            self.data_sources[name] = DataSourceMetrics(name=name)

    def record_request(
        self,
        data_source: str,
        success: bool,
        latency_ms: float
    ):
        """
        Record a collection request.

        Args:
            data_source: Data source name
            success: Whether request succeeded
            latency_ms: Request latency in milliseconds
        """
        if data_source not in self.data_sources:
            self.register_data_source(data_source)

        metrics = self.data_sources[data_source]
        if success:
            metrics.record_success(latency_ms)
        else:
            metrics.record_failure(latency_ms)

        # Check alert rules
        self._check_alerts(data_source, metrics)

    def add_alert_rule(self, rule: AlertRule):
        """Add an alert rule."""
        self.alert_rules.append(rule)

    def _check_alerts(self, data_source: str, metrics: DataSourceMetrics):
        """Check if any alert rules are triggered."""
        for rule in self.alert_rules:
            # Skip if rule is for specific data source and doesn't match
            if rule.data_source and rule.data_source != data_source:
                continue

            triggered = False
            value = None

            if rule.metric == 'success_rate':
                value = metrics.success_rate
            elif rule.metric == 'consecutive_failures':
                value = metrics.consecutive_failures
            elif rule.metric == 'avg_latency_ms':
                value = metrics.avg_latency_ms

            if value is not None:
                if rule.operator == 'lt':
                    triggered = value < rule.threshold
                elif rule.operator == 'gt':
                    triggered = value > rule.threshold
                elif rule.operator == 'eq':
                    triggered = value == rule.threshold

            if triggered:
                self._trigger_alert(rule, data_source, value)

    def _trigger_alert(
        self,
        rule: AlertRule,
        data_source: str,
        value: float
    ):
        """Trigger an alert."""
        # Check if similar alert already exists
        for alert in self.alerts:
            if (alert['rule_name'] == rule.name and
                alert['data_source'] == data_source and
                not alert.get('resolved', False)):
                return  # Don't duplicate

        self.alerts.append({
            'id': len(self.alerts) + 1,
            'rule_name': rule.name,
            'data_source': data_source,
            'metric': rule.metric,
            'threshold': rule.threshold,
            'actual_value': value,
            'timestamp': datetime.now().isoformat(),
            'resolved': False
        })

    def resolve_alert(self, alert_id: int):
        """Mark an alert as resolved."""
        for alert in self.alerts:
            if alert['id'] == alert_id:
                alert['resolved'] = True
                alert['resolved_at'] = datetime.now().isoformat()
                break

    def get_metrics(self, data_source: Optional[str] = None) -> Dict[str, Any]:
        """Get metrics for data sources."""
        if data_source:
            if data_source in self.data_sources:
                return self.data_sources[data_source].to_dict()
            return {}

        return {
            name: metrics.to_dict()
            for name, metrics in self.data_sources.items()
        }

    def get_overall_metrics(self) -> Dict[str, Any]:
        """Get overall collection metrics."""
        total_requests = sum(m.total_requests for m in self.data_sources.values())
        total_success = sum(m.successful_requests for m in self.data_sources.values())
        total_latency = sum(m.total_latency_ms for m in self.data_sources.values())

        return {
            'collection_rate': round(total_success / total_requests, 4) if total_requests > 0 else 1.0,
            'avg_latency_ms': round(total_latency / total_requests, 2) if total_requests > 0 else 0.0,
            'total_requests': total_requests,
            'total_success': total_success,
            'total_failures': total_requests - total_success,
            'data_sources': len(self.data_sources),
            'uptime_seconds': (datetime.now() - self.start_time).total_seconds()
        }

    def get_alerts(
        self,
        resolved: Optional[bool] = None,
        data_source: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get alerts with optional filtering."""
        alerts = self.alerts

        if resolved is not None:
            alerts = [a for a in alerts if a.get('resolved', False) == resolved]

        if data_source:
            alerts = [a for a in alerts if a['data_source'] == data_source]

        return alerts

    def reset_metrics(self):
        """Reset all metrics."""
        self.data_sources.clear()
        self.alerts.clear()
        self.start_time = datetime.now()


class TestDataSourceMetrics:
    """Test DataSourceMetrics class."""

    @pytest.fixture
    def metrics(self):
        return DataSourceMetrics(name='sina')

    def test_initial_state(self, metrics):
        """Test initial state of metrics."""
        assert metrics.name == 'sina'
        assert metrics.total_requests == 0
        assert metrics.success_rate == 1.0
        assert metrics.avg_latency_ms == 0.0

    def test_record_success(self, metrics):
        """Test recording successful request."""
        metrics.record_success(150)

        assert metrics.total_requests == 1
        assert metrics.successful_requests == 1
        assert metrics.success_rate == 1.0
        assert metrics.avg_latency_ms == 150.0
        assert metrics.consecutive_successes == 1
        assert metrics.consecutive_failures == 0

    def test_record_failure(self, metrics):
        """Test recording failed request."""
        metrics.record_failure()

        assert metrics.total_requests == 1
        assert metrics.failed_requests == 1
        assert metrics.success_rate == 0.0
        assert metrics.consecutive_failures == 1

    def test_consecutive_failures(self, metrics):
        """Test consecutive failures tracking."""
        metrics.record_failure()
        metrics.record_failure()
        metrics.record_failure()

        assert metrics.consecutive_failures == 3
        assert metrics.consecutive_successes == 0

    def test_consecutive_successes(self, metrics):
        """Test consecutive successes tracking."""
        metrics.record_success(100)
        metrics.record_success(120)
        metrics.record_success(110)

        assert metrics.consecutive_successes == 3
        assert metrics.consecutive_failures == 0

    def test_success_rate_calculation(self, metrics):
        """Test success rate calculation."""
        for _ in range(8):
            metrics.record_success(100)
        for _ in range(2):
            metrics.record_failure()

        assert metrics.success_rate == 0.8

    def test_latency_tracking(self, metrics):
        """Test latency tracking."""
        latencies = [100, 150, 200, 120, 180]
        for latency in latencies:
            metrics.record_success(latency)

        assert metrics.avg_latency_ms == sum(latencies) / len(latencies)
        assert metrics.max_latency_ms == max(latencies)
        assert metrics.min_latency_ms == min(latencies)

    def test_to_dict(self, metrics):
        """Test conversion to dictionary."""
        metrics.record_success(150)
        result = metrics.to_dict()

        assert result['name'] == 'sina'
        assert result['total_requests'] == 1
        assert result['success_rate'] == 1.0
        assert result['avg_latency_ms'] == 150.0


class TestCollectorMetricsCollector:
    """Test CollectorMetricsCollector class."""

    @pytest.fixture
    def collector(self):
        return CollectorMetricsCollector()

    def test_register_data_source(self, collector):
        """Test registering data source."""
        collector.register_data_source('sina')

        assert 'sina' in collector.data_sources
        assert collector.data_sources['sina'].name == 'sina'

    def test_record_request_success(self, collector):
        """Test recording successful request."""
        collector.record_request('sina', success=True, latency_ms=150)

        metrics = collector.data_sources['sina']
        assert metrics.total_requests == 1
        assert metrics.successful_requests == 1

    def test_record_request_failure(self, collector):
        """Test recording failed request."""
        collector.record_request('sina', success=False, latency_ms=0)

        metrics = collector.data_sources['sina']
        assert metrics.total_requests == 1
        assert metrics.failed_requests == 1

    def test_get_metrics_single_source(self, collector):
        """Test getting metrics for single source."""
        collector.record_request('sina', success=True, latency_ms=150)

        result = collector.get_metrics('sina')

        assert result['name'] == 'sina'
        assert result['total_requests'] == 1

    def test_get_metrics_all_sources(self, collector):
        """Test getting metrics for all sources."""
        collector.record_request('sina', success=True, latency_ms=150)
        collector.record_request('tencent', success=True, latency_ms=200)

        result = collector.get_metrics()

        assert len(result) == 2
        assert 'sina' in result
        assert 'tencent' in result

    def test_get_overall_metrics(self, collector):
        """Test getting overall metrics."""
        for _ in range(8):
            collector.record_request('sina', success=True, latency_ms=100)
        collector.record_request('sina', success=False, latency_ms=0)

        result = collector.get_overall_metrics()

        assert result['collection_rate'] == 0.8889  # 8/9
        assert result['total_requests'] == 9
        assert result['data_sources'] == 1

    def test_reset_metrics(self, collector):
        """Test resetting metrics."""
        collector.record_request('sina', success=True, latency_ms=100)

        collector.reset_metrics()

        assert len(collector.data_sources) == 0
        assert len(collector.alerts) == 0


class TestAlertRules:
    """Test alert rule functionality."""

    @pytest.fixture
    def collector(self):
        return CollectorMetricsCollector()

    def test_add_alert_rule(self, collector):
        """Test adding alert rule."""
        rule = AlertRule(
            name='low_success_rate',
            metric='success_rate',
            threshold=0.95,
            operator='lt'
        )

        collector.add_alert_rule(rule)

        assert len(collector.alert_rules) == 1

    def test_alert_triggered_low_success_rate(self, collector):
        """Test alert triggered when success rate drops below threshold."""
        rule = AlertRule(
            name='low_success_rate',
            metric='success_rate',
            threshold=0.95,
            operator='lt',
            data_source='sina'
        )
        collector.add_alert_rule(rule)

        # Generate failures to drop success rate below 0.95
        for _ in range(10):
            collector.record_request('sina', success=False, latency_ms=0)

        assert len(collector.alerts) == 1
        assert collector.alerts[0]['rule_name'] == 'low_success_rate'

    def test_alert_triggered_consecutive_failures(self, collector):
        """Test alert triggered on consecutive failures."""
        rule = AlertRule(
            name='consecutive_failures',
            metric='consecutive_failures',
            threshold=5,
            operator='gt',
            data_source='sina'
        )
        collector.add_alert_rule(rule)

        # Generate 6 consecutive failures
        for _ in range(6):
            collector.record_request('sina', success=False, latency_ms=0)

        assert len(collector.alerts) == 1
        assert collector.alerts[0]['rule_name'] == 'consecutive_failures'

    def test_alert_triggered_high_latency(self, collector):
        """Test alert triggered on high latency."""
        rule = AlertRule(
            name='high_latency',
            metric='avg_latency_ms',
            threshold=500,
            operator='gt',
            data_source='sina'
        )
        collector.add_alert_rule(rule)

        # Generate requests with high latency
        for _ in range(3):
            collector.record_request('sina', success=True, latency_ms=600)

        assert len(collector.alerts) == 1

    def test_no_duplicate_alerts(self, collector):
        """Test no duplicate alerts are created."""
        rule = AlertRule(
            name='low_success_rate',
            metric='success_rate',
            threshold=0.95,
            operator='lt',
            data_source='sina'
        )
        collector.add_alert_rule(rule)

        # Generate failures multiple times
        for _ in range(5):
            collector.record_request('sina', success=False, latency_ms=0)

        # Should only have one alert
        assert len(collector.alerts) == 1

    def test_resolve_alert(self, collector):
        """Test resolving an alert."""
        rule = AlertRule(
            name='test_alert',
            metric='success_rate',
            threshold=0.95,
            operator='lt',
            data_source='sina'
        )
        collector.add_alert_rule(rule)
        collector.record_request('sina', success=False, latency_ms=0)

        collector.resolve_alert(1)

        assert collector.alerts[0]['resolved'] is True
        assert 'resolved_at' in collector.alerts[0]


class TestAlertsFiltering:
    """Test alert filtering functionality."""

    @pytest.fixture
    def collector_with_alerts(self):
        collector = CollectorMetricsCollector()
        collector.alerts = [
            {
                'id': 1,
                'rule_name': 'alert1',
                'data_source': 'sina',
                'resolved': False
            },
            {
                'id': 2,
                'rule_name': 'alert2',
                'data_source': 'tencent',
                'resolved': True
            },
            {
                'id': 3,
                'rule_name': 'alert3',
                'data_source': 'sina',
                'resolved': False
            }
        ]
        return collector

    def test_get_all_alerts(self, collector_with_alerts):
        """Test getting all alerts."""
        alerts = collector_with_alerts.get_alerts()

        assert len(alerts) == 3

    def test_get_unresolved_alerts(self, collector_with_alerts):
        """Test getting unresolved alerts."""
        alerts = collector_with_alerts.get_alerts(resolved=False)

        assert len(alerts) == 2
        assert all(not a['resolved'] for a in alerts)

    def test_get_resolved_alerts(self, collector_with_alerts):
        """Test getting resolved alerts."""
        alerts = collector_with_alerts.get_alerts(resolved=True)

        assert len(alerts) == 1
        assert alerts[0]['resolved'] is True

    def test_get_alerts_by_data_source(self, collector_with_alerts):
        """Test getting alerts by data source."""
        alerts = collector_with_alerts.get_alerts(data_source='sina')

        assert len(alerts) == 2
        assert all(a['data_source'] == 'sina' for a in alerts)

    def test_get_alerts_combined_filter(self, collector_with_alerts):
        """Test getting alerts with combined filters."""
        alerts = collector_with_alerts.get_alerts(
            resolved=False,
            data_source='sina'
        )

        assert len(alerts) == 2
        assert all(not a['resolved'] and a['data_source'] == 'sina' for a in alerts)


class TestMetricsEdgeCases:
    """Test metrics edge cases."""

    @pytest.fixture
    def collector(self):
        return CollectorMetricsCollector()

    def test_no_requests_success_rate(self, collector):
        """Test success rate when no requests made."""
        collector.register_data_source('sina')

        metrics = collector.data_sources['sina']
        assert metrics.success_rate == 1.0

    def test_zero_latency_min(self, collector):
        """Test min latency with zero requests."""
        collector.register_data_source('sina')

        metrics = collector.data_sources['sina']
        # min_latency_ms should be inf initially
        result = metrics.to_dict()
        assert result['min_latency_ms'] == 0

    def test_single_failure_rate(self, collector):
        """Test success rate with single failure."""
        collector.record_request('sina', success=False, latency_ms=0)

        metrics = collector.data_sources['sina']
        assert metrics.success_rate == 0.0

    def test_single_success_rate(self, collector):
        """Test success rate with single success."""
        collector.record_request('sina', success=True, latency_ms=100)

        metrics = collector.data_sources['sina']
        assert metrics.success_rate == 1.0

    def test_alternating_success_failure(self, collector):
        """Test metrics with alternating success and failure."""
        for i in range(10):
            collector.record_request('sina', success=i % 2 == 0, latency_ms=100)

        metrics = collector.data_sources['sina']
        assert metrics.success_rate == 0.5
        assert metrics.consecutive_successes == 0  # Last was failure

    def test_multiple_data_sources_independence(self, collector):
        """Test that data sources track metrics independently."""
        collector.record_request('sina', success=True, latency_ms=100)
        collector.record_request('sina', success=True, latency_ms=120)
        collector.record_request('tencent', success=False, latency_ms=0)

        sina_metrics = collector.data_sources['sina']
        tencent_metrics = collector.data_sources['tencent']

        assert sina_metrics.success_rate == 1.0
        assert tencent_metrics.success_rate == 0.0
