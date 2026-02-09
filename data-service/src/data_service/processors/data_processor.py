"""
Data processing and cleaning module.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
import logging

from ..models.stock import StockData, StockQuote, TechnicalIndicator
from ..core.config import settings

logger = logging.getLogger(__name__)


class DataProcessor:
    """Data processing and cleaning class."""

    def __init__(self):
        self.validation_rules = {
            "price_range": (0.01, 10000),  # Reasonable price range
            "volume_min": 0,  # Minimum volume
            "change_percent_max": 1000,  # Maximum change percentage
            "timestamp_max_diff": 3600,  # Maximum timestamp difference (1 hour)
        }

    def clean_stock_quote(self, raw_quote: Dict[str, Any]) -> StockQuote:
        """
        Clean and validate stock quote data.

        Args:
            raw_quote: Raw quote data from data source

        Returns:
            Cleaned StockQuote object
        """
        try:
            # Basic validation
            if not raw_quote.get("symbol"):
                raise ValueError("Missing symbol")

            # Convert timestamp if needed
            timestamp = raw_quote.get("timestamp")
            if isinstance(timestamp, str):
                try:
                    timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                except ValueError:
                    timestamp = datetime.now()
            elif not isinstance(timestamp, datetime):
                timestamp = datetime.now()

            # Validate price data
            price = float(raw_quote.get("price", 0))
            prev_close = float(raw_quote.get("prev_close", 0))
            open_price = float(raw_quote.get("open", 0))
            high = float(raw_quote.get("high", 0))
            low = float(raw_quote.get("low", 0))

            # Handle missing or invalid values
            if price <= 0:
                price = prev_close if prev_close > 0 else open_price

            if prev_close <= 0:
                prev_close = price

            if open_price <= 0:
                open_price = price

            if high <= 0:
                high = max(price, open_price, prev_close)

            if low <= 0:
                low = min(price, open_price, prev_close)

            # Ensure high >= low
            if high < low:
                high, low = low, high

            # Ensure price within high-low range
            if price > high:
                high = price
            if price < low:
                low = price

            # Calculate change if not provided
            change = raw_quote.get("change")
            change_percent = raw_quote.get("change_percent")

            if change is None or change_percent is None:
                if prev_close > 0:
                    change = price - prev_close
                    change_percent = (change / prev_close) * 100
                else:
                    change = 0.0
                    change_percent = 0.0

            # Validate volume and amount
            volume = int(raw_quote.get("volume", 0))
            amount = float(raw_quote.get("amount", 0))

            # Calculate amount from volume and price if missing
            if amount <= 0 and volume > 0 and price > 0:
                amount = volume * price

            # Validate bid/ask data
            bid_price = float(raw_quote.get("bid_price", 0))
            ask_price = float(raw_quote.get("ask_price", 0))
            bid_volume = int(raw_quote.get("bid_volume", 0))
            ask_volume = int(raw_quote.get("ask_volume", 0))

            # Ensure bid_price <= ask_price
            if bid_price > 0 and ask_price > 0 and bid_price > ask_price:
                bid_price, ask_price = ask_price, bid_price

            # Create cleaned quote
            cleaned_quote = StockQuote(
                symbol=raw_quote["symbol"],
                price=price,
                open=open_price,
                high=high,
                low=low,
                prev_close=prev_close,
                change=change,
                change_percent=change_percent,
                volume=volume,
                amount=amount,
                bid_price=bid_price if bid_price > 0 else None,
                ask_price=ask_price if ask_price > 0 else None,
                bid_volume=bid_volume if bid_volume > 0 else None,
                ask_volume=ask_volume if ask_volume > 0 else None,
                timestamp=timestamp
            )

            # Additional validation
            self._validate_quote(cleaned_quote)

            return cleaned_quote

        except Exception as e:
            logger.error(f"Failed to clean quote for {raw_quote.get('symbol')}: {str(e)}")
            raise

    def clean_stock_data(self, raw_data: List[Dict[str, Any]]) -> List[StockData]:
        """
        Clean and validate historical stock data.

        Args:
            raw_data: List of raw historical data points

        Returns:
            List of cleaned StockData objects
        """
        cleaned_data = []

        for raw_point in raw_data:
            try:
                if not raw_point.get("symbol"):
                    continue

                # Convert timestamp if needed
                timestamp = raw_point.get("timestamp")
                if isinstance(timestamp, str):
                    try:
                        timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    except ValueError:
                        continue  # Skip invalid timestamp
                elif not isinstance(timestamp, datetime):
                    continue

                # Extract price data
                open_price = float(raw_point.get("open", 0))
                high = float(raw_point.get("high", 0))
                low = float(raw_point.get("low", 0))
                close = float(raw_point.get("close", 0))

                # Skip invalid data points
                if open_price <= 0 or high <= 0 or low <= 0 or close <= 0:
                    continue

                # Ensure high >= low
                if high < low:
                    high, low = low, high

                # Ensure prices are within reasonable range
                min_price, max_price = self.validation_rules["price_range"]
                if not (min_price <= open_price <= max_price and
                        min_price <= high <= max_price and
                        min_price <= low <= max_price and
                        min_price <= close <= max_price):
                    continue

                # Validate volume
                volume = int(raw_point.get("volume", 0))
                if volume < self.validation_rules["volume_min"]:
                    continue

                # Calculate amount if missing
                amount = float(raw_point.get("amount", 0))
                if amount <= 0 and volume > 0 and close > 0:
                    amount = volume * close

                # Create cleaned data point
                cleaned_point = StockData(
                    symbol=raw_point["symbol"],
                    timestamp=timestamp,
                    open=open_price,
                    high=high,
                    low=low,
                    close=close,
                    volume=volume,
                    amount=amount if amount > 0 else None,
                    adj_close=float(raw_point.get("adj_close", 0)) or None,
                    vwap=float(raw_point.get("vwap", 0)) or None
                )

                cleaned_data.append(cleaned_point)

            except (ValueError, KeyError) as e:
                logger.debug(f"Skipping invalid data point: {str(e)}")
                continue

        # Sort by timestamp
        cleaned_data.sort(key=lambda x: x.timestamp)

        return cleaned_data

    def merge_quotes_from_sources(
        self,
        quotes_by_source: Dict[str, Dict[str, Any]]
    ) -> StockQuote:
        """
        Merge quotes from multiple data sources.

        Args:
            quotes_by_source: Dictionary mapping source name to quote data

        Returns:
            Merged StockQuote object
        """
        if not quotes_by_source:
            raise ValueError("No quotes to merge")

        # Get the highest priority source with valid data
        sources = list(quotes_by_source.keys())
        if "sina" in sources:
            primary_source = "sina"
        elif "tencent" in sources:
            primary_source = "tencent"
        elif "eastmoney" in sources:
            primary_source = "eastmoney"
        else:
            primary_source = sources[0]

        # Use primary source as base
        base_quote = quotes_by_source[primary_source]
        symbol = base_quote.get("symbol")

        if not symbol:
            raise ValueError("Missing symbol in quote data")

        # Collect data from all sources
        all_prices = []
        all_volumes = []
        all_timestamps = []

        for source_name, quote in quotes_by_source.items():
            try:
                price = float(quote.get("price", 0))
                volume = int(quote.get("volume", 0))
                timestamp = quote.get("timestamp")

                if price > 0:
                    all_prices.append(price)
                if volume > 0:
                    all_volumes.append(volume)
                if timestamp:
                    all_timestamps.append(timestamp)

            except (ValueError, TypeError):
                continue

        # Calculate consensus values
        consensus_price = np.median(all_prices) if all_prices else 0
        consensus_volume = np.median(all_volumes) if all_volumes else 0

        # Use the most recent timestamp
        if all_timestamps:
            latest_timestamp = max(all_timestamps)
        else:
            latest_timestamp = datetime.now()

        # Create merged quote
        merged_data = {
            "symbol": symbol,
            "price": consensus_price,
            "timestamp": latest_timestamp
        }

        # Copy other fields from primary source
        for field in ["name", "open", "high", "low", "prev_close", "bid_price",
                     "ask_price", "bid_volume", "ask_volume"]:
            if field in base_quote:
                merged_data[field] = base_quote[field]

        # Calculate change if not provided
        if "change" not in merged_data or "change_percent" not in merged_data:
            prev_close = merged_data.get("prev_close", 0)
            if prev_close > 0:
                merged_data["change"] = consensus_price - prev_close
                merged_data["change_percent"] = (merged_data["change"] / prev_close) * 100
            else:
                merged_data["change"] = 0.0
                merged_data["change_percent"] = 0.0

        # Use consensus volume if available
        if consensus_volume > 0:
            merged_data["volume"] = int(consensus_volume)

        # Calculate amount
        if "amount" not in merged_data and consensus_volume > 0 and consensus_price > 0:
            merged_data["amount"] = consensus_volume * consensus_price

        return self.clean_stock_quote(merged_data)

    def calculate_technical_indicators(
        self,
        historical_data: List[StockData],
        indicators: List[str] = None
    ) -> Dict[str, TechnicalIndicator]:
        """
        Calculate technical indicators from historical data.

        Args:
            historical_data: List of historical stock data
            indicators: List of indicator names to calculate

        Returns:
            Dictionary mapping indicator name to TechnicalIndicator object
        """
        if not historical_data:
            return {}

        if indicators is None:
            indicators = ["ma", "ema", "macd", "rsi", "bollinger"]

        # Convert to pandas DataFrame
        df = pd.DataFrame([{
            "timestamp": d.timestamp,
            "close": d.close,
            "high": d.high,
            "low": d.low,
            "volume": d.volume
        } for d in historical_data])

        if df.empty:
            return {}

        df.set_index("timestamp", inplace=True)
        df.sort_index(inplace=True)

        results = {}

        # Moving Averages
        if "ma" in indicators:
            ma_periods = [5, 10, 20, 60]
            for period in ma_periods:
                if len(df) >= period:
                    ma_values = df["close"].rolling(window=period).mean().values
                    results[f"ma{period}"] = TechnicalIndicator(
                        name=f"MA{period}",
                        values=ma_values.tolist(),
                        timestamps=df.index.tolist(),
                        parameters={"period": period}
                    )

        # Exponential Moving Averages
        if "ema" in indicators:
            ema_periods = [12, 26]
            for period in ema_periods:
                if len(df) >= period:
                    ema_values = df["close"].ewm(span=period, adjust=False).mean().values
                    results[f"ema{period}"] = TechnicalIndicator(
                        name=f"EMA{period}",
                        values=ema_values.tolist(),
                        timestamps=df.index.tolist(),
                        parameters={"period": period}
                    )

        # MACD
        if "macd" in indicators and len(df) >= 26:
            ema12 = df["close"].ewm(span=12, adjust=False).mean()
            ema26 = df["close"].ewm(span=26, adjust=False).mean()
            macd_line = ema12 - ema26
            signal_line = macd_line.ewm(span=9, adjust=False).mean()
            macd_histogram = macd_line - signal_line

            results["macd_line"] = TechnicalIndicator(
                name="MACD Line",
                values=macd_line.values.tolist(),
                timestamps=df.index.tolist(),
                parameters={"fast": 12, "slow": 26, "signal": 9}
            )

            results["macd_signal"] = TechnicalIndicator(
                name="MACD Signal",
                values=signal_line.values.tolist(),
                timestamps=df.index.tolist(),
                parameters={"fast": 12, "slow": 26, "signal": 9}
            )

            results["macd_histogram"] = TechnicalIndicator(
                name="MACD Histogram",
                values=macd_histogram.values.tolist(),
                timestamps=df.index.tolist(),
                parameters={"fast": 12, "slow": 26, "signal": 9}
            )

        # RSI
        if "rsi" in indicators and len(df) >= 14:
            delta = df["close"].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
            rs = gain / loss
            rsi = 100 - (100 / (1 + rs))

            results["rsi"] = TechnicalIndicator(
                name="RSI",
                values=rsi.values.tolist(),
                timestamps=df.index.tolist(),
                parameters={"period": 14}
            )

        # Bollinger Bands
        if "bollinger" in indicators and len(df) >= 20:
            sma = df["close"].rolling(window=20).mean()
            std = df["close"].rolling(window=20).std()
            upper_band = sma + (std * 2)
            lower_band = sma - (std * 2)

            results["bollinger_upper"] = TechnicalIndicator(
                name="Bollinger Upper",
                values=upper_band.values.tolist(),
                timestamps=df.index.tolist(),
                parameters={"period": 20, "std": 2}
            )

            results["bollinger_middle"] = TechnicalIndicator(
                name="Bollinger Middle",
                values=sma.values.tolist(),
                timestamps=df.index.tolist(),
                parameters={"period": 20, "std": 2}
            )

            results["bollinger_lower"] = TechnicalIndicator(
                name="Bollinger Lower",
                values=lower_band.values.tolist(),
                timestamps=df.index.tolist(),
                parameters={"period": 20, "std": 2}
            )

        # Volume indicators
        if "volume" in indicators and len(df) >= 20:
            volume_sma = df["volume"].rolling(window=20).mean()
            results["volume_sma"] = TechnicalIndicator(
                name="Volume SMA",
                values=volume_sma.values.tolist(),
                timestamps=df.index.tolist(),
                parameters={"period": 20}
            )

        return results

    def detect_anomalies(self, quote: StockQuote, historical_data: List[StockData]) -> List[str]:
        """
        Detect anomalies in stock quote data.

        Args:
            quote: Current stock quote
            historical_data: Recent historical data

        Returns:
            List of anomaly descriptions
        """
        anomalies = []

        # Check price range
        min_price, max_price = self.validation_rules["price_range"]
        if not (min_price <= quote.price <= max_price):
            anomalies.append(f"Price {quote.price} outside valid range [{min_price}, {max_price}]")

        # Check change percentage
        if abs(quote.change_percent) > self.validation_rules["change_percent_max"]:
            anomalies.append(f"Change percentage {quote.change_percent}% exceeds maximum")

        # Check volume
        if quote.volume < self.validation_rules["volume_min"]:
            anomalies.append(f"Volume {quote.volume} below minimum")

        # Check timestamp freshness
        time_diff = (datetime.now() - quote.timestamp).total_seconds()
        if time_diff > self.validation_rules["timestamp_max_diff"]:
            anomalies.append(f"Data is {time_diff:.0f} seconds old")

        # Check against historical data
        if historical_data:
            recent_prices = [d.close for d in historical_data[-10:]]  # Last 10 data points
            if recent_prices:
                avg_price = np.mean(recent_prices)
                std_price = np.std(recent_prices)

                if std_price > 0:
                    z_score = abs(quote.price - avg_price) / std_price
                    if z_score > 3:  # More than 3 standard deviations
                        anomalies.append(f"Price {quote.price} is {z_score:.1f}σ from recent average")

        return anomalies

    def _validate_quote(self, quote: StockQuote):
        """
        Validate cleaned quote data.

        Args:
            quote: StockQuote object to validate

        Raises:
            ValueError: If validation fails
        """
        # Check price range
        min_price, max_price = self.validation_rules["price_range"]
        if not (min_price <= quote.price <= max_price):
            raise ValueError(f"Price {quote.price} outside valid range")

        # Check high >= low
        if quote.high < quote.low:
            raise ValueError(f"High {quote.high} is less than low {quote.low}")

        # Check price within high-low range
        if not (quote.low <= quote.price <= quote.high):
            raise ValueError(f"Price {quote.price} not within high-low range")

        # Check change percentage
        if abs(quote.change_percent) > self.validation_rules["change_percent_max"]:
            raise ValueError(f"Change percentage {quote.change_percent}% exceeds maximum")

        # Check volume
        if quote.volume < self.validation_rules["volume_min"]:
            raise ValueError(f"Volume {quote.volume} below minimum")

        # Check timestamp
        time_diff = (datetime.now() - quote.timestamp).total_seconds()
        if time_diff > self.validation_rules["timestamp_max_diff"]:
            raise ValueError(f"Data timestamp is {time_diff:.0f} seconds old")

    async def close(self):
        """Close the data processor and cleanup resources."""
        # No resources to cleanup currently
        pass