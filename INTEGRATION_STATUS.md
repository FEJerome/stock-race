# 联调环境启动状态

## ✅ 启动完成

时间: 2026-02-13 12:02

## 🟢 服务状态

| 服务 | 端口 | 状态 |
|------|------|------|
| Backend | 3001 | ✅ 正常 |
| Market Data | 8001 | ✅ 健康 |
| Trading AI | 8000 | ✅ 健康 |
| News Service | 事件总线 | ✅ 正常 |

## 🟢 基础设施

| 服务 | 端口 | 状态 |
|------|------|------|
| Redis | 6379 | ✅ healthy |
| PostgreSQL | 5434 | ✅ healthy |
| TimescaleDB | 5433 | ✅ healthy |

## 📋 访问地址

- Backend: http://localhost:3001/api/health
- Market Data: http://localhost:8001/health
- Trading AI: http://localhost:8000/api/v1/health/

## ⚠️ 注意事项

1. 严格模式已启用，所有服务使用真实数据
2. News Service 采用事件总线模式，无 HTTP 端口
3. Trading AI 依赖 infra SDK，通过 PYTHONPATH 加载

## 🚀 可以开始联调测试了！
