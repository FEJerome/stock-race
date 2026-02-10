# News Service 模块开发规划

## 模块概述

**模块名称**: News Service (Python + FastAPI)
**主要职责**: 财经新闻采集、DeepSeek实时处理、结构化情报存储
**数据主权**: 新闻情报数据（stock_intelligence, breaking_news）
**服务端口**: 8002
**存储介质**: PostgreSQL（情报存储，7天TTL）+ Redis（热缓存，24h TTL）

---

## 服务通信标准

### 1. 对外提供接口

| 接口类型 | 路径 | 消费者 | 说明 |
|---------|------|--------|------|
| REST API | `/api/v1/*` | Backend, Trading AI Service | 情报查询、突发新闻 |
| WebSocket | `/ws/intelligence` | Trading AI Service | 实时情报推送 |

### 2. 依赖外部服务

| 服务 | 调用方式 | 用途 | 失败策略 |
|------|---------|------|---------|
| 财经网站爬虫 | HTTP | 新闻采集 | 多源冗余，失败跳过 |
| DeepSeek API | HTTPS | 新闻结构化处理 | 批处理缓存，失败丢弃 |
| PostgreSQL | 直接连接 | 情报存储 | 服务降级 |
| Redis | 直接连接 | 流式缓存、API限流 | 服务降级 |

### 3. Redis 使用规范

```python
# Redis Stream - 原始新闻流（TTL 1小时）
redis.xadd('news:raw', '*', 'content', news_json, maxlen=10000)

# Redis Hash - 结构化情报（TTL 24小时）
redis.hset(f'news:intelligence:{stock_code}', mapping=intelligence)
redis.expire(f'news:intelligence:{stock_code}', 86400)

# 去重缓存 - 新闻指纹（24小时）
redis.setex(f'news:hash:{content_hash}', 86400, '1')
```

### 4. 数据流架构

```
采集器 → Redis Stream (raw, 1h) → DeepSeek处理 → PostgreSQL (7d) + Redis (24h)
                                     ↓
                              过滤（关联度<0.6丢弃）
```

---

## 开发条目（测试驱动）

### Phase 1: 基础设施

#### [T-001] 新闻采集器框架
**功能**: 统一的新闻采集器接口，支持多源采集

**测试要求**:
- [ ] `tests/unit/collectors/test_base_collector.py` - 单元测试：基类接口
- [ ] `tests/unit/collectors/test_sina_finance_collector.py` - 单元测试：新浪财经采集
- [ ] `tests/unit/collectors/test_eastmoney_collector.py` - 单元测试：东方财富采集
- [ ] 模拟测试：使用pytest-httpx模拟HTTP响应
- [ ] 解析测试：验证HTML/JSON解析准确性

**验收标准**:
```python
class BaseNewsCollector(ABC):
    @property
    @abstractmethod
    def source_name(self) -> str: pass

    @abstractmethod
    async def collect(self, limit: int = 100) -> List[RawNews]: pass

# 新浪财经采集器
sina = SinaFinanceCollector()
news = await sina.collect(limit=50)
# news[0].title, news[0].content, news[0].publish_time, news[0].source
```

**依赖**: 无
**预计工时**: 2.5天

---

#### [T-002] Redis Stream 流式处理
**功能**: 原始新闻写入Redis Stream，支持消费者组处理

**测试要求**:
- [ ] `tests/unit/stream/test_redis_stream.py` - 单元测试：Stream操作
- [ ] `tests/integration/stream/test_producer_consumer.py` - 集成测试：生产者消费者
- [ ] 积压测试：验证消费者组积压处理
- [ ] TTL测试：验证1小时后数据自动过期

**验收标准**:
```python
# 生产者
stream = NewsStream()
await stream.publish({
    'title': '茅台发布Q3财报',
    'content': '...',
    'source': '新浪财经',
    'publish_time': '2026-02-10T14:30:00Z'
})

# 消费者
async for news in stream.consume(group='deepseek-processors', consumer='processor-1'):
    await process_news(news)
    await stream.ack(news.id)
```

**依赖**: [T-001]
**预计工时**: 2天

---

### Phase 2: DeepSeek处理流水线

#### [T-003] DeepSeek新闻处理器
**功能**: 调用DeepSeek API处理新闻，提取结构化情报

**测试要求**:
- [ ] `tests/unit/processors/test_deepseek_processor.py` - 单元测试：处理逻辑
- [ ] `tests/integration/processors/test_news_processing.py` - 集成测试：API调用
- [ ] Prompt测试：验证Prompt输出格式符合预期
- [ ] Token控制测试：输出控制在500字节以内
- [ ] 错误处理测试：API失败时重试3次后丢弃

