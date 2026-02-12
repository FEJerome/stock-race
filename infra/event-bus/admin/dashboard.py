#!/usr/bin/env python3
"""
事件总线管理后台

功能：
- 查看事件流列表
- 查看消费者组状态
- 查看消息堆积情况
- 实时监控Dashboard

使用方式：
    python dashboard.py

访问地址：http://localhost:8080
"""

import asyncio
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
import redis.asyncio as aioredis
from aiohttp import web


class EventBusDashboard:
    """事件总线管理后台"""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self.redis: Optional[aioredis.Redis] = None

    async def connect(self):
        """连接Redis"""
        self.redis = await aioredis.from_url(self.redis_url)

    async def get_streams(self) -> List[Dict[str, Any]]:
        """获取所有事件流"""
        streams = []
        try:
            # 扫描所有流
            cursor = 0
            while True:
                cursor, keys = await self.redis.scan(cursor, match="event-bus:*", count=100)
                for key in keys:
                    key_str = key.decode() if isinstance(key, bytes) else key
                    try:
                        info = await self.redis.xinfo_stream(key_str)
                        groups = await self.redis.xinfo_groups(key_str)
                        streams.append({
                            "name": key_str,
                            "length": info.get("length", 0),
                            "pending": info.get("pending", 0),
                            "groups": len(groups),
                            "last_generated_id": info.get("last-generated-id", "0-0"),
                            "first_entry": str(info.get("first-entry", "")),
                            "last_entry": str(info.get("last-entry", ""))
                        })
                    except Exception as e:
                        print(f"获取流 {key_str} 信息失败: {e}")

                if cursor == 0:
                    break

        except Exception as e:
            print(f"获取流列表失败: {e}")

        return streams

    async def get_consumer_groups(self, stream_name: str) -> List[Dict[str, Any]]:
        """获取消费者组信息"""
        groups = []
        try:
            raw_groups = await self.redis.xinfo_groups(stream_name)
            for group in raw_groups:
                group_name = group.get("name")
                if isinstance(group_name, bytes):
                    group_name = group_name.decode()

                # 获取消费者信息
                consumers = await self.redis.xinfo_consumers(stream_name, group_name)
                consumer_list = []
                for consumer in consumers:
                    consumer_list.append({
                        "name": consumer.get("name", "").decode() if isinstance(consumer.get("name"), bytes) else consumer.get("name", ""),
                        "pending": consumer.get("pending", 0),
                        "idle": consumer.get("idle", 0)
                    })

                groups.append({
                    "name": group_name,
                    "consumers": len(consumers),
                    "pending": group.get("pending", 0),
                    "last_delivered_id": group.get("last-delivered-id", "").decode() if isinstance(group.get("last-delivered-id"), bytes) else group.get("last-delivered-id", ""),
                    "lag": group.get("lag", 0),
                    "consumer_list": consumer_list
                })
        except Exception as e:
            print(f"获取消费者组失败: {e}")

        return groups

    async def get_pending_messages(self, stream_name: str, group_name: str, count: int = 10) -> List[Dict[str, Any]]:
        """获取待处理消息"""
        messages = []
        try:
            pending = await self.redis.xpending_range(stream_name, group_name, "-", "+", count)
            for item in pending:
                messages.append({
                    "message_id": item.get("message_id", "").decode() if isinstance(item.get("message_id"), bytes) else item.get("message_id", ""),
                    "consumer": item.get("consumer", "").decode() if isinstance(item.get("consumer"), bytes) else item.get("consumer", ""),
                    "time_since_delivered": item.get("time_since_delivered", 0),
                    "delivery_count": item.get("delivery_count", 0)
                })
        except Exception as e:
            print(f"获取待处理消息失败: {e}")

        return messages

    async def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        try:
            info = await self.redis.info()
            return {
                "redis_version": info.get("redis_version", "unknown"),
                "used_memory_human": info.get("used_memory_human", "unknown"),
                "connected_clients": info.get("connected_clients", 0),
                "total_commands_processed": info.get("total_commands_processed", 0),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
                "uptime_in_seconds": info.get("uptime_in_seconds", 0)
            }
        except Exception as e:
            return {"error": str(e)}


