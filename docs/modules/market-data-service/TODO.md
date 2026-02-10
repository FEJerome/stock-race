# Market Data Service 模块开发规划

## 模块概述

**模块名称**: Market Data Service (Python + FastAPI)
**主要职责**: A股实时行情采集、历史数据存储、技术指标计算
**数据主权**: 行情数据（quotes, klines, indicators）
**服务端口**: 8001
**存储介质**: TimescaleDB（时序数据）+ Redis（热缓存）

---

## 服务通信标准

### 1. 对外提供接口

| 接口类型 | 路径 | 消费者 | 说明 |
|---------|------|--------|------|
| REST API | `/api/*` | Backend, Trading AI Service | 历史数据、技术指标查询 |
| WebSocket | `/ws/realtime` | Frontend（可选） | 实时行情推送 |

### 2. 依赖外部服务

| 服务 | 调用方式 | 用途 | 失败策略 |
|------|---------|------|---------|
| 新浪财经 API | HTTP | 实时行情采集 | 数据源切换（腾讯→东方财富） |
| 腾讯财经 API | HTTP | 实时行情采集（备用） | 降级到东方财富 |
| 东方财富 API | HTTP | 实时行情采集（备用） | 返回错误码503 |
| PostgreSQL | 直接连接 | 股票元数据 | 服务降级 |
| TimescaleDB | 直接连接 | 时序数据存储 | 服务不可用 |
| Redis | 直接连接 | 热数据缓存 | 直连数据库 |

### 3. Redis Pub/Sub 事件

```python
# 订阅事件
SUBSCRIBE 'data-service:hot-stocks' - 接收Backend推送的热股票列表

# 发布事件（可选）
PUBLISH 'market:quote:updated' - 行情更新（供其他服务消费）
PUBLISH 'market:alert' - 市场异动（涨跌停、大幅波动）
```

### 4. 数据访问规范

- **实时行情**: 直接访问 Redis（TTL 10秒）
- **历史K线**: 查询 TimescaleDB，支持时间范围筛选
- **技术指标**: 实时计算或从 TimescaleDB 读取
- **股票元数据**: 查询 PostgreSQL

---

## 开发条目（测试驱动）

### Phase 1: 基础设施

#### [T-001] 数据采集器统一接口
**功能**: 定义数据源抽象基类，实现新浪财经、腾讯财经、东方财富的统一采集接口

**测试要求**:
- [ ] `tests/unit/collectors/test_base_collector.py` - 单元测试：基类接口定义
- [ ] `tests/unit/collectors/test_sina_collector.py` - 单元测试：新浪财经采集器
- [ ] `tests/unit/collectors/test_tencent_collector.py` - 单元测试：腾讯财经采集器
- [ ] 故障转移测试：模拟新浪失败，自动切换到腾讯
- [ ] 数据格式测试：验证各数据源返回字段统一

**验收标准**:
```python
# 统一接口
class BaseCollector(ABC):
    async def collect_quotes(self, symbols: List[str]) -> List[Quote]
    async def collect_kline(self, symbol: str, period: str) -> List[Kline]

# 故障转移
async with DataRouter() as router:
    quotes = await router.collect_quotes(['000001', '600519'])
    # 新浪失败时自动切换到腾讯
```

**依赖**: 无
**预计工时**: 3天

---

#### [T-002] 数据路由与故障转移
**功能**: 多数据源路由，健康检查，自动故障转移

**测试要求**:
- [ ] `tests/unit/services/test_data_router.py` - 单元测试：路由选择逻辑
- [ ] `tests/integration/collectors/test_failover.py` - 集成测试：故障转移流程
- [ ] 健康检查测试：定时检测各数据源可用性
- [ ] 统计测试：验证成功率、响应时间统计

**验收标准**:
```python
# 健康检查
router.get_health_status()
# {
#   "sina": {"healthy": true, "success_rate": 0.99, "avg_latency_ms": 150},
#   "tencent": {"healthy": true, "success_rate": 0.98, "avg_latency_ms": 200},
#   "eastmoney": {"healthy": false, "error": "timeout"}
# }

# 故障转移
await router.collect_quotes(['000001'])  # 自动选择健康数据源
```

**依赖**: [T-001]
**预计工时**: 2天

---

#### [T-003] TimescaleDB 时序数据存储
**功能**: K线数据存储、压缩策略、自动分区

**测试要求**:
- [ ] `tests/unit/db/test_timescale_setup.py` - 单元测试：数据库初始化、表创建
- [ ] `tests/integration/db/test_kline_storage.py` - 集成测试：K线写入、查询
- [ ] 性能测试：1万条K线写入 < 1秒
- [ ] 压缩测试：验证自动压缩策略生效

