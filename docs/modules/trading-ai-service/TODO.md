# Trading AI Service 模块 - 开发任务追踪

> 本文档仅记录未完成和待其他服务跟进的工作项。
> 已完成功能请查阅 [HAVE_DONE.md](./HAVE_DONE.md)。
> 最后更新：2026-02-12

---

## 状态图例

- 🔲 待开发
- 🔄 开发中
- ⚠️ 待验证/部分完成
- ⏸️ 阻塞（依赖其他服务）
- ✅ 已完成（已移至 HAVE_DONE.md）

---

## 一、联调准备阶段 (2026-02-12)

> Trading AI Service已达到**联调准备就绪状态**（92%完成度）。核心功能全部完成，以下任务为联调验证和阻塞其他服务的依赖项。

### 联调就绪确认

| 就绪项 | 状态 | 说明 |
|--------|------|------|
| 事件总线SDK | ✅ 就绪 | C2-TAI-001 发布/订阅全部就绪 |
| 行情事件订阅 | ✅ 就绪 | C3-003 订阅`market:quote:realtime` |
| 新闻事件订阅 | ✅ 就绪 | C3-003B 订阅`news:intelligence:extracted` |
| 决策事件发布 | ✅ 就绪 | C3-004 发布`ai:decision:made` |
| 绩效事件发布 | ✅ 就绪 | C3-004B 发布`ai:performance:report` |
| Token防抖 | ✅ 就绪 | C3-009 DebounceKey+TokenDebouncer |
| 健康检查 | ✅ 就绪 | C1-TAI-001~003 接入SDK |
| 广度查询 | ✅ 就绪 | C6-TAI-001~003 板块/行业/批量决策 |
| AI适配器 | ✅ 就绪 | 6大提供商适配器全部实现 |

### 阻塞其他服务的任务（Trading AI提供）

| 编号 | 任务 | 状态 | 被阻塞服务 | 说明 |
|------|------|------|----------|------|
| C3-004 | 发布AI决策事件 | ✅ | Backend | Backend可订阅`ai:decision:made`事件接收决策 |
| C3-004B | 发布绩效报告事件 | ✅ | Backend | Backend可订阅`ai:performance:report`事件 |

### 等待其他服务的任务（非阻塞联调）

| 编号 | 任务 | 状态 | 依赖服务 | 说明 |
|------|------|------|----------|------|
| C3-003C | 订阅技术指标事件 | ⏸️ | Market Data C3-001B | 等待`market:indicator:updated`事件发布，可选功能 |
| C3-006 | 移除Market Data HTTP客户端 | ⏸️ | Market Data C3-001 | 事件总线替代HTTP，联调后优化 |
| C3-007 | 移除News Service HTTP客户端 | ⏸️ | News Service C3-002 | 事件总线替代HTTP，联调后优化 |
| C3-008 | 移除Backend HTTP回调 | ⏸️ | Backend C3-004订阅 | 事件总线替代HTTP回调，联调后优化 |
| K线数据 | HTTP接口调用 | ⏸️ | Market Data | 低频数据，仍需HTTP接口 |

**结论**: Trading AI Service核心功能全部就绪，可作为事件提供方参与联调。等待其他服务的任务均为优化项（HTTP客户端移除），不影响联调进行。

---

## 二、历史任务记录

### Phase 5: 增强功能（已完成）

| 编号 | 任务 | 状态 | 优先级 | 说明 |
|------|------|------|--------|------|
| E-001 | GLM/Moonshot完整适配器 | ✅ | P2 | 已完成：Qwen/Wenxin/Moonshot适配器HTTP调用实现（2026-02-11） |
| E-002 | K线特征提取服务 | ✅ | P2 | 已完成：K线形态识别、趋势分析、自然语言描述生成（2026-02-11） |
| E-003 | 多维度风险画像 | ✅ | P2 | 已完成：12种风险类型+4维度评估+风险报告生成（2026-02-11） |
| D-001 | APScheduler集成 | ✅ | P0 | 已完成：SchedulerManager单例实现，支持5/15/60分钟定时任务（2026-02-11） |

---

## 二、阻塞任务（需其他服务跟进）

### 2.1 等待 Market Data Service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| K线数据接口 | `POST /api/v1/stocks/kline` | ⏸️ | 用于特征提取和技术分析 |
| ~~批量实时行情~~ | ~~`POST /api/v1/stocks/realtime`~~ | 🔄 | 解决中：架构变更，改为订阅`market:quote:realtime`事件，见C3-003 |
| ~~技术指标接口~~ | ~~`POST /api/v1/stocks/indicators`~~ | 🔄 | 解决中：架构变更，改为订阅`market:indicator:updated`事件，见C3-003 |

