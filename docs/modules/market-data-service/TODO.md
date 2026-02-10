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
- [x] `tests/unit/collectors/test_base_collector.py` - 单元测试：基类接口定义
- [x] `tests/unit/collectors/test_sina_collector.py` - 单元测试：新浪财经采集器
- [x] `tests/unit/collectors/test_tencent_collector.py` - 单元测试：腾讯财经采集器
- [x] 故障转移测试：模拟新浪失败，自动切换到腾讯
- [x] 数据格式测试：验证各数据源返回字段统一

**对应测试脚本**: TEST_SCRIPTS.md#T-001

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
- [x] `tests/unit/services/test_data_router.py` - 单元测试：路由选择逻辑
- [x] `tests/integration/collectors/test_failover.py` - 集成测试：故障转移流程
- [x] 健康检查测试：定时检测各数据源可用性
- [x] 统计测试：验证成功率、响应时间统计

**对应测试脚本**: TEST_SCRIPTS.md#T-002

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
- [x] `tests/unit/db/test_timescale_setup.py` - 单元测试：数据库初始化、表创建
- [x] `tests/integration/db/test_kline_storage.py` - 集成测试：K线写入、查询
- [x] 性能测试：1万条K线写入 < 1秒
- [x] 压缩测试：验证自动压缩策略生效

**对应测试脚本**: TEST_SCRIPTS.md#T-003

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
- [x] `tests/unit/services/test_layered_collector.py` - 单元测试：分层逻辑
- [x] `tests/integration/services/test_collection_loop.py` - 集成测试：采集循环
- [x] 热股票更新测试：接收Redis消息，更新采集列表
- [x] 并发测试：高频/低频采集器并发运行不冲突

**对应测试脚本**: TEST_SCRIPTS.md#T-004

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
- [x] `tests/unit/cache/test_quote_cache.py` - 单元测试：缓存读写
- [x] `tests/integration/cache/test_redis_ttl.py` - 集成测试：TTL过期验证
- [x] 性能测试：1000只股票缓存写入 < 100ms
- [x] 并发测试：多线程同时写入不冲突

**对应测试脚本**: TEST_SCRIPTS.md#T-005

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
- [x] `tests/unit/services/test_indicators.py` - 单元测试：各指标计算准确性
- [x] `tests/integration/services/test_indicator_api.py` - 集成测试：API端点
- [x] 数据对比测试：与东方财富/同花顺数据对比，误差 < 0.01
- [x] 边界测试：数据不足时的处理

**对应测试脚本**: TEST_SCRIPTS.md#T-006

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
- [x] `tests/integration/api/test_quotes_api.py` - 集成测试：行情API
- [x] `tests/integration/api/test_kline_api.py` - 集成测试：K线API
- [x] 参数验证测试：日期范围、股票代码格式
- [x] 性能测试：API响应时间 < 100ms

**对应测试脚本**: TEST_SCRIPTS.md#T-007

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
- [x] `tests/integration/websocket/test_realtime.py` - 集成测试：WebSocket连接
- [x] 订阅测试：客户端订阅股票，收到推送
- [x] 并发测试：1000个连接同时在线
- [x] 断开重连测试：客户端断开后重连恢复数据

**对应测试脚本**: TEST_SCRIPTS.md#T-008

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
- [x] `tests/unit/monitoring/test_collector_metrics.py` - 单元测试：指标收集
- [x] `tests/integration/api/test_monitoring_api.py` - 集成测试：监控API
- [x] 告警测试：连续失败时触发告警

**对应测试脚本**: TEST_SCRIPTS.md#T-009

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
- [x] `tests/integration/api/test_health.py` - 集成测试：健康检查
- [x] 依赖故障测试：模拟数据库断开，返回 unhealthy
- [x] 响应时间测试：健康检查 < 50ms

**对应测试脚本**: TEST_SCRIPTS.md#T-010

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
| [T-001] 采集器统一接口 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-002] 数据路由故障转移 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-003] TimescaleDB存储 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-004] 分层采集器 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-005] Redis实时缓存 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-006] 技术指标计算 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-007] REST API | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-008] WebSocket推送 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-009] 数据监控 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-010] 健康检查 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |

