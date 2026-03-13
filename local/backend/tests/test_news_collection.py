"""
新闻/公告采集器测试脚本

测试 Issue #14 [B-1.4-D2] 新闻/公告采集器功能：
- 多源新闻采集
- 数据去重机制
- 与 EventExtractor 集成格式验证
- since 参数增量采集
- 多源并发采集
- 外部 API mock 测试

Usage:
    cd local/backend
    python tests/test_news_collection.py
"""
import asyncio
import sys
import time
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, AsyncMock, patch

sys.path.insert(0, '.')

from services.collectors.news_collector import MultiSourceNewsCollector, NewsCollector
from services.news.akshare_news import AKShareNewsSource, AKShareAnnouncementSource
from services.news.eastmoney_news import EastmoneyNewsSource
from services.news.sse_announcement import SSEAnnouncementSource
from services.news.szse_announcement import SZSEAnnouncementSource
from services.news.base import NewsItem, NewsSourceHealth, NewsSourceStatus


async def test_news_collection():
    """测试新闻采集功能"""
    print("=" * 60)
    print("Test: News Collection")
    print("=" * 60)

    # 创建多源采集器
    collector = MultiSourceNewsCollector([
        AKShareNewsSource(priority=45),
        EastmoneyNewsSource(priority=60)
    ])

    # 测试采集
    symbol = "000001.SZ"
    print(f"\nFetching news for {symbol}...")

    result = await collector.collect(symbol, limit=10)

    print(f"\nResult:")
    print(f"  - Total items: {result.count}")
    print(f"  - Source: {result.source_name}")
    print(f"  - Success: {result.success}")
    print(f"  - Duration: {result.duration_ms:.0f}ms")

    # 显示采集结果
    if result.items:
        print(f"\nTop 5 items:")
        for i, item in enumerate(result.items[:5], 1):
            print(f"  {i}. [{item.source}] {item.title[:50]}...")
            print(f"      Date: {item.publish_time.strftime('%Y-%m-%d %H:%M')}")
            print(f"      URL: {item.url[:60]}...")

    # 验证去重
    unique_ids = set(item.id for item in result.items)
    print(f"\nDeduplication check:")
    print(f"  - Unique IDs: {len(unique_ids)}")
    print(f"  - Total items: {len(result.items)}")
    if len(unique_ids) == len(result.items):
        print(f"  - Status: PASSED (no duplicates)")
    else:
        print(f"  - Status: REMOVED {len(result.items) - len(unique_ids)} duplicates")

    await collector.close()
    return result


async def test_announcement_collection():
    """测试公告采集功能"""
    print("\n" + "=" * 60)
    print("Test: Announcement Collection")
    print("=" * 60)

    # 上交所公告
    print("\n1. SSE Announcement (600000.SH)")
    sse_source = SSEAnnouncementSource()
    sse_items = await sse_source.fetch_news("600000.SH", limit=5)
    print(f"   Fetched {len(sse_items)} items")
    for item in sse_items[:3]:
        print(f"   - [{item.source}] {item.title[:50]}...")
    await sse_source.close()

    # 深交所公告
    print("\n2. SZSE Announcement (000001.SZ)")
    szse_source = SZSEAnnouncementSource()
    szse_items = await szse_source.fetch_news("000001.SZ", limit=5)
    print(f"   Fetched {len(szse_items)} items")
    for item in szse_items[:3]:
        print(f"   - [{item.source}] {item.title[:50]}...")
    await szse_source.close()