**验收标准**:
```python
processor = DeepSeekNewsProcessor(api_key=os.getenv('DEEPSEEK_API_KEY'))

intelligence = await processor.process({
    'title': '茅台Q3净利润增长20%',
    'content': '贵州茅台今日发布三季报...',
    'source': '证券时报',
    'publish_time': '2026-02-10T14:30:00Z'
})

# 返回结构
{
    'stock_codes': ['600519'],      # 涉及股票
    'sectors': ['白酒'],             # 涉及板块
    'sentiment': 'positive',         # 情感
    'sentiment_confidence': 0.92,    # 置信度
    'importance': 9,                 # 重要性（1-10）
    'summary': '茅台Q3净利润增长20%，超市场预期',  # 50字以内
    'is_breaking': True,             # 是否突发
    'relevance_score': 0.95          # 与A股关联度
}
```

**依赖**: [T-002]
**预计工时**: 3天

---

#### [T-004] 情报过滤与去重
**功能**: 过滤低质量情报，去重相似新闻

**测试要求**:
- [ ] `tests/unit/processors/test_filter.py` - 单元测试：过滤逻辑
- [ ] `tests/unit/processors/test_deduplication.py` - 单元测试：去重逻辑
- [ ] 相似度测试：相似度>0.9的新闻被去重
- [ ] 关联度测试：relevance_score<0.6的新闻被丢弃

**验收标准**:
```python
filter = IntelligenceFilter()
duplicate_detector = DuplicateDetector()

# 过滤
if not filter.should_keep(intelligence):
    logger.info(f"过滤新闻: {intelligence['summary']}")
    continue

# 去重（使用simhash或minhash）
if await duplicate_detector.is_duplicate(intelligence['summary']):
    logger.info("重复新闻，跳过")
    continue
```

**依赖**: [T-003]
**预计工时**: 1.5天

---

### Phase 3: 存储与API

#### [T-005] PostgreSQL情报存储
**功能**: 结构化情报存储，自动过期清理

**测试要求**:
- [ ] `tests/unit/db/test_intelligence_storage.py` - 单元测试：存储操作
- [ ] `tests/integration/db/test_cleanup.py` - 集成测试：自动清理
- [ ] 索引测试：按股票代码查询 < 50ms
- [ ] 过期测试：7天后数据自动删除

**验收标准**:
```sql
-- 情报表
CREATE TABLE stock_intelligence (
    id SERIAL PRIMARY KEY,
    stock_code VARCHAR(10) NOT NULL,
    sentiment VARCHAR(10) CHECK (sentiment IN ('positive', 'negative', 'neutral')),
    sentiment_score DECIMAL(3,2),
    summary VARCHAR(100) NOT NULL,      -- 严格控制100字符
    importance INT CHECK (importance BETWEEN 1 AND 10),
    sectors VARCHAR(50)[],
    is_breaking BOOLEAN DEFAULT FALSE,
    source VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days',
    INDEX idx_stock_code (stock_code),
    INDEX idx_created_at (created_at),
    INDEX idx_expires_at (expires_at)   -- 用于自动清理
);

-- 自动清理（定时任务）
CREATE OR REPLACE FUNCTION clean_expired_intelligence()
RETURNS void AS $$
BEGIN
    DELETE FROM stock_intelligence WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

**依赖**: [T-004]
**预计工时**: 1.5天

---

#### [T-006] Redis热缓存
**功能**: 最新情报写入Redis，支持快速查询

**测试要求**:
- [ ] `tests/unit/cache/test_intelligence_cache.py` - 单元测试：缓存读写
- [ ] `tests/integration/cache/test_redis_ttl.py` - 集成测试：TTL过期
- [ ] 容量测试：单股票最多缓存10条情报

**验收标准**:
```python
cache = IntelligenceCache()

# 写入（自动过期24小时）
await cache.set_intelligence('600519', intelligence)

# 读取
items = await cache.get_intelligence('600519', limit=10)
# 返回最近10条情报，按时间倒序
```

**依赖**: [T-005]
**预计工时**: 1天

---

#### [T-007] 情报查询API
**功能**: REST API供其他服务查询情报

**测试要求**:
- [ ] `tests/integration/api/test_intelligence_api.py` - 集成测试：API端点
- [ ] Token控制测试：返回数据量控制在预算内
- [ ] 缓存测试：优先从Redis读取

**验收标准**:
```bash
# 单股票情报查询
curl http://localhost:8002/api/v1/intelligence/600519
# [{"stock_code":"600519","sentiment":"positive","summary":"...",...}]

# 批量查询（AI Service使用）
curl -X POST http://localhost:8002/api/v1/intelligence/batch \
  -d '{"stock_codes":["600519","000001"]}'
# {"600519":[...],"000001":[...]}

