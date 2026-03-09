# Stock-Race项目新手指南

## 📋 文档简介

本指南帮助新会话快速上手Stock-Race项目的开发和使用，包含环境搭建、核心功能使用示例、常见问题解决方案和开发最佳实践。

**目标**：让开发者快速了解项目结构，完成环境搭建，上手开发工作。

## 🚀 快速开始

### 环境要求
- **操作系统**：Ubuntu 20.04+ 或兼容Linux发行版
- **Node.js**：≥20.0.0（当前v18.19.1可用但有警告）
- **Python**：≥3.8（当前3.12.3）
- **Docker**：≥20.10（可选，推荐用于环境一致性）
- **内存**：≥4GB RAM
- **磁盘空间**：≥10GB

### 一键环境搭建（中国网络优化版）

```bash
# 1. 下载项目代码
git clone https://github.com/FEJerome/stock-race.git
cd stock-race

# 2. 安装数据库服务（需要sudo权限）
sudo bash install_databases_china.sh

# 3. 安装Docker（可选，用于容器化部署）
sudo bash install_docker_china.sh

# 4. 将当前用户添加到docker组（容器化部署需要）
sudo usermod -aG docker $USER
newgrp docker  # 或注销重新登录

# 5. 安装应用依赖
cd backend && npm install
cd frontend && npm install
cd ai-service && source venv/bin/activate && pip install -r requirements.txt
cd data-service && source venv/bin/activate && pip install -r requirements.txt
```

### 快速启动服务

#### 方案A：混合部署（开发调试推荐）
```bash
# 在4个独立的终端窗口中分别执行：

# 终端1 - 后端服务（端口3001）
cd backend && npm run dev

# 终端2 - AI服务（端口8000）
cd ai-service && source venv/bin/activate && python -m uvicorn ai_service.main:app --reload --host 0.0.0.0 --port 8000

# 终端3 - 数据服务（端口8001）
cd data-service && source venv/bin/activate && python -m uvicorn data_service.main:app --reload --host 0.0.0.0 --port 8001

# 终端4 - 前端服务（端口3000）
cd frontend && npm run dev
```

#### 方案B：全容器化（环境一致性推荐）
```bash
# 使用Docker Compose一键启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f backend  # 查看后端日志
docker-compose logs -f frontend # 查看前端日志

# 停止服务
docker-compose down
```

### 健康检查
```bash
# 验证所有服务健康状态
echo "=== 后端服务 ==="
curl -s http://localhost:3001/api/health || echo "后端服务未启动"

echo "=== AI服务 ==="
curl -s http://localhost:8000/api/v1/health/ || echo "AI服务未启动"

echo "=== 数据服务 ==="
curl -s http://localhost:8001/health || echo "数据服务未启动"

echo "=== 前端服务 ==="
curl -s http://localhost:3000 | head -5 || echo "前端服务未启动"
```

## 🔍 项目结构快速浏览

```
stock-race/
├── frontend/          # React前端应用（端口3000）
│   ├── src/
│   │   ├── services/market.service.ts  # 市场数据服务（真实数据集成）
│   │   ├── components/StockMarket.tsx  # 实时行情组件
│   │   └── pages/TradePage.tsx         # 交易页面
├── backend/           # Node.js后端API（端口3001）
│   ├── src/
│   │   ├── services/DataService.js     # 数据服务集成（智能降级）
│   │   ├── routes/stock.routes.js      # 股票API路由
│   │   └── services/AIService.js       # AI服务集成（需修复端点）
├── ai-service/        # Python AI决策服务（端口8000）
│   ├── src/ai_service/
│   │   ├── services/decision_service.py  # AI决策逻辑
│   │   └── adapters/openai_adapter.py    # OpenAI适配器
├── data-service/      # Python数据采集服务（端口8001）
│   ├── src/data_service/
│   │   ├── collectors/router.py         # 多数据源路由器
│   │   ├── collectors/sina.py           # 新浪财经数据源
│   │   ├── collectors/tencent.py        # 腾讯财经数据源
│   │   └── collectors/eastmoney.py      # 东方财富数据源
├── docker/            # Docker配置文件
│   ├── postgres/init.sql                # 数据库初始化脚本
│   └── timescaledb/init.sql             # 时序数据库脚本
├── docs/              # 项目文档
│   ├── progress_report.md               # 开发进度报告
│   ├── data_acquisition_plan.md         # 数据获取方案
│   └── usage/QUICK_START.md             # 本文件
└── docker-compose.yml # 全容器化编排配置
```

## 🔧 开发指南

### 核心功能流程
1. **用户登录**：访问 http://localhost:3000，使用默认账户登录
2. **实时行情**：查看中国A股实时数据（平安银行、浦发银行、招商银行、贵州茅台等）
3. **AI交易决策**：AI模型根据市场数据生成交易建议
4. **虚拟交易**：执行买入/卖出操作，管理虚拟持仓
5. **收益监控**：查看投资组合收益曲线和持仓详情

### 开发调试技巧

#### 前端调试
```bash
# 启动前端开发服务器（带热重载）
cd frontend && npm run dev

# 运行前端测试
npm test

# 构建生产版本
npm run build
npm run preview
```

#### 后端调试
```bash
# 启动后端开发服务器
cd backend && npm run dev

# 查看后端API文档
# 访问：http://localhost:3001/api-docs

# 运行后端测试
npm test
```

#### Python服务调试
```bash
# AI服务调试
cd ai-service
python -m uvicorn ai_service.main:app --reload --host 0.0.0.0 --port 8000

# 数据服务调试
cd data-service
python -m uvicorn data_service.main:app --reload --host 0.0.0.0 --port 8001

# 查看API文档
# AI服务：http://localhost:8000/docs
# 数据服务：http://localhost:8001/docs
```

