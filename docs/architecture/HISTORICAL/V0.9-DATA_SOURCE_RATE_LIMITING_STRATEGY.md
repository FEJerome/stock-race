# 六数据源频率限制与分层采集策略

**文档版本**: 1.0
**创建时间**: 2026-02-13
**适用范围**: Market Data Service 全量A股数据采集

---

## 1. 数据源频率限制总览

### 1.1 各数据源限制详情

| 数据源 | 类型 | 频率限制 | 并发限制 | 日限额 | 备注 |
|--------|------|----------|----------|--------|------|
| **新浪财经** | 实时 | 600/分钟 | 100并发 | 无 | 最稳定，优先使用 |
| **腾讯财经** | 实时 | 1200/分钟 | 150并发 | 无 | 并发最高 |
| **东方财富** | 实时 | 300/分钟 | 50并发 | 无 | 速度较慢 |
| **AkShare** | 实时 | 500/分钟 | 80并发 | 无 | Python库，易限流 |
| **Baostock** | 历史 | 300/分钟 | 50并发 | 无 | 历史数据专用 |
| **Tushare** | 受限 | 200/分钟 | 50并发 | 500/日 | 需Token，限量 |

### 1.2 内部限制策略（严格于外部）

```python
# 内部频率限制配置（比数据源实际限制严格20%）
RATE_LIMIT_CONFIG = {
    "sina": {
        "requests_per_minute": 480,      # 外部600，内部480（80%）
        "burst": 80,                     # 外部100，内部80
        "min_interval": 0.125,           # 125ms
        "batch_size": 100,
        "daily_limit": None,
    },
    "tencent": {
        "requests_per_minute": 960,      # 外部1200，内部960（80%）
        "burst": 120,                    # 外部150，内部120
        "min_interval": 0.0625,          # 62.5ms
        "batch_size": 150,
        "daily_limit": None,
    },
    "eastmoney": {
        "requests_per_minute": 240,      # 外部300，内部240（80%）
        "burst": 40,                     # 外部50，内部40
        "min_interval": 0.25,            # 250ms
        "batch_size": 50,
        "daily_limit": None,
    },
    "akshare": {
        "requests_per_minute": 400,      # 外部500，内部400（80%）
        "burst": 64,                     # 外部80，内部64
        "min_interval": 0.15,            # 150ms
        "batch_size": 200,
        "daily_limit": None,
        "cooldown_after_error": 30,      # 错误后冷却30秒
    },
    "baostock": {
        "requests_per_minute": 240,      # 外部300，内部240（80%）
        "burst": 40,
        "min_interval": 0.25,            # 250ms
        "batch_size": 100,
        "daily_limit": None,
    },
    "tushare": {
        "requests_per_minute": 160,      # 外部200，内部160（80%）
        "burst": 40,
        "min_interval": 0.375,           # 375ms
        "batch_size": 50,
        "daily_limit": 400,              # 外部500，内部400（80%）
    }
}
```

---

## 2. 分层采集架构

### 2.1 股票分层策略

