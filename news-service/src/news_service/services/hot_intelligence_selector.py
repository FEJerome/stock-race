"""
热情报筛选算法实现

NS-D-001: 基于置信度>0.7、最近1小时筛选Top 100热情报
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Set
import logging

logger = logging.getLogger(__name__)


class HotIntelligenceSelector:
    """
    热情报筛选器

    从 stock_intelligence 表中筛选高置信度、高时效性的情报，
    用于推送给 Trading AI Service 进行决策支持。

    筛选条件:
    - 置信度 >= min_confidence (默认 0.7)
    - 创建时间在 time_window_hours 小时内 (默认 1小时)
    - 按置信度、重要性、时间综合排序
    - 最多返回 max_results 条 (默认 100)
    """

    def __init__(
        self,
        db_pool: Any,
        min_confidence: float = 0.7,
        time_window_hours: int = 1,
        max_results: int = 100,
    ):
        """
        初始化热情报筛选器

        Args:
            db_pool: 数据库连接池 (asyncpg Pool)
            min_confidence: 最小置信度阈值 (默认 0.7)
            time_window_hours: 时间窗口小时数 (默认 1)
            max_results: 最大返回结果数 (默认 100)
        """
        self.db_pool = db_pool
        self.min_confidence = min_confidence
        self.time_window_hours = time_window_hours
        self.max_results = max_results

    async def select_hot_intelligence(self) -> List[Dict[str, Any]]:
        """
        筛选热情报

        从数据库查询符合条件的热情报，按置信度降序排序。

        Returns:
            List[Dict]: 热情报列表，每条包含完整的 stock_intelligence 字段

        Raises:
            Exception: 数据库查询失败时抛出
        """
        try:
            async with self.db_pool.acquire() as conn:
                # 计算时间边界
                time_boundary = datetime.now() - timedelta(hours=self.time_window_hours)

                # 执行查询
                rows = await conn.fetch(
                    """
                    SELECT
                        id,
                        stock_code,
                        stock_name,
                        sentiment_score,
                        sentiment_type,
                        sentiment_confidence,
                        summary,
                        importance,
                        is_breaking,
                        related_sectors,
                        related_industries,
                        related_concepts,
                        relevance_score,
                        source,
                        source_url,
                        created_at
                    FROM stock_intelligence
                    WHERE sentiment_confidence >= $1
                        AND created_at >= $2
                        AND expired_at > CURRENT_TIMESTAMP
                    ORDER BY
                        sentiment_confidence DESC,
                        importance DESC,
                        created_at DESC
                    LIMIT $3
                    """,
                    self.min_confidence,
                    time_boundary,
                    self.max_results,
                )

                # 转换为字典列表
                result = [dict(row) for row in rows]

                logger.info(
                    f"Selected {len(result)} hot intelligence items "
                    f"(confidence>={self.min_confidence}, "
                    f"within {self.time_window_hours}h)"
                )

                return result

        except Exception as e:
            logger.error(f"Failed to select hot intelligence: {e}")
            raise

    def _extract_coverage_stocks(self, intelligence_list: List[Dict[str, Any]]) -> List[str]:
        """
        提取覆盖的股票代码列表

        Args:
            intelligence_list: 热情报列表

        Returns:
            List[str]: 去重后的股票代码列表
        """
        coverage: Set[str] = set()

        for item in intelligence_list:
            stock_code = item.get("stock_code")
            if stock_code:
                coverage.add(stock_code)

        return sorted(list(coverage))

    def _extract_coverage_sectors(self, intelligence_list: List[Dict[str, Any]]) -> List[str]:
        """
        提取覆盖的板块列表

        NS-D-003: 计算热情报覆盖的板块范围

        Args:
            intelligence_list: 热情报列表

        Returns:
            List[str]: 去重后的板块列表
        """
        coverage: Set[str] = set()

        for item in intelligence_list:
            sectors = item.get("related_sectors")
            if sectors and isinstance(sectors, (list, tuple)):
                for sector in sectors:
                    if sector:
                        coverage.add(sector)

        return sorted(list(coverage))

    def _extract_coverage_industries(self, intelligence_list: List[Dict[str, Any]]) -> List[str]:
        """
        提取覆盖的行业列表

        NS-D-003: 计算热情报覆盖的行业范围

        Args:
            intelligence_list: 热情报列表

        Returns:
            List[str]: 去重后的行业列表
        """
        coverage: Set[str] = set()

        for item in intelligence_list:
            industries = item.get("related_industries")
            if industries and isinstance(industries, (list, tuple)):
                for industry in industries:
                    if industry:
                        coverage.add(industry)

        return sorted(list(coverage))

    def _extract_coverage_concepts(self, intelligence_list: List[Dict[str, Any]]) -> List[str]:
        """
        提取覆盖的概念列表

        NS-D-003: 计算热情报覆盖的概念范围

        Args:
            intelligence_list: 热情报列表

        Returns:
            List[str]: 去重后的概念列表
        """
        coverage: Set[str] = set()

        for item in intelligence_list:
            concepts = item.get("related_concepts")
            if concepts and isinstance(concepts, (list, tuple)):
                for concept in concepts:
                    if concept:
                        coverage.add(concept)

        return sorted(list(coverage))

    def _get_coverage_analysis(self, intelligence_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        获取完整的覆盖范围分析

        NS-D-003: 多维度覆盖分析（股票/板块/行业/概念）

        Args:
            intelligence_list: 热情报列表

        Returns:
            Dict: 包含以下字段:
                - total_intelligence: 情报总数
                - stocks: {count, items} 股票覆盖
                - sectors: {count, items} 板块覆盖
                - industries: {count, items} 行业覆盖
                - concepts: {count, items} 概念覆盖
        """
        stocks = self._extract_coverage_stocks(intelligence_list)
        sectors = self._extract_coverage_sectors(intelligence_list)
        industries = self._extract_coverage_industries(intelligence_list)
        concepts = self._extract_coverage_concepts(intelligence_list)

        return {
            "total_intelligence": len(intelligence_list),
            "stocks": {
                "count": len(stocks),
                "items": stocks,
            },
            "sectors": {
                "count": len(sectors),
                "items": sectors,
            },
            "industries": {
                "count": len(industries),
                "items": industries,
            },
            "concepts": {
                "count": len(concepts),
                "items": concepts,
            },
        }

    def _format_for_push(self, intelligence_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        格式化为推送格式

        将完整的情报数据转换为精简的推送格式，控制数据大小。

        Args:
            intelligence_list: 热情报列表

        Returns:
            Dict: 包含以下字段:
                - intelligence: 精简情报列表
                - coverage: 覆盖的股票代码列表
                - timestamp: 推送时间戳
        """
        # 精简情报格式
        simplified_intelligence = []

        for item in intelligence_list:
            simplified = {
                "stock_code": item.get("stock_code"),
                "stock_name": item.get("stock_name"),
                "summary": self._truncate_summary(item.get("summary", "")),
                "sentiment_type": item.get("sentiment_type"),
                "sentiment_confidence": item.get("sentiment_confidence"),
                "importance": item.get("importance"),
                "is_breaking": item.get("is_breaking", False),
                "created_at": item.get("created_at").isoformat()
                if item.get("created_at")
                else None,
            }
            simplified_intelligence.append(simplified)

        # 计算覆盖范围
        coverage = self._extract_coverage_stocks(intelligence_list)

        # 计算多维度覆盖分析
        coverage_analysis = self._get_coverage_analysis(intelligence_list)

        return {
            "intelligence": simplified_intelligence,
            "coverage": coverage,
            "coverage_analysis": coverage_analysis,
            "timestamp": datetime.now().isoformat(),
        }

    def _truncate_summary(self, summary: str, max_length: int = 100) -> str:
        """
        截断摘要至指定长度

        Args:
            summary: 原始摘要
            max_length: 最大长度 (默认100字符)

        Returns:
            str: 截断后的摘要
        """
        if not summary:
            return ""

        if len(summary) <= max_length:
            return summary

        # 截断并添加省略号
        return summary[: max_length - 3] + "..."

    async def select_and_format_for_push(self) -> Dict[str, Any]:
        """
        筛选并格式化为推送数据

        完整的流程：筛选热情报 -> 格式化 -> 返回推送数据

        Returns:
            Dict: 推送格式的数据，包含 intelligence、coverage、timestamp
        """
        # 筛选热情报
        hot_intelligence = await self.select_hot_intelligence()

        # 格式化为推送格式
        push_data = self._format_for_push(hot_intelligence)

        logger.info(
            f"Formatted {len(push_data['intelligence'])} intelligence items "
            f"for push, covering {len(push_data['coverage'])} stocks"
        )

        return push_data

    async def get_coverage_count(self) -> int:
        """
        获取覆盖股票数量

        Returns:
            int: 当前热情报覆盖的股票数量
        """
        try:
            async with self.db_pool.acquire() as conn:
                time_boundary = datetime.now() - timedelta(hours=self.time_window_hours)

                row = await conn.fetchrow(
                    """
                    SELECT COUNT(DISTINCT stock_code) as count
                    FROM stock_intelligence
                    WHERE sentiment_confidence >= $1
                        AND created_at >= $2
                        AND expired_at > CURRENT_TIMESTAMP
                    """,
                    self.min_confidence,
                    time_boundary,
                )

                return row["count"] if row else 0

        except Exception as e:
            logger.error(f"Failed to get coverage count: {e}")
            raise

    async def get_hot_intelligence_stats(self) -> Dict[str, Any]:
        """
        获取热情报统计信息

        Returns:
            Dict: 包含以下统计字段:
                - total_count: 总条数
                - coverage_count: 覆盖股票数
                - avg_confidence: 平均置信度
                - sentiment_breakdown: 情感分布
                - source_breakdown: 来源分布
        """
        try:
            async with self.db_pool.acquire() as conn:
                time_boundary = datetime.now() - timedelta(hours=self.time_window_hours)

                # 基础统计
                base_stats = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(*) as total_count,
                        COUNT(DISTINCT stock_code) as coverage_count,
                        AVG(sentiment_confidence) as avg_confidence
                    FROM stock_intelligence
                    WHERE sentiment_confidence >= $1
                        AND created_at >= $2
                        AND expired_at > CURRENT_TIMESTAMP
                    """,
                    self.min_confidence,
                    time_boundary,
                )

                # 情感分布
                sentiment_rows = await conn.fetch(
                    """
                    SELECT sentiment_type, COUNT(*) as count
                    FROM stock_intelligence
                    WHERE sentiment_confidence >= $1
                        AND created_at >= $2
                        AND expired_at > CURRENT_TIMESTAMP
                    GROUP BY sentiment_type
                    """,
                    self.min_confidence,
                    time_boundary,
                )
                sentiment_breakdown = {
                    row["sentiment_type"]: row["count"] for row in sentiment_rows
                }

                # 来源分布
                source_rows = await conn.fetch(
                    """
                    SELECT source, COUNT(*) as count
                    FROM stock_intelligence
                    WHERE sentiment_confidence >= $1
                        AND created_at >= $2
                        AND expired_at > CURRENT_TIMESTAMP
                    GROUP BY source
                    ORDER BY count DESC
                    LIMIT 10
                    """,
                    self.min_confidence,
                    time_boundary,
                )
                source_breakdown = {row["source"]: row["count"] for row in source_rows}

                return {
                    "total_count": base_stats["total_count"] or 0,
                    "coverage_count": base_stats["coverage_count"] or 0,
                    "avg_confidence": round(base_stats["avg_confidence"] or 0, 4),
                    "sentiment_breakdown": sentiment_breakdown,
                    "source_breakdown": source_breakdown,
                    "time_window_hours": self.time_window_hours,
                    "min_confidence": self.min_confidence,
                }

        except Exception as e:
            logger.error(f"Failed to get hot intelligence stats: {e}")
            raise
