# 系统降级方案设计文档

## 1. 概述

### 1.1 设计目标

当核心数据源（新浪财经）不可用时，系统能够自动降级并维持运行，确保：
- 最小化功能损耗
- 保持数据采集能力
- 实现平滑过渡
- 支持自动恢复

### 1.2 核心原则

| 原则 | 说明 |
|------|------|
| **可用性优先** | 降级时优先保证系统可用，而非数据完整性 |
| **渐进降级** | 按层级逐步降级，而非完全失效 |
| **自动切换** | 无需人工干预，系统自动检测并切换 |
| **快速恢复** | 主源恢复后自动切换回正常模式 |

---

## 2. 数据源可用性评估

### 2.1 当前数据源状态

| 数据源 | 单股成功率 | 批量成功率 | 平均响应 | 容量 | 鲁棒性 |
|--------|-----------|-----------|---------|------|--------|
| **新浪财经** | 100% | 100% (5只) | 0.33s | 100只/批 | A+ (主源) |
| **腾讯财经** | 100% | 0% (需修复) | 0.37s | 150只/批 | B (降级候选) |
| **东方财富** | 100% | 0% (需修复) | 0.43s | 50只/批 | B (降级候选) |
| **Baostock** | 0% (单股bug) | 100% (历史) | 0.38s | 100只/批 | D (修复后可用) |
| **AkShare** | 0% (慢) | 100% (慢) | 68.66s | 200只/批 | C (优化后可用) |
| **Tushare** | 0% (未配置) | 0% (未配置) | 0.01s | 50只/批 | F (配置后A+) |

### 2.2 修复后的预期状态

| 数据源 | 修复后单股 | 修复后批量 | 降级角色 |
|--------|-----------|-----------|---------|
| **腾讯财经** | 100% | 100% | 一级降级源 |
| **东方财富** | 100% | 100% | 一级降级源 |
| **Baostock** | 100% | 100% | 二级降级源 (历史) |
| **AkShare** | 100% | 100% | 备用源 (慢但全) |
| **Tushare** | 100% | 100% | 高质备用 (需token) |

---

## 3. 分层降级策略

### 3.1 降级级别定义

```
┌─────────────────────────────────────────────────────────────┐
│                    降级层级架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  L0: 正常模式 ──► 新浪财经 (批量100只, 0.33s)               │
│         │                                                   │
│         ▼ (新浪财经不可用)                                   │
│  L1: 一级降级 ──► 腾讯+东方并行 (批量150+50只, ~0.4s)        │
│         │                                                   │
│         ▼ (一级源不可用)                                     │
│  L2: 二级降级 ──► Baostock+AkShare (批量100+200只, 慢)      │
│         │                                                   │
│         ▼ (二级源不可用)                                     │
│  L3: 三级降级 ──► Tushare+单股聚合 (50只/批+串行)            │
│         │                                                   │
│         ▼ (三级源不可用)                                     │
│  L4: 极限降级 ──► 单源轮询+缓存 (仅热点股票)                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 各级别详细策略

#### L0 - 正常模式

```yaml
状态: 新浪财经可用
采集策略:
  - 中频层: 新浪批量 100只/次, 3次完成300只, 耗时~1.5s
  - 低频层: 新浪批量 100只/次, 50次完成5000只, 耗时~25s
数据完整性: 100%
实时性: 10秒延迟
功能完整性: 100%
```

#### L1 - 一级降级

```yaml
触发条件: 新浪财经连续3次请求失败 或 响应时间>5s
切换策略:
  - 主降级源: 腾讯财经 (批量150只/次)
  - 辅助源: 东方财富 (批量50只/次)
  - 并行采集: 腾讯+东方同时请求
采集策略:
  - 中频层: 腾讯150只 + 东方50只 = 200只/批
  - 低频层: 轮询采集, 预计40s完成5000只
