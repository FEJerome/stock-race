# Stock Race 生产部署检查清单

## 🎯 部署前检查

### 1. 环境验证
- [ ] Docker版本 >= 20.10
- [ ] Docker Compose版本 >= 2.20
- [ ] 系统内存 >= 8GB
- [ ] 磁盘空间 >= 20GB
- [ ] 网络连接正常

### 2. 配置文件检查
- [ ] `.env.production`文件已创建
- [ ] 所有默认密码已修改
- [ ] API密钥已配置
- [ ] CORS配置正确
- [ ] 数据库连接字符串正确

### 3. 安全配置
- [ ] JWT密钥已设置为强随机字符串
- [ ] 数据库密码复杂度足够
- [ ] Redis密码已设置
- [ ] API密钥已生成并安全存储
- [ ] HTTPS证书已准备（如需要）

## 🚀 部署步骤

### 1. 构建镜像
```bash
# 构建所有服务的生产镜像
docker-compose -f docker-compose.prod.yml build

# 检查镜像构建是否成功
docker images | grep stock-race
```

### 2. 启动服务
```bash
# 启动所有服务
docker-compose -f docker-compose.prod.yml up -d

# 检查服务状态
docker-compose -f docker-compose.prod.yml ps
```

### 3. 数据库初始化
```bash
# 运行数据库迁移
docker-compose -f docker-compose.prod.yml exec backend npm run db:migrate

# 初始化演示数据（可选）
docker-compose -f docker-compose.prod.yml exec backend npm run db:seed
```

### 4. 验证部署
```bash
# 检查所有服务健康状态
./scripts/check_health.sh

# 测试API端点
./scripts/test_api.sh
```

## 🔧 服务验证清单

### 1. 数据库服务
- [ ] PostgreSQL容器运行正常
- [ ] TimescaleDB容器运行正常
- [ ] Redis容器运行正常
- [ ] 数据库连接测试通过
- [ ] 数据库性能正常

### 2. 应用服务
- [ ] 后端服务运行正常 (端口3001)
- [ ] AI服务运行正常 (端口8000)
- [ ] 数据服务运行正常 (端口8001)
- [ ] 前端服务运行正常 (端口3000)
- [ ] Nginx反向代理运行正常 (端口80/443)

### 3. 监控服务
- [ ] Prometheus运行正常 (端口9090)
- [ ] Grafana运行正常 (端口3002)
- [ ] 监控数据采集正常
- [ ] 告警规则已配置

## 📊 健康检查验证

### 1. API健康检查
```bash
# 后端服务
curl -f http://localhost:3001/api/health

# AI服务
curl -f http://localhost:8000/api/v1/health/

# 数据服务
curl -f http://localhost:8001/health

# 前端服务
curl -f http://localhost:3000/health
```

### 2. 数据库健康检查
```bash
# PostgreSQL
docker-compose -f docker-compose.prod.yml exec postgres pg_isready -U prod_user

# TimescaleDB
docker-compose -f docker-compose.prod.yml exec timescaledb pg_isready -U tsdb_user

# Redis
docker-compose -f docker-compose.prod.yml exec redis redis-cli -a CHANGE_ME_IN_PRODUCTION ping
```

### 3. 服务依赖检查
```bash
# 检查服务间通信
docker-compose -f docker-compose.prod.yml exec backend curl -f http://ai-service:8000/api/v1/health/
docker-compose -f docker-compose.prod.yml exec backend curl -f http://data-service:8001/health
docker-compose -f docker-compose.prod.yml exec ai-service curl -f http://backend:3001/api/health
```

## 🔐 安全配置清单

### 1. 环境变量安全
- [ ] 所有`.env.production`文件已从版本控制中排除
- [ ] 生产环境密码已修改（非默认值）
- [ ] API密钥已替换为真实密钥
- [ ] JWT密钥长度 >= 32字符
- [ ] 数据库密码复杂度足够

### 2. 网络安全
- [ ] 防火墙已配置，只开放必要端口
- [ ] HTTPS已启用（生产环境必须）
- [ ] CORS配置正确，不使用`*`
- [ ] 速率限制已启用
- [ ] API访问日志已开启

### 3. 数据安全
- [ ] 数据库备份策略已制定
- [ ] 敏感数据已加密存储
- [ ] 访问控制已配置
- [ ] 审计日志已开启

## 📈 性能优化清单

### 1. 资源限制
- [ ] 容器资源限制已配置
- [ ] 数据库连接池大小已优化
- [ ] Redis内存限制已设置
- [ ] 服务副本数已根据负载调整

### 2. 缓存配置
- [ ] Redis缓存策略已优化
- [ ] 数据服务缓存TTL合理
- [ ] 前端静态资源缓存已配置
- [ ] CDN已配置（如适用）

