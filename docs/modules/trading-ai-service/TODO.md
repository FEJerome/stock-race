# Trading AI Service 模块 - 开发任务追踪

> 本文档仅记录未完成和待其他服务跟进的工作项。
> 已完成功能请查阅 [HAVE_DONE.md](./HAVE_DONE.md)。
> 最后更新：2026-02-11

---

## 状态图例

- 🔲 待开发
- 🔄 开发中
- ⚠️ 待验证/部分完成
- ⏸️ 阻塞（依赖其他服务）
- ✅ 已完成（已移至 HAVE_DONE.md）

---

## 一、未完成工作项

### Phase 5: 增强功能

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

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 独立单元测试 | P1 | 拆分综合测试为pytest独立单元测试 | 4小时 |
| 集成测试覆盖 | P1 | 对接Market Data/News Service测试 | 6小时 |
| 压力测试 | P2 | 批量决策API并发性能测试 | 3小时 |

### 3.2 代码优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 流式响应支持 | P2 | SSE方式返回AI响应 | 1天 |
| 配置化限流 | P2 | YAML配置+配置中心集成 | 1天 |
| AI账户粒度Token记录 | P2 | 支持会员制计费 | 1天 |

---

## 四、未来规划（与架构演进相关）

### 4.1 短期（1-2周）

- [ ] 完成GLM/Moonshot适配器HTTP调用实现
- [ ] 补充独立单元测试（pytest框架）
- [ ] 对接Market Data Service行情接口
- [ ] 对接News Service新闻接口

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
| C1-TAI-001 | 接入健康检查SDK | 🔲 | P0 | 服务启动时检查Redis状态 |
| C1-TAI-002 | 实现降级运行模式 | 🔲 | P0 | 无行情/新闻数据时以基础模型运行 |
| C1-TAI-003 | 实现自动恢复机制 | 🔲 | P0 | 数据恢复后恢复正常决策模式 |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C1-003（健康检查SDK）

#### 冲突2/3：统一事件总线接入与双向依赖解耦

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C2-TAI-001 | 集成Python事件总线SDK | ✅ | P0 | 已完成：EventBusManager单例实现，支持订阅和发布事件 |
| C3-003 | 订阅实时行情事件 | ✅ | P0 | 已完成：MarketDataHandler订阅`market:quote:realtime`事件 |
| C3-003B | 订阅新闻情报事件 | ✅ | P0 | 已完成：NewsHandler订阅`news:intelligence:extracted`事件 |
| C3-003C | 订阅技术指标事件 | 🔲 | P1 | 订阅`market:indicator:updated` |
| C3-009 | 实现Token防抖机制 | ✅ | P0 | 已完成：DebounceKey+TokenDebouncer实现，17个测试通过 |
| C3-004 | 发布AI决策事件 | ✅ | P0 | 已完成：DecisionEventPublisher发布`ai:decision:made`事件 |
| C3-004B | 发布绩效报告事件 | 🔲 | P1 | 定期发布`ai:performance:report` |
| C3-006 | 移除Market Data HTTP客户端 | 🔲 | P1 | 删除行情查询HTTP调用 |
| C3-007 | 移除News Service HTTP客户端 | 🔲 | P1 | 删除新闻查询HTTP调用 |
| C3-008 | 移除Backend HTTP回调 | 🔲 | P1 | 删除决策通知HTTP回调 |

**阻塞状态**:
- 依赖 [infra/TODO.md](../infra/TODO.md) C2-001（Python SDK）
- C3-003, C3-003B 依赖 C3-001, C3-002（Market Data和News Service发布事件）

#### 冲突4调整：AI对话服务移除

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C4-TAI-001 | 移除对话相关代码 | 🔲 | P0 | 清理不再需要的对话接口和逻辑 |
| C4-TAI-002 | 更新API文档 | 🔲 | P0 | 移除对话接口文档，更新服务职责说明 |

**阻塞状态**: 依赖C4-001~C4-007（Backend实现AI对话后）

#### 优化：决策服务增强

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C6-TAI-001 | 支持板块级决策 | 🔲 | P1 | 基于板块行情生成板块配置建议 |
| C6-TAI-002 | 支持行业级决策 | 🔲 | P1 | 基于行业行情生成行业配置建议 |
| C6-TAI-003 | 实现批量股票决策 | 🔲 | P1 | 同时分析多只股票生成组合建议 |

**阻塞状态**: 依赖C6-004~C6-006（Market Data广度查询接口）

---

