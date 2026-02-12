# Market Data Service - 开发任务追踪

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

### Phase 1: 基础功能完善

| 编号 | 任务 | 状态 | 优先级 | 说明 | 阻塞原因 |
|------|------|------|--------|------|----------|
| T-007 | WebSocket实时数据推送 | ⚠️ | P1 | 接口预留但未启用，需前端支持 | 待前端WebSocket客户端就绪 |

### Phase 5: 生产环境优化（剩余项）

| 编号 | 优化项 | 状态 | 优先级 | 说明 |
|------|--------|------|--------|------|
| P3-001 | 修复数据库测试Mock问题 | ✅ | P2 | MockPool配置已修复，15个数据库测试全部通过 |
| P3-002 | 测试导入路径统一 | ✅ | P3 | 导入路径已统一，所有测试使用`data_service`前缀 |
| P3-003 | Pydantic v2迁移 | ✅ | P3 | 已迁移`class Config`到`ConfigDict`，`@validator`到`@field_validator` |

---

## 二、阻塞任务（需其他服务跟进）

### 2.1 等待 Backend 服务

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 行情数据主动推送 | Backend WebSocket | 🔄 | 解决中：架构变更，通过事件总线发布`market:quote:realtime`，见C3-001 |
| 统一事件总线接入 | Backend Redis Streams | 🔄 | 解决中：Backend接入后即可联调，见C2-001, C3-001 |

### 2.2 等待 AI Service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| AI行情订阅接口 | AI Service需求确认 | 🔄 | 解决中：架构变更，AI Service通过事件总线订阅，见C3-001, C3-003 |
| 行情-决策联动 | AI决策服务 | 🔄 | 解决中：通过事件总线解耦，Trading AI订阅行情事件，见C3-003 |

### 2.3 等待 News Service

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 异动新闻联动 | News Service事件订阅 | 🔄 | 解决中：News Service通过事件总线订阅`market:alert:price_move`，见C3-001 |
| 重大新闻行情推送 | News Service事件发布 | 🔄 | 解决中：订阅`news:breaking`事件推送相关行情，见C2-001 |

---

## 三、技术债务

### 3.1 代码优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| router.py 代码拆分 | P3 | 文件1104行，考虑拆分为 router/strategy/metrics 三个模块 | 4小时 |
| 硬编码值提取 | ✅ | 健康检查阈值（如10次错误）提取到配置 | 已完成，见REF-001 |
| 异常类细化 | P3 | 细分DataSourceError为网络/解析/限流等子类 | 3小时 |

### 3.2 测试完善

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 集成测试覆盖 | P2 | 测试真实数据源连接（需隔离环境） | 8小时 |
| 性能测试基准 | P3 | 建立批量查询性能基准测试 | 4小时 |
| 压力测试 | P3 | 模拟高并发场景测试 | 6小时 |

---

## 四、未来规划（与架构演进相关）

### 4.1 短期（1-2周）

- [ ] 修复数据库测试Mock问题
- [ ] 统一测试导入路径
- [ ] 启用WebSocket实时推送（需前端配合）

### 4.2 中期（1-2月）

- [ ] 接入统一事件总线（Redis Streams）
- [ ] 实现数据归档策略（冷数据自动归档到S3）
- [ ] 采集任务调度器优化（Celery/APScheduler）

### 4.3 长期（3月+）

- [ ] ~~行情数据主动推送Backend~~ ➤ 架构变更：通过事件总线实现
- [ ] ~~AI Service数据订阅支持~~ ➤ 架构变更：通过事件总线实现
- [ ] ~~News Service联动机制~~ ➤ 架构变更：通过事件总线实现

---

## 五、联调冲刺任务（2026-02-12新增）

> 基于架构审查报告，Market Data Service已达到**联调就绪状态**（98%完成度）。
> 以下任务为联调验证和等待其他服务接入的工作项。

### 5.1 🟢 联调就绪 - 等待验证（高优先级）