### 3. 监控告警
- [ ] Prometheus监控指标已收集
- [ ] Grafana仪表板已配置
- [ ] 关键指标告警已设置
- [ ] 日志收集系统已配置

## 🐛 故障排查清单

### 1. 服务启动失败
- [ ] 检查端口占用
- [ ] 检查Docker日志
- [ ] 验证环境变量
- [ ] 检查依赖服务状态

### 2. 数据库连接问题
- [ ] 检查数据库服务状态
- [ ] 验证连接字符串
- [ ] 检查网络连通性
- [ ] 查看数据库日志

### 3. API响应缓慢
- [ ] 检查服务资源使用率
- [ ] 验证数据库性能
- [ ] 检查Redis连接
- [ ] 分析慢查询日志

### 4. AI服务无响应
- [ ] 检查API密钥配置
- [ ] 验证模型可用性
- [ ] 检查网络连接
- [ ] 查看服务日志

## 🔄 维护任务清单

### 1. 日常维护
- [ ] 检查服务健康状态
- [ ] 监控系统资源使用率
- [ ] 检查日志文件大小
- [ ] 验证备份完整性

### 2. 定期维护
- [ ] 更新Docker镜像
- [ ] 清理旧日志文件
- [ ] 优化数据库索引
- [ ] 更新SSL证书

### 3. 应急响应
- [ ] 服务故障恢复流程
- [ ] 数据恢复流程
- [ ] 安全事件响应流程
- [ ] 通信联系列表

## 📋 部署后测试

### 1. 功能测试
```bash
# 用户注册登录测试
./scripts/test_auth.sh

# 股票数据查询测试
./scripts/test_stock_data.sh

# AI交易决策测试
./scripts/test_ai_decision.sh

# 交易下单测试
./scripts/test_trading.sh
```

### 2. 性能测试
```bash
# API响应时间测试
./scripts/test_api_performance.sh

# 并发用户测试
./scripts/test_concurrent_users.sh

# 数据服务压力测试
./scripts/test_data_service_load.sh
```

### 3. 集成测试
```bash
# 端到端流程测试
./scripts/test_e2e.sh

# 服务间通信测试
./scripts/test_service_integration.sh

# 故障切换测试
./scripts/test_failover.sh
```

## 📝 文档清单

### 1. 必需文档
- [ ] 用户指南 (`docs/usage/USER_GUIDE.md`)
- [ ] 管理员指南 (`docs/usage/ADMIN_GUIDE.md`)
- [ ] API文档 (自动生成)
- [ ] 部署指南 (`docs/deployment/DEPLOYMENT_GUIDE.md`)

### 2. 运维文档
- [ ] 监控指南 (`docs/operations/MONITORING_GUIDE.md`)
- [ ] 故障排除指南 (`docs/operations/TROUBLESHOOTING.md`)
- [ ] 备份恢复指南 (`docs/operations/BACKUP_RESTORE.md`)
- [ ] 安全指南 (`docs/operations/SECURITY_GUIDE.md`)

### 3. 开发文档
- [ ] 开发环境设置 (`docs/development/SETUP_GUIDE.md`)
- [ ] API开发指南 (`docs/development/API_GUIDE.md`)
- [ ] 代码规范 (`docs/development/CODING_STANDARDS.md`)
- [ ] 测试指南 (`docs/development/TESTING_GUIDE.md`)

## 🎯 成功标准

### 1. 部署成功标志
- [ ] 所有服务运行状态正常
- [ ] 健康检查全部通过
- [ ] API响应时间 < 500ms
- [ ] 数据库连接稳定
- [ ] 监控数据正常采集

### 2. 功能验证标志
- [ ] 用户注册登录正常
- [ ] 股票数据展示正常
- [ ] AI交易决策正常
- [ ] 交易下单执行正常
- [ ] 收益计算准确

### 3. 性能验证标志
- [ ] 首页加载时间 < 3秒
- [ ] API平均响应时间 < 200ms
- [ ] 数据库查询时间 < 100ms
- [ ] 并发用户支持 >= 100
- [ ] 系统可用性 >= 99.9%

---

## 📞 紧急联系方式

### 技术负责人
- 姓名: [填写姓名]
- 电话: [填写电话]
- 邮箱: [填写邮箱]

### 运维团队
- 值班电话: [填写电话]
- 紧急邮箱: [填写邮箱]
- 监控告警群: [填写群信息]

### 服务提供商
- 云服务商: [填写服务商]
- 支持电话: [填写电话]
- 工单系统: [填写链接]

---

*本文档最后更新于: 2026-02-05*
*文档维护者: 运维团队*

> ⚠️ **注意**: 生产环境部署前，请确保完成所有检查项。未完成的检查项可能导致服务异常或安全风险。