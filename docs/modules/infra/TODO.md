# 基础设施模块 - 开发任务追踪

> 本文档记录跨服务的综合性基础设施任务。
> 涉及多个服务的架构优化和冲突解决方案在此统一跟踪。
> 最后更新：2026-02-11

---

## 状态图例

- 🔲 待开发
- 🔄 开发中
- ⚠️ 待验证/部分完成
- ⏸️ 阻塞（依赖其他服务）
- ✅ 已完成（已移至 HAVE_DONE.md）

---

## 一、架构冲突解决方案实施

### 1.1 冲突1：服务间循环依赖解决

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 |
|------|------|------|--------|-----------|------|
| C1-001 | 部署共享Redis集群（阶段一：单节点） | 🔲 | P0 | 0.5天 | 阶段一：单节点1GB内存，无持久化，成本¥0 |
| C1-002 | 定义服务启动状态机 | 🔲 | P0 | 1天 | 定义：初始化→降级运行→正常运行的状态流转 |
| C1-003 | 实现健康检查SDK | 🔲 | P0 | 1天 | 统一封装依赖服务健康检查逻辑 |

**测试描述**:
- 测试场景1：Redis不可用，服务应以降级模式启动
- 测试场景2：依赖服务宕机，服务应标记为降级但保持运行
- 测试场景3：依赖服务恢复，服务应自动升级到正常模式
- 测试场景4：循环依赖场景下所有服务应能正常冷启动

**阻塞状态**: 本任务不阻塞其他任务，可被所有服务并行使用

---

### 1.2 冲突2：统一事件总线架构

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 |
|------|------|------|--------|-----------|------|
| C2-001 | 实现事件总线SDK（Python版） | ✅ | P0 | 2天 | 封装Redis Streams操作，支持发布/订阅/消费者组。已完成：EventSchema、EventProducer、EventConsumer、异常处理、单元测试（7 passed）、集成测试（2/2 passed） |
| C2-002 | 实现事件总线SDK（Node.js版） | ✅ | P0 | 2天 | Backend和Frontend使用的Node.js SDK。已完成：EventSchema、EventProducer、EventConsumer、单元测试+集成测试（22 passed），使用指南已创建 |
| C2-003 | 定义事件Schema和消息格式 | ✅ | P0 | 0.5天 | 统一事件字段：eventId, eventType, timestamp, source, payload。已完成：schema.js已定义 |
| C2-004 | 实现消息持久化和ACK机制 | ✅ | P1 | 0.5天 | 确保消息不丢失，支持手动ACK。已完成：Consumer自动ACK，Pending消息查询接口已实现 |
| C2-005 | 配置监控和告警 | 🔲 | P1 | 1天 | 消息堆积、消费延迟、错误率监控 |
| C2-006 | 实现事件总线管理后台 | 🔲 | P2 | 2天 | 查看事件流、消费者组状态、消息堆积情况 |

**事件定义**:
```yaml
# Market Data 发布
events:
  - name: market:quote:realtime
    description: 实时行情更新
    payload: { symbol, price, change, volume, timestamp }
  - name: market:alert:price_move
    description: 价格异动告警（涨跌幅>7%）
    payload: { symbol, alert_type, severity, message }
  - name: market:indicator:updated
    description: 技术指标更新
    payload: { symbol, indicators: { rsi, macd, kdj } }

# News Service 发布
events:
  - name: news:intelligence:extracted
    description: 新闻情报提取完成
    payload: { stock_code, intelligence, sentiment, timestamp }
  - name: news:sentiment:changed
    description: 情感分析变化
    payload: { stock_code, old_sentiment, new_sentiment, change_reason }

# Trading AI 发布
events:
  - name: ai:decision:made
    description: AI决策完成
    payload: { account_id, decision, confidence, reasoning, timestamp }
  - name: ai:performance:report
    description: 绩效报告
    payload: { account_id, period, metrics, timestamp }

# Backend 发布
events:
  - name: backend:account:updated
    description: 账户状态更新
    payload: { account_id, field, old_value, new_value }
  - name: backend:trade:executed
    description: 交易执行完成
    payload: { account_id, trade_id, symbol, action, quantity, price }
```

