# News Service 模块 - 开发任务追踪

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

### Phase 5: 生产环境优化

| 编号 | 任务 | 状态 | 优先级 | 说明 |
|------|------|------|--------|------|
| P3-001 | 数据库表创建脚本 | ✅ | P2 | 已创建sql/init.sql和test_init.sql，包含完整表结构和10项测试 |
| P3-002 | 测试脚本索引文档 | ✅ | P3 | 已更新TEST_SCRIPTS.md，补充数据库测试脚本索引和验证记录 |
| P3-003 | Pydantic v2迁移 | ✅ | P3 | 已验证所有模型使用v2语法，24/24单元测试通过 |

---

## 二、阻塞任务（需其他服务跟进）

### 2.1 等待 Backend 服务

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 统一事件总线接入 | Backend Redis Streams | ✅ | SDK已就绪，见C2-001。News Service需实现C3-002发布情报事件 |

### 2.2 等待 AI Service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| AI决策反馈优化 | AI Service决策日志 | 🔄 | 解决中：通过事件总线获取AI决策反馈，订阅`ai:performance:report`，见C3-004B |
| AI情报订阅接口 | AI Service需求确认 | 🔄 | 解决中：Trading AI通过事件总线订阅`news:intelligence:extracted`，见C3-002, C3-003B |

### 2.3 等待 Market Data Service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 行情异动联动 | Market Data Service事件 | 🔄 | 解决中：订阅`market:alert:price_move`事件触发新闻采集，见C3-001, C3-003 |

---

## 三、技术债务

### 3.1 代码优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 数据库SQL脚本 | P2 | 创建stock_intelligence表初始化脚本 | 2小时 |
| 测试覆盖率提升 | P3 | 补充集成测试，目标覆盖率>90% | 4小时 |

### 3.2 测试完善

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 集成测试覆盖 | P2 | 测试真实DeepSeek API调用（需隔离环境） | 6小时 |
| 性能测试基准 | P3 | 建立批量查询性能基准测试 | 3小时 |

---

## 四、未来规划（与架构演进相关）

### 4.1 短期（1-2周）

- [x] 创建数据库表初始化脚本（2026-02-11完成）
- [x] 运行完整测试套件，补充实际测试数据（2026-02-11完成）
- [x] 接入统一事件总线（Redis Streams）- 2026-02-11完成

### 4.2 中期（1-2月）

- [x] AI Service深度集成，优化情报提取 - 2026-02-11完成
- [x] 行情异动联动机制 - 2026-02-11完成
- [ ] 新闻采集调度优化（APScheduler）

### 4.3 长期（3月+）

- [ ] 多语言新闻支持（港股、美股）
- [ ] 情报质量评分模型训练
- [ ] 实时情感指数计算

---

## 五、架构优化任务（2026-02-11新增）

### 5.1 冲突解决方案

#### 冲突1：循环依赖解决（共享Redis + 冷启动）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C1-NS-001 | 接入健康检查SDK | ✅ | P0 | 已集成health_check SDK，添加Redis和DeepSeek检查 |
| C1-NS-002 | 实现降级运行模式 | ✅ | P0 | 已实现ServiceMode切换和降级采集策略 |
| C1-NS-003 | 实现自动恢复机制 | ✅ | P0 | 已实现_recovery_loop()自动恢复检测 |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C1-003（健康检查SDK）

#### 冲突2/3：统一事件总线接入与双向依赖解耦

| 编号 | 任务 | 状态 | 优先级 | 测试描述 | 预计工时 |
|------|------|------|--------|----------|----------|
| C2-NS-001 | 集成Python事件总线SDK | ✅ | P0 | 已创建main.py，集成EventBusClient、Producer、Consumer | 已完成 |
| C3-002 | 发布新闻情报事件 | ✅ | P0 | 已实现：main.py中创建EventProducer，publish_intelligence_event()方法发布到news:intelligence:extracted，Payload包含stock_code,intelligence,sentiment,confidence,timestamp | 2026-02-12 |
| C3-002B | 发布情感变化事件 | 🔲 | P1 | 实现publish_sentiment_change_event()方法 | 0.5天 |
| C3-003B | 订阅行情异动事件 | ✅ | P0 | 已实现：创建EventConsumer(consumer_group=news-trigger-group)，订阅market:alert:price_move，_handle_price_alert处理器解析symbol→触发采集 | 2026-02-12 |
| C3-003C | 订阅AI决策反馈事件 | 🔲 | P1 | 订阅`ai:performance:report`优化Prompt | 0.5天 |
| C2-NS-002 | 配置消费者组 | ✅ | P1 | 已配置消费者组news-trigger-group | 已完成 |

**C3-002 开发要求**:
1. 在 `main.py` 中创建 `EventProducer` 实例
2. 实现 `publish_intelligence_event()` 方法
3. 在情报提取完成后调用该方法
4. 发布到 stream: `news:intelligence:extracted`
5. Payload格式: `{ stock_code, intelligence, sentiment, confidence, timestamp }`

**C3-003B 开发要求**:
1. 创建 `EventConsumer` 实例，consumer_group="news-trigger-group"
2. 订阅 `market:alert:price_move` 事件
3. 实现处理器：根据异动股票触发相关新闻采集
4. 处理器逻辑：解析symbol -> 查询相关新闻源 -> 触发采集

**阻塞状态**: ✅ C2-001 Python SDK已完成，C3-002/C3-003B可立即开始开发

