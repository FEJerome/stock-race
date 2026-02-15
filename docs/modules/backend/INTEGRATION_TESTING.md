# Backend 集成测试环境指南

> I-001: 完善集成测试环境

---

## 快速开始

### 方式一：一键启动（推荐）

```bash
# 进入项目根目录
cd /home/fe-jerome/projects/stock-race

# 运行集成测试启动脚本
./scripts/run-integration-tests.sh

# 等待服务启动完成，然后运行测试
cd backend && npm run test:integration
```

### 方式二：手动启动

```bash
# 1. 启动完整环境
docker-compose -f docker-compose.integration.yml up -d

# 2. 等待服务就绪（约30秒）
sleep 30

# 3. 执行数据库迁移
docker-compose -f docker-compose.integration.yml exec backend npx prisma migrate deploy

# 4. 运行集成测试
cd backend && npm run test:integration

# 5. 停止环境
docker-compose -f docker-compose.integration.yml down
```

### 方式三：CI 模式

```bash
# CI/CD 流水线使用（自动运行测试后清理）
./scripts/run-integration-tests.sh --ci
```

---

## 脚本参数说明

| 参数 | 说明 |
|------|------|
| `--quick` | 快速模式，跳过数据库重置（适用于重复测试） |
| `--ci` | CI 模式，使用 `docker-compose.test.yml`，自动运行测试 |
| `--help` | 显示帮助信息 |

---

## 服务端口映射

| 服务 | 容器名 | 主机端口 | 容器端口 |
|------|--------|----------|----------|
| Backend | stock-race-backend-int | 3001 | 3001 |
| Market Data Service | stock-race-market-data-int | 8001 | 8001 |
| Trading AI Service | stock-race-trading-ai-int | 8000 | 8000 |
| News Service | stock-race-news-int | - | - |
| Redis | stock-race-redis-int | 6380 | 6379 |
| PostgreSQL | stock-race-postgres-int | 5434 | 5432 |
| TimescaleDB | stock-race-timescaledb-int | 5433 | 5432 |

---

## 测试命令

```bash
# 所有测试（单元 + 集成）
npm test

# 仅单元测试
npm run test:unit

# 仅集成测试
npm run test:integration

# 集成测试（本地开发，保留句柄检测）
npm run test:integration:local

# 带覆盖率报告
npm run test:integration -- --coverage

# 调试特定测试文件
npm run test:integration -- service-communication.test.js
```

---

## 集成测试列表

| 测试文件 | 测试内容 | 依赖服务 |
|---------|---------|---------|
| `service-communication.test.js` | 服务间通信 | AI Service, Market Data Service |
| `ai-account-creation.test.js` | AI账户创建流程 | Backend + PostgreSQL |
| `ai-dialogue.test.js` | AI对话功能 | WebSocket 服务 |
| `ai-decision-execution.test.js` | AI决策执行 | Backend + PostgreSQL |
| `health-check.test.js` | 健康检查 | Backend |
| `event-pubsub.test.js` | 事件发布订阅 | Redis |
| `daily-close-job.test.js` | 日终结算任务 | Backend + PostgreSQL |
| `hot-stocks-publishing.test.js` | 热股票发布 | Backend + Redis |

---

## 环境变量

### 开发环境 (.env)

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/stock_race
REDIS_URL=redis://localhost:6380
AI_SERVICE_URL=http://localhost:8000
DATA_SERVICE_URL=http://localhost:8001
```

### 测试环境 (.env.test)

```env
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/stock_race_test
REDIS_URL=redis://localhost:6381
STRICT_MODE=false
```

---

## 故障排除

### 问题：端口已被占用

```bash
# 检查端口占用
lsof -i :3001
lsof -i :8000
lsof -i :8001

# 停止占用进程或修改 docker-compose 端口映射
```

### 问题：服务启动超时

```bash
# 查看服务日志
docker-compose -f docker-compose.integration.yml logs backend
docker-compose -f docker-compose.integration.yml logs trading-ai-service

# 重启特定服务
docker-compose -f docker-compose.integration.yml restart backend
```

### 问题：数据库连接失败

```bash
# 重置数据库
docker-compose -f docker-compose.integration.yml down -v
docker-compose -f docker-compose.integration.yml up -d postgres

# 手动执行迁移
docker-compose -f docker-compose.integration.yml exec backend npx prisma migrate reset --force
```

### 问题：集成测试连接被拒绝

```bash
# 确认服务已启动
curl http://localhost:3001/api/health
curl http://localhost:8000/api/v1/health/
curl http://localhost:8001/health

# 如果失败，查看日志排查问题
docker-compose -f docker-compose.integration.yml ps
```

---

## Mock 服务

在 CI 模式下，使用 [MockServer](https://www.mock-server.com/) 模拟外部服务：

```bash
# Mock 配置位置
tests/mocks/mock_expectations.json

# 添加新的 Mock 期望
# 参考: http://localhost:8002/mockserver/dashboard
```

---

## 持续集成配置

### GitHub Actions 示例

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run integration tests
        run: ./scripts/run-integration-tests.sh --ci

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info
```

---

## 相关文档

- [Backend TODO](./TODO.md) - 待办任务追踪
- [Backend HAVE_DONE](./HAVE_DONE.md) - 已完成功能
- [Docker 部署指南](../../deployment/PRODUCTION_DEPLOYMENT_GUIDE.md)

---

*最后更新：2026-02-13 (Backend开发团队)*
