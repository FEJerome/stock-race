# 历史数据日终采集方案设计

> **文档编号**: ARCH-HISTORY-001
> **版本**: v1.0
> **日期**: 2026-02-13
> **状态**: 待实施

---

## 1. 背景与问题

### 1.1 当前问题

Market Data Service 当前采用**按需查询**（懒加载）模式获取历史数据：

```
用户查询历史数据 → 实时调用Baostock API → 返回结果 → 缓存到DB
```

**问题**:
1. **首次查询慢**: 1~3秒延迟，影响用户体验
2. **数据源压力大**: 并发查询容易触发限流
3. **数据不完整**: 仅缓存被查询过的股票历史
4. **AI决策受阻**: AI Service需要完整历史数据进行技术指标计算

### 1.2 目标

实现**日终定时批量采集**，确保历史数据完整预加载：

```
每日19:00 → 批量采集全市场日K线 → 存入TimescaleDB → 用户查询直接从DB返回(<100ms)
```

---

## 2. 存储空间评估

### 2.1 数据规模

| 指标 | 数值 |
|------|------|
| A股总数 | 约 5,300 只 |
| 年交易日 | 约 242 天 |
| 单条K线大小 | 约 100 字节 |

### 2.2 存储计算

| 数据类型 | 10年原始数据 | TimescaleDB压缩后 | 优先级 |
|---------|-------------|-------------------|--------|
| **日K线 (1d)** | ~1.2 GB | **~360 MB** | **P0 - 必须** |
| 5分钟K线 | ~58 GB | ~17 GB | P2 - 可选 |
| 15分钟K线 | ~19 GB | ~6 GB | P2 - 可选 |
| 60分钟K线 | ~5 GB | ~1.5 GB | P2 - 可选 |

### 2.3 推荐配置

```yaml
生产环境推荐配置:
  存储大小: 20 GB
  数据保留策略:
    - 日K线: 永久保留
    - 分钟K线: 最近3年滚动
  预估成本: ¥430/月 (AWS RDS db.t3.medium)
```

**结论**: 存储空间完全可控，日K线仅需<1GB。

---

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     APScheduler                             │
│                  (每日19:00触发)                             │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  HistoryScheduler                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  任务编排                                            │    │
│  │  - 生成股票列表 (5,300只)                            │    │
│  │  - 分批调度 (100只/批)                               │    │
│  │  - 错误重试 (最多3次)                                │    │
│  │  - 超时控制 (每批10秒)                               │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│               DailyHistoryCollector                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 获取股票列表 │→│ 分批采集     │→│ 数据校验     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ↓                 ↓                 ↓               │
│  全市场5,300只    Baostock/Tushare    高开低收逻辑         │
│                   5分钟间隔/批       成交量>0              │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  TimescaleDB                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  stock_history hypertable                           │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │    │
│  │  │ Partition 1 │ │ Partition 2 │ │ Partition N │   │    │
│  │  │ (2026-01)   │ │ (2026-02)   │ │ (current)   │   │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心组件

#### 3.2.1 DailyHistoryCollector

**职责**: 执行批量历史数据采集

**关键方法**:
```python
class DailyHistoryCollector:
    async def collect_daily_kline(
        self,
        symbols: List[str],
        trade_date: date
    ) -> CollectionResult:
        """采集单批次股票日K线"""

    async def collect_all_stocks(
        self,
        trade_date: date,
        batch_size: int = 100
    ) -> List[CollectionResult]:
        """采集全市场股票日K线"""

    async def verify_data_integrity(
        self,
        symbol: str,
        trade_date: date,
        data: StockHistory
    ) -> bool:
        """校验数据完整性"""
```

**采集策略**:
- 分批大小: 100只股票/批
- 批次间隔: 5秒（避免限流）
- 重试机制: 失败重试3次，间隔2秒
- 超时控制: 每批10秒

#### 3.2.2 HistoryScheduler

**职责**: 定时任务调度

**配置**:
```python
HISTORY_COLLECTION_SCHEDULE = {
    "daily_collection": {
        "trigger": "cron",
        "hour": 19,        # 19:00 (收盘后1小时)
        "minute": 0,
        "timezone": "Asia/Shanghai"
    },
    "integrity_check": {
        "trigger": "cron",
        "hour": 20,        # 20:00 (采集完成后)
        "minute": 0
    },
    "weekly_cleanup": {
        "trigger": "cron",
        "day_of_week": "sun",
        "hour": 21,
        "minute": 0
    }
}
```

#### 3.2.3 DataIntegrityChecker

**职责**: 数据完整性检查和自动补全

**检查项**:
1. **缺失检测**: 检查哪些股票缺失某日数据
2. **逻辑校验**: 高开低收是否合理
3. **连续性检查**: 时间序列是否连续
4. **自动补全**: 检测缺失后自动触发补采

