# 联调模式完整指南 - 强制使用真实数据

> **版本**: v1.0
> **更新日期**: 2026-02-13
> **适用阶段**: 跨服务链条联调测试

---

## 一、核心原则

联调阶段 **严格禁止使用任何模拟/降级数据**：

1. ✅ **真实数据库**: PostgreSQL (端口5434) + TimescaleDB (端口5433)
2. ✅ **真实Redis**: 端口6379，用于事件总线和缓存
3. ✅ **真实API调用**: 股票数据源使用新浪财经/腾讯财经等真实接口
4. ✅ **真实AI模型**: DeepSeek/OpenAI等真实模型API调用
5. ❌ **禁止模拟数据**: 所有`mock/fallback/simulated`逻辑已禁用
6. ❌ **禁止内存回退**: 数据库连接失败时抛出异常，不回退到内存模式

---

## 二、环境配置状态

### 2.1 基础设施 (Docker)

| 服务 | 容器名 | 本地端口 | 状态检查命令 |
|------|--------|----------|-------------|
| Redis | stock-race-redis | 6379 | `docker exec stock-race-redis redis-cli ping` |
| PostgreSQL | stock-race-postgres | 5434 | `docker exec stock-race-postgres pg_isready -U postgres` |
| TimescaleDB | stock-race-timescaledb | 5433 | `docker exec stock-race-timescaledb pg_isready -U timescale` |

### 2.2 服务严格模式配置

**Backend** (`backend/.env`):
```bash
# 数据库连接真实PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/stock_race
REDIS_URL=redis://localhost:6379

# 联调严格模式
STRICT_MODE=true
DISABLE_DATA_FALLBACK=true
```

**Market Data Service** (`market-data-service/.env`):
```bash
# 数据库连接真实TimescaleDB
TSDB_HOST=localhost
TSDB_PORT=5433
TSDB_NAME=stock_race_tsdb
TSDB_USER=timescale
TSDB_PASSWORD=password

# 联调严格模式
STRICT_MODE=true
DISABLE_MOCK_DATA=true
FORCE_DB_CONNECTION=true
```

**Trading AI Service** (`trading-ai-service/.env`):
```bash
# 数据库连接真实PostgreSQL
DB_HOST=localhost
DB_PORT=5434
DB_NAME=stock_race
DB_USER=postgres
DB_PASSWORD=postgres

# 联调严格模式
STRICT_MODE=true
```

---

## 三、快速启动

### 3.1 一键启动所有服务

```bash
# 进入项目目录
cd /home/fe-jerome/projects/stock-race

# 启动所有服务（自动验证基础设施和数据库连接）
./start_integration_mode.sh
```

### 3.2 单独启动服务

```bash
# 仅启动Backend
./start_integration_mode.sh backend

# 仅启动Market Data
./start_integration_mode.sh market

# 仅启动Trading AI
./start_integration_mode.sh ai
```

### 3.3 手动启动（调试模式）

```bash
# 终端1: Backend
export STRICT_MODE=true
export DISABLE_DATA_FALLBACK=true
cd backend && npm run dev

# 终端2: Market Data Service
export STRICT_MODE=true
export DISABLE_MOCK_DATA=true
export FORCE_DB_CONNECTION=true
cd market-data-service
python -m uvicorn data_service.main:app --host 0.0.0.0 --port 8001 --reload

# 终端3: Trading AI Service
export STRICT_MODE=true
cd trading-ai-service
python -m uvicorn ai_service.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 四、验证清单

### 4.1 启动前验证

```bash
# 1. 验证Docker基础设施
docker-compose ps
# 应看到: postgres, timescaledb, redis 都是 healthy

# 2. 验证数据库连接
docker exec stock-race-postgres psql -U postgres -d stock_race -c "SELECT 1;"
docker exec stock-race-timescaledb psql -U timescale -d stock_race_tsdb -c "SELECT 1;"
docker exec stock-race-redis redis-cli ping

# 3. 验证表结构存在
docker exec stock-race-postgres psql -U postgres -d stock_race -c "\\dt"
docker exec stock-race-timescaledb psql -U timescale -d stock_race_tsdb -c "\\dt"
```

### 4.2 启动后验证

```bash
# 4. 验证各服务健康

# Backend
http://localhost:3001/api/health

# Market Data Service
http://localhost:8001/health

# Trading AI Service
http://localhost:8000/api/v1/health/
```

### 4.3 数据流验证

```bash
# 5. 验证Backend -> Market Data 通信
curl http://localhost:3001/api/stocks/000001.SZ/quote
# 预期: 返回真实股票数据，不是模拟数据

