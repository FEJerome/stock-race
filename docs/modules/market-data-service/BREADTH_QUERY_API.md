# Market Data Service - 广度查询API文档

> 本文档定义 Market Data Service 的板块/行业/指数广度查询接口。
> 供 Trading AI Service、Frontend、Miniprogram 等消费方参考联调。
> 最后更新：2026-02-12

---

## 目录

1. [概述](#概述)
2. [API端点列表](#api端点列表)
3. [板块查询API](#板块查询api)
4. [行业查询API](#行业查询api)
5. [指数成分股查询API](#指数成分股查询api)
6. [分类列表API](#分类列表api)
7. [股票分类查询API](#股票分类查询api)
8. [错误处理](#错误处理)
9. [调用示例](#调用示例)

---

## 概述

广度查询API提供按多维度分类查询股票行情的能力，支持：

- **板块查询**: 按板块分类查询股票（金融、科技、消费等）
- **行业查询**: 按行业分类查询股票（银行、软件、零售等）
- **指数查询**: 查询指数成分股及权重（沪深300、上证50等）
- **智能排序**: 支持按市值、价格、涨跌幅、成交量排序

---

## API端点列表

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/market/sector/{sector}/quotes` | GET | 板块行情查询 (C6-004) |
| `/api/v1/market/industry/{industry}/quotes` | GET | 行业行情查询 (C6-005) |
| `/api/v1/market/index/{index}/components` | GET | 指数成分股查询 (C6-006) |
| `/api/v1/market/sectors` | GET | 板块列表查询 (C6-007) |
| `/api/v1/market/industries` | GET | 行业列表查询 (C6-007) |
| `/api/v1/stocks/{symbol}/classification` | GET | 股票分类查询 (C6-007) |

**基础URL**:
- 开发环境: `http://localhost:8001`
- 生产环境: `https://market-data.example.com`

---

## 板块查询API

### GET /api/v1/market/sector/{sector}/quotes

获取指定板块内所有股票的实时行情。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sector` | string | 是 | 板块代码，如 `financial`, `technology` |

#### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `skip` | int | 否 | 0 | 跳过记录数（分页） |
| `limit` | int | 否 | 50 | 返回记录数（1-100） |
| `sort_by` | string | 否 | `market_cap` | 排序字段：`market_cap`/`price`/`change_percent`/`volume` |
| `sort_order` | string | 否 | `desc` | 排序方向：`asc`/`desc` |

#### 支持的板块代码

| 板块代码 | 中文名称 | 说明 |
|---------|---------|------|
| `financial` | 金融 | 银行、保险、证券等 |
| `technology` | 科技 | 软件、硬件、半导体等 |
| `consumer` | 消费 | 零售、食品饮料、家电等 |
| `healthcare` | 医疗健康 | 制药、医疗器械、医疗服务等 |
| `energy` | 能源 | 石油、天然气、煤炭等 |
| `materials` | 原材料 | 化工、金属、建材等 |
| `industrials` | 工业 | 机械制造、交通运输等 |
| `utilities` | 公用事业 | 电力、水务、燃气等 |
| `realestate` | 房地产 | 房地产开发、物业管理等 |
| `communication` | 通信 | 电信服务、通信设备等 |

#### 响应示例

```json
{
  "sector": "financial",
  "quotes": [
    {
      "symbol": "000001.SZ",
      "name": "平安银行",
      "price": 12.58,
      "change": 0.52,
      "change_percent": 4.31,
      "volume": 152345678,
      "amount": 1916500000,
      "market_cap": 250000000000,
      "open": 12.10,
      "high": 12.85,
      "low": 12.05,
      "prev_close": 12.06,
      "timestamp": "2026-02-12T10:00:00.000000"
    },
    {
      "symbol": "600000.SH",
      "name": "浦发银行",
      "price": 8.92,
      "change": 0.18,
      "change_percent": 2.06,
      "volume": 89345621,
      "amount": 796962000,
      "market_cap": 180000000000,
      "open": 8.75,
      "high": 9.05,
      "low": 8.70,
      "prev_close": 8.74,
      "timestamp": "2026-02-12T10:00:00.000000"
    }
  ],
  "count": 2,
  "skip": 0,
  "limit": 50,
  "timestamp": "2026-02-12T10:00:00.000000"
}
```

#### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `sector` | string | 板块代码 |
| `quotes` | array | 股票行情列表 |
| `quotes[].symbol` | string | 股票代码 |
| `quotes[].name` | string | 股票名称 |
| `quotes[].price` | float | 当前价格 |
| `quotes[].change` | float | 涨跌额 |
| `quotes[].change_percent` | float | 涨跌幅百分比 |
| `quotes[].volume` | int | 成交量（股） |
| `quotes[].amount` | float | 成交额（元） |
| `quotes[].market_cap` | float | 市值（元） |
| `quotes[].open` | float | 开盘价 |
| `quotes[].high` | float | 最高价 |
| `quotes[].low` | float | 最低价 |
| `quotes[].prev_close` | float | 昨收价 |
| `quotes[].timestamp` | string | 时间戳 |
| `count` | int | 返回记录数 |
| `skip` | int | 跳过记录数 |
| `limit` | int | 请求记录数 |
| `timestamp` | string | 响应时间戳 |

---

## 行业查询API

### GET /api/v1/market/industry/{industry}/quotes

获取指定行业内所有股票的实时行情。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `industry` | string | 是 | 行业代码，如 `banking`, `software` |

#### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `skip` | int | 否 | 0 | 跳过记录数（分页） |
| `limit` | int | 否 | 50 | 返回记录数（1-100） |
| `sort_by` | string | 否 | `market_cap` | 排序字段 |
| `sort_order` | string | 否 | `desc` | 排序方向 |

#### 支持的行业代码

| 行业代码 | 中文名称 | 所属板块 |
|---------|---------|---------|
| `banking` | 银行 | financial |
| `insurance` | 保险 | financial |
| `securities` | 证券 | financial |
| `software` | 软件 | technology |
| `hardware` | 硬件 | technology |
| `semiconductor` | 半导体 | technology |
| `retail` | 零售 | consumer |
| `food_beverage` | 食品饮料 | consumer |
| `healthcare` | 医疗保健 | healthcare |
| `pharmaceutical` | 制药 | healthcare |
| `oil_gas` | 石油天然气 | energy |
| `chemicals` | 化工 | materials |
| `metals` | 金属 | materials |
| `machinery` | 机械制造 | industrials |
| `electric_power` | 电力 | utilities |
| `real_estate` | 房地产 | realestate |
| `telecom` | 电信 | communication |

#### 响应示例

```json
{
  "industry": "banking",
  "quotes": [
    {
      "symbol": "000001.SZ",
      "name": "平安银行",
      "price": 12.58,
      "change": 0.52,
      "change_percent": 4.31,
      "volume": 152345678,
      "amount": 1916500000,
      "market_cap": 250000000000,
      "open": 12.10,
      "high": 12.85,
      "low": 12.05,
      "prev_close": 12.06,
      "timestamp": "2026-02-12T10:00:00.000000"
    }
  ],
  "count": 1,
  "skip": 0,
  "limit": 50,
  "timestamp": "2026-02-12T10:00:00.000000"
}
```

---

## 指数成分股查询API

### GET /api/v1/market/index/{index}/components

获取指定指数的成分股列表及权重信息。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `index` | string | 是 | 指数代码，如 `000001.SH`, `000300.SH` |

#### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `include_quotes` | bool | 否 | `true` | 是否包含实时行情 |
| `skip` | int | 否 | 0 | 跳过记录数（分页） |
| `limit` | int | 否 | 50 | 返回记录数（1-100） |

#### 支持的指数代码

| 指数代码 | 中文名称 | 成分股数量 |
|---------|---------|-----------|
| `000001.SH` | 上证指数 | 全部A股 |
| `000300.SH` | 沪深300 | 300 |
| `000016.SH` | 上证50 | 50 |
| `000905.SH` | 中证500 | 500 |
| `399001.SZ` | 深证成指 | 500 |
| `399006.SZ` | 创业板指 | 100 |
| `000688.SH` | 科创50 | 50 |
| `000010.SH` | 上证180 | 180 |

#### 响应示例

```json
{
  "index": "000300.SH",
  "components": [
    {
      "symbol": "000001.SZ",
      "name": "平安银行",
      "weight": 0.85,
      "rank": 15,
      "quote": {
        "price": 12.58,
        "change": 0.52,
        "change_percent": 4.31,
        "volume": 152345678,
        "amount": 1916500000,
        "open": 12.10,
        "high": 12.85,
        "low": 12.05,
        "prev_close": 12.06,
        "timestamp": "2026-02-12T10:00:00.000000"
      }
    },
    {
      "symbol": "600000.SH",
      "name": "浦发银行",
      "weight": 0.62,
      "rank": 28,
      "quote": {
        "price": 8.92,
        "change": 0.18,
        "change_percent": 2.06,
        "volume": 89345621,
        "amount": 796962000,
        "open": 8.75,
        "high": 9.05,
        "low": 8.70,
        "prev_close": 8.74,
        "timestamp": "2026-02-12T10:00:00.000000"
      }
    }
  ],
  "count": 2,
  "skip": 0,
  "limit": 50,
  "timestamp": "2026-02-12T10:00:00.000000"
}
```

#### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `index` | string | 指数代码 |
| `components` | array | 成分股列表 |
| `components[].symbol` | string | 股票代码 |
| `components[].name` | string | 股票名称 |
| `components[].weight` | float | 成分股权重（%） |
| `components[].rank` | int | 权重排名 |
| `components[].quote` | object | 实时行情（`include_quotes=true`时返回） |
| `count` | int | 返回记录数 |
| `skip` | int | 跳过记录数 |
| `limit` | int | 请求记录数 |
| `timestamp` | string | 响应时间戳 |

---

## 分类列表API

### GET /api/v1/market/sectors

获取所有可用的板块列表。

#### 响应示例

```json
{
  "sectors": [
    {
      "code": "financial",
      "name": "金融",
      "name_en": "Financials",
      "stock_count": 85
    },
    {
      "code": "technology",
      "name": "科技",
      "name_en": "Technology",
      "stock_count": 156
    },
    {
      "code": "consumer",
      "name": "消费",
      "name_en": "Consumer",
      "stock_count": 124
    }
  ],
  "count": 3,
  "timestamp": "2026-02-12T10:00:00.000000"
}
```

---

### GET /api/v1/market/industries

获取所有可用的行业列表，支持按板块筛选。

#### 查询参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `sector` | string | 否 | - | 按板块代码筛选 |

#### 响应示例

```json
{
  "industries": [
    {
      "code": "banking",
      "name": "银行",
      "name_en": "Banking",
      "sector": "financial",
      "stock_count": 42
    },
    {
      "code": "insurance",
      "name": "保险",
      "name_en": "Insurance",
      "sector": "financial",
      "stock_count": 8
    },
    {
      "code": "software",
      "name": "软件",
      "name_en": "Software",
      "sector": "technology",
      "stock_count": 68
    }
  ],
  "count": 3,
  "sector_filter": "financial",
  "timestamp": "2026-02-12T10:00:00.000000"
}
```

---

## 股票分类查询API

### GET /api/v1/stocks/{symbol}/classification

获取指定股票的分类信息（板块、行业、概念标签）。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `symbol` | string | 是 | 股票代码，如 `000001.SZ` |

#### 响应示例

```json
{
  "symbol": "000001.SZ",
  "name": "平安银行",
  "sector": {
    "code": "financial",
    "name": "金融"
  },
  "industry": {
    "code": "banking",
    "name": "银行"
  },
  "concepts": [
    {
      "code": "fintech",
      "name": "金融科技"
    },
    {
      "code": "retail_banking",
      "name": "零售银行"
    },
    {
      "code": "dividend",
      "name": "高分红"
    }
  ],
  "indices": [
    {
      "code": "000300.SH",
      "name": "沪深300",
      "weight": 0.85
    },
    {
      "code": "000016.SH",
      "name": "上证50",
      "weight": 1.2
    }
  ],
  "timestamp": "2026-02-12T10:00:00.000000"
}
```

#### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `symbol` | string | 股票代码 |
| `name` | string | 股票名称 |
| `sector` | object | 所属板块 |
| `sector.code` | string | 板块代码 |
| `sector.name` | string | 板块名称 |
| `industry` | object | 所属行业 |
| `industry.code` | string | 行业代码 |
| `industry.name` | string | 行业名称 |
| `concepts` | array | 概念标签列表 |
| `concepts[].code` | string | 概念代码 |
| `concepts[].name` | string | 概念名称 |
| `indices` | array | 所属指数列表 |
| `indices[].code` | string | 指数代码 |
| `indices[].name` | string | 指数名称 |
| `indices[].weight` | float | 在指数中的权重（%） |
| `timestamp` | string | 响应时间戳 |

---

## 错误处理

### 错误响应格式

```json
{
  "detail": "错误描述信息"
}
```

### HTTP状态码

| 状态码 | 说明 | 场景 |
|--------|------|------|
| `200` | 成功 | 请求成功处理 |
| `400` | 请求参数错误 | 参数格式不正确或缺失 |
| `404` | 资源不存在 | 板块/行业/股票不存在 |
| `422` | 验证错误 | 参数值不符合要求 |
| `500` | 服务器错误 | 服务器内部错误 |

### 常见错误

| 错误信息 | 说明 | 处理建议 |
|---------|------|---------|
| `Sector not found: xxx` | 板块不存在 | 检查板块代码是否正确 |
| `Industry not found: xxx` | 行业不存在 | 检查行业代码是否正确 |
| `Index not found: xxx` | 指数不存在 | 检查指数代码是否正确 |
| `Symbol not found: xxx` | 股票不存在 | 检查股票代码是否正确 |
| `Invalid sort_by parameter` | 排序字段无效 | 使用支持的排序字段 |

---

## 调用示例

### cURL 示例

#### 查询金融板块行情

```bash
curl -X GET "http://localhost:8001/api/v1/market/sector/financial/quotes?limit=10&sort_by=market_cap&sort_order=desc" \
  -H "Content-Type: application/json"
```

#### 查询银行行业行情

```bash
curl -X GET "http://localhost:8001/api/v1/market/industry/banking/quotes?skip=0&limit=20" \
  -H "Content-Type: application/json"
```

#### 查询沪深300成分股

```bash
curl -X GET "http://localhost:8001/api/v1/market/index/000300.SH/components?include_quotes=true&limit=50" \
  -H "Content-Type: application/json"
```

#### 查询板块列表

```bash
curl -X GET "http://localhost:8001/api/v1/market/sectors" \
  -H "Content-Type: application/json"
```

#### 查询股票分类

```bash
curl -X GET "http://localhost:8001/api/v1/stocks/000001.SZ/classification" \
  -H "Content-Type: application/json"
```

### Python 示例

```python
import requests

BASE_URL = "http://localhost:8001"

# 查询金融板块行情
def get_sector_quotes(sector, limit=50, sort_by="market_cap"):
    url = f"{BASE_URL}/api/v1/market/sector/{sector}/quotes"
    params = {
        "limit": limit,
        "sort_by": sort_by,
        "sort_order": "desc"
    }
    response = requests.get(url, params=params)
    return response.json()

# 查询沪深300成分股
def get_index_components(index_code, include_quotes=True):
    url = f"{BASE_URL}/api/v1/market/index/{index_code}/components"
    params = {
        "include_quotes": include_quotes,
        "limit": 100
    }
    response = requests.get(url, params=params)
    return response.json()

# 使用示例
sector_data = get_sector_quotes("financial", limit=10)
print(f"金融板块股票数: {sector_data['count']}")
for quote in sector_data['quotes']:
    print(f"{quote['symbol']}: {quote['name']} - ¥{quote['price']}")

index_data = get_index_components("000300.SH")
print(f"\n沪深300成分股数: {index_data['count']}")
for component in index_data['components']:
    print(f"{component['symbol']}: 权重 {component['weight']}%")
```

### JavaScript/TypeScript 示例

```typescript
const BASE_URL = 'http://localhost:8001';

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap: number;
}

interface SectorQuotesResponse {
  sector: string;
  quotes: Quote[];
  count: number;
}

// 查询板块行情
async function getSectorQuotes(
  sector: string,
  limit: number = 50,
  sortBy: string = 'market_cap'
): Promise<SectorQuotesResponse> {
  const url = new URL(`${BASE_URL}/api/v1/market/sector/${sector}/quotes`);
  url.searchParams.append('limit', limit.toString());
  url.searchParams.append('sort_by', sortBy);
  url.searchParams.append('sort_order', 'desc');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// 查询指数成分股
async function getIndexComponents(
  indexCode: string,
  includeQuotes: boolean = true
) {
  const url = new URL(`${BASE_URL}/api/v1/market/index/${indexCode}/components`);
  url.searchParams.append('include_quotes', includeQuotes.toString());

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// 使用示例
async function main() {
  try {
    const sectorData = await getSectorQuotes('technology', 10);
    console.log(`科技板块股票数: ${sectorData.count}`);
    sectorData.quotes.forEach(quote => {
      console.log(`${quote.symbol}: ${quote.name} - ¥${quote.price}`);
    });

    const indexData = await getIndexComponents('000300.SH');
    console.log(`\n沪深300成分股数: ${indexData.count}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

---

## 附录

### A. 缓存策略

广度查询API使用Redis缓存，缓存时间如下：

| API | 缓存时间 | 说明 |
|-----|---------|------|
| 板块行情 | 300秒 | 实时性要求高，较短缓存 |
| 行业行情 | 300秒 | 实时性要求高，较短缓存 |
| 指数成分股 | 300秒 | 成分股变化较少，但权重变化需要及时反映 |
| 板块列表 | 3600秒 | 板块列表变化极少 |
| 行业列表 | 3600秒 | 行业列表变化极少 |
| 股票分类 | 3600秒 | 分类信息变化较少 |

### B. 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 响应时间 | < 200ms | P95响应时间 |
| 并发请求 | 1000 QPS | 单节点支持 |
| 数据新鲜度 | < 5分钟 | 缓存数据最大年龄 |

### C. 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-02-12 | v1.0 | 初始版本，定义广度查询API |

### D. 相关文档

- [EVENT_INTERFACE.md](./EVENT_INTERFACE.md) - 事件接口文档
- [WEBSOCKET_INTERFACE.md](./WEBSOCKET_INTERFACE.md) - WebSocket接口文档
- [TODO.md](./TODO.md) - 开发进度
- [HAVE_DONE.md](./HAVE_DONE.md) - 已完成功能

---

*文档版本: v1.0*
*最后更新: 2026-02-12*
*维护者: Market Data Service 开发团队*
