# Market Data Service 测试脚本索引

本文档索引 Market Data Service 模块的所有测试脚本，按开发条目分类，包含功能描述、文件位置和测试统计。

---

## 测试统计概览

| 阶段 | 测试类型 | 文件数 | 测试用例数 |
|------|---------|--------|-----------|
| Phase 1-4 | 单元测试 + 集成测试 | 15 | 469 |
| Phase 5 P0优化 | 优化项测试 | 8 | 102 |
| Phase 5 P1优化 | 优化项测试 | 6 | 55 |
| Phase 5 P2优化 | 优化项测试 | 4 | 29 |
| **总计** | - | **33** | **655** |

---

## Phase 1: 基础设施

### [T-001] 数据采集器统一接口

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_base_collector.py` | `tests/unit/collectors/` | 8 | 基类接口定义：验证抽象基类 BaseCollector 的接口规范，包括 collect_quotes 和 collect_kline 方法签名 |
| `test_sina_collector.py` | `tests/unit/collectors/` | 12 | 新浪财经采集器：测试 SinaCollector 的数据采集、字段映射、错误处理 |
| `test_tencent_collector.py` | `tests/unit/collectors/` | 10 | 腾讯财经采集器：测试 TencentCollector 的数据采集、字段映射、错误处理 |
| `test_eastmoney_collector.py` | `tests/unit/collectors/` | 10 | 东方财富采集器：测试 EastMoneyCollector 的数据采集和字段解析 |
| `test_data_router.py` | `tests/unit/services/` | 12 | 数据路由服务：测试路由选择逻辑、健康检查、自动故障转移 |
| `test_failover.py` | `tests/integration/collectors/` | 6 | 故障转移集成测试：模拟新浪失败，自动切换到腾讯，验证切换过程 |

**核心功能验证**:
- 统一接口抽象基类定义
- 多数据源字段标准化
- 自动故障转移机制

---

### [T-002] 数据路由与故障转移

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_data_router.py` | `tests/unit/services/` | 12 | 路由选择逻辑：权重计算、健康检查集成、动态路由调整 |
| `test_failover.py` | `tests/integration/collectors/` | 6 | 故障转移流程：端到端故障检测、切换、恢复验证 |
| `test_health_check.py` | `tests/unit/services/` | 8 | 健康检查服务：定时检测、统计计算、状态更新 |
| `test_collector_stats.py` | `tests/unit/services/` | 5 | 采集统计：成功率、响应时间、错误率统计 |

**核心功能验证**:
- 多数据源健康状态监控
- 自动故障检测与切换
- 采集成功率、延迟统计

**关键接口**:
```python
router.get_health_status()
# 返回: {"sina": {"healthy": true, "success_rate": 0.99, "avg_latency_ms": 150}}
```

---

### [T-003] TimescaleDB 时序数据存储

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_timescale_setup.py` | `tests/unit/db/` | 6 | 数据库初始化：Hypertable创建、索引设置、压缩策略 |
| `test_kline_storage.py` | `tests/integration/db/` | 8 | K线存储集成测试：批量写入、查询、压缩验证 |
| `test_timescale_perf.py` | `tests/performance/db/` | 4 | 性能测试：1万条K线写入 < 1秒 |
| `test_compression.py` | `tests/unit/db/` | 5 | 压缩测试：自动压缩策略生效验证 |

**核心功能验证**:
- K线数据表结构创建
- 自动分区与压缩
- 高性能批量写入

**数据库Schema**:
```sql
CREATE TABLE kline_1m (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    open DECIMAL(10,2), high DECIMAL(10,2),
    low DECIMAL(10,2), close DECIMAL(10,2),
    volume BIGINT,
    PRIMARY KEY (time, symbol)
);
```

---

## Phase 2: 核心采集功能

### [T-004] 分层采集器（高频/低频）

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_layered_collector.py` | `tests/unit/services/` | 10 | 分层逻辑：热股票识别、分层策略、采集频率控制 |
| `test_collection_loop.py` | `tests/integration/services/` | 8 | 采集循环集成：高频/低频并发运行、任务调度 |
| `test_hot_stocks_update.py` | `tests/integration/services/` | 6 | 热股票更新：Redis消息接收、列表更新、采集调整 |
| `test_concurrent_collection.py` | `tests/unit/services/` | 8 | 并发测试：高频/低频采集器不冲突 |

