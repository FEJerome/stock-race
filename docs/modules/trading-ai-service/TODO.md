# Trading AI Service 模块开发规划

## 模块概述

**模块名称**: Trading AI Service (Python + FastAPI)
**主要职责**: AI模型集成、交易决策生成、提示词工程、决策日志记录
**数据主权**: 决策数据（decisions, prompts, execution_logs）
**服务端口**: 8000
**存储介质**: PostgreSQL（决策日志）+ Redis（推理缓存）

---

## 服务通信标准

### 1. 对外提供接口

| 接口类型 | 路径 | 消费者 | 说明 |
|---------|------|--------|------|
| REST API | `/api/v1/*` | Backend | AI决策、提示词提炼、模型管理 |
| Internal | `/internal/*` | Backend | 内部回调接口（需要API Key） |

### 2. 依赖外部服务

| 服务 | 调用方式 | 用途 | 失败策略 |
|------|---------|------|---------|
| OpenAI API | HTTPS | GPT-4/GPT-3.5 模型调用 | 降级到DeepSeek |
| DeepSeek API | HTTPS | DeepSeek Chat/V3 模型调用 | 降级到备用模型 |
| Anthropic API | HTTPS | Claude 模型调用（可选） | 降级到OpenAI |
| Market Data Service | HTTP (`http://market-data-service:8001`) | 获取行情数据 | 缓存兜底 |
| News Service | HTTP (`http://news-service:8002`) | 获取新闻情报 | 可选，失败返回空 |
| PostgreSQL | 直接连接 | 决策日志存储 | 服务降级 |
| Redis | 直接连接 | 推理缓存、限流 | 服务降级 |

### 3. 模型调用规范

```python
# 统一模型接口
class BaseModelAdapter(ABC):
    async def generate(self, prompt: str, context: Dict) -> ModelResponse:
        pass

# 支持的模型
MODELS = {
    'gpt-4-turbo': OpenAIAdapter,
    'gpt-3.5-turbo': OpenAIAdapter,
    'deepseek-chat': DeepSeekAdapter,
    'deepseek-v3': DeepSeekAdapter,
    'claude-3-opus': ClaudeAdapter,
    'claude-3-sonnet': ClaudeAdapter,
}
```

### 4. Redis 使用规范

```python
# 决策缓存（避免重复调用AI）
redis.setex(f"ai:decision:{account_id}:{hash}", 300, decision_json)  # TTL 5分钟

# 限流计数
redis.incr(f"rate_limit:{api_key}")
redis.expire(f"rate_limit:{api_key}", 60)

# Token使用统计
redis.hincrby(f"token_usage:{account_id}", "daily", tokens_used)
```

---

## 开发条目（测试驱动）

### Phase 1: 基础设施

#### [T-001] AI模型适配器基类与工厂
**功能**: 定义统一的模型适配器接口，实现适配器工厂

**测试要求**:
- [ ] `tests/unit/adapters/test_base_adapter.py` - 单元测试：基类接口定义
- [ ] `tests/unit/adapters/test_adapter_factory.py` - 单元测试：工厂模式
- [ ] 配置测试：根据环境变量初始化不同适配器
- [ ] 降级测试：主模型失败时自动切换到备用模型

**验收标准**:
```python
# 工厂创建
adapter = AdapterFactory.create('deepseek-chat')
assert isinstance(adapter, DeepSeekAdapter)

# 统一调用
response = await adapter.generate(
    prompt="分析股票000001的买入时机",
    context={"temperature": 0.7, "max_tokens": 2000}
)
assert response.content is not None
assert response.usage.total_tokens > 0
```

**依赖**: 无
**预计工时**: 2天

---

#### [T-002] DeepSeek/OpenAI/Claude适配器实现
**功能**: 实现具体模型的API调用适配器

**测试要求**:
- [ ] `tests/unit/adapters/test_deepseek_adapter.py` - 单元测试：DeepSeek API调用
- [ ] `tests/unit/adapters/test_openai_adapter.py` - 单元测试：OpenAI API调用
- [ ] `tests/unit/adapters/test_claude_adapter.py` - 单元测试：Claude API调用
- [ ] Mock测试：模拟API响应，验证解析逻辑
- [ ] 错误处理测试：API限流、超时、错误码处理

