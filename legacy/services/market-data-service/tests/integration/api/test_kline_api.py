"""
Integration tests for K-line REST API.

Tests historical K-line query endpoints:
- GET /api/kline/{symbol}?period=1d&start=2026-01-01&end=2026-01-31
- GET /api/kline/{symbol}/latest?period=1d&limit=100
- Parameter validation (date ranges, intervals)
- Performance requirements
"""

import pytest
import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from unittest.mock import Mock, AsyncMock


class MockKlineRepository:
    """Mock K-line data repository."""

    def __init__(self):
        self.data = {}

    async def get_klines(
        self,
        symbol: str,
        interval: str = '1d',
        start: datetime = None,
        end: datetime = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get K-line data."""
        key = f"{symbol}_{interval}"
        klines = self.data.get(key, [])

        # Filter by date range if provided
        if start and end:
            klines = [
                k for k in klines
                if start <= datetime.fromisoformat(k['timestamp']) <= end
            ]

        # Apply limit
        return klines[-limit:] if klines else []

    async def get_latest_klines(
        self,
        symbol: str,
        interval: str = '1d',
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get latest K-lines."""
        key = f"{symbol}_{interval}"
        klines = self.data.get(key, [])
        return klines[-limit:] if klines else []

    def set_mock_data(self, symbol: str, interval: str, klines: List[Dict[str, Any]]):
        """Set mock K-line data."""
        key = f"{symbol}_{interval}"
        self.data[key] = klines


class KlineAPIHandler:
    """
    API handler for K-line endpoints.

    Endpoints:
    - GET /api/kline/{symbol}?period=1d&start=2026-01-01&end=2026-01-31
    - GET /api/kline/{symbol}/latest?period=1d&limit=100
    """

    # Valid intervals
    VALID_INTERVALS = {'1m', '5m', '15m', '30m', '60m', '1d', '1w', '1M'}

    def __init__(self, kline_repository=None):
        self.kline_repository = kline_repository or MockKlineRepository()
        self.request_count = 0
        self.error_count = 0

    def _validate_symbol(self, symbol: str) -> tuple:
        """Validate stock symbol format."""
        if not symbol:
            return False, "Symbol is required"

        symbol_clean = symbol.upper().replace('.SZ', '').replace('.SH', '')

        if not symbol_clean.isdigit():
            return False, "Symbol must contain only digits"

        if len(symbol_clean) != 6:
            return False, "Symbol must be 6 digits"

        return True, None

    def _validate_interval(self, interval: str) -> tuple:
        """Validate interval parameter."""
        if not interval:
            return True, None, '1d'  # Default to daily

        interval_lower = interval.lower()

        if interval_lower not in self.VALID_INTERVALS:
            return False, f"Invalid interval: {interval}", None

        return True, None, interval_lower

    def _validate_date_range(self, start: str, end: str) -> tuple:
        """Validate date range parameters."""
        if not start or not end:
            return False, "Both start and end dates are required", None, None

        try:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))

            if end_dt < start_dt:
                return False, "End date must be after start date", None, None

            # Limit range to 1 year
            if (end_dt - start_dt).days > 365:
                return False, "Date range cannot exceed 1 year", None, None

            return True, None, start_dt, end_dt
        except ValueError:
            return False, "Invalid date format. Use ISO 8601 format", None, None

    def _validate_limit(self, limit: str) -> tuple:
        """Validate limit parameter."""
        if not limit:
            return True, None, 100  # Default

        try:
            limit_int = int(limit)
            if limit_int < 1:
                return False, "Limit must be at least 1", None
            if limit_int > 1000:
                return False, "Limit cannot exceed 1000", None
            return True, None, limit_int
        except ValueError:
            return False, "Limit must be an integer", None

    def _format_kline(self, kline: Dict[str, Any]) -> Dict[str, Any]:
        """Format K-line for API response."""
        return {
            "time": kline.get("timestamp"),
            "open": kline.get("open"),
            "high": kline.get("high"),
            "low": kline.get("low"),
            "close": kline.get("close"),
            "volume": kline.get("volume"),
            "amount": kline.get("amount")
        }

    async def handle_get_kline(
        self,
        symbol: str,
        interval: str = '1d',
        start: str = None,
        end: str = None
    ) -> Dict[str, Any]:
        """
        Handle GET /api/kline/{symbol}.

        Args:
            symbol: Stock symbol
            interval: K-line interval
            start: Start date (ISO format)
            end: End date (ISO format)

        Returns:
            API response dictionary
        """
        self.request_count += 1

        # Validate symbol
        valid, error = self._validate_symbol(symbol)
        if not valid:
            self.error_count += 1
            return {
                "success": False,
                "error": error,
                "code": "INVALID_SYMBOL"
            }

        # Validate interval
        valid, error, interval_clean = self._validate_interval(interval)
        if not valid:
            self.error_count += 1
            return {
                "success": False,
                "error": error,
                "code": "INVALID_INTERVAL"
            }

        # Validate date range
        valid, error, start_dt, end_dt = self._validate_date_range(start, end)
        if not valid:
            self.error_count += 1
            return {
                "success": False,
                "error": error,
                "code": "INVALID_DATE_RANGE"
            }

        try:
            klines = await self.kline_repository.get_klines(
                symbol=symbol,
                interval=interval_clean,
                start=start_dt,
                end=end_dt
            )

            return {
                "success": True,
                "data": {
                    "symbol": symbol,
                    "interval": interval_clean,
                    "start": start,
                    "end": end,
                    "count": len(klines),
                    "klines": [self._format_kline(k) for k in klines]
                }
            }

        except Exception as e:
            self.error_count += 1
            return {
                "success": False,
                "error": str(e),
                "code": "INTERNAL_ERROR"
            }

    async def handle_get_latest_kline(
        self,
        symbol: str,
        interval: str = '1d',
        limit: str = '100'
    ) -> Dict[str, Any]:
        """
        Handle GET /api/kline/{symbol}/latest.

        Args:
            symbol: Stock symbol
            interval: K-line interval
            limit: Number of K-lines to return

        Returns:
            API response dictionary
        """
        self.request_count += 1

        # Validate symbol
        valid, error = self._validate_symbol(symbol)
        if not valid:
            self.error_count += 1
            return {
                "success": False,
                "error": error,
                "code": "INVALID_SYMBOL"
            }

        # Validate interval
        valid, error, interval_clean = self._validate_interval(interval)
        if not valid:
            self.error_count += 1
            return {
                "success": False,
                "error": error,
                "code": "INVALID_INTERVAL"
            }

        # Validate limit
        valid, error, limit_int = self._validate_limit(limit)
        if not valid:
            self.error_count += 1
            return {
                "success": False,
                "error": error,
                "code": "INVALID_LIMIT"
            }

        try:
            klines = await self.kline_repository.get_latest_klines(
                symbol=symbol,
                interval=interval_clean,
                limit=limit_int
            )

            return {
                "success": True,
                "data": {
                    "symbol": symbol,
                    "interval": interval_clean,
                    "limit": limit_int,
                    "count": len(klines),
                    "klines": [self._format_kline(k) for k in klines]
                }
            }

        except Exception as e:
            self.error_count += 1
            return {
                "success": False,
                "error": str(e),
                "code": "INTERNAL_ERROR"
            }

    def get_stats(self) -> Dict[str, Any]:
        """Get API handler statistics."""
        return {
            "request_count": self.request_count,
            "error_count": self.error_count,
            "success_rate": (self.request_count - self.error_count) / self.request_count
                          if self.request_count > 0 else 1.0
        }


