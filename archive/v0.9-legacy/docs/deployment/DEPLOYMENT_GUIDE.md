# AI股票竞赛平台 - 生产环境部署指南

## 文档版本
- **版本**: v1.0
- **创建日期**: 2026-02-05
- **维护者**: 首席架构师

## 目录
1. [部署架构](#部署架构)
2. [环境准备](#环境准备)
3. [生产环境配置](#生产环境配置)
4. [Docker Compose部署](#docker-compose部署)
5. [Kubernetes部署](#kubernetes部署)
6. [健康检查与监控](#健康检查与监控)
7. [故障处理](#故障处理)

---

## 部署架构

### 生产环境架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Nginx/负载均衡器                           │
│                      (SSL终止 + 反向代理)                         │
└────────────┬────────────────────────────────────────────────────────────┘
             │
    ┌────────┴────────┬────────────┬────────────┬────────────┐
    │                 │            │            │            │
┌───▼────┐    ┌────▼────┐  ┌───▼────┐  ┌───▼────┐  ┌───▼────┐
│ Frontend│    │ Backend │  │AI-Service│  │Data-Service│ │Monitoring│
│  (React)│    │ (Node.js)│  │ (Python) │  │  (Python)  │ (Prometheus)│
│:3000   │    │ :3001   │  │ :8000   │  │  :8001   │  :9090   │
└─────────┘    └────┬────┘  └───┬────┘  └───┬────┘  └─────────┘
                      │           │            │
                ┌─────┴─────┐  ┌───▼────┐
                │ PostgreSQL │  │TimescaleDB│
                │  (元数据) │  │ (时序数据)│
                │   :5432   │  │  :5433   │
                └────────────┘  └───────────┘
                      │
                ┌─────▼────┐
                │  Redis   │
                │ (缓存)   │
                │  :6379   │
                └───────────┘
```

### 服务端口映射

| 服务 | 容器内端口 | 外部端口 | 协议 | 说明 |
|------|------------|---------|------|------|
| Nginx | 80/443 | 80/443 | HTTP/HTTPS | 统一入口 |
| Frontend | 3000 | - | HTTP | 内部通信 |
| Backend | 3001 | - | HTTP | 内部通信 |
| AI Service | 8000 | - | HTTP | 内部通信 |
| Data Service | 8001 | - | HTTP | 内部通信 |
| PostgreSQL | 5432 | - | TCP | 内部通信 |
| TimescaleDB | 5433 | - | TCP | 内部通信 |
| Redis | 6379 | - | TCP | 内部通信 |
| Prometheus | 9090 | 9090 | HTTP | 监控访问 |
| Grafana | 3001 | 3002 | HTTP | 监控面板 |

---

## 环境准备

### 系统要求

#### 最小配置（测试/演示）
- **CPU**: 2核
- **内存**: 4GB
- **存储**: 20GB SSD
- **网络**: 10Mbps

#### 推荐配置（生产）
- **CPU**: 4核以上
- **内存**: 8GB以上
- **存储**: 100GB SSD
- **网络**: 100Mbps以上

### 软件依赖

| 软件 | 版本要求 | 用途 |
|------|---------|------|
| Docker | 24.0+ | 容器运行时 |
| Docker Compose | 2.20+ | 容器编排 |
| Nginx | 1.24+ | 反向代理（可选） |
| Git | 2.30+ | 版本管理 |

### 安装Docker

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# CentOS/RHEL
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 验证安装
docker --version
docker-compose --version
```

---

## 生产环境配置

### 1. 创建生产环境变量文件

#### 后端配置 (`backend/.env.production`)

```bash
# 应用配置
NODE_ENV=production
PORT=3001
API_PREFIX=/api

# CORS配置（生产环境域名）
CORS_ORIGIN=https://your-domain.com

# 数据库配置
DATABASE_URL=postgresql://prod_user:strong_password@postgres:5432/stock_race_prod
DATABASE_POOL_MIN=10
DATABASE_POOL_MAX=50

# Redis配置
REDIS_URL=redis://:strong_password@redis:6379
REDIS_DB=0

# 会话配置
SESSION_TTL=86400
MAX_SESSIONS_PER_USER=10

# JWT配置（生产环境必须使用强密钥）
JWT_SECRET=$(openssl rand -base64 64)
JWT_EXPIRES_IN=24h

# AI Service配置
AI_SERVICE_URL=http://ai-service:8000
DATA_SERVICE_URL=http://data-service:8001

# 限流配置
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# 日志配置
LOG_LEVEL=warn
LOG_FILE=/var/log/stock-race/backend.log

# 邮件配置（通知用）
SMTP_HOST=smtp.your-domain.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=$(openssl rand -base64 32)
```

#### AI服务配置 (`ai-service/.env.production`)

```bash
# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=False

# CORS配置
CORS_ORIGINS=https://your-domain.com

# 数据库配置
DB_HOST=postgres
DB_PORT=5432
DB_NAME=stock_race_prod
DB_USER=prod_user
DB_PASSWORD=strong_password

# Redis配置
REDIS_URL=redis://:strong_password@redis:6379

# AI API Keys（需要配置真实的API密钥）
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
QWEN_API_KEY=sk-xxxxxxxxxxxxxxxx

# 服务URL
BACKEND_URL=http://backend:3001
DATA_SERVICE_URL=http://data-service:8001

# 日志配置
LOG_LEVEL=WARNING
LOG_FILE=/var/log/stock-race/ai-service.log
```

#### 数据服务配置 (`data-service/.env.production`)

```bash
# Server Configuration
HOST=0.0.0.0
PORT=8001
DEBUG=False

# CORS配置
CORS_ORIGINS=https://your-domain.com

# TimescaleDB配置
TSDB_HOST=timescaledb
TSDB_PORT=5433
TSDB_NAME=stock_race_tsdb_prod
TSDB_USER=tsdb_user
TSDB_PASSWORD=strong_password

# PostgreSQL配置
DB_HOST=postgres
DB_PORT=5432
DB_NAME=stock_race_prod
DB_USER=prod_user
DB_PASSWORD=strong_password

# Redis配置
REDIS_URL=redis://:strong_password@redis:6379

# 数据采集配置
COLLECTION_INTERVAL=60
BATCH_SIZE=100
MAX_RETRIES=3

# 日志配置
LOG_LEVEL=WARNING
LOG_FILE=/var/log/stock-race/data-service.log
```

#### 前端配置 (`frontend/.env.production`)

```bash
# API端点
VITE_API_URL=https://api.your-domain.com
VITE_WS_URL=wss://api.your-domain.com

# 应用配置
VITE_APP_TITLE=AI股票竞赛平台
VITE_APP_VERSION=1.0.0

# 功能开关
VITE_ENABLE_AI_ANALYSIS=true
VITE_ENABLE_REALTIME_DATA=true
VITE_ENABLE_COMPETITION=true
```

### 2. 创建生产环境Docker Compose文件

创建 `docker-compose.prod.yml`：

```yaml
version: '3.8'

services:
  # PostgreSQL Database (for metadata)
  postgres:
    image: postgres:15-alpine
    container_name: stock-race-postgres-prod
    restart: always
    environment:
      POSTGRES_DB: stock_race_prod
      POSTGRES_USER: prod_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data_prod:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - stock-race-prod-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U prod_user"]
      interval: 30s
      timeout: 10s
      retries: 5

  # TimescaleDB (for time-series data)
  timescaledb:
    image: timescale/timescaledb:2.11-pg15
    container_name: stock-race-timescaledb-prod
    restart: always
    environment:
      POSTGRES_DB: stock_race_tsdb_prod
      POSTGRES_USER: tsdb_user
      POSTGRES_PASSWORD: ${TSDB_PASSWORD}
    volumes:
      - timescaledb_data_prod:/var/lib/postgresql/data
      - ./docker/timescaledb/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - stock-race-prod-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tsdb_user"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: stock-race-redis-prod
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis_data_prod:/data
    networks:
      - stock-race-prod-network
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Backend API Service
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    container_name: stock-race-backend-prod
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - backend/.env.production
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - AI_SERVICE_URL=http://ai-service:8000
      - DATA_SERVICE_URL=http://data-service:8001
    volumes:
      - backend_logs_prod:/var/log/stock-race
    networks:
      - stock-race-prod-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # AI Service
  ai-service:
    build:
      context: ./ai-service
      dockerfile: Dockerfile.prod
    container_name: stock-race-ai-service-prod
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - ai-service/.env.production
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - BACKEND_URL=http://backend:3001
      - DATA_SERVICE_URL=http://data-service:8001
    volumes:
      - ai_service_logs_prod:/var/log/stock-race
    networks:
      - stock-race-prod-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Data Service
  data-service:
    build:
      context: ./data-service
      dockerfile: Dockerfile.prod
    container_name: stock-race-data-service-prod
    restart: always
    depends_on:
      timescaledb:
        condition: service_healthy
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - data-service/.env.production
    environment:
      - TSDB_HOST=timescaledb
      - TSDB_PORT=5433
      - DB_HOST=postgres
      - DB_PORT=5432
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - BACKEND_URL=http://backend:3001
    volumes:
      - data_service_logs_prod:/var/log/stock-race
    networks:
      - stock-race-prod-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Frontend (Nginx)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    container_name: stock-race-frontend-prod
    restart: always
    depends_on:
      - backend
    networks:
      - stock-race-prod-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Nginx Reverse Proxy
  nginx:
    image: nginx:1.25-alpine
    container_name: stock-race-nginx-prod
    restart: always
    depends_on:
      - frontend
      - backend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - nginx_logs_prod:/var/log/nginx
    networks:
      - stock-race-prod-network

  # Prometheus Monitoring
  prometheus:
    image: prom/prometheus:latest
    container_name: stock-race-prometheus-prod
    restart: always
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data_prod:/prometheus
    networks:
      - stock-race-prod-network

  # Grafana Dashboard
  grafana:
    image: grafana/grafana:latest
    container_name: stock-race-grafana-prod
    restart: always
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_SERVER_ROOT_URL=https://grafana.your-domain.com
    volumes:
      - grafana_data_prod:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources:ro
    networks:
      - stock-race-prod-network

networks:
  stock-race-prod-network:
    driver: bridge

volumes:
  postgres_data_prod:
    driver: local
  timescaledb_data_prod:
    driver: local
  redis_data_prod:
    driver: local
  backend_logs_prod:
    driver: local
  ai_service_logs_prod:
    driver: local
  data_service_logs_prod:
    driver: local
  nginx_logs_prod:
    driver: local
  prometheus_data_prod:
    driver: local
  grafana_data_prod:
    driver: local
```

---

## Docker Compose部署

### 部署步骤

```bash
# 1. 克隆代码仓库
git clone https://github.com/your-org/stock-race.git
cd stock-race

# 2. 创建环境变量文件
cp backend/.env.example backend/.env.production
cp ai-service/.env.example ai-service/.env.production
cp data-service/.env.example data-service/.env.production
cp frontend/.env.example frontend/.env.production

# 3. 编辑生产环境变量
nano backend/.env.production
nano ai-service/.env.production
nano data-service/.env.production
nano frontend/.env.production

# 4. 配置Nginx反向代理
mkdir -p nginx/ssl
nano nginx/nginx.conf

# 5. 配置监控
mkdir -p monitoring/grafana/{dashboards,datasources}
nano monitoring/prometheus.yml

# 6. 构建并启动所有服务
docker-compose -f docker-compose.prod.yml up -d --build

# 7. 查看服务状态
docker-compose -f docker-compose.prod.yml ps

# 8. 查看日志
docker-compose -f docker-compose.prod.yml logs -f
```

### Nginx配置示例 (`nginx/nginx.conf`)

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 2048;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # 基础配置
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 20M;

    # Gzip压缩
    gzip on;
    gzip_disable "msie6";
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss;

    # HTTPS配置
    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # 安全头
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # 前端静态文件
        location / {
            proxy_pass http://frontend:80;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }

        # 后端API
        location /api/ {
            proxy_pass http://backend:3001/api/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # AI服务
        location /ai/ {
            proxy_pass http://ai-service:8000/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
        }

        # WebSocket
        location /ws {
            proxy_pass http://backend:3001/ws;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
        }
    }

    # HTTP到HTTPS重定向
    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }
}
```

---

## Kubernetes部署

### Helm Chart部署

```bash
# 1. 添加Helm仓库
helm repo add stock-race https://charts.your-domain.com

# 2. 创建命名空间
kubectl create namespace stock-race-prod

# 3. 配置values
cat > values-prod.yaml <<EOF
global:
  domain: your-domain.com
  environment: production

backend:
  replicas: 3
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 500m
      memory: 1Gi

ai-service:
  replicas: 2
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 1000m
      memory: 2Gi

data-service:
  replicas: 2
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 1000m
      memory: 2Gi

postgresql:
  enabled: true
  persistence:
    enabled: true
    size: 100Gi

timescaledb:
  enabled: true
  persistence:
    enabled: true
    size: 200Gi

redis:
  enabled: true
  persistence:
    enabled: true
    size: 20Gi
EOF

# 4. 安装Chart
helm install stock-race stock-race/stock-race \
  -n stock-race-prod \
  -f values-prod.yaml

# 5. 检查部署状态
kubectl get pods -n stock-race-prod
```

---

## 健康检查与监控

### 健康检查端点

| 服务 | 端点 | 预期响应 |
|------|-------|---------|
| Backend | `GET /api/health` | `{"status":"ok"}` |
| AI Service | `GET /api/v1/health/` | `{"status":"healthy"}` |
| Data Service | `GET /health` | `{"status":"ok"}` |

### 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| CPU使用率 | 服务CPU占用 | > 80% |
| 内存使用率 | 服务内存占用 | > 85% |
| API响应时间 | API请求延迟 | > 1000ms (P95) |
| 错误率 | API错误比例 | > 1% |
| 数据库连接数 | 活跃连接数 | > 80%最大连接 |
| Redis命中率 | 缓存命中率 | < 90% |

---

## 故障处理

### 常见问题

#### 1. 数据库连接失败

```bash
# 检查PostgreSQL状态
docker logs stock-race-postgres-prod

# 重启数据库
docker-compose -f docker-compose.prod.yml restart postgres

# 检查连接
docker exec -it stock-race-postgres-prod psql -U prod_user -d stock_race_prod
```

#### 2. Redis连接失败

```bash
# 检查Redis状态
docker logs stock-race-redis-prod

# 测试连接
docker exec -it stock-race-redis-prod redis-cli ping

# 重启Redis
docker-compose -f docker-compose.prod.yml restart redis
```

#### 3. AI服务响应慢

```bash
# 检查AI服务日志
docker logs stock-race-ai-service-prod

# 检查API密钥配置
docker exec -it stock-race-ai-service-prod env | grep API_KEY
```

#### 4. 数据服务降级

```bash
# 检查数据源连接状态
curl http://localhost:8001/api/v1/sources/status

# 查看降级日志
docker logs stock-race-data-service-prod | grep -i fallback
```

### 备份与恢复

```bash
# 数据库备份
docker exec stock-race-postgres-prod pg_dump -U prod_user stock_race_prod > backup_$(date +%Y%m%d).sql

# 恢复数据库
cat backup_20260205.sql | docker exec -i stock-race-postgres-prod psql -U prod_user stock_race_prod

# Redis备份
docker exec stock-race-redis-prod redis-cli BGSAVE

# 数据卷备份
docker run --rm -v stock-race-postgres-prod:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres_backup.tar.gz -C /data .
```

---

## 附录

### A. 安全检查清单

- [ ] 修改所有默认密码
- [ ] 配置强JWT密钥
- [ ] 启用HTTPS/TLS
- [ ] 配置防火墙规则
- [ ] 限制API访问来源
- [ ] 启用日志审计
- [ ] 配置自动备份
- [ ] 设置告警通知

### B. 性能优化建议

1. **数据库优化**
   - 配置连接池大小
   - 启用查询缓存
   - 定期VACUUM和ANALYZE

2. **缓存优化**
   - 配置Redis内存大小
   - 设置合理的TTL
   - 监控缓存命中率

3. **应用优化**
   - 启用Gzip压缩
   - 配置CDN加速
   - 优化图片资源

### C. 联系信息

- **技术支持**: support@your-domain.com
- **紧急联系**: +86-xxxx-xxxx

---

*文档最后更新: 2026-02-05*