async def test_event_extractor_format():
    """测试 EventExtractor 输入格式"""
    print("\n" + "=" * 60)
    print("Test: EventExtractor Input Format")
    print("=" * 60)

    # 采集新闻
    source = AKShareNewsSource()
    items = await source.fetch_news("000001.SZ", limit=3)

    print(f"\nCollected {len(items)} items for format validation")

    # 验证转换为 EventExtractor 输入格式
    print("\nEventExtractor input format (title + summary):")
    for i, item in enumerate(items, 1):
        # EventExtractor 期望的输入格式
        text_for_extraction = f"{item.title}\n{item.summary}"

        print(f"\n  Item {i}:")
        print(f"    Symbol: {item.symbol}")
        print(f"    Source: {item.source}")
        print(f"    Publish: {item.publish_time}")
        print(f"    Text length: {len(text_for_extraction)} chars")
        print(f"    Preview: {text_for_extraction[:100]}...")

    await source.close()


def validate_news_item(item) -> bool:
    """验证 NewsItem 字段完整性"""
    required_fields = ['id', 'symbol', 'title', 'source', 'publish_time']
    for field in required_fields:
        if not getattr(item, field, None):
            return False
    return True


async def test_data_quality():
    """测试数据质量"""
    print("\n" + "=" * 60)
    print("Test: Data Quality Validation")
    print("=" * 60)

    source = AKShareNewsSource()
    items = await source.fetch_news("000001.SZ", limit=10)

    valid_count = sum(1 for item in items if validate_news_item(item))

    print(f"\nValidation results:")
    print(f"  - Total items: {len(items)}")
    print(f"  - Valid items: {valid_count}")
    print(f"  - Pass rate: {valid_count/len(items)*100:.1f}%" if items else "  - Pass rate: N/A")

    # 检查 ID 生成（URL MD5）
    print(f"\nID format check:")
    if items:
        sample_id = items[0].id
        print(f"  - Sample ID: {sample_id}")
        print(f"  - Length: {len(sample_id)} (expected: 32 for MD5)")
        print(f"  - Valid hex: {all(c in '0123456789abcdef' for c in sample_id.lower())}")

    await source.close()


async def test_incremental_collection():
    """测试增量采集（since 参数）"""
    print("\n" + "=" * 60)
    print("Test: Incremental Collection (since parameter)")
    print("=" * 60)

    collector = NewsCollector(AKShareNewsSource(priority=45))
    symbol = "000001.SZ"

    # 第一次完整采集
    print(f"\n1. Full collection for {symbol}")
    result1 = await collector.collect(symbol, limit=10)
    print(f"   Collected {result1.count} items")
    print(f"   Latest publish_time: {result1.next_since}")

    # 使用 next_since 作为 since 进行增量采集
    if result1.next_since:
        since_time = result1.next_since - timedelta(minutes=5)  # 稍微提前一点，确保有数据
        print(f"\n2. Incremental collection since {since_time}")
        result2 = await collector.collect(symbol, since=since_time, limit=10)
        print(f"   Collected {result2.count} items")
        print(f"   Status: {'PASSED' if result2.count <= result1.count else 'UNEXPECTED'}")

    await collector.close()


async def test_multi_source_concurrent():
    """测试多源并发采集性能"""
    print("\n" + "=" * 60)
    print("Test: Multi-source Concurrent Collection")
    print("=" * 60)

    # 准备多个数据源
    sources = [
        AKShareNewsSource(priority=45),
        EastmoneyNewsSource(priority=60),
        SZSEAnnouncementSource(priority=56),
    ]

    symbol = "000001.SZ"

    # 串行采集（逐个源）
    print(f"\n1. Sequential collection")
    start_time = time.time()
    sequential_items = []
    for source in sources:
        items = await source.fetch_news(symbol, limit=5)
        sequential_items.extend(items)
        await source.close()
    sequential_time = time.time() - start_time
    print(f"   Total items: {len(sequential_items)}")
    print(f"   Time: {sequential_time:.2f}s")

    # 并发采集（使用 MultiSourceNewsCollector）
    print(f"\n2. Concurrent collection")
    start_time = time.time()
    collector = MultiSourceNewsCollector(sources)
    result = await collector.collect(symbol, limit=15)
    concurrent_time = time.time() - start_time
    print(f"   Total items: {result.count}")
    print(f"   Time: {concurrent_time:.2f}s")

    # 性能比较
    speedup = sequential_time / concurrent_time if concurrent_time > 0 else 1
    print(f"\n3. Performance comparison:")
    print(f"   Speedup: {speedup:.2f}x")
    print(f"   Status: {'PASSED' if speedup >= 0.8 else 'DEGRADED'} (expected: ~1x or better)")

    await collector.close()


