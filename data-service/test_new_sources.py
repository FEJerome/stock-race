#!/usr/bin/env python3
"""
Test new data sources (AkShare, Baostock, Tushare)
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from data_service.collectors.router import DataSourceRouter, DataSourceStrategy


async def test_new_sources():
    """Test initialization of new data sources."""
    print("Testing new data sources...")

    router = DataSourceRouter(strategy=DataSourceStrategy.ADAPTIVE)

    try:
        await router.initialize()
        print(f"✓ Router initialized with {len(router.data_sources)} data sources")

        # List all sources
        for source in router.data_sources:
            print(f"  - {source.name} (priority: {source.priority})")

        # Get source health
        health = router.get_source_health()
        print(f"\nSource health:")
        for name, status in health.items():
            print(f"  {name}: active={status['is_active']}, score={status['health_score']:.1f}")

        # Test a simple quote (may fail if no network or API issues)
        print("\nTesting simple quote retrieval (may fail without network)...")
        try:
            quote = await router.get_stock_quote("000001.SZ")
            if quote:
                print(f"✓ Got quote for 000001.SZ: {quote.get('name')} - ¥{quote.get('price')}")
                print(f"  Data source: {quote.get('data_source', 'unknown')}")
            else:
                print("✗ No quote returned")
        except Exception as e:
            print(f"✗ Quote retrieval failed (may be expected): {str(e)}")
            print("  This is OK if network is unavailable or APIs have limits")

        await router.close()
        print("\n✓ Test completed")

    except Exception as e:
        print(f"✗ Test failed: {str(e)}")
        raise


if __name__ == "__main__":
    asyncio.run(test_new_sources())