**验收标准**:
```python
# 表结构
CREATE TABLE kline_1m (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    open DECIMAL(10,2),
    high DECIMAL(10,2),
    low DECIMAL(10,2),
    close DECIMAL(10,2),
    volume BIGINT,
    PRIMARY KEY (time, symbol)
);
SELECT create_hypertable('kline_1m', 'time', chunk_time_interval => INTERVAL '1 day');

# 数据操作
await db.save_klines('000001', '1m', klines)
result = await db.query_klines('000001', '1m', start='2026-01-01', end='2026-01-31')
```

**依赖**: 无
**预计工时**: 2天

---

### Phase 2: 核心采集功能

#### [T-004] 分层采集器（高频/低频）
**功能**: 根据热股票列表，执行分层采集策略（热股票10秒，全市场60秒）

**测试要求**:
- [ ] `tests/unit/services/test_layered_collector.py` - 单元测试：分层逻辑
- [ ] `tests/integration/services/test_collection_loop.py` - 集成测试：采集循环
- [ ] 热股票更新测试：接收Redis消息，更新采集列表
- [ ] 并发测试：高频/低频采集器并发运行不冲突

**验收标准**:
```python
# 热股票列表更新
async def on_hot_stocks_update(message):
    data = json.loads(message)
    collector.update_hot_stocks(set(data['stocks']))

# 采集统计
collector.stats = {
    'high_freq_collections': 1000,  # 高频采集次数
    'low_freq_collections': 100,    # 低频采集次数
    'hot_stocks_count': 250,        # 当前热股票数
}
```

**依赖**: [T-001], [T-002], [T-003], 依赖 Backend 的热股票推送
**预计工时**: 3天

---

#### [T-005] 实时行情缓存（Redis）
**功能**: 实时行情写入Redis，TTL 10秒，提供极速查询

**测试要求**:
- [ ] `tests/unit/cache/test_quote_cache.py` - 单元测试：缓存读写
- [ ] `tests/integration/cache/test_redis_ttl.py` - 集成测试：TTL过期验证
- [ ] 性能测试：1000只股票缓存写入 < 100ms
- [ ] 并发测试：多线程同时写入不冲突

**验收标准**:
```python
# 缓存写入
await cache.set_quote('000001', {
    'symbol': '000001',
    'price': 10.50,
    'change': 0.05,
    'change_percent': 0.48,
    'volume': 1000000,
    'updated_at': time.time()
}, ttl=10)

# 缓存读取
quote = await cache.get_quote('000001')  # < 1ms
```

**依赖**: [T-004]
**预计工时**: 1.5天

---

#### [T-006] 技术指标计算服务
**功能**: 实时计算MA、MACD、RSI、布林带等技术指标

**测试要求**:
- [ ] `tests/unit/services/test_indicators.py` - 单元测试：各指标计算准确性
- [ ] `tests/integration/services/test_indicator_api.py` - 集成测试：API端点
- [ ] 数据对比测试：与东方财富/同花顺数据对比，误差 < 0.01
- [ ] 边界测试：数据不足时的处理

**验收标准**:
```python
# 指标计算
indicators = await indicator_service.calculate('000001', ['ma', 'macd', 'rsi'])
# {
#   'ma5': 10.50,
#   'ma10': 10.45,
#   'ma20': 10.30,
#   'macd': 0.05,
#   'macd_signal': 0.03,
#   'rsi': 58.5
# }

# API端点
GET /api/indicators/000001?indicators=ma,macd,rsi
```

**依赖**: [T-003]
**预计工时**: 2.5天

---

### Phase 3: API接口

#### [T-007] REST API 行情查询
**功能**: 实现历史K线、实时行情、批量查询API

**测试要求**:
- [ ] `tests/integration/api/test_quotes_api.py` - 集成测试：行情API
- [ ] `tests/integration/api/test_kline_api.py` - 集成测试：K线API
- [ ] 参数验证测试：日期范围、股票代码格式
- [ ] 性能测试：API响应时间 < 100ms

**验收标准**:
```bash
# 实时行情
curl http://localhost:8001/api/quotes/000001
# {"symbol":"000001","price":10.50,"change":0.05,"updated_at":"2026-02-10T14:30:00Z"}

# 历史K线
curl "http://localhost:8001/api/kline/000001?period=1d&start=2026-01-01&end=2026-01-31"
# [{"time":"2026-01-01","open":10.0,"high":10.5,"low":9.8,"close":10.2,"volume":1000000},...]
```

**依赖**: [T-005], [T-006]
**预计工时**: 2天