### Phase 5 优化项进度

| 条目 | 优先级 | 状态 | 开发日期 | 测试通过日期 | 合并提交 |
|------|--------|------|----------|--------------|----------|
| [OPT-P0-001] 多数据源灵活性与颗粒化采集 | P0 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [OPT-P0-002] TimescaleDB写入缓冲与读取缓存 | P0 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [OPT-P0-003] 集合竞价与当日实时数据 | P0 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [OPT-P1-001] 技术指标缓存与降级 | P1 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [OPT-P1-002] 监控可视化Dashboard | P1 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [OPT-P1-003] 多维度内部健康检查 | P1 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [OPT-P2-001] WebSocket+HTTP混合同步 | P2 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [OPT-P2-002] 历史数据日内实时扩展 | P2 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |

---

### Phase 5: 性能优化与增强

#### [OPT-P0-001] 多数据源灵活性保持与颗粒化采集
**功能**: 优化统一接口，保持各数据源灵活性；实现按股票粒度的故障转移和采集

**测试要求**:
- [x] `tests/unit/collectors/test_flexible_interface.py` - 单元测试：数据源特定参数支持 (10 tests)
- [x] `tests/unit/services/test_granular_collection.py` - 单元测试：颗粒化采集与故障转移 (10 tests)
- [x] `tests/integration/collectors/test_symbol_level_failover.py` - 集成测试：单股票级别故障转移 (5 tests)
- [x] 灵活性测试：验证各数据源可传递特定参数
- [x] 容错测试：部分股票失败不影响其他股票采集

**对应测试脚本**: TEST_SCRIPTS.md#OPT-P0-001

**验收标准**:
```python
# 灵活性保持 - 各数据源可传递特定参数
class SinaCollector(BaseCollector):
    async def collect_quotes(self, symbols: List[str], **kwargs) -> List[Quote]:
        # 支持新浪特有的参数
        use_https = kwargs.get('use_https', True)
        timeout = kwargs.get('timeout', 5)
        # ...

# 颗粒化采集 - 单股票粒度故障转移
async with GranularCollector() as collector:
    quotes = await collector.collect_quotes(['000001', '600519'])
    # 000001从新浪获取成功，600519新浪失败后从腾讯获取

# 容错统计
result.failed_symbols  # 最终失败的个股
result.fallback_symbols  # 使用备用源的个股
result.source_distribution  # {'sina': 400, 'tencent': 100}
```

**依赖**: [T-001], [T-002], [T-004]
**预计工时**: 3天

---

#### [OPT-P0-002] TimescaleDB 写入缓冲与读取缓存
**功能**: 实现批量写入缓冲（Write Buffer）和查询结果缓存，优化数据库性能

**测试要求**:
- [x] `tests/unit/db/test_write_buffer.py` - 单元测试：写入缓冲区管理 (12 tests)
- [x] `tests/unit/db/test_query_cache.py` - 单元测试：查询结果缓存 (10 tests)
- [x] `tests/integration/db/test_buffered_write.py` - 集成测试：批量写入 (6 tests)
- [x] 性能测试：批量写入1万条 < 500ms
- [x] 一致性测试：缓冲区刷盘后数据完整性

**对应测试脚本**: TEST_SCRIPTS.md#OPT-P0-002

**验收标准**:
```python
# 写入缓冲区
write_buffer = WriteBuffer(
    db=timescaledb,
    batch_size=1000,
    flush_interval_seconds=5
)
await write_buffer.add('kline_1m', kline_data)  # 异步缓冲
await write_buffer.flush()  # 手动刷盘

# 查询缓存
query_cache = QueryCache(redis, ttl_seconds=300)
cached_result = await query_cache.get('kline:000001:1d:2026-01-01:2026-01-31')
if not cached_result:
    result = await db.query_klines(...)
    await query_cache.set(cache_key, result)

# 性能指标
# 写入吞吐量: > 20,000 条/秒
# 查询响应: 热点数据 < 5ms (缓存命中)
```

**依赖**: [T-003], [T-005]
**预计工时**: 2.5天

---

