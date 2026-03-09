# 4数据源混合采集策略与降级方案

**文档版本**: 1.0
**创建时间**: 2026-02-13
**适用范围**: Market Data Service 生产环境
**状态**: 基于实测数据编制

---

## 📋 概述

本方案基于4个可靠数据源（新浪、腾讯、东方财富、Baostock）构建，包含完整的分级采集策略和自动降级机制。

**已移除数据源**: AkShare（完全失效）、Tushare（无权限）

---

## 🎯 4源能力矩阵

| 数据源 | 速度 | 稳定性 | 批量能力 | 收盘后 | 主要用途 |
|--------|------|--------|----------|--------|----------|
| **新浪** | ⭐⭐⭐⭐⭐ (0.07s) | ⭐⭐⭐⭐⭐ | 50只/96% | ✅ 正常 | 高频主力 |
| **腾讯** | ⭐⭐⭐⭐⭐ (0.09s) | ⭐⭐⭐⭐⭐ | 50只/92% | ✅ 正常 | 高频备选 |
| **东方财富** | ⭐⭐⭐ (0.18s) | ⭐⭐⭐⭐ | 20只/100% | ✅ 正常 | 中频轮询 |
| **Baostock** | ⭐⭐ (1.14s) | ⭐⭐⭐ | 20只/67% | ⚠️ 15:05-19:00不可用 | 低频/历史 |

---

## 🏗️ 分层采集架构

### 正常模式 (Level 0)

```
┌─────────────────────────────────────────────────────────────────┐
│                      正常模式 - 双主源并行                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  高频层 (50只 / 5秒)                                             │
│  ├── 新浪: 50只/批次, 间隔1秒 → 2.5秒完成 ✅                     │
│  └── 腾讯: 50只/批次, 间隔1秒 → 2.5秒完成 (并行) ✅              │
│                                                                  │
│  中频层 (200只 / 15秒)                                           │
│  ├── 新浪: 50只×2批次 = 100只                                   │
│  ├── 腾讯: 50只×2批次 = 100只 (并行)                            │
│  └── 东财: 20只×5批次 = 100只 (补漏)                            │
│                                                                  │
│  低频层 (4750只 / 60秒)                                          │
│  ├── 新浪: 50只×30批次 = 1500只                                 │
│  ├── 腾讯: 50只×30批次 = 1500只 (并行)                          │
│  ├── 东财: 20只×30批次 = 600只                                  │
│  └── Baostock: 20只×30批次 = 600只 (收盘前有效)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**技术参数**:
- 批次大小: 新浪/腾讯 50只, 东财/Baostock 20只
- 请求间隔: 新浪/腾讯 1秒, 东财 2秒, Baostock 5秒
- 预期成功率: >95%

---

### 一级降级 (Level 1)

**触发条件**: 新浪或腾讯任一连续失败5次

```
┌─────────────────────────────────────────────────────────────────┐
│                    一级降级 - 东财+Baostock补位                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  状态: 新浪 ❌ 或 腾讯 ❌                                        │
│                                                                  │
│  高频层 (50只 / 10秒)                                            │
│  ├── 剩余主源: 50只 (新浪或腾讯)                                │
│  └── 东财补位: 20只×2批次 (延长间隔至2秒)                       │
│                                                                  │
│  调整策略:                                                       │
│  ├── 股票数量: 100只 → 50只 (优先热门股)                        │
│  ├── 采集间隔: 10秒 → 15秒                                      │
│  └── 成功率预期: 95% → 85%                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**降级动作**:
1. 熔断故障源（30秒冷却）
2. 切换至备用源
3. 降低采集频率20%
4. 发送告警通知

---

### 二级降级 (Level 2)

**触发条件**: 新浪+腾讯同时故障，或东财/Baostock不可用

