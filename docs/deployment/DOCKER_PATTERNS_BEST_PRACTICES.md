# Docker Patterns 设计哲学与最佳实践

**文档来源**：基于 [everything-claude-code](https://github.com/affaan-m/everything-claude-code) 项目中的 `docker-patterns` 和 `deployment-patterns` 技能整理

**适用场景**：stock-race 项目的 Windows + WSL2 Docker 开发环境

**目标读者**：需要在 Windows 环境下使用 Docker 进行开发的团队成员

---

## 目录

1. [核心设计哲学](#核心设计哲学)
2. [多阶段构建模式](#多阶段构建模式)
3. [层缓存优化](#层缓存优化)
4. [Volume 挂载策略](#volume-挂载策略)
5. [健康检查模式](#健康检查模式)
6. [服务依赖管理](#服务依赖管理)
7. [Windows + WSL 特定优化](#windows--wsl-特定优化)
8. [参考实现模板](#参考实现模板)

---

## 核心设计哲学

### 1.1 分离构建时与运行时

**核心思想**：构建应用和运行应用是两个完全不同的阶段，应该使用不同的环境和依赖。

**类比**：
- 构建阶段 = 建筑工地（需要起重机、脚手架、水泥搅拌车）
- 运行阶段 = 居民入住（只需要家具和日用品）

**Docker 体现**：
```dockerfile
# 阶段 1：建筑工地（装工具）
FROM node:20 AS builder
RUN npm install typescript webpack  # 编译工具
COPY . .
RUN npm run build                    # 生成产物

# 阶段 2：精装公寓（只留必需品）
FROM node:20-alpine
COPY --from=builder /app/dist ./dist  # 只复制编译结果
CMD ["node", "dist/app.js"]
```

### 1.2 不变性与可复现性

**核心思想**：相同的输入应该产生相同的输出，构建过程不应该依赖外部环境。

**原则**：
- 使用确定性的基础镜像版本（`node:20.11.0` 而非 `node:latest`）
- 锁定依赖版本（`package-lock.json` 必须提交）
- 构建过程不依赖外部网络（除了初始下载）

### 1.3 最小权限原则

**核心思想**：容器只应该拥有完成工作所需的最小权限。

**实践**：
```dockerfile
# 不要以 root 运行应用
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
USER nextjs
```

### 1.4 快速反馈循环

**核心思想**：开发环境的修改应该能立即反映在容器中，不需要漫长的重建过程。

**实现**：通过 Volume 挂载将宿主机代码映射到容器内。

---

## 多阶段构建模式

### 2.1 为什么需要多阶段构建

**问题场景**：
```dockerfile
# ❌ 单阶段构建的问题
FROM node:20
COPY . .
RUN npm install                    # 安装所有依赖（包括开发依赖）
RUN npm run build                  # 编译
CMD ["npm", "start"]
```

**产生的问题**：
1. 镜像包含 `typescript`、`webpack` 等构建工具（生产环境不需要）
2. 镜像包含源代码（只需要编译后的 `dist/`）
3. 镜像体积：~1GB

### 2.2 多阶段构建方案

```dockerfile
# ========================================
# 阶段 1：构建环境（工具齐全）
# ========================================
FROM node:20-alpine AS builder
WORKDIR /app

# 先复制 package.json（利用缓存层）
COPY package*.json ./
RUN npm ci

# 复制源代码并构建
COPY . .
RUN npm run build

# ========================================
# 阶段 2：生产环境（精简）
# ========================================
FROM node:20-alpine AS production
WORKDIR /app

# 只从 builder 阶段复制必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# 安全：非 root 用户运行
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3001
CMD ["node", "dist/app.js"]
```

**效果对比**：

| 指标 | 单阶段 | 多阶段 | 优化幅度 |
|-----|-------|-------|---------|
| 镜像大小 | ~1GB | ~150MB | 85% ↓ |
| 构建时间（有缓存） | 5分钟 | 1分钟 | 80% ↓ |
| 攻击面 | 大（含构建工具） | 小（仅运行时） | - |

### 2.3 三阶段构建（开发场景）

对于需要生成 Prisma Client 的项目：

```dockerfile
# 阶段 1：依赖安装（最稳定，缓存命中率最高）
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# 阶段 2：构建（包含开发依赖）
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .
RUN npm run build

# 阶段 3：运行（最小化）
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001
CMD ["node", "dist/app.js"]
```

---

## 层缓存优化

### 3.1 Docker 层缓存原理

**理解层（Layer）**：
- Dockerfile 的每条指令（RUN, COPY, ADD）创建一个层
- 层是只读的，可以被复用
- 如果某层发生变化，该层及之后的所有层都需要重建

**缓存失效规则**：
```dockerfile
# 第 1 层：基础镜像（很少变）
FROM node:20-alpine

# 第 2 层：设置工作目录（不变）
WORKDIR /app

# 第 3 层：复制 package.json（很少变）
COPY package*.json ./

# 第 4 层：安装依赖（很少变，但耗时）
RUN npm ci

# 第 5 层：复制源代码（经常变）⚠️
COPY . .

# 第 6 层：构建（经常变）⚠️
RUN npm run build
```

**问题**：如果你改了 `src/app.ts`，第 5 层失效 → 第 6 层也要重建 → 但 `npm ci` 本来可以不用重新执行！

### 3.2 优化策略：把不变的东西放前面

```dockerfile
# ✅ 正确的顺序：从"最稳定"到"最变化"
FROM node:20-alpine
WORKDIR /app

# 1. 复制依赖描述文件（变化频率：低）
COPY package*.json ./

# 2. 安装依赖（变化频率：低，但耗时）
RUN npm ci

# 3. 复制 Prisma schema（变化频率：中）
COPY prisma ./prisma/
RUN npx prisma generate

# 4. 复制源代码（变化频率：高）
COPY . .

# 5. 构建（变化频率：高）
RUN npm run build
```

### 3.3 开发环境的缓存策略

```yaml
# docker-compose.dev.yml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
      # 利用 BuildKit 缓存
      cache_from:
        - stock-race-backend:latest
    volumes:
      # 绑定挂载：代码变化立即生效
      - ./backend:/app
      # 匿名卷：保护 node_modules 不被宿主机覆盖
      - /app/node_modules
      # 匿名卷：缓存 Prisma Client
      - /app/node_modules/.prisma
```

---

## Volume 挂载策略

### 4.1 开发环境 vs 生产环境的区别

| 环境 | 目标 | Volume 策略 |
|-----|------|------------|
| 开发 | 快速迭代，热重载 | 绑定挂载（Bind Mount） |
| 生产 | 稳定，不可变 | 不挂载（或只挂载数据卷） |
| 测试 | 干净，可复现 | 复制文件（不挂载） |

### 4.2 绑定挂载（开发）

```yaml
services:
  backend:
    volumes:
      # 格式：宿主机路径:容器路径
      - ./backend:/app
```

**效果**：
- 你在 Windows 的 VSCode 中修改 `backend/src/app.ts`
- 容器内的 `/app/src/app.ts` 立即同步变化
- Node.js 检测到文件变化 → 自动重启服务

### 4.3 保护容器内的依赖（匿名卷）

**问题场景**：
```yaml
volumes:
  - ./backend:/app  # 这会把宿主机的 node_modules（可能没有或版本不同）覆盖容器的
```

**解决方案**：
```yaml
volumes:
  - ./backend:/app
  - /app/node_modules  # 匿名卷：使用容器内的 node_modules，不受宿主机影响
```

**原理**：
- Docker 的 Volume 优先级：匿名卷 > 绑定挂载
- `/app/node_modules` 会被匿名卷保护，不随绑定挂载被覆盖

### 4.4 Windows + WSL 的特殊处理

**问题**：Windows 文件系统（NTFS）和 Linux 文件系统（ext4）的权限、时间戳不同，导致：
- 文件监控不生效（inotify 事件不触发）
- 热重载失败
- 性能下降

**解决方案**：
```yaml
services:
  backend:
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      # 使用轮询（polling）替代文件系统事件
      - CHOKIDAR_USEPOLLING=true
      - WATCHPACK_POLLING=true
      # 轮询间隔（毫秒）
      - CHOKIDAR_INTERVAL=1000
    # 或者使用 WSL 文件系统（推荐）
    # 将项目放在 WSL 文件系统中（如 /home/username/projects/）
    # 而不是 Windows 文件系统（如 C:/Users/...）
```

---

## 健康检查模式

### 5.1 为什么需要健康检查

**场景**：容器启动了，但应用还没准备好接受请求。

```
时间点 0s:   容器启动
时间点 5s:   数据库连接建立
时间点 10s:  Prisma Client 初始化完成
时间点 15s:  应用真正可以处理请求

问题：如果只检查"容器是否运行"，会在 5-15s 期间返回"健康"，但实际上还不能用
```

### 5.2 基础健康检查

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1
```

**参数说明**：
- `interval=30s`：每 30 秒检查一次
- `timeout=3s`：请求 3 秒没响应算失败
- `start-period=10s`：给应用 10 秒启动时间（这段时间内失败不算）
- `retries=3`：连续失败 3 次才标记为 unhealthy

### 5.3 深度健康检查

检查应用依赖的所有外部服务：

```typescript
// /api/health 路由实现
app.get('/api/health', async (req, res) => {
  const checks = {
    api: 'ok',
    database: 'unknown',
    redis: 'unknown',
    timestamp: new Date().toISOString()
  };

  // 检查数据库
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (err) {
    checks.database = 'error';
    return res.status(503).json(checks);
  }

  // 检查 Redis
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch (err) {
    checks.redis = 'error';
    return res.status(503).json(checks);
  }

  res.json(checks);
});
```

### 5.4 Docker Compose 中使用健康检查

```yaml
services:
  backend:
    build: ./backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  frontend:
    build: ./frontend
    depends_on:
      backend:
        condition: service_healthy  # 等 backend 真正健康后才启动
```

---

## 服务依赖管理

### 6.1 启动顺序问题

**问题**：
```yaml
services:
  backend:
    depends_on:
      - postgres  # 只保证 postgres 容器启动，不保证它ready
```

**实际场景**：
```
0s:  postgres 容器启动（但数据库还没初始化完）
1s:  backend 容器启动（尝试连接 postgres → 失败 → 崩溃）
5s:  postgres 初始化完成
```

### 6.2 正确的依赖管理

```yaml
services:
  postgres:
    image: postgres:15
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    depends_on:
      postgres:
        condition: service_healthy  # 等 postgres 真正 ready

  # 或者使用 wait-for-it 脚本
  backend-alt:
    build: ./backend
    command: ["./wait-for-it.sh", "postgres:5432", "--", "npm", "start"]
```

### 6.3 使用 restart 策略

```yaml
services:
  backend:
    build: ./backend
    restart: unless-stopped  # 崩溃后自动重启
    deploy:
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
```

---

## Windows + WSL 特定优化

### 7.1 文件系统选择

**方案 A：项目放在 Windows 文件系统（C:/Users/...）**
- ✅ 方便在 Windows 的 VSCode、文件管理器中访问
- ❌ WSL 访问速度慢（跨文件系统）
- ❌ 文件监控需要轮询（CPU 占用高）

**方案 B：项目放在 WSL 文件系统（/home/username/...）**
- ✅ 原生 Linux 性能
- ✅ 文件监控正常工作
- ❌ Windows 程序访问需要 `\\wsl$\` 路径

**推荐方案 B**，通过以下方式优化 Windows 访问：

```bash
# 在 WSL 中创建项目目录
mkdir -p ~/projects/stock-race
cd ~/projects/stock-race

# 创建符号链接方便 Windows 访问（可选）
# 在 Windows PowerShell（管理员）中：
# New-Item -ItemType SymbolicLink -Path "C:\projects" -Target "\\wsl$\Ubuntu\home\username\projects"
```

### 7.2 Docker Desktop WSL2 后端配置

**Docker Desktop 设置**：
1. Settings → General → Use the WSL 2 based engine ✅
2. Settings → Resources → WSL Integration → 启用你的 WSL 发行版

**内存限制**（防止 WSL2 占用过多内存）：
```ini
# C:\Users\<用户名>\.wslconfig
[wsl2]
memory=8GB
processors=4
swap=2GB
localhostForwarding=true
```

### 7.3 开发环境完整配置

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "3001:3001"
    volumes:
      # 使用相对路径，适配 WSL 和 Windows
      - ./backend:/app
      - /app/node_modules
      - /app/dist
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://user:pass@postgres:5432/stock_race
      # Windows + WSL 文件监控修复
      - CHOKIDAR_USEPOLLING=true
      - WATCHPACK_POLLING=true
      # 调试
      - DEBUG=app:*
    command: ["npm", "run", "dev"]  # 使用 nodemon 等热重载工具
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: stock_race
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d stock_race"]
      interval: 5s
      timeout: 5s
      retries: 5
    ports:
      - "5432:5432"  # 暴露端口方便 Windows 客户端连接

volumes:
  postgres_data:
```

---

## 参考实现模板

### Backend Dockerfile（生产）

```dockerfile
# ========================================
# stock-race Backend Dockerfile (Production)
# ========================================

# 阶段 1：依赖安装
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 阶段 2：构建
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .
RUN npm run build

# 阶段 3：运行
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 安全：创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 backend

# 只复制必要文件
COPY --from=deps --chown=backend:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=backend:nodejs /app/dist ./dist
COPY --from=builder --chown=backend:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=backend:nodejs /app/prisma ./prisma
COPY --chown=backend:nodejs package.json ./

USER backend

EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/app.js"]
```

### Backend Dockerfile（开发）

```dockerfile
# ========================================
# stock-race Backend Dockerfile (Development)
# ========================================

FROM node:20-alpine
WORKDIR /app

# 安装开发工具
RUN apk add --no-cache curl

# 先安装依赖（利用缓存）
COPY package*.json ./
RUN npm install

# Prisma 生成（也会在 volume 挂载后再次生成）
COPY prisma ./prisma/
RUN npx prisma generate

EXPOSE 3001

# 开发模式：使用 npm run dev（热重载）
CMD ["npm", "run", "dev"]
```

### Python Service Dockerfile

```dockerfile
# ========================================
# stock-race Python Service Dockerfile
# ========================================

FROM python:3.11-slim AS builder

WORKDIR /app

# 安装编译依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# 运行阶段
FROM python:3.11-slim

WORKDIR /app

# 从 builder 复制依赖
COPY --from=builder /root/.local /root/.local

# 复制应用代码
COPY ./src ./src

# 确保使用本地安装的包
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 检查清单

### 创建新 Dockerfile 时检查

- [ ] 是否使用了多阶段构建？
- [ ] 依赖安装是否在源代码复制之前？
- [ ] 是否使用了确定性的基础镜像版本（非 latest）？
- [ ] 生产镜像是否使用了非 root 用户？
- [ ] 是否配置了健康检查？
- [ ] 是否只复制了必要的文件（排除了 .git, node_modules 等）？
- [ ] 是否清理了缓存（npm cache, apt cache）？

### 创建 docker-compose.yml 时检查

- [ ] 开发环境是否使用了 Volume 挂载？
- [ ] 是否保护了容器内的依赖（匿名卷）？
- [ ] 服务依赖是否配置了 condition: service_healthy？
- [ ] Windows + WSL 环境是否配置了 CHOKIDAR_USEPOLLING？
- [ ] 数据库等数据服务是否配置了持久化卷？
- [ ] 是否配置了适当的重启策略？

---

## 相关文档

- [Docker 官方最佳实践](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Docker Compose 规范](https://compose-spec.io/)
- [WSL2 文件系统性能](https://docs.microsoft.com/en-us/windows/wsl/compare-versions#performance-across-os-file-systems)
- 本项目相关：
  - [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
  - [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md)
  - [DOCKER_NETWORK_ISSUE_SOLUTION_SUMMARY.md](./DOCKER_NETWORK_ISSUE_SOLUTION_SUMMARY.md)

---

**文档版本**：v1.0
**最后更新**：2026-02-25
**维护者**：基于 everything-claude-code 项目整理
