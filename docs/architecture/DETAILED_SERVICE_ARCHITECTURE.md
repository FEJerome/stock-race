# 六服务架构详细设计方案

## 文档信息

- **文档版本**: v1.0
- **创建日期**: 2026-02-10
- **状态**: 已审阅，待实施
- **作者**: 首席架构师 + 产品经理
- **目标**: 高内聚、低耦合、扩展性强、性能损耗低的服务架构

---

## 目录

1. [架构设计原则](#1-架构设计原则)
2. [数据访问路径设计](#2-数据访问路径设计)
3. [实时采集分层策略](#3-实时采集分层策略)
4. [AI账户创建与提示词生成](#4-ai账户创建与提示词生成)
5. [AI账户操作模式](#5-ai账户操作模式)
6. [服务间调用关系总图](#6-服务间调用关系总图)
7. [实施建议](#7-实施建议)

---

## 1. 架构设计原则

### 1.1 核心目标

| 目标 | 策略 | 预期效果 |
|------|------|----------|
| **高内聚** | 单一职责，功能聚焦 | 每个服务职责清晰，易于维护 |
| **低耦合** | 异步通信，标准接口 | 服务可独立演进，互不影响 |
| **扩展性** | 无状态设计，水平扩展 | 支持业务增长，动态扩容 |
| **性能** | 数据分层，多级缓存 | 降低延迟，减少资源消耗 |

### 1.2 服务分层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              客户端层 (Client Layer)                        │
│  ┌─────────────┐  ┌─────────────┐                                           │
│  │  Frontend   │  │ Miniprogram │                                           │
│  │   (React)   │  │  (UniApp)   │                                           │
│  └──────┬──────┘  └──────┬──────┘                                           │
└─────────┼────────────────┼──────────────────────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API 网关层 (API Gateway)                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Backend (Node.js + Express)                                            ││
│  │  • 统一认证鉴权 (JWT)          • 请求路由分发                              ││
│  │  • 限流熔断保护                • 业务逻辑编排                              ││
│  │  • 数据聚合 (BFF)              • 日志记录追踪                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           领域服务层 (Domain Services)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ AI Service  │  │Data Service │  │News Service │  │ 其他业务服务...      │ │
│  │   :8000     │  │   :8001     │  │   :8002     │  │                     │ │
│  │             │  │             │  │             │  │                     │ │
│  │ • 模型推理   │  │ • 数据采集   │  │ • 新闻采集   │  │                     │ │
│  │ • 决策生成   │  │ • 行情服务   │  │ • 情感分析   │  │                     │ │
│  │ • 提示词工程 │  │ • 数据清洗   │  │ • 情报订阅   │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
          │              │              │
          ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           基础设施层 (Infrastructure)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ PostgreSQL  │  │ TimescaleDB │  │    Redis    │  │   Message Queue     │ │
│  │  (业务数据)  │  │  (时序数据)  │  │  (缓存/会话) │  │   (事件流)          │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据访问路径设计

### 2.1 问题背景

**核心问题**：数据服务模块处理的历史数据和实时数据，是否需要经由后端服务访问，还是直接访问DAO层？

### 2.2 设计方案：双路径数据访问

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           数据访问路径设计                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   路径A：业务数据访问 (Backend 中转)                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                     │   │
│   │  Frontend ──► Backend ──► Service Layer ──► Database               │   │
│   │              (认证/校验)   (业务逻辑)      (PostgreSQL)            │   │
│   │                                                                     │   │
│   │ 适用场景:                                                           │   │
│   │ • 交易记录 (需要事务一致性)                                          │   │
│   │ • 用户数据 (需要权限校验)                                            │   │
│   │ • AI账户配置 (需要业务逻辑)                                          │   │
│   │ • 资金操作 (需要安全审计)                                            │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   路径B：实时数据访问 (直连 Data Service)                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                     │   │
│   │  Frontend ◄─────────────► Data Service ◄────────► Redis            │   │
│   │       (WebSocket)          (行情服务)            (缓存)            │   │
│   │                                                                     │   │
│   │  Backend ◄──────────────── Data Service ◄───────► TimescaleDB      │   │
│   │   (历史数据查询)            (数据访问层)          (时序数据)        │   │
│   │                                                                     │   │
│   │ 适用场景:                                                           │   │
│   │ • 实时行情 (低延迟要求 < 5秒)                                        │   │
│   │ • K线数据 (高频读取)                                                 │   │
│   │ • 市场概况 (大流量读取)                                              │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 数据访问决策矩阵

| 数据类型 | 访问路径 | 原因 | 延迟要求 |
|---------|----------|------|----------|
| **实时行情** | Frontend ↔ Data Service (WebSocket) | 低延迟，高并发 | < 5秒 |
| **历史K线** | Frontend → Backend → Data Service | 需要权限聚合 | < 500ms |
| **交易记录** | Frontend → Backend → PostgreSQL | 强一致性，事务 | < 300ms |
| **用户配置** | Frontend → Backend → PostgreSQL | 敏感数据，需认证 | < 200ms |
| **AI决策数据** | AI Service → Backend → PostgreSQL | 业务逻辑复杂 | < 500ms |
| **持仓数据** | Frontend → Backend → PostgreSQL | 实时性+一致性 | < 200ms |

### 2.4 Data Service 内部架构

Data Service 本身包含 DAO 层，无需额外的 DAO Service：

```
┌─────────────────────────────────────────────────────────┐
│                    Data Service (:8001)                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │  API Layer  │───►│ Service Layer│───►│  DAO Layer  │ │
│  │             │    │             │    │             │ │
│  │ • REST API  │    │ • 采集调度   │    │ • 数据访问   │ │
│  │ • WebSocket │    │ • 数据清洗   │    │ • 缓存管理   │ │
│  │ • 协议转换   │    │ • 分层策略   │    │ • 连接池     │ │
│  └─────────────┘    └─────────────┘    └──────┬──────┘ │
│                                                │        │
│  ┌─────────────────────────────────────────────┘        │
│  │                                                      │
│  ▼                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ PostgreSQL  │  │ TimescaleDB │  │    Redis    │     │
│  │  (元数据)    │  │  (时序数据)  │  │  (缓存层)    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 实时采集分层策略

### 3.1 问题背景

**核心问题**：如何决定哪些股票需要低延迟采集？数据服务如何获取这些决策数据？

**业务规则**：
- 高频采集：用户AI账户持仓股票 + 关注列表股票
- 低频采集：全市场其他股票
- 活跃账户定义：30日内登录过的用户拥有的AI账户

### 3.2 架构设计：推拉结合模式

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        实时采集分层策略架构                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   热股票列表生成 (Backend)                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                     │   │
│   │  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │   │
│   │  │  查询活跃账户  │───►│ 提取持仓股票  │───►│ 生成热股票列表 │          │   │
│   │  │(30日内登录)  │     │ + 关注列表   │     │             │          │   │
│   │  └─────────────┘     └─────────────┘     └──────┬──────┘          │   │
│   │                                                  │                 │   │
│   │  定时任务: 每1分钟执行一次                         │                 │   │
│   │                                                  ▼                 │   │
│   │                                         ┌─────────────┐            │   │
│   │                                         │ Redis Pub/Sub│           │   │
│   │                                         │  推送更新    │            │   │
│   │                                         └─────────────┘            │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   数据采集执行 (Data Service)                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                     │   │
│   │  ┌─────────────┐                                                   │   │
│   │  │ Redis订阅    │◄─── 接收热股票列表更新                              │   │
│   │  └──────┬──────┘                                                   │   │
│   │         │                                                          │   │
│   │         ▼                                                          │   │
│   │  ┌─────────────────────────────────────────────┐                  │   │
│   │  │           分层采集器                         │                  │   │
│   │  │                                             │                  │   │
│   │  │  ┌─────────────────┐  ┌─────────────────┐  │                  │   │
│   │  │  │    高频层       │  │    低频层       │  │                  │   │
│   │  │  │  (热股票)       │  │  (全市场)       │  │                  │   │
│   │  │  │                 │  │                 │  │                  │   │
│   │  │  │ • 10秒间隔      │  │ • 60秒间隔      │  │                  │   │
│   │  │  │ • 约300只股票   │  │ • 约5000只股票  │  │                  │   │
│   │  │  │ • 低延迟优先    │  │ • 完整性优先    │  │                  │   │
│   │  │  │                 │  │                 │  │                  │   │
│   │  │  └────────┬────────┘  └────────┬────────┘  │                  │   │
│   │  │           │                    │           │                  │   │
│   │  │           └──────────┬─────────┘           │                  │   │
│   │  │                      ▼                     │                  │   │
│   │  │           ┌─────────────────┐              │                  │   │
│   │  │           │  数据聚合 & 存储  │              │                  │   │
│   │  │           └─────────────────┘              │                  │   │
│   │  │                                             │                  │   │
│   │  └─────────────────────────────────────────────┘                  │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 关键实现

#### 3.3.1 热股票列表生成器 (Backend)

```javascript
// backend/src/services/StockHeatScheduler.js
class StockHeatScheduler {
  constructor() {
    this.UPDATE_INTERVAL = 60000; // 1分钟
    this.REDIS_CHANNEL = 'data-service:hot-stocks';
  }

  async generateHotStockList() {
    // 1. 查询活跃AI账户（30日内登录用户）
    const activeAccounts = await prisma.aIAccount.findMany({
      where: {
        user: {
          lastLoginAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        status: 'active'
      },
      include: {
        positions: true,  // 持仓数据
        watchlist: true   // 关注列表
      }
    });

    // 2. 提取需要监控的股票
    const hotStocks = new Set();
    const accountMetadata = [];

    activeAccounts.forEach(account => {
      const stocks = new Set();

      // 持仓股票
      account.positions.forEach(pos => {
        stocks.add(pos.stockCode);
        hotStocks.add(pos.stockCode);
      });

      // 关注列表
      account.watchlist.forEach(item => {
        stocks.add(item.stockCode);
        hotStocks.add(item.stockCode);
      });

      accountMetadata.push({
        accountId: account.id,
        stockCount: stocks.size
      });
    });

    // 3. 推送到 Data Service
    const message = {
      stocks: Array.from(hotStocks),
      count: hotStocks.size,
      accounts: activeAccounts.length,
      metadata: accountMetadata,
      timestamp: Date.now(),
      source: 'backend-scheduler',
      version: '1.0'
    };

    await redis.publish(this.REDIS_CHANNEL, JSON.stringify(message));

    logger.info(`热股票列表更新: ${hotStocks.size} 只股票, ${activeAccounts.length} 个活跃账户`);

    return message;
  }

  start() {
    // 立即执行一次
    this.generateHotStockList();

    // 定时执行
    setInterval(() => {
      this.generateHotStockList();
    }, this.UPDATE_INTERVAL);
  }
}
```

#### 3.3.2 分层采集器 (Data Service)

```python
# data-service/src/data_service/services/layered_collector.py
import asyncio
from typing import Set, Dict
from dataclasses import dataclass

@dataclass
class CollectionTask:
    stock_code: str
    priority: int  # 1=高频, 2=低频
    last_collected: float

class LayeredCollector:
    def __init__(self):
        self.hot_stocks: Set[str] = set()
        self.all_stocks: Set[str] = set()  # 全市场股票

        # 采集配置
        self.HIGH_FREQ_INTERVAL = 10   # 高频：10秒
        self.LOW_FREQ_INTERVAL = 60    # 低频：60秒
        self.MAX_HOT_STOCKS = 300      # 最大热股票数

        # 统计信息
        self.stats = {
            'high_freq_collections': 0,
            'low_freq_collections': 0,
            'last_update': None
        }

    async def start(self):
        """启动采集器"""
        # 订阅热股票更新
        await self.redis.subscribe(
            'data-service:hot-stocks',
            self.on_hot_stocks_update
        )

        # 加载全市场股票列表
        await self.load_all_stocks()

        # 启动采集循环
        await asyncio.gather(
            self.high_freq_loop(),
            self.low_freq_loop()
        )

    async def on_hot_stocks_update(self, message: str):
        """处理热股票列表更新"""
        try:
            data = json.loads(message)
            new_hot_stocks = set(data['stocks'])

            # 如果热股票过多，按活跃度排序截取
            if len(new_hot_stocks) > self.MAX_HOT_STOCKS:
                logger.warning(f"热股票过多 ({len(new_hot_stocks)}), 截取前 {self.MAX_HOT_STOCKS}")
                # 根据 metadata 中的 stockCount 排序
                stock_priority = {}
                for meta in data.get('metadata', []):
                    for stock in meta.get('stocks', []):
                        stock_priority[stock] = stock_priority.get(stock, 0) + 1

                sorted_stocks = sorted(
                    new_hot_stocks,
                    key=lambda s: stock_priority.get(s, 0),
                    reverse=True
                )
                new_hot_stocks = set(sorted_stocks[:self.MAX_HOT_STOCKS])

            self.hot_stocks = new_hot_stocks
            self.stats['last_update'] = data['timestamp']

            logger.info(f"热股票列表更新: {len(self.hot_stocks)} 只")

        except Exception as e:
            logger.error(f"处理热股票更新失败: {e}")

    async def high_freq_loop(self):
        """高频采集循环"""
        while True:
            if self.hot_stocks:
                try:
                    await self.collect_stocks(
                        self.hot_stocks,
                        priority='high'
                    )
                    self.stats['high_freq_collections'] += 1
                except Exception as e:
                    logger.error(f"高频采集失败: {e}")

            await asyncio.sleep(self.HIGH_FREQ_INTERVAL)

    async def low_freq_loop(self):
        """低频采集循环"""
        while True:
            # 低频采集 = 全市场 - 热股票
            cold_stocks = self.all_stocks - self.hot_stocks

            if cold_stocks:
                try:
                    # 分批采集，避免一次性请求过多
                    batch_size = 100
                    cold_list = list(cold_stocks)

                    for i in range(0, len(cold_list), batch_size):
                        batch = cold_list[i:i + batch_size]
                        await self.collect_stocks(batch, priority='low')
                        await asyncio.sleep(1)  # 批次间间隔

                    self.stats['low_freq_collections'] += 1

                except Exception as e:
                    logger.error(f"低频采集失败: {e}")

            await asyncio.sleep(self.LOW_FREQ_INTERVAL)

    async def collect_stocks(self, stocks: Set[str], priority: str):
        """执行采集"""
        # 多数据源采集，带故障转移
        for source in self.get_data_sources():
            try:
                data = await source.collect(stocks)
                if data:
                    await self.process_and_store(data, priority)
                    return
            except Exception as e:
                logger.warning(f"数据源 {source.name} 失败: {e}")
                continue

        logger.error(f"所有数据源都失败，股票: {stocks}")
```

---

## 4. AI账户创建与提示词生成

### 4.1 功能需求

1. 用户选择交易大模型，分配虚拟货币
2. 用户与 DeepSeek 对话（新人基金经理角色扮演）
3. 系统限制对话（防token超支）
4. DeepSeek 提炼对话 → 生成提示词
5. 系统提示词 + 用户提示词 → 交易大模型

### 4.2 Pipeline 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              AI账户创建和提示词生成 Pipeline                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ╔═══════════════════════════════════════════════════════════════════════╗  │
│   ║ 阶段1: 配置收集                                                        ║  │
│   ╠═══════════════════════════════════════════════════════════════════════╣  │
│   ║                                                                       ║  │
│   ║   ┌─────────────┐                                                     ║  │
│   ║   │  Frontend   │──► 选择模型、分配资金、风险偏好                      ║  │
│   ║   └──────┬──────┘                                                     ║  │
│   ║          │ POST /api/ai-accounts                                       ║  │
│   ║          ▼                                                            ║  │
│   ║   ┌─────────────┐                                                     ║  │
│   ║   │   Backend   │──► 创建AI账户记录（状态: draft）                     ║  │
│   ║   │             │──► 生成会话ID，初始化对话上下文                       ║  │
│   ║   └─────────────┘                                                     ║  │
│   ║                                                                       ║  │
│   ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                      │                                       │
│                                      ▼                                       │
│   ╔═══════════════════════════════════════════════════════════════════════╗  │
│   ║ 阶段2: 对话采集（DeepSeek）                                            ║  │
│   ╠═══════════════════════════════════════════════════════════════════════╣  │
│   ║                                                                       ║  │
│   ║   ┌─────────────┐        WebSocket        ┌─────────────┐            ║  │
│   ║   │  Frontend   │◄───────────────────────►│   Backend   │            ║  │
│   ║   │  (对话界面)  │   /ws/ai-account/{id}   │  (对话网关)  │            ║  │
│   ║   └─────────────┘                         └──────┬──────┘            ║  │
│   ║                                                  │                    ║  │
│   ║                         ┌────────────────────────┘                    ║  │
│   ║                         │                                             ║  │
│   ║                         ▼                                             ║  │
│   ║   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             ║  │
│   ║   │   Redis     │◄───│ DeepSeek    │    │  对话限制器  │             ║  │
│   ║   │  (会话缓存)  │    │ (对话模型)   │    │             │             ║  │
│   ║   │             │    │             │    │ • 最大10轮   │             ║  │
│   ║   │ dialogue:   │    │ 角色:导师    │    │ • 每轮500token│            ║  │
│   ║   │   {id}      │    │             │    │ • 超时1小时  │             ║  │
│   ║   │  (TTL:1h)   │    │             │    │             │             ║  │
│   ║   └─────────────┘    └─────────────┘    └─────────────┘             ║  │
│   ║                                                                       ║  │
│   ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                      │                                       │
│                                      ▼                                       │
│   ╔═══════════════════════════════════════════════════════════════════════╗  │
│   ║ 阶段3: 提示词提炼（DeepSeek）                                          ║  │
│   ╠═══════════════════════════════════════════════════════════════════════╣  │
│   ║                                                                       ║  │
│   ║   触发: 用户点击"生成基金经理"                                          ║  │
│   ║                                                                       ║  │
│   ║   ┌─────────────┐                                                     ║  │
│   ║   │   Backend   │──► POST /api/ai-accounts/{id}/finalize              ║  │
│   ║   └──────┬──────┘                                                     ║  │
│   ║          │                                                            ║  │
│   ║          ▼                                                            ║  │
│   ║   ┌─────────────────────────────────────────────────────────────┐    ║  │
│   ║   │                    AI Service                                │    ║  │
│   ║   │                                                               │    ║  │
│   ║   │  1. 获取对话历史 (from Redis)                                  │    ║  │
│   ║   │  2. 构建提炼Prompt:                                            │    ║  │
│   ║   │                                                               │    ║  │
│   ║   │     "基于以下对话，提炼基金经理特征：                          │    ║  │
│   ║   │      - 投资理念                                                │    ║  │
│   ║   │      - 风险偏好                                                │    ║  │
│   ║   │      - 关注领域                                                │    ║  │
│   ║   │      - 决策风格                                                │    ║  │
│   ║   │      控制在200字以内"                                          │    ║  │
│   ║   │                                                               │    ║  │
│   ║   │  3. 调用 DeepSeek 提炼                                         │    ║  │
│   ║   │          │                                                    │    ║  │
│   ║   │          ▼                                                    │    ║  │
│   ║   │  ┌─────────────┐    用户画像 (JSON)                           │    ║  │
│   ║   │  │  DeepSeek   │─────────────┬────────────────►               │    ║  │
│   ║   │  │  (提炼模型)  │             │                                │    ║  │
│   ║   │  └─────────────┘             │                                │    ║  │
│   ║   │                                │                                │    ║  │
│   ║   │  4. 组合最终提示词              │                                │    ║  │
│   ║   │                                ▼                                │    ║  │
│   ║   │  ┌─────────────────────────────────────────────────────────┐   │    ║  │
│   ║   │  │ {                                                       │   │    ║  │
│   ║   │  │   "role": "专业基金经理",                                │   │    ║  │
│   ║   │  │   "identity": "你是一位{提炼后的性格}的基金经理",          │   │    ║  │
│   ║   │  │   "philosophy": "{投资理念}",                             │   │    ║  │
│   ║   │  │   "constraints": [                                       │   │    ║  │
│   ║   │  │     "只能基于系统数据决策",                               │   │    ║  │
│   ║   │  │     "回复必须是JSON格式",                                 │   │    ║  │
│   ║   │  │     "不要解释操作"                                        │   │    ║  │
│   ║   │  │   ],                                                     │   │    ║  │
│   ║   │  │   "system_context": "{A股规则+风险提示}"                    │   │    ║  │
│   ║   │  │ }                                                       │   │    ║  │
│   ║   │  └─────────────────────────────────────────────────────────┘   │    ║  │
│   ║   │                                                               │    ║  │
│   ║   └───────────────────────────────────────────────────────────────┘    ║  │
│   ║                                                                       ║  │
│   ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                      │                                       │
│                                      ▼                                       │
│   ╔═══════════════════════════════════════════════════════════════════════╗  │
│   ║ 阶段4: 激活测试                                                        ║  │
│   ╠═══════════════════════════════════════════════════════════════════════╣  │
│   ║                                                                       ║  │
│   ║   ┌─────────────┐                                                     ║  │
│   ║   │ AI Service  │──► 调用交易大模型（测试prompt有效性）                 ║  │
│   ║   │             │    • 验证返回格式是否正确                             ║  │
│   ║   │             │    • 检查置信度是否合理                               ║  │
│   ║   └──────┬──────┘                                                     ║  │
│   ║          │                                                            ║  │
│   ║          ▼                                                            ║  │
│   ║   ┌─────────────┐                                                     ║  │
│   ║   │  Database   │──► 更新AI账户状态: active                            ║  │
│   ║   │             │──► 保存最终提示词                                     ║  │
│   ║   │             │──► 记录token消耗                                      ║  │
│   ║   └─────────────┘                                                     ║  │
│   ║                                                                       ║  │
│   ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 技术实现

#### 4.3.1 对话服务 (限制保护)

```javascript
// backend/src/services/AIDialogueService.js
class AIDialogueService {
  constructor() {
    // 对话限制配置
    this.CONSTRAINTS = {
      MAX_ROUNDS: 10,           // 最大对话轮数
      MAX_TOKENS_PER_ROUND: 500, // 每轮最大token
      SESSION_TTL: 3600,        // 会话有效期1小时
      COOLDOWN_MS: 1000         // 用户消息最小间隔1秒
    };
  }

  async startDialogue(accountId, userId) {
    // 初始化对话会话
    const sessionKey = `dialogue:${accountId}`;
    const session = {
      accountId,
      userId,
      startTime: Date.now(),
      messages: [],
      roundCount: 0,
      status: 'active'
    };

    await redis.setex(sessionKey, this.CONSTRAINTS.SESSION_TTL, JSON.stringify(session));

    return {
      sessionId: accountId,
      welcomeMessage: this.generateWelcomeMessage(),
      constraints: {
        maxRounds: this.CONSTRAINTS.MAX_ROUNDS,
        currentRound: 0
      }
    };
  }

  async processMessage(accountId, userMessage) {
    const sessionKey = `dialogue:${accountId}`;

    // 1. 获取会话
    const sessionData = await redis.get(sessionKey);
    if (!sessionData) {
      throw new Error('对话会话已过期，请重新创建AI账户');
    }

    const session = JSON.parse(sessionData);

    // 2. 检查限制
    if (session.roundCount >= this.CONSTRAINTS.MAX_ROUNDS) {
      throw new Error(`对话轮数已达上限 (${this.CONSTRAINTS.MAX_ROUNDS})，请生成基金经理`);
    }

    // 3. 检查冷却时间
    const lastMessage = session.messages[session.messages.length - 1];
    if (lastMessage && (Date.now() - lastMessage.timestamp) < this.CONSTRAINTS.COOLDOWN_MS) {
      throw new Error('发送过于频繁，请稍后再试');
    }

    // 4. 检查token预算（如果用户提供）
    const account = await prisma.aIAccount.findUnique({ where: { id: accountId } });
    if (account.userProvidedToken) {
      const currentUsage = await this.getDialogueTokenUsage(accountId);
      if (currentUsage > account.dialogueTokenBudget) {
        throw new Error('对话token预算已用完，请生成基金经理或充值');
      }
    }

    // 5. 构建系统提示词（DeepSeek角色）
    const systemPrompt = this.buildSystemPrompt(session.roundCount);

    // 6. 调用 DeepSeek
    const response = await aiService.chat({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...session.messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ],
      max_tokens: this.CONSTRAINTS.MAX_TOKENS_PER_ROUND,
      temperature: 0.7
    });

    // 7. 更新会话
    session.messages.push(
      { role: 'user', content: userMessage, timestamp: Date.now() },
      { role: 'assistant', content: response.content, timestamp: Date.now() }
    );
    session.roundCount += 1;

    await redis.setex(sessionKey, this.CONSTRAINTS.SESSION_TTL, JSON.stringify(session));

    // 8. 记录token使用
    await this.recordTokenUsage(accountId, response.usage);

    return {
      message: response.content,
      roundCount: session.roundCount,
      maxRounds: this.CONSTRAINTS.MAX_ROUNDS,
      remainingRounds: this.CONSTRAINTS.MAX_ROUNDS - session.roundCount
    };
  }

  buildSystemPrompt(currentRound) {
    return `你是新人基金经理的导师。用户是投资董事长，正在面试你。

当前面试进度: ${currentRound + 1}/${this.CONSTRAINTS.MAX_ROUNDS}

你的职责：
1. 用专业但亲切的语气回应
2. 引导用户描述投资风格、风险偏好、关注行业
3. 了解用户期望的决策风格（激进/稳健/保守）
4. 不要给出具体交易建议

规则：
- 保持角色一致性
- 如果用户偏离主题，温和引导回投资风格讨论
- 在最后一轮时，提醒用户点击"生成基金经理"按钮`;
  }
}
```

#### 4.3.2 提示词提炼服务

```python
# ai-service/src/ai_service/services/prompt_craft_service.py
import json
from typing import List, Dict

class PromptCraftService:
    """提示词提炼服务"""

    # 提炼提示词模板
    REFINEMENT_PROMPT_TEMPLATE = """你是一个专业的投资顾问分析师。

请基于以下对话记录，提炼出基金经理的核心特征：

对话记录：
{dialogue_history}

提炼要求：
1. 投资理念：总结用户的核心投资哲学
2. 风险偏好：保守/稳健/激进
3. 关注领域：用户关注的行业或板块
4. 决策风格：用户的决策特点

约束：
- 用第三人称描述
- 控制在200字以内
- 语言简洁专业

输出格式（严格JSON）：
{{
    "personality": "性格描述",
    "investment_philosophy": "投资理念",
    "risk_preference": "保守/稳健/激进",
    "focus_sectors": ["行业1", "行业2"],
    "decision_style": "决策风格描述"
}}"""

    # 系统提示词模板
    SYSTEM_CONTEXT_TEMPLATE = """A股市场交易规则：
- 交易时间：周一至周五 9:30-11:30, 13:00-15:00
- T+1交易制度
- 涨跌幅限制：±10%（ST股±5%，创业板±20%）
- 最小交易单位：100股

风险提示：
- 投资有风险，入市需谨慎
- 过去的业绩不代表未来表现
- 请根据自身风险承受能力投资"""

    async def craft_prompt(self, dialogue_history: List[Dict]) -> Dict:
        """
        根据对话历史提炼最终提示词

        Args:
            dialogue_history: 对话历史记录

        Returns:
            最终提示词结构
        """
        # 1. 格式化对话历史
        formatted_dialogue = self._format_dialogue(dialogue_history)

        # 2. 调用 DeepSeek 提炼
        refinement_prompt = self.REFINEMENT_PROMPT_TEMPLATE.format(
            dialogue_history=formatted_dialogue
        )

        response = await self.deepseek_client.chat(
            model="deepseek-chat",
            messages=[{
                "role": "user",
                "content": refinement_prompt
            }],
            response_format={"type": "json_object"},
            max_tokens=1000
        )

        # 3. 解析用户画像
        try:
            user_profile = json.loads(response.content)
        except json.JSONDecodeError:
            logger.error(f"提示词提炼返回格式错误: {response.content}")
            # 使用默认画像
            user_profile = {
                "personality": "稳健型投资者",
                "investment_philosophy": "价值投资",
                "risk_preference": "稳健",
                "focus_sectors": ["科技", "消费"],
                "decision_style": "谨慎决策"
            }

        # 4. 组合最终提示词
        final_prompt = {
            "role": "专业基金经理",
            "identity": f"你是一位{user_profile['personality']}的基金经理",
            "philosophy": user_profile['investment_philosophy'],
            "risk_profile": user_profile['risk_preference'],
            "focus_sectors": user_profile['focus_sectors'],
            "decision_style": user_profile['decision_style'],
            "constraints": [
                "你只能基于系统提供的市场数据、新闻情报做出决策",
                "你的回复必须是JSON格式，包含字段：action, reason, confidence",
                "不要解释你的操作逻辑，直接给出决策",
                "严格遵守用户的风险偏好",
                "考虑市场整体环境和板块轮动"
            ],
            "system_context": self.SYSTEM_CONTEXT_TEMPLATE,
            "output_schema": {
                "action": "buy/sell/hold",
                "symbol": "股票代码",
                "quantity": "建议数量",
                "price_target": "目标价格",
                "stop_loss": "止损价格",
                "reason": "决策理由",
                "confidence": "置信度0-1",
                "risk_level": "low/medium/high"
            }
        }

        return final_prompt

    def _format_dialogue(self, dialogue_history: List[Dict]) -> str:
        """格式化对话历史"""
        formatted = []
        for msg in dialogue_history:
            role = "董事长" if msg['role'] == 'user' else "基金经理"
            formatted.append(f"{role}: {msg['content']}")
        return "\n".join(formatted)

    async def test_prompt(self, prompt: Dict, test_model: str) -> Dict:
        """
        测试提示词有效性

        Args:
            prompt: 最终提示词
            test_model: 测试用的交易大模型

        Returns:
            测试结果
        """
        # 构建测试请求
        test_data = {
            "market_data": {
                "symbol": "000001.SZ",
                "price": 10.5,
                "change_percent": 2.3
            },
            "portfolio": {
                "cash": 100000,
                "positions": []
            }
        }

        # 调用交易大模型
        response = await self.trading_model_client.generate(
            model=test_model,
            prompt=prompt,
            data=test_data
        )

        # 验证返回格式
        is_valid = self._validate_response(response)

        return {
            "valid": is_valid,
            "response": response,
            "token_usage": response.get('usage', {}),
            "latency_ms": response.get('latency_ms', 0)
        }

    def _validate_response(self, response: Dict) -> bool:
        """验证响应格式"""
        required_fields = ['action', 'reason', 'confidence']
        return all(field in response for field in required_fields)
```

---

## 5. AI账户操作模式

### 5.1 功能需求

1. 新建时：获取交易逻辑（买入/止盈/止损点）
2. 数据分层：周外日K、周内分钟级
3. 唤醒条件：板块异动、大盘异动、持仓异动
4. 防重复唤醒（token保护）
5. 每日收盘后批量更新

### 5.2 事件驱动架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI账户操作模式架构                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ╔═══════════════════════════════════════════════════════════════════════╗  │
│   ║                    唤醒触发器 (Wakeup Triggers)                        ║  │
│   ╠═══════════════════════════════════════════════════════════════════════╣  │
│   ║                                                                       ║  │
│   ║   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              ║  │
│   ║   │   时间触发    │  │   价格触发    │  │   新闻触发    │              ║  │
│   ║   │              │  │              │  │              │              ║  │
│   ║   │ • 每日收盘后  │  │ • 板块异动    │  │ • 重大新闻    │              ║  │
│   ║   │ • 定时检查   │  │ • 大盘异动    │  │ • 持仓相关    │              ║  │
│   ║   │ • 用户手动   │  │ • 个股异动    │  │ • 政策发布    │              ║  │
│   ║   │              │  │              │  │              │              ║  │
│   ║   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              ║  │
│   ║          │                 │                 │                       ║  │
│   ║          └─────────────────┼─────────────────┘                       ║  │
│   ║                            ▼                                         ║  │
│   ║                   ┌─────────────────┐                                ║  │
│   ║                   │   Event Bus     │                                ║  │
│   ║                   │  (Redis Stream) │                                ║  │
│   ║                   │                 │                                ║  │
│   ║                   │ ai:wakeup:queue │                                ║  │
│   ║                   └────────┬────────┘                                ║  │
│   ║                            │                                         ║  │
│   ╚════════════════════════════╪═════════════════════════════════════════╝  │
│                                 │                                            │
│                                 ▼                                            │
│   ╔═══════════════════════════════════════════════════════════════════════╗  │
│   ║                    AI调度器 (AI Scheduler)                           ║  │
│   ╠═══════════════════════════════════════════════════════════════════════╣  │
│   ║                                                                       ║  │
│   ║   ┌───────────────────────────────────────────────────────────────┐  ║  │
│   ║   │                     防重检查层                                 │  ║  │
│   ║   │                                                               │  ║  │
│   ║   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  ║  │
│   ║   │  │ 冷却时间检查 │  │ 每日上限检查 │  │ Token预算检查│          │  ║  │
│   ║   │  │  (5分钟)    │  │  (10次/日)  │  │  (用户配置)  │          │  ║  │
│   ║   │  └─────────────┘  └─────────────┘  └─────────────┘          │  ║  │
│   ║   │                                                               │  ║  │
│   ║   │  检查失败 ──► 拒绝唤醒，记录原因                               │  ║  │
│   ║   │  检查通过 ──► 进入优先级队列                                   │  ║  │
│   ║   │                                                               │  ║  │
│   ║   └────────────────────────┬──────────────────────────────────────┘  ║  │
│   ║                              │                                         ║  │
│   ║   ┌──────────────────────────▼──────────────────────────────────────┐  ║  │
│   ║   │                     优先级队列                                   │  ║  │
│   ║   │                                                               │  ║  │
│   ║   │  优先级1: 用户手动触发                                          │  ║  │
│   ║   │  优先级2: 持仓异动告警                                          │  ║  │
│   ║   │  优先级3: 板块/大盘异动                                         │  ║  │
│   ║   │  优先级4: 定时任务 (收盘后)                                      │  ║  │
│   ║   │                                                               │  ║  │
│   ║   └──────────────────────────┬──────────────────────────────────────┘  ║  │
│   ║                              │                                         ║  │
│   ║   ┌──────────────────────────▼──────────────────────────────────────┐  ║  │
│   ║   │                     批处理层 (限流)                              │  ║  │
│   ║   │                                                               │  ║  │
│   ║   │  并发控制: 最多5个AI同时唤醒                                    │  ║  │
│   ║   │  速率限制: 每秒最多2个请求                                      │  ║  │
│   ║   │                                                               │  ║  │
│   ║   └──────────────────────────┬──────────────────────────────────────┘  ║  │
│   ║                              │                                         ║  │
│   ╚══════════════════════════════╪═════════════════════════════════════════╝  │
│                                 │                                            │
│                                 ▼                                            │
│   ╔═══════════════════════════════════════════════════════════════════════╗  │
│   ║                    AI执行器 (AI Executor)                            ║  │
│   ╠═══════════════════════════════════════════════════════════════════════╣  │
│   ║                                                                       ║  │
│   ║   ┌───────────────────────────────────────────────────────────────┐  ║  │
│   ║   │                   步骤1: 数据准备                               │  ║  │
│   ║   │                                                               │  ║  │
│   ║   │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐   │  ║  │
│   ║   │  │ News Service│    │ Data Service│    │  数据分层服务    │   │  ║  │
│   ║   │  │             │    │             │    │                 │   │  ║  │
│   ║   │  │ • 相关新闻   │    │ • 实时行情   │    │ • 周外: 日K      │   │  ║  │
│   ║   │  │ • 情感分析   │    │ • 历史数据   │    │ • 周内: 分钟线   │   │  ║  │
│   ║   │  │ • 行业情报   │    │ • 技术指标   │    │ • 估算token     │   │  ║  │
│   ║   │  └──────┬──────┘    └──────┬──────┘    └────────┬────────┘   │  ║  │
│   ║   │         │                  │                    │            │  ║  │
│   ║   │         └──────────────────┼────────────────────┘            │  ║  │
│   ║   │                            ▼                                 │  ║  │
│   ║   │  ┌─────────────────────────────────────────────────────────┐ │  ║  │
│   ║   │  │  market_conditions: {                                   │ │  ║  │
│   ║   │  │    realtime: {...},                                    │ │  ║  │
│   ║   │  │    history: {                                          │ │  ║  │
│   ║   │  │      data: [...],                                      │ │  ║  │
│   ║   │  │      granularity: "minute"/"daily",                     │ │  ║  │
│   ║   │  │      token_estimate: 1500                              │ │  ║  │
│   ║   │  │    },                                                  │ │  ║  │
│   ║   │  │    news: {...},                                        │ │  ║  │
│   ║   │  │    indicators: {...}                                   │ │  ║  │
│   ║   │  │  }                                                      │ │  ║  │
│   ║   │  └─────────────────────────────────────────────────────────┘ │  ║  │
│   ║   │                                                               │  ║  │
│   ║   └──────────────────────────┬──────────────────────────────────────┘  ║  │
│   ║                              │                                         ║  │
│   ║   ┌──────────────────────────▼──────────────────────────────────────┐  ║  │
│   ║   │                   步骤2: 调用交易模型                            │  ║  │
│   ║   │                                                               │  ║  │
│   ║   │  提示词 + 市场数据 ──► 交易大模型(GLM/Claude)                     │  ║  │
│   ║   │                                                               │  ║  │
│   ║   │  返回: {买入点, 止盈点, 止损点, 仓位建议, 逻辑说明}                │  ║  │
│   ║   │                                                               │  ║  │
│   ║   └──────────────────────────┬──────────────────────────────────────┘  ║  │
│   ║                              │                                         ║  │
│   ║   ┌──────────────────────────▼──────────────────────────────────────┐  ║  │
│   ║   │                   步骤3: 解析与存储                               │  ║  │
│   ║   │                                                               │  ║  │
│   ║   │  ┌─────────────────────────────────────────────────────────┐  │  ║  │
│   ║   │  │  trading_logic: {                                       │  │  ║  │
│   ║   │  │    buy_point: 10.5,      // 建议买入价                   │  │  ║  │
│   ║   │  │    take_profit: 12.0,    // 止盈价                       │  │  ║  │
│   ║   │  │    stop_loss: 9.5,       // 止损价                       │  │  ║  │
│   ║   │  │    position_size: 0.1,   // 仓位比例(10%)                │  │  ║  │
│   ║   │  │    logic: "突破阻力位，MACD金叉",                         │  │  ║  │
│   ║   │  │    valid_until: "2026-02-11T09:30:00Z"  // 有效期        │  │  ║  │
│   ║   │  │  }                                                      │  │  ║  │
│   ║   │  └─────────────────────────────────────────────────────────┘  │  ║  │
│   ║   │                                                               │  ║  │
│   ║   │  存储 ──► PostgreSQL                                          │  ║  │
│   ║   │  触发 ──► 监控执行器 (根据实时价格执行交易逻辑)                    │  ║  │
│   ║   │                                                               │  ║  │
│   ║   └───────────────────────────────────────────────────────────────┘  ║  │
│   ║                                                                       ║  │
│   ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 关键实现

#### 5.3.1 数据分层服务

```python
# ai-service/src/ai_service/services/data_layer_service.py
from datetime import datetime, timedelta
from typing import Dict, List

class DataLayerService:
    """
    AI决策数据分层服务
    根据时间范围提供不同粒度的数据，平衡精细度和token消耗
    """

    def __init__(self):
        self.data_service = DataServiceClient()
        self.news_service = NewsServiceClient()

    async def prepare_decision_data(
        self,
        stock_codes: List[str],
        account_id: str,
        days: int = 7
    ) -> Dict:
        """
        准备AI决策所需的分层数据

        Args:
            stock_codes: 股票代码列表
            account_id: AI账户ID
            days: 历史数据天数

        Returns:
            分层数据结构
        """
        now = datetime.now()
        one_week_ago = now - timedelta(days=7)

        result = {
            'stocks': {},
            'market_overview': None,
            'news': None,
            'token_estimate': 0
        }

        for code in stock_codes:
            stock_data = await self._get_layered_stock_data(code, days)
            result['stocks'][code] = stock_data
            result['token_estimate'] += stock_data['token_estimate']

        # 获取市场概况
        result['market_overview'] = await self.data_service.get_market_overview()

        # 获取相关新闻
        result['news'] = await self.news_service.get_relevant_news(stock_codes)

        return result

    async def _get_layered_stock_data(self, stock_code: str, days: int) -> Dict:
        """获取单只股票的分层数据"""
        now = datetime.now()
        one_week_ago = now - timedelta(days=7)
        start_date = now - timedelta(days=days)

        # 1. 实时数据（必须）
        realtime = await self.data_service.get_quote(stock_code)

        # 2. 历史数据（分层策略）
        if days <= 7:
            # 一周内：分钟级数据（5分钟线）
            history = await self.data_service.get_minute_kline(
                stock_code,
                start_date=start_date,
                end_date=now,
                interval='5m'
            )
            granularity = '5m'
            # 分钟数据约 576条/天 (12小时 * 12条/小时)
            token_estimate = len(history) * 2  # 每条约2 tokens
        else:
            # 跨周数据：分段获取
            history = []

            # 最近7天：分钟级
            recent_minute = await self.data_service.get_minute_kline(
                stock_code,
                start_date=one_week_ago,
                end_date=now,
                interval='5m'
            )
            history.extend(recent_minute)

            # 更早数据：日K级
            if days > 7:
                daily_start = start_date
                daily_end = one_week_ago
                daily_data = await self.data_service.get_daily_kline(
                    stock_code,
                    start_date=daily_start,
                    end_date=daily_end
                )
                history.extend(daily_data)

            granularity = 'mixed'
            # 混合数据估算
            token_estimate = len(recent_minute) * 2 + len(daily_data) * 10

        # 3. 技术指标（从数据服务获取）
        indicators = await self.data_service.get_technical_indicators(stock_code)

        return {
            'stock_code': stock_code,
            'realtime': realtime,
            'history': {
                'data': history,
                'granularity': granularity,
                'count': len(history),
                'date_range': {
                    'start': start_date.isoformat(),
                    'end': now.isoformat()
                }
            },
            'indicators': indicators,
            'token_estimate': token_estimate
        }

    def optimize_for_token_budget(
        self,
        data: Dict,
        max_tokens: int
    ) -> Dict:
        """
        根据token预算优化数据

        策略：
        1. 优先保留实时数据
        2. 逐步降低历史数据粒度
        3. 最后裁剪新闻内容
        """
        current_estimate = data['token_estimate']

        if current_estimate <= max_tokens:
            return data

        # 策略1：减少历史数据天数
        for stock_code, stock_data in data['stocks'].items():
            if current_estimate <= max_tokens:
                break

            if stock_data['history']['granularity'] == '5m':
                # 分钟数据改为小时数据
                stock_data['history']['data'] = self._downsample_to_hourly(
                    stock_data['history']['data']
                )
                stock_data['history']['granularity'] = '1h'
                stock_data['token_estimate'] = len(stock_data['history']['data']) * 5
                current_estimate = sum(
                    s['token_estimate'] for s in data['stocks'].values()
                )

        # 策略2：进一步减少天数
        if current_estimate > max_tokens:
            for stock_code, stock_data in data['stocks'].items():
                if current_estimate <= max_tokens:
                    break

                # 只保留最近3天分钟数据
                if stock_data['history']['granularity'] in ['5m', '1h']:
                    three_days_ago = datetime.now() - timedelta(days=3)
                    stock_data['history']['data'] = [
                        d for d in stock_data['history']['data']
                        if datetime.fromisoformat(d['timestamp']) > three_days_ago
                    ]
                    stock_data['token_estimate'] = len(stock_data['history']['data']) * 5
                    current_estimate = sum(
                        s['token_estimate'] for s in data['stocks'].values()
                    )

        data['token_estimate'] = current_estimate
        data['optimized'] = True

        return data

    def _downsample_to_hourly(self, minute_data: List[Dict]) -> List[Dict]:
        """将分钟数据降采样为小时数据"""
        hourly = {}
        for item in minute_data:
            hour_key = item['timestamp'][:13]  # 取到小时
            if hour_key not in hourly:
                hourly[hour_key] = item
        return list(hourly.values())
```

#### 5.3.2 唤醒调度器（防重保护）

```javascript
// backend/src/services/AIWakeupScheduler.js
class AIWakeupScheduler {
  constructor() {
    // 保护配置
    this.CONFIG = {
      MIN_WAKEUP_INTERVAL: 5 * 60 * 1000,  // 最少5分钟唤醒一次
      DAILY_MAX_WAKEUP: 10,                 // 每日最多唤醒10次
      TOKEN_BUDGET_DEFAULT: 50000,          // 默认每日token预算
      PRIORITY_WEIGHTS: {
        manual: 1,           // 用户手动触发 - 最高优先级
        position_alert: 2,   // 持仓异动
        sector_alert: 3,     // 板块异动
        market_alert: 4,     // 大盘异动
        scheduled: 5         // 定时任务 - 最低优先级
      }
    };

    // Bull队列配置
    this.queue = new Bull('ai-wakeup', {
      redis: { host: 'localhost', port: 6379, db: 3 },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 100,
        removeOnFail: 50
      }
    });

    this.setupQueueProcessor();
  }

  /**
   * 检查是否应该唤醒
   */
  async shouldWakeup(accountId, triggerType) {
    const now = Date.now();
    const today = new Date().toDateString();

    // 1. 获取唤醒历史
    const historyKey = `wakeup:${accountId}:history`;
    const budgetKey = `wakeup:${accountId}:budget`;

    const [historyData, budgetData] = await Promise.all([
      redis.get(historyKey),
      redis.get(budgetKey)
    ]);

    const history = historyData ? JSON.parse(historyData) : [];
    const budget = budgetData ? JSON.parse(budgetData) : {
      dailyLimit: this.CONFIG.TOKEN_BUDGET_DEFAULT,
      usedToday: 0,
      date: today
    };

    // 检查预算日期，如果是新的一天则重置
    if (budget.date !== today) {
      budget.usedToday = 0;
      budget.date = today;
    }

    // 2. 检查冷却时间
    const lastWakeup = history[history.length - 1];
    if (lastWakeup && (now - lastWakeup.timestamp) < this.CONFIG.MIN_WAKEUP_INTERVAL) {
      const remainingCooldown = Math.ceil(
        (this.CONFIG.MIN_WAKEUP_INTERVAL - (now - lastWakeup.timestamp)) / 1000
      );
      return {
        should: false,
        reason: `冷却时间未结束，还需等待 ${remainingCooldown} 秒`,
        code: 'COOLDOWN'
      };
    }

    // 3. 检查每日唤醒次数
    const todayWakeup = history.filter(h =>
      new Date(h.timestamp).toDateString() === today
    );
    if (todayWakeup.length >= this.CONFIG.DAILY_MAX_WAKEUP) {
      return {
        should: false,
        reason: `今日唤醒次数已达上限 (${this.CONFIG.DAILY_MAX_WAKEUP})`,
        code: 'DAILY_LIMIT'
      };
    }

    // 4. 检查Token预算（如果用户提供）
    const account = await prisma.aIAccount.findUnique({
      where: { id: accountId },
      include: { user: true }
    });

    if (account.userProvidedToken) {
      // 获取预估token消耗（根据持仓数量估算）
      const positionCount = await prisma.position.count({
        where: { accountId }
      });
      const estimatedTokens = positionCount * 2000; // 每只股票约2000 tokens

      if (budget.usedToday + estimatedTokens > budget.dailyLimit) {
        return {
          should: false,
          reason: `Token预算不足 (剩余: ${budget.dailyLimit - budget.usedToday}, 需要: ${estimatedTokens})`,
          code: 'TOKEN_BUDGET'
        };
      }
    }

    return {
      should: true,
      reason: null,
      code: 'OK',
      metadata: {
        todayWakeupCount: todayWakeup.length,
        remainingToday: this.CONFIG.DAILY_MAX_WAKEUP - todayWakeup.length,
        tokenBudgetRemaining: budget.dailyLimit - budget.usedToday
      }
    };
  }

  /**
   * 触发唤醒
   */
  async triggerWakeup(accountId, triggerType, context = {}) {
    // 1. 防重检查
    const check = await this.shouldWakeup(accountId, triggerType);
    if (!check.should) {
      logger.info(`AI账户 ${accountId} 唤醒被拒绝: ${check.reason}`);

      // 记录拒绝日志
      await prisma.aIWakeupLog.create({
        data: {
          accountId,
          triggerType,
          status: 'rejected',
          rejectReason: check.reason,
          rejectCode: check.code,
          context
        }
      });

      return {
        success: false,
        reason: check.reason,
        code: check.code
      };
    }

    // 2. 提交到队列
    const job = await this.queue.add('wakeup', {
      accountId,
      triggerType,
      context,
      timestamp: Date.now(),
      metadata: check.metadata
    }, {
      priority: this.CONFIG.PRIORITY_WEIGHTS[triggerType] || 5,
      jobId: `${accountId}:${Date.now()}`, // 防止重复提交
      removeOnComplete: true
    });

    logger.info(`AI账户 ${accountId} 唤醒任务已提交 (jobId: ${job.id})`);

    // 3. 记录日志
    await prisma.aIWakeupLog.create({
      data: {
        accountId,
        triggerType,
        status: 'queued',
        jobId: job.id,
        context,
        metadata: check.metadata
      }
    });

    return {
      success: true,
      jobId: job.id,
      metadata: check.metadata
    };
  }

  /**
   * 队列处理器
   */
  setupQueueProcessor() {
    this.queue.process('wakeup', 5, async (job) => {  // 并发5个
      const { accountId, triggerType, context } = job.data;

      try {
        logger.info(`开始执行唤醒任务: ${accountId}`);

        // 1. 获取AI账户信息
        const account = await prisma.aIAccount.findUnique({
          where: { id: accountId },
          include: { positions: true }
        });

        // 2. 准备数据
        const stockCodes = account.positions.map(p => p.stockCode);
        const decisionData = await aiDataLayerService.prepareDecisionData(
          stockCodes,
          accountId
        );

        // 3. 调用交易模型
        const tradingLogic = await aiExecutor.execute(
          account,
          decisionData
        );

        // 4. 保存结果
        await prisma.aITradingLogic.create({
          data: {
            accountId,
            logic: tradingLogic,
            triggerType,
            validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24小时有效
            status: 'active'
          }
        });

        // 5. 更新token使用
        if (account.userProvidedToken && tradingLogic.tokenUsage) {
          await this.updateTokenBudget(accountId, tradingLogic.tokenUsage.total);
        }

        // 6. 记录成功
        await this.recordWakeupSuccess(accountId, job.id, tradingLogic);

        return { success: true, tradingLogic };

      } catch (error) {
        logger.error(`唤醒任务执行失败: ${accountId}`, error);
        throw error;
      }
    });
  }

  /**
   * 记录成功唤醒
   */
  async recordWakeupSuccess(accountId, jobId, tradingLogic) {
    const now = Date.now();
    const historyKey = `wakeup:${accountId}:history`;

    // 获取并更新历史
    const historyData = await redis.get(historyKey);
    const history = historyData ? JSON.parse(historyData) : [];

    history.push({
      timestamp: now,
      jobId,
      triggerType: tradingLogic.triggerType,
      tokenUsage: tradingLogic.tokenUsage
    });

    // 只保留最近30天的记录
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const filtered = history.filter(h => h.timestamp > thirtyDaysAgo);

    await redis.setex(historyKey, 30 * 24 * 60 * 60, JSON.stringify(filtered));
  }

  /**
   * 更新token预算
   */
  async updateTokenBudget(accountId, tokensUsed) {
    const budgetKey = `wakeup:${accountId}:budget`;
    const today = new Date().toDateString();

    const budgetData = await redis.get(budgetKey);
    const budget = budgetData ? JSON.parse(budgetData) : {
      dailyLimit: this.CONFIG.TOKEN_BUDGET_DEFAULT,
      usedToday: 0,
      date: today
    };

    if (budget.date !== today) {
      budget.usedToday = 0;
      budget.date = today;
    }

    budget.usedToday += tokensUsed;
    await redis.setex(budgetKey, 24 * 60 * 60, JSON.stringify(budget));

    return budget;
  }
}
```

#### 5.3.3 每日收盘批量更新

```javascript
// backend/src/jobs/dailyAICloseJob.js
const { CronJob } = require('cron');

class DailyAICloseJob {
  constructor() {
    this.scheduler = new AIWakeupScheduler();
  }

  /**
   * 执行每日收盘更新
   */
  async execute() {
    const startTime = Date.now();
    logger.info('══════════════════════════════════════════════════');
    logger.info('开始执行每日收盘AI更新任务');
    logger.info('══════════════════════════════════════════════════');

    try {
      // 1. 查询活跃账户（30日内登录）
      const activeAccounts = await prisma.aIAccount.findMany({
        where: {
          user: {
            lastLoginAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          },
          status: 'active'
        },
        select: {
          id: true,
          name: true,
          modelType: true,
          user: {
            select: { id: true, lastLoginAt: true }
          }
        }
      });

      logger.info(`找到 ${activeAccounts.length} 个活跃AI账户`);

      // 2. 分批提交（限流控制）
      const results = {
        total: activeAccounts.length,
        queued: 0,
        rejected: 0,
        errors: []
      };

      const BATCH_SIZE = 5;
      const RATE_LIMIT_MS = 1000; // 每秒5个

      for (let i = 0; i < activeAccounts.length; i += BATCH_SIZE) {
        const batch = activeAccounts.slice(i, i + BATCH_SIZE);

        logger.info(`处理批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(activeAccounts.length / BATCH_SIZE)}`);

        const batchPromises = batch.map(async (account) => {
          try {
            const result = await this.scheduler.triggerWakeup(
              account.id,
              'scheduled',
              {
                reason: '每日收盘后例行更新',
                batchInfo: {
                  index: i,
                  total: activeAccounts.length
                }
              }
            );

            if (result.success) {
              results.queued++;
            } else {
              results.rejected++;
              logger.warn(`账户 ${account.id} 唤醒被拒绝: ${result.reason}`);
            }

            return result;
          } catch (error) {
            results.errors.push({
              accountId: account.id,
              error: error.message
            });
            logger.error(`账户 ${account.id} 唤醒失败:`, error);
          }
        });

        await Promise.all(batchPromises);

        // 速率限制
        if (i + BATCH_SIZE < activeAccounts.length) {
          await sleep(RATE_LIMIT_MS);
        }
      }

      // 3. 记录汇总
      const duration = Date.now() - startTime;
      logger.info('══════════════════════════════════════════════════');
      logger.info('每日收盘AI更新任务完成');
      logger.info(`总账户: ${results.total}, 已排队: ${results.queued}, 被拒绝: ${results.rejected}`);
      logger.info(`错误数: ${results.errors.length}, 耗时: ${duration}ms`);
      logger.info('══════════════════════════════════════════════════');

      // 4. 发送通知（如果错误过多）
      if (results.errors.length > results.total * 0.1) {
        await alertService.send({
          type: 'warning',
          title: '每日收盘AI更新异常',
          message: `${results.errors.length} 个账户更新失败`
        });
      }

      return results;

    } catch (error) {
      logger.error('每日收盘AI更新任务失败:', error);
      throw error;
    }
  }
}

// 创建单例
const dailyAICloseJob = new DailyAICloseJob();

// 定时任务配置（A股收盘后 15:30 执行）
const job = new CronJob(
  '30 15 * * 1-5',  // 周一到周五 15:30
  () => dailyAICloseJob.execute(),
  null,
  true,
  'Asia/Shanghai'
);

module.exports = { dailyAICloseJob, job };
```

---

## 6. 服务间调用关系总图

### 6.1 完整调用链

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        六服务调用关系总图                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   客户端层                                                                    │
│   ┌─────────────┐    ┌─────────────┐                                        │
│   │  Frontend   │    │ Miniprogram │                                        │
│   │   (React)   │    │  (UniApp)   │                                        │
│   └──────┬──────┘    └──────┬──────┘                                        │
│          │                   │                                               │
│          │  HTTP/REST + JWT  │                                               │
│          └─────────┬─────────┘                                               │
│                    │                                                         │
│   API网关层         ▼                                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                           Backend (3001)                            │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │   │
│   │  │  Auth    │  │  Router  │  │  BFF     │  │ Service  │  │  Job   │ │   │
│   │  │  认证    │──┤  路由    │──┤  聚合层   │──┤  SDK     │──┤ Scheduler│ │   │
│   │  └──────────┘  └──────────┘  └──────────┘  └────┬─────┘  └────────┘ │   │
│   │                                                 │                   │   │
│   └─────────────────────────────────────────────────┼───────────────────┘   │
│                                                     │                        │
│   领域服务层         ┌──────────────────────────────┼──────────────────┐    │
│                      │                              │                   │    │
│   ┌──────────────────┼──────────────────────────────┼──────────────────┐    │
│   │                  │                              │                   │    │
│   │  ┌───────────────┼─────────────┐  ┌─────────────┼─────────────┐    │    │
│   │  │ AI Service    │             │  │ Data Service│             │    │    │
│   │  │     :8000     │             │  │    :8001    │             │    │    │
│   │  │               │             │  │             │             │    │    │
│   │  │ ┌───────────┐ │             │  │ ┌───────────┐             │    │    │
│   │  │ │ Decision  │◄┼─────────────┘  │ │ Collector │             │    │    │
│   │  │ │ Service   │ │   提供市场数据   │ │  (分层)   │             │    │    │
│   │  │ └─────┬─────┘ │                │ └─────┬─────┘             │    │    │
│   │  │       │       │                │       │                    │    │    │
│   │  │ ┌─────▼─────┐ │                │ ┌─────▼─────┐              │    │    │
│   │  │ │ PromptCraft│ │                │ │  Realtime │              │    │    │
│   │  │ │  Service   │ │                │ │  Service  │              │    │    │
│   │  │ └───────────┘ │                │ └───────────┘              │    │    │
│   │  │               │                │                             │    │    │
│   │  └───────────────┼────────────────┼─────────────────────────────┘    │    │
│   │                  │                │                                   │    │
│   │  ┌───────────────┘                └───────────────┐                  │    │
│   │  │                                               │                  │    │
│   │  │  ┌─────────────┐              ┌─────────────┐ │                  │    │
│   │  │  │ News Service│              │  外部数据源  │ │                  │    │
│   │  │  │    :8002    │              │             │ │                  │    │
│   │  │  │             │              │ • 新浪财经   │ │                  │    │
│   │  │  │ • 新闻采集   │              │ • 腾讯财经   │ │                  │    │
│   │  │  │ • 情感分析   │              │ • 东方财富   │ │                  │    │
│   │  │  │ • 情报推送   │              │             │ │                  │    │
│   │  │  └─────────────┘              └─────────────┘ │                  │    │
│   │  │                                               │                  │    │
│   │  └───────────────────────────────────────────────┘                  │    │
│   │                                                                     │    │
│   └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│   基础设施层                                                                   │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│   │ PostgreSQL  │  │ TimescaleDB │  │    Redis    │  │   Message Queue     │ │
│   │  (业务数据)  │  │  (时序数据)  │  │  (缓存/消息) │  │   (Bull Queue)      │ │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 核心调用链说明

| 调用链 | 路径 | 数据流 | 说明 |
|--------|------|--------|------|
| **用户登录** | Frontend → Backend → PostgreSQL | 认证信息 | JWT签发 |
| **获取行情** | Frontend → Data Service | 实时价格 | WebSocket直连 |
| **AI决策** | Backend → AI Service → 交易模型 | 市场数据 → 交易逻辑 | 同步调用 |
| **新闻情感** | Backend → News Service → AI Service | 新闻 → 情感分析 → 决策输入 | 服务编排 |
| **定时唤醒** | Job Scheduler → Queue → AI Executor | 批量触发 | 异步处理 |
| **数据更新** | Data Service → Redis → Frontend | 实时推送 | Pub/Sub |

---

## 7. 实施建议

### 7.1 分阶段实施计划

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         分阶段实施计划                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   阶段1: 基础架构 (Week 1-2)                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                     │   │
│   │  □ 实现数据分层服务 (DataLayerService)                               │   │
│   │  □ 实现热股票列表生成器 (StockHeatScheduler)                         │   │
│   │  □ 实现分层采集器 (LayeredCollector)                                 │   │
│   │  □ 集成Redis Pub/Sub进行服务通信                                     │   │
│   │                                                                     │   │
│   │  里程碑: 实时行情采集分层策略生效                                     │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   阶段2: AI对话系统 (Week 2-3)                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                     │   │
│   │  □ 实现对话服务 (AIDialogueService)                                  │   │
│   │  □ 实现提示词提炼服务 (PromptCraftService)                           │   │
│   │  □ 实现WebSocket对话接口                                             │   │
│   │  □ 前端对话界面开发                                                  │   │
│   │                                                                     │   │
│   │  里程碑: 用户可通过对话创建AI基金经理                                 │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   阶段3: AI唤醒机制 (Week 3-4)                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                     │   │
│   │  □ 实现唤醒调度器 (AIWakeupScheduler)                                │   │
│   │  □ 实现防重保护机制 (冷却/限次/预算)                                  │   │
│   │  □ 实现Bull队列处理器                                                │   │
│   │  □ 实现每日收盘批量更新任务                                          │   │
│   │                                                                     │   │
│   │  里程碑: AI账户可按规则自动唤醒更新交易逻辑                           │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   阶段4: 完善与优化 (Week 4-5)                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                     │   │
│   │  □ 实现异动检测与实时唤醒                                            │   │
│   │  □ 实现News Service集成                                              │   │
│   │  □ 性能调优与监控                                                    │   │
│   │  □ 端到端测试与Bug修复                                               │   │
│   │                                                                     │   │
│   │  里程碑: 完整AI交易闭环可用                                           │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| **数据访问路径** | 双路径（业务数据Backend中转，实时数据直连） | 平衡安全性与性能 |
| **服务通信** | HTTP REST + Redis Pub/Sub | 简单可靠，无需引入消息队列 |
| **数据分层** | 热股票高频(10s)，全市场低频(60s) | 资源优化，核心股票低延迟 |
| **AI对话限制** | 10轮/500token/1小时 | 防止滥用，控制成本 |
| **唤醒保护** | 5分钟冷却/10次每日/token预算 | 多重保护，防止token爆炸 |
| **任务队列** | Bull (Redis-based) | 简单可靠，支持优先级和重试 |

### 7.3 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| **Token成本超支** | 高 | 预算限制、用量监控、告警机制 |
| **AI决策延迟** | 中 | 数据分层、缓存优化、异步处理 |
| **服务雪崩** | 高 | 熔断降级、限流、队列削峰 |
| **数据不一致** | 中 | 事务控制、最终一致性、对账机制 |

---

## 附录

### A. 术语表

| 术语 | 说明 |
|------|------|
| BFF | Backend for Frontend，为前端服务的后端聚合层 |
| DAO | Data Access Object，数据访问对象 |
| Token | 大模型API的计费单位 |
| Pipeline | 数据处理流程 |
| Pub/Sub | 发布/订阅消息模式 |
| 热股票 | 需要高频采集的股票（用户持仓+关注） |

### B. 相关文档

- [系统架构设计](SYSTEM_ARCHITECTURE.md)
- [服务通信架构](SERVICE_COMMUNICATION_ARCHITECTURE.md)
- [News Service 联动规范](../../news-service/docs/LINKAGE_SPEC.md)
- [数据流架构](DATA_FLOW_ARCHITECTURE.md)

---

*本文档详细记录了六服务架构设计方案，包含完整的技术实现和调用关系，为后续开发和优化提供基础。*