## 六、外部依赖跟踪（更新）

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 | 说明 |
|----------|---------|---------|---------|------|
| Market Data Service | K线数据接口 | ⏸️ 阻塞 | - | 仍需HTTP接口（低频数据） |
| Market Data Service | 批量实时行情 | 🔄 解决中 | 2026-02-11 | 架构变更：事件订阅 |
| News Service | 股票新闻接口 | 🔄 解决中 | 2026-02-11 | 架构变更：事件订阅 |
| Backend | 决策回调通知 | 🔄 解决中 | 2026-02-11 | 架构变更：事件发布 |
| infra | 事件总线Python SDK | ✅ 已完成 | 2026-02-11 | C2-001已完成，见下方使用指南 |
| infra | Token防抖机制规范 | ✅ 已完成 | 2026-02-11 | C3-009已完成，实现DebounceKey+TokenDebouncer |

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
| 2026-02-11 | 完成E-001~E-003增强功能开发 | 开发智能体 |
| 2026-02-11 | Qwen/Wenxin/Moonshot适配器HTTP调用实现 | 开发智能体 |
| 2026-02-11 | K线特征提取服务开发完成 | 开发智能体 |
| 2026-02-11 | 多维度风险画像服务开发完成 | 开发智能体 |
| 2026-02-11 | 新增单元测试27个，全部通过 | 开发智能体 |
| 2026-02-11 | 重构TODO.md，创建HAVE_DONE.md | 首席架构师 |
| 2026-02-10 | 完成T-001~T-012所有基础功能 | 开发团队 |
| 2026-02-10 | 综合功能测试32项全部通过 | 开发团队 |

---

## 六、联调冲刺任务（2026-02-12新增）

> 基于架构审查报告，以下任务为联调前必须完成的工作项。

### 6.1 🔴 P0 - 阻塞联调（最高优先级）

| 编号 | 任务 | 状态 | 预估工时 | 依赖 | 验收标准 |
|------|------|------|----------|------|----------|
| C1-TAI-001 | 接入健康检查SDK | 🔲 | 0.5天 | Infra C1-003 | 服务启动时检查Redis状态 |
| C1-TAI-002 | 实现降级运行模式 | 🔲 | 0.5天 | C1-TAI-001 | 无行情/新闻时基础模型运行 |
| C1-TAI-003 | 实现自动恢复机制 | 🔲 | 0.5天 | C1-TAI-002 | 数据恢复后自动正常决策 |

**阻塞状态**: 依赖 Infra C1-003（Health Check SDK）

### 6.2 🟡 P1 - 事件总线完善（高优先级）

| 编号 | 任务 | 状态 | 预估工时 | 依赖 | 验收标准 |
|------|------|------|----------|------|----------|
| C3-003C | 订阅技术指标事件 | 🔲 | 0.5天 | Market Data C3-001C | 订阅 market:indicator:updated |
| C3-004B | 发布绩效报告事件 | 🔲 | 0.5天 | C3-004 | 定期发布 ai:performance:report |
| C3-006 | 移除Market Data HTTP调用 | 🔲 | 0.5天 | C3-003 | 删除行情查询HTTP客户端 |
| C3-007 | 移除News Service HTTP调用 | 🔲 | 0.5天 | C3-003B | 删除新闻查询HTTP客户端 |
| C3-008 | 移除Backend HTTP回调 | 🔲 | 0.5天 | C3-004 | 删除决策通知HTTP回调 |

**阻塞状态**: 依赖 Market Data C3-001C 发布技术指标事件

### 6.3 🟢 P2 - 功能增强（中优先级）

| 编号 | 任务 | 状态 | 预估工时 | 依赖 | 验收标准 |
|------|------|------|----------|------|----------|
| C6-TAI-001 | 板块级决策支持 | 🔲 | 1天 | Market Data C6-004 | 基于板块行情生成配置建议 |
| C6-TAI-002 | 行业级决策支持 | 🔲 | 1天 | Market Data C6-005 | 基于行业行情生成配置建议 |
| C6-TAI-003 | 批量股票决策 | 🔲 | 1天 | Market Data C6-006 | 多只股票组合建议 |

**阻塞状态**: 依赖 Market Data C6-004~006 广度查询API

### 6.4 联调验收 checklist

- [ ] 健康检查端点正常响应
- [ ] 事件总线订阅/发布正常
- [ ] 降级模式可正常启动
- [ ] Token防抖机制生效
- [ ] AI决策事件正确发布
- [ ] HTTP客户端已移除（可选P1）

---

*文档版本: v2.1（联调冲刺版）*
*最后更新: 2026-02-12*
*维护者: 首席架构师*

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
