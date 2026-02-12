# 六数据源混合采集策略初期方案

**文档版本**: v1.0
**创建日期**: 2026-02-09
**目标**: 实现延迟 < 10秒的A股实时数据采集系统

---

## 1. 数据源现状分析

### 1.1 六大数据源概览

| 数据源 | 类型 | 优先级 | 特点 | 当前状态 |
|--------|------|--------|------|----------|
| **新浪** | 直接API | 1 | 速度快、稳定性高 | ✅ 已实现 |
| **腾讯** | 直接API | 2 | 响应快、批量支持好 | ✅ 已实现 |
| **东方财富** | 直接API | 3 | 数据全、实时性好 | ✅ 已实现 |
| **AkShare** | Python库 | 2 | 多源聚合、免费 | ✅ 已实现 |
| **Baostock** | Python库 | 3 | 历史数据强、需登录 | ✅ 已实现 |
| **Tushare** | Python库 | 1 | 数据质量高、需Token | ✅ 已实现 |

### 1.2 各数据源特性（基于全网情报搜集）

基于全网搜集的最新信息（2024-2025年），各数据源实际限制如下：

| 数据源 | 预估延迟 | 预估成功率 | 频率限制 | 批量支持 | 关键限制说明 |
|--------|----------|------------|----------|----------|--------------|
| **新浪** | 100-500ms | 85%+ | ~60次/分钟 | 100只/次 | ⚠️ 2023年后大幅限制，可能触发IP封禁 |
| **腾讯** | 100-300ms | 90%+ | ~60次/分钟 | 150只/次 | 无官方文档，非公开接口 |
| **东方财富** | 200-800ms | 85%+ | 60次/分钟 | 50只/次 | 严格反爬，建议≥1秒间隔 |
| **AkShare** | 500-2000ms | 80%+ | 60次/分钟 | 全市场 | 底层依赖东方财富，同样受限 |
| **Baostock** | 300-1000ms | 90%+ | 20次/秒 | 单只 | ❌ 不支持并发，仅历史数据 |
| **Tushare** | 200-600ms | 95%+ | 50-60次/分钟 | 50只/次 | 免费版日限5000-8000次 |

### 1.3 关键限制条件（已校准）

> **重要发现**：所有数据源的实际频率限制比代码中预估的更严格！

```python
# 基于全网情报的校准后限制配置
SOURCE_LIMITS_CALIBRATED = {
    "sina": {
        "min_interval": 1.0,  # 建议≥1秒（原100ms过于乐观）
        "max_requests_per_minute": 60,  # 实际约60次/分钟
        "batch_size": 100,
        "weight": 0.8,
        "risk_level": "high",  # 高风险：易被封禁
        "note": "2023年后限制严格，建议谨慎使用"
    },
    "tencent": {
        "min_interval": 1.0,  # 建议≥1秒
        "max_requests_per_minute": 60,  # 非官方接口，限制未知
        "batch_size": 150,
        "weight": 1.0,
        "risk_level": "medium",
        "note": "相对稳定，但仍需控制频率"
    },
    "eastmoney": {
        "min_interval": 1.0,  # 必须≥1秒
        "max_requests_per_minute": 60,  # 官方限制
        "batch_size": 50,
        "weight": 1.2,
        "risk_level": "high",
        "note": "反爬严格，需模拟浏览器行为"
    },
    "akshare": {
        "min_interval": 1.0,  # 建议≥1秒
        "max_requests_per_minute": 60,  # 受限于底层数据源
        "batch_size": 200,  # 可获取全市场
        "weight": 1.0,
        "risk_level": "medium",
        "note": "数据延迟15-20分钟，不适合实时"
    },
    "baostock": {
        "min_interval": 0.05,  # 50ms，但QPS≈20
        "max_requests_per_minute": 1200,  # 20次/秒
        "batch_size": 100,
        "weight": 0.6,
        "risk_level": "low",
        "note": "⚠️ 不支持实时数据，仅历史数据"
    },
    "tushare": {
        "min_interval": 1.0,  # 免费版限制
        "max_requests_per_minute": 50,  # 免费版约50次/分钟
        "batch_size": 50,
        "weight": 1.5,
        "risk_level": "low",
        "note": "数据质量最高，但免费版额度有限"
    }
}
```

### 1.4 关键发现与风险

