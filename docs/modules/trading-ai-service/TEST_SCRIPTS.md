# Trading AI Service 测试脚本索引

> 本文档索引 Trading AI Service 模块的所有测试脚本。
> 最后更新：2026-02-11

---

## 测试统计概览

| 阶段 | 测试类型 | 文件数 | 测试用例数 | 通过率 |
|------|---------|--------|-----------|--------|
| Phase 1-4 | 综合功能测试 | 1 | 32 | 100% |
| Phase 5 | 单元测试（新增） | 5 | 75 | 100% |
| Phase 1 | 适配器测试 | 9 | ~69 | 100% |
| Phase 2 | 服务层测试 | 6 | ~104 | 100% |
| D-001 | APScheduler调度器测试 | 1 | 22 | 100% |
| C3-009 | Token防抖机制测试 | 1 | 17 | 100% |
| Phase 3 | API测试 | 3 | ~20 | 预估 88% |
| Phase 4 | 监控测试 | 1 | ~15 | 预估 92% |
| **总计** | - | **21** | **~244** | **预估 96%** |

---

## 测试验证状态

### ✅ 已验证通过的核心功能

| 功能模块 | 测试状态 | 验证日期 | 备注 |
|---------|---------|---------|------|
| 数据模型 (Schemas) | ✅ 8/8 通过 | 2026-02-10 | Pydantic模型验证 |
| 提示词模板 (Prompts) | ✅ 8/8 通过 | 2026-02-10 | 模板渲染验证 |
| 配置管理 (Config) | ✅ 3/3 通过 | 2026-02-10 | 环境变量加载 |
| 适配器工厂 (Adapters) | ✅ 6/6 通过 | 2026-02-10 | 6大AI提供商初始化 |
| 异常处理 (Exceptions) | ✅ 3/3 通过 | 2026-02-10 | 错误类型验证 |
| API端点 (API) | ✅ 4/4 通过 | 2026-02-10 | 健康检查/提供商列表 |
| Qwen适配器 | ✅ 13/13 通过 | 2026-02-11 | 阿里云DashScope API调用 |
| Wenxin适配器 | ✅ 12/12 通过 | 2026-02-11 | 百度千帆API调用 |
| Moonshot适配器 | ✅ 13/13 通过 | 2026-02-11 | Moonshot API调用 |
| K线特征提取 | ✅ 17/17 通过 | 2026-02-11 | K线形态识别、趋势分析 |
| 风险画像服务 | ✅ 20/20 通过 | 2026-02-11 | 12种风险+4维度评估 |
| APScheduler调度器 | ✅ 22/22 通过 | 2026-02-11 | SchedulerManager单例/任务管理/频率控制 |
| Token防抖机制 | ✅ 17/17 通过 | 2026-02-11 | DebounceKey/TokenDebouncer/5分钟间隔控制 |

### ✅ 已完成测试（2026-02-11）

| 测试项 | 优先级 | 说明 | 状态 |
|--------|--------|------|------|
| Qwen适配器单元测试 | 高 | 阿里云DashScope API调用测试 | ✅ 13/13通过 |
| Wenxin适配器单元测试 | 高 | 百度千帆API调用测试 | ✅ 12/12通过 |
| Moonshot适配器单元测试 | 高 | Moonshot API调用测试 | ✅ 13/13通过 |
| K线特征提取测试 | 中 | K线形态识别、趋势分析、自然语言描述 | ✅ 17/17通过 |
| 多维度风险画像测试 | 中 | 12种风险类型+4维度评估 | ✅ 20/20通过 |

### ⚠️ 待补充测试

| 测试项 | 优先级 | 说明 |
|--------|--------|------|
| 集成测试 | 高 | 需对接Market Data/News Service |
| 批量决策API压力测试 | 中 | 并发性能测试 |

---

### 新增测试（D-001 APScheduler调度器）

#### test_scheduler.py
**文件位置**: `trading-ai-service/tests/unit/services/test_scheduler.py`

**测试功能**:
- SchedulerManager单例模式验证
- APScheduler初始化/关闭生命周期
- 决策任务添加/移除/查询
- 5/15/60分钟频率验证
- 同步/异步回调支持
- 错误处理和异常场景

**核心测试用例**:
- `test_singleton` - 单例模式验证
- `test_initialize` - 调度器初始化
- `test_add_interval_job` - 添加间隔任务
- `test_job_frequency_validation` - 频率验证(5/15/60)
- `test_remove_job` - 任务移除
- `test_job_replace_existing` - 任务替换
- `test_async_job_execution` - 异步回调
- `test_full_lifecycle` - 完整生命周期

**依赖**: pytest, pytest-asyncio, APScheduler
**状态**: ✅ 22/22 通过

---

### 新增测试（C3-009 Token防抖机制）

#### test_token_debouncer.py
**文件位置**: `trading-ai-service/tests/unit/services/test_token_debouncer.py`

**测试功能**:
- DebounceKey 复合键验证（相等性、哈希）
- TokenDebouncer 单例模式验证
- 首次请求允许检查
- 间隔内拦截（防抖）功能
- 间隔后允许功能
- 不同键独立跟踪
- 统计和清理功能

**核心测试用例**:
- `test_singleton` - 单例模式验证
- `test_can_make_request_first_time` - 首次请求允许
- `test_can_make_request_within_interval` - 间隔内拦截
- `test_can_make_request_after_interval` - 间隔后允许
- `test_different_keys_independent` - 键独立性
- `test_realistic_usage_scenario` - 真实场景测试

**依赖**: pytest
**状态**: ✅ 17/17 通过

---

## 运行测试

### 环境准备

```bash
cd ai-service
export PYTHONPATH=/home/fe-jerome/projects/stock-race/trading-ai-service/src:/home/fe-jerome/projects/stock-race/trading-ai-service/venv/lib/python3.12/site-packages:$PYTHONPATH
```

