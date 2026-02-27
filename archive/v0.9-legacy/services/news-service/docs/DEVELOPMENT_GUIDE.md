# News Service 开发指南

## 项目概述

新闻采集微服务（news-service）是Stock-Race平台的子项目，负责采集金融新闻和社交媒体情绪数据，为AI决策模块提供市场 sentiment 信息。

## 工作树信息

- **工作树路径**: `worktrees/worktree-news-service/`
- **分支**: `worktree-news-service`
- **服务端口**: 8002
- **开发状态**: 独立开发，通过API与backend集成

## 目录结构

```
news-service/
├── src/news_service/           # 主源代码
│   ├── api/                    # API路由层
│   ├── collectors/             # 数据采集器
│   │   ├── news/               # 传统新闻源
│   │   └── social/             # 社交媒体源
│   ├── core/                   # 核心配置
│   ├── models/                 # 数据模型
│   ├── services/               # 业务服务
│   ├── storage/                # 存储层
│   ├── nlp/                    # NLP处理
│   └── prompts/                # AI提示词
├── tests/                      # 测试目录（TDD模式）
│   ├── unit/                   # 单元测试
│   ├── integration/            # 集成测试
│   ├── e2e/                    # 端到端测试
│   └── fixtures/               # 测试数据
├── scripts/                    # 工具脚本
└── docs/                       # 文档
```

## 开发规范

### TDD开发流程

每个功能必须遵循以下流程：

1. **编写测试** (Red)
   - 在对应测试目录创建测试文件
   - 定义测试用例（成功/失败/边界）
   - 运行测试确认失败

2. **实现功能** (Green)
   - 编写最小实现代码
   - 运行测试确认通过

3. **重构优化** (Refactor)
   - 优化代码结构
   - 确保测试仍通过
   - 提交代码

### 测试覆盖率要求

- 单元测试: ≥80%
- 集成测试: 关键路径100%
- E2E测试: 核心业务流程

## 数据源开发规范

### 采集器基类接口

所有采集器必须继承 `BaseCollector` 并实现以下方法：

```python
class BaseCollector(ABC):
    @abstractmethod
    async def collect(self) -> List[Dict]: ...

    @abstractmethod
    async def health_check(self) -> bool: ...

    @property
    @abstractmethod
    def source_name(self) -> str: ...
```

### 社交媒体采集器特殊要求

社交媒体采集器需额外实现：

```python
class SocialMediaCollector(BaseCollector):
    async def extract_sentiment(self, content: str) -> SentimentResult: ...
    async def extract_stock_mentions(self, content: str) -> List[str]: ...
    def calculate_engagement_score(self, post: Dict) -> float: ...
```

## API规范

### 与Backend集成API

| 端点 | 方法 | 功能 | 请求方 |
|------|------|------|--------|
| `/api/v1/news/stock/{code}` | GET | 获取股票相关新闻 | Backend |
| `/api/v1/sentiment/market` | GET | 获取市场整体情绪 | Backend |
| `/api/v1/sentiment/stock/{code}` | GET | 获取股票情绪 | Backend |
| `/health` | GET | 健康检查 | Backend |

### 数据返回格式

```json
{
  "stock_code": "000001.SZ",
  "news": [
    {
      "id": "md5_hash",
      "title": "新闻标题",
      "content": "新闻内容",
      "source": "sina",
      "sentiment": {
        "overall": "positive",
        "score": 0.75
      },
      "published_at": "2026-02-10T10:30:00Z"
    }
  ],
  "sentiment_summary": {
    "overall": "positive",
    "score": 0.65,
    "positive_count": 10,
    "negative_count": 3
  }
}
```

## 环境配置

### 本地开发环境

```bash
# 1. 进入工作树
cd worktrees/worktree-news-service/news-service

# 2. 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 5. 运行测试
pytest tests/ -v

# 6. 启动服务
uvicorn news_service.main:app --reload --port 8002
```

### 环境变量

```bash
# 服务配置
NEWS_SERVICE_PORT=8002
NEWS_SERVICE_HOST=0.0.0.0

# 数据库
NEWS_DB_HOST=localhost
NEWS_DB_PORT=5432
NEWS_DB_NAME=stock_race_news
NEWS_DB_USER=postgres
NEWS_DB_PASSWORD=postgres

# Redis
REDIS_URL=redis://localhost:6379/2

# AI服务
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_API_KEY=stock-race-ai-key

# 采集配置
COLLECTION_INTERVAL_MINUTES=5
ENABLE_AI_SENTIMENT=true
```

## 与其他模块的联动

### 与Backend的集成

Backend需要添加：

1. **NewsService.js** - 服务客户端
2. **news.js路由** - API路由
3. **环境变量** - 服务URL和密钥配置

详见文档: `LINKAGE_SPEC.md`

### 与AI服务的集成

AI服务消费新闻数据的方式：

- 通过Backend中转
- 数据格式: `market_conditions.news_sentiment`
- 无需直接调用

## 提交规范

```bash
# 提交格式
type(scope): subject

# 示例
feat(collectors): 添加微博热搜采集器
test(services): 添加情感分析服务单元测试
docs(api): 更新API文档
```

## 开发检查清单

- [ ] 测试先行，遵循TDD流程
- [ ] 代码通过所有测试
- [ ] 测试覆盖率≥80%
- [ ] 文档已更新
- [ ] API文档已更新
- [ ] 环境变量已配置
- [ ] 健康检查端点可用