# 突发新闻
curl http://localhost:8002/api/v1/intelligence/breaking
# 返回全市场最重要的5条情报
```

**依赖**: [T-006]
**预计工时**: 1.5天

---

### Phase 4: 实时推送与监控

#### [T-008] WebSocket实时推送
**功能**: 突发重要情报实时推送给订阅者

**测试要求**:
- [ ] `tests/integration/websocket/test_intelligence_push.py` - 集成测试：WebSocket推送
- [ ] 订阅测试：客户端订阅股票，收到推送
- [ ] 过滤测试：只推送is_breaking=True或importance>=8的情报

**验收标准**:
```python
# WebSocket推送
@app.websocket("/ws/intelligence")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await subscribe_intelligence(websocket)

# 当重要情报入库时
await notify_subscribers({
    'type': 'breaking_news',
    'data': intelligence
})
```

**依赖**: [T-007]
**预计工时**: 1.5天

---

#### [T-009] 采集监控与告警
**功能**: 监控采集成功率、DeepSeek处理延迟、情报质量

**测试要求**:
- [ ] `tests/unit/monitoring/test_collection_metrics.py` - 单元测试：指标收集
- [ ] 告警测试：连续失败时触发告警
- [ ] 统计测试：每小时生成采集报告

**验收标准**:
```bash
curl http://localhost:8002/api/v1/monitoring/metrics
# {
#   "collection": {
#     "sources": {"sina": 1000, "eastmoney": 500},
#     "success_rate": 0.98,
#     "avg_latency_ms": 200
#   },
#   "processing": {
#     "deepseek_calls": 3000,
#     "avg_latency_ms": 1500,
#     "filtered_count": 500,
#     "stored_count": 2500
#   },
#   "storage": {
#     "redis_count": 10000,
#     "pg_count": 50000
#   }
# }
```

**依赖**: [T-007]
**预计工时**: 1天

---

#### [T-010] 服务健康检查
**功能**: `/health` 端点，检查数据库、Redis、DeepSeek API可用性

**测试要求**:
- [ ] `tests/integration/api/test_health.py` - 集成测试：健康检查

**验收标准**:
```bash
curl http://localhost:8002/api/v1/health/
# {"status":"healthy","dependencies":{"postgresql":"healthy","redis":"healthy","deepseek":"healthy"}}
```

**依赖**: 无
**预计工时**: 0.5天

---

## 测试脚本目录结构

```
news-service/tests/
├── unit/
│   ├── collectors/                # 采集器测试
│   ├── stream/                    # Stream测试
│   ├── processors/                # 处理器测试
│   ├── db/                        # 数据库测试
│   └── cache/                     # 缓存测试
├── integration/
│   ├── api/                       # API测试
│   ├── stream/                    # Stream集成测试
│   ├── processors/                # 处理器集成测试
│   ├── db/                        # 数据库集成测试
│   └── websocket/                 # WebSocket测试
├── fixtures/                      # 测试数据
└── conftest.py                    # Pytest配置
```

---

## 开发进度留痕

| 条目 | 状态 | 开发日期 | 测试通过日期 | 合并提交 |
|------|------|----------|--------------|----------|
| [T-001] 采集器框架 | 🔲 待开发 | - | - | - |
| [T-002] Redis Stream | 🔲 待开发 | - | - | - |
| [T-003] DeepSeek处理器 | 🔲 待开发 | - | - | - |
| [T-004] 过滤去重 | 🔲 待开发 | - | - | - |
| [T-005] PostgreSQL存储 | 🔲 待开发 | - | - | - |
| [T-006] Redis缓存 | 🔲 待开发 | - | - | - |
| [T-007] 情报API | 🔲 待开发 | - | - | - |
| [T-008] WebSocket推送 | 🔲 待开发 | - | - | - |
| [T-009] 采集监控 | 🔲 待开发 | - | - | - |
| [T-010] 健康检查 | 🔲 待开发 | - | - | - |

---

## 提交规范

1. **分支命名**: `news-service/T-XXX-简短描述`（如 `news-service/T-001-collector`）
2. **提交信息**: `test(news-service): [T-001] 添加采集器框架测试`
3. **PR要求**: 必须包含测试，覆盖率 > 80%
4. **合并前检查**:
   ```bash
   pytest tests/unit -v --cov=src --cov-report=term-missing
   pytest tests/integration -v
   ```

---

## Token控制策略

| 项目 | 预算 | 说明 |
|------|------|------|
| 单条新闻处理 | 2000 tokens | DeepSeek输入+输出 |
| 每日总预算 | 6M tokens | 3000条 × 2000 tokens |
| 单股票查询返回 | 150-200 tokens/条 | 最多10条 = 1500-2000 tokens |
| AI Service总消耗 | < 10000 tokens | 5只股票 + 市场概况 |

---

*最后更新: 2026-02-10*
*负责人: News Service开发团队*
