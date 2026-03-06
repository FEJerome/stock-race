"""
Integration tests for technical indicator API endpoints.

Tests the API layer for calculating and retrieving technical indicators.
"""

import pytest
import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from unittest.mock import Mock, AsyncMock, patch


class MockIndicatorService:
    """Mock indicator service for API testing."""

    def __init__(self):
        self.calculate_calls = []

    async def calculate(
        self,
        symbol: str,
        indicators: List[str],
        klines: List = None
    ) -> Dict[str, Any]:
        """Mock calculate method."""
        self.calculate_calls.append({
            'symbol': symbol,
            'indicators': indicators,
            'klines_count': len(klines) if klines else 0
        })

        # Return mock results based on indicators requested
        result = {
            'symbol': symbol,
            'timestamp': datetime.now().isoformat(),
            'indicators': {}
        }

        for ind in indicators:
            ind_lower = ind.lower()
            if ind_lower in ['ma', 'sma']:
                result['indicators'].update({
                    'ma5': 10.50,
                    'ma10': 10.45,
                    'ma20': 10.30,
                    'ma60': 10.15
                })
            elif ind_lower == 'macd':
                result['indicators'].update({
                    'macd': 0.05,
                    'macd_signal': 0.03,
                    'macd_hist': 0.02
                })
            elif ind_lower == 'rsi':
                result['indicators']['rsi'] = 58.5
            elif ind_lower in ['bollinger', 'bb']:
                result['indicators'].update({
                    'bb_middle': 10.50,
                    'bb_upper': 11.00,
                    'bb_lower': 10.00,
                    'bb_width': 9.52,
                    'bb_percent': 0.50
                })

        return result


