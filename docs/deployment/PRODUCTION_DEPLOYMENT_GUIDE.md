# Stock Race 生产环境快速部署指南

**版本**: 1.0
**更新日期**: 2026-02-05

## 目录
1. [快速开始](#快速开始)
2. [环境要求](#环境要求)
3. [部署步骤](#部署步骤)
4. [配置说明](#配置说明)
5. [服务管理](#服务管理)
6. [监控与告警](#监控与告警)
7. [故障排查](#故障排查)

---

## 快速开始

```bash
# 1. 生成安全密钥
./scripts/deploy-production.sh --generate-secrets

# 2. 配置环境变量
nano backend/.env.production
nano ai-service/.env.production
nano data-service/.env.production
nano frontend/.env.production

# 3. 一键部署
./scripts/deploy-production.sh
```

---

## 环境要求

### 硬件要求
| 配置 | 最小值 | 推荐值 |
|------|--------|---------|
| CPU | 2核 | 4核+ |
| 内存 | 4GB | 8GB+ |
| 存储 | 20GB SSD | 100GB SSD |
| 网络 | 10Mbps | 100Mbps+ |

### 软件要求
```bash
Docker >= 24.0
Docker Compose >= 2.20
```

---

## 部署步骤

### 步骤1：克隆代码
```bash
git clone https://github.com/your-org/stock-race.git
cd stock-race
```

### 步骤2：生成安全密钥
```bash
# 生成随机密钥（自动保存到.env.secrets）
./scripts/deploy-production.sh --generate-secrets
```

生成的密钥包括：
- PostgreSQL密码
- TimescaleDB密码
- Redis密码
- JWT密钥
- Grafana管理员密码

**重要**: `.env.secrets` 文件包含敏感信息，请妥善保管，不要提交到版本控制。

### 步骤3：配置环境变量

编辑各服务的 `.env.production` 文件：

#### 后端配置 (`backend/.env.production`)
```bash
NODE_ENV=production
JWT_SECRET=使用.env.secrets中的值
DB_PASSWORD=使用.env.secrets中的值
REDIS_PASSWORD=使用.env.secrets中的值
ADMIN_PASSWORD=设置强密码
```

#### AI服务配置 (`ai-service/.env.production`)
```bash
DEBUG=False
DB_PASSWORD=使用.env.secrets中的值
REDIS_PASSWORD=使用.env.secrets中的值

# 配置至少一个AI API密钥
OPENAI_API_KEY=sk-your-key
# 或
ANTHROPIC_API_KEY=sk-ant-your-key
```

#### 数据服务配置 (`data-service/.env.production`)
```bash
DEBUG=False
TSDB_PASSWORD=使用.env.secrets中的值
DB_PASSWORD=使用.env.secrets中的值
REDIS_PASSWORD=使用.env.secrets中的值
```

#### 前端配置 (`frontend/.env.production`)
```bash
VITE_API_BASE_URL=http://your-domain.com/api
VITE_WS_URL=ws://your-domain.com
VITE_DEBUG=false
```

### 步骤4：配置SSL证书（可选，推荐）

```bash
# 创建SSL目录
mkdir -p nginx/ssl

# 使用Let's Encrypt获取免费证书
certbot certonly --standalone -d your-domain.com

# 复制证书
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem

# 取消注释 nginx/nginx.prod.conf 中的HTTPS配置
nano nginx/nginx.prod.conf
```

### 步骤5：启动服务

```bash
# 使用部署脚本（推荐）
./scripts/deploy-production.sh

# 或使用Docker Compose
docker-compose -f docker-compose.prod.yml up -d --build
```

### 步骤6：验证部署

```bash
# 检查服务状态
docker-compose -f docker-compose.prod.yml ps

# 检查健康状态
curl http://localhost/health
curl http://localhost/api/health

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 配置说明

### 端口配置
| 服务 | 默认端口 | 说明 |
|------|----------|------|
| HTTP | 80 | Nginx入口 |
| HTTPS | 443 | Nginx入口 (SSL) |
| Backend | 内部3001 | 不暴露 |
| AI Service | 内部8000 | 不暴露 |
| Data Service | 内部8001 | 不暴露 |
| Prometheus | 9090 | 监控面板 |
| Grafana | 3002 | 可视化面板 |

### 数据库连接
- **PostgreSQL**: `postgres:5432`
- **TimescaleDB**: `timescaledb:5432`
- **Redis**: `redis:6379`

### 网络配置
所有服务运行在 `stock-race-prod-network` 桥接网络中，IP段为 `172.28.0.0/16`。

---

## 服务管理

### 查看服务状态
```bash
docker-compose -f docker-compose.prod.yml ps
```

### 查看日志
```bash
# 所有服务日志
docker-compose -f docker-compose.prod.yml logs -f

# 特定服务日志
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f ai-service
docker-compose -f docker-compose.prod.yml logs -f data-service
docker-compose -f docker-compose.prod.yml logs -f nginx
```

### 重启服务
```bash
# 重启所有服务
docker-compose -f docker-compose.prod.yml restart

# 重启特定服务
docker-compose -f docker-compose.prod.yml restart backend
```

### 停止服务
```bash
docker-compose -f docker-compose.prod.yml down
```

### 停止服务并删除数据卷
```bash
docker-compose -f docker-compose.prod.yml down -v
```

### 更新服务
```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 监控与告警

### Prometheus访问
访问地址: http://localhost:9090

主要功能：
- 实时指标查询
- 告警规则查看
- 服务目标状态

### Grafana访问
访问地址: http://localhost:3002

默认凭证（使用.env.secrets中的密码）:
- 用户名: `admin`
- 密码: 见 `.env.secrets` 文件

### 关键告警
| 告警 | 级别 | 触发条件 |
|------|------|---------|
| ServiceDown | Critical | 服务宕机超过1分钟 |
| HighAPILatency | Warning | API P95响应时间>1秒 |
| HighCPUUsage | Warning | CPU使用率>80%持续10分钟 |
| HighMemoryUsage | Warning | 内存使用率>85%持续10分钟 |
| HighRedisMemoryUsage | Critical | Redis内存使用>90% |
| DataCollectionFailure | Warning | 数据采集失败率过高 |

---

## 故障排查

### 服务无法启动
```bash
# 查看服务日志
docker-compose -f docker-compose.prod.yml logs [service_name]

# 常见原因：
# 1. 端口被占用 - 检查lsof -i :80
# 2. 内存不足 - 增加swap或升级配置
# 3. 配置错误 - 检查.env.production文件
```

### 数据库连接失败
```bash
# 检查数据库状态
docker exec stock-race-postgres-prod pg_isready -U prod_user

# 重启数据库
docker-compose -f docker-compose.prod.yml restart postgres

# 检查数据库日志
docker logs stock-race-postgres-prod
```

### AI服务无响应
```bash
# 检查API密钥配置
docker exec stock-race-ai-service-prod env | grep API_KEY

# 查看AI服务日志
docker logs stock-race-ai-service-prod

# 测试AI服务健康
curl http://localhost/api/v1/health/
```

### 监控数据缺失
```bash
# 检查Prometheus目标状态
访问 http://localhost:9090/targets

# 确保服务已正确暴露metrics端点
```

---

## 安全建议

1. **修改所有默认密码**: 使用强随机密码
2. **启用HTTPS**: 配置SSL证书
3. **限制网络访问**: 使用防火墙规则
4. **定期备份数据**: 设置自动备份脚本
5. **监控日志**: 设置日志告警
6. **更新依赖**: 定期更新Docker镜像和依赖包

---

## 备份与恢复

### 数据库备份
```bash
# 备份PostgreSQL
docker exec stock-race-postgres-prod pg_dump -U prod_user stock_race_prod > backup_$(date +%Y%m%d).sql

# 备份TimescaleDB
docker exec stock-race-timescaledb-prod pg_dump -U tsdb_user stock_race_tsdb_prod > tsdb_backup_$(date +%Y%m%d).sql

# 备份Redis
docker exec stock-race-redis-prod redis-cli BGSAVE
docker cp stock-race-redis-prod:/data/dump.rdb redis_backup_$(date +%Y%m%d).rdb
```

### 数据恢复
```bash
# 恢复PostgreSQL
cat backup_20260205.sql | docker exec -i stock-race-postgres-prod psql -U prod_user stock_race_prod

# 恢复Redis
docker cp redis_backup_20260205.rdb stock-race-redis-prod:/data/dump.rdb
docker-compose -f docker-compose.prod.yml restart redis
```

---

## 技术支持

- **快速部署指南**: [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) (本文档)
- **完整部署文档**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **部署完成报告**: [PRODUCTION_READINESS_REPORT.md](./PRODUCTION_READINESS_REPORT.md)
- **问题反馈**: GitHub Issues
- **联系方式**: support@your-domain.com