class TestKlineAPISymbolValidation:
    """Test symbol validation in K-line API."""

    @pytest.fixture
    def api_handler(self):
        return KlineAPIHandler()

    @pytest.mark.asyncio
    async def test_valid_symbol_with_suffix(self, api_handler):
        """Test valid symbol with exchange suffix."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2026-01-01',
            end='2026-01-31'
        )

        # Should pass validation but no data
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_valid_symbol_without_suffix(self, api_handler):
        """Test valid symbol without exchange suffix."""
        result = await api_handler.handle_get_latest_kline(
            symbol='600519',
            interval='1d'
        )

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_empty_symbol(self, api_handler):
        """Test empty symbol."""
        result = await api_handler.handle_get_kline(
            symbol='',
            interval='1d',
            start='2026-01-01',
            end='2026-01-31'
        )

        assert result["success"] is False
        assert result["code"] == "INVALID_SYMBOL"

    @pytest.mark.asyncio
    async def test_invalid_symbol_format(self, api_handler):
        """Test invalid symbol format."""
        result = await api_handler.handle_get_latest_kline(
            symbol='ABC123',
            interval='1d'
        )

        assert result["success"] is False
        assert result["code"] == "INVALID_SYMBOL"


class TestKlineAPIIntervalValidation:
    """Test interval validation."""

    @pytest.fixture
    def api_handler(self):
        return KlineAPIHandler()

    @pytest.mark.asyncio
    async def test_valid_intervals(self, api_handler):
        """Test all valid intervals."""
        valid_intervals = ['1m', '5m', '15m', '30m', '60m', '1d', '1w', '1M']

        for interval in valid_intervals:
            result = await api_handler.handle_get_latest_kline(
                symbol='000001.SZ',
                interval=interval
            )
            assert result["success"] is True, f"Interval {interval} should be valid"

    @pytest.mark.asyncio
    async def test_invalid_interval(self, api_handler):
        """Test invalid interval."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='2h',  # Invalid
            start='2026-01-01',
            end='2026-01-31'
        )

        assert result["success"] is False
        assert result["code"] == "INVALID_INTERVAL"

    @pytest.mark.asyncio
    async def test_default_interval(self, api_handler):
        """Test default interval (1d)."""
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ'
        )

        assert result["success"] is True
        assert result["data"]["interval"] == "1d"


