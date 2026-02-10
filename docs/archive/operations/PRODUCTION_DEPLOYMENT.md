# Stock Race 生产环境部署指南

## 📋 概述

本文档详细说明如何将 Stock Race 项目部署到生产环境。生产环境使用 Docker Compose 管理所有服务，包括数据库、缓存、后端API、AI服务、数据服务和前端应用。

## 🚀 快速开始

### 1. 环境要求

- **操作系统**: Linux (Ubuntu 20.04+ / CentOS 7+)
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **内存**: 至少 8GB RAM
- **存储**: 至少 50GB 可用空间
- **网络**: 开放端口 3000, 3001, 8000, 8001

### 2. 一键部署

```bash
# 克隆项目
git clone <repository-url>
cd stock-race

# 设置执行权限
chmod +x start-prod.sh

# 启动生产环境
./start-prod.sh up-build
```

### 3. 验证部署

```bash
# 检查服务状态
./start-prod.sh status

# 检查健康状态
./start-prod.sh health

# 查看服务信息
./start-prod.sh help
```

## 🔧 详细部署步骤

### 步骤1: 准备服务器

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 添加当前用户到docker组
sudo usermod -aG docker $USER
newgrp docker
```

### 步骤2: 获取项目代码

```bash
# 克隆项目
git clone <repository-url>
cd stock-race

# 切换到稳定版本
git checkout main
```

### 步骤3: 配置环境变量

```bash
# 复制环境变量文件
cp .env.production.example .env.production

# 编辑环境变量
nano .env.production
```

**重要环境变量配置**:

```bash
# ============ 数据库配置 ============
# PostgreSQL (元数据数据库)
DB_PASSWORD=strong_password_here  # 修改为强密码
POSTGRES_PORT=5432

# TimescaleDB (时序数据库)
TSDB_PASSWORD=strong_password_here  # 修改为强密码
TSDB_PORT=5433

# Redis (缓存和队列)
REDIS_PASSWORD=strong_password_here  # 修改为强密码
REDIS_PORT=6379

# ============ 服务配置 ============
# 后端服务
BACKEND_PORT=3001
JWT_SECRET=your_jwt_secret_key_change_me_in_production  # 修改为强密钥
JWT_EXPIRES_IN=7d

# AI服务
AI_SERVICE_PORT=8000
AI_SERVICE_API_KEY=stock-race-ai-key-production

# 数据服务
DATA_SERVICE_PORT=8001
DATA_SERVICE_API_KEY=stock-race-data-key-production

# 前端服务
FRONTEND_PORT=3000

# ============ AI提供商API密钥 ============
# 至少配置一个AI提供商才能使用真实AI决策
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
QWEN_API_KEY=your_qwen_api_key_here

# ============ 安全配置 ============
API_KEY=stock-race-api-key-production  # 服务间通信密钥

# ============ 管理工具 ============
# pgAdmin
PGADMIN_EMAIL=admin@your-domain.com
PGADMIN_PASSWORD=strong_password_here
PGADMIN_PORT=5050

# Redis Commander
REDIS_COMMANDER_PORT=8081
```

### 步骤4: 启动服务

```bash
# 方式1: 直接启动（使用现有镜像）
./start-prod.sh up

# 方式2: 重新构建并启动（推荐首次部署）
./start-prod.sh up-build
```

### 步骤5: 验证部署

```bash
# 检查所有服务状态
./start-prod.sh status

# 检查健康状态
./start-prod.sh health

# 查看服务信息
./start-prod.sh help
```

## 📊 服务架构

### 容器服务列表

| 服务 | 容器名称 | 端口 | 功能 |
|------|----------|------|------|
| PostgreSQL | stock-race-postgres-prod | 5432 | 元数据数据库 |
| TimescaleDB | stock-race-timescaledb-prod | 5433 | 时序数据库 |
| Redis | stock-race-redis-prod | 6379 | 缓存和队列 |
| 后端API | stock-race-backend-prod | 3001 | 业务逻辑API |
| AI服务 | stock-race-ai-service-prod | 8000 | AI决策服务 |
| 数据服务 | stock-race-data-service-prod | 8001 | 数据采集服务 |
| 前端应用 | stock-race-frontend-prod | 3000 | 用户界面 |
| pgAdmin | stock-race-pgadmin-prod | 5050 | 数据库管理 |
| Redis Commander | stock-race-redis-commander-prod | 8081 | Redis管理 |

### 网络架构

```
用户浏览器
    ↓
前端 (Nginx:3000) → 静态文件服务
    ↓
后端API (3001) → 业务逻辑
    ├── PostgreSQL (5432) → 元数据存储
    ├── Redis (6379) → 缓存/会话
    ├── AI服务 (8000) → AI决策
    └── 数据服务 (8001) → 数据采集
        └── TimescaleDB (5433) → 时序数据存储
```

## 🔒 安全配置

### 1. 防火墙配置

```bash
# 开放必要端口
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 3000/tcp      # 前端
sudo ufw allow 3001/tcp      # 后端API
sudo ufw allow 8000/tcp      # AI服务
sudo ufw allow 8001/tcp      # 数据服务
sudo ufw allow 5050/tcp      # pgAdmin (可选)
sudo ufw allow 8081/tcp      # Redis Commander (可选)

# 启用防火墙
sudo ufw enable
```

### 2. SSL/TLS 配置（推荐）

```bash
# 使用Nginx反向代理配置SSL
# 创建SSL证书目录
mkdir -p nginx/ssl