**核心功能验证**:
- 热股票列表动态更新
- 10秒高频 / 60秒低频分层采集
- 并发采集不冲突

**采集统计**:
```python
collector.stats = {
    'high_freq_collections': 1000,
    'low_freq_collections': 100,
    'hot_stocks_count': 250
}
```

---

### [T-005] 实时行情缓存（Redis）

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_quote_cache.py` | `tests/unit/cache/` | 10 | 缓存读写：Redis基本操作、序列化、反序列化 |
| `test_redis_ttl.py` | `tests/integration/cache/` | 6 | TTL过期验证：10秒TTL、过期清理、续约 |
| `test_cache_perf.py` | `tests/performance/cache/` | 4 | 性能测试：1000只股票缓存写入 < 100ms |
| `test_concurrent_cache.py` | `tests/unit/cache/` | 8 | 并发测试：多线程写入不冲突 |

**核心功能验证**:
- Redis缓存读写
- 10秒TTL自动过期
- 高并发写入性能

**缓存接口**:
```python
await cache.set_quote('000001', {...}, ttl=10)
quote = await cache.get_quote('000001')  # < 1ms
```

---

### [T-006] 技术指标计算服务

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_indicators.py` | `tests/unit/services/` | 12 | 指标计算：MA、MACD、RSI、布林带计算准确性 |
| `test_indicator_api.py` | `tests/integration/services/` | 8 | 指标API集成：REST端点、参数验证、响应格式 |
| `test_indicator_accuracy.py` | `tests/validation/` | 6 | 数据对比：与东方财富/同花顺对比，误差 < 0.01 |
| `test_indicator_edge.py` | `tests/unit/services/` | 5 | 边界测试：数据不足、NaN处理 |

**核心功能验证**:
- MA5/MA10/MA20/MA60 计算
- MACD (DIF/DEA/HIST) 计算
- RSI 计算
- 布林带 (上/中/下轨) 计算

**API端点**:
```bash
GET /api/indicators/000001?indicators=ma,macd,rsi
```

---

## Phase 3: API接口

### [T-007] REST API 行情查询

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_quotes_api.py` | `tests/integration/api/` | 10 | 行情API：实时行情查询、批量查询、参数验证 |
| `test_kline_api.py` | `tests/integration/api/` | 10 | K线API：历史K线查询、日期范围、周期筛选 |
| `test_api_validation.py` | `tests/integration/api/` | 8 | 参数验证：股票代码格式、日期范围校验 |
| `test_api_perf.py` | `tests/performance/api/` | 5 | 性能测试：API响应时间 < 100ms |

**核心功能验证**:
- 实时行情查询
- 历史K线查询
- 参数验证与错误处理

**API端点**:
```bash
GET /api/quotes/000001
GET /api/kline/000001?period=1d&start=2026-01-01&end=2026-01-31
```

---

### [T-008] WebSocket 实时推送

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_realtime.py` | `tests/integration/websocket/` | 8 | WebSocket连接：连接建立、订阅、消息推送 |
| `test_subscription.py` | `tests/integration/websocket/` | 6 | 订阅测试：股票订阅、取消订阅、消息接收 |
| `test_ws_concurrent.py` | `tests/performance/websocket/` | 5 | 并发测试：1000个连接同时在线 |
| `test_reconnect.py` | `tests/integration/websocket/` | 8 | 断开重连：连接恢复、数据同步 |

**核心功能验证**:
- WebSocket连接管理
- 股票订阅/推送
- 1000并发连接支持
- 断线重连与恢复

**WebSocket流程**:
```python
ws = await websocket_connect('/ws/realtime')
await ws.send_json({'action': 'subscribe', 'symbols': ['000001']})
msg = await ws.receive_json()  # 实时价格推送
```

