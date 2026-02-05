# Stock Race 故障排除指南

## 🎯 快速诊断

### 1. 服务状态检查
```bash
# 查看所有服务状态
docker-compose ps

# 或生产环境
docker-compose -f docker-compose.prod.yml ps

# 检查特定服务
docker-compose ps | grep -E "(backend|ai-service|data-service|frontend)"
```

### 2. 日志查看
```bash
# 查看所有服务日志
docker-compose logs --tail=100

# 查看特定服务日志
docker-compose logs backend --tail=50
docker-compose logs ai-service --tail=50
docker-compose logs data-service --tail=50
docker-compose logs frontend --tail=50

# 实时查看日志
docker-compose logs -f backend
```

### 3. 健康检查
```bash
# 检查后端健康状态
curl -f http://localhost:3001/api/health || echo "后端服务异常"

# 检查AI服务健康状态
curl -f http://localhost:8000/api/v1/health/ || echo "AI服务异常"

# 检查数据服务健康状态
curl -f http://localhost:8001/health || echo "数据服务异常"

# 检查前端健康状态
curl -f http://localhost:3000/health 2>/dev/null || echo "前端服务异常"
```

## 🔧 常见问题及解决方案

### 问题1: 服务启动失败

#### 症状
- Docker容器无法启动
- 服务启动后立即退出
- 端口绑定失败

#### 可能原因
1. 端口被占用
2. 环境变量配置错误
3. 镜像构建失败
4. 依赖服务未启动

#### 解决方案
```bash
# 1. 检查端口占用
netstat -tlnp | grep -E ":3000|:3001|:8000|:8001"

# 2. 检查环境变量
cat backend/.env.production | head -20
cat ai-service/.env.production | head -20

# 3. 重新构建镜像
docker-compose build --no-cache

# 4. 清理并重启
docker-compose down -v
docker-compose up -d
```

### 问题2: 数据库连接失败

#### 症状
- 应用启动时数据库连接错误
- API返回数据库错误
- 无法执行数据库操作

#### 可能原因
1. 数据库服务未启动
2. 连接字符串错误
3. 认证失败
4. 网络问题

#### 解决方案
```bash
# 1. 检查数据库服务
docker-compose ps postgres timescaledb redis

# 2. 测试数据库连接
docker-compose exec postgres pg_isready -U prod_user
docker-compose exec timescaledb pg_isready -U tsdb_user
docker-compose exec redis redis-cli -a CHANGE_ME_IN_PRODUCTION ping

# 3. 检查环境变量
echo "DB连接信息:"
echo "DB_HOST: $DB_HOST"
echo "DB_PORT: $DB_PORT"
echo "DB_NAME: $DB_NAME"

# 4. 查看数据库日志
docker-compose logs postgres --tail=50
docker-compose logs timescaledb --tail=50
```

### 问题3: AI服务无响应

#### 症状
- AI交易决策失败
- AI服务API返回错误
- AI模型无法调用

#### 可能原因
1. API密钥未配置或错误
2. AI提供商服务不可用
3. 网络连接问题
4. 服务配置错误

#### 解决方案
```bash
# 1. 检查API密钥配置
cat ai-service/.env.production | grep API_KEY

# 2. 测试AI服务连接
curl -X POST http://localhost:8000/api/v1/health/ \
  -H "Content-Type: application/json"

# 3. 测试模型可用性（需要有效的API密钥）
curl -X POST http://localhost:8000/api/v1/decision/test \
  -H "Content-Type: application/json" \
  -H "X-API-Key: stock-race-ai-key-production" \
  -d '{"model": "gpt-4"}'

# 4. 查看AI服务日志
docker-compose logs ai-service --tail=100
```

### 问题4: 数据服务返回空数据

#### 症状
- 股票数据为空或不全
- 实时报价不更新
- 历史数据缺失

#### 可能原因
1. 数据源API限制
2. 网络连接问题
3. 缓存配置问题
4. 数据解析错误

#### 解决方案
```bash
# 1. 检查数据服务状态
curl http://localhost:8001/health

# 2. 测试数据源连接
curl http://localhost:8001/api/v1/stocks/test

# 3. 检查缓存状态
docker-compose exec redis redis-cli -a CHANGE_ME_IN_PRODUCTION info memory

# 4. 查看数据服务日志
docker-compose logs data-service --tail=100
```

