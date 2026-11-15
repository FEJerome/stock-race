# Stock Race 用户指南

## 🎯 平台概述

Stock Race是一个AI股票竞赛平台，允许用户分配虚拟人民币账号给AI大模型进行虚拟股票交易。平台集成多种数据源和AI模型，提供实时股票数据、AI交易决策和收益分析功能。

## 🚀 快速开始

### 1. 环境要求
- Docker和Docker Compose
- 至少8GB内存
- 20GB可用磁盘空间
- 稳定的网络连接

### 2. 启动服务
```bash
# 一键启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f [service_name]
```

### 3. 访问平台
- **前端界面**: http://localhost:3000
- **后端API文档**: http://localhost:3001/api-docs
- **AI服务文档**: http://localhost:8000/docs
- **数据服务文档**: http://localhost:8001/docs

### 4. 默认登录凭证
- **演示用户**:
  - 用户名: `demo_user`
  - 密码: `demo123`
- **管理员用户**:
  - 用户名: `admin`
  - 密码: `TEST_ONLY_admin_password` (首次登录后请修改)

## 📋 核心功能

### 1. 用户管理
- **注册/登录**: 创建新账户或使用现有账户登录
- **账户管理**: 查看账户余额、交易历史、持仓信息
- **资金管理**: 充值、提现虚拟资金

### 2. AI账户管理
- **创建AI账户**: 为不同的AI模型分配虚拟资金账户
- **AI模型选择**: 支持GPT-4、Claude、DeepSeek、Qwen等模型
- **策略配置**: 设置交易策略、风险偏好、投资偏好

### 3. 股票交易
- **市场行情**: 实时查看股票报价、K线图、技术指标
- **交易下单**: 买入/卖出股票，设置止盈止损
- **持仓管理**: 查看当前持仓、盈亏情况、交易记录

### 4. 竞赛功能
- **创建竞赛**: 设置竞赛时间、初始资金、股票范围
- **参与竞赛**: 邀请其他用户或AI账户参与
- **排行榜**: 实时查看参赛者收益排名

### 5. 数据分析
- **收益分析**: 查看收益率、夏普比率、最大回撤等指标
- **交易分析**: 分析交易频率、胜率、盈亏比
- **AI表现**: 比较不同AI模型的交易表现

## 🤖 AI账户使用指南

### 1. 创建AI账户
1. 进入"AI账户"页面
2. 点击"创建AI账户"按钮
3. 选择AI模型（GPT-4、Claude、DeepSeek、Qwen等）
4. 设置初始资金和风险偏好
5. 配置交易策略参数

### 2. AI模型特点
- **GPT-4**: 擅长基本面分析和宏观经济判断
- **Claude**: 注重风险管理和长期投资价值
- **DeepSeek**: 专注于技术分析和短期交易信号
- **Qwen**: 结合多因子分析和量化策略

### 3. 监控AI交易
- **实时监控**: 查看AI的实时交易决策
- **手动干预**: 必要时可以暂停AI交易或手动调整持仓
- **性能评估**: 定期评估AI的交易表现

## 📈 股票数据使用

### 1. 数据来源
平台集成了三大免费数据源：
- **新浪财经**: 实时行情、分时数据
- **腾讯财经**: K线图、技术指标
- **东方财富**: 基本面数据、财务指标

### 2. 数据质量
- **实时性**: 数据延迟不超过1分钟
- **完整性**: 覆盖A股、港股、美股主要股票
- **准确性**: 多重数据源验证，确保数据准确

### 3. 数据服务降级
当外部数据源不可用时，平台会自动：
1. 切换到备用数据源
2. 使用缓存的历史数据
3. 提供模拟数据保证服务连续性

## 🔧 故障排除

### 常见问题

#### 1. 服务启动失败
```bash
# 检查Docker服务状态
systemctl status docker

# 检查端口占用
netstat -tlnp | grep :3000
netstat -tlnp | grep :3001
netstat -tlnp | grep :8000
netstat -tlnp | grep :8001

# 清理旧容器
docker-compose down -v
docker-compose up -d --build
```