**测试描述**:
- 测试场景1：事件发布-订阅基本流程（单次事件）
- 测试场景2：消费者组负载均衡（多实例消费）
- 测试场景3：消息持久化（消费者宕机后恢复消费）
- 测试场景4：消息ACK机制（手动确认不丢失）
- 测试场景5：事件风暴防护（批量事件防抖）
- 测试场景6：跨服务事件流转（端到端测试）

**阻塞状态**: ✅ C2-001~C2-004已完成，各服务可开始接入事件总线

---

### 1.3 冲突3：AI Service双向依赖解耦

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 |
|------|------|------|--------|-----------|------|
| C3-001 | Market Data发布行情事件 | 🔲 | P0 | 1天 | 发布`market:quote:realtime`到事件总线 |
| C3-002 | News Service发布新闻事件 | 🔲 | P0 | 1天 | 发布`news:intelligence:extracted`到事件总线 |
| C3-003 | Trading AI订阅行情和新闻事件 | 🔲 | P0 | 2天 | 从事件总线订阅行情和新闻，不再HTTP轮询 |
| C3-004 | Trading AI发布决策事件 | 🔲 | P0 | 1天 | 发布`ai:decision:made`到事件总线 |
| C3-005 | Backend订阅决策事件 | 🔲 | P0 | 1天 | 从事件总线订阅AI决策，不再HTTP回调 |
| C3-006 | 移除Trading AI到Market Data的HTTP调用 | 🔲 | P1 | 0.5天 | 删除行情查询HTTP客户端 |
| C3-007 | 移除Trading AI到News Service的HTTP调用 | 🔲 | P1 | 0.5天 | 删除新闻查询HTTP客户端 |
| C3-008 | 移除Trading AI到Backend的HTTP回调 | 🔲 | P1 | 0.5天 | 删除决策通知HTTP客户端 |
| C3-009 | Token防抖机制实现 | 🔲 | P0 | 1天 | 防止事件风暴导致Token成本爆炸（¥5184/天） |

**测试描述**:
- 测试场景1：Trading AI仅通过事件总线获取行情数据
- 测试场景2：Trading AI仅通过事件总线获取新闻情报
- 测试场景3：Backend仅通过事件总线接收AI决策
- 测试场景4：Token防抖机制（高频事件合并为单次决策）
- 测试场景5：事件延迟容忍度（<500ms）
- 测试场景6：Trading AI冷启动（无外部依赖可启动）

**阻塞状态**:
- C3-001, C3-002 阻塞 C3-003
- C3-003 阻塞 C3-004
- C3-004 阻塞 C3-005
- C2-001（事件总线SDK）阻塞 C3-001~C3-005

---

### 1.4 冲突4：AI对话服务职责划分（Backend实现）

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 |
|------|------|------|--------|-----------|------|
| C4-001 | Backend实现AI对话会话接口 | 🔲 | P0 | 2天 | `POST /api/ai-accounts/{id}/dialogue/session` |
| C4-002 | Backend实现AI对话消息接口 | 🔲 | P0 | 2天 | `POST /api/ai-accounts/{id}/dialogue/message` (SSE流式) |
| C4-003 | Backend实现画像提取接口 | 🔲 | P0 | 1天 | `POST /api/ai-accounts/{id}/finalize` |
| C4-004 | Backend对接DeepSeek API | 🔲 | P0 | 1天 | 封装DeepSeek调用，流式响应 |
| C4-005 | Backend维护对话上下文 | 🔲 | P0 | 1天 | Redis存储对话历史（10轮限制） |
| C4-006 | 对话Token成本控制 | 🔲 | P1 | 1天 | 单条<2000 tokens，总额度限制 |
| C4-007 | 更新API文档 | 🔲 | P1 | 0.5天 | 更新接口文档，移除Trading AI对话接口 |

**测试描述**:
- 测试场景1：创建对话会话（返回session_id）
- 测试场景2：SSE流式消息响应（分块接收AI回复）
- 测试场景3：对话上下文保持（多轮对话记忆）
- 测试场景4：10轮对话限制（第11轮触发画像提取）
- 测试场景5：画像提取和账户激活（finalize接口）
- 测试场景6：Token限额控制（超出限额报错）
- 测试场景7：对话记录持久化（Redis+PostgreSQL双写）