#### [OPT-P0-003] 集合竞价与当日实时数据支持
**功能**: 当日非休市日且未收盘时，历史K线API必须包含当日实时数据（含集合竞价）

**测试要求**:
- [x] `tests/unit/services/test_intraday_data.py` - 单元测试：日内数据合并 (10 tests)
- [x] `tests/integration/api/test_kline_with_today.py` - 集成测试：历史数据包含当日 (4 tests)
- [x] 时间测试：验证集合竞价时段(9:15-9:25)数据正确性
- [x] 休市日测试：验证休市日行为

**对应测试脚本**: TEST_SCRIPTS.md#OPT-P0-003

**验收标准**:
```python
# 历史K线包含当日实时数据
GET /api/kline/000001?period=1d&start=2026-02-01&end=2026-02-10
# 返回:
# [
#   {"date": "2026-02-01", "open": 10.0, ...},  # 历史数据来自TimescaleDB
#   {"date": "2026-02-10", "open": 10.5, ...}   # 当日数据来自实时缓存
# ]

# 智能判断
class IntradayDataService:
    def is_trading_day(self, date) -> bool
    def is_market_open(self) -> bool  # 含集合竞价时段
    def get_cached_kline(self, symbol) -> Kline  # 从Redis构建当日K线
```

**对接需求**:
- **Backend服务**: 提供休市日查询接口 `GET /api/market/calendar`
- **Market Data Service**: 本地缓存休市日历，每日同步

**依赖**: [T-005], [T-007]
**预计工时**: 2天

---

#### [OPT-P1-001] 技术指标缓存与降级
**功能**: 指标计算结果缓存，数据源故障时提供历史指标或近似值

**测试要求**:
- [x] `tests/unit/services/test_indicator_cache.py` - 单元测试：指标缓存 (12 tests)
- [x] `tests/integration/services/test_indicator_resilience.py` - 集成测试：指标降级策略 (6 tests)
- [x] 准确性测试：缓存指标与实时计算误差 < 0.001

**对应测试脚本**: TEST_SCRIPTS.md#OPT-P1-001

**验收标准**:
```python
# 指标缓存
indicator_cache = IndicatorCache(redis, ttl_seconds=60)
indicators = await indicator_service.calculate_with_cache(
    symbol='000001',
    indicators=['ma', 'macd'],
    use_cached=True  # 允许使用缓存
)

# 降级策略
class IndicatorService:
    async def calculate_with_fallback(self, symbol, indicators):
        try:
            return await self.calculate_realtime(symbol, indicators)
        except DataSourceError:
            # 降级: 返回缓存的指标
            return await self.get_cached_indicators(symbol, indicators)
        except CacheMiss:
            # 降级: 使用简化的近似计算
            return await self.calculate_approximate(symbol, indicators)

# 缓存策略
# - MA5/MA10: 缓存60秒
# - MACD: 缓存30秒
# - RSI: 缓存60秒
```

**依赖**: [T-006], [OPT-P0-002]
**预计工时**: 2天

---

#### [OPT-P1-002] 监控可视化Dashboard
**功能**: 提供Web可视化监控面板，实时展示采集状态、数据源健康、告警信息

**测试要求**:
- [x] `tests/unit/monitoring/test_dashboard_data.py` - 单元测试：Dashboard数据聚合 (8 tests)
- [x] `tests/integration/api/test_dashboard_api.py` - 集成测试：Dashboard API (7 tests)
- [x] UI测试：关键指标正确显示

**对应测试脚本**: TEST_SCRIPTS.md#OPT-P1-002

**验收标准**:
```python
# Dashboard API
GET /api/dashboard/summary
{
  "collection_rate": 0.995,
  "active_sources": 3,
  "active_alerts": 2,
  "hot_stocks_count": 250,
  "cache_hit_rate": 0.92
}

GET /api/dashboard/realtime-chart?metric=collection_rate&period=1h
# 返回时间序列数据供图表渲染

# WebSocket实时推送
ws = await websocket_connect('/ws/dashboard')
# 自动推送: 采集率变化、告警触发、数据源状态变化

# Dashboard页面
GET /dashboard -> 返回HTML监控面板
```

**对接需求**:
- **Frontend服务**: 可选择集成Dashboard或独立访问

