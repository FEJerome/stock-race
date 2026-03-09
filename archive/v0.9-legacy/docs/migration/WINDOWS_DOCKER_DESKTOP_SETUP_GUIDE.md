# Windows Docker Desktop 开发环境配置方案

> 本方案是 [MIGRATION.md](../../MIGRATION.md) 的 Docker Desktop 版本
> 适用于从 Linux VM 迁移到 Windows + Docker Desktop 的场景

## 📋 方案概述

### 为什么选择 Docker Desktop？

| 对比项 | WSL2 方案 | Docker Desktop 方案 | 胜出 |
|--------|-----------|---------------------|------|
| 生产环境一致性 | ⚠️ 需手动确保版本 | ✅ Dockerfile 100%一致 | Docker ✅ |
| 服务启动复杂度 | ⚠️ 多命令/脚本 | ✅ docker-compose up -d | Docker ✅ |
| 网络管理 | ⚠️ 手动配置 | ✅ 自动隔离管理 | Docker ✅ |
| 热重载速度 | ✅ 实时 | ⚠️ 1-3秒延迟 | WSL2 ✅ |
| 调试便利性 | ✅ 完整Linux工具链 | ⚠️ 容器内有限 | WSL2 ✅ |
| MCP 服务兼容 | ⚠️ 需要stdio桥接 | ✅ Windows原生支持 | Docker ✅ |

**结论**：考虑到 MCP 服务的 stdio 模式限制和智能体全自动化需求，Docker Desktop 是更优选择。

### 架构设计

```
Windows 宿主机
├─ Claude Code (智能体) - Windows 版本 ⭐关键
├─ weixin-devtools-mcp (MCP 服务) ⭐关键
├─ 微信小程序项目
├─ 微信开发者工具
│
└─ Docker Desktop (WSL2 backend)
   ├─ Backend Container (Node 20 + Alpine)
   ├─ Trading AI Service Container (Python 3.11)
   ├─ Market Data Service Container (Python 3.11)
   ├─ News Service Container (Python 3.11)
   ├─ Redis Container (Redis 7)
   ├─ PostgreSQL Container (PostgreSQL 15)
   └─ TimescaleDB Container (TimescaleDB 2.11)
```

### 核心优势

| 优势 | 说明 |
|------|------|
| MCP 完美兼容 | 智能体和 MCP 服务都在 Windows，stdio 模式正常工作 |
| 生产一致性 | Dockerfile 与生产环境 100% 一致 |
| 一键启停 | docker-compose up -d 启动所有 6 个服务 |
| 网络隔离 | 服务间网络自动管理，避免端口冲突 |
| 健康检查 | Docker 内置健康检查机制 |

## 迁移流程概览

```
Linux VM
    │
    ├─ 执行导出脚本 ──→ vm-config-export-*.tar.gz (可选，保留配置)
    │
    └─ 提交代码 ──────→ GitHub/GitLab
                              │
                              ▼
                    高性能电脑（Windows 11）
                              │
                              ├─ 安装 Docker Desktop ⭐
                              ├─ git clone 本项目
                              ├─ 安装微信开发者工具
                              ├─ 配置 MCP (Windows版)
                              └─ docker-compose up -d ⭐
```

---

## 第一章：环境准备

### 1.1 Docker Desktop 安装

#### 方式一：官方安装（推荐）

**下载安装包**

- 访问：https://www.docker.com/products/docker-desktop
- 下载 Windows 版本（Docker Desktop for Windows）
- 系统要求：Windows 10/11 64位，启用了 WSL2 功能

**安装步骤**

```powershell
# 1. 运行安装程序 Docker Desktop Installer.exe
# 2. 安装过程中选择 "Use WSL 2 instead of Hyper-V"（推荐）
# 3. 安装完成后重启电脑
```

**验证安装**

```powershell
docker --version
docker-compose --version
```

#### 方式二：Winget 安装（Windows 包管理器）

```powershell
# 使用 Windows 自带的包管理器安装
winget install Docker.DockerDesktop

# 安装完成后重启
```

#### 方式三：Chocolatey 安装

```powershell
# 如果已安装 Chocolatey
choco install docker-desktop

# 安装完成后重启
```