**阻塞状态**: 本任务不依赖其他服务，可独立开发

---

### 1.5 冲突5：Miniprogram游客模式

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 |
|------|------|------|--------|-----------|------|
| C5-001 | Backend实现游客Token生成 | 🔲 | P0 | 1天 | `POST /api/guest/auth/token`，基于openid_hash |
| C5-002 | Backend实现游客AI账户创建 | 🔲 | P0 | 1天 | `POST /api/guest/ai-accounts`，限制2个 |
| C5-003 | Backend实现游客AI对话 | 🔲 | P0 | 1天 | `POST /api/guest/ai-accounts/:id/chat`，限制10轮 |
| C5-004 | Backend实现游客数据迁移 | 🔲 | P0 | 1天 | 登录后游客数据绑定到正式用户 |
| C5-005 | Backend实现智能过期策略 | 🔲 | P0 | 1天 | 无AI账户24h，有AI账户72h |
| C5-006 | 数据库创建游客会话表 | 🔲 | P0 | 0.5天 | guest_sessions表设计 |
| C5-007 | Miniprogram游客模式适配 | 🔲 | P0 | 2天 | 无JWT时自动获取游客Token |
| C5-008 | Miniprogram登录数据迁移 | 🔲 | P0 | 1天 | 登录后本地数据同步到正式账户 |
| C5-009 | 创建定时清理任务 | 🔲 | P1 | 0.5天 | 清理过期游客数据（保留已绑定） |

**测试描述**:
- 测试场景1：游客Token获取（无需微信授权）
- 测试场景2：游客创建AI账户（限制2个）
- 测试场景3：游客AI对话（限制10轮）
- 测试场景4：24小时过期（无AI账户）
- 测试场景5：72小时过期（有AI账户）
- 测试场景6：登录后数据绑定（事务保护）
- 测试场景7：已绑定数据不被清理（status='bound'）
- 测试场景8：游客Token自动续期（活跃延长）

**阻塞状态**: C5-001~C5-006 阻塞 C5-007, C5-008

---

### 1.6 冲突6：AI决策服务广度查询

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 |
|------|------|------|--------|-----------|------|
| C6-001 | News Service实现板块查询 | 🔲 | P1 | 1天 | `GET /api/v1/intelligence/sector/{sector_name}` |
| C6-002 | News Service实现行业查询 | 🔲 | P1 | 1天 | `GET /api/v1/intelligence/industry/{industry_name}` |
| C6-003 | News Service实现概念查询 | 🔲 | P1 | 1天 | `GET /api/v1/intelligence/concept/{concept_name}` |
| C6-004 | Market Data实现板块行情 | 🔲 | P1 | 1天 | `GET /api/v1/market/sector/{sector_name}/quotes` |
| C6-005 | Market Data实现行业行情 | 🔲 | P1 | 1天 | `GET /api/v1/market/industry/{industry_name}/quotes` |
| C6-006 | Market Data实现指数成分股 | 🔲 | P1 | 1天 | `GET /api/v1/market/index/{index_code}/components` |
| C6-007 | 创建板块/行业/概念映射表 | 🔲 | P1 | 1天 | 股票分类映射数据 |
| C6-008 | 分页和缓存优化 | 🔲 | P2 | 1天 | 大数据量分页，Redis缓存 |

**测试描述**:
- 测试场景1：板块查询返回该板块所有股票情报
- 测试场景2：行业查询返回该行业所有股票情报
- 测试场景3：概念查询返回该概念所有股票情报
- 测试场景4：板块行情返回该板块所有股票行情
- 测试场景5：指数成分股查询（如沪深300）
- 测试场景6：大数据量分页（>1000只股票）
- 测试场景7：缓存命中率（Redis缓存生效）
- 测试场景8：查询性能（<500ms返回）

**阻塞状态**: C6-007 阻塞 C6-001~C6-006

---

## 二、架构优化方案实施