**依赖**: [T-009], [T-008]
**预计工时**: 2.5天

---

#### [OPT-P1-003] 多维度内部健康检查
**功能**: 扩展健康检查维度，包括业务逻辑层、数据新鲜度、端到端采集链路

**测试要求**:
- [x] `tests/unit/monitoring/test_deep_health.py` - 单元测试：深度健康检查 (9 tests)
- [x] `tests/integration/api/test_health_detailed.py` - 集成测试：详细健康API (7 tests)
- [x] 数据新鲜度测试：验证最后采集时间
- [x] 端到端测试：完整采集链路验证

**对应测试脚本**: TEST_SCRIPTS.md#OPT-P1-003

**验收标准**:
```python
# 多维度健康检查
GET /health?depth=deep
{
  "status": "healthy",
  "basic": {
    "timescaledb": "healthy",
    "redis": "healthy"
  },
  "business": {
    "data_freshness": {
      "status": "healthy",
      "last_quote_time": "2026-02-10T14:30:00Z",
      "max_delay_seconds": 15
    },
    "collection_rate_5m": {
      "status": "healthy",
      "rate": 0.998,
      "threshold": 0.95
    }
  },
  "end_to_end": {
    "full_pipeline": {
      "status": "healthy",
      "test_symbol": "000001",
      "collection_time_ms": 450,
      "storage_verified": true
    }
  }
}
```

**依赖**: [T-010], [T-009]
**预计工时**: 1.5天

---

#### [OPT-P2-001] WebSocket+HTTP混合同步
**功能**: 前端首次连接时推送全量数据，后续增量推送，支持HTTP轮询降级

**测试要求**:
- [x] `tests/integration/websocket/test_hybrid_sync.py` - 集成测试：混合同步 (10 tests)
- [x] `tests/integration/api/test_http_fallback.py` - 集成测试：HTTP降级 (7 tests)
- [x] 并发测试：混合模式1000连接
- [x] 数据一致性测试：WebSocket与HTTP数据一致

**对应测试脚本**: TEST_SCRIPTS.md#OPT-P2-001

**验收标准**:
```python
# WebSocket首次连接推送全量
ws = await websocket_connect('/ws/realtime')
# 自动接收:
# {"type": "snapshot", "data": {"000001": {...}, "600519": {...}, ...}}
# {"type": "delta", "data": {"000001": {"price": 10.55}}}

# HTTP轮询降级
GET /api/quotes/snapshot?symbols=000001,600519
# 返回完整数据（供WebSocket不可用时使用）

# 自动降级策略
class RealtimeSyncManager:
    async def connect(self):
        try:
            self.ws = await websocket_connect('/ws/realtime')
            self.mode = 'websocket'
        except:
            self.mode = 'http_polling'
            self.poll_interval = 5  # 秒
```

**对接需求**:
- **Frontend服务**: 支持WebSocket+HTTP双模式

**依赖**: [T-008], [T-007]
**预计工时**: 2天

---

#### [OPT-P2-002] 历史数据日内实时扩展
**功能**: 分钟级K线API支持查询当日实时数据，自动合并历史与实时

**测试要求**:
- [x] `tests/unit/services/test_minute_kline_merge.py` - 单元测试：分钟线合并 (10 tests)
- [x] `tests/integration/api/test_minute_kline_intraday.py` - 集成测试：日内分钟线 (7 tests)
- [x] 性能测试：分钟线查询 < 50ms
- [x] 边界测试：跨交易日边界处理

**对应测试脚本**: TEST_SCRIPTS.md#OPT-P2-002

**验收标准**:
```python
# 分钟级K线包含当日实时
GET /api/kline/000001?period=1m&start=2026-02-10T09:30:00&end=2026-02-10T15:00:00
# 返回:
# [
#   {"time": "09:30:00", "open": 10.5, ...},      # 历史分钟线来自TimescaleDB
#   {"time": "14:35:00", "open": 10.55, ...},     # ...
#   {"time": "14:36:23", "open": 10.56, ...}      # 当前分钟实时数据来自Redis
# ]

# 实时分钟线构建
class IntradayKlineService:
    async def get_minute_klines(self, symbol, start, end):
        historical = await self.db.query_minutes(symbol, start, end)
        if self.is_today(end):
            current = self.build_current_minute_from_redis(symbol)
            historical.append(current)
        return historical
```