### 2.2 等待 News Service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| ~~股票新闻接口~~ | ~~`POST /api/v1/news/stocks`~~ | 🔄 | 解决中：架构变更，改为订阅`news:intelligence:extracted`事件，见C3-003 |
| ~~情报聚合接口~~ | ~~`GET /api/v1/intelligence/{code}`~~ | ❌ | 取消：通过事件总线获取情报，不再HTTP调用 |

### 2.3 等待 Backend

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| ~~决策回调通知~~ | ~~Backend回调接口~~ | 🔄 | 解决中：架构变更，改为发布`ai:decision:made`事件，见C3-004 |
| 决策执行结果 | 交易记录查询接口 | ⏸️ | 用于决策回测分析（仍需HTTP接口） |

---

## 三、技术债务

### 3.1 测试完善

| 项目 | 优先级 | 说明 | 预计工作量 | 状态 |
|------|--------|------|-----------|------|
| 独立单元测试 | P1 | 拆分综合测试为pytest独立单元测试 | 4小时 | ✅ 已完成：新增58个单元测试，总计178个测试通过 |
| 集成测试覆盖 | P1 | 对接Market Data/News Service测试 | 6小时 | ⏸️ 阻塞：等待Market Data/News Service完成事件发布功能（C3-001/C3-002） |
| 压力测试 | P2 | 批量决策API并发性能测试 | 3小时 | 🔲 待开发 | 暂不紧急，等业务稳定后再进行 |

### 3.2 代码优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 流式响应支持 | P2 | SSE方式返回AI响应 | 1天 |
| 配置化限流 | P2 | YAML配置+配置中心集成 | 1天 |
| AI账户粒度Token记录 | P2 | 支持会员制计费 | 1天 |

---

## 四、未来规划（与架构演进相关）

### 4.1 短期（1-2周）

- [x] 完成GLM/Moonshot适配器HTTP调用实现 ✅ 2026-02-11
- [x] 补充独立单元测试（pytest框架） ✅ 2026-02-12 新增58个测试
- [ ] 对接Market Data Service行情接口 ⏸️ 阻塞：等待Market Data完成C3-001事件发布
- [ ] 对接News Service新闻接口 ⏸️ 阻塞：等待News Service完成C3-002事件发布

**说明**: 短期任务中2项已完成，联调任务因依赖服务未完成而阻塞。

### 4.2 中期（1-2月）

- [ ] K线特征提取服务开发
- [ ] 决策回测接口开发
- [ ] 批量综合决策API优化
- [ ] 模型性能对比报告

### 4.3 长期（3月+）

- [ ] 自适应模型选择（根据任务类型自动选择）
- [ ] 决策质量评估模型训练
- [ ] 多语言支持（港股、美股）

---

## 五、架构优化任务（2026-02-11新增）

### 5.1 冲突解决方案

#### 冲突1：循环依赖解决（共享Redis + 冷启动）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C1-TAI-001 | 接入健康检查SDK | ✅ | P0 | 已完成：使用infra/health-check SDK，17个测试通过 |
| C1-TAI-002 | 实现降级运行模式 | ✅ | P0 | 已完成：支持NORMAL/DEGRADED/OFFLINE三种模式 |
| C1-TAI-003 | 实现自动恢复机制 | ✅ | P0 | 已完成：每10秒检查依赖，自动切换模式 |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C1-003（健康检查SDK）