### 3.3 数据源策略

**优先级**:
1. **Baostock** (主): 免费、稳定、数据完整
2. **Tushare** (备): 需要Token，数据质量高
3. **AkShare** (备): 免费，作为最后备用

**故障切换**:
```python
async def collect_with_fallback(symbol: str, date: date):
    try:
        return await baostock_collector.get_history(symbol, date)
    except DataSourceError:
        logger.warning(f"Baostock failed for {symbol}, trying Tushare")
        return await tushare_collector.get_history(symbol, date)
```

---

## 4. 数据模型

### 4.1 stock_history 表

```sql
CREATE TABLE stock_history (
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    interval VARCHAR(10) NOT NULL DEFAULT '1d',
    open DECIMAL(10, 4) NOT NULL,
    high DECIMAL(10, 4) NOT NULL,
    low DECIMAL(10, 4) NOT NULL,
    close DECIMAL(10, 4) NOT NULL,
    volume BIGINT NOT NULL,
    amount DECIMAL(20, 2),
    adj_close DECIMAL(10, 4),      -- 后复权收盘价
    vwap DECIMAL(10, 4),           -- 成交量加权平均价
    data_source VARCHAR(20),        -- 数据来源
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (symbol, timestamp, interval)
);

-- 转换为 hypertable
SELECT create_hypertable('stock_history', 'timestamp',
    chunk_time_interval => INTERVAL '7 days');

-- 索引
CREATE INDEX idx_stock_history_symbol_interval
    ON stock_history (symbol, interval, timestamp DESC);
```

### 4.2 采集任务表

```sql
CREATE TABLE history_collection_tasks (
    id SERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,    -- pending/running/completed/failed
    total_stocks INT NOT NULL,
    completed_stocks INT DEFAULT 0,
    failed_stocks INT DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. 测试策略 (TDD)

### 5.1 单元测试

#### test_daily_history_collector.py (15+测试)

```python
class TestDailyHistoryCollector:
    """日终历史数据采集器测试"""

    async def test_collect_single_stock(self):
        """测试单只股票采集"""

    async def test_collect_batch_stocks(self):
        """测试批量采集"""

    async def test_data_source_fallback(self):
        """测试数据源故障切换"""

    async def test_rate_limit_handling(self):
        """测试限流处理"""

    async def test_data_integrity_verification(self):
        """测试数据完整性校验"""

    async def test_retry_mechanism(self):
        """测试重试机制"""
```

#### test_history_scheduler.py (10+测试)

```python
class TestHistoryScheduler:
    """历史数据调度器测试"""

    def test_schedule_daily_task(self):
        """测试每日定时任务"""

    def test_concurrent_batch_control(self):
        """测试并发批次控制"""

    def test_task_timeout_handling(self):
        """测试任务超时处理"""

    def test_error_notification(self):
        """测试错误通知"""
```

#### test_data_integrity_checker.py (12+测试)

```python
class TestDataIntegrityChecker:
    """数据完整性检查测试"""

    def test_missing_data_detection(self):
        """测试缺失数据检测"""

    def test_auto_replenishment(self):
        """测试自动补全"""

    def test_logic_validation(self):
        """测试逻辑校验（高开低收）"""

    def test_continuity_check(self):
        """测试连续性检查"""
```

### 5.2 集成测试

```python
class TestHistoryCollectionIntegration:
    """历史数据采集集成测试"""

    async def test_end_to_end_daily_collection(self):
        """测试端到端日终采集流程"""

    async def test_database_write_performance(self):
        """测试数据库写入性能"""

    async def test_query_performance_after_collection(self):
        """测试采集后查询性能"""

    async def test_datasource_failover_integration(self):
        """测试数据源故障切换集成"""
```

### 5.3 性能测试

| 测试项 | 目标 | 测试方法 |
|--------|------|----------|
| 全量采集时间 | < 30分钟 | 5,300只股票，记录总耗时 |
| 单批采集时间 | < 10秒 | 100只股票/批 |
| 数据库存入性能 | > 1000条/秒 | 批量写入测试 |
| 历史查询性能 | < 100ms | 单只股票1年历史查询 |
| 并发查询性能 | < 500ms | 100并发查询 |

---

## 6. API 设计

### 6.1 历史数据查询 API (优化)

```python
@router.get("/stocks/{symbol}/history")
async def get_stock_history(
    symbol: str,
    days: int = Query(30, ge=1, le=365*10),
    interval: str = Query("1d", regex="^(1d|1w|1M|5m|15m|30m|60m)$"),
    adjusted: bool = Query(True),   # 是否复权
    db: Database = Depends(get_db)
):
    """
    获取股票历史数据

    优先从TimescaleDB查询，确保高性能响应
    """
    # 1. 优先从数据库查询
    history = await db.get_stock_history(symbol, days, interval)

    if history:
        return {"success": True, "data": history, "source": "database"}

    # 2. 数据库缺失，实时采集（兜底）
    logger.warning(f"History not found in DB for {symbol}, fetching from source")
    history = await collector.get_stock_history(symbol, days, interval)

    # 3. 异步存入数据库（不阻塞返回）
    asyncio.create_task(db.save_stock_history(history))

    return {"success": True, "data": history, "source": "realtime"}