```
┌─────────────────────────────────────────────────────────────────┐
│                    二级降级 - 单源轮询模式                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  状态: 新浪 ❌ 且 腾讯 ❌                                        │
│                                                                  │
│  高频层 (30只 / 20秒)                                            │
│  └── 单源轮询: 新浪优先 → 腾讯 → 东财 → Baostock               │
│                                                                  │
│  调整策略:                                                       │
│  ├── 股票数量: 100只 → 30只 (核心股票)                          │
│  ├── 采集间隔: 10秒 → 20秒                                      │
│  ├── 批次大小: 50只 → 10只                                      │
│  └── 成功率预期: 85% → 70%                                      │
│                                                                  │
│  轮询逻辑:                                                       │
│  for symbol in core_stocks:                                     │
│      for source in [sina, tencent, eastmoney, baostock]:        │
│          try: return source.get_quote(symbol)                   │
│          except: continue                                       │
│      await asyncio.sleep(0.5)                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 极限降级 (Level 3)

**触发条件**: 仅1个数据源可用，或全源故障

```
┌─────────────────────────────────────────────────────────────────┐
│                    极限降级 - 缓存+降频采集                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  状态: 仅1源可用 或 全源故障                                     │
│                                                                  │
│  高频层 (15只 / 60秒)                                            │
│  ├── 实时采集: 仅采集核心15只股票                               │
│  └── 缓存填充: 其余股票使用缓存数据                             │
│                                                                  │
│  调整策略:                                                       │
│  ├── 股票数量: 30只 → 15只 (最核心)                             │
│  ├── 采集间隔: 20秒 → 60秒                                      │
│  ├── 批次大小: 10只 → 5只                                       │
│  ├── 缓存TTL: 5分钟 → 15分钟                                    │
│  └── 成功率预期: 70% → 50% (依赖缓存)                           │
│                                                                  │
│  用户感知:                                                       │
│  ├── 行情更新变慢 (60秒)                                        │
│  ├── 部分股票显示"缓存数据"标记                                 │
│  └── 发送系统降级通知                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⏰ 时段感知策略

### 交易时段 (09:30-11:30, 13:00-15:00)

```yaml
trading_hours:
  high_freq:
    stocks: 100
    interval: 10
    sources: ["sina", "tencent"]
    mode: "parallel"  # 双源并行

  mid_freq:
    stocks: 200
    interval: 30
    sources: ["sina", "tencent", "eastmoney"]
    mode: "round_robin"

  low_freq:
    stocks: 4750
    interval: 60
    sources: ["sina", "tencent", "eastmoney", "baostock"]
    mode: "distributed"
```

### 收盘过渡期 (15:00-15:05)

```yaml
closing_transition:
  # 正常完成最后一轮采集
  action: "finish_current_batch"

  # 降低高频层频率
  high_freq:
    interval: 30  # 降至30秒

  # 准备切换至收盘模式
  next_mode: "after_hours"
```

### 收盘后时段 (15:05-19:00) ⚠️

```yaml
after_hours:
  # 关键: 禁用Baostock
  disabled_sources: ["baostock"]

  high_freq:
    stocks: 50
    interval: 60  # 大幅降频
    sources: ["sina", "tencent"]

  mid_freq:
    stocks: 100
    interval: 120
    sources: ["sina", "tencent", "eastmoney"]

  # 低频层延后至19:00后
  low_freq:
    enabled: false
    resume_at: "19:00"
```

**Baostock特殊处理**:
```python
async def should_use_baostock():
    """判断是否应该使用Baostock"""
    now = datetime.now()

    # 收盘后15:05-19:00禁用
    if time(15, 5) <= now.time() <= time(19, 0):
        logger.warning("Baostock disabled during 15:05-19:00")
        return False

    return True
```

### 晚间时段 (19:00-09:15)

```yaml
night_mode:
  # Baostock恢复
  baostock_status: "enabled"

  # 禁用高频层
  high_freq:
    enabled: false

  # 低频历史数据采集
  low_freq:
    stocks: 5000
    interval: 300  # 5分钟
    sources: ["baostock"]  # 主要使用Baostock
    mode: "historical"
```

### 盘前时段 (09:15-09:30)