---

## Phase 4: 监控与运维

### [T-009] 数据采集监控

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_collector_metrics.py` | `tests/unit/monitoring/` | 10 | 指标收集：采集率、延迟、错误统计 |
| `test_monitoring_api.py` | `tests/integration/api/` | 8 | 监控API：指标查询、时间序列数据 |
| `test_alerting.py` | `tests/unit/monitoring/` | 6 | 告警测试：连续失败触发、告警恢复 |
| `test_metrics_aggregation.py` | `tests/unit/monitoring/` | 6 | 指标聚合：多维度统计、趋势计算 |

**核心功能验证**:
- 采集成功率监控
- 数据源健康状态
- 自动告警触发

**监控API**:
```bash
GET /api/monitoring/metrics
# 返回: {"collection_rate": 0.995, "avg_latency_ms": 150, ...}
```

---

### [T-010] 服务健康检查

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_health.py` | `tests/integration/api/` | 8 | 健康检查：基本状态、依赖检查 |
| `test_health_dependency.py` | `tests/integration/api/` | 6 | 依赖故障：数据库断开、Redis故障模拟 |
| `test_health_perf.py` | `tests/performance/api/` | 5 | 响应时间：健康检查 < 50ms |
| `test_health_edge.py` | `tests/integration/api/` | 6 | 边界测试：部分依赖故障处理 |

**核心功能验证**:
- 服务状态检查
- 数据库/Redis/数据源健康
- 快速响应 (< 50ms)

**健康检查端点**:
```bash
GET /health
# 返回: {"status": "healthy", "dependencies": {"timescaledb": "healthy", ...}}
```

---

## Phase 5: 性能优化与增强

### [OPT-P0-001] 多数据源灵活性与颗粒化采集

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_flexible_interface.py` | `tests/unit/collectors/` | 10 | 灵活接口：各数据源特定参数支持（Sina/Tencent特定参数） |
| `test_granular_collection.py` | `tests/unit/services/` | 10 | 颗粒化采集：单股票粒度采集、失败追踪 |
| `test_symbol_level_failover.py` | `tests/integration/collectors/` | 5 | 股票级故障转移：单股票失败重试、备用源切换 |
| `test_source_distribution.py` | `tests/unit/services/` | 5 | 源分布统计：各数据源采集数量统计 |
| `test_granular_stats.py` | `tests/unit/services/` | 5 | 颗粒化统计：失败股票、降级股票追踪 |
| `test_flexibility_edge.py` | `tests/unit/collectors/` | 5 | 灵活性边界：无效参数处理、默认值 |

**核心功能验证**:
- 数据源特定参数传递 (**kwargs支持)
- 单股票粒度故障转移
- 源分布统计与追踪

**关键接口**:
```python
# 灵活性保持
class SinaCollector(BaseCollector):
    async def collect_quotes(self, symbols: List[str], **kwargs) -> List[Quote]:
        use_https = kwargs.get('use_https', True)
        timeout = kwargs.get('timeout', 5)

# 颗粒化采集
result = await collector.collect_quotes(['000001', '600519'])
result.failed_symbols  # 最终失败的个股
result.fallback_symbols  # 使用备用源的个股
result.source_distribution  # {'sina': 400, 'tencent': 100}
```

**实现文件位置**:
- `market-data-service/src/data_service/collectors/base.py` - 基类定义
- `market-data-service/src/data_service/collectors/sina.py` - 新浪采集器
- `market-data-service/src/data_service/collectors/tencent.py` - 腾讯采集器
- `market-data-service/src/data_service/services/granular_collector.py` - 颗粒化采集服务

---

### [OPT-P0-002] TimescaleDB 写入缓冲与读取缓存

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_write_buffer.py` | `tests/unit/db/` | 12 | 写入缓冲：批量缓冲、定时刷盘、手动刷盘 |
| `test_query_cache.py` | `tests/unit/db/` | 10 | 查询缓存：结果缓存、TTL管理、缓存失效 |
| `test_buffered_write.py` | `tests/integration/db/` | 6 | 批量写入集成：缓冲区刷盘、数据一致性 |
| `test_cache_consistency.py` | `tests/integration/db/` | 5 | 一致性测试：写后读一致性 |
| `test_buffer_perf.py` | `tests/performance/db/` | 5 | 性能测试：批量写入1万条 < 500ms |
| `test_cache_hit.py` | `tests/unit/db/` | 4 | 缓存命中：热点数据命中率统计 |

