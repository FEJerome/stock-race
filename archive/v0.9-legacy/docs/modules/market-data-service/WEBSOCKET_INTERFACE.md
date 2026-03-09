# Market Data Service - WebSocket接口文档

> 本文档定义 Market Data Service 的 WebSocket 实时数据推送协议。
> 供 Frontend、Miniprogram 等消费方参考联调。
> 最后更新：2026-02-12

---

## 目录

1. [概述](#概述)
2. [连接信息](#连接信息)
3. [消息格式](#消息格式)
4. [客户端→服务端消息](#客户端服务端消息)
5. [服务端→客户端消息](#服务端客户端消息)
6. [限流说明](#限流说明)
7. [错误处理](#错误处理)
8. [连接示例](#连接示例)

---

## 概述

Market Data Service 提供 WebSocket 实时行情推送服务，支持：

- **公开访问**: 无需 JWT 认证即可连接
- **股票订阅**: 订阅特定股票代码接收实时推送
- **批量订阅**: 支持一次性订阅多只股票
- **自动推送**: 订阅股票行情每10秒自动推送

---

## 连接信息

| 属性 | 值 |
|------|-----|
| **端点** | `ws://localhost:8001/ws/realtime` (开发) |
| **端点** | `wss://market-data.example.com/ws/realtime` (生产) |
| **协议** | WebSocket (RFC 6455) |
| **子协议** | 无 |
| **认证** | 无需认证 |
| **心跳** | 客户端应定期发送 `ping` 消息 |

---

## 消息格式

所有消息采用 JSON 格式，基本结构：

```json
{
  "type": "message_type",
  "data": { ... }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 消息类型 |
| `data` | object | 是 | 消息数据 |

---

## 客户端→服务端消息

### 1. 订阅消息 (subscribe)

订阅一个或多个股票代码的行情推送。

**消息格式**:

```json
{
  "action": "subscribe",
  "symbols": ["000001.SZ", "000002.SZ", "600000.SH"]
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | string | 是 | 固定为 `"subscribe"` |
| `symbols` | array | 是 | 股票代码列表，最多50只 |

**响应消息**:

```json
{
  "type": "subscription_confirmed",
  "data": {
    "symbols": ["000001.SZ", "000002.SZ"],
    "requested_count": 3,
    "subscribed_count": 2,
    "message": "Subscribed to 2 symbols",
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

**错误响应**:

```json
{
  "type": "error",
  "data": {
    "message": "No valid symbols provided",
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

---

### 2. 取消订阅消息 (unsubscribe)

取消订阅一个或多个股票代码。

**消息格式**:

```json
{
  "action": "unsubscribe",
  "symbols": ["000001.SZ"]
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | string | 是 | 固定为 `"unsubscribe"` |
| `symbols` | array | 否 | 股票代码列表，为空则取消所有订阅 |

**取消所有订阅**:

```json
{
  "action": "unsubscribe",
  "symbols": []
}
```

**响应消息**:

```json
{
  "type": "unsubscription_confirmed",
  "data": {
    "symbols": ["000001.SZ"],
    "message": "Unsubscribed from 1 symbols",
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

---

### 3. 心跳消息 (ping)

保持连接活跃的心跳消息。

**消息格式**:

```json
{
  "action": "ping"
}
```

**响应消息**:

```json
{
  "type": "pong",
  "data": {
    "timestamp": "2026-02-12T10:00:00.000000",
    "message": "pong"
  }
}
```

**建议**: 客户端每 30 秒发送一次 ping 消息保持连接。

---

### 4. 获取订阅列表 (get_subscriptions)

获取当前连接的所有订阅。

**消息格式**:

```json
{
  "action": "get_subscriptions"
}
```

**响应消息**:

```json
{
  "type": "subscriptions",
  "data": {
    "subscriptions": ["000001.SZ", "000002.SZ"],
    "count": 2,
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

---

### 5. 获取统计信息 (get_stats)

获取 WebSocket 服务的统计信息。

**消息格式**:

```json
{
  "action": "get_stats"
}
```

**响应消息**:

```json
{
  "type": "stats",
  "data": {
    "connection_stats": {
      "total_connections": 150,
      "total_clients": 120,
      "total_subscriptions": 450
    },
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

---

## 服务端→客户端消息

### 1. 行情推送 (quote_update)

订阅股票的实时行情推送，每10秒推送一次。

**消息格式**:

```json
{
  "type": "quote_update",
  "data": {
    "symbol": "000001.SZ",
    "quote": {
      "symbol": "000001.SZ",
      "name": "平安银行",
      "price": 12.58,
      "change": 0.52,
      "change_percent": 4.31,
      "volume": 152345678,
      "amount": 1916500000,
      "open": 12.10,
      "high": 12.85,
      "low": 12.05,
      "prev_close": 12.06,
      "bid_price": 12.57,
      "ask_price": 12.58,
      "timestamp": "2026-02-12T10:00:00.000000"
    },
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `symbol` | string | 股票代码 |
| `name` | string | 股票名称 |
| `price` | float | 当前价格 |
| `change` | float | 涨跌额 |
| `change_percent` | float | 涨跌幅百分比 |
| `volume` | int | 成交量（股） |
| `amount` | float | 成交额（元） |
| `open` | float | 开盘价 |
| `high` | float | 最高价 |
| `low` | float | 最低价 |
| `prev_close` | float | 昨收价 |
| `bid_price` | float | 买一价 |
| `ask_price` | float | 卖一价 |
| `timestamp` | string | 时间戳 |

---

### 2. 连接确认 (connection)

连接建立后服务端发送的欢迎消息。

**消息格式**:

```json
{
  "type": "connection",
  "data": {
    "client_id": "client_123456789",
    "message": "Connected to real-time stock data service",
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

---

### 3. 系统消息 (system_*)

系统级别的通知消息。

**系统关闭通知**:

```json
{
  "type": "system_shutdown",
  "data": {
    "message": "Real-time service is shutting down",
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

---

### 4. 错误消息 (error)

当请求处理出错时返回。

**消息格式**:

```json
{
  "type": "error",
  "data": {
    "message": "Invalid symbol format",
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

**常见错误**:

| 错误消息 | 说明 |
|---------|------|
| `No symbols provided for subscription` | 订阅时未提供股票代码 |
| `No valid symbols provided` | 提供的股票代码格式无效 |
| `Unknown message type: xxx` | 未知的消息类型 |
| `Connection limit exceeded` | 连接数超限 |

---

## 限流说明

### 订阅数量限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| **单连接最大订阅数** | 50只 | 每个WebSocket连接最多订阅50只股票 |
| **订阅超限处理** | 截断 | 超出部分自动忽略，返回实际订阅数量 |

**超限响应示例**:

```json
{
  "type": "subscription_confirmed",
  "data": {
    "symbols": ["000001.SZ", "000002.SZ", ..., "000050.SZ"],
    "requested_count": 60,
    "subscribed_count": 50,
    "message": "Subscribed to 50 symbols (10 symbols exceeded limit)",
    "timestamp": "2026-02-12T10:00:00.000000"
  }
}
```

### 连接数限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| **单IP最大连接数** | 10 | 同一IP地址最多10个并发连接 |
| **全局最大连接数** | 10000 | 服务全局最多10000个并发连接 |

### 消息频率限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| **客户端消息频率** | 100条/分钟 | 单连接每分钟最多发送100条消息 |
| **超出处理** | 断开连接 | 频率超限将强制断开连接 |

---

## 错误处理

### 连接错误

| 错误码 | 说明 | 处理建议 |
|--------|------|---------|
| `1006` | 连接异常关闭 | 检查网络，自动重连 |
| `1011` | 服务器错误 | 稍后重试 |
| `1013` | 服务重启 | 等待5秒后重连 |
| `1008` | 消息格式错误 | 检查消息格式 |

### 重连策略

```javascript
const RECONNECT_CONFIG = {
  maxRetries: 5,           // 最大重试次数
  initialDelay: 1000,      // 初始重试间隔（毫秒）
  maxDelay: 30000,         // 最大重试间隔（毫秒）
  backoffMultiplier: 2     // 指数退避倍数
};
```

**重连步骤**:
1. 连接断开时立即触发重连
2. 首次重连等待 1 秒
3. 每次失败后等待时间翻倍（最多30秒）
4. 超过最大重试次数后停止重连

---

## 连接示例

### JavaScript 客户端示例

```javascript
class MarketDataWebSocket {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.subscriptions = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      // 恢复之前的订阅
      if (this.subscriptions.size > 0) {
        this.subscribe(Array.from(this.subscriptions));
      }
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      this.reconnect();
    };
  }

  subscribe(symbols) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        symbols: symbols
      }));
      symbols.forEach(s => this.subscriptions.add(s));
    }
  }

  unsubscribe(symbols) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'unsubscribe',
        symbols: symbols
      }));
      symbols.forEach(s => this.subscriptions.delete(s));
    }
  }

  ping() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'ping' }));
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'quote_update':
        console.log('Quote update:', message.data);
        break;
      case 'subscription_confirmed':
        console.log('Subscription confirmed:', message.data);
        break;
      case 'error':
        console.error('Error:', message.data.message);
        break;
      case 'pong':
        console.log('Heartbeat received');
        break;
    }
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    }
  }

  disconnect() {
    this.ws?.close();
  }
}

// 使用示例
const client = new MarketDataWebSocket('ws://localhost:8001/ws/realtime');
client.connect();

// 订阅股票
setTimeout(() => {
  client.subscribe(['000001.SZ', '000002.SZ', '600000.SH']);
}, 1000);

// 定期心跳
setInterval(() => {
  client.ping();
}, 30000);
```

### Python 客户端示例

```python
import asyncio
import json
import websockets

class MarketDataWebSocket:
    def __init__(self, url):
        self.url = url
        self.websocket = None
        self.subscriptions = set()

    async def connect(self):
        self.websocket = await websockets.connect(self.url)
        asyncio.create_task(self.receive_messages())

    async def subscribe(self, symbols):
        await self.websocket.send(json.dumps({
            "action": "subscribe",
            "symbols": symbols
        }))
        self.subscriptions.update(symbols)

    async def unsubscribe(self, symbols):
        await self.websocket.send(json.dumps({
            "action": "unsubscribe",
            "symbols": symbols
        }))
        for symbol in symbols:
            self.subscriptions.discard(symbol)

    async def ping(self):
        await self.websocket.send(json.dumps({"action": "ping"}))

    async def receive_messages(self):
        async for message in self.websocket:
            data = json.loads(message)
            self.handle_message(data)

    def handle_message(self, message):
        msg_type = message.get("type")
        if msg_type == "quote_update":
            print(f"Quote: {message['data']['symbol']} = {message['data']['quote']['price']}")
        elif msg_type == "error":
            print(f"Error: {message['data']['message']}")

    async def close(self):
        await self.websocket.close()

# 使用示例
async def main():
    client = MarketDataWebSocket("ws://localhost:8001/ws/realtime")
    await client.connect()
    await client.subscribe(["000001.SZ", "000002.SZ"])

    # 保持运行
    await asyncio.sleep(60)
    await client.close()

asyncio.run(main())
```

### 微信小程序示例

```javascript
// app.js 或页面逻辑
Page({
  data: {
    socketOpen: false,
    quotes: {}
  },

  onLoad() {
    this.connectWebSocket();
  },

  connectWebSocket() {
    const socket = wx.connectSocket({
      url: 'wss://market-data.example.com/ws/realtime'
    });

    socket.onOpen(() => {
      console.log('WebSocket connected');
      this.setData({ socketOpen: true });
      this.subscribe(['000001.SZ', '000002.SZ']);
    });

    socket.onMessage((res) => {
      const message = JSON.parse(res.data);
      this.handleMessage(message);
    });

    socket.onError((err) => {
      console.error('WebSocket error:', err);
    });

    socket.onClose(() => {
      console.log('WebSocket closed');
      this.setData({ socketOpen: false });
      // 自动重连
      setTimeout(() => this.connectWebSocket(), 3000);
    });

    this.socket = socket;
  },

  subscribe(symbols) {
    if (this.data.socketOpen) {
      this.socket.send({
        data: JSON.stringify({
          action: 'subscribe',
          symbols: symbols
        })
      });
    }
  },

  handleMessage(message) {
    if (message.type === 'quote_update') {
      const { symbol, quote } = message.data;
      this.setData({
        [`quotes.${symbol}`]: quote
      });
    }
  },

  onUnload() {
    this.socket?.close();
  }
});
```

---

## 附录

### A. 股票代码格式

| 市场 | 代码格式 | 示例 |
|------|---------|------|
| 深圳A股 | `{6位数字}.SZ` | `000001.SZ`, `000002.SZ` |
| 上海A股 | `{6位数字}.SH` | `600000.SH`, `600001.SH` |
| 创业板 | `{6位数字}.SZ` | `300001.SZ` |
| 科创板 | `{6位数字}.SH` | `688001.SH` |
| 北交所 | `{6位数字}.BJ` | `430001.BJ` |

### B. 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-02-12 | v1.0 | 初始版本，定义WebSocket协议 |

### C. 相关文档

- [EVENT_INTERFACE.md](./EVENT_INTERFACE.md) - 事件接口文档
- [TODO.md](./TODO.md) - 开发进度
- [HAVE_DONE.md](./HAVE_DONE.md) - 已完成功能

---

*文档版本: v1.0*
*最后更新: 2026-02-12*
*维护者: Market Data Service 开发团队*