数据完整性: 95% (可能有少量缺失)
实时性: 15-20秒延迟
功能完整性: 95%
  - 核心功能: ✓ 全部可用
  - AI决策: ✓ 可用 (数据延迟+5s)
  - 实时行情: ✓ 可用
  - 历史数据: ✓ 可用
```

#### L2 - 二级降级

```yaml
触发条件: 腾讯+东方均不可用
切换策略:
  - 主降级源: Baostock (批量100只/次, 历史数据为主)
  - 辅助源: AkShare (批量200只/次, 全市场)
采集策略:
  - 中频层: AkShare全市场缓存, 5秒刷新
  - 低频层: Baostock历史 + AkShare实时混合
数据完整性: 85%
实时性: 30-60秒延迟
功能完整性: 85%
  - 核心功能: ✓ 交易可用
  - AI决策: △ 可用 (使用延迟数据)
  - 实时行情: △ 延迟较大
  - 历史数据: ✓ Baostock强项
```

#### L3 - 三级降级

```yaml
触发条件: 上述源均不可用, 仅Tushare可用
切换策略:
  - 主降级源: Tushare (批量50只/次, 需token)
  - 补充策略: 单股并行请求
采集策略:
  - 中频层: Tushare批量 50只/次, 6次完成300只
  - 低频层: 分批采集, 预计90s完成5000只
数据完整性: 80%
实时性: 60-90秒延迟
功能完整性: 75%
  - 核心功能: ✓ 交易可用
  - AI决策: △ 延迟决策
  - 实时行情: ✗ 延迟严重
  - 历史数据: ✓ Tushare质量高
```

#### L4 - 极限降级

```yaml
触发条件: 所有批量接口不可用
切换策略:
  - 缓存优先: 使用Redis缓存的最近数据
  - 单股轮询: 单股接口逐个请求
  - 热点优先: 仅采集沪深300成分股
采集策略:
  - 中频层: 仅100只热点股票
  - 低频层: 暂停全量采集
数据完整性: 60% (仅热点股票)
实时性: 2-5分钟延迟
功能完整性: 50%
  - 核心功能: △ 仅热点股票可交易
  - AI决策: ✗ 暂停新决策
  - 实时行情: △ 仅部分股票
  - 历史数据: ✓ 数据库缓存
```

---

## 4. 故障检测机制

### 4.1 健康检查指标

```python
class HealthChecker:
    """数据源健康检查器"""

    # 检查指标
    METRICS = {
        "success_rate": {
            "threshold": 0.95,      # 成功率阈值95%
            "window": 60,           # 60秒滑动窗口
        },
        "response_time": {
            "threshold": 2.0,       # 响应时间阈值2秒
            "p95_threshold": 5.0,   # P95响应时间5秒
        },
        "error_count": {
            "threshold": 5,         # 连续错误次数阈值
            "reset_after": 300,     # 5分钟后重置
        },
        "stale_data": {
            "threshold": 30,        # 数据过期阈值30秒
        }
    }
```

### 4.2 降级触发条件

| 条件 | L1触发 | L2触发 | L3触发 | L4触发 |
|------|--------|--------|--------|--------|
| 主源失败次数 | 3次 | - | - | - |
| 主源成功率 | <95% | - | - | - |
| 主源响应时间 | >5s | - | - | - |
| 一级源失败 | - | 全部 | - | - |
| 二级源失败 | - | - | 全部 | - |
| 批量接口失败 | - | - | - | 全部 |

### 4.3 自动恢复检测

```python
async def check_recovery(current_level: int) -> bool:
    """检查是否可以从降级恢复"""

    # 每30秒检查一次恢复条件
    if current_level >= 1:
        # 检查新浪财经是否恢复
        sina_health = await check_source_health("sina")
        if sina_health["success_rate"] > 0.99 and \
           sina_health["avg_response"] < 1.0:
            return True

    return False
```

---

## 5. 自动切换逻辑

### 5.1 降级切换流程

```
┌──────────────┐
│   开始      │
└──────┬───────┘
       │
       ▼