**依赖**: [OPT-P0-003], [OPT-P0-002]
**预计工时**: 1.5天

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

| 模块 | 接口需求 | 优先级 | 状态 | 详情 |
|------|---------|--------|------|------|
| Backend | 接收 `data-service:hot-stocks` Redis消息 | P0 | ✅ 已对接 | 热股票列表推送 |
| Backend | 休市日查询接口 `GET /api/market/calendar` | P0 | 📝 需开发 | OPT-P0-003依赖 |
| Frontend | WebSocket+HTTP双模式支持 | P2 | 📝 需开发 | OPT-P2-001依赖 |

### Backend 服务对接详情

#### 1. 热股票列表推送 (已对接)
```python
# Redis Pub/Sub 频道
PUBLISH 'data-service:hot-stocks' {
    "stocks": ["000001", "600519", "000768"],
    "timestamp": "2026-02-10T09:30:00Z",
    "source": "user_watchlist"  # 或 "hot_ranking"
}
```

#### 2. 休市日查询接口 (需开发) [OPT-P0-003依赖]
**接口**: `GET /api/market/calendar?start=2026-01-01&end=2026-12-31`

**响应**:
```json
{
  "trading_days": ["2026-01-05", "2026-01-06"],
  "holidays": [
    {"date": "2026-01-01", "name": "元旦", "type": "public"},
    {"date": "2026-02-17", "name": "春节", "type": "public"}
  ],
  "special_schedule": [
    {"date": "2026-01-23", "open": "09:30", "close": "11:30", "note": "除夕半天市"}
  ]
}
```

**用途**: Market Data Service本地缓存休市日历，用于：
- 判断是否为交易日
- 确定集合竞价时段 (9:15-9:25)
- 判断当日数据是否可获取

**开发优先级**: P0 - 阻塞OPT-P0-003部署

**对接负责人**: Backend Team

---

### Frontend 服务对接详情

#### WebSocket+HTTP混合同步支持 (需开发) [OPT-P2-001依赖]

**功能需求**:
1. **WebSocket模式**: 首次连接接收全量快照，后续接收增量更新
2. **HTTP降级模式**: WebSocket不可用时自动切换到HTTP轮询
3. **数据一致性**: 确保两种模式数据一致

**接口规范**:
```python
# WebSocket 连接
ws = new WebSocket('ws://localhost:8001/ws/realtime')

# 首次连接自动接收全量快照
{"type": "snapshot", "data": {"000001": {"price": 10.5, ...}}}

# 后续接收增量更新
{"type": "delta", "data": {"000001": {"price": 10.55, "change": 0.05}}}

# HTTP 降级接口 (WebSocket失败时使用)
GET /api/quotes/snapshot?symbols=000001,600519
Response: {"type": "snapshot", "data": {...}, "timestamp": "..."}
```

**客户端实现要求**:
```typescript
class RealtimeSyncManager {
    private mode: 'websocket' | 'http_polling';
    private reconnectInterval: number = 5000;

    async connect() {
        try {
            this.ws = new WebSocket('/ws/realtime');
            this.mode = 'websocket';
        } catch {
            this.mode = 'http_polling';
            this.startPolling();
        }
    }
}
```

**开发优先级**: P2 - 优化项，不阻塞核心功能

**对接负责人**: Frontend Team

---

## 测试统计

| 阶段 | 测试文件数 | 测试用例数 | 通过率 |
|------|-----------|-----------|--------|
| Phase 1-4 (T-001~T-010) | 15 | 469 | 100% |
| Phase 5 P0优化 | 8 | 102 | 100% |
| Phase 5 P1优化 | 6 | 55 | 100% |
| Phase 5 P2优化 | 4 | 29 | 100% |
| **总计** | **33** | **655** | **100%** |

---

*最后更新: 2026-02-10*
*测试脚本索引: [TEST_SCRIPTS.md](./TEST_SCRIPTS.md)*
*负责人: Market Data Service开发团队*
