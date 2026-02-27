#!/usr/bin/env python3
"""
事件总线集成测试
直接测试Redis连接和功能
"""

import sys
import time
import threading

sys.path.insert(0, '/home/fe-jerome/projects/stock-race/infra/event-bus/src')

from event_bus import (
    EventBusClient,
    EventProducer,
    EventConsumer,
    EventSchema,
    EventType,
)

def test_redis_connection():
    """测试Redis连接"""
    print("=" * 50)
    print("测试1: Redis连接")
    print("=" * 50)

    try:
        client = EventBusClient(host="localhost", port=6379)
        client.connect()
        assert client.health_check(), "Health check failed"
        print("✓ Redis连接成功")
        client.disconnect()
        return True
    except Exception as e:
        print(f"✗ Redis连接失败: {e}")
        return False

def test_publish_and_consume():
    """测试发布和消费"""
    print("\n" + "=" * 50)
    print("测试2: 事件发布和消费")
    print("=" * 50)

    try:
        received_events = []
        event_received = threading.Event()

        # 创建客户端
        client = EventBusClient(host="localhost", port=6379)

        # 创建消费者
        consumer = EventConsumer(
            client=client,
            service_name="test-consumer",
            consumer_group="test-group-" + str(int(time.time())),
        )

        # 定义处理器
        def handler(event):
            received_events.append(event)
            event_received.set()

        consumer.subscribe(EventType.MARKET_QUOTE_REALTIME, handler)
        consumer.start()

        # 创建生产者
        producer = EventProducer(client=client, service_name="test-producer")

        # 发布事件
        test_symbol = "000001.SZ"
        producer.publish_event(
            EventType.MARKET_QUOTE_REALTIME,
            {
                "symbol": test_symbol,
                "price": 12.58,
                "change": 0.5,
                "volume": 10000,
                "timestamp": "2026-02-11T10:00:00Z"
            },
        )
        print(f"✓ 事件已发布: {test_symbol}")

        # 等待消费
        if event_received.wait(timeout=5):
            print(f"✓ 事件已消费: {received_events[0].payload['symbol']}")
            assert received_events[0].payload["symbol"] == test_symbol
        else:
            print("✗ 事件消费超时")
            return False

        consumer.stop()
        client.disconnect()
        return True

    except Exception as e:
        print(f"✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """运行所有测试"""
    print("\n" + "=" * 50)
    print("事件总线SDK集成测试")
    print("=" * 50)

    results = []

    # 测试1: Redis连接
    results.append(("Redis连接", test_redis_connection()))

    # 测试2: 发布和消费
    results.append(("发布和消费", test_publish_and_consume()))

    # 汇总结果
    print("\n" + "=" * 50)
    print("测试结果汇总")
    print("=" * 50)

    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"{name}: {status}")

    passed = sum(1 for _, r in results if r)
    total = len(results)

    print(f"\n总计: {passed}/{total} 通过")

    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