class MockKlineRepository:
    """Mock K-line data repository."""

    def __init__(self):
        self.data = {}

    async def get_klines(
        self,
        symbol: str,
        interval: str = '1d',
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Mock get K-lines method."""
        # Generate mock K-line data
        klines = []
        base_time = datetime.now() - timedelta(days=limit)

        for i in range(limit):
            base_price = 10.0 + i * 0.01
            klines.append({
                'timestamp': (base_time + timedelta(days=i)).isoformat(),
                'open': base_price,
                'high': base_price + 0.2,
                'low': base_price - 0.1,
                'close': base_price + 0.05,
                'volume': 1000000 + i * 1000
            })

        return klines

    async def get_klines_range(
        self,
        symbol: str,
        interval: str,
        start: datetime,
        end: datetime
    ) -> List[Dict[str, Any]]:
        """Mock get K-lines for date range."""
        days = (end - start).days + 1
        return await self.get_klines(symbol, interval, limit=days)


class IndicatorAPIHandler:
    """
    API handler for technical indicator endpoints.

    Handles requests like:
    GET /api/indicators/{symbol}?indicators=ma,macd,rsi&period=60
    """

    def __init__(
        self,
        indicator_service=None,
        kline_repository=None
    ):
        self.indicator_service = indicator_service or MockIndicatorService()
        self.kline_repository = kline_repository or MockKlineRepository()
        self.request_count = 0
        self.error_count = 0

    def _validate_symbol(self, symbol: str) -> tuple:
        """Validate stock symbol format."""
        if not symbol:
            return False, "Symbol is required"

        # Support formats: 000001.SZ, 600519.SH, 000001, 600519
        symbol_clean = symbol.upper().replace('.SZ', '').replace('.SH', '')

        if not symbol_clean.isdigit():
            return False, "Invalid symbol format"

        if len(symbol_clean) != 6:
            return False, "Symbol must be 6 digits"

        return True, None

    def _validate_indicators(self, indicators: str) -> tuple:
        """Validate indicators parameter."""
        if not indicators:
            return False, "Indicators parameter is required", []

        valid_indicators = {'ma', 'sma', 'macd', 'rsi', 'bollinger', 'bb'}
        requested = [i.strip().lower() for i in indicators.split(',')]

        invalid = [i for i in requested if i not in valid_indicators]

        if invalid:
            return False, f"Invalid indicators: {', '.join(invalid)}", []

        return True, None, requested

    def _validate_period(self, period: str) -> tuple:
        """Validate period parameter."""
        if not period:
            return True, None, 60  # Default

        try:
            period_int = int(period)
            if period_int < 5:
                return False, "Period must be at least 5", None
            if period_int > 500:
                return False, "Period cannot exceed 500", None
            return True, None, period_int
        except ValueError:
            return False, "Period must be an integer", None

    async def handle_get_indicators(
        self,
        symbol: str,
        indicators: str,
        period: str = '60',
        interval: str = '1d'
    ) -> Dict[str, Any]:
        """
        Handle GET /api/indicators/{symbol} request.

        Args:
            symbol: Stock symbol
            indicators: Comma-separated list of indicators
            period: Number of periods to calculate (default: 60)
            interval: K-line interval (default: 1d)

        Returns:
            API response dictionary
        """
        self.request_count += 1

        # Validate symbol
        valid, error = self._validate_symbol(symbol)
        if not valid:
            self.error_count += 1
            return {
                'success': False,
                'error': error,
                'code': 'INVALID_SYMBOL'
            }

        # Validate indicators
        valid, error, indicator_list = self._validate_indicators(indicators)
        if not valid:
            self.error_count += 1
            return {
                'success': False,
                'error': error,
                'code': 'INVALID_INDICATORS'
            }

        # Validate period
        valid, error, period_int = self._validate_period(period)
        if not valid:
            self.error_count += 1
            return {
                'success': False,
                'error': error,
                'code': 'INVALID_PERIOD'
            }

        try:
            # Fetch K-line data
            klines = await self.kline_repository.get_klines(
                symbol=symbol,
                interval=interval,
                limit=period_int
            )

            if len(klines) < 20:
                return {
                    'success': False,
                    'error': 'Insufficient historical data',
                    'code': 'INSUFFICIENT_DATA',
                    'data_points': len(klines)
                }

            # Calculate indicators
            result = await self.indicator_service.calculate(
                symbol=symbol,
                indicators=indicator_list,
                klines=klines
            )

            return {
                'success': True,
                'data': result
            }

        except Exception as e:
            self.error_count += 1
            return {
                'success': False,
                'error': str(e),
                'code': 'CALCULATION_ERROR'
            }

    async def handle_get_supported_indicators(self) -> Dict[str, Any]:
        """Handle GET /api/indicators/supported request."""
        return {
            'success': True,
            'indicators': [
                {
                    'name': 'ma',
                    'full_name': 'Moving Average',
                    'description': 'Simple moving averages (5, 10, 20, 60 periods)',
                    'params': ['period']
                },
                {
                    'name': 'macd',
                    'full_name': 'MACD',
                    'description': 'Moving Average Convergence Divergence',
                    'params': ['fast', 'slow', 'signal']
                },
                {
                    'name': 'rsi',
                    'full_name': 'Relative Strength Index',
                    'description': 'Momentum oscillator (0-100)',
                    'params': ['period']
                },
                {
                    'name': 'bollinger',
                    'full_name': 'Bollinger Bands',
                    'description': 'Volatility bands',
                    'params': ['period', 'std_dev']
                }
            ]
        }

    def get_stats(self) -> Dict[str, Any]:
        """Get API handler statistics."""
        return {
            'request_count': self.request_count,
            'error_count': self.error_count,
            'success_rate': (self.request_count - self.error_count) / self.request_count
                          if self.request_count > 0 else 1.0
        }


class TestIndicatorAPISymbolValidation:
    """Test symbol validation in API."""

    @pytest.fixture
    def api_handler(self):
        return IndicatorAPIHandler()

    @pytest.mark.asyncio
    async def test_valid_symbol_with_exchange(self, api_handler):
        """Test valid symbol with exchange suffix."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma'
        )

        assert result['success'] is True

    @pytest.mark.asyncio
    async def test_valid_symbol_without_exchange(self, api_handler):
        """Test valid symbol without exchange suffix."""
        result = await api_handler.handle_get_indicators(
            symbol='600519',
            indicators='ma'
        )

        assert result['success'] is True

    @pytest.mark.asyncio
    async def test_empty_symbol(self, api_handler):
        """Test empty symbol."""
        result = await api_handler.handle_get_indicators(
            symbol='',
            indicators='ma'
        )

        assert result['success'] is False
        assert result['code'] == 'INVALID_SYMBOL'
        assert 'Symbol is required' in result['error']

    @pytest.mark.asyncio
    async def test_invalid_symbol_format(self, api_handler):
        """Test invalid symbol format."""
        result = await api_handler.handle_get_indicators(
            symbol='ABC123',
            indicators='ma'
        )

        assert result['success'] is False
        assert result['code'] == 'INVALID_SYMBOL'

    @pytest.mark.asyncio
    async def test_symbol_wrong_length(self, api_handler):
        """Test symbol with wrong length."""
        result = await api_handler.handle_get_indicators(
            symbol='00001',
            indicators='ma'
        )

        assert result['success'] is False
        assert '6 digits' in result['error']


