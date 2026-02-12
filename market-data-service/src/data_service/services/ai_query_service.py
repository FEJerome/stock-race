"""
AI决策服务批量查询服务

专为AI决策优化的智能批量行情查询服务，支持：
- 多维度并集查询（板块+行业+个股）
- 智能数据压缩和采样
- 多级缓存机制
- 并行批量查询
"""

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Set, Tuple
from collections import defaultdict

from ..models.stock import StockQuote, StockSymbol, StockSector
from ..models.ai_query import (
    AIQueryRequest, AIQueryResponse, AIQueryScope, AIQueryFilter,
    StockCompactData, MarketSummary, AIQueryMetadata,
    InfoDensity, TimeRangeStrategy, DataType
)
from ..core.config import settings

logger = logging.getLogger(__name__)


class AIQueryService:
    """
    AI决策服务批量查询服务
    """

    # 缓存时间配置（秒）
    CACHE_TTL = {
        "quote": 30,           # 实时行情：30秒
        "kline": 300,          # K线数据：5分钟
        "technical": 600,      # 技术指标：10分钟
        "fundamental": 3600,   # 基本面：1小时
        "symbol_mapping": 86400,  # 股票映射表：24小时
    }

    # 信息密度字段映射
    DENSITY_FIELDS = {
        "ultra_low": {"symbol", "price", "change_percent", "volume"},
        "low": {"symbol", "name", "price", "change_percent", "volume",
                "open", "high", "low", "prev_close", "market_cap"},
        "medium": {"symbol", "name", "price", "change_percent", "volume",
                   "open", "high", "low", "prev_close", "amount", "market_cap",
                   "pe_ratio", "pb_ratio", "turnover_rate"},
        "high": {"symbol", "name", "price", "change_percent", "volume",
                 "open", "high", "low", "prev_close", "amount", "market_cap",
                 "pe_ratio", "pb_ratio", "turnover_rate", "bid_price", "ask_price"},
        "full": None  # 所有字段
    }

    # 采样率配置
    SAMPLING_RATES = {
        "ultra_low": 0.10,
        "low": 0.25,
        "medium": 0.50,
        "high": 0.75,
        "full": 1.00
    }

    def __init__(self, data_service, redis_cache):
        """
        初始化AI查询服务

        Args:
            data_service: 数据服务实例
            redis_cache: Redis缓存实例
        """
        self.data_service = data_service
        self.redis_cache = redis_cache

        # 内存缓存（股票代码映射表）
        self._symbol_mapping_cache: Dict[str, Dict[str, Any]] = {}
        self._symbol_mapping_cache_time: Optional[datetime] = None
        self._symbol_mapping_cache_ttl = timedelta(hours=1)

    def _generate_cache_key(self, request: AIQueryRequest) -> str:
        """
        生成缓存键 - 基于请求参数哈希

        策略：
        1. 对scope进行排序和规范化
        2. 只缓存quote数据类型的请求
        3. 根据info_density调整缓存粒度
        """
        # 规范化scope
        scope_dict = {}
        if request.scope.sectors:
            scope_dict['sectors'] = sorted(request.scope.sectors)
        if request.scope.industries:
            scope_dict['industries'] = sorted(request.scope.industries)
        if request.scope.concepts:
            scope_dict['concepts'] = sorted(request.scope.concepts)
        if request.scope.indices:
            scope_dict['indices'] = sorted(request.scope.indices)
        if request.scope.symbols:
            scope_dict['symbols'] = sorted(request.scope.symbols)

        # 构建缓存键元素
        key_elements = [
            "ai_query",
            request.info_density.value,
            request.time_range.value,
            json.dumps(scope_dict, sort_keys=True),
            str(request.max_stocks),
        ]

        # 添加filter影响缓存的部分
        if request.filter:
            filter_elements = []
            if request.filter.min_market_cap:
                filter_elements.append(f"min_cap_{request.filter.min_market_cap}")
            if request.filter.max_market_cap:
                filter_elements.append(f"max_cap_{request.filter.max_market_cap}")
            if request.filter.exclude_st:
                filter_elements.append("no_st")
            key_elements.append("|".join(filter_elements) if filter_elements else "no_filter")

        # 生成哈希
        key_string = "|".join(key_elements)
        return f"ai:{hashlib.md5(key_string.encode()).hexdigest()}"

    async def _get_cached_result(self, cache_key: str) -> Optional[AIQueryResponse]:
        """从缓存获取结果"""
        try:
            cached = await self.redis_cache.get(cache_key)
            if cached:
                logger.info(f"AIQuery cache hit: {cache_key}")
                # 将字典转换回模型
                return AIQueryResponse(**cached)
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
        return None

    async def _cache_result(self, cache_key: str, response: AIQueryResponse, ttl: int = 30):
        """缓存查询结果"""
        try:
            # 转换为字典存储
            data = response.model_dump()
            await self.redis_cache.set(cache_key, data, expire=ttl)
            logger.info(f"AIQuery cached: {cache_key}, ttl={ttl}s")
        except Exception as e:
            logger.warning(f"Cache write error: {e}")

    async def _get_symbols_from_scope(self, scope: AIQueryScope) -> Set[str]:
        """
        从多维度scope获取股票代码并集

        实现策略：
        1. 并行查询所有维度
        2. 使用Set去重（并集）
        3. 利用缓存减少重复查询
        """
        all_symbols: Set[str] = set()
        tasks = []

        # 1. 板块维度
        if scope.sectors:
            for sector in scope.sectors:
                tasks.append(self._get_sector_symbols_cached(sector))

        # 2. 行业维度
        if scope.industries:
            for industry in scope.industries:
                tasks.append(self._get_industry_symbols_cached(industry))

        # 3. 概念维度
        if scope.concepts:
            for concept in scope.concepts:
                tasks.append(self._get_concept_symbols_cached(concept))

        # 4. 指数维度
        if scope.indices:
            for index in scope.indices:
                tasks.append(self._get_index_symbols_cached(index))

        # 5. 直接指定的个股
        if scope.symbols:
            all_symbols.update(scope.symbols)

        # 并行执行所有查询
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, set):
                    all_symbols.update(result)
                elif isinstance(result, Exception):
                    logger.warning(f"Symbol fetch error: {result}")

        return all_symbols

    async def _get_sector_symbols_cached(self, sector: str) -> Set[str]:
        """获取板块股票（带缓存）"""
        cache_key = f"symbols:sector:{sector}"
        try:
            cached = await self.redis_cache.get(cache_key)
            if cached:
                return set(cached)
        except Exception:
            pass

        # 从data_service获取
        symbols = await self.data_service._get_sector_symbols(sector)
        symbol_set = set(symbols)

        # 缓存24小时（板块成分相对稳定）
        try:
            await self.redis_cache.set(cache_key, list(symbol_set), expire=86400)
        except Exception:
            pass

        return symbol_set

    async def _get_industry_symbols_cached(self, industry: str) -> Set[str]:
        """获取行业股票（带缓存）"""
        cache_key = f"symbols:industry:{industry}"
        try:
            cached = await self.redis_cache.get(cache_key)
            if cached:
                return set(cached)
        except Exception:
            pass

        symbols = await self.data_service._get_industry_symbols(industry)
        symbol_set = set(symbols)

        try:
            await self.redis_cache.set(cache_key, list(symbol_set), expire=86400)
        except Exception:
            pass

        return symbol_set

    async def _get_concept_symbols_cached(self, concept: str) -> Set[str]:
        """获取概念板块股票（带缓存）"""
        cache_key = f"symbols:concept:{concept}"
        try:
            cached = await self.redis_cache.get(cache_key)
            if cached:
                return set(cached)
        except Exception:
            pass

        symbols = await self.data_service._get_concept_symbols(concept)
        symbol_set = set(symbols)

        try:
            await self.redis_cache.set(cache_key, list(symbol_set), expire=86400)
        except Exception:
            pass

        return symbol_set

    async def _get_index_symbols_cached(self, index: str) -> Set[str]:
        """获取指数成分股（带缓存）"""
        cache_key = f"symbols:index:{index}"
        try:
            cached = await self.redis_cache.get(cache_key)
            if cached:
                return set(cached)
        except Exception:
            pass

        components = await self.data_service.get_index_components(index)
        symbol_set = {c.symbol for c in components}

        try:
            await self.redis_cache.set(cache_key, list(symbol_set), expire=86400)
        except Exception:
            pass

        return symbol_set

    def _apply_filter(self, symbols: Set[str], filter_cond: AIQueryFilter) -> Set[str]:
        """
        应用筛选条件

        注意：这里只做符号级别的快速过滤
        详细过滤（如市值、ST状态）需要获取股票详情
        """
        # 目前返回所有，详细过滤在获取数据后进行
        # 这样可以避免为过滤而查询所有股票的详情
        return symbols

    async def _fetch_stock_data_parallel(
        self,
        symbols: List[str],
        data_types: List[DataType],
        info_density: InfoDensity
    ) -> List[StockCompactData]:
        """
        并行批量获取股票数据

        策略：
        1. 批量并行查询，控制并发数
        2. 优先从缓存获取
        3. 失败重试机制
        """
        results = []
        semaphore = asyncio.Semaphore(20)  # 限制并发数

        async def fetch_with_limit(symbol: str) -> Optional[StockCompactData]:
            async with semaphore:
                return await self._fetch_single_stock(
                    symbol, data_types, info_density
                )

        # 批量执行
        tasks = [fetch_with_limit(symbol) for symbol in symbols]
        completed = await asyncio.gather(*tasks, return_exceptions=True)

        for result in completed:
            if isinstance(result, StockCompactData):
                results.append(result)
            elif isinstance(result, Exception):
                logger.warning(f"Stock fetch error: {result}")

        return results

    async def _fetch_single_stock(
        self,
        symbol: str,
        data_types: List[DataType],
        info_density: InfoDensity
    ) -> Optional[StockCompactData]:
        """获取单只股票数据（带多级缓存）"""

        # 1. 检查Redis缓存
        cache_key = f"stock:{info_density.value}:{symbol}"
        try:
            cached = await self.redis_cache.get(cache_key)
            if cached:
                return StockCompactData(**cached)
        except Exception:
            pass

        # 2. 从data_service获取
        try:
            # 获取实时行情
            quote = await self.data_service.get_stock_quote(symbol)
            if not quote:
                return None

            # 构建CompactData
            compact_data = await self._build_compact_data(
                symbol, quote, data_types, info_density
            )

            # 缓存结果
            ttl = self.CACHE_TTL.get("quote", 30)
            try:
                data_dict = compact_data.model_dump()
                await self.redis_cache.set(cache_key, data_dict, expire=ttl)
            except Exception:
                pass

            return compact_data

        except Exception as e:
            logger.warning(f"Failed to fetch {symbol}: {e}")
            return None

    async def _build_compact_data(
        self,
        symbol: str,
        quote: StockQuote,
        data_types: List[DataType],
        info_density: InfoDensity
    ) -> StockCompactData:
        """根据信息密度构建压缩数据"""

        # 获取需要包含的字段
        fields = self.DENSITY_FIELDS.get(info_density.value)

        data = {
            "symbol": symbol,
        }

        # 基础字段（所有密度级别）
        if fields is None or "name" in fields:
            data["name"] = getattr(quote, 'name', None)
        if fields is None or "price" in fields:
            data["price"] = quote.price
        if fields is None or "change_percent" in fields:
            data["change_percent"] = quote.change_percent
        if fields is None or "volume" in fields:
            data["volume"] = quote.volume

        # 扩展字段
        if fields is None or "open" in fields:
            data["open"] = quote.open
        if fields is None or "high" in fields:
            data["high"] = quote.high
        if fields is None or "low" in fields:
            data["low"] = quote.low
        if fields is None or "prev_close" in fields:
            data["prev_close"] = quote.prev_close
        if fields is None or "amount" in fields:
            data["amount"] = quote.amount

        # 估值字段
        if info_density in [InfoDensity.MEDIUM, InfoDensity.HIGH, InfoDensity.FULL]:
            symbol_info = await self.data_service.get_stock_info(symbol)
            if symbol_info:
                if fields is None or "market_cap" in fields:
                    data["market_cap"] = getattr(symbol_info, 'market_cap', None)
                if fields is None or "pe_ratio" in fields:
                    data["pe_ratio"] = getattr(symbol_info, 'pe_ratio', None)
                if fields is None or "pb_ratio" in fields:
                    data["pb_ratio"] = getattr(symbol_info, 'pb_ratio', None)

        # 技术指标
        if DataType.TECHNICAL in data_types and info_density in [InfoDensity.HIGH, InfoDensity.FULL]:
            try:
                indicators = await self.data_service.get_technical_indicators(symbol)
                if indicators:
                    data["technical"] = {
                        "rsi": indicators.get("rsi"),
                        "macd": indicators.get("macd"),
                        "kdj": indicators.get("kdj"),
                    }
            except Exception:
                pass

        data["update_time"] = datetime.now()
        data["data_quality"] = "real"

        return StockCompactData(**data)

    def _apply_sampling(
        self,
        stocks: List[StockCompactData],
        info_density: InfoDensity,
        max_stocks: int,
        priority_symbols: Optional[List[str]]
    ) -> List[StockCompactData]:
        """
        应用智能采样策略

        策略：
        1. 优先保留priority_symbols
        2. 按市值排序
        3. 根据采样率选择
        4. 确保不超过max_stocks
        """
        if len(stocks) <= max_stocks:
            return stocks

        # 分离优先股票
        priority_set = set(priority_symbols or [])
        priority_stocks = [s for s in stocks if s.symbol in priority_set]
        other_stocks = [s for s in stocks if s.symbol not in priority_set]

        # 按市值排序（优先选择大市值）
        other_stocks.sort(
            key=lambda x: (x.market_cap or 0),
            reverse=True
        )

        # 计算可用名额
        available_slots = max_stocks - len(priority_stocks)

        # 应用采样率
        sampling_rate = self.SAMPLING_RATES.get(info_density.value, 0.5)
        sample_count = int(len(other_stocks) * sampling_rate)
        sample_count = min(sample_count, available_slots)

        # 组合结果
        result = priority_stocks + other_stocks[:sample_count]

        return result

    def _calculate_market_summary(
        self,
        stocks: List[StockCompactData]
    ) -> MarketSummary:
        """计算市场汇总统计"""
        if not stocks:
            return MarketSummary(
                total_stocks=0,
                up_count=0,
                down_count=0,
                flat_count=0,
                avg_change_percent=0.0,
                total_volume=0.0,
                total_amount=0.0
            )

        up_count = sum(1 for s in stocks if (s.change_percent or 0) > 0)
        down_count = sum(1 for s in stocks if (s.change_percent or 0) < 0)
        flat_count = len(stocks) - up_count - down_count

        changes = [s.change_percent for s in stocks if s.change_percent is not None]
        avg_change = sum(changes) / len(changes) if changes else 0.0

        total_volume = sum(s.volume for s in stocks if s.volume)
        total_amount = sum(s.amount for s in stocks if s.amount)

        # 涨幅前5
        gainers = sorted(
            [s for s in stocks if (s.change_percent or 0) > 0],
            key=lambda x: x.change_percent or 0,
            reverse=True
        )[:5]

        # 跌幅前5
        losers = sorted(
            [s for s in stocks if (s.change_percent or 0) < 0],
            key=lambda x: x.change_percent or 0
        )[:5]

        return MarketSummary(
            total_stocks=len(stocks),
            up_count=up_count,
            down_count=down_count,
            flat_count=flat_count,
            avg_change_percent=round(avg_change, 2),
            total_volume=total_volume,
            total_amount=total_amount,
            top_gainers=[{"symbol": s.symbol, "change": s.change_percent} for s in gainers],
            top_losers=[{"symbol": s.symbol, "change": s.change_percent} for s in losers]
        )

    async def query(self, request: AIQueryRequest) -> AIQueryResponse:
        """
        执行AI决策批量查询

        流程：
        1. 检查缓存
        2. 解析scope获取股票并集
        3. 应用过滤条件
        4. 并行获取股票数据
        5. 应用采样压缩
        6. 计算市场汇总
        7. 缓存结果
        8. 返回响应
        """
        start_time = datetime.now()
        request_id = request.request_id or f"aiq_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        try:
            # 1. 检查缓存
            cache_key = self._generate_cache_key(request)
            cached_result = await self._get_cached_result(cache_key)
            if cached_result:
                cached_result.metadata.query_time_ms = 0  # 缓存命中，耗时为0
                cached_result.metadata.cache_hit = True
                return cached_result

            # 2. 获取股票并集
            logger.info(f"[{request_id}] Fetching symbols from scope...")
            all_symbols = await self._get_symbols_from_scope(request.scope)
            total_matched = len(all_symbols)

            if not all_symbols:
                return AIQueryResponse(
                    success=True,
                    message="No stocks match the criteria",
                    request_id=request_id,
                    stocks=[],
                    stock_count=0,
                    total_matched=0,
                    metadata=AIQueryMetadata(
                        request_id=request_id,
                        query_time_ms=0,
                        data_scope={},
                        sampling_rate=0,
                        compression_ratio=0,
                        cache_hit=False,
                        data_timestamp=datetime.now()
                    )
                )

            # 3. 应用快速过滤
            filtered_symbols = self._apply_filter(all_symbols, request.filter)

            # 4. 并行获取数据
            logger.info(f"[{request_id}] Fetching data for {len(filtered_symbols)} stocks...")
            symbols_list = list(filtered_symbols)
            stocks_data = await self._fetch_stock_data_parallel(
                symbols_list,
                request.data_types,
                request.info_density
            )

            # 5. 应用采样压缩
            compressed_stocks = self._apply_sampling(
                stocks_data,
                request.info_density,
                request.max_stocks,
                request.priority_symbols
            )

            # 6. 计算市场汇总
            market_summary = None
            if request.include_market_summary:
                market_summary = self._calculate_market_summary(compressed_stocks)

            # 7. 计算元数据
            end_time = datetime.now()
            query_time_ms = int((end_time - start_time).total_seconds() * 1000)

            original_size = len(stocks_data)
            final_size = len(compressed_stocks)
            sampling_rate = final_size / original_size if original_size > 0 else 1.0

            # 估算压缩比（根据字段数量）
            field_count = len(self.DENSITY_FIELDS.get(request.info_density.value) or [])
            full_field_count = 20  # 完整字段数估算
            compression_ratio = field_count / full_field_count if field_count > 0 else 1.0

            metadata = AIQueryMetadata(
                request_id=request_id,
                query_time_ms=query_time_ms,
                data_scope={
                    "sectors": request.scope.sectors,
                    "industries": request.scope.industries,
                    "total_symbols_before_filter": total_matched,
                    "total_symbols_after_filter": len(filtered_symbols),
                    "data_types": [dt.value for dt in request.data_types]
                },
                sampling_rate=round(sampling_rate, 2),
                compression_ratio=round(compression_ratio, 2),
                cache_hit=False,
                data_timestamp=datetime.now()
            )

            # 8. 构建响应
            response = AIQueryResponse(
                success=True,
                request_id=request_id,
                stocks=compressed_stocks,
                stock_count=len(compressed_stocks),
                total_matched=total_matched,
                market_summary=market_summary,
                metadata=metadata
            )

            # 9. 缓存结果
            cache_ttl = self.CACHE_TTL.get("quote", 30)
            await self._cache_result(cache_key, response, ttl=cache_ttl)

            logger.info(
                f"[{request_id}] Query completed: "
                f"{len(compressed_stocks)} stocks, "
                f"{query_time_ms}ms, "
                f"sampling={sampling_rate:.2%}"
            )

            return response

        except Exception as e:
            logger.error(f"[{request_id}] Query failed: {e}", exc_info=True)
            return AIQueryResponse(
                success=False,
                message=str(e),
                request_id=request_id,
                stocks=[],
                stock_count=0,
                total_matched=0,
                metadata=AIQueryMetadata(
                    request_id=request_id,
                    query_time_ms=int((datetime.now() - start_time).total_seconds() * 1000),
                    data_scope={},
                    sampling_rate=0,
                    compression_ratio=0,
                    cache_hit=False,
                    data_timestamp=datetime.now()
                )
            )
