"""
News Service 主入口

集成事件总线SDK，实现：
1. 订阅行情异动事件，触发新闻采集
2. 发布新闻情报事件，供Trading AI订阅
"""

import sys
from pathlib import Path

# 添加事件总线SDK到Python路径
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))

import asyncio
import signal
from datetime import datetime
from typing import Dict, Any, Optional
import logging

# 事件总线SDK
from event_bus import (
    EventBusClient, EventProducer, EventConsumer,
    EventSchema, EventType
)
from event_bus.exceptions import ConnectionError, PublishError

# News Service内部模块
from news_service.core.config import settings
from news_service.collectors.news.sina_finance import SinaFinanceCollector
from news_service.collectors.news.eastmoney_finance import EastmoneyFinanceCollector
from news_service.collectors.social.weibo_hot import WeiboHotCollector
from news_service.collectors.social.xueqiu import XueqiuCollector
from news_service.collectors.social.eastmoney_guba import EastmoneyGubaCollector

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class NewsService:
    """News Service主类"""

    def __init__(self):
        self.event_bus_client: Optional[EventBusClient] = None
        self.event_producer: Optional[EventProducer] = None
        self.event_consumer: Optional[EventConsumer] = None
        self.is_running = False

        # 采集器实例
        self.collectors = {
            'sina': SinaFinanceCollector(),
            'eastmoney': EastmoneyFinanceCollector(),
            'weibo': WeiboHotCollector(),
            'xueqiu': XueqiuCollector(),
            'guba': EastmoneyGubaCollector(),
        }

    async def initialize(self):
        """初始化事件总线连接"""
        try:
            # 从Redis URL解析主机和端口
            redis_url = settings.REDIS_URL
            # 默认使用redis://localhost:6379/2格式
            if "redis://" in redis_url:
                parts = redis_url.replace("redis://", "").split(":")
                host = parts[0]
                port = int(parts[1].split("/")[0]) if len(parts) > 1 else 6379
            else:
                host = "localhost"
                port = 6379

            # 创建事件总线客户端
            self.event_bus_client = EventBusClient(
                host=host,
                port=port,
                db=2  # 使用db2作为News Service专用
            )

            # 创建事件生产者
            self.event_producer = EventProducer(
                client=self.event_bus_client,
                service_name="news-service"
            )

            # 创建事件消费者
            self.event_consumer = EventConsumer(
                client=self.event_bus_client,
                service_name="news-service",
                consumer_group="news-trigger-group"
            )

            # 订阅行情异动事件
            self.event_consumer.subscribe(
                EventType.MARKET_ALERT_PRICE_MOVE,
                self._handle_price_alert
            )

            logger.info("News Service初始化完成")
            logger.info(f"事件总线连接: {host}:{port}")
            logger.info(f"已订阅事件: {EventType.MARKET_ALERT_PRICE_MOVE.value}")

        except Exception as e:
            logger.error(f"初始化失败: {e}")
            raise

    async def _handle_price_alert(self, event: EventSchema):
        """
        处理行情异动事件

        当收到价格异动告警时，触发相关新闻采集
        """
        try:
            payload = event.payload
            symbol = payload.get("symbol")
            alert_type = payload.get("alert_type")
            severity = payload.get("severity")

            logger.info(f"收到行情异动事件: {symbol}, 类型: {alert_type}, 级别: {severity}")

            # 触发新闻采集
            await self._trigger_news_collection(symbol, alert_type, severity)

        except Exception as e:
            logger.error(f"处理行情异动事件失败: {e}")

    async def _trigger_news_collection(self, symbol: str, alert_type: str, severity: str):
        """
        触发新闻采集

        根据股票代码和异动类型，采集相关新闻
        """
        logger.info(f"开始采集 {symbol} 的相关新闻...")

        # 根据异动级别决定采集策略
        if severity == "high":
            # 高级别异动：采集所有数据源
            sources = ['sina', 'eastmoney', 'weibo', 'xueqiu', 'guba']
        elif severity == "medium":
            # 中级别异动：采集主要数据源
            sources = ['sina', 'eastmoney', 'xueqiu']
        else:
            # 低级别异动：仅采集主要财经新闻
            sources = ['sina', 'eastmoney']

        for source in sources:
            try:
                collector = self.collectors.get(source)
                if collector:
                    # 这里应该调用具体的采集方法
                    logger.info(f"从 {source} 采集 {symbol} 的新闻")
                    # 实际采集逻辑...
                    # news_items = await collector.collect(symbol=symbol)

            except Exception as e:
                logger.error(f"从 {source} 采集失败: {e}")

    async def publish_intelligence_event(
        self,
        stock_code: str,
        intelligence: str,
        sentiment: str,
        confidence: float = 0.0,
        source: str = "deepseek"
    ):
        """
        发布新闻情报事件

        当新闻情报提取完成后，发布事件供Trading AI订阅

        Args:
            stock_code: 股票代码
            intelligence: 情报摘要
            sentiment: 情感类型 (positive/negative/neutral)
            confidence: 置信度
            source: 情报来源
        """
        try:
            event = EventSchema(
                event_type=EventType.NEWS_INTELLIGENCE_EXTRACTED,
                source="news-service",
                payload={
                    "stock_code": stock_code,
                    "intelligence": intelligence,
                    "sentiment": sentiment,
                    "confidence": confidence,
                    "source": source,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )

            await self.event_producer.publish_event(event)
            logger.info(f"发布情报事件: {stock_code}, 情感: {sentiment}")

        except PublishError as e:
            logger.error(f"发布情报事件失败: {e}")
        except Exception as e:
            logger.error(f"发布情报事件时发生错误: {e}")

    async def publish_sentiment_change_event(
        self,
        stock_code: str,
        old_sentiment: str,
        new_sentiment: str,
        change_reason: str
    ):
        """
        发布情感变化事件

        当股票情感分析结果发生显著变化时发布
        """
        try:
            event = EventSchema(
                event_type=EventType.NEWS_SENTIMENT_CHANGED,
                source="news-service",
                payload={
                    "stock_code": stock_code,
                    "old_sentiment": old_sentiment,
                    "new_sentiment": new_sentiment,
                    "change_reason": change_reason,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )

            await self.event_producer.publish_event(event)
            logger.info(f"发布情感变化事件: {stock_code}, {old_sentiment} -> {new_sentiment}")

        except Exception as e:
            logger.error(f"发布情感变化事件失败: {e}")

    async def start(self):
        """启动News Service"""
        self.is_running = True
        logger.info("News Service启动中...")

        # 启动事件消费者
        if self.event_consumer:
            await self.event_consumer.start()

        logger.info("News Service已启动")

        # 保持运行
        while self.is_running:
            await asyncio.sleep(1)

    async def stop(self):
        """停止News Service"""
        self.is_running = False
        logger.info("News Service停止中...")

        if self.event_consumer:
            await self.event_consumer.stop()

        if self.event_bus_client:
            await self.event_bus_client.close()

        logger.info("News Service已停止")


async def main():
    """主入口函数"""
    service = NewsService()

    # 信号处理
    def signal_handler(sig, frame):
        logger.info("收到停止信号...")
        asyncio.create_task(service.stop())

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # 初始化
        await service.initialize()

        # 启动服务
        await service.start()

    except Exception as e:
        logger.error(f"服务运行错误: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
