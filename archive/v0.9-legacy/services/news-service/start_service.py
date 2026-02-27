#!/usr/bin/env python3
"""
News Service 启动脚本

用于启动News Service服务，支持正常模式和降级模式
"""

import sys
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))
sys.path.insert(0, str(project_root / "infra" / "health-check" / "src"))
sys.path.insert(0, str(Path(__file__).parent / "src"))

import asyncio
import signal
import argparse
import logging

from news_service.main import NewsService, ServiceMode

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='News Service 启动脚本')
    parser.add_argument(
        '--mode',
        choices=['normal', 'degraded', 'auto'],
        default='auto',
        help='启动模式: normal=正常, degraded=降级, auto=自动检测(默认)'
    )
    parser.add_argument(
        '--check-interval',
        type=int,
        default=30,
        help='健康检查间隔（秒），默认30秒'
    )
    parser.add_argument(
        '--recovery-interval',
        type=int,
        default=30,
        help='恢复检测间隔（秒），默认30秒'
    )

    args = parser.parse_args()

    service = NewsService()

    # 设置恢复检测间隔
    service._recovery_check_interval = args.recovery_interval

    # 信号处理
    def signal_handler(sig, frame):
        logger.info(f"收到信号 {sig}，正在停止服务...")
        asyncio.create_task(service.stop())

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # 初始化
        logger.info("=" * 60)
        logger.info("News Service 启动中...")
        logger.info("=" * 60)

        await service.initialize()

        # 如果指定了强制模式，覆盖自动检测结果
        if args.mode == 'normal':
            await service._set_mode(ServiceMode.NORMAL)
            logger.info("强制使用正常模式启动")
        elif args.mode == 'degraded':
            await service._set_mode(ServiceMode.DEGRADED)
            logger.info("强制使用降级模式启动")

        # 打印启动信息
        logger.info("-" * 60)
        logger.info(f"服务名称: news-service")
        logger.info(f"运行模式: {service.mode.value}")
        logger.info(f"健康状态: {service.get_health_status()['status']}")
        logger.info(f"健康检查间隔: {args.check_interval}秒")
        logger.info(f"恢复检测间隔: {args.recovery_interval}秒")
        logger.info("-" * 60)

        # 启动服务
        await service.start()

    except Exception as e:
        logger.error(f"服务启动失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
