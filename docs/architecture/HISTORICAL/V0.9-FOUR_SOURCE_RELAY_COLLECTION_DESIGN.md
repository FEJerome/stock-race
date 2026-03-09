# 4源接力式混合采集方案设计文档

**文档版本**: 1.0
**创建时间**: 2026-02-13
**适用范围**: Market Data Service 生产环境
**状态**: 已实施

---

## 1. 设计背景与目标

### 1.1 问题背景

原有采集方案存在以下问题：
- **高频层优先**：三源故障时只保100只高频股票，舍弃全量数据
- **完全备份冗余**：双源并行采集相同股票，造成100%冗余
- **失败处理粗糙**：失败时切换整个数据源，而非补偿失败部分

### 1.2 设计目标

1. **全量优先**：任何情况下优先保证5000只股票全覆盖
2. **接力补偿**：分段采集+失败接力，避免完全备份
3. **动态降级**：60s → 90s → 120s → 180s，以时间换覆盖
4. **15%重叠冗余**：高效利用多源能力，非100%备份

---

## 2. 核心设计

### 2.1 双轨架构

```
┌─────────────────────────────────────────────────────────────┐
│                    双轨采集架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  用户关注层（动态100只）                                      │
│  ├── 目标：当前活跃用户查看的股票快速更新（10秒）              │
│  ├── 场景：用户打开小程序查看AI账户持仓                       │
│  └── 优先级：低（锦上添花）                                   │
│                                                              │
│  全量覆盖层（全部5000只）← 核心目标                           │
│  ├── 目标：每只股票的最新数据不超过120秒                      │
│  ├── 间隔：60s（正常）→ 90s（降级1）→ 120s（降级2）          │
│  └── 优先级：高（必须保底）                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**关键原则**：用户关注层可随时丢弃，全量层必须保证

### 2.2 接力式采集机制

#### 2.2.1 分段分配策略

```python
# 5000只股票的分配（带15%重叠）
assignments = {
    "sina":     stocks[0:2000],       # 40%（0-2000）
    "tencent":  stocks[1500:3500],    # 40%（1500-3500）与前重叠500只
    "eastmoney":stocks[3000:4250],    # 25%（3000-4250）与前重叠500只
    "baostock": stocks[4000:5000] + stocks[0:500]  # 20%（回绕重叠）
}

# 重叠设计：
# - 新浪：0-2000
# - 腾讯：1500-3500（与新浪重叠500只）
# - 东财：3000-4250（与腾讯重叠500只）
# - Baostock：4000-5000 + 0-500（与东财重叠500只，与新浪重叠500只）
```

**重叠目的**：
- 不是完全备份，而是**失败补偿池**
- 某源失败时，重叠部分可由其他源补偿
- 总冗余度：125%（25%重叠），而非200%（完全备份）

#### 2.2.2 接力采集流程

```
第一轮采集（并行）
    ├── 新浪采集0-2000
    ├── 腾讯采集1500-3500
    ├── 东财采集3000-4250
    └── Baostock采集4000-5000+0-500
           ↓
    识别失败股票（如：新浪失败20只，腾讯失败30只）
           ↓
第二轮采集（接力补偿）
    └── 用其他源补偿失败的50只
           ↓
    合并结果（覆盖率目标：99%）
```

**关键区别**：
- 传统方案：双源同时采集全部100只（200只请求）
- 接力方案：分段采集+补偿（100 + 失败数请求，通常<120只）

### 2.3 容灾降级策略

| 可用源数量 | 降级级别 | 采集间隔 | 目标覆盖率 | 策略 |
|-----------|---------|---------|-----------|------|
| 4个 | Normal | 60秒 | 99% | 标准接力采集 |
| 3个 | Degraded-1 | 90秒 | 95% | 增加每源采集量 |
| 2个 | Degraded-2 | 120秒 | 90% | 大幅增加每源采集量 |
| 1个 | Critical | 180秒 | 70% | 单源轮询全量 |

**核心原则**：宁可降频，也不减覆盖

---

## 3. 代码实现

### 3.1 核心类设计

#### 3.1.1 RelayCollector（接力采集器）

```python
class RelayCollector:
    """
    接力式采集器

    职责：
    1. 分段分配股票给各数据源
    2. 并行执行第一轮采集
    3. 识别失败股票
    4. 调度补偿采集
    5. 合并最终结果
    """

    def assign_with_overlap(self, stocks: List[str]) -> Dict[str, List[str]]
    def collect_with_relay(self, stocks: List[str]) -> Dict[str, Dict]
    def compensation_collect(self, failed_stocks: List[str]) -> Dict