### 2.1 优化4：Redis渐进式部署策略

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 |
|------|------|------|--------|-----------|------|
| O4-001 | 编写阶段一单节点Docker Compose | ✅ | P0 | 0.5天 | 单节点1GB，无持久化，开发环境。已完成：docker-compose.redis.yml、README.md，Redis已运行 |
| O4-002 | 编写阶段二主从+Sentinel配置 | 🔲 | P1 | 1天 | Master-Slave+Sentinel，生产可用 |
| O4-003 | 编写阶段三Cluster集群配置 | 🔲 | P2 | 1天 | 3主3从Cluster，大规模生产 |
| O4-004 | 编写平滑迁移脚本 | 🔲 | P2 | 1天 | 阶段一→阶段二→阶段三迁移指南 |
| O4-005 | 配置Redis监控告警 | 🔲 | P1 | 0.5天 | 内存使用率、连接数、命中率 |

**测试描述**:
- 测试场景1：单节点部署（docker-compose up -d）
- 测试场景2：主从同步（Master写入，Slave读取）
- 测试场景3：Sentinel故障转移（Master宕机自动切换）
- 测试场景4：Cluster分片（数据均匀分布到3个Master）
- 测试场景5：平滑迁移（数据不丢失）

**阻塞状态**: O4-001 阻塞 C1-001（共享Redis部署）

---

### 2.2 优化6：Miniprogram数据流优化

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 |
|------|------|------|--------|-----------|------|
| O6-001 | Market Data开放公开WebSocket | 🔲 | P0 | 1天 | `wss://market-data/ws/public/quotes`，无需认证 |
| O6-002 | Market Data实现股票订阅 | 🔲 | P0 | 1天 | 支持订阅/取消订阅特定股票 |
| O6-003 | Backend优化收益接口 | 🔲 | P0 | 1天 | `GET /api/ai-accounts/{id}/performance`，缓存行情 |
| O6-004 | Backend缓存Market Data数据 | 🔲 | P0 | 0.5天 | 5秒TTL缓存行情数据 |
| O6-005 | Miniprogram实现WebSocket连接 | 🔲 | P0 | 1天 | 连接Market Data WebSocket |
| O6-006 | Miniprogram实现数据合并 | 🔲 | P0 | 1天 | Pinia Store合并实时行情+Backend收益数据 |
| O6-007 | Miniprogram实现自动重连 | 🔲 | P1 | 0.5天 | WebSocket断开自动重连，降级HTTP |

**测试描述**:
- 测试场景1：公开WebSocket连接（无需JWT）
- 测试场景2：股票订阅/取消订阅（动态更新）
- 测试场景3：10秒行情推送（频率验证）
- 测试场景4：Backend收益接口（含持仓成本）
- 测试场景5：数据合并逻辑（实时价+成本=收益）
- 测试场景6：WebSocket断开降级（自动切换HTTP轮询）
- 测试场景7：Backend QPS降低90%（500/s→50/s）

**阻塞状态**:
- O6-001, O6-002 阻塞 O6-005
- O6-003 阻塞 O6-006

---

## 三、其他优化实施

### 3.1 Backend三层API架构

| 编号 | 任务 | 状态 | 优先级 | 预计工作量 | 说明 |
|------|------|------|--------|-----------|------|
| O3-001 | 公开API层实现 | 🔲 | P0 | 1天 | 行情、排行榜、搜索（无需认证） |
| O3-002 | 游客API层实现 | 🔲 | P0 | 1天 | 游客Token、临时AI账户（限流） |
| O3-003 | 认证API层保护 | 🔲 | P0 | 0.5天 | 现有API JWT认证加固 |
| O3-004 | API路由分层 | 🔲 | P0 | 0.5天 | `/api/public/*`, `/api/guest/*`, `/api/*` |

**测试描述**:
- 测试场景1：公开API无需认证访问
- 测试场景2：游客API限流（Token过期、数量限制）
- 测试场景3：认证API JWT验证失败返回401
- 测试场景4：API分层路由正确转发

---

## 四、任务依赖关系图