### 问题5: 前端页面加载失败

#### 症状
- 前端页面空白
- JavaScript错误
- API调用失败
- 样式丢失

#### 可能原因
1. 前端构建失败
2. Nginx配置错误
3. API服务不可用
4. 浏览器缓存问题

#### 解决方案
```bash
# 1. 检查前端服务
docker-compose ps frontend nginx

# 2. 检查Nginx配置
docker-compose exec nginx nginx -t

# 3. 测试API连接
curl http://localhost:3001/api/health
curl http://localhost:8000/api/v1/health/
curl http://localhost:8001/health

# 4. 查看前端日志
docker-compose logs frontend --tail=50
docker-compose logs nginx --tail=50

# 5. 浏览器开发者工具检查
# 打开浏览器开发者工具(F12)，查看Console和Network标签
```

### 问题6: 交易执行失败

#### 症状
- 下单失败
- 持仓更新延迟
- 资金计算错误

#### 可能原因
1. 数据库事务问题
2. 并发锁冲突
3. 业务逻辑错误
4. 服务间通信失败

#### 解决方案
```bash
# 1. 检查交易服务日志
docker-compose logs backend --tail=100 | grep -i "trade\|order"

# 2. 检查数据库事务
docker-compose exec postgres psql -U prod_user -d stock_race_prod -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# 3. 测试交易API
curl -X POST http://localhost:3001/api/trades/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [有效token]"

# 4. 检查服务间通信
docker-compose exec backend curl -f http://ai-service:8000/api/v1/health/
docker-compose exec backend curl -f http://data-service:8001/health
```

## 📊 性能问题排查

### 症状: API响应缓慢

#### 诊断步骤
```bash
# 1. 检查服务资源使用
docker stats --no-stream

# 2. 检查数据库性能
docker-compose exec postgres psql -U prod_user -d stock_race_prod -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# 3. 检查Redis性能
docker-compose exec redis redis-cli -a CHANGE_ME_IN_PRODUCTION info stats | grep -E "(total_connections_received|instantaneous_ops_per_sec|total_commands_processed)"

# 4. 监控网络延迟
docker-compose exec backend ping -c 3 ai-service
docker-compose exec backend ping -c 3 data-service
```

#### 优化建议
1. **数据库优化**
   - 添加索引
   - 优化查询语句
   - 调整连接池大小

2. **缓存优化**
   - 增加缓存命中率
   - 优化缓存策略
   - 清理过期缓存

3. **代码优化**
   - 减少不必要的API调用
   - 批量处理数据
   - 异步处理耗时操作

### 症状: 内存使用过高

#### 诊断步骤
```bash
# 1. 查看各容器内存使用
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

# 2. 检查内存泄漏
docker-compose exec backend node -e "console.log(process.memoryUsage())"

# 3. 查看GC情况
docker-compose logs backend --tail=50 | grep -i "gc\|memory"

# 4. 分析堆内存
# 需要启用Node.js调试和生成堆快照
```

#### 解决方案
1. **调整资源限制**
   ```yaml
   # docker-compose.prod.yml
   deploy:
     resources:
       limits:
         memory: 1G
       reservations:
         memory: 256M
   ```

2. **代码优化**
   - 修复内存泄漏
   - 优化数据结构
   - 及时释放资源

3. **配置优化**
   - 调整Node.js堆大小
   - 优化Python GC设置
   - 配置合理的缓存大小

## 🔐 安全问题排查

### 症状: 认证失败

#### 诊断步骤
```bash
# 1. 检查JWT配置
cat backend/.env.production | grep JWT

# 2. 测试认证API
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "test"}'

# 3. 检查Redis会话存储
docker-compose exec redis redis-cli -a CHANGE_ME_IN_PRODUCTION keys "session:*"

# 4. 查看认证日志
docker-compose logs backend --tail=50 | grep -i "auth\|login\|jwt"
```

### 症状: API密钥认证失败