# 生成自签名证书（测试环境）
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/stock-race.key \
  -out nginx/ssl/stock-race.crt \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=Stock Race/CN=stock-race.com"

# 或者使用Let's Encrypt（生产环境）
# 参考: https://certbot.eff.org/
```

### 3. 数据库安全

```bash
# 1. 修改默认密码
# 在 .env.production 中设置强密码

# 2. 限制数据库访问
# 只允许本地和容器网络访问

# 3. 定期备份
./start-prod.sh backup
```

## 📈 监控和维护

### 1. 日常监控

```bash
# 查看服务状态
./start-prod.sh status

# 查看日志
./start-prod.sh logs

# 检查健康状态
./start-prod.sh health
```

### 2. 日志管理

```bash
# 查看特定服务日志
docker logs stock-race-backend-prod --tail 100

# 查看实时日志
docker-compose -f docker-compose.prod.yml logs -f backend

# 清理旧日志
docker-compose -f docker-compose.prod.yml exec backend sh -c "find /app/logs -name '*.log' -mtime +7 -delete"
```

### 3. 备份和恢复

```bash
# 备份所有数据库
./start-prod.sh backup

# 手动备份PostgreSQL
docker exec stock-race-postgres-prod pg_dump -U postgres stock_race > backup.sql

# 恢复PostgreSQL
cat backup.sql | docker exec -i stock-race-postgres-prod psql -U postgres stock_race
```

### 4. 性能监控

```bash
# 查看容器资源使用
docker stats

# 查看磁盘使用
docker system df

# 清理未使用的资源
docker system prune -a
```

## 🔄 更新和升级

### 1. 更新代码

```bash
# 拉取最新代码
git pull origin main

# 重新构建并启动
./start-prod.sh up-build
```

### 2. 数据库迁移

```bash
# 进入后端容器
docker exec -it stock-race-backend-prod sh

# 运行数据库迁移
npx prisma migrate deploy

# 退出容器
exit
```

### 3. 回滚操作

```bash
# 停止服务
./start-prod.sh down

# 恢复到之前的版本
git checkout <previous-commit>

# 重新启动
./start-prod.sh up-build
```

## 🚨 故障排除

### 常见问题

#### 1. 服务启动失败

```bash
# 检查Docker服务状态
systemctl status docker

# 检查容器日志
docker-compose -f docker-compose.prod.yml logs

# 检查端口冲突
netstat -tulpn | grep :3000
```

#### 2. 数据库连接问题

```bash
# 检查数据库服务状态
docker exec stock-race-postgres-prod pg_isready -U postgres

# 检查网络连接
docker network inspect stock-race-prod-network

# 检查环境变量
docker exec stock-race-backend-prod env | grep DB_
```

#### 3. 内存不足

```bash
# 查看内存使用
free -h

# 调整Docker内存限制
# 编辑 /etc/docker/daemon.json
{
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65536,
      "Soft": 65536
    }
  }
}

# 重启Docker
systemctl restart docker
```

#### 4. 磁盘空间不足

```bash
# 清理Docker资源
docker system prune -a --volumes

# 清理日志文件
find . -name "*.log" -type f -size +100M -delete
```

### 调试命令

```bash
# 进入容器调试
docker exec -it stock-race-backend-prod sh

# 检查服务进程
docker-compose -f docker-compose.prod.yml ps

# 查看网络配置
docker network ls
docker network inspect stock-race-prod-network

# 查看卷使用情况
docker volume ls
docker volume inspect stock-race_postgres_data_prod
```

## 📝 生产环境检查清单

### 部署前检查
- [ ] 服务器资源满足要求（CPU、内存、存储）
- [ ] Docker 和 Docker Compose 已安装
- [ ] 防火墙配置正确
- [ ] 环境变量文件已配置
- [ ] 所有密码已修改为强密码
- [ ] SSL证书已准备（如需要）

### 部署后验证
- [ ] 所有服务正常运行
- [ ] 健康检查通过
- [ ] 数据库连接正常
- [ ] 前端可以访问
- [ ] API接口正常工作
- [ ] AI服务可以调用
- [ ] 数据服务可以获取数据

### 安全配置
- [ ] 所有默认密码已修改
- [ ] 不必要的端口已关闭
- [ ] 防火墙规则已配置
- [ ] 定期备份已设置
- [ ] 日志轮转已配置

### 监控配置
- [ ] 日志收集已设置
- [ ] 性能监控已配置
- [ ] 告警机制已建立
- [ ] 备份策略已实施

## 🆘 紧急情况处理

### 1. 服务崩溃

```bash
# 立即重启服务
./start-prod.sh restart

# 如果重启失败，查看日志
./start-prod.sh logs
```

### 2. 数据库损坏

```bash
# 停止服务
./start-prod.sh down

# 从备份恢复
# 参考备份和恢复章节

# 重新启动
./start-prod.sh up
```

### 3. 安全事件

```bash
# 立即停止服务
./start-prod.sh down

# 检查日志
docker-compose -f docker-compose.prod.yml logs

# 修改所有密码
# 更新 .env.production 中的密码

# 重新启动
./start-prod.sh up-build
```

## 📞 支持与联系

### 获取帮助
- **文档**: 查看项目文档目录
- **问题**: 查看 GitHub Issues
- **讨论**: 加入项目讨论组

### 报告问题
1. 描述问题现象
2. 提供错误日志
3. 说明复现步骤
4. 提供环境信息

### 紧急联系方式
- 项目维护者: <maintainer-email>
- 技术支持: <support-email>

---

**最后更新**: 2026-02-06
**文档版本**: v1.0.0
**维护者**: Stock Race 团队