```
阶段0：基础设施（Week 0）
├── O4-001 单节点Redis部署 ──┬──► C1-001 共享Redis
│                           ├──► C2-001 Python SDK ──┬──► C3-001 Market Data发布事件
│                           │                       ├──► C3-002 News Service发布事件
│                           │                       ├──► C3-003 Trading AI订阅事件
│                           │                       ├──► C3-004 Trading AI发布事件
│                           │                       ├──► C3-005 Backend订阅事件
│                           │                       └──► 所有服务接入事件总线
│                           └──► C2-002 Node.js SDK ──► Backend/Miniprogram接入
├── C2-003 事件Schema定义 ──► 所有事件发布/订阅任务
└── C1-002 状态机定义 ──► C1-003 健康检查SDK ──► 所有服务冷启动改造

阶段1：服务解耦（Week 1-2）
├── C3-001~C3-008 AI Service解耦
│   ├── 移除HTTP调用
│   └── 接入事件总线
├── C4-001~C4-007 AI对话迁移到Backend
└── C5-001~C5-006 游客模式Backend实现

阶段2：Miniprogram优化（Week 2-3）
├── O6-001~O6-004 Market Data/Backend改造
├── C5-007~C5-008 Miniprogram游客模式适配
└── O6-005~O6-007 Miniprogram数据流优化

阶段3：广度查询（Week 3-4）
├── C6-007 映射表创建
├── C6-001~C6-003 News Service广度查询
└── C6-004~C6-006 Market Data广度查询
```

---

## 五、SDK就绪状态与使用指南

### 5.1 SDK完成状态

| SDK | 语言 | 测试状态 | 使用指南 |
|-----|------|----------|----------|
| Python SDK | Python 3.10+ | ✅ 9个测试通过 | `infra/event-bus/USAGE_GUIDE.md` |
| Node.js SDK | Node.js 18+ | ✅ 22个测试通过 | `infra/event-bus/src/node/USAGE_GUIDE.md` |

### 5.2 各服务接入状态

| 服务 | 语言 | SDK就绪 | 可开始任务 |
|------|------|---------|-----------|
| market-data-service | Python | ✅ | C3-001, C3-002 |
| news-service | Python | ✅ | C3-002 |
| trading-ai-service | Python | ✅ | C3-003, C3-004 |
| backend | Node.js | ✅ | C2-BE-001~006, C3-005 |

### 5.3 快速开始

**Python服务:**
```python
import sys
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/infra/event-bus/src')
from event_bus import EventBusClient, EventProducer, EventType

client = EventBusClient(host="localhost", port=6379)
producer = EventProducer(client=client, service_name="my-service")
producer.publish_event(EventType.MARKET_QUOTE_REALTIME, {...})
```

**Backend服务:**
```javascript
const { EventBusClient, EventProducer, EventType } = require('@stock-race/event-bus');

const client = new EventBusClient({ host: process.env.REDIS_HOST, port: 6379 });
const producer = new EventProducer({ client, serviceName: 'backend' });
await producer.publishEvent(EventType.BACKEND_TRADE_EXECUTED, {...});
```

---

## 六、风险缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 事件总线性能瓶颈 | 高 | 阶段一Redis单节点仅支持10万QPS，监控使用率，达到70%触发升级阶段二 |
| Token成本爆炸 | 高 | C3-009防抖机制必须优先实现，限制AI决策频率（最小5分钟间隔） |
| 数据不一致 | 中 | 行情数据10秒延迟可接受，收益数据以Backend为准 |
| 游客数据丢失 | 中 | C5-004数据迁移必须使用事务，失败可回滚 |
| WebSocket不稳定 | 中 | O6-007自动重连+HTTP降级，确保用户体验 |

---

## 七、外部依赖跟踪

| 依赖 | 所需功能 | 状态 | 跟进 |
|------|----------|------|------|
| 云服务 | Redis托管服务 | 🔲 | 阶段一使用Docker，阶段二评估云厂商 |
| 微信 | 小程序审核通过 | 🔲 | 等待Miniprogram功能完善后提交 |
| DeepSeek | API稳定性 | ⚠️ | 已有备用方案（多模型适配器） |

---

## 八、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|----------|--------|
| 2026-02-11 | 创建基础设施TODO.md，整合6个冲突解决方案和2个优化方案 | 首席架构师 |
| 2026-02-11 | Node.js SDK开发完成（C2-002），22个测试通过 | Claude |
| 2026-02-11 | Python SDK测试通过（C2-001），9个测试通过 | Claude |

---

*文档版本: v1.0*
*最后更新: 2026-02-11*
*维护者: 首席架构师*
