"""
K-line feature extraction service.
将原始K线数据转换为自然语言描述，供AI模型理解。
"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from loguru import logger


class KlinePattern(str, Enum):
    """K-line patterns."""
    NONE = "none"
    HAMMER = "hammer"  # 锤子线
    HANGING_MAN = "hanging_man"  # 吊颈线
    DOJI = "doji"  # 十字星
    SHOOTING_STAR = "shooting_star"  # 射击之星
    ENGULFING_BULLISH = "engulfing_bullish"  # 看涨吞没
    ENGULFING_BEARISH = "engulfing_bearish"  # 看跌吞没
    MORNING_STAR = "morning_star"  # 晨星
    EVENING_STAR = "evening_star"  # 暮星
    THREE_WHITE_SOLDIERS = "three_white_soldiers"  # 三白兵
    THREE_BLACK_CROWS = "three_black_crows"  # 三黑鸦


class TrendDirection(str, Enum):
    """Trend directions."""
    UP = "up"
    DOWN = "down"
    SIDEWAYS = "sideways"


@dataclass
class KlineData:
    """K-line data point."""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class TrendAnalysis:
    """Trend analysis result."""
    direction: TrendDirection
    strength: float  # 0-1
    duration: int  # Number of periods
    slope: float  # Price change rate


@dataclass
class SupportResistanceLevel:
    """Support or resistance level."""
    price: float
    type: str  # "support" or "resistance"
    strength: int  # Number of touches
    timestamp: datetime


class KlineFeatureService:
    """Service for extracting features from K-line data."""

    def __init__(self):
        self.min_data_points = 5

    def extract_features(self, klines: List[KlineData]) -> Dict[str, Any]:
        """
        Extract comprehensive features from K-line data.

        Args:
            klines: List of K-line data points

        Returns:
            Dictionary containing all extracted features
        """
        if not klines:
            raise ValueError("K-line data cannot be empty")

        if len(klines) < self.min_data_points:
            logger.warning(f"Insufficient data points: {len(klines)}, minimum recommended: {self.min_data_points}")

        features = {
            "patterns": self.detect_patterns(klines),
            "trend": self.analyze_trend(klines),
            "support_resistance": self.find_support_resistance(klines),
            "volatility": self.calculate_volatility(klines),
            "price_change": self.calculate_price_change(klines),
            "volume_analysis": self.analyze_volume(klines),
            "natural_language_description": self.generate_natural_language_description(klines),
        }

        return features

    def detect_patterns(self, klines: List[KlineData]) -> List[Dict[str, Any]]:
        """
        Detect candlestick patterns in the K-line data.

        Args:
            klines: List of K-line data points

        Returns:
            List of detected patterns with metadata
        """
        patterns = []

        for i, kline in enumerate(klines):
            # Single candle patterns
            pattern = self._detect_single_candle_pattern(kline)
            if pattern != KlinePattern.NONE:
                patterns.append({
                    "pattern": pattern.value,
                    "type": "single",
                    "index": i,
                    "timestamp": kline.timestamp,
                })

        # Multi-candle patterns
        if len(klines) >= 2:
            for i in range(1, len(klines)):
                pattern = self._detect_two_candle_pattern(klines[i-1], klines[i])
                if pattern != KlinePattern.NONE:
                    patterns.append({
                        "pattern": pattern.value,
                        "type": "double",
                        "index": i,
                        "timestamp": klines[i].timestamp,
                    })

        # Three candle patterns
        if len(klines) >= 3:
            for i in range(2, len(klines)):
                pattern = self._detect_three_candle_pattern(klines[i-2], klines[i-1], klines[i])
                if pattern != KlinePattern.NONE:
                    patterns.append({
                        "pattern": pattern.value,
                        "type": "triple",
                        "index": i,
                        "timestamp": klines[i].timestamp,
                    })

        return patterns

    def _detect_single_candle_pattern(self, kline: KlineData) -> KlinePattern:
        """Detect single candle patterns."""
        body = abs(kline.close - kline.open)
        upper_shadow = kline.high - max(kline.open, kline.close)
        lower_shadow = min(kline.open, kline.close) - kline.low
        total_range = kline.high - kline.low

        if total_range == 0:
            return KlinePattern.DOJI

        body_ratio = body / total_range
        upper_shadow_ratio = upper_shadow / total_range
        lower_shadow_ratio = lower_shadow / total_range

        # Doji: very small body
        if body_ratio < 0.1:
            return KlinePattern.DOJI

        # Hammer: small body at top, long lower shadow
        if body_ratio < 0.3 and lower_shadow_ratio > 0.5 and upper_shadow_ratio < 0.1:
            if kline.close > kline.open:
                return KlinePattern.HAMMER
            else:
                return KlinePattern.HANGING_MAN

        # Shooting star: small body at bottom, long upper shadow
        if body_ratio < 0.3 and upper_shadow_ratio > 0.5 and lower_shadow_ratio < 0.1:
            return KlinePattern.SHOOTING_STAR

        return KlinePattern.NONE

    def _detect_two_candle_pattern(self, prev: KlineData, curr: KlineData) -> KlinePattern:
        """Detect two candle patterns."""
        prev_body = abs(prev.close - prev.open)
        curr_body = abs(curr.close - curr.open)

        # Bullish engulfing
        if (prev.close < prev.open and  # Previous bearish
            curr.close > curr.open and   # Current bullish
            curr.open < prev.close and   # Current opens below previous close
            curr.close > prev.open):     # Current closes above previous open
            return KlinePattern.ENGULFING_BULLISH

        # Bearish engulfing
        if (prev.close > prev.open and  # Previous bullish
            curr.close < curr.open and   # Current bearish
            curr.open > prev.close and   # Current opens above previous close
            curr.close < prev.open):     # Current closes below previous open
            return KlinePattern.ENGULFING_BEARISH

        return KlinePattern.NONE

    def _detect_three_candle_pattern(self, k1: KlineData, k2: KlineData, k3: KlineData) -> KlinePattern:
        """Detect three candle patterns."""
        # Morning star
        if (k1.close < k1.open and  # First bearish
            abs(k2.close - k2.open) < abs(k1.close - k1.open) * 0.3 and  # Small second candle
            k3.close > k3.open and  # Third bullish
            k3.close > (k1.open + k1.close) / 2):  # Third closes above midpoint of first
            return KlinePattern.MORNING_STAR

        # Evening star
        if (k1.close > k1.open and  # First bullish
            abs(k2.close - k2.open) < abs(k1.close - k1.open) * 0.3 and  # Small second candle
            k3.close < k3.open and  # Third bearish
            k3.close < (k1.open + k1.close) / 2):  # Third closes below midpoint of first
            return KlinePattern.EVENING_STAR

        # Three white soldiers
        if (k1.close > k1.open and
            k2.close > k2.open and
            k3.close > k3.open and
            k2.open > k1.open and k2.open < k1.close and
            k3.open > k2.open and k3.open < k2.close):
            return KlinePattern.THREE_WHITE_SOLDIERS

        # Three black crows
        if (k1.close < k1.open and
            k2.close < k2.open and
            k3.close < k3.open and
            k2.open < k1.open and k2.open > k1.close and
            k3.open < k2.open and k3.open > k2.close):
            return KlinePattern.THREE_BLACK_CROWS

        return KlinePattern.NONE

    def analyze_trend(self, klines: List[KlineData]) -> TrendAnalysis:
        """
        Analyze the trend direction and strength.

        Args:
            klines: List of K-line data points

        Returns:
            Trend analysis result
        """
        if len(klines) < 2:
            return TrendAnalysis(TrendDirection.SIDEWAYS, 0.0, len(klines), 0.0)

        closes = [k.close for k in klines]
        x = np.arange(len(closes))

        # Linear regression to find trend
        slope, intercept = np.polyfit(x, closes, 1)

        # Calculate R-squared as strength measure
        predicted = slope * x + intercept
        ss_res = np.sum((np.array(closes) - predicted) ** 2)
        ss_tot = np.sum((np.array(closes) - np.mean(closes)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0

        # Determine direction
        if slope > closes[-1] * 0.001:  # 0.1% per period threshold
            direction = TrendDirection.UP
        elif slope < -closes[-1] * 0.001:
            direction = TrendDirection.DOWN
        else:
            direction = TrendDirection.SIDEWAYS

        return TrendAnalysis(
            direction=direction,
            strength=r_squared,
            duration=len(klines),
            slope=slope,
        )

    def find_support_resistance(self, klines: List[KlineData]) -> List[SupportResistanceLevel]:
        """
        Find support and resistance levels.

        Args:
            klines: List of K-line data points

        Returns:
            List of support/resistance levels
        """
        if len(klines) < 5:
            return []

        levels = []
        highs = [k.high for k in klines]
        lows = [k.low for k in klines]

        # Find local maxima (resistance)
        for i in range(2, len(highs) - 2):
            if highs[i] > highs[i-1] and highs[i] > highs[i-2] and \
               highs[i] > highs[i+1] and highs[i] > highs[i+2]:
                # Count how many times price approached this level
                touches = sum(1 for h in highs if abs(h - highs[i]) / highs[i] < 0.01)
                levels.append(SupportResistanceLevel(
                    price=highs[i],
                    type="resistance",
                    strength=touches,
                    timestamp=klines[i].timestamp,
                ))

        # Find local minima (support)
        for i in range(2, len(lows) - 2):
            if lows[i] < lows[i-1] and lows[i] < lows[i-2] and \
               lows[i] < lows[i+1] and lows[i] < lows[i+2]:
                touches = sum(1 for l in lows if abs(l - lows[i]) / lows[i] < 0.01)
                levels.append(SupportResistanceLevel(
                    price=lows[i],
                    type="support",
                    strength=touches,
                    timestamp=klines[i].timestamp,
                ))

        # Sort by strength
        levels.sort(key=lambda x: x.strength, reverse=True)
        return levels[:5]  # Return top 5 levels

    def calculate_volatility(self, klines: List[KlineData]) -> float:
        """
        Calculate price volatility.

        Args:
            klines: List of K-line data points

        Returns:
            Volatility as standard deviation of returns
        """
        if len(klines) < 2:
            return 0.0

        closes = [k.close for k in klines]
        returns = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]

        return float(np.std(returns)) if returns else 0.0

    def calculate_price_change(self, klines: List[KlineData]) -> Dict[str, float]:
        """
        Calculate overall price change.

        Args:
            klines: List of K-line data points

        Returns:
            Price change statistics
        """
        if not klines:
            return {}

        start_price = klines[0].close
        end_price = klines[-1].close
        absolute_change = end_price - start_price
        percentage_change = (absolute_change / start_price) * 100 if start_price != 0 else 0

        return {
            "start_price": start_price,
            "end_price": end_price,
            "absolute_change": absolute_change,
            "percentage_change": percentage_change,
        }

    def analyze_volume(self, klines: List[KlineData]) -> Dict[str, Any]:
        """
        Analyze volume patterns.

        Args:
            klines: List of K-line data points

        Returns:
            Volume analysis results
        """
        if not klines:
            return {}

        volumes = [k.volume for k in klines]
        avg_volume = np.mean(volumes)
        max_volume = max(volumes)
        min_volume = min(volumes)

        # Detect volume spikes
        volume_spikes = [
            {"index": i, "volume": v, "ratio": v / avg_volume}
            for i, v in enumerate(volumes)
            if v > avg_volume * 2  # Volume > 2x average
        ]

        return {
            "average_volume": float(avg_volume),
            "max_volume": max_volume,
            "min_volume": min_volume,
            "volume_spikes": volume_spikes,
        }

    def generate_natural_language_description(self, klines: List[KlineData]) -> str:
        """
        Generate natural language description of K-line data.

        Args:
            klines: List of K-line data points

        Returns:
            Natural language description
        """
        if not klines:
            return "无K线数据"

        # Call individual analysis methods to avoid recursion
        trend = self.analyze_trend(klines)
        patterns = self.detect_patterns(klines)
        price_change = self.calculate_price_change(klines)
        volatility = self.calculate_volatility(klines)
        sr_levels = self.find_support_resistance(klines)

        description_parts = []

        # Trend description
        if trend.direction == TrendDirection.UP:
            strength_desc = "强劲" if trend.strength > 0.7 else "温和"
            description_parts.append(f"股价呈{strength_desc}上涨趋势，持续了{len(klines)}个周期")
        elif trend.direction == TrendDirection.DOWN:
            strength_desc = "强劲" if trend.strength > 0.7 else "温和"
            description_parts.append(f"股价呈{strength_desc}下跌趋势，持续了{len(klines)}个周期")
        else:
            description_parts.append(f"股价呈横盘震荡走势，持续了{len(klines)}个周期")

        # Price change
        if price_change:
            change = price_change["percentage_change"]
            if abs(change) > 0.1:
                direction = "上涨" if change > 0 else "下跌"
                description_parts.append(f"期间总体{direction}{abs(change):.2f}%")

        # Patterns
        if patterns:
            pattern_names = {
                "hammer": "锤子线",
                "hanging_man": "吊颈线",
                "doji": "十字星",
                "shooting_star": "射击之星",
                "engulfing_bullish": "看涨吞没",
                "engulfing_bearish": "看跌吞没",
                "morning_star": "晨星",
                "evening_star": "暮星",
                "three_white_soldiers": "三白兵",
                "three_black_crows": "三黑鸦",
            }
            pattern_descs = [pattern_names.get(p["pattern"], p["pattern"]) for p in patterns[:3]]
            description_parts.append(f"出现技术形态：{', '.join(pattern_descs)}")

        # Volatility
        if volatility > 0.05:
            description_parts.append("波动率较高，请注意风险")
        elif volatility < 0.01:
            description_parts.append("波动率较低，市场相对平静")

        # Support/Resistance
        if sr_levels:
            support = [l for l in sr_levels if l.type == "support"]
            resistance = [l for l in sr_levels if l.type == "resistance"]
            if support:
                description_parts.append(f"支撑位在{support[0].price:.2f}附近")
            if resistance:
                description_parts.append(f"阻力位在{resistance[0].price:.2f}附近")

        return "。".join(description_parts) + "。"

    def get_trading_signals(self, klines: List[KlineData]) -> List[Dict[str, Any]]:
        """
        Generate trading signals based on K-line analysis.

        Args:
            klines: List of K-line data points

        Returns:
            List of trading signals
        """
        signals = []
        features = self.extract_features(klines)

        # Trend following signals
        trend = features["trend"]
        if trend.direction == TrendDirection.UP and trend.strength > 0.6:
            signals.append({
                "type": "buy",
                "confidence": trend.strength,
                "reason": f"强劲上涨趋势，R²={trend.strength:.2f}",
            })
        elif trend.direction == TrendDirection.DOWN and trend.strength > 0.6:
            signals.append({
                "type": "sell",
                "confidence": trend.strength,
                "reason": f"强劲下跌趋势，R²={trend.strength:.2f}",
            })

        # Pattern-based signals
        patterns = features["patterns"]
        bullish_patterns = ["hammer", "engulfing_bullish", "morning_star", "three_white_soldiers"]
        bearish_patterns = ["hanging_man", "shooting_star", "engulfing_bearish", "evening_star", "three_black_crows"]

        for pattern in patterns:
            pattern_name = pattern["pattern"]
            if pattern_name in bullish_patterns:
                signals.append({
                    "type": "buy",
                    "confidence": 0.7,
                    "reason": f"出现看涨形态：{pattern_name}",
                })
            elif pattern_name in bearish_patterns:
                signals.append({
                    "type": "sell",
                    "confidence": 0.7,
                    "reason": f"出现看跌形态：{pattern_name}",
                })

        return signals