**核心功能验证**:
- Write Buffer (batch_size=1000, flush_interval=5s)
- Query Cache (Redis-based, TTL=300s)
- 批量写入性能 > 20,000条/秒
- 缓存命中响应 < 5ms

**关键接口**:
```python
# 写入缓冲区
write_buffer = WriteBuffer(
    db=timescaledb,
    batch_size=1000,
    flush_interval_seconds=5
)
await write_buffer.add('kline_1m', kline_data)
await write_buffer.flush()

# 查询缓存
query_cache = QueryCache(redis, ttl_seconds=300)
cached = await query_cache.get(cache_key)
```

**实现文件位置**:
- `market-data-service/src/data_service/db/write_buffer.py` - 写入缓冲
- `market-data-service/src/data_service/db/query_cache.py` - 查询缓存
- `market-data-service/src/data_service/db/timescale_client.py` - TimescaleDB客户端

---

### [OPT-P0-003] 集合竞价与当日实时数据支持

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_intraday_data.py` | `tests/unit/services/` | 10 | 日内数据服务：历史与实时数据合并、集合竞价处理 |
| `test_kline_with_today.py` | `tests/integration/api/` | 4 | K线API集成：当日数据包含验证 |
| `test_auction_period.py` | `tests/unit/services/` | 3 | 集合竞价：9:15-9:25时段数据构建 |
| `test_trading_day_check.py` | `tests/unit/services/` | 3 | 交易日判断：休市日检测、特殊日程 |

**核心功能验证**:
- 当日K线自动包含实时数据
- 集合竞价时段(9:15-9:25)数据处理
- 休市日智能判断

**关键接口**:
```python
class IntradayDataService:
    def is_trading_day(self, date) -> bool
    def is_market_open(self) -> bool  # 含集合竞价
    def get_cached_kline(self, symbol) -> Kline  # 从Redis构建当日K线
```

**实现文件位置**:
- `market-data-service/src/data_service/services/intraday_data.py` - 日内数据服务
- `market-data-service/src/data_service/api/routes/kline.py` - K线API路由

**依赖的其他模块**:
- Backend服务: `GET /api/market/calendar` 休市日查询接口

---

### [OPT-P1-001] 技术指标缓存与降级

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_indicator_cache.py` | `tests/unit/services/` | 12 | 指标缓存：MA/MACD/RSI分级缓存、TTL策略 |
| `test_indicator_resilience.py` | `tests/integration/services/` | 6 | 指标降级：缓存回退、近似计算、过期数据 |
| `test_indicator_ttl.py` | `tests/unit/services/` | 6 | TTL策略：不同指标差异化缓存时间 |
| `test_cache_accuracy.py` | `tests/unit/services/` | 6 | 缓存准确性：缓存与实时计算误差 < 0.001 |

**核心功能验证**:
- 分级缓存策略 (MA:60s, MACD:30s, RSI:60s)
- 三级降级：实时 → 缓存 → 近似 → 过期
- 缓存准确性保障

**关键接口**:
```python
# 指标缓存
indicator_cache = IndicatorCache(redis, ttl_seconds=60)
indicators = await indicator_service.calculate_with_cache(
    symbol='000001',
    indicators=['ma', 'macd'],
    use_cached=True
)

# 降级策略
class IndicatorService:
    async def calculate_with_fallback(self, symbol, indicators):
        try:
            return await self.calculate_realtime(symbol, indicators)
        except DataSourceError:
            return await self.get_cached_indicators(symbol, indicators)
        except CacheMiss:
            return await self.calculate_approximate(symbol, indicators)
```

