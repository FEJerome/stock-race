"""
News Service 主入口

集成事件总线SDK和健康检查SDK，实现：
1. 订阅行情异动事件，触发新闻采集
2. 发布新闻情报事件，供Trading AI订阅
3. 健康检查和降级运行模式
4. 自动恢复机制
"""

import sys
from pathlib import Path

# 添加SDK到Python路径
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))
sys.path.insert(0, str(project_root / "infra" / "health-check" / "src"))

import asyncio
import signal
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum
import logging

# 事件总线SDK
from event_bus import (
    EventBusClient, EventProducer, EventConsumer,
    EventSchema, EventType
)
from event_bus.exceptions import ConnectionError, PublishError

# 健康检查SDK
from health_check import HealthChecker, HealthStatus

# News Service内部模块
from news_service.core.config import settings
from news_service.collectors.news.sina_finance import SinaFinanceCollector
# 注意：eastmoney_finance采集器尚未实现，使用占位符
class EastmoneyFinanceCollector:
    pass
from news_service.collectors.social.weibo_hot import WeiboHotCollector
from news_service.collectors.social.xueqiu import XueqiuCollector
from news_service.collectors.social.eastmoney_guba import EastMoneyGubaCollector as EastmoneyGubaCollector

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ServiceMode(Enum):
    """服务运行模式"""
    NORMAL = "normal"           # 正常运行
    DEGRADED = "degraded"       # 降级运行
    MAINTENANCE = "maintenance" # 维护模式
    INITIALIZING = "initializing" # 初始化中


