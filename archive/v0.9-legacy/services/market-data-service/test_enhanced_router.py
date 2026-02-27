#!/usr/bin/env python3
"""
Test script for enhanced data router and service.
"""

import asyncio
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from data_service.collectors.router import DataSourceRouter, DataSourceStrategy
from data_service.services.enhanced_data_service import EnhancedDataService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_router_basic():
    """Test basic router functionality."""
    print("\n=== Testing Basic Router Functionality ===")

    router = DataSourceRouter(strategy=DataSourceStrategy.ADAPTIVE)

    try:
        await router.initialize()
        print("✓ Router initialized successfully")

        # Test source health
        health = router.get_source_health()
        print(f"✓ Source health: {list(health.keys())}")

        # Test performance metrics
        metrics = router.get_performance_metrics()
        print(f"✓ Performance metrics: {metrics}")

        # Test single quote
        print("\nTesting single quote retrieval...")
        try:
            quote = await router.get_stock_quote("000001.SZ")
            if quote:
                print(f"✓ Got quote for 000001.SZ: {quote.get('name')} - ¥{quote.get('price')}")
            else:
                print("✗ Failed to get quote")
        except Exception as e:
            print(f"✗ Quote retrieval failed: {str(e)}")

        # Test batch quotes
        print("\nTesting batch quote retrieval...")
        symbols = ["000001.SZ", "600036.SH", "000002.SZ"]
        try:
            quotes = await router.get_batch_quotes(symbols, segmentation_strategy="by_exchange")
            print(f"✓ Got {len(quotes)}/{len(symbols)} quotes")
            for symbol, quote in quotes.items():
                print(f"  {symbol}: {quote.get('name')} - ¥{quote.get('price')}")
        except Exception as e:
            print(f"✗ Batch retrieval failed: {str(e)}")

        await router.close()
        print("✓ Router closed successfully")

    except Exception as e:
        print(f"✗ Router test failed: {str(e)}")
        raise


async def test_enhanced_service():
    """Test enhanced data service."""
    print("\n=== Testing Enhanced Data Service ===")

    service = EnhancedDataService(strategy=DataSourceStrategy.ADAPTIVE)

    try:
        await service.initialize()
        print("✓ Enhanced service initialized successfully")

        # Test single quote with cache
        print("\nTesting single quote with cache...")
        quote = await service.get_stock_quote("000001.SZ", use_cache=True)
        if quote:
            print(f"✓ Got quote: {quote.name} - ¥{quote.price} (Change: {quote.change_percent:.2f}%)")
        else:
            print("✗ Failed to get quote")

        # Test batch quotes with segmentation
        print("\nTesting batch quotes with segmentation...")
        symbols = ["000001.SZ", "600036.SH", "000002.SZ", "600000.SH", "000858.SZ"]
        quotes = await service.get_batch_quotes(
            symbols,
            segmentation_strategy="by_exchange",
            use_cache=True
        )
        print(f"✓ Got {len(quotes)}/{len(symbols)} quotes")

        # Test market indices
        print("\nTesting market indices...")
        indices = await service.get_market_indices(use_cache=True)
        print(f"✓ Got {len(indices)} market indices")
        for idx in indices:
            print(f"  {idx['name']}: ¥{idx.get('price', 0.0):.2f}")

        # Test router health
        print("\nTesting router health...")
        health = await service.get_router_health()
        print(f"✓ Router health retrieved")
        print(f"  Active sources: {health['performance'].get('active_sources', [])}")
        print(f"  Success rate: {health['performance'].get('overall_success_rate', 0.0):.2%}")

        # Test monitoring metrics
        print("\nTesting monitoring metrics...")
        metrics = await service.get_monitoring_metrics()
        print(f"✓ Monitoring metrics retrieved")
        print(f"  Total collections: {metrics.total_collections}")
        print(f"  Success rate: {metrics.success_rate:.2%}")

        # Test data quality
        print("\nTesting data quality...")
        quality = await service.get_data_quality("000001.SZ")
        print(f"✓ Data quality retrieved")
        print(f"  Completeness: {quality.completeness:.2%}")
        print(f"  Accuracy: {quality.accuracy:.2%}")
        print(f"  Source availability: {quality.source_availability:.2%}")

        await service.close()
        print("✓ Enhanced service closed successfully")

    except Exception as e:
        print(f"✗ Enhanced service test failed: {str(e)}")
        raise


