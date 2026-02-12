# 后端API问题追踪文档

**文档用途**: 供后端智能体修复API问题参考

**创建时间**: 2026-02-09

---

## 问题分类汇总

### 1. 服务器错误 (500 INTERNAL_ERROR)

| 序号 | API端点 | HTTP方法 | 前端调用位置 | 错误信息 | 优先级 | 状态 |
|------|---------|----------|--------------|----------|--------|------|
| 1 | `/stocks/realtime/batch` | POST | market.service.ts:46 | `res.validationError is not a function` | 🔴 紧急 | ✅ 已修复 |

### 2. 服务器错误 (500 INTERNAL_ERROR) - 新增

| 序号 | API端点 | HTTP方法 | 前端调用位置 | 错误信息 | 优先级 | 状态 |
|------|---------|----------|--------------|----------|--------|------|
| 4 | `/stocks/{symbol}` | GET | E2E测试 | `Cannot read properties of undefined (reading 'map')` | 🔴 紧急 | ✅ 已修复 |

### 3. 端点不存在或路由冲突 (404 NOT_FOUND)

| 序号 | API端点 | HTTP方法 | 前端调用位置 | 错误信息 | 优先级 | 状态 |
|------|---------|----------|--------------|----------|--------|------|
| 2 | `/stocks/search` | GET | market.service.ts:79 | 参数名称不匹配（前端用`keyword`，后端用`q`） | 🟡 高 | ✅ 已修复 |
| 3 | `/stocks/rankings` | GET | market.service.ts:92 | 路由顺序问题 | 🟡 高 | ✅ 已验证（路由顺序正确） |
| 5 | `/stocks/{symbol}/kline` | GET | market.service.ts:105 | 端点不存在 | 🟡 中 | ⏳ 待实现 |
| 6 | `/market/status` | GET | market-status.service.ts | 已存在，工作正常 | - | ✅ 正常 |
| 7 | `/market/realtime` | GET | 测试中 | 端点不存在 | 🟢 中 | ⏳ 待实现 |
| 8 | `/market/history` | GET | 测试中 | 端点不存在 | 🟢 中 | ⏳ 待实现 |
| 9 | `/rankings/returns` | GET | 测试中 | 端点不存在 | 🟢 中 | ⏳ 待实现 |
| 10 | `/rankings/comprehensive` | GET | 测试中 | 端点不存在 | 🟢 中 | ⏳ 待实现 |
| 11 | `/admin/status` | GET | 测试中 | 端点不存在 | ⚪ 低 | ⏳ 待实现 |
| 12 | `/admin/users` | GET | 测试中 | 端点不存在 | ⚪ 低 | ⏳ 待实现 |

### 2. 需要认证的API (401 - 工作正常)

以下API需要认证，返回401是预期行为：

| 序号 | API端点 | HTTP方法 | 说明 |
|------|---------|----------|------|
| 1 | `/ai-accounts` | GET | 获取AI账户列表 |
| 2 | `/ai-accounts` | POST | 创建AI账户 |
| 3 | `/ai-accounts/{id}` | GET | 获取AI账户详情 |
| 4 | `/ai-accounts/{id}` | DELETE | 删除AI账户 |
| 5 | `/trades` | GET | 获取交易列表 |
| 6 | `/trades` | POST | 执行交易 |
| 7 | `/trades/{id}` | GET | 获取交易详情 |
| 8 | `/portfolios` | GET | 获取持仓列表 |
| 9 | `/portfolios/{id}` | GET | 获取持仓详情 |
| 10 | `/portfolios/stats` | GET | 获取收益统计 |
| 11 | `/portfolios/profit-curve` | GET | 获取收益曲线 |

### 3. 工作正常的API

| 序号 | API端点 | HTTP方法 | 说明 |
|------|---------|----------|------|
| 1 | `/health` | GET | 系统健康检查 |
| 2 | `/auth/login` | POST | 用户登录 |
| 3 | `/auth/logout` | POST | 用户登出 |
| 4 | `/stocks` | GET | 获取股票列表 |
| 5 | `/stocks/{symbol}` | GET | 获取股票详情 |
| 6 | `/market/status` | GET | 获取市场状态 |

---

## 详细问题说明

### 问题 #1: `/stocks/realtime/batch` 服务器错误

**前端调用**:
```typescript
// market.service.ts:46
const response = await api.post<Stock[]>('/stocks/realtime/batch', {
  symbols: symbols.join(',')
});
```

**当前状态**: 500 INTERNAL_ERROR

**错误详情**:
```
TypeError: res.validationError is not a function
    at StockController.batchGetRealtime (backend/src/utils/responseFormatter.js:205:13)
```

**根本原因**:
- 控制器中调用了 `res.validationError()` 方法
- 但该方法未在响应对象上定义

