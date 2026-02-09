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

## 🔴 待修复问题

### 高优先级

| # | API端点 | 方法 | 问题 | 状态 |
|---|---------|------|------|------|
| 1 | `/stocks/search` | GET | 搜索功能无响应，返回空内容 | ❌ 未修复 |

### 中优先级

| # | API端点 | 方法 | 问题 | 状态 |
|---|---------|------|------|------|
| 2 | `/market/realtime` | GET | 端点不存在 | ❌ 未修复 |
| 3 | `/market/history` | GET | 端点不存在 | ❌ 未修复 |
| 4 | `/rankings/returns` | GET | 端点不存在 | ❌ 未修复 |
| 5 | `/rankings/comprehensive` | GET | 端点不存在 | ❌ 未修复 |

### 低优先级

| # | API端点 | 方法 | 问题 | 状态 |
|---|---------|------|------|------|
| 6 | `/admin/status` | GET | 端点不存在（管理功能） | ❌ 未修复 |
| 7 | `/admin/users` | GET | 端点不存在（管理功能） | ❌ 未修复 |

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