```
┌─────────────────────────────────────────────────────────────────┐
│                    A股全量股票分层架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    高频层 (5秒)                          │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │  热门股票    │  │  指数成分    │  │  用户关注    │      │    │
│  │  │    50只     │  │    50只     │  │    50只     │      │    │
│  │  │ 新浪+腾讯   │  │ 新浪+腾讯   │  │ 6源轮询     │      │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │    │
│  │                    共150只，5秒刷新                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    中频层 (15秒)                         │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │  活跃股票    │  │  大盘股      │  │  中盘股      │      │    │
│  │  │   300只     │  │   200只     │  │   200只     │      │    │
│  │  │ 4源轮询     │  │ 新浪+腾讯   │  │ 6源轮询     │      │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │    │
│  │                    共700只，15秒刷新                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    低频层 (60秒)                         │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │  普通股票    │  │  小盘股      │  │  ST/新股    │      │    │
│  │  │  2000只     │  │  1500只     │  │   650只     │      │    │
│  │  │ 6源并行     │  │ 4源轮询     │  │ 2源备份     │      │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │    │
│  │                    共4150只，60秒刷新                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    历史数据层 (每日)                      │    │
│  │  ┌─────────────┐  ┌─────────────┐                       │    │
│  │  │  K线数据    │  │  基本面数据  │                       │    │
│  │  │ 5000只×30天 │  │ 5000只      │                       │    │
│  │  │ Baostock   │  │ Tushare    │                       │    │
│  │  └─────────────┘  └─────────────┘                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 分层详细配置

```python
TIER_CONFIG = {
    "high_frequency": {
        "name": "高频层",
        "interval_seconds": 5,
        "stock_count": 150,
        "sources": ["sina", "tencent"],  # 2源轮询
        "selection_criteria": {
            "hot_stocks": "日成交额前50",
            "index_components": "沪深300成分前50",
            "user_watchlist": "用户关注前50"
        },
        "priority": 1,
        "redundancy": 2,  # 2个数据源采集同一只股票
    },
    "medium_frequency": {
        "name": "中频层",
        "interval_seconds": 15,
        "stock_count": 700,
        "sources": ["sina", "tencent", "akshare", "eastmoney"],  # 4源轮询
        "selection_criteria": {
            "active_stocks": "日成交额1亿-10亿，前300",
            "large_cap": "市值>500亿，前200",
            "mid_cap": "市值100-500亿，前200"
        },
        "priority": 2,
        "redundancy": 1,
    },
    "low_frequency": {
        "name": "低频层",
        "interval_seconds": 60,
        "stock_count": 4150,
        "sources": ["sina", "tencent", "akshare", "eastmoney", "baostock"],  # 5源轮询
        "selection_criteria": {
            "regular": "普通交易股票，2000",
            "small_cap": "市值<100亿，1500",
            "st_new": "ST股+上市<30天，650"
        },
        "priority": 3,
        "redundancy": 1,
    },
    "historical": {
        "name": "历史数据层",
        "interval_seconds": 86400,  # 每日
        "stock_count": 5000,
        "sources": ["baostock", "tushare"],
        "collection_time": "19:00-23:00",  # 收盘后
        "priority": 4,
        "redundancy": 1,
    }
}
```

---

## 3. 智能调度算法

### 3.1 动态权重计算

```python
class DynamicWeightCalculator:
    """动态权重计算器，实时调整各数据源权重"""

    def calculate_weight(self, source_name: str, metrics: SourceMetrics) -> float:
        """
        计算数据源动态权重

        公式: 基础权重 × 成功率因子 × 延迟因子 × 限流因子 × 健康因子 × 时段因子
        """
        base_weight = RATE_LIMIT_CONFIG[source_name]["base_weight"]

        # 成功率因子 (0.5 - 1.2)
        success_factor = self._get_success_factor(metrics.success_rate)

        # 延迟因子 (0.5 - 1.1)
        latency_factor = self._get_latency_factor(metrics.avg_latency)

        # 限流因子 (0.1 - 1.0)
        rate_limit_factor = self._get_rate_limit_factor(metrics.remaining_quota)

        # 健康因子 (0.0 - 1.0)
        health_factor = self._get_health_factor(metrics.health_score)

        # 时段因子 (0.8 - 1.2)，交易时段权重更高
        time_factor = self._get_time_factor()

        final_weight = (
            base_weight *
            success_factor *
            latency_factor *
            rate_limit_factor *
            health_factor *
            time_factor
        )

        return max(0.1, min(final_weight, 2.0))  # 限制在0.1-2.0之间

    def _get_success_factor(self, success_rate: float) -> float:
        if success_rate >= 0.99: return 1.2
        if success_rate >= 0.95: return 1.1
        if success_rate >= 0.90: return 1.0
        if success_rate >= 0.80: return 0.8
        if success_rate >= 0.60: return 0.6
        return 0.5

    def _get_latency_factor(self, avg_latency: float) -> float:
        if avg_latency < 0.1: return 1.1  # <100ms
        if avg_latency < 0.3: return 1.0  # <300ms
        if avg_latency < 0.5: return 0.9  # <500ms
        if avg_latency < 1.0: return 0.7  # <1s
        return 0.5  # >=1s

    def _get_rate_limit_factor(self, remaining_quota: float) -> float:
        if remaining_quota > 0.5: return 1.0  # >50%
        if remaining_quota > 0.3: return 0.8  # 30-50%
        if remaining_quota > 0.1: return 0.5  # 10-30%
        return 0.1  # <10%

    def _get_health_factor(self, health_score: float) -> float:
        return max(0.0, min(health_score / 100, 1.0))

    def _get_time_factor(self) -> float:
        """交易时段因子"""
        from datetime import datetime
        hour = datetime.now().hour
        minute = datetime.now().minute

        # 交易时段 (9:30-11:30, 13:00-15:00)
        if (9 <= hour <= 11) or (13 <= hour <= 14):
            if hour == 9 and minute < 30:
                return 0.8  # 开盘前
            return 1.2  # 交易时段
        elif hour == 11 and minute > 30:
            return 0.9  # 午盘休息
        elif hour == 15:
            return 0.8  # 收盘后
        else:
            return 0.6  # 非交易时间
