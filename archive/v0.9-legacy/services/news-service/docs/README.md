# News Service 新闻采集服务

## 项目简介

News Service 是 Stock-Race 平台的子项目，负责采集金融新闻和社交媒体情绪数据，为AI决策模块提供市场 sentiment 信息。

## 核心功能

### 数据采集
- **传统新闻源**: 新浪财经、财联社、东方财富、华尔街见闻
- **社交媒体源**: 微博热搜、雪球社区、东方财富股吧、同花顺股吧

### 情感分析
- 规则+AI混合情感分析
- 市场情绪指数计算
- 个股情绪追踪

### API服务
- RESTful API 提供新闻查询
- 市场情绪数据接口
- 健康检查端点

## 快速开始

### 1. 环境准备

```bash
# 进入工作树
cd worktrees/worktree-news-service/news-service

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件配置数据库等
```

### 2. 数据库初始化

```bash
# 创建数据库
psql -U postgres -c "CREATE DATABASE stock_race_news;"

# 执行初始化脚本
psql -U postgres -d stock_race_news -f scripts/init_db.sql
```

### 3. 运行测试

```bash
# 运行所有测试
pytest tests/ -v

# 运行单元测试
pytest tests/unit/ -v

# 运行E2E测试
pytest tests/e2e/ -v

# 带覆盖率报告
pytest tests/ --cov=src --cov-report=html
```

### 4. 启动服务

```bash
# 开发模式
uvicorn news_service.main:app --reload --port 8002

# 生产模式
uvicorn news_service.main:app --host 0.0.0.0 --port 8002
```

## 开发文档

- [开发指南](DEVELOPMENT_GUIDE.md) - 开发规范和TDD流程
- [联动规范](LINKAGE_SPEC.md) - 与其他模块的集成规范
- [数据库设计](DATABASE_SCHEMA.md) - 数据库表结构

## 工作树信息

- **分支**: `worktree-news-service`
- **路径**: `worktrees/worktree-news-service/`
- **服务端口**: 8002

## 与其他模块的关系

```
Frontend (3000)
    ↓
Backend (3001) ←→ News Service (8002)
    ↓
AI Service (8000) 消费 market_conditions.news_sentiment
```

## 开发状态

- [x] 工作树创建
- [x] 目录结构搭建
- [x] 开发文档编写
- [x] E2E测试脚本准备
- [ ] 基础架构实现
- [ ] 采集器开发
- [ ] API端点实现
- [ ] 联调测试