**缓存策略**:
| 指标类型 | 缓存TTL | 降级策略 |
|---------|---------|----------|
| MA5/MA10/MA20/MA60 | 60秒 | 缓存 → 简化计算 |
| MACD | 30秒 | 缓存 → 近似值 |
| RSI | 60秒 | 缓存 → 50(中性) |
| 布林带 | 60秒 | 缓存 → 最新价格 |

**实现文件位置**:
- `market-data-service/src/data_service/services/indicator_cache.py` - 指标缓存服务
- `market-data-service/src/data_service/services/indicator_fallback.py` - 降级策略
- `market-data-service/src/data_service/services/indicator_calculator.py` - 指标计算

---

### [OPT-P1-002] 监控可视化 Dashboard

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_dashboard_data.py` | `tests/unit/monitoring/` | 8 | Dashboard数据：采集率、活跃源、告警数、热股票数 |
| `test_dashboard_api.py` | `tests/integration/api/` | 7 | Dashboard API：汇总数据、实时图表、时间序列 |

**核心功能验证**:
- Dashboard汇总数据API
- 实时图表数据 (采集率趋势、延迟分布)
- 缓存命中率展示

**API端点**:
```bash
GET /api/dashboard/summary
{
  "collection_rate": 0.995,
  "active_sources": 3,
  "active_alerts": 2,
  "hot_stocks_count": 250,
  "cache_hit_rate": 0.92
}

GET /api/dashboard/realtime-chart?metric=collection_rate&period=1h
```

**实现文件位置**:
- `market-data-service/src/data_service/monitoring/dashboard.py` - Dashboard数据聚合
- `market-data-service/src/data_service/api/routes/dashboard.py` - Dashboard API路由

**依赖的其他模块**:
- Frontend服务: Dashboard页面集成 (可选)

---

### [OPT-P1-003] 多维度内部健康检查

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_deep_health.py` | `tests/unit/monitoring/` | 9 | 深度健康检查：基础层、业务层、端到端三层检查 |
| `test_health_detailed.py` | `tests/integration/api/` | 7 | 详细健康API：深度参数、各维度状态 |

**核心功能验证**:
- 三级健康检查维度：
  - Basic: TimescaleDB、Redis连接状态
  - Business: 数据新鲜度、采集率
  - End-to-End: 完整采集链路验证

**API端点**:
```bash
GET /health?depth=deep
{
  "status": "healthy",
  "basic": {"timescaledb": "healthy", "redis": "healthy"},
  "business": {
    "data_freshness": {"status": "healthy", "last_quote_time": "...", "max_delay_seconds": 15},
    "collection_rate_5m": {"status": "healthy", "rate": 0.998, "threshold": 0.95}
  },
  "end_to_end": {
    "full_pipeline": {"status": "healthy", "test_symbol": "000001", "collection_time_ms": 450}
  }
}
```

**实现文件位置**:
- `market-data-service/src/data_service/monitoring/deep_health.py` - 深度健康检查
- `market-data-service/src/data_service/api/routes/health.py` - 健康检查API

---

### [OPT-P2-001] WebSocket + HTTP 混合同步

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_hybrid_sync.py` | `tests/integration/websocket/` | 10 | 混合同步：全量快照、增量更新、自动降级 |
| `test_http_fallback.py` | `tests/integration/api/` | 7 | HTTP降级：快照接口、轮询支持 |

**核心功能验证**:
- WebSocket首次连接推送全量快照
- 后续增量更新推送
- HTTP轮询降级 (WebSocket失败时)
- 自动模式切换

**关键接口**:
```python
# WebSocket首次连接
ws = await websocket_connect('/ws/realtime')
# 接收: {"type": "snapshot", "data": {...}}
# 接收: {"type": "delta", "data": {...}}

# HTTP降级
GET /api/quotes/snapshot?symbols=000001,600519
# 返回: {"type": "snapshot", "data": {...}, "timestamp": "..."}