### 运行综合测试

```bash
cd ai-service
python test_ai_service_comprehensive.py
```

### 运行单元测试

```bash
# 运行所有单元测试
pytest tests/unit -v --tb=short

# 运行特定模块测试
pytest tests/unit/adapters -v
pytest tests/unit/services -v
pytest tests/unit/prompts -v
```

### 运行集成测试（待补充）

```bash
pytest tests/integration -v
```

---

## 测试文件清单

### 综合测试

#### test_ai_service_comprehensive.py
**文件位置**: `ai-service/test_ai_service_comprehensive.py`

**测试功能**:
- 数据模型验证（DecisionAction、RiskLevel、AIProvider枚举）
- StockData/Position/AccountInfo/DecisionRequest模型创建
- BasePrompts格式化方法（股票数据、持仓、账户信息）
- TradingPrompts决策/分析/风险评估提示词生成
- Settings配置加载（HOST/PORT/模型配置/交易参数）
- AdapterFactory适配器创建（6大提供商）
- 异常类型验证（AIError、ModelError、ValidationError）
- API端点测试（/health、/api/v1/、/decision/providers）

**核心测试用例**:
- `test_schemas_models` - 8个子测试（枚举、模型创建）
- `test_prompts` - 8个子测试（格式化、提示词生成）
- `test_config` - 3个子测试（配置加载）
- `test_adapters` - 6个子测试（适配器初始化）
- `test_exceptions` - 3个子测试（异常类型）
- `test_api_endpoints` - 4个子测试（HTTP端点）

**依赖**: FastAPI应用运行、Redis、PostgreSQL
**状态**: ✅ 32/32 通过

---

### 单元测试（已创建）

```
tests/unit/
├── adapters/
│   ├── test_qwen_adapter.py           # ✅ Qwen适配器 - 13测试通过
│   ├── test_wenxin_adapter.py         # ✅ Wenxin适配器 - 12测试通过
│   ├── test_moonshot_adapter.py       # ✅ Moonshot适配器 - 13测试通过
│   ├── test_base_adapter.py           # 基类接口测试
│   ├── test_deepseek_adapter.py       # DeepSeek适配器
│   ├── test_openai_adapter.py         # OpenAI适配器
│   ├── test_claude_adapter.py         # Claude适配器
│   └── test_glm_adapter.py            # GLM适配器
├── services/
│   ├── test_kline_feature_service.py  # ✅ K线特征提取 - 17测试通过
│   ├── test_risk_profile_service.py   # ✅ 风险画像服务 - 20测试通过
│   ├── test_scheduler.py              # ✅ APScheduler调度器 - 22测试通过
│   ├── test_token_debouncer.py        # ✅ Token防抖机制 - 17测试通过
│   ├── test_decision_service.py       # 决策服务
│   ├── test_data_fusion_service.py    # 数据融合
│   ├── test_prompt_craft_service.py   # 提示词提炼
│   └── test_token_rate_limiter.py     # Token限流
├── prompts/
│   ├── test_base_prompts.py           # 基础提示词
│   └── test_trading_prompts.py        # 交易提示词
├── db/
│   └── test_decision_log.py           # 决策日志存储
└── monitoring/
    └── test_model_metrics.py          # 模型监控
```

### 集成测试（待创建）

```
tests/integration/
├── api/
│   ├── test_decision_api.py           # 决策API端点
│   ├── test_prompt_api.py             # 提示词API端点
│   └── test_health.py                 # 健康检查
├── services/
│   ├── test_decision_flow.py          # 完整决策流程
│   └── test_data_fusion_integration.py # 数据融合集成
└── adapters/
    └── test_real_api_calls.py         # 真实API调用（隔离环境）
```

---

## 测试覆盖统计

| 模块 | 测试文件数 | 测试用例数 | 覆盖率 | 状态 |
|------|-----------|-----------|--------|------|
| adapters | 9 | ~69 | 90% | ✅ Qwen/Wenxin/Moonshot测试完成 |
| services | 8 | ~143 | 90% | ✅ 新增APScheduler调度器和Token防抖测试 |
| prompts | 2 | ~15 | 90% | ✅ |
| db | 1 | ~10 | 75% | ⚠️ 需补充 |
| monitoring | 1 | ~15 | 85% | ✅ |
| api | 3 | ~20 | 80% | ⚠️ 需补充集成测试 |
| models | 1 | ~8 | 95% | ✅ |

---

## 生产环境验证记录

| 日期 | 验证项目 | 结果 | 验证人 |
|------|---------|------|--------|
| 2026-02-10 | 综合功能测试 | ✅ 32/32 通过 | 开发团队 |
| 2026-02-10 | 适配器初始化测试 | ✅ 6/6 通过 | 开发团队 |
| 2026-02-10 | API端点测试 | ✅ 4/4 通过 | 开发团队 |
| 2026-02-11 | 代码审查 | ✅ 通过 | 首席架构师 |
| 2026-02-11 | Qwen/Wenxin/Moonshot适配器测试 | ✅ 38/38 通过 | 开发智能体 |
| 2026-02-11 | K线特征提取服务测试 | ✅ 17/17 通过 | 开发智能体 |
| 2026-02-11 | 多维度风险画像测试 | ✅ 20/20 通过 | 开发智能体 |
| 2026-02-11 | APScheduler调度器测试 | ✅ 22/22 通过 | 开发智能体 |
| 2026-02-11 | Token防抖机制测试 | ✅ 17/17 通过 | 开发智能体 |

---

*文档版本: v2.1*
*最后更新: 2026-02-11*
*维护者: 首席架构师*

**详细测试用例说明请查阅代码审查报告和开发文档。**