**验收标准**:
```python
# DeepSeek适配器
adapter = DeepSeekAdapter(api_key=os.getenv('DEEPSEEK_API_KEY'))
response = await adapter.generate(prompt, context)
# response.content - 生成的文本
# response.usage.prompt_tokens - 输入token数
# response.usage.completion_tokens - 输出token数
# response.usage.total_tokens - 总token数

# 错误处理
try:
    response = await adapter.generate(prompt, context)
except RateLimitError:
    # 触发降级
    adapter = AdapterFactory.create_fallback()
```

**依赖**: [T-001]
**预计工时**: 3天

---

#### [T-003] 提示词模板系统
**功能**: 提示词模板管理，支持变量替换和版本控制

**测试要求**:
- [ ] `tests/unit/prompts/test_template_engine.py` - 单元测试：模板渲染
- [ ] `tests/unit/prompts/test_trading_prompts.py` - 单元测试：交易提示词
- [ ] 变量测试：验证所有变量正确替换
- [ ] 边界测试：空值、超长内容的处理

**验收标准**:
```python
# 提示词模板
TRADING_DECISION_PROMPT = """
你是一个{role}，{identity}。

投资理念：{philosophy}
风险偏好：{risk_profile}
关注领域：{focus_sectors}

当前持仓：
{positions}

市场数据：
{market_data}

请给出交易决策（JSON格式）：
{{
    "action": "buy/sell/hold",
    "symbol": "股票代码",
    "quantity": 数量,
    "reason": "决策理由（50字以内）",
    "confidence": 0.85
}}
"""

# 渲染
prompt = PromptTemplate.render(TRADING_DECISION_PROMPT, context)
```

**依赖**: [T-002]
**预计工时**: 2天

---

### Phase 2: 核心决策服务

#### [T-004] 交易决策生成服务
**功能**: 接收账户信息和市场数据，调用AI模型生成交易决策

**测试要求**:
- [ ] `tests/unit/services/test_decision_service.py` - 单元测试：决策逻辑
- [ ] `tests/integration/services/test_decision_generation.py` - 集成测试：完整流程
- [ ] 缓存测试：相同输入5分钟内返回缓存结果
- [ ] 限流测试：超过100次/分钟被拒绝
- [ ] 降级测试：AI服务不可用时返回友好错误

**验收标准**:
```python
# 决策服务
service = DecisionService()
decision = await service.generate_decision(
    account_id="acc_123",
    account_info={"balance": 100000, "risk_tolerance": "medium"},
    positions=[{"symbol": "000001", "quantity": 100}],
    market_data={...},
    news_intelligence={...}
)

# 返回结构
{
    "action": "buy",
    "symbol": "000001",
    "quantity": 100,
    "price_target": 10.5,
    "reason": "突破阻力位，MACD金叉",
    "confidence": 0.85,
    "risk_level": "medium",
    "model": "deepseek-chat",
    "token_usage": {"total": 1500}
}
```

**依赖**: [T-002], [T-003], 依赖 Market Data Service 的行情接口
**预计工时**: 3天

---

#### [T-005] 数据聚合服务（Data Fusion）
**功能**: 从 Market Data Service 和 News Service 获取数据，融合成决策上下文

**测试要求**:
- [ ] `tests/unit/services/test_data_fusion_service.py` - 单元测试：数据融合逻辑
- [ ] `tests/integration/services/test_data_aggregation.py` - 集成测试：服务调用
- [ ] Token估算测试：验证数据量控制在预算内
- [ ] 降级测试：News Service不可用时只使用行情数据

**验收标准**:
```python
# 数据聚合
fusion_service = DataFusionService()
context = await fusion_service.prepare_context(
    stock_codes=['000001', '600519'],
    account_id='acc_123',
    days=7
)

# 返回结构
{
    "stocks": {
        "000001": {
            "realtime": {...},
            "history": {"data": [...], "granularity": "5m"},
            "indicators": {...}
        }
    },
    "news": [
        {"stock_code": "000001", "sentiment": "positive", "summary": "..."}
    ],
    "token_estimate": 2500
}
```

**依赖**: [T-004], 依赖 Market Data Service 和 News Service 的API
**预计工时**: 2.5天

---

#### [T-006] 提示词提炼服务（Prompt Craft）
**功能**: 根据用户对话历史提炼基金经理画像，生成最终提示词

