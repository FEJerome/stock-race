"""
Hot Stock Selector - 热股票选取器

实现按权重排序选取高频层股票的逻辑：
1. 接收带权重的热股票列表
2. 按权重降序排序
3. 选取前N只股票
4. 处理缺失权重和边界值
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class HotStock:
    """热股票数据模型"""
    symbol: str
    weight: float = 50.0  # 默认权重50
    factors: Optional[Dict[str, float]] = None
    updated_at: Optional[datetime] = None

    def __post_init__(self):
        """数据验证和修正"""
        # 确保权重在有效范围内
        if self.weight is None:
            self.weight = 50.0
        elif self.weight > 100.0:
            self.weight = 100.0
        elif self.weight < 0.0:
            self.weight = 0.0

        # 确保权重保留1位小数
        self.weight = round(self.weight, 1)


class HotStockSelector:
    """
    热股票选取器

    职责：
    1. 解析和验证热股票数据
    2. 按权重排序
    3. 选取前N只股票
    4. 处理异常情况
    """

    DEFAULT_WEIGHT: float = 50.0  # 默认权重
    MAX_WEIGHT: float = 100.0     # 最大权重
    MIN_WEIGHT: float = 0.0       # 最小权重

    def __init__(self):
        """初始化选取器"""
        self._last_selection: List[str] = []
        self._last_selection_time: Optional[datetime] = None

        logger.info("HotStockSelector initialized")

    def parse_hot_stock(self, data: Dict[str, Any]) -> HotStock:
        """
        解析热股票数据

        Args:
            data: 原始股票数据字典

        Returns:
            HotStock对象
        """
        symbol = data.get("symbol", "")
        weight = data.get("weight")
        factors = data.get("factors")

        # 处理权重
        if weight is None:
            weight = self.DEFAULT_WEIGHT
        else:
            try:
                weight = float(weight)
            except (ValueError, TypeError):
                weight = self.DEFAULT_WEIGHT

        return HotStock(
            symbol=symbol,
            weight=weight,
            factors=factors,
            updated_at=datetime.now()
        )

    def select_stocks_for_high_freq(
        self,
        hot_stocks: List[Dict[str, Any]],
        max_count: int
    ) -> List[str]:
        """
        选取高频层股票

        按权重排序，选取前max_count只股票

        Args:
            hot_stocks: 热股票列表，每项包含symbol和weight
            max_count: 最大选取数量

        Returns:
            选取的股票代码列表
        """
        if not hot_stocks or max_count <= 0:
            return []

        # 解析股票数据
        parsed_stocks: List[HotStock] = []
        for stock_data in hot_stocks:
            try:
                hot_stock = self.parse_hot_stock(stock_data)
                if hot_stock.symbol:  # 确保有股票代码
                    parsed_stocks.append(hot_stock)
            except Exception as e:
                logger.warning(f"Failed to parse hot stock data: {stock_data}, error: {e}")
                continue

        if not parsed_stocks:
            logger.warning("No valid hot stocks after parsing")
            return []

        # 按权重降序排序（保持稳定性）
        sorted_stocks = sorted(
            parsed_stocks,
            key=lambda x: (x.weight, x.symbol),  # 权重相同按代码排序确保稳定
            reverse=True
        )

        # 选取前N只
        selected = sorted_stocks[:min(max_count, len(sorted_stocks))]
        selected_symbols = [s.symbol for s in selected]

        # 记录本次选择
        self._last_selection = selected_symbols
        self._last_selection_time = datetime.now()

        logger.info(f"Selected {len(selected_symbols)} stocks for high freq layer "
                   f"from {len(hot_stocks)} hot stocks")

        return selected_symbols

    def get_weight_distribution(
        self,
        hot_stocks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        获取权重分布统计

        Args:
            hot_stocks: 热股票列表

        Returns:
            权重分布统计
        """
        if not hot_stocks:
            return {"count": 0, "avg_weight": 0, "max_weight": 0, "min_weight": 0}

        weights = []
        for stock_data in hot_stocks:
            try:
                hot_stock = self.parse_hot_stock(stock_data)
                weights.append(hot_stock.weight)
            except Exception:
                continue

        if not weights:
            return {"count": 0, "avg_weight": 0, "max_weight": 0, "min_weight": 0}

        return {
            "count": len(weights),
            "avg_weight": round(sum(weights) / len(weights), 1),
            "max_weight": max(weights),
            "min_weight": min(weights),
            "distribution": {
                "high (80-100)": len([w for w in weights if 80 <= w <= 100]),
                "medium (50-79)": len([w for w in weights if 50 <= w < 80]),
                "low (0-49)": len([w for w in weights if 0 <= w < 50]),
            }
        }

    def get_last_selection(self) -> Dict[str, Any]:
        """
        获取上次选择结果

        Returns:
            上次选择的股票列表和时间
        """
        return {
            "stocks": self._last_selection,
            "count": len(self._last_selection),
            "selection_time": self._last_selection_time.isoformat() if self._last_selection_time else None
        }

    def calculate_stock_priority(
        self,
        symbol: str,
        view_count: int = 0,
        user_count: int = 0,
        trade_volume: int = 0,
        favorite_count: int = 0
    ) -> float:
        """
        计算股票优先级权重（供Backend使用）

        权重计算公式：
        - 查看用户数: 40%
        - 查看次数: 30%
        - 交易活跃度: 20%
        - 收藏数: 10%

        Args:
            symbol: 股票代码
            view_count: 查看次数
            user_count: 查看用户数
            trade_volume: 交易量
            favorite_count: 收藏数

        Returns:
            计算出的权重 (0-100)
        """
        # 归一化各因子（假设最大值为参考）
        max_users = 1000.0
        max_views = 5000.0
        max_volume = 1000000.0
        max_favorites = 500.0

        user_score = min(user_count / max_users, 1.0) * 40
        view_score = min(view_count / max_views, 1.0) * 30
        volume_score = min(trade_volume / max_volume, 1.0) * 20
        fav_score = min(favorite_count / max_favorites, 1.0) * 10

        total_weight = user_score + view_score + volume_score + fav_score
        return round(min(total_weight, 100.0), 1)


# 全局选取器实例（单例模式）
_selector: Optional[HotStockSelector] = None


def get_hot_stock_selector() -> HotStockSelector:
    """
    获取全局热股票选取器实例

    Returns:
        HotStockSelector实例
    """
    global _selector
    if _selector is None:
        _selector = HotStockSelector()
    return _selector


def reset_hot_stock_selector():
    """重置全局选取器实例（主要用于测试）"""
    global _selector
    _selector = None