┌──────────────────┐     失败     ┌──────────────┐
│ 检查新浪健康状态 │ ─────────────►│ 触发L1降级   │
│ (3次连续失败?)  │               │              │
└──────────────────┘               └──────┬───────┘
       │ 正常                            │
       ▼                                   │
┌──────────────────┐                       │
│   继续正常模式   │                       │
└──────────────────┘                       │
                                           ▼
                          ┌──────────────────────────┐
                          │ L1: 切换至腾讯+东方      │
                          │ - 并行采集               │
                          │ - 数据合并               │
                          └────────────┬─────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │ 失败             │                 成功
                    ▼                  │                  ▼
          ┌─────────────────┐          │      ┌──────────────────┐
          │ 触发L2降级      │          │      │ 持续监控新浪恢复 │
          └────────┬────────┘          │      │ (每30秒检查)    │
                   │                   │      └──────────────────┘
                   ▼                   │
     ┌─────────────────────────┐       │
     │ L2: 切换至Baostock+     │       │
     │       AkShare           │       │
     └───────────┬─────────────┘       │
                 │                     │
    ┌────────────┼────────────┐        │
    │ 失败       │           成功      │
    ▼            │            ▼        │
┌──────────┐    │   ┌────────────────┐│
│ 触发L3   │    │   │ 持续监控上级源 ││
└────┬─────┘    │   │ 恢复情况       ││
     │          │   └────────────────┘│
     ▼          │
┌─────────────────────┐
│ L3: 切换至Tushare   │
│    (配置可用时)     │
└───────────┬─────────┘
            │
   ┌────────┼────────┐
   │ 失败   │      成功
   ▼        │        ▼
┌───────┐   │  ┌────────────────┐
│ 触发L4│   │  │ 持续监控上级源 │
│ 极限  │   │  │ 恢复情况       │
└───────┘   │  └────────────────┘
            │
            ▼
┌─────────────────────┐
│ L4: 极限降级模式    │
│ - 仅缓存+单股      │
│ - 热点股票优先     │
└─────────────────────┘
```

### 5.2 降级管理器实现

```python
class DegradationManager:
    """系统降级管理器"""

    DEGRADATION_LEVELS = {
        0: "NORMAL",      # 正常模式
        1: "DEGRADED_L1", # 一级降级
        2: "DEGRADED_L2", # 二级降级
        3: "DEGRADED_L3", # 三级降级
        4: "CRITICAL",    # 极限降级
    }

    def __init__(self):
        self.current_level = 0
        self.primary_source = "sina"
        self.backup_sources = {
            1: ["tencent", "eastmoney"],
            2: ["baostock", "akshare"],
            3: ["tushare"],
            4: ["cache_only"],
        }
        self.health_checker = HealthChecker()
        self.recovery_checker = RecoveryChecker()

    async def evaluate_and_switch(self):
        """评估当前状态并执行切换"""

        # 检查当前级别数据源健康状态
        if self.current_level == 0:
            health = await self.health_checker.check(self.primary_source)
            if not health.is_healthy:
                await self.degrade_to(1)

        elif self.current_level >= 1:
            # 检查是否可恢复
            if await self.recovery_checker.check_recovery():
                await self.recover_to(0)
                return

            # 检查当前降级源是否健康
            current_sources = self.backup_sources[self.current_level]
            all_unhealthy = all(
                not (await self.health_checker.check(s)).is_healthy
                for s in current_sources
            )

            if all_unhealthy and self.current_level < 4:
                await self.degrade_to(self.current_level + 1)

    async def degrade_to(self, level: int):
        """降级到指定级别"""
        logger.warning(f"系统降级: L{self.current_level} -> L{level}")

        old_level = self.current_level
        self.current_level = level

        # 触发降级事件
        await self._emit_degradation_event(old_level, level)

        # 更新数据源配置
        await self._update_data_source_config(level)

        # 发送告警通知
        await self._send_alert(f"系统已降级至L{level}")

    async def recover_to(self, level: int):
        """恢复到指定级别"""
        logger.info(f"系统恢复: L{self.current_level} -> L{level}")

        old_level = self.current_level
        self.current_level = level

        # 触发恢复事件
        await self._emit_recovery_event(old_level, level)

        # 更新数据源配置
        await self._update_data_source_config(level)

        # 发送恢复通知
        await self._send_alert(f"系统已恢复至L{level}")