class TestIndicatorAPIIndicatorsValidation:
    """Test indicators parameter validation."""

    @pytest.fixture
    def api_handler(self):
        return IndicatorAPIHandler()

    @pytest.mark.asyncio
    async def test_valid_single_indicator(self, api_handler):
        """Test valid single indicator."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma'
        )

        assert result['success'] is True

    @pytest.mark.asyncio
    async def test_valid_multiple_indicators(self, api_handler):
        """Test valid multiple indicators."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma,macd,rsi'
        )

        assert result['success'] is True
        assert 'ma5' in result['data']['indicators']
        assert 'macd' in result['data']['indicators']
        assert 'rsi' in result['data']['indicators']

    @pytest.mark.asyncio
    async def test_empty_indicators(self, api_handler):
        """Test empty indicators parameter."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators=''
        )

        assert result['success'] is False
        assert result['code'] == 'INVALID_INDICATORS'

    @pytest.mark.asyncio
    async def test_invalid_indicator(self, api_handler):
        """Test invalid indicator name."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma,invalid_indicator'
        )

        assert result['success'] is False
        assert result['code'] == 'INVALID_INDICATORS'
        assert 'Invalid indicators' in result['error']

    @pytest.mark.asyncio
    async def test_case_insensitive_indicators(self, api_handler):
        """Test case-insensitive indicator names."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='MA,MacD,RSI,Bollinger'
        )

        assert result['success'] is True


class TestIndicatorAPIPeriodValidation:
    """Test period parameter validation."""

    @pytest.fixture
    def api_handler(self):
        return IndicatorAPIHandler()

    @pytest.mark.asyncio
    async def test_default_period(self, api_handler):
        """Test default period value."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma',
            period=''
        )

        # Should use default of 60
        assert result['success'] is True

    @pytest.mark.asyncio
    async def test_valid_period(self, api_handler):
        """Test valid period value."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma',
            period='100'
        )

        assert result['success'] is True

    @pytest.mark.asyncio
    async def test_period_too_small(self, api_handler):
        """Test period less than minimum."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma',
            period='3'
        )

        assert result['success'] is False
        assert result['code'] == 'INVALID_PERIOD'

    @pytest.mark.asyncio
    async def test_period_too_large(self, api_handler):
        """Test period exceeding maximum."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma',
            period='1000'
        )

        assert result['success'] is False
        assert result['code'] == 'INVALID_PERIOD'

    @pytest.mark.asyncio
    async def test_period_not_integer(self, api_handler):
        """Test non-integer period."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma',
            period='abc'
        )

        assert result['success'] is False
        assert result['code'] == 'INVALID_PERIOD'


