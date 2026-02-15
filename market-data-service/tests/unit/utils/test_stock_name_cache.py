"""
Tests for StockNameCache - 股票名称本地缓存单元测试

TDD开发流程：
1. 编写测试（Red）
2. 实现代码（Green）
3. 重构优化（Refactor）

测试覆盖：
- 缓存获取与回退
- 批量填充
- 降级策略
"""

import pytest
import asyncio
from typing import Dict, List
from unittest.mock import Mock, AsyncMock, patch

from data_service.utils.stock_name_cache import StockNameCache, get_name_cache, reset_name_cache


class TestStockNameCache:
    """股票名称缓存测试类"""

    @pytest.fixture
    def mock_redis(self):
        """创建Mock Redis客户端"""
        redis = Mock()
        redis.hget = AsyncMock()
        redis.hset = AsyncMock()
        redis.hmget = AsyncMock()
        return redis

    @pytest.fixture
    def name_cache(self, mock_redis):
        """创建StockNameCache实例"""
        return StockNameCache(redis_client=mock_redis)

    @pytest.mark.asyncio
    async def test_get_name_from_redis(self, name_cache, mock_redis):
        """测试从Redis获取名称"""
        mock_redis.hget.return_value = "平安银行"

        name = await name_cache.get_name("000001.SZ")

        assert name == "平安银行"

    @pytest.mark.asyncio
    async def test_get_name_from_local_cache(self, name_cache, mock_redis):
        """测试从本地缓存获取名称"""
        mock_redis.hget.return_value = None
        # 预先设置本地缓存
        name_cache._local_cache["000002.SZ"] = "万科A"

        name = await name_cache.get_name("000002.SZ")

        assert name == "万科A"

    @pytest.mark.asyncio
    async def test_get_name_from_builtin(self, name_cache, mock_redis):
        """测试从内置映射获取名称"""
        mock_redis.hget.return_value = None

        name = await name_cache.get_name("000001.SZ")

        assert name == "平安银行"

    @pytest.mark.asyncio
    async def test_get_name_from_parsing(self, name_cache, mock_redis):
        """测试从代码解析获取名称"""
        mock_redis.hget.return_value = None

        # 测试沪市主板
        name = await name_cache.get_name("600519.SH")
        assert "沪市主板" in name

        # 测试科创板
        name = await name_cache.get_name("688001.SH")
        assert "科创板" in name

        # 测试创业板
        name = await name_cache.get_name("300001.SZ")
        assert "创业板" in name

    @pytest.mark.asyncio
    async def test_get_name_not_found(self, name_cache, mock_redis):
        """测试无法获取名称的情况"""
        mock_redis.hget.return_value = None

        # 使用无效代码
        name = await name_cache.get_name("INVALID.CODE")

        # 应该返回代码解析结果
        assert name is not None

    @pytest.mark.asyncio
    async def test_batch_fill_names(self, name_cache, mock_redis):
        """测试批量填充"""
        quotes = {
            "000001.SZ": {"symbol": "000001.SZ", "price": 10.5, "name": ""},
            "600519.SH": {"symbol": "600519.SH", "price": 1800.0, "name": ""}
        }

        mock_redis.hmget.return_value = ["平安银行", None]

        filled = await name_cache.batch_fill_names(quotes)

        assert filled["000001.SZ"]["name"] == "平安银行"
        assert "沪市主板" in filled["600519.SH"]["name"]

    @pytest.mark.asyncio
    async def test_batch_fill_names_no_redis(self):
        """测试无Redis时的批量填充"""
        cache = StockNameCache(redis_client=None)
        cache._local_cache["000001.SZ"] = "平安银行"

        quotes = {
            "000001.SZ": {"symbol": "000001.SZ", "price": 10.5, "name": ""},
        }

        filled = await cache.batch_fill_names(quotes)

        assert filled["000001.SZ"]["name"] == "平安银行"

    @pytest.mark.asyncio
    async def test_update_names(self, name_cache, mock_redis):
        """测试更新名称缓存"""
        name_mapping = {
            "000001.SZ": "平安银行",
            "000002.SZ": "万科A"
        }

        await name_cache.update_names(name_mapping)

        # 验证本地缓存已更新
        assert name_cache._local_cache["000001.SZ"] == "平安银行"
        assert name_cache._local_cache["000002.SZ"] == "万科A"

        # 验证Redis已更新
        mock_redis.hset.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_names_empty(self, name_cache, mock_redis):
        """测试更新空名称映射"""
        await name_cache.update_names({})

        # Redis不应被调用
        mock_redis.hset.assert_not_called()

    def test_parse_name_from_symbol(self, name_cache):
        """测试从代码解析名称"""
        # 沪市主板
        assert "沪市主板" in name_cache._parse_name_from_symbol("600000.SH")
        assert "沪市主板" in name_cache._parse_name_from_symbol("601000.SH")
        assert "沪市主板" in name_cache._parse_name_from_symbol("603000.SH")

        # 科创板
        assert "科创板" in name_cache._parse_name_from_symbol("688001.SH")

        # 深市主板
        assert "深市主板" in name_cache._parse_name_from_symbol("000001.SZ")
        assert "深市主板" in name_cache._parse_name_from_symbol("001001.SZ")

        # 中小板
        assert "中小板" in name_cache._parse_name_from_symbol("002001.SZ")

        # 创业板
        assert "创业板" in name_cache._parse_name_from_symbol("300001.SZ")

        # 北交所
        assert "北交所" in name_cache._parse_name_from_symbol("831001.BJ")
        assert "北交所" in name_cache._parse_name_from_symbol("430001.BJ")

        # 无效代码
        assert name_cache._parse_name_from_symbol("INVALID") is None

    def test_get_cache_stats(self, name_cache):
        """测试获取缓存统计"""
        stats = name_cache.get_cache_stats()

        assert "local_cache_size" in stats
        assert "builtin_names" in stats
        assert "expired_cleaned" in stats
        assert "redis_available" in stats
        assert stats["redis_available"] is True

    def test_clear_cache(self, name_cache):
        """测试清空缓存"""
        # 添加一些缓存
        name_cache._local_cache["TEST"] = "Test Stock"

        name_cache.clear_cache()

        # 验证已清空但保留了内置名称
        assert "TEST" not in name_cache._local_cache
        assert "000001.SZ" in name_cache._local_cache