### 1.2 Docker Desktop 配置

#### 首次启动配置

**接受许可协议**

- 启动 Docker Desktop
- 接受服务条款

**选择后端（关键步骤）**

```
Settings > General > Use the WSL 2 based engine
☑️ 勾选此项（推荐）
```

**资源配置**

```
Settings > Resources
- CPUs: 4 核（推荐，根据电脑配置调整）
- Memory: 8 GB（推荐，最少 4GB）
- Swap: 2 GB
```

**WSL 集成**

```
Settings > Resources > WSL Integration
☑️ Enable integration with my default WSL distro
☑️ 启用所有 WSL 发行版（如果有多个）
```

**网络配置**

```
Settings > Resources > Network
- 保持默认，确保 "Use Docker Desktop's internal networking" 勾选
```

### 1.3 安装验证

```powershell
# 测试 Docker 基本功能
docker run hello-world

# 测试 Docker Compose
docker-compose --version

# 查看 Docker 信息
docker info
```

---

## 第二章：项目配置优化

### 2.1 创建 .gitattributes（解决换行符问题）

**文件路径**：`c:/dev/projects/stock-race/.gitattributes`

```gitattributes
# 自动处理换行符，确保 Linux 容器内文件使用 LF
* text=auto

# 强制特定文件类型使用 LF（Linux 容器必需）
*.sh text eol=lf
*.py text eol=lf
*.js text eol=lf
*.ts text eol=lf
*.json text eol=lf
*.yml text eol=lf
*.yaml text eol=lf
*.md text eol=lf
*.sql text eol=lf

# Dockerfile 和相关配置
Dockerfile text eol=lf
.dockerignore text eol=lf

# 二进制文件不处理
*.png binary
*.jpg binary
*.gif binary
*.ico binary
*.pdf binary
```

**配置生效**：

```powershell
# 在 PowerShell 中执行
cd c:/dev/projects/stock-race
git add .gitattributes
git commit -m "Add .gitattributes for line ending consistency"
```

### 2.2 增强 Dockerfile（添加调试工具）

#### Backend Dockerfile 增强

**文件路径**：`c:/dev/projects/stock-race/backend/Dockerfile.dev-enhanced`

```dockerfile
# Backend Development Dockerfile (Windows优化版)
FROM node:20-alpine

WORKDIR /app

# 安装系统依赖和调试工具
RUN apk add --no-cache \
    openssl \
    libc6-compat \
    # 网络调试工具
    netcat-openbsd \
    bind-tools \
    curl \
    # 进程调试工具
    htop \
    procps \
    # 文本编辑工具
    vim \
    nano \
    # 文件查看工具
    less \
    tree \
    && rm -rf /var/lib/apt/lists/*

# 创建 infra 目录结构
RUN mkdir -p /app/infra/event-bus/src/node

# 先复制本地依赖
COPY infra/event-bus/src/node/package*.json /app/infra/event-bus/src/node/
COPY infra/event-bus/src/node/index.js /app/infra/event-bus/src/node/
COPY infra/event-bus/src/node/lib /app/infra/event-bus/src/node/lib/

# 复制 Backend package 文件
COPY backend/package*.json ./

# 安装依赖
RUN npm install ./infra/event-bus/src/node
RUN npm ci

# 复制 Prisma schema 并生成客户端
COPY backend/prisma ./prisma
RUN npx prisma generate

# 暴露端口
EXPOSE 3001

# 开发模式：热重载 + 调试就绪
# 注意：源代码通过 volume 挂载
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]
```

#### Market Data Service Dockerfile 增强

**文件路径**：`c:/dev/projects/stock-race/market-data-service/Dockerfile.dev-enhanced`