class TestKlineAPIDateRangeValidation:
    """Test date range validation."""

    @pytest.fixture
    def api_handler(self):
        return KlineAPIHandler()

    @pytest.mark.asyncio
    async def test_valid_date_range(self, api_handler):
        """Test valid date range."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2026-01-01',
            end='2026-01-31'
        )

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_missing_start_date(self, api_handler):
        """Test missing start date."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='',
            end='2026-01-31'
        )

        assert result["success"] is False
        assert result["code"] == "INVALID_DATE_RANGE"

    @pytest.mark.asyncio
    async def test_missing_end_date(self, api_handler):
        """Test missing end date."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2026-01-01',
            end=''
        )

        assert result["success"] is False
        assert result["code"] == "INVALID_DATE_RANGE"

    @pytest.mark.asyncio
    async def test_end_before_start(self, api_handler):
        """Test end date before start date."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2026-02-01',
            end='2026-01-01'
        )

        assert result["success"] is False
        assert "End date must be after start date" in result["error"]

    @pytest.mark.asyncio
    async def test_date_range_too_large(self, api_handler):
        """Test date range exceeding 1 year."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2025-01-01',
            end='2027-01-01'  # More than 1 year
        )

        assert result["success"] is False
        assert "cannot exceed 1 year" in result["error"]

    @pytest.mark.asyncio
    async def test_invalid_date_format(self, api_handler):
        """Test invalid date format."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='01-01-2026',  # Wrong format
            end='2026-01-31'
        )

        assert result["success"] is False
        assert result["code"] == "INVALID_DATE_RANGE"


class TestKlineAPILimitValidation:
    """Test limit parameter validation."""

    @pytest.fixture
    def api_handler(self):
        return KlineAPIHandler()

    @pytest.mark.asyncio
    async def test_default_limit(self, api_handler):
        """Test default limit (100)."""
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ'
        )

        assert result["success"] is True
        assert result["data"]["limit"] == 100

    @pytest.mark.asyncio
    async def test_valid_limit(self, api_handler):
        """Test valid limit values."""
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ',
            limit='500'
        )

        assert result["success"] is True
        assert result["data"]["limit"] == 500

    @pytest.mark.asyncio
    async def test_limit_too_small(self, api_handler):
        """Test limit less than 1."""
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ',
            limit='0'
        )

        assert result["success"] is False
        assert result["code"] == "INVALID_LIMIT"

    @pytest.mark.asyncio
    async def test_limit_too_large(self, api_handler):
        """Test limit exceeding 1000."""
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ',
            limit='2000'
        )

        assert result["success"] is False
        assert result["code"] == "INVALID_LIMIT"

    @pytest.mark.asyncio
    async def test_limit_not_integer(self, api_handler):
        """Test non-integer limit."""
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ',
            limit='abc'
        )

        assert result["success"] is False
        assert result["code"] == "INVALID_LIMIT"