```

---

## 6. 数据一致性保障

### 6.1 多源数据合并策略

```python
class DataMerger:
    """多源数据合并器"""

    MERGE_STRATEGIES = {
        "price": "weighted_average",  # 价格: 加权平均
        "volume": "sum",              # 成交量: 求和
        "timestamp": "latest",        # 时间戳: 取最新
    }

    WEIGHTS = {
        "sina": 1.0,
        "tencent": 0.9,
        "eastmoney": 0.9,
        "tushare": 0.95,
        "baostock": 0.7,
        "akshare": 0.8,
    }

    async def merge_quotes(
        self,
        quotes: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """合并多个数据源的股票报价"""

        merged = {}

        for symbol, source_quotes in quotes.items():
            if not source_quotes:
                continue

            # 按权重计算加权平均价格
            total_weight = 0
            weighted_price = 0
            latest_timestamp = None

            for source_name, quote in source_quotes.items():
                weight = self.WEIGHTS.get(source_name, 0.5)

                # 过滤异常数据 (价格偏差>10%的丢弃)
                if self._is_outlier(quote, source_quotes.values()):
                    continue

                weighted_price += quote["price"] * weight
                total_weight += weight

                # 取最新时间戳
                ts = quote.get("timestamp")
                if latest_timestamp is None or \
                   (ts and ts > latest_timestamp):
                    latest_timestamp = ts

            if total_weight > 0:
                merged[symbol] = {
                    "symbol": symbol,
                    "price": weighted_price / total_weight,
                    "timestamp": latest_timestamp,
                    "sources": list(source_quotes.keys()),
                    "confidence": min(total_weight, 1.0),
                }

        return merged

    def _is_outlier(self, quote, all_quotes, threshold=0.1):
        """检测异常值 (价格偏差超过10%)"""
        prices = [q["price"] for q in all_quotes if q.get("price") > 0]
        if not prices:
            return False

        avg_price = sum(prices) / len(prices)
        price = quote.get("price", 0)

        return abs(price - avg_price) / avg_price > threshold
```

### 6.2 数据校验机制

```python
class DataValidator:
    """数据校验器"""

    VALIDATION_RULES = {
        "price": {
            "min": 0.01,
            "max": 10000.0,
            "change_limit": 0.2,  # 涨跌幅限制20%
        },
        "volume": {
            "min": 0,
            "max": 1e12,
        },
        "timestamp": {
            "max_age": 300,  # 数据最大年龄5分钟
        }
    }

    async def validate_quote(self, quote: Dict[str, Any]) -> bool:
        """校验单条报价数据"""

        # 检查必需字段
        required_fields = ["symbol", "price", "timestamp"]
        if not all(f in quote for f in required_fields):
            return False

        price = quote.get("price", 0)
        prev_close = quote.get("prev_close", price)

        # 价格范围检查
        rules = self.VALIDATION_RULES["price"]
        if not (rules["min"] <= price <= rules["max"]):
            return False

        # 涨跌幅检查
        if prev_close > 0:
            change = abs(price - prev_close) / prev_close
            if change > rules["change_limit"]:
                # 可能是新股或除权,记录警告但接受
                logger.warning(f"异常涨跌幅: {quote['symbol']} {change:.2%}")

        # 时间戳检查
        timestamp = quote.get("timestamp")
        if isinstance(timestamp, datetime):
            age = (datetime.now() - timestamp).total_seconds()
            if age > self.VALIDATION_RULES["timestamp"]["max_age"]:
                logger.warning(f"数据过期: {quote['symbol']} 年龄{age}s")
                return False

        return True
```

---

## 7. 功能降级保障

### 7.1 功能降级矩阵

| 功能模块 | L0正常 | L1降级 | L2降级 | L3降级 | L4极限 |
|---------|-------|-------|-------|-------|-------|
| **核心交易** | ✓ | ✓ | ✓ | ✓ | △(仅热点) |
| **实时行情** | ✓ | ✓ | △(延迟) | △(延迟) | ✗ |
| **AI决策** | ✓ | ✓ | △ | △ | ✗ |
| **持仓查询** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **历史数据** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **排行榜** | ✓ | ✓ | ✓ | △ | ✗ |
| **数据分析** | ✓ | ✓ | ✓ | ✓ | △ |
| **WebSocket推送** | ✓ | ✓ | △ | ✗ | ✗ |

### 7.2 降级时用户体验保障

```python
class DegradationUXManager:
    """降级用户体验管理器"""

    def get_ux_config(self, level: int) -> Dict[str, Any]:
        """获取降级级别的UX配置"""

        configs = {
            0: {
                "status_indicator": "normal",
                "message": None,
                "refresh_interval": 10,
                "data_freshness_badge": False,
            },
            1: {
                "status_indicator": "degraded",
                "message": "数据服务降级，可能存在短暂延迟",
                "refresh_interval": 15,
                "data_freshness_badge": True,
            },
            2: {
                "status_indicator": "degraded",
                "message": "数据服务降级，部分数据可能有延迟",
                "refresh_interval": 30,
                "data_freshness_badge": True,
            },
            3: {
                "status_indicator": "critical",
                "message": "数据服务严重降级，仅核心功能可用",
                "refresh_interval": 60,
                "data_freshness_badge": True,
            },
            4: {
                "status_indicator": "critical",
                "message": "数据服务极度受限，仅显示缓存数据",
                "refresh_interval": 300,
                "data_freshness_badge": True,
            },
        }

        return configs.get(level, configs[4])
```

---

## 8. 监控告警

### 8.1 监控指标

```python
class DegradationMetrics:
    """降级监控指标"""

    # Prometheus指标定义
    DEGRADATION_LEVEL = Gauge(
        "data_service_degradation_level",
        "Current degradation level (0-4)"
    )

    SOURCE_HEALTH = Gauge(
        "data_source_health",
        "Data source health status (1=healthy, 0=unhealthy)",
        ["source_name"]
    )

    SOURCE_RESPONSE_TIME = Histogram(
        "data_source_response_seconds",
        "Data source response time",
        ["source_name"],
        buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
    )

    DEGRADATION_SWITCH_COUNT = Counter(
        "degradation_switch_total",
        "Total degradation switches",
        ["from_level", "to_level"]
    )

    DATA_FRESHNESS = Gauge(
        "data_freshness_seconds",
        "Data age in seconds",
        ["stock_symbol"]
    )
```

### 8.2 告警规则

```yaml
# 告警规则配置
alerts:
  - name: DataSourceDegradation
    condition: degradation_level > 0
    severity: warning
    message: "数据服务已降级至L{{level}}"

  - name: DataSourceFailure
    condition: source_health == 0
    severity: critical
    message: "数据源{{source_name}}不可用"

  - name: HighResponseTime
    condition: source_response_time_p95 > 5.0
    severity: warning
    message: "数据源{{source_name}}响应时间过高"

  - name: StaleData
    condition: data_freshness > 60
    severity: warning
    message: "股票{{symbol}}数据过期"
```

---

## 9. 降级恢复流程

### 9.1 自动恢复策略

```python
class RecoveryManager:
    """降级恢复管理器"""

    RECOVERY_STRATEGY = {
        # 逐级恢复，每级验证60秒
        "level_check_interval": 60,
        "confirmation_samples": 3,  # 连续3次检查通过才恢复
        "rollback_on_failure": True,  # 恢复失败回滚
    }

    async def attempt_recovery(self):
        """尝试从降级状态恢复"""

        if self.current_level == 0:
            return  # 已经在正常模式

        # 检查上级数据源是否恢复
        target_level = self.current_level - 1
        target_sources = self.get_sources_for_level(target_level)

        # 连续检查3次
        for i in range(self.RECOVERY_STRATEGY["confirmation_samples"]):
            healthy_count = sum(
                1 for s in target_sources
                if (await self.health_checker.check(s)).is_healthy
            )

            # 至少50%的数据源健康
            if healthy_count < len(target_sources) / 2:
                logger.info(f"恢复检查{i+1}: 数据源未准备好")
                return False

            await asyncio.sleep(
                self.RECOVERY_STRATEGY["level_check_interval"]
            )

        # 执行恢复
        await self.degradation_manager.recover_to(target_level)
        return True
```

### 9.2 恢复验证

```python
async def validate_recovery(level: int) -> bool:
    """验证恢复是否成功"""

    # 运行1分钟验证测试
    test_results = []
    for _ in range(6):  # 6次10秒间隔测试
        result = await run_health_check(level)
        test_results.append(result)
        await asyncio.sleep(10)

    # 所有测试都通过才算恢复成功
    return all(r.is_healthy for r in test_results)
```

---

## 10. 实施计划

### 10.1 开发阶段

| 阶段 | 任务 | 预计时间 | 优先级 |
|------|------|---------|--------|
| **阶段1** | 修复腾讯/东方批量查询 | 1天 | P0 |
| **阶段2** | 实现健康检查器 | 1天 | P0 |
| **阶段3** | 实现降级管理器 | 2天 | P0 |
| **阶段4** | 实现数据合并器 | 1天 | P1 |
| **阶段5** | 集成监控告警 | 1天 | P1 |
| **阶段6** | 全面测试验证 | 2天 | P0 |

### 10.2 配置示例

```yaml
# config/degradation.yaml
degradation:
  enabled: true
  auto_recovery: true

  levels:
    - level: 0
      sources: ["sina"]
      batch_size: 100
      timeout: 2.0

    - level: 1
      sources: ["tencent", "eastmoney"]
      batch_size: 100
      timeout: 3.0

    - level: 2
      sources: ["baostock", "akshare"]
      batch_size: 100
      timeout: 10.0

    - level: 3
      sources: ["tushare"]
      batch_size: 50
      timeout: 5.0

    - level: 4
      sources: ["cache"]
      max_stocks: 300

  health_check:
    interval: 10
    failure_threshold: 3
    response_time_threshold: 5.0

  recovery:
    enabled: true
    check_interval: 60
    confirmation_samples: 3
```

---

## 11. 总结

### 11.1 降级方案核心要点

1. **四级降级策略**: 从L0正常模式到L4极限降级，逐级保障核心功能
2. **自动检测切换**: 基于健康检查的自动降级和恢复，无需人工干预
3. **数据一致性**: 多源数据加权合并，异常值过滤，确保数据质量
4. **功能保障**: 即使L4极限降级，核心交易功能仍可用
5. **监控告警**: 全链路监控，及时发现问题并通知

### 11.2 预期效果

| 场景 | 预期结果 |
|------|---------|
| 新浪不可用 | 自动切换至腾讯+东方，延迟<20s，功能95%可用 |
| 一级源不可用 | 自动切换至Baostock+AkShare，延迟<60s，功能85%可用 |
| 所有批量接口不可用 | 切换至单股轮询+缓存，核心功能50%可用 |
| 主源恢复 | 60秒后自动恢复至正常模式 |

### 11.3 下一步行动

1. **立即**: 修复腾讯/东方批量查询功能
2. **本周**: 实现降级管理器和健康检查器
3. **下周**: 完成数据合并器和监控告警
4. **下周**: 全面测试验证降级方案

---

**文档版本**: v1.0
**更新日期**: 2026-02-10
**负责人**: 首席架构师