```dockerfile
# Data Service Development Dockerfile (Windows优化版)
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖和调试工具
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    # 网络调试工具
    netcat-openbsd \
    dnsutils \
    curl \
    iputils-ping \
    # 进程调试工具
    htop \
    procps \
    # 文本编辑工具
    vim \
    nano \
    # 数据库客户端（用于调试）
    postgresql-client \
    redis-tools \
    && rm -rf /var/lib/apt/lists/*

# 先复制并安装 infra SDK
COPY infra/health-check/src /app/infra/health-check/src
RUN pip install --no-cache-dir /app/infra/health-check/src

# 复制源代码
COPY market-data-service/src ./src
COPY market-data-service/pyproject.toml .

# 安装 Python 依赖
RUN pip install --no-cache-dir \
    fastapi>=0.104.0 \
    uvicorn[standard]>=0.24.0 \
    pydantic>=2.5.0 \
    pandas>=2.1.0 \
    numpy>=1.24.0 \
    httpx>=0.25.0 \
    redis>=5.0.0 \
    psycopg2-binary>=2.9.0 \
    sqlalchemy>=2.0.0 \
    aiohttp>=3.9.0 \
    celery>=5.3.0 \
    python-dotenv>=1.0.0 \
    tenacity>=8.2.0 \
    loguru>=0.7.0 \
    yfinance>=0.2.0 \
    ta-lib>=0.4.0 \
    pytest>=7.4.0 \
    pytest-asyncio>=0.21.0 \
    python-jose[cryptography]>=3.3.0 \
    pydantic-settings>=2.0.0 \
    akshare>=1.15.0 \
    baostock>=0.8.8 \
    tushare>=1.3.0 \
    asyncpg>=0.30.0

# 设置 PYTHONPATH
ENV PYTHONPATH=/app/src

# 暴露端口
EXPOSE 8001

# 启动开发服务器
CMD ["uvicorn", "data_service.main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
```

### 2.3 创建优化的 Docker Compose 配置

**文件路径**：`c:/dev/projects/stock-race/docker-compose.windows-dev.yml`