class TestStockNameCacheSingleton:
    """股票名称缓存单例测试"""

    def setup_method(self):
        """每个测试前重置单例"""
        reset_name_cache()

    def teardown_method(self):
        """每个测试后重置单例"""
        reset_name_cache()

    def test_get_name_cache_singleton(self):
        """测试单例模式"""
        cache1 = get_name_cache()
        cache2 = get_name_cache()

        assert cache1 is cache2

    def test_get_name_cache_with_redis(self):
        """测试带Redis的单例"""
        mock_redis = Mock()
        cache = get_name_cache(mock_redis)

        assert cache.redis is mock_redis


class TestStockNameCacheEdgeCases:
    """股票名称缓存边界情况测试"""

    @pytest.fixture
    def name_cache(self):
        """创建无Redis的缓存实例"""
        return StockNameCache(redis_client=None)

    @pytest.mark.asyncio
    async def test_batch_fill_with_none_quotes(self, name_cache):
        """测试处理None行情数据"""
        quotes = {
            "000001.SZ": None,
            "000002.SZ": {"symbol": "000002.SZ", "price": 10.5}
        }

        filled = await name_cache.batch_fill_names(quotes)

        # None值应被跳过
        assert filled["000001.SZ"] is None

    @pytest.mark.asyncio
    async def test_batch_fill_no_names_needed(self, name_cache):
        """测试所有股票都已有名称的情况"""
        quotes = {
            "000001.SZ": {"symbol": "000001.SZ", "price": 10.5, "name": "平安银行"},
        }

        filled = await name_cache.batch_fill_names(quotes)

        # 应直接返回，不做任何处理
        assert filled["000001.SZ"]["name"] == "平安银行"

    @pytest.mark.asyncio
    async def test_batch_fill_empty_quotes(self, name_cache):
        """测试空行情数据"""
        filled = await name_cache.batch_fill_names({})

        assert filled == {}

    @pytest.mark.asyncio
    async def test_get_name_invalid_symbol(self, name_cache):
        """测试无效股票代码"""
        name = await name_cache.get_name("")

        # 空字符串应返回None或解析结果
        assert name is None or isinstance(name, str)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