#### 🔴 高风险发现
1. **新浪API已大幅限制**（2023年后）：原有接口关闭或严格限流，免费用户每分钟仅5-10次
2. **所有直接API都受限**：新浪、腾讯、东方财富均实施了严格的反爬和频率限制
3. **AkShare延迟较高**：数据通常有15-20分钟延迟，不适合实时交易场景
4. **Baostock无实时数据**：仅提供历史K线，无法用于实时行情

#### 🟡 中等风险发现
1. **Tushare免费版额度紧张**：日限5000-8000次，对于高频采集可能不足
2. **IP封禁普遍**：所有数据源都可能对高频IP进行临时封禁
3. **数据一致性挑战**：多源数据可能存在时间差和价格差异

#### 🟢 机会点
1. **Tushare数据质量最高**：在额度范围内优先使用
2. **腾讯相对稳定**：在直接API中相对稳定
3. **分层策略可行**：通过L1/L2/L3分层，可以在限制内实现目标

### 1.5 信息来源

- [新浪财经API限制分析](https://bbs.csdn.net/topics/619522705)
- [腾讯财经接口使用建议](https://blog.csdn.net/sohoqq/article/details/146077522)
- [东方财富API频率限制](https://ask.csdn.net/questions/8938114)
- [AkShare项目频率限制Issue](https://github.com/akfamily/akshare/issues/6990)
- [Baostock使用限制](https://www.vnpy.com/forum/topic/34097-ru-he-geng-hao-di-shi-yong-baostock-liang-hua-shu-ju)
- [Tushare积分与频次权限表](https://tushare.pro/document/1?doc_id=290)

---

```python
# 各数据源限制配置（来自router.py）
SOURCE_LIMITS = {
    "sina": {
        "min_interval": 0.1,  # 100ms
        "max_requests_per_minute": 600,
        "batch_size": 100,
        "weight": 1.0,
    },
    "tencent": {
        "min_interval": 0.05,  # 50ms - 最快
        "max_requests_per_minute": 1200,
        "batch_size": 150,  # 最大批量
        "weight": 0.8,
    },
    "eastmoney": {
        "min_interval": 0.2,  # 200ms
        "max_requests_per_minute": 300,
        "batch_size": 50,
        "weight": 0.6,
    },
    "akshare": {
        "min_interval": 0.05,  # 50ms
        "max_requests_per_minute": 500,
        "batch_size": 200,  # 可获取全市场
        "weight": 1.5,
    },
    "baostock": {
        "min_interval": 0.15,  # 150ms
        "max_requests_per_minute": 300,
        "batch_size": 100,
        "weight": 1.2,
    },
    "tushare": {
        "min_interval": 0.5,  # 500ms - 最严格
        "max_requests_per_minute": 200,  # 免费版限制
        "batch_size": 50,
        "weight": 1.8,  # 最高质量权重
    }
}
```

---

## 2. 初期混合采集方案

### 2.1 核心策略：分层采集架构

```
┌─────────────────────────────────────────────────────────────┐
│                    数据采集协调器                            │
│                  (Data Collection Coordinator)               │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  实时层(L1)   │ │  补偿层(L2)   │ │  校验层(L3)   │
│  < 3秒延迟   │ │  < 10秒延迟  │ │  < 30秒延迟  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
   腾讯+新浪        东方财富+AkShare   Tushare+Baostock
   (高频轮询)       (定时拉取)         (质量校验)
```

### 2.2 分层策略详解

#### L1 实时层（目标：< 5秒）⚠️ 调整

**数据源**: 腾讯 + Tushare（优先）+ 新浪（备选）

> **策略调整说明**：基于全网情报，新浪限制严格，建议降低优先级

```python
L1_CONFIG = {
    "sources": ["tencent", "tushare", "sina"],
    "priority": {
        "tencent": 1,    # 第一优先：相对稳定
        "tushare": 2,    # 第二优先：数据质量高（在额度内）
        "sina": 3,       # 第三优先：高风险，备选
    },
    "interval": 3,       # 每3秒轮询（调整为更保守）
    "timeout": 2.0,      # 2秒超时
    "strategy": "smart_failover",  # 智能故障转移
    "fallback": True,
    "rate_limit_protection": True,  # 启用频率保护
}

# 频率保护策略
RATE_LIMIT_PROTECTION = {
    "tencent": {
        "max_requests_per_minute": 60,
        "cooldown_on_error": 5.0,  # 出错后冷却5秒
    },
    "tushare": {
        "max_requests_per_minute": 50,  # 免费版保守估计
        "daily_budget": 5000,  # 日限额
        "cooldown_on_error": 10.0,
    },
    "sina": {
        "max_requests_per_minute": 30,  # 更保守
        "cooldown_on_error": 30.0,  # 出错后长冷却
        "enabled": False,  # 默认禁用，手动开启
    }
}
```

**工作流程**:
1. **首选腾讯**：相对稳定，响应快
2. **次选Tushare**：数据质量最高（在免费额度内）
3. **备选新浪**：仅在必要时启用，严格频率控制
4. **智能降级**：任一源失败，自动切换并标记冷却
5. **缓存兜底**：所有源失败时，使用缓存（TTL=10秒）

#### L2 补偿层（目标：< 10秒）⚠️ 调整

**数据源**: 东方财富 + AkShare（批量）

> **策略调整说明**：AkShare可全市场批量获取，东方财富单只补充

```python
L2_CONFIG = {
    "sources": ["akshare", "eastmoney"],
    "interval": 10,      # 每10秒拉取（更保守）
    "timeout": 5.0,
    "strategy": "batch_first",  # 优先批量获取
    "batch": {
        "akshare": {
            "enabled": True,
            "get_all_market": True,  # 获取全市场
            "update_interval": 15,   # 每15秒更新全市场
        },
        "eastmoney": {
            "enabled": True,
            "priority_symbols": [],  # 重点股票列表
            "update_interval": 10,
        }
    }
}

# 数据质量评估
QUALITY_CHECK = {
    "enabled": True,
    "compare_with_l1": True,  # 与L1数据对比
    "tolerance": 0.5,  # 价格差异容忍度0.5%
    "alert_on_mismatch": True,
}
```

**工作流程**:
1. **AkShare批量获取**：每15秒获取全市场数据（注意：有15-20分钟延迟）
2. **东方财富补充**：对重点股票单独获取（实时性更好）
3. **数据质量校验**：与L1数据对比，检测异常
4. **智能缓存**：根据数据新鲜度动态调整TTL

#### L3 校验层（目标：< 30秒）⚠️ 重大调整

**数据源**: Tushare（质量基准）+ Baostock（历史校验）

> **重要发现**：Baostock不支持实时数据，仅用于历史数据校验

```python
L3_CONFIG = {
    "sources": ["tushare"],  # Baostock仅用于历史数据
    "interval": 30,          # 每30秒（节省Tushare额度）
    "timeout": 5.0,
    "strategy": "quality_validation",  # 质量校验模式
    "validation": {
        "enabled": True,
        "sample_rate": 0.1,  # 10%抽样校验
        "tolerance": {
            "price": 0.01,   # 价格差异1%
            "volume": 0.05,  # 成交量差异5%
        },
    },
    "baostock": {
        "enabled": False,  # 默认不用于实时
        "use_for": "historical_validation",  # 仅历史校验
        "update_interval": 3600,  # 每小时更新历史数据
    }
}

# Tushare额度管理
TUSHARE_BUDGET = {
    "daily_limit": 5000,      # 免费版日限额
    "reserved_for_l1": 2000,  # 为L1预留2000次
    "reserved_for_l3": 1000,  # 为L3预留1000次
    "emergency_buffer": 500,  # 应急缓冲500次
}
```

**工作流程**:
1. **Tushare抽样校验**：每30秒对10%股票进行质量校验
2. **Baostock历史校验**：每小时更新历史数据，用于回测验证
3. **异常检测**：发现L1/L2数据异常时，触发告警
4. **额度管理**：严格管理Tushare调用，确保不超限

### 2.3 智能路由策略

```python
class HybridDataRouter:
    """混合数据源路由器"""

    def __init__(self):
        self.l1_router = L1Router()  # 实时层
        self.l2_router = L2Router()  # 补偿层
        self.l3_router = L3Router()  # 校验层

    async def get_quote(self, symbol: str, max_delay: float = 10.0) -> Quote:
        """
        获取股票行情，确保延迟 < max_delay

        策略:
        1. 首先尝试L1（< 3秒）
        2. 如果L1失败或延迟高，使用L2（< 10秒）
        3. L3持续在后台运行，提供质量校验
        """
        start_time = time.time()

        # 尝试L1
        quote = await self.l1_router.get_quote(symbol, timeout=3.0)
        if quote and quote.freshness < 3.0:
            return quote

        # L1失败，使用L2
        elapsed = time.time() - start_time
        remaining = max_delay - elapsed

        if remaining > 0:
            quote = await self.l2_router.get_quote(symbol, timeout=remaining)
            if quote:
                return quote

        # 返回缓存或错误
        return await self._get_cached_or_error(symbol)
```

---

## 3. 明天开盘测试计划

### 3.1 测试目标（基于情报校准）

| 测试项 | 目标值 | 说明 | 风险等级 |
|--------|--------|------|----------|
| 平均延迟 | < 5秒 | 所有数据源综合 | 🟡 中等 |
| P95延迟 | < 10秒 | 95%请求满足 | 🟡 中等 |
| 成功率 | > 85% | 所有数据源综合 | 🔴 高（限制严格） |
| 数据一致性 | > 95% | 多源对比 | 🟡 中等 |
| 频率限制验证 | 准确值 | 确定各源实际限制 | 🟢 低 |

> **目标调整说明**：基于全网情报，各数据源限制比预期严格，成功率目标从95%调整为85%更现实。

### 3.2 测试时段安排（明天交易日）

```
📅 测试日期：下一个交易日
📍 测试地点：worktrees/worktree-data-service/data-service/scripts/

⏰ 09:15 - 09:30   集合竞价测试（低频率，验证连接）
   └─ 目标：验证6个数据源连接性
   └─ 频率：每10秒一轮

⏰ 09:30 - 10:00   开盘高峰期测试（中频率）
   └─ 目标：测试高峰期性能和稳定性
   └─ 频率：每5秒一轮

⏰ 10:00 - 11:30   正常交易测试（标准频率）
   └─ 目标：采集正常交易时段数据特征
   └─ 频率：每10秒一轮

⏰ 13:00 - 14:00   下午开盘测试（标准频率）
   └─ 目标：验证下午时段表现
   └─ 频率：每10秒一轮

⏰ 14:00 - 15:00   收盘前测试（中频率）
   └─ 目标：测试收盘前波动期表现
   └─ 频率：每5秒一轮
```

### 3.3 测试执行步骤

#### 步骤1：环境准备（开盘前30分钟）

```bash
# 1. 进入数据服务工作树
cd worktrees/worktree-data-service

# 2. 确保代码最新
git pull origin worktree-data-service

# 3. 安装依赖（如未安装）
cd data-service
pip install -r requirements.txt

# 4. 配置环境变量（重要！）
export TUSHARE_TOKEN="your-tushare-token"  # 如有
echo "测试开始时间: $(date)"
```

#### 步骤2：运行测试脚本

```bash
# 测试1：快速验证测试（5分钟）
python scripts/datasource_research.py \
    --duration 300 \
    --interval 5 \
    --output ./research_results/quick_test

# 测试2：标准频率测试（30分钟）
python scripts/datasource_research.py \
    --duration 1800 \
    --interval 10 \
    --output ./research_results/standard_test

# 测试3：压力测试（10分钟，高频）
python scripts/datasource_research.py \
    --duration 600 \
    --interval 3 \
    --output ./research_results/stress_test
```

#### 步骤3：实时监控

```bash
# 在另一个终端窗口实时监控
watch -n 5 'ls -la research_results/*/research_summary_*.json 2>/dev/null | tail -5'
```

### 3.4 需要采集的关键指标

#### 延迟指标
- [ ] 响应时间（RTT）- 目标：< 3秒
- [ ] 数据新鲜度（Data Timestamp - Current Time）- 目标：< 10秒
- [ ] P50/P95/P99延迟分布
- [ ] 各数据源延迟对比

#### 可靠性指标
- [ ] 成功率（Success Rate）- 目标：> 85%
- [ ] 错误类型分布（连接错误、超时、频率限制等）
- [ ] 超时率 - 目标：< 10%
- [ ] 连接失败率 - 目标：< 5%
- [ ] IP封禁触发情况

#### 限制指标（重点！）
- [ ] **实际频率限制**（通过压力测试发现）
- [ ] **批量接口限制**（单次最大返回数量）
- [ ] **日/小时额度消耗**（特别是Tushare）
- [ ] **IP封禁阈值**（触发封禁的请求频率）
- [ ] **封禁持续时间**（被禁后多久恢复）

#### 数据质量指标
- [ ] 字段完整性（各数据源返回字段对比）
- [ ] 价格/成交量有效性
- [ ] 多源一致性（同一只股票不同源价格差异）
- [ ] 数据延迟（各源数据时间戳差异）

### 3.5 测试后分析清单

```markdown
## 盘后分析任务

### 1. 数据整理（收盘后30分钟内）
- [ ] 收集所有测试结果文件
- [ ] 汇总各数据源表现
- [ ] 标记异常和错误

### 2. 关键发现验证
- [ ] 验证各数据源实际频率限制
- [ ] 确认最优数据源组合
- [ ] 识别高风险数据源

### 3. 方案优化（基于实测数据）
- [ ] 调整分层策略参数
- [ ] 优化频率限制配置
- [ ] 更新权重分配

### 4. 文档更新
- [ ] 更新DATASOURCE_HYBRID_STRATEGY_PROPOSAL.md
- [ ] 记录实际限制值
- [ ] 更新实施计划
```

```
09:15 - 09:30   集合竞价测试（低频率）
09:30 - 10:00   开盘高峰期测试（高频率）
10:00 - 11:30   正常交易测试（标准频率）
13:00 - 14:00   下午开盘测试（标准频率）
14:00 - 15:00   收盘前测试（高频率）
```

### 3.3 测试脚本使用

```bash
# 1. 进入数据服务目录
cd worktrees/worktree-data-service/data-service

# 2. 安装依赖
pip install -r requirements.txt

# 3. 运行研究脚本（5分钟测试）
python scripts/datasource_research.py \
    --duration 300 \
    --interval 5 \
    --output ./research_results

# 4. 运行长时间测试（30分钟）
python scripts/datasource_research.py \
    --duration 1800 \
    --interval 10 \
    --output ./research_results_long
```

### 3.4 需要采集的关键指标

#### 延迟指标
- 响应时间（RTT）
- 数据新鲜度（Data Timestamp - Current Time）
- P50/P95/P99延迟分布

#### 可靠性指标
- 成功率（Success Rate）
- 错误类型分布
- 超时率
- 连接失败率

#### 限制指标
- 实际频率限制（通过压力测试发现）
- 批量接口限制
- IP封禁情况

#### 数据质量指标
- 字段完整性
- 价格/成交量有效性
- 多源一致性

---

## 4. 优化迭代计划

### 4.1 第一阶段（明天盘后）

基于测试数据，完成：
1. 确定各数据源的实际限制
2. 校准预估参数
3. 识别最优数据源组合
4. 调整分层策略参数

### 4.2 第二阶段（本周内）

实现：
1. 智能路由算法
2. 动态权重调整
3. 异常自动切换
4. 数据一致性校验

### 4.3 第三阶段（下周）

优化：
1. 机器学习预测最优数据源
2. 自适应频率调整
3. 预测性缓存预热
4. 全链路监控告警

---

## 5. 风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| 数据源API变更 | 中 | 高 | 多源备份，快速切换 |
| IP被封禁 | 中 | 高 | 代理池，请求分散 |
| 频率限制比预期严格 | 高 | 中 | 增加数据源，降低频率 |
| 数据不一致 | 中 | 高 | 校验层，投票机制 |
| 网络抖动 | 高 | 低 | 重试机制，缓存兜底 |

---

## 6. 附录

### 6.1 关键股票列表（测试用）

```python
TEST_SYMBOLS = [
    # 沪市主板
    "600000.SH",  # 浦发银行
    "600036.SH",  # 招商银行
    "600519.SH",  # 贵州茅台
    "601318.SH",  # 中国平安
    "688981.SH",  # 中芯国际

    # 深市主板
    "000001.SZ",  # 平安银行
    "000002.SZ",  # 万科A
    "000333.SZ",  # 美的集团

    # 中小板/创业板
    "002415.SZ",  # 海康威视
    "300750.SZ",  # 宁德时代
]
```

### 6.2 监控指标定义

```python
# 延迟分级
DELAY_LEVELS = {
    "excellent": (0, 3),      # 优秀: 0-3秒
    "good": (3, 5),           # 良好: 3-5秒
    "acceptable": (5, 10),    # 可接受: 5-10秒
    "poor": (10, 30),         # 较差: 10-30秒
    "unacceptable": (30, float('inf'))  # 不可接受
}

# 成功率分级
SUCCESS_RATE_LEVELS = {
    "excellent": (99, 100),
    "good": (95, 99),
    "acceptable": (90, 95),
    "poor": (80, 90),
    "unacceptable": (0, 80)
}
```

---

**下一步行动**:
1. 明天开盘前准备好测试环境
2. 运行 `datasource_research.py` 采集数据
3. 盘后分析结果，优化本方案
4. 实现混合采集策略代码
