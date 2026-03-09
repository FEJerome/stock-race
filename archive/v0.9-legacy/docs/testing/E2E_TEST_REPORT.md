# 前端端到端API测试报告

**测试时间**: 2026-02-09 18:18:44

**测试目标**: 验证所有后端API功能是否正常

---

## 1. 系统健康检查

### 测试 #1: 系统健康检查

- **方法**: GET
- **端点**: /health
- **状态码**: 200
- **结果**: 通过

## 2. 认证API测试

### 测试 #2: 用户登录 (正确凭据)

- **方法**: POST
- **端点**: /auth/login
- **请求体**: `{"username":"admin","password":"admin123"}`
- **状态码**: 200
- **结果**: 通过

### 测试 #3: 用户登录 (错误凭据)

- **方法**: POST
- **端点**: /auth/login
- **请求体**: `{"username":"admin","password":"wrong"}`
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #4: 获取当前用户 (未认证)

- **方法**: GET
- **端点**: /auth/me
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #5: 用户登出

- **方法**: POST
- **端点**: /auth/logout
- **状态码**: 200
- **结果**: 通过

## 3. 股票数据API测试

### 测试 #6: 获取股票列表

- **方法**: GET
- **端点**: /stocks
- **状态码**: 200
- **结果**: 通过

### 测试 #7: 获取股票详情

- **方法**: GET
- **端点**: /stocks/000001
- **状态码**: 500
- **结果**: 失败
- **响应**: `{"success":false,"error":{"code":"INTERNAL_ERROR","message":"Cannot read properties of undefined (reading 'map')","details":{"stack":"TypeError: Cannot read properties of undefined (reading 'map')\n    at file:///home/fe-jerome/projects/stock-race/backend/src/controllers/StockController.js:108:36\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)\n    at async StockController.getStockDetail (file:///home/fe-jerome/projects/stock-race/backend/src/utils/responseFormatter.js:212:7)"},"timestamp":"2026-02-09T10:18:45.041Z"},"message":"服务器内部错误，请稍后重试","meta":{"timestamp":"2026-02-09T10:18:45.041Z"}}`

### 测试 #8: 获取股票行情

- **方法**: GET
- **端点**: /stocks/000001/quotes
- **状态码**: 404
- **结果**: 失败
- **响应**: `{"success":false,"error":{"code":"NOT_FOUND","message":"请求的端点不存在"},"message":"找不到端点: /api/stocks/000001/quotes","suggestions":["检查端点URL是否正确","查看 /api-info 获取可用端点列表","确保使用了正确的HTTP方法"]}`

### 测试 #9: 搜索股票

- **方法**: GET
- **端点**: /stocks/search?keyword=平安
- **状态码**: 400
- **结果**: 失败
- **响应**: ``

### 测试 #10: 获取市场概况

- **方法**: GET
- **端点**: /stocks/market/overview
- **状态码**: 404
- **结果**: 失败
- **响应**: `{"success":false,"error":{"code":"NOT_FOUND","message":"请求的端点不存在"},"message":"找不到端点: /api/stocks/market/overview","suggestions":["检查端点URL是否正确","查看 /api-info 获取可用端点列表","确保使用了正确的HTTP方法"]}`

## 4. AI账户API测试

### 测试 #11: 获取AI账户列表 (未认证)

- **方法**: GET
- **端点**: /ai-accounts
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #12: 创建AI账户 (未认证)

- **方法**: POST
- **端点**: /ai-accounts
- **请求体**: `{"name":"测试账户","strategy":"conservative"}`
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #13: 获取AI账户详情 (未认证)

- **方法**: GET
- **端点**: /ai-accounts/1
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #14: 删除AI账户 (未认证)

- **方法**: DELETE
- **端点**: /ai-accounts/1
- **状态码**: 401
- **结果**: 需要认证 (预期内)

## 5. 交易API测试

### 测试 #15: 获取交易列表

- **方法**: GET
- **端点**: /trades
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #16: 执行买入交易

- **方法**: POST
- **端点**: /trades
- **请求体**: `{"symbol":"000001","type":"buy","quantity":100}`
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #17: 执行卖出交易

