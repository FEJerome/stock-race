# News Service 联动规范文档

## 文档目的

本文档详细说明 news-service 与其他模块的集成需求、API规范和开发联动要求。负责其他模块开发的智能体应参照本文档进行相应的接口开发。

## 1. 模块关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Stock-Race 平台                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐      HTTP/API       ┌──────────────┐         │
│   │  Frontend    │ ◄─────────────────► │   Backend    │         │
│   │   (3000)     │                     │   (3001)     │         │
│   └──────────────┘                     └──────┬───────┘         │
│                                                │                 │
│                          ┌─────────────────────┼─────────────────┤
│                          │                     │                 │
│                          ▼                     ▼                 │
│   ┌──────────────┐   ┌──────────┐      ┌──────────────┐         │
│   │ Data Service │   │ AI Service│      │ News Service │  ◄── 新增 │
│   │   (8001)     │   │  (8000)   │      │   (8002)     │         │
│   └──────────────┘   └──────────┘      └──────────────┘         │
│                                                │                 │
│                          ┌─────────────────────┘                 │
│                          │                                       │
│                          ▼                                       │
│   ┌──────────────────────────────────────────┐                  │
│   │         AI Decision (提示词模板)          │                  │
│   │   market_conditions.news_sentiment       │                  │
│   └──────────────────────────────────────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Backend 模块集成需求

### 2.1 需要新增的文件

#### 文件1: `backend/src/services/NewsService.js`

**功能**: 作为Backend与News Service的客户端，封装所有API调用

**参考实现** (参考 `DataService.js` 和 `AIService.js`):

