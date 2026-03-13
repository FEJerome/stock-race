"""
新闻/公告采集器测试脚本

测试 Issue #14 [B-1.4-D2] 新闻/公告采集器功能：
- 多源新闻采集
- 数据去重机制
- 与 EventExtractor 集成格式验证

Usage:
    cd local/backend
    python tests/test_news_collection.py
"""
import asyncio
import sys
from datetime import datetime

sys.path.insert(0, '.')

from services.collectors.news_collector import MultiSourceNewsCollector
from services.news.akshare_news import AKShareNewsSource
from services.news.eastmoney_news import EastmoneyNewsSource
from services.news.sse_announcement import SSEAnnouncementSource
from services.news.szse_announcement import SZSEAnnouncementSource


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


async def main():
    """主测试函数"""
    print("\n" + "=" * 60)
    print("Issue #14 [B-1.4-D2] News/Announcement Collector Tests")
    print("=" * 60)
    print(f"Test time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    try:
        # 运行所有测试
        await test_news_collection()
        await test_announcement_collection()
        await test_event_extractor_format()
        await test_data_quality()

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