**测试要求**:
- [ ] `tests/unit/services/test_prompt_craft_service.py` - 单元测试：提炼逻辑
- [ ] `tests/integration/services/test_prompt_refinement.py` - 集成测试：完整流程
- [ ] 格式测试：验证生成的提示词包含所有必需字段
- [ ] 长度测试：提示词控制在合理长度（< 2000 tokens）

**验收标准**:
```python
# 提示词提炼
service = PromptCraftService()
prompt = await service.craft_prompt(dialogue_history=[
    {"role": "user", "content": "我想做稳健型投资"},
    {"role": "assistant", "content": "稳健型投资适合长期持有..."},
    ...
])

# 返回结构
{
    "role": "专业基金经理",
    "identity": "你是一位稳健型投资者",
    "philosophy": "价值投资，长期持有优质股票",
    "risk_profile": "稳健",
    "focus_sectors": ["消费", "医药"],
    "constraints": [...],
    "system_context": "A股市场规则..."
}
```

**依赖**: [T-003], [T-002]
**预计工时**: 2天

---

### Phase 3: API接口

#### [T-007] 决策生成API
**功能**: `POST /api/v1/decision/generate` 端点

**测试要求**:
- [ ] `tests/integration/api/test_decision_api.py` - 集成测试：API端点
- [ ] 参数验证测试：验证请求参数完整性
- [ ] 认证测试：验证API Key认证
- [ ] 性能测试：API响应时间 < 3秒（不含AI调用）

**验收标准**:
```bash
curl -X POST http://localhost:8000/api/v1/decision/generate \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "account_info": {...},
    "positions": [...],
    "stock_data": [...],
    "ai_provider": "deepseek",
    "model_name": "deepseek-chat"
  }'
# 返回 200 {"decision": {...}, "token_usage": {...}}
```

**依赖**: [T-004], [T-005]
**预计工时**: 1.5天

---

#### [T-008] 提示词提炼API
**功能**: `POST /api/v1/prompt/craft` 端点，供Backend调用

**测试要求**:
- [ ] `tests/integration/api/test_prompt_api.py` - 集成测试：API端点
- [ ] 对话历史验证测试：验证对话格式
- [ ] 内部API测试：验证X-API-Key认证

**验收标准**:
```bash
curl -X POST http://localhost:8000/api/v1/prompt/craft \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dialogue_history": [...]}'
# 返回 200 {"prompt": {...}, "token_usage": {...}}
```

**依赖**: [T-006]
**预计工时**: 1天

---

#### [T-009] 决策日志存储
**功能**: 将AI决策记录到PostgreSQL，支持查询和复盘

**测试要求**:
- [ ] `tests/unit/db/test_decision_log.py` - 单元测试：日志写入
- [ ] `tests/integration/db/test_decision_storage.py` - 集成测试：存储和查询
- [ ] 分区测试：验证按时间分区存储
- [ ] 索引测试：查询性能 < 100ms

**验收标准**:
```python
# 决策日志表
CREATE TABLE ai_decisions (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(50) NOT NULL,
    decision JSONB NOT NULL,
    prompt_version VARCHAR(20),
    model_name VARCHAR(50),
    token_usage JSONB,
    latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_account_id (account_id),
    INDEX idx_created_at (created_at)
) PARTITION BY RANGE (created_at);

# 保存决策
await decision_log.save(account_id, decision, token_usage)

# 查询历史
logs = await decision_log.query(account_id, start_date, end_date)
```

**依赖**: [T-007]
**预计工时**: 1.5天

---

### Phase 4: 监控与优化

#### [T-010] Token使用监控与限流
**功能**: 监控Token消耗，实现账户级限流

**测试要求**:
- [ ] `tests/unit/services/test_rate_limiter.py` - 单元测试：限流逻辑
- [ ] `tests/integration/services/test_token_monitoring.py` - 集成测试：监控
- [ ] 限流测试：超过限制时拒绝请求
- [ ] 告警测试：接近限制时触发告警

**验收标准**:
```python
# 限流检查
rate_limiter = TokenRateLimiter()
can_proceed = await rate_limiter.check_limit(account_id, estimated_tokens=2000)
# 根据账户预算判断是否允许

# 使用量查询
usage = await rate_limiter.get_usage(account_id)
# {"daily_limit": 50000, "used_today": 12000, "remaining": 38000}
```