- **方法**: POST
- **端点**: /trades
- **请求体**: `{"symbol":"000001","type":"sell","quantity":50}`
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #18: 获取交易详情

- **方法**: GET
- **端点**: /trades/1
- **状态码**: 401
- **结果**: 需要认证 (预期内)

## 6. 持仓API测试

### 测试 #19: 获取持仓列表

- **方法**: GET
- **端点**: /portfolios
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #20: 获取持仓详情

- **方法**: GET
- **端点**: /portfolios/1
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #21: 获取收益统计

- **方法**: GET
- **端点**: /portfolios/stats
- **状态码**: 401
- **结果**: 需要认证 (预期内)

### 测试 #22: 获取收益曲线

- **方法**: GET
- **端点**: /portfolios/profit-curve
- **状态码**: 401
- **结果**: 需要认证 (预期内)

## 7. 市场数据API测试

### 测试 #23: 获取市场状态

- **方法**: GET
- **端点**: /market/status
- **状态码**: 200
- **结果**: 通过

### 测试 #24: 获取实时行情

- **方法**: GET
- **端点**: /market/realtime
- **状态码**: 404
- **结果**: 失败
- **响应**: `{"success":false,"error":{"code":"NOT_FOUND","message":"请求的端点不存在"},"message":"找不到端点: /api/market/realtime","suggestions":["检查端点URL是否正确","查看 /api-info 获取可用端点列表","确保使用了正确的HTTP方法"]}`

### 测试 #25: 获取历史数据

- **方法**: GET
- **端点**: /market/history?symbol=000001
- **状态码**: 404
- **结果**: 失败
- **响应**: `{"success":false,"error":{"code":"NOT_FOUND","message":"请求的端点不存在"},"message":"找不到端点: /api/market/history?symbol=000001","suggestions":["检查端点URL是否正确","查看 /api-info 获取可用端点列表","确保使用了正确的HTTP方法"]}`

## 8. 排行榜API测试

### 测试 #26: 获取收益率排行

- **方法**: GET
- **端点**: /rankings/returns
- **状态码**: 404
- **结果**: 失败
- **响应**: `{"success":false,"error":{"code":"NOT_FOUND","message":"请求的端点不存在"},"message":"找不到端点: /api/rankings/returns","suggestions":["检查端点URL是否正确","查看 /api-info 获取可用端点列表","确保使用了正确的HTTP方法"]}`

### 测试 #27: 获取综合排行

- **方法**: GET
- **端点**: /rankings/comprehensive
- **状态码**: 404
- **结果**: 失败
- **响应**: `{"success":false,"error":{"code":"NOT_FOUND","message":"请求的端点不存在"},"message":"找不到端点: /api/rankings/comprehensive","suggestions":["检查端点URL是否正确","查看 /api-info 获取可用端点列表","确保使用了正确的HTTP方法"]}`

## 9. 管理员API测试

### 测试 #28: 获取系统状态 (未授权)

- **方法**: GET
- **端点**: /admin/status
- **状态码**: 404
- **结果**: 失败
- **响应**: `{"success":false,"error":{"code":"NOT_FOUND","message":"请求的端点不存在"},"message":"找不到端点: /api/admin/status","suggestions":["检查端点URL是否正确","查看 /api-info 获取可用端点列表","确保使用了正确的HTTP方法"]}`

### 测试 #29: 获取用户列表 (未授权)

- **方法**: GET
- **端点**: /admin/users
- **状态码**: 404
- **结果**: 失败
- **响应**: `{"success":false,"error":{"code":"NOT_FOUND","message":"请求的端点不存在"},"message":"找不到端点: /api/admin/users","suggestions":["检查端点URL是否正确","查看 /api-info 获取可用端点列表","确保使用了正确的HTTP方法"]}`

---

## 测试汇总

| 指标 | 数值 |
|------|------|
| 总测试数 | 29 |
| 通过 | 19 |
| 失败 | 10 |
| 成功率 | 65% |

## 需要修复的问题清单

请后端智能体根据上述测试结果修复失败的API。