```yaml
version: '3.8'

# Windows Docker Desktop 开发环境配置
# 特点：
# 1. 增强调试工具
# 2. Volume 挂载优化（使用 delegated 模式）
# 3. 健康检查增强
# 4. 智能体友好的日志配置

services:
  # ==================== 基础设施 ====================
  redis:
    image: redis:7-alpine
    container_name: stock-race-redis-dev
    restart: unless-stopped
    ports:
      - "6380:6379"
    volumes:
      - redis_data_dev:/data
    networks:
      - stock-race-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:15-alpine
    container_name: stock-race-postgres-dev
    restart: unless-stopped
    environment:
      POSTGRES_DB: stock_race
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5434:5432"
    volumes:
      - postgres_data_dev:/var/lib/postgresql/data
    networks:
      - stock-race-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  timescaledb:
    image: timescale/timescaledb:latest-pg15
    container_name: stock-race-timescaledb-dev
    restart: unless-stopped
    environment:
      POSTGRES_DB: stock_race_tsdb
      POSTGRES_USER: timescale
      POSTGRES_PASSWORD: password
    ports:
      - "5433:5432"
    volumes:
      - timescaledb_data_dev:/var/lib/postgresql/data
    networks:
      - stock-race-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U timescale"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # ==================== Backend 服务 ====================
  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile.dev-enhanced
    container_name: stock-race-backend-dev
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      # 使用 delegated 模式优化 Windows 性能
      - ./backend/src:/app/src:delegated
      - ./backend/package.json:/app/package.json:delegated
      - ./backend/.env:/app/.env:delegated
      - backend_node_modules:/app/node_modules
      - ./infra/event-bus/src/node:/app/infra/event-bus/src/node:delegated
    environment:
      - NODE_ENV=development
      - PORT=3001
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/stock_race
      - REDIS_URL=redis://redis:6379
      - AI_SERVICE_URL=http://trading-ai-service:8000
      - DATA_SERVICE_URL=http://market-data-service:8001
      - STRICT_MODE=true
      - DISABLE_DATA_FALLBACK=true
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - stock-race-network
    # 保持容器运行，方便智能体调试
    stdin_open: true
    tty: true
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"

  # ==================== Market Data Service ====================
  market-data-service:
    build:
      context: .
      dockerfile: market-data-service/Dockerfile.dev-enhanced
    container_name: stock-race-market-data-dev
    restart: unless-stopped
    ports:
      - "8001:8001"
    volumes:
      - ./market-data-service/src:/app/src:delegated
      - ./market-data-service/.env:/app/.env:delegated
      - ./infra/health-check/src:/app/infra/health-check/src:delegated
    environment:
      - HOST=0.0.0.0
      - PORT=8001
      - DEBUG=True
      - TSDB_HOST=timescaledb
      - TSDB_PORT=5432
      - TSDB_NAME=stock_race_tsdb
      - TSDB_USER=timescale
      - TSDB_PASSWORD=password
      - REDIS_URL=redis://redis:6379
      - BACKEND_URL=http://backend:3001
      - STRICT_MODE=true
      - DISABLE_MOCK_DATA=true
      - FORCE_DB_CONNECTION=true
      - BATCH_SIZE=20
      - BATCH_INTERVAL=3.0
      - HIGH_FREQ_STOCKS=50
      - HIGH_FREQ_INTERVAL=15
      - MID_FREQ_STOCKS=200
      - MID_FREQ_INTERVAL=45
      - LOW_FREQ_STOCKS=4750
      - LOW_FREQ_INTERVAL=60
      - TUSHARE_TOKEN=${TUSHARE_TOKEN}
    depends_on:
      timescaledb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - stock-race-network
    dns:
      - 8.8.8.8
      - 114.114.114.114
    stdin_open: true
    tty: true
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"

  # ==================== Trading AI Service ====================
  trading-ai-service:
    build:
      context: .
      dockerfile: trading-ai-service/Dockerfile.dev-enhanced
    container_name: stock-race-trading-ai-dev
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./trading-ai-service/src:/app/src:delegated
      - ./trading-ai-service/.env:/app/.env:delegated
      - ./infra/health-check/src:/app/infra/health-check/src:delegated
      - ./infra/event-bus/src:/app/infra/event-bus/src:delegated
    environment:
      - HOST=0.0.0.0
      - PORT=8000
      - DEBUG=True
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=stock_race
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      - REDIS_URL=redis://redis:6379
      - BACKEND_URL=http://backend:3001
      - DATA_SERVICE_URL=http://market-data-service:8001
      - STRICT_MODE=true
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - stock-race-network
    stdin_open: true
    tty: true
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"

  # ==================== News Service ====================
  news-service:
    build:
      context: .
      dockerfile: news-service/Dockerfile-enhanced
    container_name: stock-race-news-dev
    restart: unless-stopped
    volumes:
      - ./news-service/src:/app/src:delegated
      - ./infra/event-bus/src:/app/infra/event-bus/src:delegated
      - ./infra/health-check/src:/app/infra/health-check/src:delegated
    environment:
      - PYTHONPATH=/app/src:/app/infra/event-bus/src:/app/infra/health-check/src
      - REDIS_HOST=redis
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=stock_race
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      - STRICT_MODE=true
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - stock-race-network
    stdin_open: true
    tty: true
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"

networks:
  stock-race-network:
    driver: bridge

volumes:
  postgres_data_dev:
  timescaledb_data_dev:
  redis_data_dev:
  backend_node_modules:
```

### 2.4 创建智能体调试工具脚本

**文件路径**：`c:/dev/projects/stock-race/scripts/dev-env.ps1`（PowerShell 脚本）

```powershell
#!/usr/bin/env pwsh
# 智能体开发环境管理脚本（Windows PowerShell）

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "stop", "restart", "logs", "shell", "test", "status", "clean", "env", "ping-db", "ping-redis")]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [ValidateSet("backend", "trading-ai", "market-data", "news", "all")]
    [string]$Service = "all"
)

$ComposeFile = "docker-compose.windows-dev.yml"
$ProjectName = "stock-race"

function Start-Services {
    Write-Host "🚀 启动 Stock Race 开发环境..." -ForegroundColor Green
    docker-compose -f $ComposeFile -p $ProjectName up -d

    Write-Host "⏳ 等待服务健康检查..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    docker-compose -f $ComposeFile -p $ProjectName ps

    Write-Host "`n📋 服务访问地址：" -ForegroundColor Cyan
    Write-Host "  Backend:           http://localhost:3001"
    Write-Host "  Trading AI:        http://localhost:8000"
    Write-Host "  Market Data:       http://localhost:8001"
    Write-Host "  PostgreSQL:        localhost:5434"
    Write-Host "  TimescaleDB:       localhost:5433"
    Write-Host "  Redis:             localhost:6380"
}