# HTML Dashboard
def get_dashboard_html() -> str:
    """获取Dashboard HTML"""
    return """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>事件总线管理后台</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .header h1 { font-size: 24px; margin-bottom: 5px; }
        .header p { opacity: 0.9; }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-card h3 {
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
        }
        .stat-card .value {
            font-size: 28px;
            font-weight: bold;
            color: #667eea;
        }
        .section {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .section h2 {
            font-size: 18px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #f0f0f0;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #666;
        }
        tr:hover { background: #f8f9fa; }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .badge-success { background: #d4edda; color: #155724; }
        .badge-warning { background: #fff3cd; color: #856404; }
        .badge-danger { background: #f8d7da; color: #721c24; }
        .refresh-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-btn:hover { background: #5568d3; }
        .loading { text-align: center; padding: 40px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>事件总线管理后台</h1>
        <p>实时监控事件流、消费者组和消息堆积情况</p>
    </div>

    <div class="container">
        <div style="text-align: right; margin-bottom: 20px;">
            <button class="refresh-btn" onclick="loadData()">刷新数据</button>
        </div>

        <div class="stats-grid" id="stats">
            <div class="loading">加载中...</div>
        </div>

        <div class="section">
            <h2>事件流列表</h2>
            <table id="streams-table">
                <thead>
                    <tr>
                        <th>流名称</th>
                        <th>消息总数</th>
                        <th>待处理</th>
                        <th>消费者组</th>
                        <th>最后消息ID</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>

        <div class="section">
            <h2>Redis 状态</h2>
            <table id="redis-stats">
                <thead>
                    <tr>
                        <th>指标</th>
                        <th>值</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    </div>

    <script>
        async function loadData() {
            try {
                // 加载流列表
                const streamsRes = await fetch('/api/streams');
                const streams = await streamsRes.json();
                renderStreams(streams);

                // 加载统计
                const statsRes = await fetch('/api/stats');
                const stats = await statsRes.json();
                renderStats(stats, streams);

                // 加载Redis状态
                renderRedisStats(stats);
            } catch (error) {
                console.error('加载数据失败:', error);
                alert('加载数据失败: ' + error.message);
            }
        }

        function renderStreams(streams) {
            const tbody = document.querySelector('#streams-table tbody');
            tbody.innerHTML = streams.map(s => `
                <tr>
                    <td>${s.name}</td>
                    <td>${s.length.toLocaleString()}</td>
                    <td>
                        <span class="badge ${s.pending > 100 ? 'badge-danger' : s.pending > 10 ? 'badge-warning' : 'badge-success'}">
                            ${s.pending.toLocaleString()}
                        </span>
                    </td>
                    <td>${s.groups}</td>
                    <td>${s.last_generated_id}</td>
                </tr>
            `).join('');
        }

        function renderStats(stats, streams) {
            const totalStreams = streams.length;
            const totalPending = streams.reduce((sum, s) => sum + s.pending, 0);
            const totalGroups = streams.reduce((sum, s) => sum + s.groups, 0);

            document.getElementById('stats').innerHTML = `
                <div class="stat-card">
                    <h3>事件流数量</h3>
                    <div class="value">${totalStreams}</div>
                </div>
                <div class="stat-card">
                    <h3>待处理消息</h3>
                    <div class="value">${totalPending.toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <h3>消费者组</h3>
                    <div class="value">${totalGroups}</div>
                </div>
                <div class="stat-card">
                    <h3>Redis版本</h3>
                    <div class="value">${stats.redis_version || 'N/A'}</div>
                </div>
            `;
        }

        function renderRedisStats(stats) {
            const tbody = document.querySelector('#redis-stats tbody');
            const rows = [
                ['Redis版本', stats.redis_version || 'N/A'],
                ['内存使用', stats.used_memory_human || 'N/A'],
                ['连接客户端', stats.connected_clients || 0],
                ['总命令处理', (stats.total_commands_processed || 0).toLocaleString()],
                ['Keyspace命中', (stats.keyspace_hits || 0).toLocaleString()],
                ['Keyspace未命中', (stats.keyspace_misses || 0).toLocaleString()],
                ['运行时间(秒)', stats.uptime_in_seconds || 0]
            ];

            tbody.innerHTML = rows.map(([key, value]) => `
                <tr>
                    <td>${key}</td>
                    <td>${value}</td>
                </tr>
            `).join('');
        }

        // 页面加载时自动加载数据
        loadData();

        // 每30秒自动刷新
        setInterval(loadData, 30000);
    </script>
</body>
</html>
"""


async def init_app() -> web.Application:
    """初始化Web应用"""
    app = web.Application()
    dashboard = EventBusDashboard()
    await dashboard.connect()
    app['dashboard'] = dashboard

    async def index(request):
        return web.Response(text=get_dashboard_html(), content_type='text/html')

    async def api_streams(request):
        streams = await dashboard.get_streams()
        return web.json_response(streams)

    async def api_stats(request):
        stats = await dashboard.get_stats()
        return web.json_response(stats)

    async def api_groups(request):
        stream_name = request.query.get('stream')
        if not stream_name:
            return web.json_response({"error": "Missing stream parameter"}, status=400)
        groups = await dashboard.get_consumer_groups(stream_name)
        return web.json_response(groups)

    app.router.add_get('/', index)
    app.router.add_get('/api/streams', api_streams)
    app.router.add_get('/api/stats', api_stats)
    app.router.add_get('/api/groups', api_groups)

    return app


async def main():
    """主函数"""
    print("启动事件总线管理后台...")
    print("访问地址: http://localhost:8080")

    app = await init_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, 'localhost', 8080)
    await site.start()

    print("服务已启动，按 Ctrl+C 停止")

    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n服务已停止")