# 6. 验证Market Data 从真实数据源采集
tail -f market-data-service/market-data.log | grep -E "(sina|tencent|eastmoney)"
# 预期: 看到从真实数据源采集的日志

# 7. 验证数据写入TimescaleDB
docker exec stock-race-timescaledb psql -U timescale -d stock_race_tsdb -c "SELECT * FROM stock_quotes ORDER BY timestamp DESC LIMIT 5;"
```

---

## 五、问题排查

### 5.1 数据库连接失败

**症状**: 服务启动报错，提示连接TimescaleDB/PostgreSQL失败

**检查步骤**:
```bash
# 1. 确认容器运行
docker ps | grep -E "(postgres|timescaledb)"

# 2. 确认端口映射
docker port stock-race-postgres      # 应看到 5432/tcp -> 0.0.0.0:5434
docker port stock-race-timescaledb   # 应看到 5432/tcp -> 0.0.0.0:5433

# 3. 测试连接
docker exec stock-race-postgres psql -U postgres -c "SELECT 1;"
docker exec stock-race-timescaledb psql -U timescale -c "SELECT 1;"
```

### 5.2 出现"模拟数据"警告

**症状**: 日志中出现 "simulated data", "fallback", "mock" 等字样

**处理**:
- 检查环境变量 `STRICT_MODE=true` 是否设置
- 检查 `.env` 文件配置
- 重启服务使配置生效

### 5.3 股票数据不真实

**症状**: 返回的股票价格明显不合理（如固定值、过时数据）

**检查步骤**:
```bash
# 检查数据源配置
curl http://localhost:8001/api/v1/stocks/000001.SZ/quote
# 查看返回中的 data_source 字段
# 应为 "sina", "tencent", "eastmoney" 等真实数据源
# 不应为 "simulated", "fallback", "mock"
```

---

## 六、关键代码修改记录

### 6.1 Backend - DataService.js

**修改点**:
- 添加 `strictMode` 标志检查环境变量
- `shouldUseFallback()` 在严格模式下返回 `false`
- `getRealtimeData()` 失败时抛出异常，不返回模拟数据
- `batchGetRealtimeData()` 失败时抛出异常，不返回模拟数据

### 6.2 Backend - models/index.js

**修改点**:
- 移除了默认的 mock competitionRepository
- 移除了默认的 mock prisma
- 添加 `DATABASE_URL` 检查，未配置时抛出错误

### 6.3 Market Data Service - database.py

**修改点**:
- 数据库连接失败时抛出 `RuntimeError`，不回退到内存模式
- 移除自动降级到模拟数据的逻辑

---

## 七、日志检查要点

### 7.1 Backend 日志

```bash
tail -f backend/backend.log | grep -E "(ERROR|WARN|严格模式|模拟数据|fallback|mock)"
```

**期望**: 没有 "模拟数据"、"fallback" 相关日志

### 7.2 Market Data 日志

```bash
tail -f market-data-service/market-data.log | grep -E "(ERROR|WARN|connected|TimescaleDB|simulated|fallback)"
```

**期望**: 看到 "Connected to TimescaleDB"
**不应**: 看到 "Falling back to in-memory mode"

### 7.3 Trading AI 日志

```bash
tail -f trading-ai-service/trading-ai.log | grep -E "(ERROR|WARN|数据库|Redis|mock|fallback)"
```

---

## 八、联调测试前置条件

在开始进行跨服务链条联调测试前，请确认：

- [ ] Docker基础设施全部运行 (Redis/PostgreSQL/TimescaleDB)
- [ ] 数据库表结构已创建
- [ ] 各服务 `.env` 文件已配置严格模式
- [ ] Backend 启动成功，健康检查返回200
- [ ] Market Data Service 启动成功，健康检查返回200
- [ ] Trading AI Service 启动成功，健康检查返回200
- [ ] Backend -> Market Data 通信正常
- [ ] 获取股票数据返回真实数据（非模拟）
- [ ] Redis Streams 可正常读写
- [ ] 小程序配置指向正确的服务IP

---

## 九、相关文档

- [跨服务链条联调测试方案](docs/testing/CHAIN_INTEGRATION_TEST_PLAN.md)
- [小程序联调准备验证文档](docs/modules/miniprogram/INTEGRATION_READINESS.md)
- [六服务架构详细设计](docs/architecture/CURRENT/SERVICE_ARCHITECTURE.md)

---

*文档版本: v1.0*
*最后更新: 2026-02-13*
*维护者: 首席架构师*