**修复方案**:
1. 在 `backend/src/utils/responseFormatter.js` 中定义 `validationError` 方法
2. 或在控制器中使用标准的错误返回方式：`res.status(400).json({...})`

### 问题 #2: `/stocks/search` 返回400错误

**前端调用**:
```typescript
// market.service.ts:79
const response = await api.get<{ stocks: StockSearchResult[] }>(
  '/stocks/search',
  { params: { keyword: term } }
);
```

**当前状态**: 400 Bad Request，无响应体

**可能原因**:
1. 缺少查询参数验证
2. 参数名称不匹配（前端用`keyword`，后端可能用`q`或`query`）

**建议实现**:
```javascript
GET /api/stocks/search?keyword=平安
响应: { success: true, data: { stocks: [...], count: 10, searchTerm: "平安" } }
```

### 问题 #3: `/stocks/rankings` 路由冲突

**前端调用**:
```typescript
// market.service.ts:92
const response = await api.get<{ rankings: Stock[] }>('/stocks/rankings');
```

**当前状态**: 404 STOCK_NOT_FOUND

**错误信息**: `股票 rankings 不存在`

**根本原因**:
- 路由 `/stocks/:symbol` 在 `/stocks/rankings` 之前定义
- Express 将 `rankings` 解析为股票代码 `symbol` 参数

**修复方案**:
在 `backend/src/routes/stocks.js` 中调整路由顺序：
```javascript
// 先定义固定路由
router.get('/rankings', stockController.getStockRankings);
router.get('/search', stockController.searchStocks);

// 最后定义参数路由
router.get('/:symbol', stockController.getStockBySymbol);
router.get('/:symbol/kline', stockController.getKlineData);
```

### 问题 #4-6: 其他端点缺失

**缺失端点**:
- `/stocks/rankings` - 获取股票排行榜
- `/stocks/{symbol}/kline` - 获取K线数据

**前端使用**:
- 排行榜页面显示热门股票排行
- 股票详情页显示K线图

**建议实现**:
```javascript
// 排行榜
GET /api/stocks/rankings?type=volume|gain|loss&limit=20
响应: { success: true, data: { rankings: [...] } }

// K线数据
GET /api/stocks/{symbol}/kline?period=1d&start=xxx&end=xxx
响应: { success: true, data: { kline: [...] } }
```

### 问题 #6-9: 市场数据和排行榜端点缺失

**缺失端点**:
- `/market/realtime` - 市场实时数据
- `/market/history` - 市场历史数据
- `/rankings/returns` - 收益率排行
- `/rankings/comprehensive` - 综合排行

**建议实现**:
```javascript
GET /api/market/realtime
响应: { success: true, data: { indices: [...], sectors: [...] } }

GET /api/market/history?symbol=000001
响应: { success: true, data: { history: [...] } }

GET /api/rankings/returns?period=daily|weekly|monthly
响应: { success: true, data: { rankings: [...] } }

GET /api/rankings/comprehensive
响应: { success: true, data: { rankings: [...] } }
```

---

## 修复优先级

### 🔴 紧急（导致500错误）

1. **POST /stocks/realtime/batch** - `res.validationError is not a function` 错误
   - 文件: `backend/src/controllers/StockController.js`
   - 需要: 修复响应方法调用或使用标准错误返回

### 🟠 高优先级（核心功能缺失）

2. **GET /stocks/rankings** - 路由冲突导致无法访问
   - 文件: `backend/src/routes/stocks.js`
   - 需要: 调整路由顺序，将 `/rankings` 放在 `/:symbol` 之前
3. **GET /stocks/search** - 返回400错误
   - 文件: `backend/src/controllers/StockController.js`
   - 需要: 实现搜索逻辑或修复参数解析

### 🟡 中优先级（影响用户体验）

4. **GET /stocks/{symbol}/kline** - K线数据缺失
5. **GET /market/realtime** - 市场实时数据缺失
6. **GET /rankings/returns** - 收益率排行缺失

### 🟢 低优先级（增强功能）

7. **GET /market/history** - 市场历史数据缺失
8. **GET /rankings/comprehensive** - 综合排行缺失
9. **GET /admin/status** - 系统状态（管理功能）
10. **GET /admin/users** - 用户列表（管理功能）

---

## 后端智能体修复指南

### 1. 修复 `/stocks/realtime/batch` 500错误

**问题**: `res.validationError is not a function`

**查看文件**: `backend/src/utils/responseFormatter.js`

**修复方案**:
```javascript
// 在 responseFormatter.js 中添加 validationError 方法
export const createResponseFormatter = (req, res, next) => {
  // ... 现有代码 ...

  // 添加 validationError 方法
  res.validationError = (message, details = {}) => {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message,
        details
      },
      message: '请求参数验证失败',
      timestamp: new Date().toISOString()
    });
  };

  next();
};
```