class TestKlineAPIDataRetrieval:
    """Test K-line data retrieval."""

    @pytest.fixture
    def api_handler(self):
        repo = MockKlineRepository()
        handler = KlineAPIHandler(kline_repository=repo)

        # Set up mock data
        klines = []
        base_time = datetime(2026, 1, 1)
        for i in range(60):
            klines.append({
                "timestamp": (base_time + timedelta(days=i)).isoformat(),
                "open": 10.0 + i * 0.01,
                "high": 10.2 + i * 0.01,
                "low": 9.8 + i * 0.01,
                "close": 10.1 + i * 0.01,
                "volume": 1000000 + i * 1000,
                "amount": 10000000.0 + i * 10000
            })

        repo.set_mock_data('000001.SZ', '1d', klines)
        return handler

    @pytest.mark.asyncio
    async def test_get_kline_with_date_range(self, api_handler):
        """Test getting K-line data with date range."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2026-01-01',
            end='2026-01-31'
        )

        assert result["success"] is True
        assert result["data"]["symbol"] == "000001.SZ"
        assert result["data"]["interval"] == "1d"
        assert len(result["data"]["klines"]) > 0

    @pytest.mark.asyncio
    async def test_get_latest_klines(self, api_handler):
        """Test getting latest K-lines."""
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ',
            interval='1d',
            limit='30'
        )

        assert result["success"] is True
        assert result["data"]["count"] <= 30

    @pytest.mark.asyncio
    async def test_empty_result(self, api_handler):
        """Test request with no data."""
        result = await api_handler.handle_get_kline(
            symbol='999999.SZ',  # No data for this symbol
            interval='1d',
            start='2026-01-01',
            end='2026-01-31'
        )

        assert result["success"] is True
        assert result["data"]["count"] == 0
        assert result["data"]["klines"] == []


class TestKlineAPIResponseFormat:
    """Test K-line API response format."""

    @pytest.fixture
    def api_handler(self):
        repo = MockKlineRepository()
        handler = KlineAPIHandler(kline_repository=repo)

        klines = [{
            "timestamp": "2026-01-01T00:00:00",
            "open": 10.0,
            "high": 10.5,
            "low": 9.8,
            "close": 10.2,
            "volume": 1000000,
            "amount": 10200000.0
        }]

        repo.set_mock_data('000001.SZ', '1d', klines)
        return handler

    @pytest.mark.asyncio
    async def test_kline_data_structure(self, api_handler):
        """Test K-line data structure in response."""
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ',
            limit='1'
        )

        assert result["success"] is True
        kline = result["data"]["klines"][0]

        assert "time" in kline
        assert "open" in kline
        assert "high" in kline
        assert "low" in kline
        assert "close" in kline
        assert "volume" in kline
        assert "amount" in kline

    @pytest.mark.asyncio
    async def test_response_includes_metadata(self, api_handler):
        """Test response includes metadata."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2026-01-01',
            end='2026-01-31'
        )

        assert result["success"] is True
        assert "symbol" in result["data"]
        assert "interval" in result["data"]
        assert "start" in result["data"]
        assert "end" in result["data"]
        assert "count" in result["data"]


class TestKlineAPIPerformance:
    """Test K-line API performance."""

    @pytest.fixture
    def api_handler(self):
        repo = MockKlineRepository()
        handler = KlineAPIHandler(kline_repository=repo)

        # Set up large dataset
        klines = []
        base_time = datetime(2026, 1, 1)
        for i in range(365):
            klines.append({
                "timestamp": (base_time + timedelta(days=i)).isoformat(),
                "open": 10.0,
                "high": 10.5,
                "low": 9.8,
                "close": 10.2,
                "volume": 1000000,
                "amount": 10200000.0
            })

        repo.set_mock_data('000001.SZ', '1d', klines)
        return handler

    @pytest.mark.asyncio
    async def test_kline_query_response_time(self, api_handler):
        """Test K-line query response time < 100ms."""
        start = time.time()
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2026-01-01',
            end='2026-03-31'
        )
        elapsed_ms = (time.time() - start) * 1000

        assert result["success"] is True
        assert elapsed_ms < 100, f"Response took {elapsed_ms:.2f}ms, expected < 100ms"

    @pytest.mark.asyncio
    async def test_latest_kline_response_time(self, api_handler):
        """Test latest K-line query response time < 100ms."""
        start = time.time()
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ',
            limit='100'
        )
        elapsed_ms = (time.time() - start) * 1000

        assert result["success"] is True
        assert elapsed_ms < 100, f"Response took {elapsed_ms:.2f}ms, expected < 100ms"


class TestKlineAPIEdgeCases:
    """Test K-line API edge cases."""

    @pytest.fixture
    def api_handler(self):
        return KlineAPIHandler()

    @pytest.mark.asyncio
    async def test_interval_case_insensitive(self, api_handler):
        """Test interval case insensitivity."""
        result = await api_handler.handle_get_latest_kline(
            symbol='000001.SZ',
            interval='1D'  # Uppercase
        )

        assert result["success"] is True
        assert result["data"]["interval"] == "1d"

    @pytest.mark.asyncio
    async def test_same_start_end_date(self, api_handler):
        """Test same start and end date."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2026-01-15',
            end='2026-01-15'
        )

        # Should be valid (0 day range)
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_future_date(self, api_handler):
        """Test requesting future dates."""
        result = await api_handler.handle_get_kline(
            symbol='000001.SZ',
            interval='1d',
            start='2030-01-01',
            end='2030-01-31'
        )

        # Should be valid, just return empty
        assert result["success"] is True
        assert result["data"]["count"] == 0