#### 诊断步骤
```bash
# 1. 检查服务间API密钥
cat backend/.env.production | grep API_KEY
cat ai-service/.env.production | grep API_KEY
cat data-service/.env.production | grep API_KEY

# 2. 测试API密钥认证
curl -X GET http://localhost:8000/api/v1/decision/test \
  -H "X-API-Key: stock-race-ai-key-production"

# 3. 验证密钥匹配
echo "后端API_KEY: $(cat backend/.env.production | grep API_KEY | head -1)"
echo "AI服务期望的API_KEY: $(cat ai-service/.env.production | grep BACKEND_API_KEY | head -1)"
```

## 📈 监控与告警

### 关键监控指标
1. **服务可用性**
   - 健康检查状态
   - 服务响应时间
   - 错误率

2. **资源使用**
   - CPU使用率
   - 内存使用率
   - 磁盘空间
   - 网络IO

3. **业务指标**
   - 活跃用户数
   - API调用量
   - 交易成功率
   - 数据更新延迟

### 告警配置
```yaml
# Prometheus告警规则示例
groups:
  - name: stock_race_alerts
    rules:
      - alert: ServiceDown
        expr: up{job=~".*"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "服务 {{ $labels.instance }} 宕机"
          description: "{{ $labels.job }} 服务已宕机超过1分钟"
```

## 🛠️ 维护工具

### 诊断脚本
```bash
#!/bin/bash
# scripts/diagnose.sh

echo "🔍 开始系统诊断..."

echo "1. 检查服务状态"
docker-compose ps

echo "2. 检查健康状态"
curl -f http://localhost:3001/api/health && echo "✅ 后端服务正常" || echo "❌ 后端服务异常"
curl -f http://localhost:8000/api/v1/health/ && echo "✅ AI服务正常" || echo "❌ AI服务异常"
curl -f http://localhost:8001/health && echo "✅ 数据服务正常" || echo "❌ 数据服务异常"

echo "3. 检查数据库连接"
docker-compose exec postgres pg_isready -U prod_user && echo "✅ PostgreSQL正常" || echo "❌ PostgreSQL异常"
docker-compose exec timescaledb pg_isready -U tsdb_user && echo "✅ TimescaleDB正常" || echo "❌ TimescaleDB异常"
docker-compose exec redis redis-cli -a CHANGE_ME_IN_PRODUCTION ping && echo "✅ Redis正常" || echo "❌ Redis异常"

echo "4. 检查资源使用"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo "📋 诊断完成"
```

### 日志分析工具
```bash
#!/bin/bash
# scripts/analyze_logs.sh

echo "📊 分析最近错误日志..."

echo "1. 后端错误"
docker-compose logs backend --tail=200 | grep -i "error\|exception\|failed" | tail -20

echo "2. AI服务错误"
docker-compose logs ai-service --tail=200 | grep -i "error\|exception\|failed" | tail -20

echo "3. 数据服务错误"
docker-compose logs data-service --tail=200 | grep -i "error\|exception\|failed" | tail -20

echo "4. 前端错误"
docker-compose logs frontend --tail=200 | grep -i "error\|exception\|failed" | tail -20
```

## 📞 获取帮助

### 1. 内部资源
- **文档**: `docs/`目录
- **日志**: `logs/`目录（容器内）
- **配置**: `.env.production`文件
- **监控**: Prometheus (http://localhost:9090)

### 2. 外部资源
- **Docker文档**: https://docs.docker.com/
- **PostgreSQL文档**: https://www.postgresql.org/docs/
- **Redis文档**: https://redis.io/documentation
- **FastAPI文档**: https://fastapi.tiangolo.com/

### 3. 社区支持
- **GitHub Issues**: 报告bug和功能请求
- **Stack Overflow**: 技术问题讨论
- **相关技术社区**: Docker、Python、Node.js社区

---

## 📝 故障排除流程

1. **识别症状**: 明确问题表现
2. **收集信息**: 查看日志、监控数据
3. **定位原因**: 分析可能的原因
4. **实施解决方案**: 应用相应的修复
5. **验证结果**: 确认问题已解决
6. **记录经验**: 更新本文档和知识库

---

*本文档最后更新于: 2026-02-05*
*文档维护者: 运维团队*

> 💡 **提示**: 定期更新本文档，添加新的问题和解决方案，建立完善的知识库体系。