```javascript
// backend/src/services/NewsService.js
import axios from 'axios';
import { config } from '../config.js';

export class NewsService {
  constructor() {
    this.baseURL = config.newsServiceUrl || 'http://localhost:8002';
    this.apiKey = config.newsServiceApiKey || 'stock-race-news-key';
    this.timeout = config.newsServiceTimeout || 5000;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      }
    });
  }

  /**
   * 获取股票相关新闻
   * @param {string} stockCode - 股票代码 (如: 000001.SZ)
   * @param {Object} options - 选项 { limit, days }
   * @returns {Promise<Object>} 新闻列表和情绪摘要
   */
  async getStockNews(stockCode, options = {}) {
    const { limit = 20, days = 7 } = options;
    try {
      const response = await this.client.get(`/api/v1/news/stock/${stockCode}`, {
        params: { limit, days }
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to get news for ${stockCode}:`, error.message);
      // 降级: 返回空数据
      return { stock_code: stockCode, news: [], sentiment_summary: null };
    }
  }

  /**
   * 获取市场整体情绪
   * @returns {Promise<Object>} 市场情绪数据
   */
  async getMarketSentiment() {
    try {
      const response = await this.client.get('/api/v1/sentiment/market');
      return response.data;
    } catch (error) {
      console.error('Failed to get market sentiment:', error.message);
      return null;
    }
  }

  /**
   * 获取股票情绪分析
   * @param {string} stockCode - 股票代码
   * @returns {Promise<Object>} 股票情绪数据
   */
  async getStockSentiment(stockCode) {
    try {
      const response = await this.client.get(`/api/v1/sentiment/stock/${stockCode}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get sentiment for ${stockCode}:`, error.message);
      return null;
    }
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health', { timeout: 3000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

// 单例实例
export const newsService = new NewsService();
```

#### 文件2: `backend/src/routes/news.js`

**功能**: 提供Frontend调用的新闻相关API路由

```javascript
// backend/src/routes/news.js
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { newsController } from '../controllers/NewsController.js';

const router = express.Router();

/**
 * @swagger
 * /api/news/stock/{stockCode}:
 *   get:
 *     summary: 获取股票相关新闻
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stockCode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: 成功获取新闻
 */
router.get('/stock/:stockCode', authenticate, (req, res) =>
  newsController.getStockNews(req, res)
);

/**
 * @swagger
 * /api/news/market:
 *   get:
 *     summary: 获取市场要闻
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取市场新闻
 */
router.get('/market', authenticate, (req, res) =>
  newsController.getMarketNews(req, res)
);

/**
 * @swagger
 * /api/news/sentiment/{stockCode}:
 *   get:
 *     summary: 获取股票情绪分析
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stockCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取情绪分析
 */
router.get('/sentiment/:stockCode', authenticate, (req, res) =>
  newsController.getSentiment(req, res)
);

/**
 * @swagger
 * /api/news/sentiment/market:
 *   get:
 *     summary: 获取市场整体情绪
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取市场情绪
 */
router.get('/sentiment/market', authenticate, (req, res) =>
  newsController.getMarketSentiment(req, res)
);

export default router;
```

#### 文件3: `backend/src/controllers/NewsController.js`

**功能**: 新闻相关业务逻辑控制器

```javascript
// backend/src/controllers/NewsController.js
import { newsService } from '../services/NewsService.js';

export class NewsController {
  /**
   * 获取股票新闻
   */
  async getStockNews(req, res) {
    try {
      const { stockCode } = req.params;
      const { limit, days } = req.query;

      const result = await newsService.getStockNews(stockCode, {
        limit: parseInt(limit) || 20,
        days: parseInt(days) || 7
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * 获取市场新闻
   */
  async getMarketNews(req, res) {
    try {
      // 调用News Service获取市场要闻
      const result = await newsService.getMarketNews();

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * 获取股票情绪
   */
  async getSentiment(req, res) {
    try {
      const { stockCode } = req.params;
      const result = await newsService.getStockSentiment(stockCode);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * 获取市场情绪
   */
  async getMarketSentiment(req, res) {
    try {
      const result = await newsService.getMarketSentiment();

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

export const newsController = new NewsController();
```

### 2.2 需要修改的文件

#### 文件: `backend/src/config.js`

**添加配置项**:

```javascript
// backend/src/config.js
export const config = {
  // ... 现有配置

  // News Service 配置
  newsServiceUrl: process.env.NEWS_SERVICE_URL || 'http://localhost:8002',
  newsServiceApiKey: process.env.NEWS_SERVICE_API_KEY || 'stock-race-news-key',
  newsServiceTimeout: parseInt(process.env.NEWS_SERVICE_TIMEOUT || '5000', 10),
};
```

#### 文件: `backend/src/routes/index.js`

**注册新闻路由**:

```javascript
// backend/src/routes/index.js
import newsRoutes from './news.js';

// ... 其他路由

router.use('/news', newsRoutes);
```

#### 文件: `backend/.env.example`

**添加环境变量示例**:

```bash
# News Service 配置
NEWS_SERVICE_URL=http://localhost:8002
NEWS_SERVICE_API_KEY=stock-race-news-key
NEWS_SERVICE_TIMEOUT=5000
```

## 3. AI Service 集成需求

### 3.1 数据消费方式

AI Service **不直接调用** News Service，而是通过 Backend 中转。

### 3.2 数据格式规范

Backend 向 AI Service 传递新闻数据时，使用以下格式：

```python
# 在调用 AI Service 时，组装 market_conditions
market_conditions = {
    "market_trend": "bullish",  # 市场趋势
    "volatility": "medium",     # 波动率
    "news_sentiment": {         # 新闻情绪（由News Service提供）
        "overall": "positive",
        "score": 0.65,
        "recent_headlines": [
            {
                "title": "宁德时代发布超预期财报",
                "sentiment": "positive",
                "impact": "high",
                "source": "sina"
            }
        ],
        "sector_sentiment": {
            "新能源": {"sentiment": "positive", "score": 0.72},
            "金融": {"sentiment": "neutral", "score": 0.15}
        },
        "social_indicators": {   # 社交媒体指标
            "fear_greed_index": 75,  # 恐惧贪婪指数
            "crowd_attention": "high",
            "hot_topics": ["新能源", "AI", "医药"]
        }
    }
}
```

### 3.3 需要修改的文件

#### 文件: `backend/src/services/AIService.js` 或 `EnhancedAIService.js`

**修改决策请求组装逻辑**:

```javascript
// 在调用AI决策前，获取新闻数据并组装
async prepareDecisionRequest(accountId, stockCode) {
    // 1. 获取市场数据
    const marketData = await dataService.getStockQuote(stockCode);

    // 2. 获取新闻和情绪数据 (新增)
    const [stockNews, marketSentiment] = await Promise.all([
        newsService.getStockNews(stockCode, { limit: 10, days: 3 }),
        newsService.getMarketSentiment()
    ]);

    // 3. 组装 market_conditions
    const marketConditions = {
        market_trend: this.inferMarketTrend(marketData),
        volatility: this.calculateVolatility(marketData),
        news_sentiment: {
            overall: marketSentiment?.overall || 'neutral',
            score: marketSentiment?.score || 0,
            recent_headlines: stockNews?.news?.slice(0, 5).map(n => ({
                title: n.title,
                sentiment: n.sentiment?.overall,
                impact: n.market_impact?.severity,
                source: n.source
            })) || [],
            sector_sentiment: marketSentiment?.sector_sentiment || {},
            social_indicators: {
                fear_greed_index: marketSentiment?.fear_greed_index,
                crowd_attention: marketSentiment?.crowd_attention,
                hot_topics: marketSentiment?.hot_topics || []
            }
        }
    };

    return {
        account_id: accountId,
        stock_code: stockCode,
        market_data: marketData,
        market_conditions: marketConditions
    };
}
```

## 4. Frontend 集成需求（可选）

如果需要在前端展示新闻和情绪数据：

### 4.1 API 调用示例

```typescript
// frontend/src/services/news.service.ts
import api from './api';

export const newsService = {
  async getStockNews(stockCode: string, limit: number = 20) {
    const response = await api.get(`/news/stock/${stockCode}`, {
      params: { limit }
    });
    return response.data;
  },

  async getMarketSentiment() {
    const response = await api.get('/news/sentiment/market');
    return response.data;
  }
};
```

## 5. 数据库集成需求

### 5.1 需要创建的数据库

```sql
-- 创建 news_service 专用数据库
CREATE DATABASE stock_race_news;

-- 连接数据库后创建表
\c stock_race_news;

-- 详见: news-service/docs/DATABASE_SCHEMA.sql
```

### 5.2 数据库配置

News Service 使用独立的数据库，与主系统分离：

```bash
# 环境变量
NEWS_DB_HOST=localhost
NEWS_DB_PORT=5432
NEWS_DB_NAME=stock_race_news
NEWS_DB_USER=postgres
NEWS_DB_PASSWORD=postgres
```

## 6. Docker Compose 集成需求

### 6.1 需要添加的服务配置

```yaml
# docker-compose.yml 或 docker-compose.override.yml
services:
  news-service:
    build:
      context: ./news-service
      dockerfile: Dockerfile
    ports:
      - "8002:8002"
    environment:
      - NEWS_SERVICE_PORT=8002
      - NEWS_DB_HOST=postgres
      - NEWS_DB_NAME=stock_race_news
      - REDIS_URL=redis://redis:6379/2
      - AI_SERVICE_URL=http://ai-service:8000
    depends_on:
      - postgres
      - redis
    volumes:
      - ./news-service:/app
    networks:
      - stock-race-network
```

## 7. 开发顺序建议

### Phase 1: News Service 独立开发
1. 搭建基础架构（模型、配置、数据库）
2. 实现2个新闻采集器（新浪、财联社）
3. 实现2个社交采集器（微博、雪球）
4. 实现API端点
5. 编写E2E测试

### Phase 2: Backend 集成开发（并行或后续）
1. 创建 `NewsService.js`
2. 创建 `news.js` 路由
3. 创建 `NewsController.js`
4. 更新 `config.js`
5. 修改 `EnhancedAIService.js` 组装 market_conditions

### Phase 3: 联调测试
1. 运行E2E测试脚本
2. 验证数据流向
3. 测试降级机制

## 8. API 契约汇总

### News Service 提供的服务

| 端点 | 方法 | 请求参数 | 响应格式 | 说明 |
|------|------|----------|----------|------|
| `/health` | GET | - | `{status: "healthy"}` | 健康检查 |
| `/api/v1/news/stock/{code}` | GET | `limit`, `days` | `StockNewsResponse` | 股票新闻 |
| `/api/v1/news/market` | GET | `limit` | `NewsListResponse` | 市场要闻 |
| `/api/v1/sentiment/market` | GET | - | `SentimentIndex` | 市场情绪 |
| `/api/v1/sentiment/stock/{code}` | GET | - | `StockSentimentResponse` | 股票情绪 |

### 响应格式定义

```typescript
// StockNewsResponse
interface StockNewsResponse {
  stock_code: string;
  news: NewsArticle[];
  sentiment_summary: SentimentSummary;
}

// NewsArticle
interface NewsArticle {
  id: string;
  title: string;
  content: string;
  source: string;
  published_at: string;
  sentiment: {
    overall: 'positive' | 'negative' | 'neutral';
    score: number;
  };
}

// SentimentSummary
interface SentimentSummary {
  overall: 'positive' | 'negative' | 'neutral';
  score: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
}

// SentimentIndex (市场情绪)
interface SentimentIndex {
  timestamp: string;
  overall: 'positive' | 'negative' | 'neutral';
  score: number;
  fear_greed_index: number;
  crowd_attention: 'high' | 'medium' | 'low';
  hot_topics: string[];
  sector_sentiment: Record<string, {
    sentiment: string;
    score: number;
  }>;
}
```

## 9. 测试验证清单

### News Service 开发方需保证
- [ ] 所有API端点可正常访问
- [ ] 健康检查端点返回200
- [ ] 数据库连接正常
- [ ] 采集器能正常获取数据
- [ ] E2E测试通过

### Backend 开发方需保证
- [ ] NewsService.js 能正常调用News Service
- [ ] API路由返回正确格式
- [ ] 降级机制正常工作（News Service不可用时）
- [ ] AI决策请求包含news_sentiment数据

## 10. 联系方式

如有疑问，请参考：
- 架构设计: `/home/fe-jerome/.claude/plans/lazy-juggling-raven.md`
- News Service 开发指南: `worktrees/worktree-news-service/news-service/docs/DEVELOPMENT_GUIDE.md`