#### 冲突6：广度查询支持

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C6-NS-001 | 创建股票分类映射表 | ✅ | P1 | 已创建stock_classification表，含36条示例数据 |
| C6-001 | 实现板块情报查询 | ✅ | P1 | `GET /api/v1/intelligence/sector/{sector}` - 已实现 |
| C6-002 | 实现行业情报查询 | ✅ | P1 | `GET /api/v1/intelligence/industry/{industry}` - 已实现 |
| C6-003 | 实现概念情报查询 | ✅ | P1 | `GET /api/v1/intelligence/concept/{concept}` - 已实现 |
| C6-NS-002 | 批量查询优化 | ✅ | P2 | `GET /api/v1/intelligence/batch` - 已实现 |

**阻塞状态**: C6-NS-001 阻塞 C6-001~C6-003

---

## 六、外部依赖跟踪（更新）

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 | 说明 |
|----------|---------|---------|---------|------|
| Backend | Redis Streams事件总线 | ✅ 已完成 | 2026-02-11 | SDK已就绪，见下方使用指南 |
| AI Service | 决策反馈接口 | 🔄 解决中 | 2026-02-11 | Trading AI发布`ai:performance:report`事件，News Service需订阅（C3-004B） |
| Market Data Service | 行情异动事件 | ✅ 已就绪 | 2026-02-12 | Market Data已发布`market:alert:price_move`事件，News Service需实现订阅（C3-003B） |
| infra | 事件总线Python SDK | ✅ 已完成 | 2026-02-11 | C2-001已完成，见下方使用指南 |
| infra | 健康检查SDK | ✅ 已完成 | 2026-02-11 | C1-003已完成，见使用指南 |

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

**3. 订阅行情异动事件**
```python
# 创建消费者
client = EventBusClient(host="redis", port=6379)
consumer = EventConsumer(
    client=client,
    service_name="news-service",
    consumer_group="news-trigger-group"
)

# 定义处理器：行情异动触发新闻采集
def handle_price_alert(event: EventSchema):
    symbol = event.payload["symbol"]
    alert_type = event.payload["alert_type"]
    # 触发新闻采集...
    print(f"价格异动: {symbol}, 类型: {alert_type}")

# 订阅事件
consumer.subscribe(EventType.MARKET_ALERT_PRICE_MOVE, handle_price_alert)
consumer.start()
```

**4. 发布新闻情报事件**
```python
# 创建生产者
producer = EventProducer(client=client, service_name="news-service")

# 发布情报
producer.publish_event(
    EventType.NEWS_INTELLIGENCE_EXTRACTED,
    {
        "stock_code": "000001.SZ",
        "intelligence": "平安银行发布利好公告...",
        "sentiment": "positive",
        "timestamp": "2026-02-11T10:00:00Z"
    }
)
```

### 完整文档
- [SDK使用指南](../../infra/event-bus/USAGE_GUIDE.md)
- [SDK README](../../infra/event-bus/README.md)

---

## 六、外部依赖跟踪（更新）

---

## 五、外部依赖跟踪

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 |
|----------|---------|---------|---------|
| Backend | Redis Streams事件总线 | ✅ 已完成 | 2026-02-11 | SDK已就绪，可开始C3-002开发 |
| AI Service | ~~决策反馈接口~~ | 🔄 解决中 | 2026-02-11 | 架构变更：通过事件总线发布`news:intelligence:extracted`，见C3-002 |
| Market Data Service | 行情异动事件 | 🔄 解决中 | 2026-02-11 | 订阅`market:alert:price_move`触发新闻采集，见C3-001 |

---

## 六、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| 2026-02-11 | 完成NS-D-004：推送频率可调配置，支持1/2/5分钟动态配置，运行时更新，15项单元测试通过 | 开发团队 |
| 2026-02-11 | 完成NS-D-003：覆盖范围计算增强，支持股票/板块/行业/概念多维度覆盖分析，12项单元测试通过 | 开发团队 |
| 2026-02-11 | 完成NS-D-002：热情报批量推送，HotIntelligencePusher类实现，支持APScheduler定时推送，10项单元测试通过 | 开发团队 |
| 2026-02-11 | 完成NS-D-001：热情报筛选算法，HotIntelligenceSelector类实现，12项单元测试通过 | 开发团队 |
| 2026-02-11 | 完成P0健康检查SDK集成（C1-NS-001~003）和降级运行模式 | 开发团队 |
| 2026-02-11 | 完成事件总线集成（C2-NS-001, C3-002, C3-003B）和广度查询API（C6-001~C6-003） | 开发团队 |
| 2026-02-11 | 完成股票分类映射表（C6-NS-001）和批量查询（C6-NS-002） | 开发团队 |
| 2026-02-11 | 完成P3-001~P3-003生产环境优化任务（数据库脚本、测试文档、Pydantic v2验证） | 开发团队 |
| 2026-02-11 | 重构TODO.md，创建HAVE_DONE.md和TEST_SCRIPTS.md | 首席架构师 |
| 2026-02-10 | 完成T-001~T-010所有开发任务 | 开发团队 |

---

## 七、联调冲刺任务（2026-02-12新增）

> 基于架构审查报告，以下任务为联调前必须完成的工作项。

### 7.1 🟡 P1 - 事件总线完善（高优先级）

| 编号 | 任务 | 状态 | 预估工时 | 依赖 | 验收标准 |
|------|------|------|----------|------|----------|
| C3-003C | 订阅AI决策反馈事件 | 🔲 | 0.5天 | Trading AI C3-004B | 订阅 ai:performance:report 优化Prompt |

**阻塞状态**: 依赖 Trading AI C3-004B 发布绩效报告事件

### 7.2 联调验收 checklist

- [ ] 新闻情报事件正确发布
- [ ] 行情异动事件正确订阅
- [ ] AI决策反馈事件订阅正常
- [ ] 情感变化事件发布正常

---

*文档版本: v2.1（联调冲刺版）*
*最后更新: 2026-02-12*
*维护者: 首席架构师*

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