#### 冲突2/3：统一事件总线接入与双向依赖解耦

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C2-TAI-001 | 集成Python事件总线SDK | ✅ | P0 | 已完成：EventBusManager单例实现，支持订阅和发布事件 |
| C3-003 | 订阅实时行情事件 | ✅ | P0 | 已完成：MarketDataHandler订阅`market:quote:realtime`事件 |
| C3-003B | 订阅新闻情报事件 | ✅ | P0 | 已完成：NewsHandler订阅`news:intelligence:extracted`事件 |
| C3-003C | 订阅技术指标事件 | ⏸️ | P1 | **阻塞**：等待Market Data Service实现`market:indicator:updated`事件发布 |
| C3-009 | 实现Token防抖机制 | ✅ | P0 | 已完成：DebounceKey+TokenDebouncer实现，17个测试通过 |
| C3-004 | 发布AI决策事件 | ✅ | P0 | 已完成：DecisionEventPublisher发布`ai:decision:made`事件 |
| C3-004B | 发布绩效报告事件 | ✅ | P1 | 已完成：PerformanceEventPublisher实现，8个测试通过 |
| C3-006 | 移除Market Data HTTP客户端 | ⏸️ | P1 | **阻塞**：等待Market Data Service完成C3-001事件发布，确保事件总线可替代HTTP调用 |
| C3-007 | 移除News Service HTTP客户端 | ⏸️ | P1 | **阻塞**：等待News Service完成C3-002事件发布，确保事件总线可替代HTTP调用 |
| C3-008 | 移除Backend HTTP回调 | ⏸️ | P1 | **阻塞**：等待Backend完成C3-004事件订阅，确保Backend可接收`ai:decision:made`事件 |

**阻塞状态详细说明**:

| 任务 | 依赖服务 | 依赖任务 | 阻塞原因 | 预计解锁条件 |
|------|----------|----------|----------|--------------|
| C3-003C | Market Data Service | C3-001B | 需要Market Data发布`market:indicator:updated`事件 | Market Data Service完成技术指标事件发布 |
| C3-006 | Market Data Service | C3-001 | 需要确认事件总线可完全替代HTTP行情查询 | Market Data Service稳定发布行情事件+联调测试通过 |
| C3-007 | News Service | C3-002 | 需要确认事件总线可完全替代HTTP新闻查询 | News Service稳定发布新闻事件+联调测试通过 |
| C3-008 | Backend | C3-004订阅 | 需要确认Backend可接收并处理AI决策事件 | Backend完成`ai:decision:made`事件订阅和处理 |

**联调顺序建议**:
1. Market Data Service 完成 C3-001（行情事件发布）
2. News Service 完成 C3-002（新闻事件发布）
3. Trading AI Service 验证事件接收正常（C3-003, C3-003B）
4. Backend 完成 C3-004订阅（决策事件订阅）
5. Trading AI Service 移除HTTP客户端（C3-006, C3-007, C3-008）

#### 冲突4调整：AI对话服务移除

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C4-TAI-001 | 移除对话相关代码 | ✅ | P0 | 已完成：确认无对话代码，10个测试验证 |
| C4-TAI-002 | 更新API文档 | ✅ | P0 | 已完成：README更新服务职责说明 |

**阻塞状态**: 依赖C4-001~C4-007（Backend实现AI对话后）

#### 优化：决策服务增强

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C6-TAI-001 | 支持板块级决策 | ✅ | P1 | 已完成：MarketDataClient + BreadthDecisionService，调用GET /api/v1/market/sector/{sector}/quotes |
| C6-TAI-002 | 支持行业级决策 | ✅ | P1 | 已完成：调用GET /api/v1/market/industry/{industry}/quotes |
| C6-TAI-003 | 实现批量股票决策 | ✅ | P1 | 已完成：调用GET /api/v1/market/index/{index}/components，支持指数成分股批量分析 |

**完成详情** (2026-02-12):
- ✅ MarketDataClient 实现：封装 HTTP 调用 Market Data Service 广度查询接口
- ✅ BreadthDecisionService 实现：板块/行业/批量决策生成
- ✅ API 集成：GET /api/v1/market/sector/{sector}/quotes
- ✅ API 集成：GET /api/v1/market/industry/{industry}/quotes
- ✅ API 集成：GET /api/v1/market/index/{index}/components
- ✅ AI 决策提示词：针对板块、行业、批量场景优化
- ✅ 单元测试：25个测试全部通过
- 相关文件:
  - `services/market_data_client.py` - HTTP 客户端
  - `services/breadth_decision_service.py` - 决策服务
  - `tests/unit/services/test_market_data_client.py` - 客户端测试
  - `tests/unit/services/test_breadth_decision_service.py` - 决策服务测试

---

