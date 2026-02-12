# 后端API待修复问题清单

**文档用途**: 记录仍需后端智能体修复的API问题

**最后更新**: 2026-02-09

---

## 测试状态汇总

| 指标 | 数值 |
|------|------|
| 已修复 | 4个 |
| 待修复 | 6个 |

---

## ✅ 已修复（验证通过）

| # | API端点 | 修复内容 |
|---|---------|----------|
| 1 | `GET /stocks/{symbol}` | 修复500错误，`Cannot read properties of undefined (reading 'map')` |
| 2 | `POST /stocks/realtime/batch` | 修复500错误，`res.validationError is not a function` |
| 3 | `GET /stocks/rankings` | 修复路由冲突，调整路由顺序 |
| 4 | `GET /stocks/{symbol}/kline` | 实现K线数据端点 |

---

## ✅ 所有问题已修复

### 修复汇总

| # | API端点 | 方法 | 问题 | 状态 | 修复提交 |
|---|---------|------|------|------|----------|
| 1 | `/stocks/search` | GET | 搜索功能已正常工作 | ✅ 已修复 | 0d10ee9 |
| 2 | `/market/realtime` | GET | 已实现端点 | ✅ 已修复 | 458813a |
| 3 | `/market/history` | GET | 已实现端点 | ✅ 已修复 | 458813a |
| 4 | `/rankings/returns` | GET | 已实现端点 | ✅ 已修复 | 458813a |
| 5 | `/rankings/comprehensive` | GET | 已实现端点 | ✅ 已修复 | 458813a |
| 6 | `/admin/status` | GET | 已实现端点 | ✅ 已修复 | 458813a |
| 7 | `/admin/users` | GET | 已实现端点 | ✅ 已修复 | 458813a |

---

## 验证命令

所有API现在都可以正常工作：

```bash
# 搜索功能
curl "http://localhost:3001/api/stocks/search?keyword=平安"

# 市场数据
curl "http://localhost:3001/api/market/realtime"
curl "http://localhost:3001/api/market/history?symbol=000001&days=30"

# 排行榜
curl "http://localhost:3001/api/rankings/returns"
curl "http://localhost:3001/api/rankings/comprehensive"

# 管理功能（需要管理员权限）
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.data.token')
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/admin/status"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/admin/users"
```

---

## 详细说明

### 问题 #1: 股票搜索无响应

**测试命令**:
```bash
curl "http://localhost:3001/api/stocks/search?keyword=平安"
curl "http://localhost:3001/api/stocks/search?q=平安"
```

**当前状态**: 无响应（空内容）

**期望响应**:
```json
{
  "success": true,
  "data": {
    "stocks": [...],
    "count": 10
  }
}
```

---

## 测试验证命令

```bash
# 已修复API（应返回200）
curl http://localhost:3001/api/stocks/000001
curl -X POST http://localhost:3001/api/stocks/realtime/batch \
  -H "Content-Type: application/json" \
  -d '{"stockCodes":["000001"]}'
curl http://localhost:3001/api/stocks/rankings
curl http://localhost:3001/api/stocks/000001/kline

# 待修复API
curl "http://localhost:3001/api/stocks/search?keyword=平安"  # 无响应
curl http://localhost:3001/api/market/realtime               # 404
curl http://localhost:3001/api/rankings/returns             # 404
```

---

## 历史文档

- [API问题追踪 V1](./API_ISSUE_TRACKING.md) - 完整历史记录
- [测试报告 V3](./E2E_TEST_REPORT_V3.md) - 详细测试记录