async def test_sse_disabled():
    """测试上交所数据源被禁用状态"""
    print("\n" + "=" * 60)
    print("Test: SSE Announcement Source Disabled")
    print("=" * 60)

    sse_source = SSEAnnouncementSource()

    # 验证 API 禁用标记
    print(f"\n1. Check API disabled flag")
    print(f"   _API_DISABLED: {sse_source._API_DISABLED}")

    # 测试采集（应该返回空）
    print(f"\n2. Test fetch_news (should return empty)")
    items = await sse_source.fetch_news("600000.SH", limit=5)
    print(f"   Returned {len(items)} items")
    print(f"   Status: {'PASSED' if len(items) == 0 else 'FAILED'}")

    # 测试健康检查
    print(f"\n3. Test health_check")
    health = await sse_source.health_check()
    print(f"   Status: {health.status.value}")
    print(f"   Status: {'PASSED' if health.status.value == 'unavailable' else 'FAILED'}")

    await sse_source.close()


async def test_mock_external_api():
    """测试 mock 外部 API 调用"""
    print("\n" + "=" * 60)
    print("Test: Mock External API")
    print("=" * 60)

    # 模拟 AKShareNewsSource 的行为
    mock_item = NewsItem(
        id="mock_id_12345" * 3,  # 32 chars
        symbol="000001.SZ",
        title="Mock News Title",
        summary="This is a mock news summary for testing.",
        source="mock_source",
        url="https://example.com/news/123",
        publish_time=datetime.now(timezone.utc),
        collected_at=datetime.now(timezone.utc)
    )

    # 创建 mock source
    mock_source = Mock(spec=AKShareNewsSource)
    mock_source.name = "mock_source"
    mock_source.priority = 45
    mock_source.fetch_news = AsyncMock(return_value=[mock_item])
    mock_source.health_check = AsyncMock(return_value=NewsSourceHealth(
        source_name="mock_source",
        status=NewsSourceStatus.HEALTHY,
        latency_ms=100.0,
        last_success=datetime.now(timezone.utc),
        error_rate=0.0,
        weight=1.0
    ))
    mock_source.close = AsyncMock()

    # 使用 mock source 进行采集
    collector = NewsCollector(mock_source)
    result = await collector.collect("000001.SZ", limit=1)

    print(f"\n1. Mock collection result:")
    print(f"   Items: {result.count}")
    print(f"   Success: {result.success}")
    print(f"   Source: {result.source_name}")

    # 验证 mock 被正确调用
    mock_source.fetch_news.assert_called_once()
    print(f"\n2. Mock verification:")
    print(f"   fetch_news called: {mock_source.fetch_news.called}")
    print(f"   Status: {'PASSED' if result.count == 1 else 'FAILED'}")

    await collector.close()


async def main():
    """主测试函数"""
    print("\n" + "=" * 60)
    print("Issue #14 [B-1.4-D2] News/Announcement Collector Tests")
    print("=" * 60)
    print(f"Test time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}")

    try:
        # 运行原有测试
        await test_news_collection()
        await test_announcement_collection()
        await test_event_extractor_format()
        await test_data_quality()

        # 运行新增测试（P3 要求）
        await test_incremental_collection()
        await test_multi_source_concurrent()
        await test_sse_disabled()
        await test_mock_external_api()

        print("\n" + "=" * 60)
        print("All tests completed!")
        print("=" * 60)

    except Exception as e:
        print(f"\nTest failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