| 编号 | 任务 | 状态 | 说明 | 验证方式 |
|------|------|------|------|----------|
| C2-MD-001 | 事件总线联调验证 | 🔄 | 验证Backend能正确订阅行情事件 | 端到端测试：Backend订阅 → Market Data发布 → 事件接收确认 |
| C3-001 | 实时行情事件验证 | 🔄 | 验证每10秒发布`market:quote:realtime` | 检查Redis Streams消息，确认事件格式正确 |
| C3-001B | 价格异动事件验证 | 🔄 | 验证涨跌幅>7%时发布告警事件 | 模拟价格异动，确认News Service能接收事件 |
| O6-001 | 公开WebSocket联调 | 🔄 | 验证Miniprogram能直连WebSocket | Miniprogram连接测试：订阅、接收、取消订阅 |

**联调环境要求**:
- Redis运行（事件总线）
- Market Data Service:8001
- Backend接入事件总线
- Miniprogram WebSocket客户端

### 5.2 ⏸️ 阻塞任务（等待其他服务）

| 编号 | 任务 | 状态 | 阻塞服务 | 说明 |
|------|------|------|----------|------|
| T-007 | WebSocket实时推送启用 | ⏸️ | Frontend/Miniprogram | 接口已预留，需前端WebSocket客户端就绪 |
| C3-003 | Trading AI行情订阅验证 | ⏸️ | Trading AI C3-003 | 验证AI Service能订阅并处理行情事件 |

### 5.3 联调验收 checklist

- [ ] 实时行情事件正常发布到Redis Streams
- [ ] Backend能成功订阅并消费行情事件
- [ ] 价格异动事件正常触发并广播
- [ ] 公开WebSocket连接无需认证可访问
- [ ] Miniprogram能正确订阅股票并接收推送
- [ ] 板块/行业/指数广度查询API正常返回
- [ ] 所有集成测试通过（9个待验证）

### 5.4 联调问题处理

**发现问题时的处理流程**:
1. 检查Market Data Service日志：`docker-compose logs market-data-service`
2. 检查Redis Streams状态：`XINFO STREAM event-bus:market:quote:realtime`
3. 验证事件格式是否符合schema规范
4. 检查网络连通性：Backend能否访问Redis和Market Data
5. 更新本文档记录问题和解决方案

---

## 六、架构优化任务（2026-02-11新增）

### 5.1 冲突解决方案

#### 冲突1：循环依赖解决（共享Redis + 冷启动）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C1-MD-001 | 接入健康检查SDK | ✅ | P0 | 服务启动时检查Redis和依赖服务状态 |
| C1-MD-002 | 实现降级运行模式 | ✅ | P0 | 采集器降级、数据源降级策略 |
| C1-MD-003 | 实现自动恢复机制 | ✅ | P0 | 依赖恢复后自动升级到正常采集模式 |

**实现说明**:
- 创建 `MarketDataHealthService` 类，集成健康检查SDK
- 实现 Redis 和数据源健康检查依赖
- 支持降级模式策略（`DegradedModeStrategies`）
- 自动恢复监控（每10秒检查一次）
- 15个单元测试全部通过

**相关文件**:
- `src/data_service/services/health_service.py` - 健康服务实现
- `tests/unit/services/test_health_service.py` - 健康服务测试

#### 冲突2：统一事件总线接入

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C2-MD-001 | 集成Python事件总线SDK | ✅ | P0 | 使用SDK发布事件到Redis Streams | 已实现 MarketDataEventPublisher 类 |
| C3-001 | 发布实时行情事件 | ✅ | P0 | 每10秒发布`market:quote:realtime`事件 | 已实现 publish_quote 方法 |
| C3-001B | 发布价格异动事件 | ✅ | P0 | 涨跌幅>7%时发布`market:alert:price_move` | 已实现 check_and_publish_price_alert 方法 |
| C3-001C | 发布技术指标事件 | ✅ | P1 | 技术指标更新时发布`market:indicator:updated` | 已实现 publish_indicator_update 方法 |
| C2-MD-002 | 配置生产者确认 | ✅ | P1 | 确保消息成功写入Redis | 已实现 get_stream_info 和 message ID 返回 |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C2-001（Python SDK）