```yaml
pre_market:
  # 逐渐恢复高频采集
  high_freq:
    enabled: true
    stocks: 50
    interval: 30
    sources: ["sina", "tencent"]

  # 09:25后恢复全量
  full_recovery_at: "09:25"
```

---

## 🔄 自动降级流程

### 降级决策树

```
开始采集
    ↓
检查数据源健康状态
    ↓
┌─────────────────────────────────────────┐
│ 新浪健康? 且 腾讯健康?                   │
│         ↓ 是                            │
│   NORMAL模式 (双主源并行)               │
│         ↓ 否                            │
│ 任一主源故障?                           │
│         ↓ 是                            │
│   DEGRADED_L1 (东财+Baostock补位)       │
│         ↓ 否                            │
│ 双主源都故障?                           │
│         ↓ 是                            │
│   DEGRADED_L2 (单源轮询)                │
│         ↓ 否                            │
│ 仅剩1源或全故障?                        │
│         ↓ 是                            │
│   CRITICAL (缓存+降频)                  │
└─────────────────────────────────────────┘
```

### 熔断器配置

```yaml
circuit_breakers:
  sina:
    failure_threshold: 5        # 连续5次失败触发熔断
    recovery_timeout: 30s       # 30秒后尝试恢复
    half_open_max_calls: 3      # 半开状态最多3次测试
    success_threshold: 2        # 2次成功则关闭熔断

  tencent:
    failure_threshold: 5
    recovery_timeout: 30s
    half_open_max_calls: 3
    success_threshold: 2

  eastmoney:
    failure_threshold: 10       # 东财更宽松
    recovery_timeout: 60s
    half_open_max_calls: 5
    success_threshold: 3

  baostock:
    failure_threshold: 20       # Baostock最宽松
    recovery_timeout: 300s      # 5分钟
    half_open_max_calls: 5
    success_threshold: 3
```

### 降级恢复流程

```python
async def recovery_process():
    """降级恢复流程"""

    # 1. 检查故障源是否恢复
    for source in failed_sources:
        if await check_source_health(source):
            # 2. 进入半开状态
            circuit_breaker.half_open(source)

            # 3. 发送测试请求
            for i in range(3):
                try:
                    await source.get_quote("000001.SZ")
                    success_count += 1
                except:
                    pass
                await asyncio.sleep(1)

            # 4. 判断是否恢复
            if success_count >= 2:
                circuit_breaker.close(source)
                await upgrade_degradation_level()
            else:
                circuit_breaker.open(source)
```

---

## 📊 性能预期

### 各级别性能对比

| 级别 | 高频股票数 | 高频间隔 | 预期成功率 | 用户体验 |
|------|-----------|----------|-----------|----------|
| NORMAL | 100只 | 10秒 | >95% | 实时流畅 |
| DEGRADED_L1 | 50只 | 15秒 | >85% | 轻微延迟 |
| DEGRADED_L2 | 30只 | 20秒 | >70% | 明显延迟 |
| CRITICAL | 15只 | 60秒 | >50% | 严重降级 |

### 容灾能力

| 故障场景 | 系统状态 | 数据覆盖 |
|----------|----------|----------|
| 单源故障 | DEGRADED_L1 | 100% |
| 双源故障 | DEGRADED_L2 | 60% |
| 三源故障 | CRITICAL | 30% |
| Baostock收盘后故障 | NORMAL (自动切换) | 100% |

---

## ⚙️ 配置参数

### 环境变量配置