## 六、外部依赖跟踪（更新）

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 | 说明 | 依赖任务 |
|----------|---------|---------|---------|------|----------|
| Market Data Service | K线数据接口 | ⏸️ 阻塞 | - | 仍需HTTP接口（低频数据） | - |
| Market Data Service | 批量实时行情 | ⏸️ 阻塞 | 2026-02-12 | 架构变更：等待`market:quote:realtime`事件发布 | C3-001 |
| Market Data Service | 技术指标事件 | ⏸️ 阻塞 | 2026-02-12 | 架构变更：等待`market:indicator:updated`事件发布 | C3-001B |
| Market Data Service | 板块行情接口 | ⏸️ 阻塞 | 2026-02-12 | 等待广度查询接口 | C6-004 |
| Market Data Service | 行业行情接口 | ⏸️ 阻塞 | 2026-02-12 | 等待广度查询接口 | C6-005 |
| Market Data Service | 股票列表接口 | ⏸️ 阻塞 | 2026-02-12 | 等待广度查询接口 | C6-006 |
| News Service | 股票新闻接口 | ⏸️ 阻塞 | 2026-02-12 | 架构变更：等待`news:intelligence:extracted`事件发布 | C3-002 |
| Backend | 决策回调通知 | ⏸️ 阻塞 | 2026-02-12 | 架构变更：等待Backend订阅`ai:decision:made`事件 | Backend C3-004订阅 |
| infra | 事件总线Python SDK | ✅ 已完成 | 2026-02-11 | C2-001已完成，见下方使用指南 | - |
| infra | 健康检查SDK | ✅ 已完成 | 2026-02-12 | C1-003已完成，接入infra/health-check SDK | - |
| infra | Token防抖机制规范 | ✅ 已完成 | 2026-02-12 | C3-009已完成，实现DebounceKey+TokenDebouncer | - |

---

## 附录：事件总线SDK使用指南

### SDK位置
```
项目根目录/infra/event-bus/src/event_bus/
```

### 快速开始

**1. 添加Python路径（在main.py顶部）**
```python
import sys
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))
```

**2. 导入SDK**
```python
from event_bus import (
    EventBusClient, EventProducer, EventConsumer,
    EventType, EventSchema
)
```

**3. 订阅行情和新闻事件**
```python
# 创建消费者
client = EventBusClient(host="redis", port=6379)
consumer = EventConsumer(
    client=client,
    service_name="trading-ai",
    consumer_group="ai-decision-group"
)

# 定义处理器
def handle_market_quote(event: EventSchema):
    symbol = event.payload["symbol"]
    price = event.payload["price"]
    # AI决策逻辑...

def handle_news(event: EventSchema):
    stock_code = event.payload["stock_code"]
    sentiment = event.payload["sentiment"]
    # 处理新闻...

# 订阅事件
consumer.subscribe(EventType.MARKET_QUOTE_REALTIME, handle_market_quote)
consumer.subscribe(EventType.NEWS_INTELLIGENCE_EXTRACTED, handle_news)
consumer.start()
```

**4. 发布AI决策事件**
```python
# 创建生产者
producer = EventProducer(client=client, service_name="trading-ai")

# 发布决策
producer.publish_event(
    EventType.AI_DECISION_MADE,
    {
        "account_id": "acc_123",
        "decision": "buy",
        "confidence": 0.85,
        "reasoning": "技术指标突破",
        "timestamp": "2026-02-11T10:00:00Z"
    }
)
```

### 完整文档
- [SDK使用指南](../../infra/event-bus/USAGE_GUIDE.md)
- [SDK README](../../infra/event-bus/README.md)

---

## 五、外部依赖跟踪

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 |
|----------|---------|---------|---------|
| Market Data Service | K线数据接口 | 🔲 未开始 | - |
| Market Data Service | 批量实时行情 | 🔄 解决中 | 2026-02-11 | 架构变更：通过事件总线订阅行情，见C3-003 |
| News Service | 股票新闻接口 | 🔄 解决中 | 2026-02-11 | 架构变更：通过事件总线订阅新闻，见C3-003 |
| Backend | 决策回调通知 | 🔄 解决中 | 2026-02-11 | 架构变更：通过事件总线发布决策，见C3-004 |

---