#### 冲突6：广度查询支持

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C6-007 | 创建板块/行业/概念映射表 | ✅ | P1 | 股票分类映射数据初始化 | 已实现股票分类映射和列表查询 |
| C6-004 | 实现板块行情查询 | ✅ | P1 | `GET /api/v1/market/sector/{sector}/quotes` | 已实现 get_sector_quotes 方法 |
| C6-005 | 实现行业行情查询 | ✅ | P1 | `GET /api/v1/market/industry/{industry}/quotes` | 已实现 get_industry_quotes 方法 |
| C6-006 | 实现指数成分股查询 | ✅ | P1 | `GET /api/v1/market/index/{index}/components` | 已实现 get_index_components 方法 |
| C6-008 | 分页和缓存优化 | ✅ | P2 | 大数据量分页，Redis缓存5分钟 | Redis缓存300秒，分页支持skip/limit |

**实现说明**:
- 创建股票分类映射表，支持板块(financial/technology等)、行业(banking/software等)、概念标签
- 实现板块行情查询：支持分页、排序(market_cap/price/change_percent/volume)、Redis缓存5分钟
- 实现行业行情查询：支持按行业代码查询股票行情，支持板块筛选
- 实现指数成分股查询：支持沪深300等指数成分股查询，包含成分股权重和行情
- 实现分类列表查询：get_sector_list、get_industry_list、get_stock_classification
- 19个单元测试全部通过

**相关文件**:
- `src/data_service/api/routes.py` - API端点定义 (行359-521)
- `src/data_service/services/data_service.py` - 业务逻辑实现 (行815-1070)
- `src/data_service/models/stock.py` - StockSector枚举定义
- `tests/unit/api/test_sector_industry_api.py` - 单元测试

**API端点**:
- `GET /api/v1/market/sector/{sector}/quotes` - 板块行情
- `GET /api/v1/market/industry/{industry}/quotes` - 行业行情
- `GET /api/v1/market/index/{index}/components` - 指数成分股
- `GET /api/v1/market/sectors` - 板块列表
- `GET /api/v1/market/industries` - 行业列表
- `GET /api/v1/market/classification/{symbol}` - 股票分类

**阻塞状态**: 无阻塞，任务已完成

#### 优化6：Miniprogram数据流优化

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| O6-001 | 开放公开WebSocket | ✅ | P0 | `wss://market-data/ws/public/quotes`，无需认证 | 已实现 PublicWebSocketManager 类 |
| O6-002 | 实现股票订阅管理 | ✅ | P0 | 支持订阅/取消订阅特定股票代码 | 已实现 subscribe/unsubscribe 方法 |
| O6-008 | WebSocket限流保护 | ✅ | P1 | 单个连接订阅上限50只股票 | MAX_SUBSCRIPTIONS_PER_CONNECTION = 50 |

**实现说明**:
- 创建 `PublicWebSocketManager` 类，支持公开WebSocket连接（无需JWT认证）
- 实现股票订阅管理：subscribe、unsubscribe、批量订阅接口
- WebSocket限流保护：单个连接最多订阅50只股票，超限返回错误
- 支持实时行情推送，每10秒广播订阅股票列表的最新行情
- 26个单元测试全部通过

**相关文件**:
- `src/data_service/api/public_websocket.py` - 公开WebSocket实现
- `src/data_service/api/routes.py` - WebSocket端点注册
- `tests/unit/api/test_public_websocket.py` - 单元测试（26个测试用例）

**阻塞状态**: 无阻塞，任务已完成

---

## 六、外部依赖跟踪（更新）

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 |
|----------|---------|---------|---------|
| Backend | WebSocket服务端 | ⏸️ 阻塞 | - | T-007需要 |
| Backend | Redis Streams事件总线 | ✅ 已解决 | 2026-02-11 | Market Data已实现事件发布，等待Backend接入联调 |
| AI Service | 行情订阅需求确认 | ✅ 已解决 | 2026-02-11 | 架构变更：AI Service通过事件总线订阅行情 |
| News Service | 事件订阅机制 | ✅ 已解决 | 2026-02-11 | News Service可订阅market:alert:price_move事件 |
| Frontend | WebSocket客户端 | ⏸️ 阻塞 | - | T-007需要 |
| infra | 事件总线Python SDK | ✅ 已完成 | 2026-02-11 | C2-001已完成，见下方使用指南 |

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
from event_bus import EventBusClient, EventProducer, EventType
```

**3. 发布行情事件**
```python
# 创建发布器
client = EventBusClient(host="redis", port=6379)
producer = EventProducer(client=client, service_name="market-data")

