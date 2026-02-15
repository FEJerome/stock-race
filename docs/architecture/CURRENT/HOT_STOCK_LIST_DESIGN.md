# 热股票列表API设计文档

## 概述

为Market Data Service提供加权热股票列表，支持动态高频层采集。根据用户查看行为、交易活跃度等实时计算权重。

## 核心需求

### 功能需求

1. **实时权重计算**
   - 根据用户查看行为动态计算股票热度权重
   - 权重范围：0-100（保留1位小数）
   - 更新周期：30秒

2. **权重计算因子**
   | 因子 | 占比 | 说明 | 数据来源 |
   |-----|------|------|---------|
   | 当前查看用户数 | 40% | 正在查看该股票的用户数 | WebSocket连接统计 |
   | 近期查看次数 | 30% | 最近5分钟内的查看次数 | 点击日志统计 |
   | 交易活跃度 | 20% | 该股票的成交量/成交额 | Market Data Service |
   | 用户收藏数 | 10% | 收藏/关注该股票的用户数 | 用户数据库 |

3. **API端点**
   - `GET /api/v1/market/hot-stocks` - 获取加权热股票列表

### 性能需求

| 指标 | 目标值 | 说明 |
|-----|-------|------|
| 权重计算延迟 | < 5秒 | 从数据采集到权重计算完成 |
| API响应时间 | < 100ms | P95响应时间 |
| 列表更新频率 | 30秒 | 热股票列表刷新周期 |
| 支持股票数量 | 5000+ | 全市场股票权重计算 |

## 架构设计

### 组件关系

```
┌─────────────────────────────────────────────────────────────────┐
│                         Backend Service                          │
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────────┐ │
│  │ User Activity │  │ Trade Volume  │  │ User Favorites       │ │
│  │ Tracker       │  │ Monitor       │  │ Service              │ │
│  └───────┬───────┘  └───────┬───────┘  └──────────┬───────────┘ │
│          │                  │                      │             │
│          └──────────────────┼──────────────────────┘             │
│                             ▼                                    │
│                  ┌──────────────────────┐                       │
│                  │ HotStockCalculator   │                       │
│                  │ (权重计算引擎)        │                       │
│                  └──────────┬───────────┘                       │
│                             ▼                                    │
│                  ┌──────────────────────┐                       │
│                  │ HotStockCache        │                       │
│                  │ (Redis缓存)          │                       │
│                  └──────────┬───────────┘                       │
│                             ▼                                    │
│                  ┌──────────────────────┐                       │
│                  │ HotStock API         │                       │
│                  │ GET /hot-stocks      │                       │
│                  └──────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Market Data Service                         │
│                   (拉取热股票列表，用于高频层)                      │
└─────────────────────────────────────────────────────────────────┘
```

### 数据模型

#### HotStockEntry
```typescript
interface HotStockEntry {
  symbol: string;           // 股票代码，如 "000001.SZ"
  weight: number;           // 热度权重 (0-100)
  factors: {                // 权重因子详情
    userCount: number;      // 当前查看用户数
    viewCount: number;      // 近期查看次数
    tradeScore: number;     // 交易活跃度得分
    favoriteCount: number;  // 收藏用户数
  };
  updatedAt: string;        // ISO 8601 时间戳
}
```

#### HotStockListResponse
```typescript
interface HotStockListResponse {
  success: boolean;
  data: {
    stocks: HotStockEntry[];   // 热股票列表（按权重降序）
    totalCount: number;        // 总股票数
    updatedAt: string;         // 列表更新时间
    nextUpdateIn: number;      // 下次更新倒计时（秒）
  };
}
```

## API 规范

### GET /api/v1/market/hot-stocks

获取加权热股票列表

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| limit | number | 否 | 返回股票数量限制，默认50，最大200 |
| minWeight | number | 否 | 最小权重过滤，默认0 |

**响应示例：**
```json
{
  "success": true,
  "data": {
    "stocks": [
      {
        "symbol": "000001.SZ",
        "weight": 95.5,
        "factors": {
          "userCount": 120,
          "viewCount": 450,
          "tradeScore": 88.5,
          "favoriteCount": 230
        },
        "updatedAt": "2026-02-13T10:30:00Z"
      },
      {
        "symbol": "600519.SH",
        "weight": 88.2,
        "factors": {
          "userCount": 98,
          "viewCount": 380,
          "tradeScore": 85.2,
          "favoriteCount": 180
        },
        "updatedAt": "2026-02-13T10:30:00Z"
      }
    ],
    "totalCount": 50,
    "updatedAt": "2026-02-13T10:30:00Z",
    "nextUpdateIn": 25
  }
}
```