```

### 6.2 采集状态查询 API

```python
@router.get("/admin/history/collection/status")
async def get_collection_status(
    date: Optional[date] = None,
    db: Database = Depends(get_db)
):
    """获取历史数据采集状态（管理员接口）"""
    return {
        "trade_date": date or today(),
        "status": "completed",  # pending/running/completed/failed
        "total_stocks": 5300,
        "completed_stocks": 5300,
        "failed_stocks": 0,
        "completion_rate": "100%",
        "started_at": "2026-02-13T19:00:00",
        "completed_at": "2026-02-13T19:25:30",
        "duration_seconds": 1530
    }
```

---

## 7. 部署与运维

### 7.1 Docker Compose 配置

```yaml
# docker-compose.integration.yml
services:
  market-data-service:
    # ... 现有配置 ...
    environment:
      - HISTORY_COLLECTION_ENABLED=true
      - HISTORY_COLLECTION_TIME=19:00
      - HISTORY_BATCH_SIZE=100
      - HISTORY_BATCH_INTERVAL=5
```

### 7.2 监控告警

```yaml
# 告警规则
alerts:
  - name: history_collection_failed
    condition: collection_status == "failed"
    severity: critical

  - name: history_collection_slow
    condition: duration_minutes > 45
    severity: warning

  - name: history_data_missing
    condition: completion_rate < 99%
    severity: warning
```

### 7.3 日志规范

```python
# 采集开始
logger.info("[HistoryCollection] Started",
    extra={"trade_date": "2026-02-13", "total_stocks": 5300})

# 批次完成
logger.info("[HistoryCollection] Batch completed",
    extra={"batch": 5, "completed": 500, "failed": 0})

# 采集完成
logger.info("[HistoryCollection] Completed",
    extra={"duration_seconds": 1530, "completion_rate": "100%"})

# 错误日志
logger.error("[HistoryCollection] Failed",
    extra={"symbol": "000001.SZ", "error": "timeout", "retry": 3})
```

---

## 8. 实施计划

### 8.1 任务拆分

| 编号 | 任务 | 预计工作量 | 依赖 |
|------|------|-----------|------|
| T-020 | DailyHistoryCollector | 1.5天 | 无 |
| T-021 | HistoryScheduler | 1天 | T-020 |
| T-022 | DataIntegrityChecker | 0.5天 | T-021 |
| T-023 | HistoryDataInitializer | 0.5天 | T-022 |
| T-024 | API优化 | 0.5天 | T-023 |
| **合计** | | **4天** | |

### 8.2 开发顺序

```
Day 1: T-020 (测试先行)
  - 编写 test_daily_history_collector.py (Red)
  - 实现 DailyHistoryCollector (Green)
  - 重构优化

Day 2: T-021 (测试先行)
  - 编写 test_history_scheduler.py (Red)
  - 实现 HistoryScheduler (Green)
  - 集成测试

Day 3: T-022 + T-023
  - DataIntegrityChecker 实现
  - 全量初始化脚本

Day 4: T-024 + 集成测试
  - API优化
  - 端到端测试
```

---

## 9. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 数据源限流 | 中 | 采集时间延长 | 分批采集、5秒间隔、多数据源备用 |
| 数据不一致 | 低 | AI决策错误 | 数据校验、异常告警、人工复核 |
| 存储空间不足 | 低 | 服务中断 | 监控预警、自动扩容、数据归档 |
| 定时任务失败 | 低 | 数据缺失 | 失败告警、自动重试、手动触发接口 |

---

## 10. 附录

### 10.1 术语表

- **日K线**: 日线数据，包含开盘价、最高价、最低价、收盘价、成交量
- **后复权**: 考虑分红送股后的价格调整，适合长期分析
- **Hypertable**: TimescaleDB的时序数据分区表
- **Chunk**: 时序数据的物理分区

### 10.2 参考文档

- [TimescaleDB 最佳实践](https://docs.timescale.com/)
- [Baostock API 文档](http://baostock.com/baostock/index.php/A股K线数据)
- [APScheduler 用户指南](https://apscheduler.readthedocs.io/)

---

*文档版本: v1.0*
*最后更新: 2026-02-13*
*维护者: 首席架构师*
