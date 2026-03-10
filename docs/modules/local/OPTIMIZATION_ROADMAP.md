# Local 形态优化路线图

> **目标**：将当前 Local 版本从"可用"提升至"完善"
> **范围**：不演进到 Full 形态，聚焦 Local 自用体验
> **策略**：代码清理 → 功能补全 → 体验优化

---

## 目录

- [阶段总览](#阶段总览)
- [Phase A: 代码治理](#phase-a-代码治理)
- [Phase B: 数据系统完善](#phase-b-数据系统完善)
- [Phase C: AI 系统增强](#phase-c-ai-系统增强)
- [Phase D: 体验优化](#phase-d-体验优化)
- [验收标准](#验收标准)
- [附录：详细任务清单](#附录详细任务清单)

---

## 阶段总览

```
Phase A (代码治理)      Phase B (数据完善)      Phase C (AI 增强)       Phase D (体验优化)
    │                       │                      │                      │
    ▼                       ▼                      ▼                      ▼
┌──────────┐           ┌──────────┐           ┌──────────┐           ┌──────────┐
│清理遗留  │    ───▶   │定时采集  │    ───▶   │多模型    │    ───▶   │性能优化  │
│代码      │           │多数据源  │           │支持      │           │交互优化  │
│统一架构  │           │数据持久化│           │策略优化  │           │错误处理  │
└──────────┘           └──────────┘           └──────────┘           └──────────┘
  1-2 天                 2-3 天                 2-3 天                1-2 天
```

**总工期预估**: 6-10 天（按依赖顺序执行，部分任务可并行）

---

## Phase A: 代码治理

**目标**: 消除技术债务，统一代码结构
**工期**: 1-2 天
**阻塞影响**: 后续所有开发依赖

### A1. 清理遗留代码结构

| 任务 | 优先级 | 操作内容 | 验证方式 |
|------|--------|----------|----------|
| A1.1 | P0 | 删除 `local/core/` 目录 | 目录不存在，引用已迁移 |
| A1.2 | P0 | 删除 `local/adapters/` 目录 | 目录不存在，引用已迁移 |
| A1.3 | P0 | 删除 `local/cmd/` 目录 | 目录不存在 |
| A1.4 | P0 | 删除 `local/config/local.yaml` | 配置合并到 `backend/` |
| A1.5 | P0 | 更新 `local/ARCHITECTURE.md` | 文档反映当前结构 |

**执行步骤**:
```bash
# 1. 备份当前代码（已版本控制可跳过）
git stash

# 2. 确认新实现已完整替换旧功能
# - 检查 local/backend/models/ 已包含所有模型
# - 检查 local/backend/services/ 已包含所有服务

# 3. 删除遗留目录
rm -rf local/core
rm -rf local/adapters
rm -rf local/cmd
rm -f local/config/local.yaml

# 4. 验证后端仍可启动
cd local/backend
python main.py --headless
# 应正常启动，无导入错误
```

**风险检查清单**:
- [ ] 确认 `TradingEngine` 逻辑已完整迁移
- [ ] 确认 `Strategy` 模型已完整迁移
- [ ] 确认数据源接口已在新位置实现

### A2. 统一存储层

| 任务 | 优先级 | 说明 | 验证方式 |
|------|--------|------|----------|
| A2.1 | P0 | 确认使用 SQLAlchemy ORM 为唯一存储层 | 无直接 sqlite3 操作 |
| A2.2 | P1 | 移除 `SQLiteStorage` 同步实现 | 文件不存在 |
| A2.3 | P1 | 统一使用 `aiosqlite` 异步操作 | 所有数据库操作为 async |

**代码检查点**:
```python
# 应仅存在以下存储相关导入
from models.database import get_db, AgentModel, TradeModel, PositionModel
from sqlalchemy.ext.asyncio import AsyncSession

# 不应存在以下导入
# import sqlite3  ← 应移除
# from adapters.storage import SQLiteStorage  ← 应移除
```

### A3. 模型层优化

| 任务 | 优先级 | 说明 | 验证方式 |
|------|--------|------|----------|
| A3.1 | P1 | 统一枚举定义位置 | 仅 `models/enums.py` 或 `schemas.py` |
| A3.2 | P1 | 消除 `models.py` 与 `schemas.py` 重复 | 单一职责：ORM  vs Pydantic |
| A3.3 | P2 | 添加 Decimal 精度控制 | 资金字段统一 2 位小数 |

---

## Phase B: 数据系统完善

**目标**: 实现稳定、丰富的行情数据供给
**工期**: 2-3 天
**前置条件**: Phase A 完成

### B1. 完成剩余数据源适配器

| 任务 | 优先级 | 数据源 | 关键实现点 | 验证方式 |
|------|--------|--------|------------|----------|
| B1.1 | P1 | AkShare | 历史数据补充 | 获取日K线数据 |
| B1.2 | P1 | Baostock | 基本面数据 | 获取市盈率/市净率 |
| B1.3 | P2 | Tushare | 财务数据（需 Token）| 获取财务报表 |

**接口规范**（已实现，需遵循）:
```python
class DataSource(ABC):
    @abstractmethod
    async def get_stock_data(self, symbol: str) -> Optional[StockQuote]:
        pass

    @abstractmethod
    async def get_historical_data(self, symbol: str, ...):
        pass
```

**实现文件位置**: `local/backend/services/market_data/`

### B2. 定时采集系统

| 任务 | 优先级 | 说明 | 实现细节 |
|------|--------|------|----------|
| B2.1 | P1 | APScheduler 集成 | 安装 `apscheduler` 依赖 |
| B2.2 | P1 | 分级采集任务 | 高频(5s)/中频(1min)/低频(日终) |
| B2.3 | P1 | 交易时间判断 | A股交易日 09:30-11:30, 13:00-15:00 |
| B2.4 | P2 | 数据持久化 | 采集数据写入 SQLite |

**采集频率设计**:
```python
SCHEDULE_CONFIG = {
    "high_freq": {  # 实时行情
        "sources": ["sina", "tencent", "eastmoney"],
        "interval": 5,  # 秒
        "trading_hours_only": True
    },
    "mid_freq": {  # 补充数据
        "sources": ["akshare"],
        "interval": 60,  # 秒
        "trading_hours_only": True
    },
    "low_freq": {  # 基本面数据
        "sources": ["baostock", "tushare"],
        "cron": "0 19 * * *",  # 日终 19:00
        "trading_hours_only": False
    }
}
```

**启动集成**:
```python
# main.py lifespan 中添加
async def lifespan(app: FastAPI):
    # ... 现有代码 ...
    await init_scheduler()  # 新增
    yield
    await shutdown_scheduler()  # 新增
```

### B3. 数据质量保障

| 任务 | 优先级 | 说明 | 验证方式 |
|------|--------|------|----------|
| B3.1 | P1 | 数据源健康检查 | /api/market/health 端点 |
| B3.2 | P1 | 熔断降级机制 | 某源失效自动切换 |
| B3.3 | P2 | 数据校验规则 | 价格范围/涨跌幅合理性 |

---

## Phase C: AI 系统增强

**目标**: 完善多模型支持，优化决策质量
**工期**: 2-3 天
**前置条件**: Phase A 完成

### C1. 多模型适配器

| 任务 | 优先级 | 模型 | 提供商 | API 文档 |
|------|--------|------|--------|----------|
| C1.1 | P1 | 通义千问 | 阿里云 | https://help.aliyun.com/qwen |
| C1.2 | P1 | GLM-4 | 智谱 AI | https://open.bigmodel.cn/ |
| C1.3 | P2 | DeepSeek | DeepSeek | https://platform.deepseek.com/ |

**适配器接口**（已定义于 `base.py`）:
```python
class AIAdapter(ABC):
    @abstractmethod
    async def make_decision(self, request: DecisionRequest) -> DecisionResponse:
        pass

    @property
    @abstractmethod
    def token_usage(self) -> TokenUsage:
        pass
```

**实现要求**:
1. 继承 `AIAdapter` 基类
2. 实现 `make_decision` 方法
3. 返回标准 `DecisionResponse`
4. 记录 Token 消耗

**工厂模式**:
```python
# services/ai_adapter/factory.py
def create_adapter(provider: str, model: str, api_key: str) -> AIAdapter:
    adapters = {
        "kimi": KimiAdapter,
        "qwen": QwenAdapter,
        "glm": GLMAdapter,
        "deepseek": DeepSeekAdapter,
    }
    return adapters[provider](model, api_key)
```

### C2. 策略收集优化

| 任务 | 优先级 | 说明 | 验证方式 |
|------|--------|------|----------|
| C2.1 | P1 | Prompt 版本管理 | 策略模板可迭代 |
| C2.2 | P1 | 五维度追问逻辑 | 缺失维度自动追问 |
| C2.3 | P2 | 策略文档结构化存储 | JSON Schema 验证 |

**Prompt 工程规范**:
```python
# core/prompts/strategy.py
STRATEGY_COLLECTION_PROMPT = """...

输出格式（严格 JSON）：
{
    "risk_tolerance": "conservative|moderate|aggressive|extreme",
    "sectors": ["科技", "消费"],
    "holding_period": "ultra_short|short|medium|long",
    "position_limit": "单股不超过30%",
    "stop_loss": "8%止损",
    "market_scope": "main_board|growth|all"
}
"""
```

### C3. 职级晋升逻辑

| 任务 | 优先级 | 说明 | 验证方式 |
|------|--------|------|----------|
| C3.1 | P1 | 升级经验值计算 | 每5交易日+经验 |
| C3.2 | P1 | 晋升条件判断 | Lv.6→经理, Lv.12→合伙人 |
| C3.3 | P2 | 休息日培训 | 周末消耗资金换经验 |

**晋升规则**:
```python
class PromotionService:
    LEVEL_THRESHOLDS = {
        "intern": {"max_level": 6, "next_rank": "manager"},
        "manager": {"max_level": 12, "next_rank": "partner"},
        "partner": {"max_level": None, "next_rank": None},
    }

    async def check_promotion_eligible(self, agent_id: str) -> PromotionResult:
        # 检查等级 + 收益率 + 交易次数
        pass
```

---

## Phase D: 体验优化

**目标**: 提升用户使用流畅度
**工期**: 1-2 天
**前置条件**: Phase B/C 完成或并行

### D1. 性能优化

| 任务 | 优先级 | 说明 | 验证方式 |
|------|--------|------|----------|
| D1.1 | P1 | API 响应缓存 | Redis/SQLite 缓存层 |
| D1.2 | P1 | 数据库查询优化 | N+1 问题检查 |
| D1.3 | P2 | 前端懒加载 | 大数据表格虚拟滚动 |

### D2. 错误处理与日志

| 任务 | 优先级 | 说明 | 验证方式 |
|------|--------|------|----------|
| D2.1 | P1 | 全局异常捕获 | 500 错误友好提示 |
| D2.2 | P1 | API 错误码规范 | 统一错误响应格式 |
| D2.3 | P2 | 操作日志记录 | 关键操作审计 |

### D3. 交互细节

| 任务 | 优先级 | 说明 | 验证方式 |
|------|--------|------|----------|
| D3.1 | P1 | Loading 状态 | 异步操作反馈 |
| D3.2 | P1 | 表单校验 | 前端实时校验 |
| D3.3 | P2 | 空状态设计 | 无数据友好提示 |

---

## 验收标准

### 阶段验收

| 阶段 | 验收条件 | 验证方式 |
|------|---------|----------|
| Phase A | 后端启动无遗留导入错误 | `python main.py` 正常启动 |
| Phase B | 定时采集正常运行 | 观察 5 分钟，数据更新 |
| Phase C | 多模型可切换 | 创建 AI 时可选择不同模型 |
| Phase D | 性能达标 | API < 200ms, 页面 < 3s |

### 最终验收

- [ ] 代码结构清晰，无遗留文件
- [ ] 行情数据自动采集，多源可用
- [ ] 支持至少 3 种 AI 模型
- [ ] 职级晋升逻辑完整可体验
- [ ] E2E 测试全部通过

---

## 附录：详细任务清单

### 任务依赖图

```
A1.1 ──┬──▶ A1.2 ──┬──▶ A2.1 ──┬──▶ B1.1 ──┬──▶ C1.1 ──┬──▶ D1.1
       │           │           │           │           │
       ▼           ▼           ▼           ▼           ▼
      A1.3       A2.2       B1.2/B2.1    C1.2       D2.1/D3.1
```

### 工时估算

| 阶段 | 乐观 | 正常 | 悲观 |
|------|------|------|------|
| Phase A | 1d | 1.5d | 2d |
| Phase B | 2d | 2.5d | 3d |
| Phase C | 2d | 2.5d | 3d |
| Phase D | 1d | 1.5d | 2d |
| **总计** | **6d** | **8d** | **10d** |

### 风险登记

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 删除遗留代码后发现功能缺失 | 中 | 高 | 删除前完整功能对比测试 |
| 数据源 API 限制/封禁 | 高 | 中 | 多源冗余，降级机制 |
| 模型 API 响应不稳定 | 中 | 中 | 超时重试，默认 HOLD |

---

## 使用指南

### 每日工作流程

1. **开始工作**: 查看本文件，确认当前阶段和任务
2. **更新状态**: 完成任务后在下方记录进度
3. **阶段过渡**: 完成一阶段后执行验收检查

### 状态记录

| 日期 | 完成任务 | 备注 |
|------|---------|------|
| 2026-03-10 | 创建本文档 | 初始版本 |
| | | |

---

*本文档作为 Local 形态优化的执行依据，变更需记录于上表*