### 数据流架构
```
外部数据源 → 数据服务 → 后端服务 → 前端展示
    ↑           ↑          ↑
（新浪/腾讯/东方财富）  Redis缓存   WebSocket推送
```

## ❓ 常见问题与解决方案

### Q1: Docker安装失败，GPG密钥下载被重置
**原因**：中国网络环境访问国外源受限
**解决方案**：
```bash
# 使用中国镜像源优化版脚本
sudo bash install_docker_china.sh

# 或手动配置阿里云镜像源
```

### Q2: Node.js版本警告（要求≥20.0.0但当前v18.19.1）
**原因**：后端package.json指定了Node.js版本要求
**解决方案**：
- 暂时忽略警告（依赖已安装，可运行）
- 升级Node.js到v20+：`nvm install 20 && nvm use 20`
- 修改后端package.json的engines字段（不推荐）

### Q3: Redis服务未启动
**症状**：数据服务启动失败，连接Redis超时
**解决方案**：
```bash
# 安装并启动Redis
sudo apt-get install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
redis-cli ping  # 验证服务
```

### Q4: Python pip未安装
**症状**：AI和数据服务依赖安装失败
**解决方案**：
```bash
# 安装Python3 pip
sudo apt-get install -y python3-pip

# 验证安装
pip --version
```

### Q5: AI服务API端点不匹配
**症状**：后端调用AI服务返回404错误
**问题**：后端调用`/api/ai/decision`，但AI服务提供`/api/v1/decision/generate`
**临时解决方案**：手动修改AI服务路由或后端调用端点
**长期解决方案**：统一API规范，更新相关代码

### Q6: 实时数据获取延迟或失败
**原因**：外部API限流或网络问题
**解决方案**：
- 检查数据服务监控：`http://localhost:8001/api/v1/monitoring/data-sources`
- 系统会自动降级到备用数据源
- 如所有数据源失败，系统会优雅降级到模拟数据

## 📚 参考文档

### 核心文档
- **项目主文档**：[CLAUDE.md](../../CLAUDE.md) - 项目文档导航中心
- **代码结构地图**：[CODE_MAP.md](../architecture/CODE_MAP.md) - 项目结构与文件功能
- **开发进度报告**：[progress_report.md](../progress_report.md) - 已完成功能清单和验证步骤
- **数据获取方案**：[data_acquisition_plan.md](../data_acquisition_plan.md) - 多数据源策略和技术实现

### 架构文档
- **技术架构**：[TECH_STACK.md](../architecture/TECH_STACK.md) - 技术栈版本和选型理由
- **系统架构**：[SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) - 混合架构设计
- **数据库设计**：[DATABASE_DESIGN.md](../architecture/DATABASE_DESIGN.md) - 数据库ER图和表结构
- **API接口规范**：[API_SPECIFICATION.md](../architecture/API_SPECIFICATION.md) - RESTful API设计

### 开发规范
- **编码标准**：[CODING_STANDARDS.md](../development/CODING_STANDARDS.md) - 编码标准与最佳实践
- **智能体协作**：[GENERIC_COLLABORATION_PLAN.md](../agents/GENERIC_COLLABORATION_PLAN.md) - 多智能体工作流程

### 部署文档
- **部署指南**：[DEPLOYMENT_GUIDE.md](../deployment/DEPLOYMENT_GUIDE.md) - 生产环境部署
- **生产部署指南**：[PRODUCTION_DEPLOYMENT_GUIDE.md](../deployment/PRODUCTION_DEPLOYMENT_GUIDE.md) - 快速部署流程

## 🎯 开发最佳实践

### 1. 环境管理
- **优先使用容器化**：`docker-compose up -d`确保环境一致性
- **中国网络优化**：使用`*_china.sh`脚本解决网络问题
- **版本控制**：使用nvm管理Node.js版本，venv管理Python环境

### 2. 代码开发
- **遵循现有模式**：参考`DataService.js`的智能降级实现
- **API设计**：保持RESTful规范，版本控制（如`/api/v1/`）
- **错误处理**：多层错误处理，用户友好提示

### 3. 数据质量
- **多源验证**：利用三大数据源交叉验证数据准确性
- **缓存策略**：合理使用Redis缓存热点数据
- **监控告警**：实现数据质量评分和健康检查

### 4. 性能优化
- **批量处理**：股票行情数据批量获取，减少API调用
- **连接池**：数据库和Redis使用连接池
- **异步处理**：I/O密集型操作使用异步模式

### 5. 测试验证
- **渐进验证**：逐个服务启动验证，隔离问题
- **端到端测试**：使用`check_environment.sh`验证完整环境
- **数据验证**：定期检查数据新鲜度和准确性

## 📞 支持与沟通

### 问题反馈
1. **环境问题**：检查`docs/progress_report.md`中的已知问题
2. **功能问题**：参考`docs/data_acquisition_plan.md`的数据源限制
3. **代码问题**：查看相关服务的日志和API文档

### 调试资源
- **后端日志**：`backend/logs/` 或 `docker-compose logs backend`
- **前端开发者工具**：浏览器F12控制台
- **API测试**：使用curl或Postman测试接口

### 紧急恢复
```bash
# 快速环境检查
bash check_environment.sh

# 重启所有服务
docker-compose down && docker-compose up -d

# 数据库重置（谨慎使用）
sudo -u postgres psql -c "DROP DATABASE stock_race; CREATE DATABASE stock_race;"
```

---
*本文档最后更新于：2026-02-04*
*文档维护者：本项目首席架构师*