async def test_segmentation_strategies():
    """Test different segmentation strategies."""
    print("\n=== Testing Segmentation Strategies ===")

    service = EnhancedDataService(strategy=DataSourceStrategy.ADAPTIVE)

    try:
        await service.initialize()

        # Test symbols
        symbols = [
            "000001.SZ", "000002.SZ", "000858.SZ",  # Shenzhen
            "600036.SH", "600000.SH", "601318.SH",  # Shanghai
            "300750.SZ", "002475.SZ",  # More Shenzhen
            "601988.SH", "601328.SH"   # More Shanghai
        ]

        strategies = ["by_exchange", "by_first_letter", "round_robin"]

        for strategy in strategies:
            print(f"\nTesting strategy: {strategy}")
            start_time = datetime.now()

            quotes = await service.get_batch_quotes(
                symbols,
                segmentation_strategy=strategy,
                use_cache=False
            )

            elapsed = (datetime.now() - start_time).total_seconds()
            success_rate = len(quotes) / len(symbols)

            print(f"  Time: {elapsed:.2f}s")
            print(f"  Success: {len(quotes)}/{len(symbols)} ({success_rate:.2%})")

            # Small delay between strategies
            await asyncio.sleep(1)

        await service.close()

    except Exception as e:
        print(f"✗ Segmentation test failed: {str(e)}")
        raise


async def test_failover_recovery():
    """Test failover and recovery mechanisms."""
    print("\n=== Testing Failover and Recovery ===")

    router = DataSourceRouter(strategy=DataSourceStrategy.ADAPTIVE)

    try:
        await router.initialize()

        # Get initial health
        initial_health = router.get_source_health()
        print(f"Initial source health:")
        for name, health in initial_health.items():
            print(f"  {name}: active={health['is_active']}, score={health['health_score']:.1f}")

        # Simulate errors by making many requests quickly
        print("\nSimulating high load...")
        test_symbols = ["000001.SZ"] * 20  # Same symbol many times

        results = []
        for i, symbol in enumerate(test_symbols):
            try:
                quote = await router.get_stock_quote(symbol, max_retries=1)
                results.append(True)
                print(f"  Request {i+1}: Success")
            except Exception as e:
                results.append(False)
                print(f"  Request {i+1}: Failed - {str(e)}")

            # Small delay to avoid overwhelming
            await asyncio.sleep(0.2)

        success_rate = sum(results) / len(results)
        print(f"\nSuccess rate under load: {success_rate:.2%}")

        # Check health after load
        post_load_health = router.get_source_health()
        print(f"\nPost-load source health:")
        for name, health in post_load_health.items():
            print(f"  {name}: active={health['is_active']}, score={health['health_score']:.1f}")

        # Test reset
        print("\nTesting source reset...")
        for source_name in router.metrics.keys():
            result = await router.reset_source(source_name)
            print(f"  Reset {source_name}: {result.get('success', False)}")

        await router.close()

    except Exception as e:
        print(f"✗ Failover test failed: {str(e)}")
        raise


async def test_strategy_rotation():
    """Test strategy rotation."""
    print("\n=== Testing Strategy Rotation ===")

    service = EnhancedDataService(strategy=DataSourceStrategy.PRIORITY)

    try:
        await service.initialize()

        strategies = [
            DataSourceStrategy.PRIORITY,
            DataSourceStrategy.ROUND_ROBIN,
            DataSourceStrategy.LOAD_BALANCED,
            DataSourceStrategy.ADAPTIVE
        ]

        test_symbol = "000001.SZ"

        for strategy in strategies:
            # Rotate strategy
            result = await service.rotate_strategy()
            print(f"\nRotated to: {result.get('new_strategy')}")

            # Test with current strategy
            start_time = datetime.now()
            quote = await service.get_stock_quote(test_symbol, use_cache=False)
            elapsed = (datetime.now() - start_time).total_seconds()

            if quote:
                print(f"  Quote: {quote.name} - ¥{quote.price}")
                print(f"  Latency: {elapsed:.3f}s")
            else:
                print(f"  Failed to get quote")

            # Small delay
            await asyncio.sleep(1)

        await service.close()

    except Exception as e:
        print(f"✗ Strategy rotation test failed: {str(e)}")
        raise


async def main():
    """Run all tests."""
    print("Starting enhanced data router and service tests...")

    tests = [
        test_router_basic,
        test_enhanced_service,
        test_segmentation_strategies,
        test_failover_recovery,
        test_strategy_rotation
    ]

    for i, test_func in enumerate(tests, 1):
        print(f"\n{'='*60}")
        print(f"Test {i}/{len(tests)}")
        try:
            await test_func()
            print(f"✓ Test {i} passed")
        except Exception as e:
            print(f"✗ Test {i} failed: {str(e)}")
            # Continue with other tests
            continue

    print(f"\n{'='*60}")
    print("All tests completed!")


if __name__ == "__main__":
    asyncio.run(main())