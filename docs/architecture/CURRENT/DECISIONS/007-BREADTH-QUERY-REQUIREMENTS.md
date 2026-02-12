# AI决策服务广度数据查询需求确认文档

> 本文档明确AI决策服务对News Service和Market Data Service的数据查询需求，要求两个服务确认现有接口是否满足"一次调用返回充满广度数据"的要求。
>
> **文档版本**: v1.0
> **创建日期**: 2026-02-11
> **需求方**: Trading AI Service (AI决策服务)
> **响应方**: News Service, Market Data Service

---

## 目录

1. [背景与需求概述](#一背景与需求概述)
2. [News Service 查询需求确认](#二news-service-查询需求确认)
3. [Market Data Service 查询需求确认](#三market-data-service-查询需求确认)
4. [响应要求](#四响应要求)

---

## 一、背景与需求概述

### 1.1 AI决策场景

AI决策服务需要根据**多维度、大范围**的数据做出交易决策，典型场景包括：

| 场景 | 数据需求 | 查询维度 |
|------|----------|----------|
| **板块轮动判断** | 新能源板块所有股票的新闻+行情 | 板块名称 |
| **行业趋势分析** | 医药行业中市值前50的股票数据 | 行业分类 + 市值筛选 |
| **概念股跟踪** | 人工智能概念相关股票的舆情 | 概念标签 |
| **个股深度决策** | 单只股票的全方位情报 | 股票代码 |
| **市场全景扫描** | 全市场热点板块+龙头股 | 全市场聚合 |

### 1.2 核心需求

**"一次调用，广度数据"**

AI决策服务不希望：
- ❌ 调用10次才能获取10只股票的数据
- ❌ 自己维护股票代码到板块/行业的映射
- ❌ 分别调用新闻接口和行情接口再自行合并

AI决策服务期望：
- ✅ 一次API调用获取多只股票的聚合数据
- ✅ 支持按板块、行业、概念等维度查询（服务内部解析为股票列表）
- ✅ 返回的数据包含完整的关联信息（板块、行业、舆情标签）

---

## 二、News Service 查询需求确认

### 2.1 AI决策服务需要的数据维度

| 维度 | 说明 | 示例 |
|------|------|------|
| **单股票查询** | 获取指定股票的新闻情报 | `000001.SZ` |
| **批量股票查询** | 一次获取多只股票的情报 | `[000001.SZ, 000002.SZ, ...]` |
| **板块查询** | 获取某个板块下所有相关股票的情报 | `新能源板块` → 所有新能源股票 |
| **行业查询** | 获取某个行业分类下所有股票的情报 | `医药生物` → 医药行业所有股票 |
| **概念查询** | 获取某个概念相关的所有股票情报 | `人工智能` → AI概念股票 |
| **舆情聚合** | 返回微博、论坛等社交媒体舆情 | 包含情感分析、热度评分 |

### 2.2 情报内容要求

每条情报应包含：

```json
{
  "stock_code": "000001.SZ",
  "stock_name": "平安银行",
  "sectors": ["银行", "金融服务"],
  "concepts": ["金融科技", "区块链"],
  "intelligence": {
    "sentiment": "positive",
    "sentiment_score": 0.85,
    "importance": 8,
    "summary": "公司发布业绩预告，净利润同比增长15%",
    "source": "新浪财经",
    "related_news_count": 12
  },
  "social_sentiment": {
    "weibo": {
      "mention_count": 523,
      "sentiment": "neutral",
      "hot_topics": ["银行股", "业绩预增"]
    },
    "forum": {
      "mention_count": 128,
      "sentiment": "positive",
      "discussion_heat": 7.5
    }
  },
  "timestamp": "2026-02-11T10:30:00Z"
}
```

### 2.3 期望的API接口

#### 接口1：多维度情报查询（推荐）

```http
POST /api/v1/intelligence/query
Content-Type: application/json

{
  "query_type": "sector",  // sector | industry | concept | stocks | market
  "query_value": "新能源",  // 板块名称/行业名称/概念名称/股票代码数组
  "filters": {
    "sentiment": ["positive", "neutral"],
    "min_importance": 5,
    "time_range": "24h"
  },
  "include_social": true,
  "limit": 100
}
```

**响应示例**：

```json
{
  "query": {
    "type": "sector",
    "value": "新能源",
    "matched_stocks": 45
  },
  "intelligence_list": [
    {
      "stock_code": "300750.SZ",
      "stock_name": "宁德时代",
      "intelligence": { ... },
      "social_sentiment": { ... }
    }
  ],
  "aggregated": {
    "sector_sentiment": "positive",
    "sector_sentiment_score": 0.72,
    "hot_concepts": ["固态电池", "钠离子电池"],
    "breaking_news_count": 3
  }
}
```

#### 接口2：批量股票情报查询

```http
POST /api/v1/intelligence/batch
Content-Type: application/json

{
  "stock_codes": ["000001.SZ", "000002.SZ", "300750.SZ"],
  "include_social": true,
  "time_range": "24h"
}
```

### 2.4 需要News Service确认的问题

请News Service团队确认以下问题：

| 序号 | 确认项 | 当前状态 | 是否满足 |
|------|--------|----------|----------|
| 1 | 是否支持按板块名称查询？（如"新能源"→返回该板块所有股票情报） | 待确认 | ⬜ |
| 2 | 是否支持按行业名称查询？（如"医药生物"） | 待确认 | ⬜ |
| 3 | 是否支持按概念名称查询？（如"人工智能"） | 待确认 | ⬜ |
| 4 | 微博舆情数据是否已采集并关联到股票？ | 已实现 | ✅ |
| 5 | 论坛数据（雪球、股吧）是否已采集并关联？ | 已实现 | ✅ |
| 6 | 是否支持批量股票代码查询（>50只）？ | 待确认 | ⬜ |
| 7 | 返回数据是否包含板块/行业/概念标签？ | 待确认 | ⬜ |
| 8 | 是否支持聚合统计（如板块整体情感、热点概念）？ | 待确认 | ⬜ |
| 9 | 板块到股票的映射关系由谁维护？ | 待确认 | ⬜ |
| 10 | 查询响应时间是否能控制在<500ms？ | 待确认 | ⬜ |

### 2.5 若不满足的优化建议

如果当前实现不满足上述需求，建议News Service：

1. **增加板块/行业/概念映射表**
   - 维护股票代码到板块、行业、概念的映射关系
   - 可参考同花顺/东方财富的分类标准

2. **实现聚合查询接口**
   - 根据板块/行业/概念查询时，内部解析为股票列表
   - 返回聚合后的情报数据

3. **增加聚合统计功能**
   - 板块整体情感得分
   - 热点概念提取
   - 突发新闻统计

---

## 三、Market Data Service 查询需求确认

### 3.1 AI决策服务需要的数据维度

| 维度 | 说明 | 示例 |
|------|------|------|
| **单股票行情** | 获取指定股票的实时行情 | `000001.SZ` |
| **批量股票行情** | 一次获取多只股票的行情 | `[000001.SZ, 000002.SZ, ...]` |
| **板块行情** | 获取某个板块下所有股票的行情 | `新能源板块` |
| **行业行情** | 获取某个行业下所有股票的行情 | `医药生物` |
| **指数成分股** | 获取某个指数的成分股行情 | `沪深300`, `创业板50` |
| **市值筛选** | 按市值范围筛选股票 | `市值>100亿` |
| **技术指标** | 返回股票的技术分析指标 | MACD、KDJ、RSI等 |

### 3.2 行情内容要求

每只股票行情应包含：

```json
{
  "stock_code": "000001.SZ",
  "stock_name": "平安银行",
  "sector": "银行",
  "industry": "金融服务",
  "market_cap": 250000000000,
  "quote": {
    "current_price": 12.58,
    "change_percent": 2.35,
    "change_amount": 0.29,
    "volume": 152300000,
    "turnover": 1915900000,
    "high": 12.68,
    "low": 12.30,
    "open": 12.35,
    "pre_close": 12.29
  },
  "technical_indicators": {
    "ma5": 12.45,
    "ma10": 12.32,
    "ma20": 12.15,
    "macd": 0.23,
    "rsi": 65.8,
    "kdj_k": 78.5,
    "kdj_d": 72.3
  },
  "market_status": "trading",
  "update_time": "2026-02-11T10:30:00Z"
}
```

### 3.3 期望的API接口

#### 接口1：多维度行情查询（推荐）

```http
POST /api/v1/quotes/query
Content-Type: application/json

{
  "query_type": "sector",  // sector | industry | index | stocks | market | market_cap
  "query_value": "新能源",
  "filters": {
    "min_market_cap": 1000000000,
    "max_change_percent": 10.0,
    "exclude_st": true
  },
  "include_technical": true,
  "indicators": ["ma5", "ma10", "macd", "rsi"],
  "limit": 100
}
```

**响应示例**：

```json
{
  "query": {
    "type": "sector",
    "value": "新能源",
    "matched_stocks": 45
  },
  "quotes": [
    {
      "stock_code": "300750.SZ",
      "stock_name": "宁德时代",
      "market_cap": 850000000000,
      "quote": { ... },
      "technical_indicators": { ... }
    }
  ],
  "aggregated": {
    "sector_avg_change": 2.35,
    "sector_avg_volume": 52000000,
    "leaders": ["300750.SZ", "002594.SZ"],
    "laggards": ["002466.SZ", "300014.SZ"]
  }
}
```

#### 接口2：批量股票行情查询

```http
POST /api/v1/quotes/batch
Content-Type: application/json

{
  "stock_codes": ["000001.SZ", "000002.SZ", "300750.SZ"],
  "include_technical": true,
  "indicators": ["ma5", "ma10", "macd"]
}
```

#### 接口3：指数成分股行情

```http
GET /api/v1/quotes/index/{index_code}?include_technical=true

# 示例：/api/v1/quotes/index/000300.SH  (沪深300)
```

### 3.4 需要Market Data Service确认的问题

请Market Data Service团队确认以下问题：

| 序号 | 确认项 | 当前状态 | 是否满足 |
|------|--------|----------|----------|
| 1 | 是否支持按板块名称查询行情？ | 待确认 | ⬜ |
| 2 | 是否支持按行业名称查询行情？ | 待确认 | ⬜ |
| 3 | 是否支持按指数代码查询成分股行情？（如沪深300） | 待确认 | ⬜ |
| 4 | 是否支持按市值范围筛选股票？ | 待确认 | ⬜ |
| 5 | 是否支持批量查询（>100只股票）？ | 已实现（分块100只/批） | ✅ |
| 6 | 是否返回板块/行业标签？ | 待确认 | ⬜ |
| 7 | 是否支持返回技术指标（MACD、RSI等）？ | 待确认 | ⬜ |
| 8 | 是否支持聚合统计（板块平均涨跌幅、龙头股等）？ | 待确认 | ⬜ |
| 9 | 板块/行业到股票的映射关系由谁维护？ | 待确认 | ⬜ |
| 10 | 查询响应时间是否能控制在<500ms？ | 待确认 | ⬜ |

### 3.5 若不满足的优化建议

如果当前实现不满足上述需求，建议Market Data Service：

1. **增加板块/行业/指数映射表**
   - 维护股票代码到板块、行业、指数的映射关系
   - 可与News Service共享分类数据

2. **实现聚合查询接口**
   - 根据板块/行业/指数查询时，内部解析为股票列表
   - 返回聚合后的行情数据

3. **增加技术指标计算**
   - 基于K线数据实时计算常用技术指标
   - 或预计算后缓存

4. **优化批量查询性能**
   - 现有100只/批的限制是否可放宽到200只？
   - 多只股票查询时并行化处理

---

## 四、响应要求

### 4.1 请两个服务团队完成以下检查

**News Service 负责人请完成：**

- [ ] 阅读本需求文档，确认理解需求
- [ ] 检查现有 `api/multi_dimension_api.py` 和 `api/batch_intelligence_api.py` 是否已满足2.4节的10个确认项
- [ ] 如不满足，请在TODO.md中添加优化任务
- [ ] 在本文档2.4节表格中填写"当前状态"和"是否满足"列
- [ ] 如有需要，提供预计完成时间

**Market Data Service 负责人请完成：**

- [ ] 阅读本需求文档，确认理解需求
- [ ] 检查现有 `api/routes.py` 中的批量查询接口是否已满足3.4节的10个确认项
- [ ] 如不满足，请在TODO.md中添加优化任务
- [ ] 在本文档3.4节表格中填写"当前状态"和"是否满足"列
- [ ] 如有需要，提供预计完成时间

### 4.2 建议的协调事项

两个服务需要协调一致的事项：

| 协调项 | 建议方案 | 负责方 |
|--------|----------|--------|
| **板块定义标准** | 统一使用申万行业分类或同花顺概念 | 双方协商 |
| **行业定义标准** | 统一使用证监会行业分类 | 双方协商 |
| **股票代码格式** | 统一使用 `{code}.{exchange}` 格式（如000001.SZ） | 双方遵循 |
| **映射关系维护** | 可共享一个股票分类数据服务/表 | 提议方 |
| **响应时间SLA** | 都承诺<500ms（95分位） | 双方承诺 |

### 4.3 时间节点建议

| 里程碑 | 建议日期 | 说明 |
|--------|----------|------|
| 需求确认完成 | 2026-02-13 | 两个服务确认是否满足需求 |
| 缺口分析完成 | 2026-02-14 | 明确哪些需求需要开发 |
| 优化方案评审 | 2026-02-15 | 评审优化方案设计 |
| 开发完成 | 2026-02-18 | 完成广度查询接口开发 |
| 联调测试 | 2026-02-19 | AI决策服务联调验证 |

---

## 五、附录

### 5.1 参考数据来源

**板块/行业分类数据来源建议：**

| 来源 | 优点 | 缺点 |
|------|------|------|
| **同花顺iFinD** | 概念分类丰富，更新及时 | 需要付费API |
| **东方财富Choice** | 免费，分类较全 | 概念定义可能不同 |
| **申万行业分类** | 行业标准，权威 | 更新较慢 |
| **证监会行业分类** | 官方标准 | 分类较粗 |

**建议：初期可使用东方财富免费分类数据，后续可接入付费数据源。**

### 5.2 相关文档

- [News Service TODO](../modules/news-service/TODO.md)
- [News Service HAVE_DONE](../modules/news-service/HAVE_DONE.md)
- [Market Data Service TODO](../modules/market-data-service/TODO.md)
- [Market Data Service HAVE_DONE](../modules/market-data-service/HAVE_DONE.md)
- [统一数据平台架构](./UNIFIED_DATA_PLATFORM_ARCHITECTURE.md)

---

*文档版本: v1.0*
*创建日期: 2026-02-11*
*需求方: Trading AI Service*
*协调方: 首席架构师*