---

#### [T-008] WebSocket 实时推送（可选）
**功能**: WebSocket服务，推送实时行情到前端

**测试要求**:
- [ ] `tests/integration/websocket/test_realtime.py` - 集成测试：WebSocket连接
- [ ] 订阅测试：客户端订阅股票，收到推送
- [ ] 并发测试：1000个连接同时在线
- [ ] 断开重连测试：客户端断开后重连恢复数据

**验收标准**:
```python
# WebSocket流程
ws = await websocket_connect('/ws/realtime')
await ws.send_json({'action': 'subscribe', 'symbols': ['000001', '600519']})
msg = await ws.receive_json()  # 实时价格推送
```

**依赖**: [T-007]
**预计工时**: 2天

---

### Phase 4: 监控与运维

#### [T-009] 数据采集监控
**功能**: 采集成功率、延迟、数据源健康状态监控

**测试要求**:
- [ ] `tests/unit/monitoring/test_collector_metrics.py` - 单元测试：指标收集
- [ ] `tests/integration/api/test_monitoring_api.py` - 集成测试：监控API
- [ ] 告警测试：连续失败时触发告警

**验收标准**:
```bash
# 监控数据
curl http://localhost:8001/api/monitoring/metrics
# {
#   "collection_rate": 0.995,
#   "avg_latency_ms": 150,
#   "data_sources": {
#     "sina": {"success": 1000, "fail": 5, "avg_latency_ms": 120},
#     "tencent": {"success": 50, "fail": 0, "avg_latency_ms": 180}
#   }
# }
```

**依赖**: [T-002]
**预计工时**: 1.5天

---

#### [T-010] 服务健康检查
**功能**: `/health` 端点，检查数据库、Redis、数据源状态

**测试要求**:
- [ ] `tests/integration/api/test_health.py` - 集成测试：健康检查
- [ ] 依赖故障测试：模拟数据库断开，返回 unhealthy
- [ ] 响应时间测试：健康检查 < 50ms

**验收标准**:
```bash
curl http://localhost:8001/health
# {"status":"healthy","dependencies":{"timescaledb":"healthy","redis":"healthy","sina":"healthy"}}
```

**依赖**: 无
**预计工时**: 0.5天

---

## 测试脚本目录结构

```
market-data-service/tests/
├── unit/
│   ├── collectors/                # 采集器测试
│   ├── services/                  # 服务层测试
│   ├── cache/                     # 缓存测试
│   ├── db/                        # 数据库测试
│   └── monitoring/                # 监控测试
├── integration/
│   ├── api/                       # API测试
│   ├── collectors/                # 采集集成测试
│   ├── services/                  # 服务集成测试
│   ├── db/                        # 数据库集成测试
│   ├── cache/                     # 缓存集成测试
│   └── websocket/                 # WebSocket测试
├── fixtures/                      # 测试数据
└── conftest.py                    # Pytest配置
```

---

## 开发进度留痕

| 条目 | 状态 | 开发日期 | 测试通过日期 | 合并提交 |
|------|------|----------|--------------|----------|
| [T-001] 采集器统一接口 | 🔲 待开发 | - | - | - |
| [T-002] 数据路由故障转移 | 🔲 待开发 | - | - | - |
| [T-003] TimescaleDB存储 | 🔲 待开发 | - | - | - |
| [T-004] 分层采集器 | 🔲 待开发 | - | - | - |
| [T-005] Redis实时缓存 | 🔲 待开发 | - | - | - |
| [T-006] 技术指标计算 | 🔲 待开发 | - | - | - |
| [T-007] REST API | 🔲 待开发 | - | - | - |
| [T-008] WebSocket推送 | 🔲 待开发 | - | - | - |
| [T-009] 数据监控 | 🔲 待开发 | - | - | - |
| [T-010] 健康检查 | ✅ 已完成 | 2026-02-01 | 2026-02-01 | - |

---

## 提交规范

1. **分支命名**: `market-data/T-XXX-简短描述`（如 `market-data/T-001-collector-interface`）
2. **提交信息**: `test(market-data): [T-001] 添加采集器接口测试`
3. **PR要求**: 必须包含测试，覆盖率 > 85%
4. **合并前检查**:
   ```bash
   pytest tests/unit -v --cov=src --cov-report=term-missing
   pytest tests/integration -v
   ```

---

## 依赖的其他模块

| 模块 | 接口需求 | 状态 |
|------|---------|------|
| Backend | 接收 `data-service:hot-stocks` Redis消息 | 需对接 |

---

*最后更新: 2026-02-10*
*负责人: Market Data Service开发团队*