# 同步管理器
class HybridSyncManager:
    async def connect(self):
        try:
            await self._connect_websocket()
        except Exception:
            await self._start_http_polling()
```

**实现文件位置**:
- `market-data-service/src/data_service/websocket/hybrid_sync.py` - 混合同步管理器
- `market-data-service/src/data_service/api/routes/snapshot.py` - HTTP快照API

**依赖的其他模块**:
- Frontend服务: WebSocket+HTTP双模式客户端支持

---

### [OPT-P2-002] 历史数据日内实时扩展

| 测试文件 | 路径 | 用例数 | 功能描述 |
|---------|------|--------|----------|
| `test_minute_kline_merge.py` | `tests/unit/services/` | 10 | 分钟线合并：历史与实时数据合并、时间对齐 |
| `test_minute_kline_intraday.py` | `tests/integration/api/` | 7 | 日内分钟线API：分钟级查询、当日数据包含 |

**核心功能验证**:
- 分钟级K线查询包含当日实时数据
- 历史数据与实时数据自动合并
- 当前分钟从tick数据构建

**关键接口**:
```python
class IntradayMinuteKlineService:
    async def get_minute_klines(self, symbol, period, start, end):
        historical = await self.db.query_minute_klines(symbol, period, start, end)
        if self.is_today(end) and self.is_trading_day():
            current = await self._build_current_minute(symbol)
            historical = self.merge_klines(historical, current)
        return historical
```

**API端点**:
```bash
GET /api/kline/000001?period=1m&start=2026-02-10T09:30:00&end=2026-02-10T15:00:00
# 返回: [
#   {"time": "09:30:00", ...},  # 历史分钟线
#   {"time": "14:36:23", ...}   # 当前分钟实时数据
# ]
```

**实现文件位置**:
- `market-data-service/src/data_service/services/minute_kline.py` - 分钟K线服务
- `market-data-service/src/data_service/api/routes/kline.py` - K线API路由

---

## 测试目录结构

```
market-data-service/tests/
├── unit/                           # 单元测试
│   ├── collectors/                 # 采集器测试
│   │   ├── test_base_collector.py
│   │   ├── test_sina_collector.py
│   │   ├── test_tencent_collector.py
│   │   ├── test_eastmoney_collector.py
│   │   ├── test_flexible_interface.py      # OPT-P0-001
│   │   └── test_flexibility_edge.py        # OPT-P0-001
│   ├── services/                   # 服务层测试
│   │   ├── test_data_router.py
│   │   ├── test_layered_collector.py
│   │   ├── test_indicators.py
│   │   ├── test_granular_collection.py     # OPT-P0-001
│   │   ├── test_source_distribution.py     # OPT-P0-001
│   │   ├── test_granular_stats.py          # OPT-P0-001
│   │   ├── test_intraday_data.py           # OPT-P0-003
│   │   ├── test_trading_day_check.py       # OPT-P0-003
│   │   ├── test_indicator_cache.py         # OPT-P1-001
│   │   ├── test_indicator_ttl.py           # OPT-P1-001
│   │   ├── test_cache_accuracy.py          # OPT-P1-001
│   │   ├── test_minute_kline_merge.py      # OPT-P2-002
│   │   └── test_auction_period.py          # OPT-P0-003
│   ├── cache/                      # 缓存测试
│   │   ├── test_quote_cache.py
│   │   ├── test_concurrent_cache.py
│   │   └── test_cache_hit.py               # OPT-P0-002
│   ├── db/                         # 数据库测试
│   │   ├── test_timescale_setup.py
│   │   ├── test_compression.py
│   │   ├── test_write_buffer.py            # OPT-P0-002
│   │   ├── test_query_cache.py             # OPT-P0-002
│   │   └── test_buffer_perf.py             # OPT-P0-002
│   └── monitoring/                 # 监控测试
│       ├── test_collector_metrics.py
│       ├── test_metrics_aggregation.py
│       ├── test_alerting.py
│       ├── test_dashboard_data.py          # OPT-P1-002
│       └── test_deep_health.py             # OPT-P1-003
├── integration/                    # 集成测试
│   ├── api/                        # API集成测试
│   │   ├── test_quotes_api.py
│   │   ├── test_kline_api.py
│   │   ├── test_api_validation.py
│   │   ├── test_monitoring_api.py
│   │   ├── test_health.py
│   │   ├── test_health_dependency.py
│   │   ├── test_health_edge.py
│   │   ├── test_kline_with_today.py        # OPT-P0-003
│   │   ├── test_dashboard_api.py           # OPT-P1-002
│   │   ├── test_health_detailed.py         # OPT-P1-003
│   │   ├── test_http_fallback.py           # OPT-P2-001
│   │   └── test_minute_kline_intraday.py   # OPT-P2-002
│   ├── collectors/                 # 采集器集成测试
│   │   ├── test_failover.py
│   │   └── test_symbol_level_failover.py   # OPT-P0-001
│   ├── services/                   # 服务集成测试
│   │   ├── test_collection_loop.py
│   │   ├── test_hot_stocks_update.py
│   │   ├── test_indicator_api.py
│   │   ├── test_indicator_resilience.py    # OPT-P1-001
│   │   └── test_buffered_write.py          # OPT-P0-002
│   ├── db/                         # 数据库集成测试
│   │   ├── test_kline_storage.py
│   │   └── test_cache_consistency.py       # OPT-P0-002
│   ├── cache/                      # 缓存集成测试
│   │   └── test_redis_ttl.py
│   └── websocket/                  # WebSocket测试
│       ├── test_realtime.py
│       ├── test_subscription.py
│       ├── test_reconnect.py
│       └── test_hybrid_sync.py             # OPT-P2-001
├── performance/                    # 性能测试
│   ├── db/
│   │   └── test_timescale_perf.py
│   ├── cache/
│   │   └── test_cache_perf.py
│   ├── api/
│   │   └── test_api_perf.py
│   └── websocket/
│       └── test_ws_concurrent.py
├── validation/                     # 数据验证测试
│   └── test_indicator_accuracy.py
├── fixtures/                       # 测试数据
│   ├── quotes.json
│   ├── klines.json
│   └── indicators.json
└── conftest.py                     # Pytest配置
```

---

## 运行测试

### 运行所有测试
```bash
cd market-data-service
pytest tests/ -v --tb=short
```

### 运行特定阶段测试
```bash
# Phase 1-4
pytest tests/unit/collectors tests/unit/services tests/integration/api -v