**依赖**: [T-009]
**预计工时**: 1.5天

---

#### [T-011] 模型性能监控
**功能**: 监控各模型的延迟、成功率、成本

**测试要求**:
- [ ] `tests/unit/monitoring/test_model_metrics.py` - 单元测试：指标收集
- [ ] 延迟测试：记录每次调用的响应时间
- [ ] 成功率测试：统计各模型的成功/失败次数

**验收标准**:
```bash
curl http://localhost:8000/api/v1/monitoring/models
# {
#   "deepseek-chat": {
#     "avg_latency_ms": 1500,
#     "success_rate": 0.995,
#     "avg_cost_per_call": 0.02,
#     "total_calls": 10000
#   },
#   "gpt-4-turbo": {
#     "avg_latency_ms": 2500,
#     "success_rate": 0.999,
#     "avg_cost_per_call": 0.08,
#     "total_calls": 5000
#   }
# }
```

**依赖**: [T-002]
**预计工时**: 1天

---

#### [T-012] 服务健康检查
**功能**: `/health` 端点，检查数据库、Redis、AI API可用性

**测试要求**:
- [ ] `tests/integration/api/test_health.py` - 集成测试：健康检查
- [ ] 依赖故障测试：模拟AI API不可用，返回 degraded

**验收标准**:
```bash
curl http://localhost:8000/api/v1/health/
# {"status":"healthy","dependencies":{"postgresql":"healthy","redis":"healthy","deepseek":"healthy"}}
```

**依赖**: 无
**预计工时**: 0.5天

---

## 测试脚本目录结构

```
trading-ai-service/tests/
├── unit/
│   ├── adapters/                  # 模型适配器测试
│   ├── services/                  # 服务层测试
│   ├── prompts/                   # 提示词测试
│   ├── db/                        # 数据库测试
│   └── monitoring/                # 监控测试
├── integration/
│   ├── api/                       # API测试
│   ├── services/                  # 服务集成测试
│   └── db/                        # 数据库集成测试
├── fixtures/                      # 测试数据
└── conftest.py                    # Pytest配置
```

---

## 开发进度留痕

| 条目 | 状态 | 开发日期 | 测试通过日期 | 合并提交 |
|------|------|----------|--------------|----------|
| [T-001] 适配器基类 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |
| [T-002] 模型适配器 | 🔲 待开发 | - | - | - |
| [T-003] 提示词模板 | 🔲 待开发 | - | - | - |
| [T-004] 决策生成服务 | 🔲 待开发 | - | - | - |
| [T-005] 数据聚合服务 | 🔲 待开发 | - | - | - |
| [T-006] 提示词提炼 | 🔲 待开发 | - | - | - |
| [T-007] 决策API | 🔲 待开发 | - | - | - |
| [T-008] 提炼API | 🔲 待开发 | - | - | - |
| [T-009] 决策日志 | 🔲 待开发 | - | - | - |
| [T-010] Token监控 | 🔲 待开发 | - | - | - |
| [T-011] 模型监控 | 🔲 待开发 | - | - | - |
| [T-012] 健康检查 | ✅ 已完成 | 2026-02-01 | 2026-02-01 | - |

---

## 提交规范

1. **分支命名**: `trading-ai/T-XXX-简短描述`（如 `trading-ai/T-001-adapter-base`）
2. **提交信息**: `test(trading-ai): [T-001] 添加适配器基类测试`
3. **PR要求**: 必须包含测试，覆盖率 > 85%
4. **合并前检查**:
   ```bash
   pytest tests/unit -v --cov=src --cov-report=term-missing
   pytest tests/integration -v
   ```

---

## 依赖的其他模块

| 模块 | 接口需求 | 状态 |
|------|---------|------|
| Market Data Service | `GET /api/stocks/{symbol}/quote` - 实时行情 | 已存在 |
| Market Data Service | `GET /api/stocks/{symbol}/history` - 历史数据 | 已存在 |
| News Service | `GET /api/v1/intelligence/{code}` - 新闻情报 | 待开发 |
| Backend | 接收决策回调（可选） | 需对接 |

---

*最后更新: 2026-02-10*
*负责人: Trading AI Service开发团队*