```yaml
# 分层采集配置
HIGH_FREQ_STOCKS: 100
HIGH_FREQ_INTERVAL: 10
HIGH_FREQ_SOURCES: "sina,tencent"
HIGH_FREQ_BATCH_SIZE: 50

MID_FREQ_STOCKS: 200
MID_FREQ_INTERVAL: 30
MID_FREQ_SOURCES: "sina,tencent,eastmoney"
MID_FREQ_BATCH_SIZE: 50

LOW_FREQ_STOCKS: 4750
LOW_FREQ_INTERVAL: 60
LOW_FREQ_SOURCES: "sina,tencent,eastmoney,baostock"
LOW_FREQ_BATCH_SIZE: 20

# 降级配置
DEGRADATION_ENABLED: true
DEGRADATION_L1_THRESHOLD: 0.85  # 成功率低于85%触发L1
DEGRADATION_L2_THRESHOLD: 0.70  # 成功率低于70%触发L2
DEGRADATION_CRITICAL_THRESHOLD: 0.50

# 熔断配置
CIRCUIT_BREAKER_ENABLED: true
CIRCUIT_FAILURE_THRESHOLD: 5
CIRCUIT_RECOVERY_TIMEOUT: 30

# Baostock特殊时段
BAOSTOCK_AFTER_HOURS_ENABLED: false  # 收盘后禁用
BAOSTOCK_RESUME_TIME: "19:00"
```

### 代码配置示例

```python
# config.py

class HybridCollectionConfig:
    """4源混合采集配置"""

    # 数据源优先级
    SOURCE_PRIORITY = {
        "sina": 1,
        "tencent": 2,
        "eastmoney": 3,
        "baostock": 4,
    }

    # 时段配置
    TIME_CONFIG = {
        "trading": {
            "hours": [("09:30", "11:30"), ("13:00", "15:00")],
            "high_freq": {"stocks": 100, "interval": 10},
        },
        "after_hours": {
            "hours": [("15:00", "19:00")],
            "disabled_sources": ["baostock"],
            "high_freq": {"stocks": 50, "interval": 60},
        },
        "night": {
            "hours": [("19:00", "09:30")],
            "high_freq": {"enabled": False},
        },
    }
```

---

## 📈 监控告警

### 关键指标

| 指标 | 告警阈值 | 严重阈值 | 动作 |
|------|----------|----------|------|
| 采集成功率 | <90% | <70% | 降级/告警 |
| 数据源健康 | <3源 | <2源 | 熔断/切换 |
| 响应延迟 | >2s | >5s | 限流/告警 |
| 降级级别 | L1 | L2/L3 | 通知/告警 |

### 告警规则

```yaml
alerts:
  - name: collection_success_rate_low
    condition: success_rate < 0.9
    severity: warning
    action: notify_ops

  - name: degraded_to_l1
    condition: degradation_level == 1
    severity: warning
    action: notify_ops,send_wechat

  - name: degraded_to_l2
    condition: degradation_level == 2
    severity: critical
    action: page_oncall

  - name: baostock_unavailable_after_hours
    condition: hour == 15 and baostock_failures > 5
    severity: info
    action: auto_disable_baostock

  - name: all_sources_unhealthy
    condition: healthy_sources < 2
    severity: emergency
    action: page_oncall,send_sms
```

---

## 🧪 测试验证

### 降级演练计划

| 演练场景 | 触发方式 | 预期结果 | 验证方法 |
|----------|----------|----------|----------|
| 新浪故障 | 手动熔断 | 切换至腾讯+东财 | 检查日志 |
| 双主源故障 | 手动熔断 | 降级至L2 | 检查降级级别 |
| Baostock收盘后 | 时间触发 | 自动禁用 | 15:05检查 |
| 全源故障 | 网络断开 | 进入CRITICAL | 检查缓存使用 |

---

## 📝 实施清单

### 春节前（本周）

- [x] 删除AkShare和Tushare代码
- [x] 制定4源混合策略文档
- [ ] 更新docker-compose配置
- [ ] 部署时段感知调度器
- [ ] 验证Baostock收盘后禁用逻辑

### 春节后（2月底）

- [ ] 实施降级自动切换
- [ ] 配置监控告警
- [ ] 降级演练测试
- [ ] 性能压测验证

---

**文档维护**: Market Data Service 团队
**审核人**: 首席架构师
**下次更新**: 根据生产运行情况调整

---

*本文档基于2026-02-13实测数据和代码变更编制*