```

### 3.2 请求调度器

```python
class RequestScheduler:
    """请求调度器，确保各数据源不超过频率限制"""

    def __init__(self):
        self.request_queues = {
            name: asyncio.Queue() for name in RATE_LIMIT_CONFIG.keys()
        }
        self.request_timestamps = {
            name: deque(maxlen=1000) for name in RATE_LIMIT_CONFIG.keys()
        }
        self.locks = {
            name: asyncio.Lock() for name in RATE_LIMIT_CONFIG.keys()
        }

    async def schedule_request(
        self,
        source_name: str,
        request_func: Callable,
        priority: int = 5
    ) -> Any:
        """
        调度请求，确保不超过频率限制

        Args:
            source_name: 数据源名称
            request_func: 请求函数
            priority: 优先级 (1-10，1最高)

        Returns:
            请求结果
        """
        config = RATE_LIMIT_CONFIG[source_name]

        async with self.locks[source_name]:
            # 检查并等待，直到满足频率限制
            await self._wait_for_rate_limit(source_name, config)

            # 记录请求时间
            self.request_timestamps[source_name].append(time.time())

        # 执行请求
        try:
            result = await request_func()
            return result
        except RateLimitError:
            # 如果被限流，等待后重试
            await asyncio.sleep(config["cooldown_after_error"])
            return await self.schedule_request(source_name, request_func, priority)

    async def _wait_for_rate_limit(self, source_name: str, config: Dict):
        """等待直到满足频率限制"""
        timestamps = self.request_timestamps[source_name]

        if len(timestamps) < config["burst"]:
            return  # 未达到并发限制

        # 计算最近一分钟的请求数
        now = time.time()
        one_minute_ago = now - 60
        recent_requests = sum(1 for t in timestamps if t > one_minute_ago)

        if recent_requests >= config["requests_per_minute"]:
            # 计算需要等待的时间
            oldest_recent = min(t for t in timestamps if t > one_minute_ago)
            wait_time = 60 - (now - oldest_recent) + 0.1  # 多等0.1秒
            logger.warning(f"Rate limit reached for {source_name}, waiting {wait_time:.2f}s")
            await asyncio.sleep(wait_time)

    def get_source_availability(self, source_name: str) -> Dict:
        """获取数据源可用性状态"""
        config = RATE_LIMIT_CONFIG[source_name]
        timestamps = self.request_timestamps[source_name]

        now = time.time()
        one_minute_ago = now - 60
        recent_count = sum(1 for t in timestamps if t > one_minute_ago)

        return {
            "source": source_name,
            "requests_last_minute": recent_count,
            "limit_per_minute": config["requests_per_minute"],
            "remaining": config["requests_per_minute"] - recent_count,
            "utilization": recent_count / config["requests_per_minute"],
            "is_available": recent_count < config["requests_per_minute"] * 0.9
        }