```

#### 3.1.2 FullCoverageScheduler（全量优先调度器）

```python
class FullCoverageScheduler:
    """
    全量优先调度器

    职责：
    1. 检查可用数据源数量
    2. 确定降级级别
    3. 动态调整采集间隔
    4. 确保覆盖率目标
    """

    def get_degradation_level(self) -> str
    def redistribute_for_coverage(self, stocks: List[str]) -> Dict
    def calculate_coverage(self, results: Dict, total: int) -> float
```

### 3.2 关键算法

#### 3.2.1 分段分配算法

```python
def assign_with_overlap(self, all_stocks: List[str]) -> Dict[str, List[str]]:
    """
    分配策略：分段+最小重叠

    目标：
    - 每只至少被1个源采集
    - 理想情况下被1.2个源覆盖（20%重叠）
    """
    n = len(all_stocks)

    # 分配比例：40% + 40% + 25% + 20% = 125%（25%重叠）
    assignments = {
        "sina": all_stocks[0:int(n*0.4)],
        "tencent": all_stocks[int(n*0.3):int(n*0.7)],  # 与前重叠10%
        "eastmoney": all_stocks[int(n*0.6):int(n*0.85)], # 与前重叠10%
        "baostock": all_stocks[int(n*0.8):] + all_stocks[:int(n*0.1)]  # 回绕
    }

    return assignments
```

#### 3.2.2 接力补偿算法

```python
async def compensation_collect(self, failed_stocks: List[str]) -> Dict:
    """
    接力补偿：用备用源采集失败的股票

    策略：
    1. 优先用速度快的源（新浪、腾讯）
    2. 分批补偿，避免单批次过大
    3. 记录补偿成功率用于后续优化
    """
    results = {}
    remaining = failed_stocks[:]

    # 补偿顺序：新浪 → 腾讯 → 东财
    for source in ["sina", "tencent", "eastmoney"]:
        if not remaining:
            break

        batches = self.chunk(remaining, 50)
        for batch in batches:
            batch_result = await self.collect_from_source(source, batch)
            results.update(batch_result)
            remaining = [s for s in remaining if s not in batch_result]

    return results
```

---

## 4. 时段感知策略

### 4.1 交易时段（09:30-11:30, 13:00-15:00）

```yaml
high_freq_layer:
  enabled: true
  stocks: 100
  interval: 10s
  sources: [sina, tencent]

full_layer:
  interval: 60s
  sources: [sina, tencent, eastmoney, baostock]
```

### 4.2 收盘过渡期（15:00-15:05）

```yaml
high_freq_layer:
  enabled: true
  stocks: 50
  interval: 30s

full_layer:
  interval: 60s
  sources: [sina, tencent, eastmoney]  # 禁用Baostock
```

### 4.3 收盘后（15:05-19:00）

```yaml
high_freq_layer:
  enabled: false  # 禁用高频层

full_layer:
  interval: 120s
  sources: [sina, tencent, eastmoney]  # Baostock禁用
```

### 4.4 晚间时段（19:00-09:15）

```yaml
high_freq_layer:
  enabled: false

full_layer:
  interval: 300s  # 5分钟
  sources: [sina, tencent]  # 仅基础源
```

---

## 5. 容灾能力

### 5.1 故障场景处理

| 故障场景 | 系统响应 | 数据覆盖 | 用户体验 |
|---------|---------|---------|---------|
| 单源故障（如新浪） | 腾讯/东财/Baostock接管 | 100% | 无感知 |
| 双源故障 | 剩余双源增加采集量 | 95% | 轻微延迟增加 |
| 三源故障 | 单源降频采集全量 | 70% | 数据更新变慢（180秒） |
| Baostock收盘后故障 | 正常（预设禁用） | 100% | 无感知 |
| 东财name字段缺失 | 本地缓存自动填充 | 100% | 无感知 |

### 5.2 自动恢复

```python
# 数据源健康检查与自动恢复
if source.consecutive_errors >= 10:
    source.is_active = False
    logger.warning(f"禁用数据源: {source.name}")

# 5分钟后尝试恢复
if not source.is_active and time_since_error > 5min:
    source.is_active = True
    source.consecutive_errors = 0
    logger.info(f"恢复数据源: {source.name}")
```

---

## 6. 性能指标

### 6.1 目标指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 全量覆盖率 | ≥99% | 5000只中至少4950只有数据 |
| 采集周期 | ≤60秒（正常） | 单轮全量采集完成时间 |
| 用户关注层延迟 | ≤10秒 | 活跃用户查看的股票更新频率 |
| 数据新鲜度 | ≤120秒（最坏） | 任意股票数据的最大延迟 |
| 系统冗余度 | 125% | 25%重叠用于失败补偿 |

### 6.2 监控告警

```yaml
alerts:
  - name: coverage_drop
    condition: coverage < 0.95
    severity: warning
    action: notify_ops

  - name: single_source_failure
    condition: healthy_sources < 4
    severity: info
    action: auto_rebalance

  - name: critical_degradation
    condition: healthy_sources < 2
    severity: critical
    action: page_oncall