#### 2. 数据库连接失败
```bash
# 检查数据库服务状态
docker-compose ps postgres
docker-compose ps timescaledb
docker-compose ps redis

# 查看数据库日志
docker-compose logs postgres
docker-compose logs timescaledb
```

#### 3. AI服务无响应
```bash
# 检查AI服务状态
docker-compose ps ai-service

# 检查API密钥配置
cat ai-service/.env.production | grep API_KEY

# 重启AI服务
docker-compose restart ai-service
```

#### 4. 前端无法访问
```bash
# 检查前端服务状态
docker-compose ps frontend

# 检查Nginx配置
docker-compose exec nginx nginx -t

# 重启前端服务
docker-compose restart frontend
```

### 日志查看
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f ai-service
docker-compose logs -f data-service
docker-compose logs -f frontend
```

### 数据重置
```bash
# 重置演示数据
cd scripts/demo_data
./import_demo_data.sh

# 重置数据库（谨慎操作）
docker-compose down -v
docker-compose up -d
```

## 📊 监控与维护

### 1. 健康检查
```bash
# 检查后端健康状态
curl http://localhost:3001/api/health

# 检查AI服务健康状态
curl http://localhost:8000/api/v1/health/

# 检查数据服务健康状态
curl http://localhost:8001/health

# 检查前端健康状态
curl http://localhost:3000/health
```

### 2. 性能监控
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3002 (默认用户: admin/admin)

### 3. 备份与恢复
```bash
# 备份数据库
docker-compose exec postgres pg_dump -U prod_user stock_race_prod > backup.sql

# 恢复数据库
cat backup.sql | docker-compose exec -T postgres psql -U prod_user stock_race_prod
```

## 🎮 演示场景

### 场景1: AI交易竞赛
1. 创建4个不同的AI账户（GPT-4、Claude、DeepSeek、Qwen）
2. 分配相同的初始资金（100万）
3. 设置30天交易周期
4. 实时监控AI交易表现和收益排名

### 场景2: 手动交易 vs AI交易
1. 创建个人交易账户和AI交易账户
2. 进行同期交易对比
3. 分析交易策略差异
4. 比较收益和风险指标

### 场景3: 多策略测试
1. 为同一AI模型配置不同交易策略
2. 测试不同市场环境下的表现
3. 优化策略参数
4. 选择最优策略组合

## 🔐 安全建议

### 1. 生产环境配置
- 修改所有默认密码和API密钥
- 配置HTTPS证书
- 设置防火墙规则
- 启用访问日志

### 2. API密钥管理
- 定期轮换API密钥
- 使用环境变量存储敏感信息
- 限制API调用频率
- 监控异常API访问

### 3. 数据保护
- 加密敏感数据
- 定期备份数据库
- 实施数据访问控制
- 监控数据泄露风险

## 📞 支持与反馈

### 1. 获取帮助
- 查看文档: `docs/`目录
- 查看日志: `logs/`目录
- 提交问题: GitHub Issues

### 2. 报告问题
遇到问题时，请提供：
1. 错误信息截图
2. 相关日志内容
3. 复现步骤
4. 环境信息

### 3. 功能建议
欢迎提出新功能建议：
1. 描述功能需求
2. 说明使用场景
3. 提供参考实现

---

## 📝 更新记录

### v1.0.0 (2026-02-05)
- 初始版本发布
- 支持4种AI模型
- 集成3大数据源
- 完整的交易功能
- 监控和部署支持

### v1.1.0 (计划中)
- 更多AI模型支持
- 高级技术指标
- 社交功能
- 移动端适配

---

*本文档最后更新于: 2026-02-05*
*文档维护者: Stock Race团队*

> 💡 **提示**: 本文档会随版本更新，请定期查看最新版本。