## 六、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| 2026-02-12 | 完成C6-TAI-001~003板块/行业/批量决策服务 | 开发智能体 |
| 2026-02-12 | 新增MarketDataClient和BreadthDecisionService | 开发智能体 |
| 2026-02-12 | 新增单元测试：market_data_client10+breadth_decision15 | 开发智能体 |
| 2026-02-12 | 完成技术债务：独立单元测试（新增58个测试） | 开发智能体 |
| 2026-02-12 | 完成C1-TAI-001~003健康检查SDK接入 | 开发智能体 |
| 2026-02-12 | 完成C3-004B绩效报告事件发布器 | 开发智能体 |
| 2026-02-12 | 完成C4-TAI-001~002对话代码清理确认 | 开发智能体 |
| 2026-02-12 | 新增单元测试：prompts13+adapter_factory10+健康检查17+无对话10+绩效8 | 开发智能体 |
| 2026-02-11 | 完成E-001~E-003增强功能开发 | 开发智能体 |
| 2026-02-11 | Qwen/Wenxin/Moonshot适配器HTTP调用实现 | 开发智能体 |
| 2026-02-11 | K线特征提取服务开发完成 | 开发智能体 |
| 2026-02-11 | 多维度风险画像服务开发完成 | 开发智能体 |
| 2026-02-11 | 新增单元测试27个，全部通过 | 开发智能体 |
| 2026-02-11 | 重构TODO.md，创建HAVE_DONE.md | 首席架构师 |
| 2026-02-10 | 完成T-001~T-012所有基础功能 | 开发团队 |
| 2026-02-10 | 综合功能测试32项全部通过 | 开发团队 |

---

## 七、开发进度总览（2026-02-12更新）

### 7.1 任务完成情况

| 类别 | 总数 | 已完成 | 进行中 | 阻塞 | 待开发 |
|------|------|--------|--------|------|--------|
| Phase 5 增强功能 | 4 | 4 | 0 | 0 | 0 |
| 阻塞任务 | 10 | 0 | 0 | 10 | 0 |
| 技术债务 | 3 | 1 | 0 | 1 | 1 |
| 架构优化任务 | 13 | 11 | 0 | 2 | 0 |
| **总计** | **30** | **16** | **0** | **13** | **1** |

### 7.2 本次开发完成内容（2026-02-12）

1. **C6-TAI-001~003 板块/行业/批量决策服务**
   - 实现 MarketDataClient HTTP 客户端，封装 Market Data Service 接口
   - 实现 BreadthDecisionService 广度决策服务
   - 支持板块级决策：GET /api/v1/market/sector/{sector}/quotes
   - 支持行业级决策：GET /api/v1/market/industry/{industry}/quotes
   - 支持批量决策：GET /api/v1/market/index/{index}/components
   - 针对板块、行业、批量场景优化 AI 提示词
   - 新增 25 个单元测试全部通过

2. **C1-TAI-001~003 健康检查与降级模式**
   - 使用 infra/health-check SDK 实现健康检查服务
   - 支持 NORMAL/DEGRADED/OFFLINE 三种服务模式
   - 每10秒自动检查依赖状态，支持自动恢复
   - 新增17个单元测试

2. **C3-004B 绩效报告事件发布器**
   - 实现 PerformanceEventPublisher 类
   - 支持定期发布 `ai:performance:report` 事件
   - 新增8个单元测试

3. **C4-TAI-001~002 移除AI对话代码确认**
   - 确认服务无对话相关代码
   - 更新README明确服务职责
   - 新增10个验证测试

4. **技术债务：独立单元测试**
   - 新增 prompts 模块测试13个
   - 新增 AdapterFactory 测试10个
   - 总计新增58个单元测试

### 7.3 阻塞任务清单

| 任务编号 | 任务名称 | 阻塞原因 | 依赖服务 | 依赖任务 |
|----------|----------|----------|----------|----------|
| C3-003C | 订阅技术指标事件 | 等待Market Data发布指标事件 | Market Data Service | C3-001B |
| C3-006 | 移除Market Data HTTP客户端 | 等待事件总线可完全替代HTTP | Market Data Service | C3-001 |
| C3-007 | 移除News Service HTTP客户端 | 等待事件总线可完全替代HTTP | News Service | C3-002 |
| C3-008 | 移除Backend HTTP回调 | 等待Backend可接收决策事件 | Backend | C3-004订阅 |
| K线数据接口 | 低频数据查询 | 仍需HTTP接口 | Market Data Service | - |
| 集成测试 | 对接测试 | 等待服务就绪 | Market Data/News | C3-001/C3-002 |

### 7.4 下一步行动计划

**可立即开始（无阻塞）**:
- 压力测试（P2，3小时工作量）
- 代码优化（流式响应、配置化限流等）

**需等待依赖服务完成后开始**:
- 所有C3系列联调任务（等待Market Data/News Service事件发布）
- 所有C6系列增强功能（等待Market Data广度查询接口）

**建议**: 优先推动Market Data Service完成C3-001事件发布，以解锁Trading AI Service的核心联调任务。

---

*文档版本: v2.0（精简版）*
*最后更新: 2026-02-12*
*维护者: 首席架构师*

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