**或者**在控制器中改为使用标准错误返回：
```javascript
// StockController.js
if (!symbols || symbols.length === 0) {
  // 改为：
  return res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: '股票代码列表不能为空'
    },
    message: '请求参数验证失败'
  });
}
```

### 2. 修复路由顺序问题

**查看文件**: `backend/src/routes/stocks.js`

**当前问题**: `/:symbol` 路由在 `/rankings` 之前定义

**修复方案**:
```javascript
import express from 'express';
const router = express.Router();

// ✅ 正确的顺序：先固定路由，后参数路由

// 固定路由
router.post('/realtime/batch', stockController.getBatchRealtimeQuotes);
router.get('/search', stockController.searchStocks);
router.get('/rankings', stockController.getStockRankings);

// 参数路由
router.get('/:symbol', stockController.getStockBySymbol);
router.get('/:symbol/kline', stockController.getKlineData);
router.get('/:symbol/quotes', stockController.getStockQuotes);

export default router;
```

### 2. 查看现有控制器

查看文件：`backend/src/controllers/` 目录下的控制器

需要添加或完善以下控制器方法：
- `StockController.getBatchRealtimeQuotes`
- `StockController.searchStocks`
- `StockController.getStockRankings`
- `StockController.getKlineData`
- `MarketController.getRealtimeData`
- `RankingController.getReturnsRanking`
- `RankingController.getComprehensiveRanking`

### 3. 数据服务集成

某些端点可能需要集成数据服务（data-service）获取实时数据：
- 数据服务地址: `http://localhost:8001`
- 可用端点: 查看 `data-service/src/data_service/api/routes.py`

---

## 测试验证步骤

修复后，使用以下命令验证：

```bash
# 测试股票搜索
curl "http://localhost:3001/api/stocks/search?keyword=平安"

# 测试批量获取行情
curl -X POST "http://localhost:3001/api/stocks/realtime/batch" \
  -H "Content-Type: application/json" \
  -d '{"symbols": "000001,000002"}'

# 测试排行榜
curl "http://localhost:3001/api/stocks/rankings"

# 测试K线数据
curl "http://localhost:3001/api/stocks/000001/kline"
```

---

## 相关文档

- [API测试报告](./E2E_TEST_REPORT.md)
- [后端代码地图](../../docs/architecture/CODE_MAP.md)
- [API接口规范](../../docs/architecture/API_SPECIFICATION.md)

---

## 修复记录

### 2026-02-09 修复记录 (第一批)

**修复者**: 首席架构师

**已修复问题**:

1. **✅ POST /stocks/realtime/batch 500错误**
   - **问题**: `res.validationError is not a function`
   - **修复文件**: `backend/src/utils/responseFormatter.js`
   - **修复内容**: 在响应格式化中间件中添加了 `res.validationError` 方法
   - **验证命令**:
     ```bash
     curl -X POST http://localhost:3001/api/stocks/realtime/batch \
       -H "Content-Type: application/json" \
       -d '{"stockCodes": ["000001", "000002"]}'
     ```

2. **✅ GET /stocks/search 400错误**
   - **问题**: 前端使用 `keyword` 参数，后端使用 `q` 参数
   - **修复文件**: `backend/src/controllers/StockController.js`
   - **修复内容**: 修改 `searchStocks` 方法，同时支持 `keyword` 和 `q` 两种参数名
   - **验证命令**:
     ```bash
     curl "http://localhost:3001/api/stocks/search?keyword=%E5%B9%B3%E5%AE%89"
     ```

3. **✅ GET /stocks/rankings 路由冲突**
   - **问题**: 担心路由 `/stocks/:symbol` 在 `/stocks/rankings` 之前定义
   - **验证结果**: 路由顺序正确（`/rankings` 在 `/:symbol` 之前），无需修改
   - **验证命令**:
     ```bash
     curl "http://localhost:3001/api/stocks/rankings"
     ```

**测试状态**: 所有修复的API均已验证通过

### 2026-02-09 修复记录 (第二批 - 根据V2报告)

**修复者**: 首席架构师

**已修复问题**:

4. **✅ GET /stocks/{symbol} 500错误**
   - **问题**: `Cannot read properties of undefined (reading 'map')`
   - **位置**: `backend/src/controllers/StockController.js:108`
   - **修复文件**: `backend/src/controllers/StockController.js`
   - **修复内容**: 在访问 `stock.portfolios` 和 `stock.trades` 时添加空值保护 `(stock.portfolios || [])`
   - **验证命令**:
     ```bash
     curl "http://localhost:3001/api/stocks/000001"
     ```
   - **验证结果**: ✅ 返回200成功响应

**测试状态**: 已验证通过

---

**文档维护**: 后端智能体修复完成后，请更新此文档标记已修复的问题。
