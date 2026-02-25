# Docker 部署指南

**本文档**：完整的 Docker 部署说明
**目标读者**：需要部署或调试 Docker 环境的开发者
**前置条件**：已安装 Docker 和 Docker Compose

---

## 环境概述

项目提供两种 Docker Compose 配置：

| 配置 | 用途 | 文件 | 特点 |
|------|------|------|------|
| **联调测试** | 集成测试、全服务验证 | `docker-compose.integration.yml` | 全容器化、热重载、严格模式 |
| **开发环境** | 本地开发、单服务调试 | `docker-compose.yml` | 仅基础设施、服务本地运行 |

---

## 联调测试环境（推荐）

**适用场景**：
- 多服务集成测试
- 联调验证
- 生产环境预演
- CI/CD 流水线

**配置特点**：
- 所有服务（包括业务服务）Docker 容器化
- Volume 挂载源代码，支持热重载
- 严格模式（STRICT_MODE=true），强制使用真实数据
- 自动数据库迁移
- 健康检查与依赖等待

### 一键启动（推荐）

```bash
# 使用 Makefile 启动联调环境（最常用）
make integration

# 或使用 docker-compose 命令
docker-compose -f docker-compose.integration.yml up -d
```

### 其他常用命令

```bash
# 查看服务状态
make status
# 或
docker-compose -f docker-compose.integration.yml ps

# 查看实时日志
make logs
# 或
docker-compose -f docker-compose.integration.yml logs -f

# 查看特定服务日志
docker-compose -f docker-compose.integration.yml logs -f backend

# 停止所有服务
make down
# 或
docker-compose -f docker-compose.integration.yml down

# 停止并清除数据卷（谨慎使用）
docker-compose -f docker-compose.integration.yml down -v
```

### 服务端口映射

| 服务 | 容器名 | 主机端口 | 容器端口 | 说明 |
|------|--------|----------|----------|------|
| Backend | stock-race-backend-int | 3001 | 3001 | API 服务 |
| Trading AI Service | stock-race-trading-ai-int | 8000 | 8000 | AI 决策服务 |
| Market Data Service | stock-race-market-data-int | 8001 | 8001 | 行情数据服务 |
| News Service | stock-race-news-int | - | - | 新闻服务（无 HTTP） |
| Redis | stock-race-redis-int | 6380 | 6379 | 缓存（注意：宿主机 6379 已被占用） |
| PostgreSQL | stock-race-postgres-int | 5434 | 5432 | 主数据库 |
| TimescaleDB | stock-race-timescaledb-int | 5433 | 5432 | 时序数据库 |

### 健康检查

```bash
# Backend
curl http://localhost:3001/api/health

# Trading AI Service
curl http://localhost:8000/api/v1/health/

# Market Data Service
curl http://localhost:8001/health
```

### 常见问题解决

```bash
# 端口冲突（如 6379 被宿主机 Redis 占用）
# 已在配置中修改为 6380，无需额外操作

# 重建镜像（代码变更后）
docker-compose -f docker-compose.integration.yml build

# 强制重启特定服务
docker-compose -f docker-compose.integration.yml up -d --force-recreate backend

# 进入容器调试
docker exec -it stock-race-backend-int sh
docker exec -it stock-race-market-data-int bash
```

---

## 生产环境部署

**部署文件**：
- `docker-compose.prod.yml` - 生产环境配置
- `backend/Dockerfile` - Backend 生产镜像
- `trading-ai-service/Dockerfile` - AI 服务生产镜像
- `market-data-service/Dockerfile` - 数据服务生产镜像
- `news-service/Dockerfile` - 新闻服务生产镜像

**启动步骤**：

```bash
# 1. 设置环境变量
export NODE_ENV=production
export DATABASE_URL=postgresql://user:pass@postgres:5432/stock_race
export REDIS_URL=redis://redis:6379

# 2. 启动基础设施
docker-compose -f docker-compose.prod.yml up -d postgres redis timescaledb

# 3. 等待数据库就绪（约 10 秒）
sleep 10

# 4. 执行数据库迁移
docker-compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy

# 5. 启动所有服务
docker-compose -f docker-compose.prod.yml up -d
```

**生产环境检查清单**：
- [ ] 修改默认密码（PostgreSQL、Redis）
- [ ] 配置 SSL/TLS 证书
- [ ] 设置资源限制（CPU/内存）
- [ ] 配置日志收集（ELK/Loki）
- [ ] 启用监控告警（Prometheus/Grafana）
- [ ] 配置备份策略

---

## 开发环境（基础设施 only）

**适用场景**：
- 单服务本地开发调试
- 快速启动基础设施

**启动方式**：

```bash
# 仅启动基础设施（PostgreSQL、Redis、TimescaleDB）
docker-compose up -d

# 服务在宿主机本地运行，便于调试
# Backend: cd backend && npm run dev
# Market Data: cd market-data-service && python -m uvicorn data_service.main:app --reload
```

---

## 相关文档

- [Makefile 命令](QUICK_START.md) - 统一命令入口
- [生产部署指南](../deployment/PRODUCTION_DEPLOYMENT_GUIDE.md) - 生产环境详细步骤
- [部署指南](../deployment/DEPLOYMENT_GUIDE.md) - 通用部署说明

---

**最后更新**: 2026-02-25
**文档版本**: v1.0