function Stop-Services {
    Write-Host "🛑 停止 Stock Race 开发环境..." -ForegroundColor Red
    docker-compose -f $ComposeFile -p $ProjectName down
}

function Restart-Service {
    param([string]$Svc)
    if ($Svc -eq "all") {
        Write-Host "🔄 重启所有服务..." -ForegroundColor Yellow
        docker-compose -f $ComposeFile -p $ProjectName restart
    } else {
        $containerName = "stock-race-${Svc}-dev"
        Write-Host "🔄 重启服务: $containerName" -ForegroundColor Yellow
        docker-compose -f $ComposeFile -p $ProjectName restart $containerName
    }
}

function Show-Logs {
    param([string]$Svc)
    if ($Svc -eq "all") {
        docker-compose -f $ComposeFile -p $ProjectName logs -f
    } else {
        $containerName = "stock-race-${Svc}-dev"
        docker-compose -f $ComposeFile -p $ProjectName logs -f $containerName
    }
}

function Enter-Shell {
    param([string]$Svc)
    $containerName = "stock-race-${Svc}-dev"
    Write-Host "🐚 进入容器: $containerName" -ForegroundColor Cyan
    docker exec -it $containerName sh
}

function Run-Tests {
    param([string]$Svc)
    $containerName = "stock-race-${Svc}-dev"

    switch ($Svc) {
        "backend" {
            docker exec $containerName npm test
        }
        "trading-ai" {
            docker exec $containerName python -m pytest
        }
        "market-data" {
            docker exec $containerName python -m pytest
        }
        default {
            Write-Host "❌ 暂不支持该服务的测试" -ForegroundColor Red
        }
    }
}

function Show-Status {
    docker-compose -f $ComposeFile -p $ProjectName ps
}

function Clean-Environment {
    Write-Host "🧹 清理开发环境（包括数据卷）..." -ForegroundColor Red
    docker-compose -f $ComposeFile -p $ProjectName down -v
    Write-Host "✅ 环境已清理" -ForegroundColor Green
}

function Show-Environment {
    param([string]$Svc)
    $containerName = "stock-race-${Svc}-dev"
    Write-Host "📋 环境变量 ($containerName):" -ForegroundColor Cyan
    docker exec $containerName env | Sort-Object
}

function Test-Connection {
    param([string]$Target)

    switch ($Target) {
        "ping-db" {
            $containerName = "stock-race-backend-dev"
            Write-Host "🌐 测试数据库连接..." -ForegroundColor Cyan
            docker exec $containerName sh -c "nc -zv postgres 5432 && echo '✅ Database connection OK'"
        }
        "ping-redis" {
            $containerName = "stock-race-backend-dev"
            Write-Host "🌐 测试 Redis 连接..." -ForegroundColor Cyan
            docker exec $containerName sh -c "nc -zv redis 6379 && echo '✅ Redis connection OK'"
        }
    }
}

# 主逻辑
switch ($Action) {
    "start" { Start-Services }
    "stop" { Stop-Services }
    "restart" { Restart-Service -Svc $Service }
    "logs" { Show-Logs -Svc $Service }
    "shell" { Enter-Shell -Svc $Service }
    "test" { Run-Tests -Svc $Service }
    "status" { Show-Status }
    "clean" { Clean-Environment }
    "env" { Show-Environment -Svc $Service }
    "ping-db" { Test-Connection -Target "ping-db" }
    "ping-redis" { Test-Connection -Target "ping-redis" }
}
```

**使用方式**：

```powershell
# 启动所有服务
.\scripts\dev-env.ps1 start

# 查看 Backend 日志
.\scripts\dev-env.ps1 logs -Service backend

# 进入 Backend 容器调试
.\scripts\dev-env.ps1 shell -Service backend

# 运行 Backend 测试
.\scripts\dev-env.ps1 test -Service backend

# 查看环境变量
.\scripts\dev-env.ps1 env -Service backend

