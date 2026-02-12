"""
Event Publisher Service for Market Data Service.

Integrates with the unified event bus (Redis Streams) to publish:
- Real-time market quotes (C3-001)
- Price movement alerts (C3-001B)
- Technical indicator updates (C3-001C)
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from pathlib import Path
import sys

# Add event-bus SDK to path
project_root = Path(__file__).parent.parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))

from event_bus import EventBusClient, EventProducer, EventType
from event_bus.exceptions import PublishError, ConnectionError

from ..models.stock import StockQuote
from ..core.config import settings

logger = logging.getLogger(__name__)


class MarketDataEventPublisher:
    """
    Market Data Event Publisher Service.

    Responsible for publishing market data events to the unified event bus.
    """

    # Price movement threshold for alerts (C3-001B)
    PRICE_ALERT_THRESHOLD = 7.0  # 7% change

    def __init__(
        self,
        redis_host: Optional[str] = None,
        redis_port: Optional[int] = None,
        redis_url: Optional[str] = None
    ):
        """
        Initialize the event publisher.

        Args:
            redis_host: Redis host address
            redis_port: Redis port
            redis_url: Redis connection URL (overrides host/port)
        """
        self.redis_host = redis_host or getattr(settings, 'REDIS_HOST', 'redis')
        self.redis_port = redis_port or getattr(settings, 'REDIS_PORT', 6379)
        self.redis_url = redis_url

        self._client: Optional[EventBusClient] = None
        self._producer: Optional[EventProducer] = None
        self._is_initialized = False

        # Track last prices for alert detection
        self._last_prices: Dict[str, float] = {}
        self._last_alert_time: Dict[str, datetime] = {}

    async def initialize(self):
        """
        Initialize the event publisher (C2-MD-001).

        Connects to Redis and creates the event producer.
        """
        if self._is_initialized:
            return

        try:
            # Create event bus client
            if self.redis_url:
                self._client = EventBusClient(redis_url=self.redis_url)
            else:
                self._client = EventBusClient(
                    host=self.redis_host,
                    port=self.redis_port
                )

            # Connect to Redis
            self._client.connect()

            # Create event producer
            self._producer = EventProducer(
                client=self._client,
                service_name="market-data",
                max_stream_length=10000
            )

            self._is_initialized = True
            logger.info("MarketDataEventPublisher initialized successfully")

        except ConnectionError as e:
            logger.error(f"Failed to connect to event bus: {e}")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize event publisher: {e}")
            raise

    async def close(self):
        """Close the event publisher connection."""
        if self._client:
            self._client.disconnect()
            self._is_initialized = False
            logger.info("MarketDataEventPublisher closed")

    async def publish_quote(
        self,
        symbol: str,
        price: float,
        change: float,
        change_percent: float,
        volume: int,
        **kwargs
    ) -> Optional[str]:
        """
        Publish real-time quote event (C3-001).

        Args:
            symbol: Stock symbol
            price: Current price
            change: Price change
            change_percent: Price change percentage
            volume: Trading volume
            **kwargs: Additional quote data

        Returns:
            Event message ID if published successfully
        """
        if not self._is_initialized:
            logger.warning("Event publisher not initialized")
            return None

        try:
            payload = {
                "symbol": symbol,
                "price": price,
                "change": change,
                "change_percent": change_percent,
                "volume": volume,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **kwargs
            }

            message_id = self._producer.publish_event(
                EventType.MARKET_QUOTE_REALTIME,
                payload
            )

            logger.debug(f"Published quote event for {symbol}: {message_id}")
            return message_id

        except PublishError as e:
            logger.error(f"Failed to publish quote event for {symbol}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error publishing quote event: {e}")
            return None

    async def publish_quote_from_model(self, quote: StockQuote) -> Optional[str]:
        """
        Publish quote event from StockQuote model.

        Args:
            quote: StockQuote model instance

        Returns:
            Event message ID if published successfully
        """
        return await self.publish_quote(
            symbol=quote.symbol,
            price=quote.price,
            change=quote.change,
            change_percent=quote.change_percent,
            volume=quote.volume,
            open=quote.open,
            high=quote.high,
            low=quote.low,
            prev_close=quote.prev_close,
            amount=quote.amount,
            bid_price=quote.bid_price,
            ask_price=quote.ask_price
        )

    async def check_and_publish_price_alert(
        self,
        symbol: str,
        current_price: float,
        prev_close: float
    ) -> Optional[str]:
        """
        Check for price movement and publish alert if threshold exceeded (C3-001B).

        Args:
            symbol: Stock symbol
            current_price: Current price
            prev_close: Previous close price

        Returns:
            Event message ID if alert published
        """
        if not self._is_initialized:
            return None

        try:
            change_percent = (current_price - prev_close) / prev_close * 100

            # Check if threshold exceeded
            if abs(change_percent) >= self.PRICE_ALERT_THRESHOLD:
                # Rate limit alerts (max 1 per minute per symbol)
                now = datetime.now(timezone.utc)
                last_alert = self._last_alert_time.get(symbol)

                if last_alert and (now - last_alert).seconds < 60:
                    return None

                # Determine alert type and severity
                if change_percent > 0:
                    alert_type = "price_surge"
                    severity = "high" if change_percent > 10 else "medium"
                else:
                    alert_type = "price_drop"
                    severity = "high" if change_percent < -10 else "medium"

                payload = {
                    "symbol": symbol,
                    "alert_type": alert_type,
                    "severity": severity,
                    "message": f"{'涨幅' if change_percent > 0 else '跌幅'}超过{abs(change_percent):.1f}%",
                    "prev_close": prev_close,
                    "current_price": current_price,
                    "change_percent": change_percent,
                    "timestamp": now.isoformat(),
                }

                message_id = self._producer.publish_event(
                    EventType.MARKET_ALERT_PRICE_MOVE,
                    payload
                )

                # Update last alert time
                self._last_alert_time[symbol] = now

                logger.info(f"Published price alert for {symbol}: {alert_type}")
                return message_id

            return None

        except PublishError as e:
            logger.error(f"Failed to publish price alert for {symbol}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error publishing price alert: {e}")
            return None

    async def publish_indicator_update(
        self,
        symbol: str,
        indicator: str,
        value: float,
        signal: str,
        **kwargs
    ) -> Optional[str]:
        """
        Publish technical indicator update event (C3-001C).

        Args:
            symbol: Stock symbol
            indicator: Indicator name (e.g., RSI, MACD, MA)
            value: Indicator value
            signal: Signal type (e.g., buy, sell, neutral)
            **kwargs: Additional indicator data

        Returns:
            Event message ID if published successfully
        """
        if not self._is_initialized:
            return None

        try:
            payload = {
                "symbol": symbol,
                "indicator": indicator,
                "value": value,
                "signal": signal,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **kwargs
            }

            message_id = self._producer.publish_event(
                EventType.MARKET_INDICATOR_UPDATED,
                payload
            )

            logger.debug(f"Published indicator update for {symbol}: {indicator}")
            return message_id

        except PublishError as e:
            logger.error(f"Failed to publish indicator update for {symbol}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error publishing indicator update: {e}")
            return None

    def get_stream_info(self, event_type: EventType) -> Optional[Dict[str, Any]]:
        """
        Get stream information for monitoring (C2-MD-002).

        Args:
            event_type: Event type

        Returns:
            Stream information dictionary
        """
        if not self._is_initialized or not self._producer:
            return None

        try:
            return self._producer.get_stream_info(event_type)
        except Exception as e:
            logger.error(f"Failed to get stream info: {e}")
            return None

    def is_healthy(self) -> bool:
        """Check if the event publisher is healthy."""
        if not self._client:
            return False
        return self._client.health_check()

    async def publish_indicator_update_with_calculation(
        self,
        symbol: str,
        historical_prices: list,
        highs: list,
        lows: list,
        **kwargs
    ) -> Optional[str]:
        """
        Publish technical indicator update event with RSI/MACD/KDJ calculation (C3-001C).

        Args:
            symbol: Stock symbol
            historical_prices: List of historical closing prices
            highs: List of historical high prices
            lows: List of historical low prices
            **kwargs: Additional data

        Returns:
            Event message ID if published successfully
        """
        if not self._is_initialized:
            logger.warning("Event publisher not initialized")
            return None

        try:
            # Calculate indicators
            rsi = calculate_rsi(historical_prices)
            macd_line, signal_line, histogram = calculate_macd(historical_prices)
            k, d, j = calculate_kdj(highs, lows, historical_prices)

            # Build payload according to TODO.md specification
            payload = {
                "symbol": symbol,
                "indicators": {
                    "rsi": rsi,
                    "macd": {
                        "macd_line": macd_line,
                        "signal_line": signal_line,
                        "histogram": histogram
                    },
                    "kdj": {
                        "k": k,
                        "d": d,
                        "j": j
                    }
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **kwargs
            }

            message_id = self._producer.publish_event(
                EventType.MARKET_INDICATOR_UPDATED,
                payload
            )

            logger.debug(f"Published indicator update for {symbol}: RSI={rsi}, MACD={macd_line}, KDJ_K={k}")
            return message_id

        except PublishError as e:
            logger.error(f"Failed to publish indicator update for {symbol}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error publishing indicator update: {e}")
            return None


def calculate_rsi(prices: list, period: int = 14) -> Optional[float]:
    """
    Calculate RSI (Relative Strength Index).

    Args:
        prices: List of closing prices
        period: RSI period (default 14)

    Returns:
        RSI value (0-100) or None if insufficient data
    """
    if len(prices) < period + 1:
        return None

    # Calculate price changes
    deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]

    # Get gains and losses
    gains = [d if d > 0 else 0 for d in deltas[-period:]]
    losses = [-d if d < 0 else 0 for d in deltas[-period:]]

    # Calculate average gain and loss
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))

    return round(rsi, 2)


def calculate_macd(prices: list, fast: int = 12, slow: int = 26, signal: int = 9) -> tuple:
    """
    Calculate MACD (Moving Average Convergence Divergence).

    Args:
        prices: List of closing prices
        fast: Fast EMA period (default 12)
        slow: Slow EMA period (default 26)
        signal: Signal line period (default 9)

    Returns:
        Tuple of (macd_line, signal_line, histogram) or (None, None, None) if insufficient data
    """
    # Minimum data required: at least slow period for basic calculation
    if len(prices) < slow:
        return None, None, None

    def ema(data: list, period: int) -> float:
        """Calculate Exponential Moving Average."""
        multiplier = 2 / (period + 1)
        ema_value = sum(data[:period]) / period
        for price in data[period:]:
            ema_value = (price - ema_value) * multiplier + ema_value
        return ema_value

    # Calculate EMAs
    ema_fast = ema(prices, fast)
    ema_slow = ema(prices, slow)

    # Calculate MACD line
    macd_line = ema_fast - ema_slow

    # Calculate signal line (EMA of MACD)
    # We need historical MACD values, approximate using recent prices
    macd_values = []
    for i in range(slow, len(prices)):
        slice_fast = prices[i-fast:i] if i >= fast else prices[:i]
        slice_slow = prices[i-slow:i] if i >= slow else prices[:i]
        if len(slice_fast) >= fast and len(slice_slow) >= slow:
            ema_f = ema(prices[i-fast+1:i+1], fast)
            ema_s = ema(prices[i-slow+1:i+1], slow)
            macd_values.append(ema_f - ema_s)

    # Calculate signal line if we have enough MACD values
    if len(macd_values) >= signal:
        signal_line = ema(macd_values, signal)
    elif len(macd_values) > 0:
        # Use simple average as approximation if not enough data
        signal_line = sum(macd_values) / len(macd_values)
    else:
        signal_line = macd_line  # Use MACD line as approximation

    # Calculate histogram
    histogram = macd_line - signal_line

    return round(macd_line, 4), round(signal_line, 4), round(histogram, 4)


def calculate_kdj(highs: list, lows: list, closes: list, n: int = 9, m1: int = 3, m2: int = 3) -> tuple:
    """
    Calculate KDJ (Stochastic Oscillator).

    Args:
        highs: List of high prices
        lows: List of low prices
        closes: List of closing prices
        n: RSV period (default 9)
        m1: K smoothing factor (default 3)
        m2: D smoothing factor (default 3)

    Returns:
        Tuple of (k, d, j) values or (None, None, None) if insufficient data
    """
    if len(highs) < n or len(lows) < n or len(closes) < n:
        return None, None, None

    # Get last n periods
    recent_highs = highs[-n:]
    recent_lows = lows[-n:]
    recent_closes = closes[-n:]

    # Calculate RSV (Raw Stochastic Value)
    highest_high = max(recent_highs)
    lowest_low = min(recent_lows)
    current_close = recent_closes[-1]

    if highest_high == lowest_low:
        rsv = 50.0
    else:
        rsv = 100 * (current_close - lowest_low) / (highest_high - lowest_low)

    # Calculate K and D (using simple smoothing)
    # For first calculation, use RSV as initial K and D
    k = rsv
    d = rsv

    # Apply smoothing
    for i in range(1, min(m1, len(recent_closes))):
        k = (2 * k + rsv) / 3

    for i in range(1, min(m2, len(recent_closes))):
        d = (2 * d + k) / 3

    # Calculate J
    j = 3 * k - 2 * d

    return round(k, 2), round(d, 2), round(j, 2)


# Global event publisher instance
event_publisher = MarketDataEventPublisher()


async def start_periodic_quote_publishing(
    data_service,
    symbols: list,
    interval: int = 10
):
    """
    Start periodic quote publishing (C3-001).

    Args:
        data_service: DataService instance
        symbols: List of symbols to publish
        interval: Publishing interval in seconds
    """
    await event_publisher.initialize()

    while True:
        try:
            for symbol in symbols:
                try:
                    quote = await data_service.get_stock_quote(symbol)
                    if quote:
                        # Publish quote
                        await event_publisher.publish_quote_from_model(quote)

                        # Check for price alerts
                        await event_publisher.check_and_publish_price_alert(
                            symbol=quote.symbol,
                            current_price=quote.price,
                            prev_close=quote.prev_close
                        )
                except Exception as e:
                    logger.warning(f"Failed to publish quote for {symbol}: {e}")

            await asyncio.sleep(interval)

        except asyncio.CancelledError:
            logger.info("Periodic quote publishing cancelled")
            break
        except Exception as e:
            logger.error(f"Error in periodic publishing: {e}")
            await asyncio.sleep(interval)