```

---

## 4. 实时监控与告警

### 4.1 监控指标

```python
MONITORING_METRICS = {
    "per_source": {
        "request_count": "累计请求数",
        "success_count": "成功请求数",
        "error_count": "失败请求数",
        "success_rate": "成功率",
        "avg_latency": "平均延迟",
        "current_weight": "当前权重",
        "remaining_quota": "剩余配额",
        "is_active": "是否活跃"
    },
    "per_tier": {
        "stock_count": "股票数量",
        "collection_interval": "采集间隔",
        "last_collection_time": "上次采集时间",
        "data_freshness": "数据新鲜度",
        "coverage_rate": "覆盖率"
    },
    "overall": {
        "total_stocks": "总股票数",
        "total_requests_per_minute": "每分钟总请求数",
        "active_sources": "活跃数据源数",
        "data_quality_score": "数据质量评分"
    }
}
```

### 4.2 告警规则

| 告警级别 | 条件 | 通知方式 | 响应动作 |
|----------|------|----------|----------|
| **INFO** | 单源成功率<95% | 日志 | 自动降权 |
| **WARNING** | 单源成功率<80% 或 延迟>1s | 企业微信 | 切换备用源 |
| **CRITICAL** | 双源同时失败 或 成功率<50% | 电话+短信 | 启用降级模式 |
| **EMERGENCY** | 三源以上失败 或 全量采集失败 | 电话+邮件+短信 | 人工介入 |

---

## 5. 实现路线图

### 5.1 第一阶段：基础限流（本周）
- [ ] 实现RateLimiter基础类
- [ ] 为每个数据源配置独立限制
- [ ] 添加请求队列和调度器
- [ ] 实现基本监控指标

### 5.2 第二阶段：智能调度（下周）
- [ ] 实现动态权重计算
- [ ] 部署分层采集策略
- [ ] 添加数据源健康检查
- [ ] 实现自动故障转移

### 5.3 第三阶段：全量采集（第三周）
- [ ] 实现A股全量5000只采集
- [ ] 部署高频/中频/低频三层架构
- [ ] 添加历史数据定时采集
- [ ] 完整监控告警系统

### 5.4 第四阶段：生产优化（第四周）
- [ ] 压力测试与调优
- [ ] 数据一致性验证
- [ ] 异常场景演练
- [ ] 生产上线准备

---

## 6. 关键配置参数

```python
# config.py

# 全局配置
GLOBAL_CONFIG = {
    "total_stocks": 5000,              # A股总数
    "market_open": "09:30",
    "market_close": "15:00",
    "pre_market_collection": False,    # 盘前不采集
    "after_hours_collection": True,    # 盘后采集历史数据
}

# 限流严格系数（相对于数据源实际限制）
SAFETY_FACTOR = 0.8  # 80%

# 采集间隔配置
COLLECTION_INTERVALS = {
    "high_frequency": 5,    # 5秒
    "medium_frequency": 15,  # 15秒
    "low_frequency": 60,    # 60秒
}

# 数据源优先级（数字越小优先级越高）
SOURCE_PRIORITY = {
    "sina": 1,
    "tencent": 2,
    "akshare": 3,
    "eastmoney": 4,
    "baostock": 5,
    "tushare": 6,
}

# 熔断配置
CIRCUIT_BREAKER = {
    "failure_threshold": 5,      # 5次失败触发熔断
    "recovery_timeout": 60,      # 60秒后尝试恢复
    "half_open_requests": 3,     # 半开状态测试3次
}
```

---

**文档维护**: Market Data Service 团队
**审核人**: 首席架构师
**下次更新**: 2026-02-20