class NewsService:
    """News Service主类"""

    def __init__(self):
        self.event_bus_client: Optional[EventBusClient] = None
        self.event_producer: Optional[EventProducer] = None
        self.event_consumer: Optional[EventConsumer] = None
        self.is_running = False

        # 服务运行模式
        self.mode = ServiceMode.INITIALIZING
        self._mode_lock = asyncio.Lock()

        # 健康检查器
        self.health_checker: Optional[HealthChecker] = None
        self._health_check_task: Optional[asyncio.Task] = None

        # 采集器实例
        self.collectors = {
            'sina': SinaFinanceCollector(),
            'eastmoney': EastmoneyFinanceCollector(),
            'weibo': WeiboHotCollector(),
            'xueqiu': XueqiuCollector(),
            'guba': EastmoneyGubaCollector(),
        }

        # 降级模式配置
        self._degraded_config = {
            'use_cache': True,          # 使用缓存数据
            'disable_ai_analysis': True, # 禁用AI分析
            'limited_sources': ['sina', 'eastmoney'],  # 限制数据源
        }

        # 恢复检测配置
        self._recovery_check_interval = 30  # 恢复检测间隔（秒）
        self._recovery_task: Optional[asyncio.Task] = None

    async def initialize(self):
        """初始化服务"""
        try:
            logger.info("News Service初始化中...")

            # 初始化健康检查器
            await self._init_health_checker()

            # 执行初始健康检查
            health_result = await self.health_checker.check_health()
            logger.info(f"初始健康检查结果: {health_result.status.value}")

            # 根据健康状态设置运行模式
            if health_result.status == HealthStatus.HEALTHY:
                await self._set_mode(ServiceMode.NORMAL)
            elif health_result.status == HealthStatus.DEGRADED:
                await self._set_mode(ServiceMode.DEGRADED)
            else:
                await self._set_mode(ServiceMode.DEGRADED)
                logger.warning("服务处于不健康状态，尝试以降级模式启动")

            # 初始化事件总线（即使失败也不阻止服务启动）
            try:
                await self._init_event_bus()
            except Exception as e:
                logger.error(f"事件总线初始化失败: {e}")
                logger.warning("服务将以降级模式运行，不订阅事件")

            # 启动健康检查任务
            self._health_check_task = asyncio.create_task(
                self._health_check_loop()
            )

            # 启动恢复检测任务
            self._recovery_task = asyncio.create_task(
                self._recovery_loop()
            )

            logger.info("News Service初始化完成")
            logger.info(f"当前运行模式: {self.mode.value}")

        except Exception as e:
            logger.error(f"初始化失败: {e}")
            raise

    async def _init_health_checker(self):
        """初始化健康检查器"""
        self.health_checker = HealthChecker(
            service_name="news-service",
            version="1.0.0",
            check_interval=30
        )

        # 添加Redis依赖检查
        self.health_checker.add_dependency(
            name="redis",
            check_func=self._check_redis,
            is_critical=False,  # Redis非关键依赖，可降级运行
            timeout=5.0,
            retry_count=3
        )

        # 添加DeepSeek API检查（模拟）
        self.health_checker.add_dependency(
            name="deepseek_api",
            check_func=self._check_deepseek_api,
            is_critical=False,  # DeepSeek非关键依赖
            timeout=10.0,
            retry_count=2
        )

        logger.info("健康检查器初始化完成")

    async def _init_event_bus(self):
        """初始化事件总线"""
        # 从Redis URL解析主机和端口
        redis_url = settings.REDIS_URL
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
            db=2
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

        logger.info(f"事件总线连接: {host}:{port}")
        logger.info(f"已订阅事件: {EventType.MARKET_ALERT_PRICE_MOVE.value}")

    def _check_redis(self) -> bool:
        """检查Redis连接"""
        try:
            import redis
            r = redis.from_url(settings.REDIS_URL)
            return r.ping()
        except Exception as e:
            logger.debug(f"Redis检查失败: {e}")
            return False

    def _check_deepseek_api(self) -> bool:
        """检查DeepSeek API（模拟）"""
        # 实际实现应调用DeepSeek API健康检查端点
        # 这里简化处理，假设API可用
        return True

    async def _set_mode(self, mode: ServiceMode):
        """设置服务运行模式"""
        async with self._mode_lock:
            old_mode = self.mode
            self.mode = mode

            if old_mode != mode:
                logger.info(f"服务模式切换: {old_mode.value} -> {mode.value}")

                if mode == ServiceMode.DEGRADED:
                    logger.warning("服务进入降级模式，部分功能受限")
                elif mode == ServiceMode.NORMAL:
                    logger.info("服务恢复正常模式")

    async def _health_check_loop(self):
        """健康检查循环"""
        while self.is_running:
            try:
                result = await self.health_checker.check_health()

                # 根据健康状态调整运行模式
                if result.status == HealthStatus.HEALTHY:
                    if self.mode == ServiceMode.DEGRADED:
                        # 健康恢复，但等待恢复检测任务处理
                        pass
                elif result.status == HealthStatus.DEGRADED:
                    if self.mode == ServiceMode.NORMAL:
                        await self._set_mode(ServiceMode.DEGRADED)
                elif result.status == HealthStatus.UNHEALTHY:
                    if self.mode != ServiceMode.DEGRADED:
                        await self._set_mode(ServiceMode.DEGRADED)

                await asyncio.sleep(30)  # 每30秒检查一次
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"健康检查循环错误: {e}")
                await asyncio.sleep(30)

    async def _recovery_loop(self):
        """恢复检测循环"""
        while self.is_running:
            try:
                # 只有在降级模式下才检测恢复
                if self.mode == ServiceMode.DEGRADED:
                    logger.debug("检测依赖服务恢复...")

                    # 执行健康检查
                    result = await self.health_checker.check_health()

                    if result.status == HealthStatus.HEALTHY:
                        logger.info("依赖服务已恢复，尝试切换到正常模式")

                        # 尝试重新初始化事件总线
                        try:
                            if not self.event_bus_client:
                                await self._init_event_bus()
                                if self.event_consumer:
                                    await self.event_consumer.start()

                            await self._set_mode(ServiceMode.NORMAL)
                            logger.info("服务已成功恢复到正常模式")
                        except Exception as e:
                            logger.error(f"恢复失败: {e}")

                await asyncio.sleep(self._recovery_check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"恢复检测循环错误: {e}")
                await asyncio.sleep(self._recovery_check_interval)

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
        支持降级模式下的采集策略调整
        """
        logger.info(f"开始采集 {symbol} 的相关新闻...")

        # 根据运行模式调整采集策略
        if self.mode == ServiceMode.DEGRADED:
            # 降级模式：限制数据源，禁用AI分析
            sources = self._degraded_config['limited_sources']
            logger.info(f"降级模式：仅使用有限数据源 {sources}")
        else:
            # 根据异动级别决定采集策略
            if severity == "high":
                sources = ['sina', 'eastmoney', 'weibo', 'xueqiu', 'guba']
            elif severity == "medium":
                sources = ['sina', 'eastmoney', 'xueqiu']
            else:
                sources = ['sina', 'eastmoney']

        for source in sources:
            try:
                collector = self.collectors.get(source)
                if collector:
                    logger.info(f"从 {source} 采集 {symbol} 的新闻")
                    # 实际采集逻辑...
                    # news_items = await collector.collect(symbol=symbol)

                    # 降级模式下跳过AI分析
                    if self.mode == ServiceMode.DEGRADED and self._degraded_config['disable_ai_analysis']:
                        logger.debug("降级模式：跳过AI情感分析")

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
        logger.info(f"当前模式: {self.mode.value}")

        # 启动事件消费者（仅在正常模式下）
        if self.event_consumer and self.mode == ServiceMode.NORMAL:
            try:
                await self.event_consumer.start()
                logger.info("事件消费者已启动")
            except Exception as e:
                logger.error(f"事件消费者启动失败: {e}")
                await self._set_mode(ServiceMode.DEGRADED)

        logger.info("News Service已启动")

        # 保持运行
        while self.is_running:
            await asyncio.sleep(1)

    async def stop(self):
        """停止News Service"""
        self.is_running = False
        logger.info("News Service停止中...")

        # 停止健康检查任务
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass

        # 停止恢复检测任务
        if self._recovery_task:
            self._recovery_task.cancel()
            try:
                await self._recovery_task
            except asyncio.CancelledError:
                pass

        # 停止事件消费者
        if self.event_consumer:
            try:
                await self.event_consumer.stop()
            except Exception as e:
                logger.error(f"停止事件消费者失败: {e}")

        # 关闭事件总线客户端
        if self.event_bus_client:
            try:
                await self.event_bus_client.close()
            except Exception as e:
                logger.error(f"关闭事件总线失败: {e}")

        logger.info("News Service已停止")

    def get_health_status(self) -> Dict[str, Any]:
        """获取健康状态"""
        if self.health_checker:
            return self.health_checker.to_dict()
        return {"status": "unknown", "message": "Health checker not initialized"}

    def get_service_mode(self) -> str:
        """获取当前服务运行模式"""
        return self.mode.value


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