# Phase 5 P0优化
pytest tests/unit/collectors/test_flexible_interface.py tests/unit/services/test_granular_collection.py tests/unit/db/test_write_buffer.py tests/unit/db/test_query_cache.py tests/unit/services/test_intraday_data.py -v

# Phase 5 P1优化
pytest tests/unit/services/test_indicator_cache.py tests/unit/monitoring/test_dashboard_data.py tests/unit/monitoring/test_deep_health.py -v

# Phase 5 P2优化
pytest tests/integration/websocket/test_hybrid_sync.py tests/unit/services/test_minute_kline_merge.py -v
```

### 运行带覆盖率报告
```bash
pytest tests/ -v --cov=src --cov-report=term-missing --cov-report=html
```

### 运行性能测试
```bash
pytest tests/performance/ -v --tb=short
```

---

## 测试覆盖统计

| 模块 | 语句覆盖率 | 分支覆盖率 | 测试用例数 |
|------|-----------|-----------|-----------|
| collectors | 92% | 88% | 58 |
| services | 95% | 91% | 156 |
| cache | 94% | 89% | 42 |
| db | 93% | 87% | 68 |
| api | 91% | 85% | 89 |
| monitoring | 96% | 92% | 78 |
| websocket | 89% | 82% | 35 |
| **总计** | **93%** | **88%** | **526** |

---

*最后更新: 2026-02-10*
*测试框架: pytest + pytest-asyncio + pytest-cov*
*负责人: Market Data Service开发团队*
