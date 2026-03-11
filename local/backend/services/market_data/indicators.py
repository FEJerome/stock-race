"""
技术指标计算模块

提供基于历史数据的各类技术分析指标
"""
from dataclasses import dataclass
from typing import List, Optional
from statistics import mean


@dataclass
class TechnicalIndicatorsResult:
    """技术指标计算结果"""
    ma5: Optional[float] = None
    ma10: Optional[float] = None
    ma20: Optional[float] = None
    volume_ma5: Optional[float] = None
    price_change_1h: Optional[float] = None  # 1小时涨跌幅（1200条 ≈ 1小时，按3秒/条）
    trend: str = "unknown"  # up/down/sideways/unknown


class TechnicalIndicators:
    """技术指标计算器"""

    def __init__(self, cache_service):
        self._cache = cache_service

    async def calculate(self, symbol: str) -> TechnicalIndicatorsResult:
        """
        计算指定股票的技术指标

        从缓存服务获取数据，计算各类指标
        """
        # 获取最近 100 条数据（约5分钟）
        quotes = await self._cache.get_recent_quotes(symbol, limit=100)

        if not quotes:
            return TechnicalIndicatorsResult()

        prices = [q['price'] for q in quotes]
        volumes = [q.get('volume', 0) for q in quotes if q.get('volume')]

        result = TechnicalIndicatorsResult()

        # 计算 MA
        result.ma5 = self._calculate_ma(prices, 5)
        result.ma10 = self._calculate_ma(prices, 10)
        result.ma20 = self._calculate_ma(prices, 20)

        # 计算成交量 MA5
        if len(volumes) >= 5:
            result.volume_ma5 = self._calculate_ma(volumes, 5)

        # 计算1小时涨跌幅（1200条 ≈ 1小时，按3秒/条计算）
        # 注：内存缓存只保存240条（约12分钟），如需要准确1小时数据需从DB获取更多
        result.price_change_1h = self._calculate_change(prices, min(1200, len(prices) - 1))

        # 判断趋势
        result.trend = self._determine_trend(prices)

        return result

    @staticmethod
    def _calculate_ma(values: List[float], period: int) -> Optional[float]:
        """计算简单移动平均"""
        if len(values) < period:
            return None
        return round(mean(values[:period]), 2)

    @staticmethod
    def _calculate_change(values: List[float], periods: int) -> Optional[float]:
        """计算相对于 N 个周期前的变化百分比"""
        if len(values) < periods + 1:
            return None
        current = values[0]
        previous = values[periods]
        if previous == 0:
            return None
        return round((current - previous) / previous * 100, 2)

    @staticmethod
    def _determine_trend(prices: List[float]) -> str:
        """
        判断价格趋势

        逻辑:
        - 上涨: 最近10条 MA5 > MA10 且 价格持续上升
        - 下跌: 最近10条 MA5 < MA10 且 价格持续下降
        - 震荡: MA5 和 MA10 接近 或 价格波动无明显方向
        - unknown: 数据不足
        """
        if len(prices) < 20:
            return "unknown"

        # 取最近20条计算短期和中期MA
        recent = prices[:20]
        short_term = recent[:5]  # 最近5条
        mid_term = recent[:10]   # 最近10条

        ma_short = mean(short_term)
        ma_mid = mean(mid_term)

        # 计算斜率（最近5条 vs 前5条）
        first_half = mean(recent[5:10])
        second_half = mean(recent[:5])

        ma_diff_pct = abs(ma_short - ma_mid) / ma_mid if ma_mid > 0 else 0

        # 趋势判断
        if ma_diff_pct < 0.001:  # MA非常接近
            return "sideways"

        if ma_short > ma_mid and second_half > first_half:
            return "up"
        elif ma_short < ma_mid and second_half < first_half:
            return "down"
        else:
            return "sideways"