class TestIndicatorAPIResponseFormat:
    """Test API response format."""

    @pytest.fixture
    def api_handler(self):
        return IndicatorAPIHandler()

    @pytest.mark.asyncio
    async def test_success_response_structure(self, api_handler):
        """Test successful response structure."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma,macd'
        )

        assert 'success' in result
        assert 'data' in result
        assert result['success'] is True
        assert 'symbol' in result['data']
        assert 'timestamp' in result['data']
        assert 'indicators' in result['data']

    @pytest.mark.asyncio
    async def test_error_response_structure(self, api_handler):
        """Test error response structure."""
        result = await api_handler.handle_get_indicators(
            symbol='',
            indicators='ma'
        )

        assert 'success' in result
        assert 'error' in result
        assert 'code' in result
        assert result['success'] is False

    @pytest.mark.asyncio
    async def test_ma_response_format(self, api_handler):
        """Test MA indicator response format."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma'
        )

        indicators = result['data']['indicators']
        assert 'ma5' in indicators
        assert 'ma10' in indicators
        assert 'ma20' in indicators
        assert 'ma60' in indicators

    @pytest.mark.asyncio
    async def test_macd_response_format(self, api_handler):
        """Test MACD indicator response format."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='macd'
        )

        indicators = result['data']['indicators']
        assert 'macd' in indicators
        assert 'macd_signal' in indicators
        assert 'macd_hist' in indicators

    @pytest.mark.asyncio
    async def test_rsi_response_format(self, api_handler):
        """Test RSI indicator response format."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='rsi'
        )

        indicators = result['data']['indicators']
        assert 'rsi' in indicators
        assert isinstance(indicators['rsi'], float)

    @pytest.mark.asyncio
    async def test_bollinger_response_format(self, api_handler):
        """Test Bollinger Bands response format."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='bollinger'
        )

        indicators = result['data']['indicators']
        assert 'bb_middle' in indicators
        assert 'bb_upper' in indicators
        assert 'bb_lower' in indicators
        assert 'bb_width' in indicators
        assert 'bb_percent' in indicators


class TestIndicatorAPISupportedIndicators:
    """Test supported indicators endpoint."""

    @pytest.fixture
    def api_handler(self):
        return IndicatorAPIHandler()

    @pytest.mark.asyncio
    async def test_supported_indicators_list(self, api_handler):
        """Test getting list of supported indicators."""
        result = await api_handler.handle_get_supported_indicators()

        assert result['success'] is True
        assert 'indicators' in result
        assert len(result['indicators']) == 4

    @pytest.mark.asyncio
    async def test_supported_indicator_fields(self, api_handler):
        """Test each indicator has required fields."""
        result = await api_handler.handle_get_supported_indicators()

        for indicator in result['indicators']:
            assert 'name' in indicator
            assert 'full_name' in indicator
            assert 'description' in indicator
            assert 'params' in indicator


class TestIndicatorAPIInsufficientData:
    """Test handling of insufficient data."""

    @pytest.mark.asyncio
    async def test_insufficient_klines(self):
        """Test API with insufficient K-line data."""
        # Create mock repository that returns few klines
        mock_repo = MockKlineRepository()
        mock_repo.get_klines = AsyncMock(return_value=[])

        handler = IndicatorAPIHandler(kline_repository=mock_repo)

        result = await handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma'
        )

        assert result['success'] is False
        assert result['code'] == 'INSUFFICIENT_DATA'


class TestIndicatorAPIPerformance:
    """Test API performance requirements."""

    @pytest.fixture
    def api_handler(self):
        return IndicatorAPIHandler()

    @pytest.mark.asyncio
    async def test_api_response_time(self, api_handler):
        """Test API response time < 100ms."""
        import time

        start = time.time()
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma,macd,rsi,bollinger'
        )
        elapsed_ms = (time.time() - start) * 1000

        assert result['success'] is True
        assert elapsed_ms < 100, f"API took {elapsed_ms:.2f}ms, expected < 100ms"

    @pytest.mark.asyncio
    async def test_concurrent_requests(self, api_handler):
        """Test handling concurrent requests."""
        symbols = ['000001.SZ', '600519.SH', '000858.SZ', '600036.SH', '002415.SZ']

        async def request(symbol):
            return await api_handler.handle_get_indicators(
                symbol=symbol,
                indicators='ma,rsi'
            )

        tasks = [request(s) for s in symbols]
        results = await asyncio.gather(*tasks)

        assert all(r['success'] for r in results)
        assert len(results) == 5


class TestIndicatorAPIStats:
    """Test API statistics tracking."""

    @pytest.fixture
    def api_handler(self):
        return IndicatorAPIHandler()

    @pytest.mark.asyncio
    async def test_request_count(self, api_handler):
        """Test request count tracking."""
        for _ in range(5):
            await api_handler.handle_get_indicators(
                symbol='000001.SZ',
                indicators='ma'
            )

        stats = api_handler.get_stats()
        assert stats['request_count'] == 5

    @pytest.mark.asyncio
    async def test_error_count(self, api_handler):
        """Test error count tracking."""
        # 3 valid requests
        for _ in range(3):
            await api_handler.handle_get_indicators(
                symbol='000001.SZ',
                indicators='ma'
            )

        # 2 invalid requests
        for _ in range(2):
            await api_handler.handle_get_indicators(
                symbol='',
                indicators='ma'
            )

        stats = api_handler.get_stats()
        assert stats['request_count'] == 5
        assert stats['error_count'] == 2
        assert stats['success_rate'] == 0.6


class TestIndicatorAPIEdgeCases:
    """Test API edge cases."""

    @pytest.fixture
    def api_handler(self):
        return IndicatorAPIHandler()

    @pytest.mark.asyncio
    async def test_whitespace_in_indicators(self, api_handler):
        """Test indicators with whitespace."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='  ma  ,  macd  , rsi  '
        )

        assert result['success'] is True

    @pytest.mark.asyncio
    async def test_duplicate_indicators(self, api_handler):
        """Test duplicate indicators in request."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma,ma,MA'
        )

        # Should still work (may de-duplicate or calculate multiple times)
        assert result['success'] is True

    @pytest.mark.asyncio
    async def test_all_indicators(self, api_handler):
        """Test requesting all available indicators."""
        result = await api_handler.handle_get_indicators(
            symbol='000001.SZ',
            indicators='ma,macd,rsi,bollinger'
        )

        assert result['success'] is True
        indicators = result['data']['indicators']

        # Should have all indicators
        assert 'ma5' in indicators
        assert 'macd' in indicators
        assert 'rsi' in indicators
        assert 'bb_middle' in indicators

    @pytest.mark.asyncio
    async def test_special_characters_in_symbol(self, api_handler):
        """Test symbol with special characters."""
        result = await api_handler.handle_get_indicators(
            symbol='000001@#$',
            indicators='ma'
        )

        assert result['success'] is False
        assert result['code'] == 'INVALID_SYMBOL'