# 测试数据库连接
.\scripts\dev-env.ps1 ping-db
```

---

## 第三章：兼容性问题预防

### 3.1 Windows 文件权限问题

**问题**：Docker 容器内创建的文件在 Windows 宿主机上显示为"未知用户"

**解决方案**：

在 Dockerfile 中指定用户

```dockerfile
# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs
```

使用 .dockerignore 避免权限问题

```
node_modules
.git
*.log
.env
```

### 3.2 路径分隔符问题

**问题**：Windows 使用 `\`，Linux 使用 `/`

**解决方案**：

Docker Compose 中始终使用 `/`

```yaml
volumes:
  - ./backend/src:/app/src  # 正确
  - .\backend\src:/app/src  # 错误
```

PowerShell 脚本中使用 Join-Path

```powershell
$ProjectRoot = Join-Path $PSScriptRoot ".."
$BackendPath = Join-Path $ProjectRoot "backend"
```

### 3.3 换行符问题

**问题**：Windows CRLF 导致 shell 脚本在 Linux 容器中无法执行

**解决方案**：

已配置 .gitattributes（见 2.1）

编辑器配置 VSCode

```json
// .vscode/settings.json
{
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true
}
```

### 3.4 内存限制问题

**问题**：Windows Docker 默认内存限制可能导致服务 OOM

**解决方案**：

Docker Desktop 设置

```
Settings > Resources > Memory: 8GB+
```

Docker Compose 中设置限制

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

### 3.5 端口冲突问题

**问题**：Windows 上可能有其他服务占用端口

**已配置的非标准端口**：

| 服务 | 容器端口 | 宿主机端口 | 说明 |
|------|----------|------------|------|
| Backend | 3001 | 3001 | 标准端口 |
| Trading AI | 8000 | 8000 | 标准端口 |
| Market Data | 8001 | 8001 | 标准端口 |
| PostgreSQL | 5432 | 5434 | 偏移 +2 |
| TimescaleDB | 5432 | 5433 | 偏移 +1 |
| Redis | 6379 | 6380 | 偏移 +1 |

---

## 第四章：智能体自动化工作流

### 4.1 标准开发流程

```
1. 启动环境
   智能体执行: .\scripts\dev-env.ps1 start

2. 查看状态
   智能体执行: .\scripts\dev-env.ps1 status

3. 修改代码
   - 在 Windows 编辑器中修改代码
   - Volume 挂载自动同步到容器
   - 热重载生效（1-3秒延迟）

4. 查看日志
   智能体执行: .\scripts\dev-env.ps1 logs -Service backend

5. 运行测试
   智能体执行: .\scripts\dev-env.ps1 test -Service backend

6. 调试问题
   智能体执行: .\scripts\dev-env.ps1 shell -Service backend
   进入容器后执行: env, nc -zv postgres 5432, etc.

7. 停止环境
   智能体执行: .\scripts\dev-env.ps1 stop
```

### 4.2 批量修改策略（减少热重载次数）

```
低效模式（智能体应避免）：
修改 A → 等待热重载 → 测试 → 修改 B → 等待热重载 → 测试

高效模式（智能体应采用）：
修改 A + B + C → 等待一次热重载 → 测试
```

### 4.3 调试清单模板

智能体遇到问题时，按此清单排查：

```markdown
## 服务调试清单

### 1. 服务状态检查
- [ ] 执行: .\scripts\dev-env.ps1 status
- [ ] 确认所有服务状态为 "Up"

### 2. 日志检查
- [ ] 执行: .\scripts\dev-env.ps1 logs -Service <服务名>
- [ ] 查看最近的错误信息

### 3. 网络连通性检查
- [ ] 执行: .\scripts\dev-env.ps1 ping-db
- [ ] 执行: .\scripts\dev-env.ps1 ping-redis

### 4. 环境变量检查
- [ ] 执行: .\scripts\dev-env.ps1 env -Service <服务名>
- [ ] 确认关键配置正确

### 5. 进入容器深入调试
- [ ] 执行: .\scripts\dev-env.ps1 shell -Service <服务名>
- [ ] 在容器内执行: ps aux, netstat -tlnp, etc.
```

---

## 第五章：故障排除

### 5.1 常见问题及解决方案

#### Q1: Docker 启动失败，提示 "port is already allocated"

**原因**：宿主机端口被其他程序占用

**解决**：

```powershell
# 查找占用端口的进程
netstat -ano | findstr :3001