# 发布实时行情
producer.publish_event(
    EventType.MARKET_QUOTE_REALTIME,
    {
        "symbol": "000001.SZ",
        "price": 12.58,
        "change": 0.5,
        "volume": 10000,
        "timestamp": "2026-02-11T10:00:00Z"
    }
)

# 发布价格异动告警
producer.publish_event(
    EventType.MARKET_ALERT_PRICE_MOVE,
    {
        "symbol": "000001.SZ",
        "alert_type": "price_surge",
        "severity": "high",
        "message": "涨幅超过7%"
    }
)
```

### 完整文档
- [SDK使用指南](../../infra/event-bus/USAGE_GUIDE.md)
- [SDK README](../../infra/event-bus/README.md)

### 测试验证
```bash
# 运行集成测试
cd /home/fe-jerome/projects/stock-race/infra/event-bus
python3 tests/integration_test.py
```

---

## 七、架构师建议的下一步工作

基于本次架构审查，建议按以下优先级继续推进：

### 7.1 立即执行（本周内）

| 编号 | 任务 | 优先级 | 说明 |
|------|------|--------|------|
| FIX-001 | 修复AI查询错误处理测试 | P2 | test_query_error_handling期望success=False，但实现返回success=True（优雅降级设计）。需统一测试期望或调整实现。 |
| FIX-002 | 更新事件总线测试状态 | P2 | test_event_publisher.py等3个测试文件因缺少SDK依赖而报错，需在文档中标注为"⏸️ 等待SDK部署"。 |

### 7.2 短期规划（1-2周）

| 编号 | 任务 | 优先级 | 说明 |
|------|------|--------|------|
| NEXT-001 | Backend事件总线联调 | P1 | Backend接入Redis Streams后，联调market:quote:realtime事件发布/订阅 |
| NEXT-002 | AI Service行情订阅验证 | P1 | 验证AI Service能通过事件总线正确订阅行情事件 |
| NEXT-003 | News Service异动联动测试 | P1 | 验证News Service能接收market:alert:price_move事件 |

### 7.3 中期规划（1-2月）

| 编号 | 任务 | 优先级 | 说明 |
|------|------|--------|------|
| MID-001 | 启用WebSocket实时推送 | P1 | 等待Frontend WebSocket客户端就绪后启用T-007 |
| MID-002 | 数据归档策略实现 | P2 | 冷数据自动归档到S3，降低TimescaleDB存储压力 |
| MID-003 | 采集任务调度器优化 | P2 | 使用Celery/APScheduler替代简单定时器 |

---

## 八、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| 2026-02-12 | 完成DOC-001~REF-001文档和配置优化：事件接口文档、异常测试、WebSocket/广度查询文档、硬编码配置提取 | 开发团队 |
| 2026-02-11 | 首席架构师代码审查完成：综合测试通过率98.3%，确认生产就绪，添加下一步工作建议 | 首席架构师 |
| 2026-02-11 | 完成AI决策服务批量查询API（AI-001~004）：多维度并集查询、5级信息密度、三级缓存，20个单元测试通过 | 开发团队 |
| 2026-02-11 | 完成C6-004~C6-008广度查询功能：板块/行业/指数行情查询，19个单元测试通过 | 开发团队 |
| 2026-02-11 | 完成O6-001~O6-008公开WebSocket：无需认证、订阅限流、26个单元测试通过 | 开发团队 |
| 2026-02-11 | 完成C1-MD-001~003健康检查SDK集成：降级运行、自动恢复，15个单元测试通过 | 开发团队 |
| 2026-02-11 | 完成C2-MD-001~C3-001C事件总线集成：实时行情/异动/指标事件发布 | 开发团队 |
| 2026-02-11 | 修复P3-001~P3-003技术债务：MockPool测试问题、导入路径统一、Pydantic v2迁移，440个单元测试通过 | 开发团队 |
| 2026-02-10 | 更新Phase 5优化进度，标记P0-001~P2-001为完成 | 开发团队 |
| 2026-02-09 | 完成T-010性能优化 | 开发团队 |
| 2026-02-08 | 完成数据降级策略和动态权重调整 | 开发团队 |

---

*文档版本: v2.2（联调冲刺版）*
*最后更新: 2026-02-12*
*维护者: 首席架构师*

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
