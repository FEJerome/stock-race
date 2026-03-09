# Market Data Service - 事件接口文档

> 本文档定义 Market Data Service 通过事件总线（Redis Streams）发布的事件格式和规范。
> 供 Backend、Trading AI Service、News Service 等消费方参考联调。
> 最后更新：2026-02-12

---

## 目录

1. [概述](#概述)
2. [事件类型](#事件类型)
3. [事件格式规范](#事件格式规范)
4. [错误码定义](#错误码定义)
5. [重试策略](#重试策略)
6. [消费示例](#消费示例)

---

## 概述

Market Data Service 通过统一事件总线发布以下三类事件：

| 事件类型 | Stream Key | 发布频率 | 消费方 |
|---------|-----------|---------|--------|
| 实时行情 | `market:quote:realtime` | 每10秒 | Backend, Trading AI |
| 价格异动 | `market:alert:price_move` | 触发式 | News Service |
| 技术指标 | `market:indicator:updated` | 每60秒 | Trading AI |

---

## 事件类型

### 1. 实时行情事件 (market:quote:realtime)

**Stream Key**: `market:quote:realtime`

**发布时机**: 每10秒批量发布订阅股票列表的最新行情

**事件格式**:

```json
{
  "event_id": "1707734400000-0",
  "event_type": "market:quote:realtime",
  "source": "market-data",
  "timestamp": "2026-02-12T10:00:00.000Z",
  "payload": {
    "symbol": "000001.SZ",
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
    "timestamp": "2026-02-12T10:00:00.000Z"
  }
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `symbol` | string | 是 | 股票代码，如 "000001.SZ" |
| `price` | float | 是 | 当前价格 |
| `change` | float | 是 | 涨跌额（当前价-昨收） |
| `change_percent` | float | 是 | 涨跌幅百分比 |
| `volume` | int | 是 | 成交量（股） |
| `amount` | float | 否 | 成交额（元） |
| `open` | float | 否 | 开盘价 |
| `high` | float | 否 | 最高价 |
| `low` | float | 否 | 最低价 |
| `prev_close` | float | 否 | 昨收价 |
| `bid_price` | float | 否 | 买一价 |
| `ask_price` | float | 否 | 卖一价 |
| `timestamp` | string | 是 | ISO 8601 格式时间戳 |

---

### 2. 价格异动事件 (market:alert:price_move)

**Stream Key**: `market:alert:price_move`

**发布时机**: 当股票涨跌幅超过阈值（默认7%）时触发

**事件格式**:

```json
{
  "event_id": "1707734400000-1",
  "event_type": "market:alert:price_move",
  "source": "market-data",
  "timestamp": "2026-02-12T10:05:30.000Z",
  "payload": {
    "symbol": "000001.SZ",
    "alert_type": "price_surge",
    "severity": "high",
    "message": "涨幅超过7.5%",
    "prev_close": 12.06,
    "current_price": 12.98,
    "change_percent": 7.50,
    "threshold": 7.0,
    "timestamp": "2026-02-12T10:05:30.000Z"
  }
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `symbol` | string | 是 | 股票代码 |
| `alert_type` | string | 是 | 告警类型：`price_surge`(大涨) / `price_drop`(大跌) |
| `severity` | string | 是 | 严重级别：`high`(>10%) / `medium`(7-10%) |
| `message` | string | 是 | 告警描述信息 |
| `prev_close` | float | 是 | 昨收价 |
| `current_price` | float | 是 | 当前价格 |
| `change_percent` | float | 是 | 涨跌幅百分比 |
| `threshold` | float | 是 | 触发阈值（默认7.0%） |
| `timestamp` | string | 是 | ISO 8601 格式时间戳 |

**限流策略**: 同一股票1分钟内最多触发1次告警

---

### 3. 技术指标事件 (market:indicator:updated)

**Stream Key**: `market:indicator:updated`

**发布时机**: 每60秒计算并发布技术指标更新

**事件格式**:

```json
{
  "event_id": "1707734400000-2",
  "event_type": "market:indicator:updated",
  "source": "market-data",
  "timestamp": "2026-02-12T10:10:00.000Z",
  "payload": {
    "symbol": "000001.SZ",
    "indicators": {
      "rsi": 65.42,
      "macd": {
        "macd_line": 0.1256,
        "signal_line": 0.0892,
        "histogram": 0.0364
      },
      "kdj": {
        "k": 72.35,
        "d": 68.12,
        "j": 80.81
      }
    },
    "signals": {
      "rsi_signal": "neutral",
      "macd_signal": "buy",
      "kdj_signal": "buy"
    },
    "timestamp": "2026-02-12T10:10:00.000Z"
  }
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `symbol` | string | 是 | 股票代码 |
| `indicators` | object | 是 | 技术指标集合 |
| `indicators.rsi` | float | 是 | RSI指标值 (0-100) |
| `indicators.macd` | object | 是 | MACD指标 |
| `indicators.macd.macd_line` | float | 是 | MACD线 |
| `indicators.macd.signal_line` | float | 是 | 信号线 |
| `indicators.macd.histogram` | float | 是 | 柱状图 |
| `indicators.kdj` | object | 是 | KDJ指标 |
| `indicators.kdj.k` | float | 是 | K值 |
| `indicators.kdj.d` | float | 是 | D值 |
| `indicators.kdj.j` | float | 是 | J值 |
| `signals` | object | 否 | 交易信号 |
| `signals.rsi_signal` | string | 否 | RSI信号：`buy`/`sell`/`neutral` |
| `signals.macd_signal` | string | 否 | MACD信号 |
| `signals.kdj_signal` | string | 否 | KDJ信号 |
| `timestamp` | string | 是 | ISO 8601 格式时间戳 |

**信号规则**:
- RSI: <30 超卖(buy), >70 超买(sell), 否则 neutral
- MACD: MACD线>信号线 buy, 反之 sell
- KDJ: J<0 buy, J>100 sell, 否则 neutral

---

## 事件格式规范

### 通用头部字段

所有事件均包含以下通用字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `event_id` | string | 事件唯一ID，格式：`{timestamp}-{sequence}` |
| `event_type` | string | 事件类型标识 |
| `source` | string | 事件来源服务，固定为 "market-data" |
| `timestamp` | string | 事件生成时间，ISO 8601 格式 |
| `payload` | object | 事件具体数据 |

### 数据类型规范

| 类型 | 格式 | 示例 |
|------|------|------|
| string | UTF-8 字符串 | "000001.SZ" |
| float | 保留2-4位小数 | 12.58, 65.42 |
| int | 整数 | 152345678 |
| boolean | true/false | true |
| timestamp | ISO 8601 UTC | "2026-02-12T10:00:00.000Z" |

---

## 错误码定义

### 发布端错误码

| 错误码 | 含义 | 说明 |
|--------|------|------|
| `MKT-001` | Redis连接失败 | 无法连接到Redis服务器 |
| `MKT-002` | 序列化失败 | Payload JSON序列化错误 |
| `MKT-003` | 发布超时 | XADD命令超时（默认5秒） |
| `MKT-004` | Stream满 | 达到最大Stream长度限制 |
| `MKT-005` | 未初始化 | 事件发布器未初始化 |

### 消费端错误码

| 错误码 | 含义 | 说明 |
|--------|------|------|
| `MKT-101` | 消息解析失败 | 无法解析JSON格式 |
| `MKT-102` | 字段缺失 | 必填字段不存在 |
| `MKT-103` | 数据类型错误 | 字段类型不匹配 |
| `MKT-104` | 时间戳无效 | 时间戳格式错误或过期 |

---

## 重试策略

### 发布端重试

```python
# 重试配置
RETRY_CONFIG = {
    "max_retries": 3,           # 最大重试次数
    "retry_delay": 1.0,         # 初始重试间隔（秒）
    "retry_backoff": 2.0,       # 指数退避倍数
    "max_retry_delay": 30.0,    # 最大重试间隔（秒）
    "timeout": 5.0              # 单次操作超时（秒）
}
```

**重试规则**:
1. 网络错误（连接失败、超时）：立即重试，指数退避
2. Redis不可用：重试3次后放弃，记录错误日志
3. 序列化错误：不重试，直接返回错误
4. 达到最大Stream长度：删除旧消息后重试

### 消费端重试

```python
# 消费配置
CONSUMER_CONFIG = {
    "block_timeout": 5000,      # XREADGROUP阻塞超时（毫秒）
    "claim_idle_time": 60000,   # 消息认领空闲时间（毫秒）
    "max_deliveries": 3         # 最大投递次数
}
```

**消费规则**:
1. 消息处理失败：不ACK，等待重新投递
2. 达到最大投递次数：转入死信队列（DLQ）
3. 处理超时：自动释放给其他消费者

---

## 消费示例

### Python SDK 消费示例

```python
from event_bus import EventBusClient, EventConsumer, EventType

# 创建客户端
client = EventBusClient(host="redis", port=6379)
client.connect()

# 创建消费者
consumer = EventConsumer(
    client=client,
    service_name="trading-ai",
    consumer_group="ai-decision-group",
    consumer_id="ai-001"
)

# 订阅实时行情
async def handle_quote(event):
    payload = event["payload"]
    print(f"收到 {payload['symbol']} 行情: {payload['price']}")

consumer.subscribe(
    EventType.MARKET_QUOTE_REALTIME,
    handler=handle_quote
)

# 开始消费
await consumer.start()
```

### 原始 Redis 消费示例

```python
import redis
import json

r = redis.Redis(host="redis", port=6379, decode_responses=True)

# 创建消费者组（首次运行）
try:
    r.xgroup_create(
        "market:quote:realtime",
        "backend-group",
        id="$",
        mkstream=True
    )
except redis.ResponseError:
    pass  # 组已存在

# 消费消息
while True:
    messages = r.xreadgroup(
        groupname="backend-group",
        consumername="backend-001",
        streams={"market:quote:realtime": ">"},
        block=5000
    )

    for stream, msgs in messages:
        for msg_id, fields in msgs:
            data = json.loads(fields["data"])
            print(f"[{msg_id}] {data['event_type']}: {data['payload']}")
            # 确认消息
            r.xack("market:quote:realtime", "backend-group", msg_id)
```

### 使用 redis-cli 查看事件

```bash
# 查看Stream信息
XINFO STREAM market:quote:realtime

# 查看最近10条消息
XREVRANGE market:quote:realtime + - COUNT 10

# 查看消费者组
XINFO GROUPS market:quote:realtime

# 查看待处理消息
XPENDING market:quote:realtime backend-group
```

---

## 附录

### A. 事件类型枚举

```python
from enum import Enum

class EventType(str, Enum):
    MARKET_QUOTE_REALTIME = "market:quote:realtime"
    MARKET_ALERT_PRICE_MOVE = "market:alert:price_move"
    MARKET_INDICATOR_UPDATED = "market:indicator:updated"
```

### B. 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-02-12 | v1.0 | 初始版本，定义三类事件格式 |

### C. 相关文档

- [SDK使用指南](../../../infra/event-bus/USAGE_GUIDE.md)
- [TODO.md](./TODO.md) - 开发进度
- [HAVE_DONE.md](./HAVE_DONE.md) - 已完成功能

---

*文档版本: v1.0*
*最后更新: 2026-02-12*
*维护者: Market Data Service 开发团队*