```

---

## 7. 配置参数

### 7.1 核心配置

```yaml
# config.yaml

collection:
  strategy: relay  # 接力式采集

  full_layer:
    stocks: 5000
    interval_normal: 60
    interval_degraded_1: 90
    interval_degraded_2: 120
    interval_critical: 180
    target_coverage: 0.99
    overlap_ratio: 0.15  # 15%重叠

  focus_layer:
    enabled: true
    stocks: 100
    interval: 10
    condition: trading_hours_only

  assignment:
    sina: 0.40
    tencent: 0.40
    eastmoney: 0.25
    baostock: 0.20

  failure_handling:
    compensation_delay: 0.5
    max_retry: 2

  disaster_recovery:
    principle: coverage_over_speed
    min_coverage: 0.70
```

### 7.2 数据源配置

```yaml
sources:
  sina:
    batch_size: 50
    interval: 1.0
    success_rate: 0.96
    weight: 0.40

  tencent:
    batch_size: 50
    interval: 1.0
    success_rate: 0.92
    weight: 0.40

  eastmoney:
    batch_size: 20
    interval: 2.0
    success_rate: 1.0
    weight: 0.25
    name_cache: enabled  # 启用本地name缓存

  baostock:
    batch_size: 20
    interval: 5.0
    success_rate: 0.67
    weight: 0.20
    after_hours: disabled  # 收盘后禁用
```

---

## 8. 实现文件清单

| 文件 | 路径 | 说明 |
|------|------|------|
| relay_collector.py | `collectors/relay_collector.py` | 接力采集器核心实现 |
| router.py | `collectors/router.py` | 修改后的路由调度器 |
| stock_name_cache.py | `utils/stock_name_cache.py` | 股票名称本地缓存 |
| full_coverage_scheduler.py | `services/full_coverage_scheduler.py` | 全量优先调度器 |

---

## 9. 测试验证

### 9.1 单元测试

```python
# test_relay_collector.py

async def test_assign_with_overlap():
    """测试分段分配"""
    stocks = [f"{i:06d}.SZ" for i in range(5000)]
    assignments = collector.assign_with_overlap(stocks)

    # 验证每只至少被分配一次
    all_assigned = set()
    for source_stocks in assignments.values():
        all_assigned.update(source_stocks)
    assert len(all_assigned) == 5000

    # 验证重叠度约15%
    total = sum(len(s) for s in assignments.values())
    overlap = (total - 5000) / 5000
    assert 0.10 < overlap < 0.30

async def test_compensation_collect():
    """测试接力补偿"""
    failed = ["000001.SZ", "600519.SH"]
    results = await collector.compensation_collect(failed)

    # 验证失败股票被补偿
    assert len(results) == len(failed)
```

### 9.2 集成测试

```python
# test_full_collection.py

async def test_full_coverage_under_failure():
    """测试故障下的全量覆盖"""
    # 模拟3个源故障
    router.simulate_failure(["sina", "tencent", "eastmoney"])

    # 执行采集
    results = await router.collect_full_layer(all_stocks)

    # 验证覆盖率≥70%
    coverage = len(results) / len(all_stocks)
    assert coverage >= 0.70
```

---

## 10. 文档留痕

| 文档 | 路径 | 状态 |
|------|------|------|
| 本设计文档 | `docs/architecture/CURRENT/FOUR_SOURCE_RELAY_COLLECTION_DESIGN.md` | ✅ 已创建 |
| 代码实现 | `market-data-service/src/data_service/collectors/` | ✅ 已实施 |
| 测试脚本 | `market-data-service/tests/unit/collectors/` | ⏳ 待补充 |
| 更新记录 | `docs/modules/market-data-service/TODO.md` | ✅ 已更新 |

---

## 11. 后续优化方向

1. **智能预测**：基于历史数据预测各源成功率，动态调整分配
2. **自适应间隔**：根据系统负载自动调整采集间隔
3. **多级缓存**：Redis → 本地内存 → 磁盘，多层降级
4. **A/B测试**：对比不同重叠度（10%/15%/20%）的效果

---

**设计总结**：

本方案通过**接力式采集**机制，在保证99%全量覆盖率的前提下，将系统冗余度从200%（完全备份）降低到125%（15%重叠），实现了高效、可靠、可降级的4源混合采集系统。

---

*本文档最后更新于：2026-02-13*