**错误响应：**
```json
{
  "success": false,
  "error": {
    "code": "CACHE_NOT_READY",
    "message": "热股票列表正在初始化，请稍后重试"
  }
}
```

## 权重计算算法

### 算法流程

```
1. 收集数据（每30秒执行一次）
   ├── 统计当前查看每只股票的用户数
   ├── 统计最近5分钟每只股票被查看次数
   ├── 获取每只股票的交易量/成交额
   └── 获取每只股票被收藏的用户数

2. 归一化处理
   ├── userCountScore = min(userCount / 1000, 1.0) * 40
   ├── viewCountScore = min(viewCount / 5000, 1.0) * 30
   ├── tradeScore = min(tradeVolume / 1000000, 1.0) * 20
   └── favoriteScore = min(favoriteCount / 500, 1.0) * 10

3. 计算总权重
   weight = round(userCountScore + viewCountScore + tradeScore + favoriteScore, 1)

4. 排序并缓存
   ├── 按权重降序排序
   ├── 存入Redis（TTL=60秒）
   └── 记录更新时间
```

### 权重计算代码示例

```javascript
function calculateStockWeight(stockData) {
  const MAX_USERS = 1000;
  const MAX_VIEWS = 5000;
  const MAX_VOLUME = 1000000;
  const MAX_FAVORITES = 500;

  const userScore = Math.min(stockData.userCount / MAX_USERS, 1.0) * 40;
  const viewScore = Math.min(stockData.viewCount / MAX_VIEWS, 1.0) * 30;
  const tradeScore = Math.min(stockData.tradeVolume / MAX_VOLUME, 1.0) * 20;
  const favoriteScore = Math.min(stockData.favoriteCount / MAX_FAVORITES, 1.0) * 10;

  return Math.round((userScore + viewScore + tradeScore + favoriteScore) * 10) / 10;
}
```

## 实时机制设计

### 当前实现（基于轮询）

**数据收集周期：30秒**
- 优点：实现简单，资源消耗可控
- 缺点：实时性一般（最大延迟30秒）

**架构：**
```
定时任务(30s) → 收集数据 → 计算权重 → 更新Redis → 提供API
```

### 未来实时机制（事件驱动）

**事件触发实时更新**
- 用户查看股票 → 立即更新权重
- 交易活跃变化 → 立即更新权重
- 优点：实时性高（延迟<1秒）
- 缺点：实现复杂，资源消耗较高

**架构：**
```
用户事件 → 事件总线 → 权重计算器 → 增量更新Redis → 推送变更
```

### 渐进式演进路线

```
Phase 1 (当前): 轮询机制
  └── 30秒周期权重计算，满足基本需求

Phase 2 (未来): 混合机制
  └── 轮询 + 事件触发（关键股票实时更新）

Phase 3 (未来): 全实时
  └── 完全事件驱动，WebSocket推送变更
```

## 缓存策略

### Redis缓存设计

**Key:** `hot:stocks:list`
**Value:** JSON字符串（热股票列表）
**TTL:** 60秒

**Key:** `hot:stocks:metadata`
**Value:** 更新时间、下次更新时间等
**TTL:** 60秒

### 缓存更新策略

1. **定时更新：** 每30秒重新计算并更新缓存
2. **被动更新：** API发现缓存过期时触发更新
3. **容错处理：** 缓存失效时返回上次有效数据（最长容忍5分钟）

## 实现计划

### Phase 1: 核心组件实现
1. HotStockCalculator - 权重计算引擎
2. HotStockCache - Redis缓存管理
3. HotStock API - RESTful接口

### Phase 2: 数据收集集成
1. 用户活动追踪（WebSocket连接统计）
2. 交易数据获取（对接Market Data Service）
3. 用户收藏数据查询

### Phase 3: 测试验证
1. 单元测试
2. 集成测试
3. 性能测试

## 测试策略

### 单元测试覆盖
1. 权重计算逻辑
2. 数据归一化处理
3. 排序算法
4. 缓存读写

### 集成测试
1. API响应格式验证
2. 权重计算准确性
3. 缓存一致性
4. 并发性能

---

*文档版本: v1.0*
*创建日期: 2026-02-13*
*设计团队: Backend开发团队*