# 修改 docker-compose.windows-dev.yml 中的端口映射
ports:
  - "3002:3001"  # 使用 3002 代替 3001
```

#### Q2: 热重载不生效

**原因**：Volume 挂载事件未触发

**解决**：

```powershell
# 方法 1: 重启服务
.\scripts\dev-env.ps1 restart -Service backend

# 方法 2: 进入容器手动重启
docker exec stock-race-backend-dev kill -HUP 1
```

#### Q3: 容器内无法访问外网

**原因**：Windows 防火墙或 DNS 配置问题

**解决**：

```yaml
# 在 docker-compose.windows-dev.yml 中添加 DNS 配置
services:
  backend:
    dns:
      - 8.8.8.8
      - 114.114.114.114
```

#### Q4: 数据库连接失败

**排查步骤**：

```powershell
# 1. 检查数据库容器状态
.\scripts\dev-env.ps1 status

# 2. 测试数据库连通性
.\scripts\dev-env.ps1 ping-db

# 3. 进入数据库容器检查
docker exec -it stock-race-postgres-dev psql -U postgres -c "\l"

# 4. 检查 Backend 环境变量
.\scripts\dev-env.ps1 env -Service backend | findstr DATABASE
```

#### Q5: Volume 挂载后代码不生效

**原因**：Windows 文件系统缓存

**解决**：

```powershell
# 方法 1: 重启 Docker Desktop
# 方法 2: 使用 delegated 模式（已配置）
# 方法 3: 进入容器检查文件
docker exec stock-race-backend-dev cat /app/src/app.js | head
```

### 5.2 性能优化建议

#### 文件系统性能

```yaml
# 已配置在 docker-compose.windows-dev.yml
volumes:
  - ./backend/src:/app/src:delegated  # 使用 delegated 模式
```

#### 内存优化

```powershell
# 在 Docker Desktop Settings 中
# Settings > Resources > Memory: 8GB
# Settings > Resources > Swap: 2GB
```

#### 镜像加速（中国用户）

```json
// Docker Desktop Settings > Docker Engine
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

---

## 第六章：检查清单

### 6.1 首次配置检查清单

- [ ] Docker Desktop 安装完成
- [ ] WSL2 backend 已启用
- [ ] 内存分配 >= 8GB
- [ ] .gitattributes 已创建并提交
- [ ] 增强版 Dockerfile 已创建
- [ ] docker-compose.windows-dev.yml 已创建
- [ ] scripts/dev-env.ps1 已创建
- [ ] 执行 docker-compose -f docker-compose.windows-dev.yml config 验证配置

### 6.2 每日开发检查清单

- [ ] 执行 .\scripts\dev-env.ps1 start 启动环境
- [ ] 执行 .\scripts\dev-env.ps1 status 确认服务健康
- [ ] 开发完成后执行 .\scripts\dev-env.ps1 stop 停止环境

### 6.3 提交代码前检查清单

- [ ] 在容器内运行测试通过
- [ ] 代码换行符为 LF（通过 .gitattributes 保证）
- [ ] Docker 配置变更已测试

---

## 附录

### A. 参考文档

- [Docker Desktop Windows 官方文档](https://docs.docker.com/desktop/windows/)
- [Docker Compose 参考](https://docs.docker.com/compose/)
- [Windows 容器性能优化](https://docs.docker.com/docker-for-windows/#resources)

### B. 常用命令速查

```powershell
# Docker Compose
docker-compose -f docker-compose.windows-dev.yml up -d
docker-compose -f docker-compose.windows-dev.yml down
docker-compose -f docker-compose.windows-dev.yml ps
docker-compose -f docker-compose.windows-dev.yml logs -f

# Docker
docker ps
docker exec -it <container> sh
docker logs -f <container>
docker system prune  # 清理未使用的数据

# 调试
docker exec <container> env
docker exec <container> netstat -tlnp
docker exec <container> ps aux
```

---

*文档版本: 1.0*
*创建日期: 2026-02-24*
*适用于: Windows 10/11 + Docker Desktop + stock-race 项目*
