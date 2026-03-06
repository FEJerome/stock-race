# Local 架构设计说明

## 设计原则

### 1. 洋葱圈模型实现

```
local/
├── core/                    # 核心层（三种形态共用）
│   ├── domain/             # 领域模型（纯数据定义）
│   ├── engine/             # 交易引擎（业务逻辑）
│   └── prompts/            # Prompt模板（可复用资产）
├── adapters/               # 适配层（形态差异）
│   ├── storage/            # 存储适配（Local: SQLite）
│   └── datasource/         # 数据源适配（Local: CSV）
├── cmd/                    # 入口层
│   └── main.py            # CLI入口
└── config/                # 配置
    └── local.yaml         # Local专属配置
```

### 2. 关键设计决策

| 决策 | 选择 | 理由 | 依据 |
|------|------|------|------|
| **技术栈** | Python | 1. Legacy代码是Python，复用Prompt和算法<br>2. AI/数据科学生态完善<br>3. 开发速度快 | discussion-log.md 2026-02-27 大模型策略 |
| **存储** | SQLite | 1. 零配置，本地文件<br>2. 后续可无缝迁移到PostgreSQL<br>3. Python标准库支持 | DELIVERY_PLAN.md 适配层定义 |
| **数据源** | CSV文件 | 1. 无需网络依赖<br>2. 可手动准备测试数据<br>3. 接口抽象后未来可接入API | DELIVERY_PLAN.md Local数据源定义 |
| **交互方式** | CLI | 1. 实现最简单<br>2. 便于脚本化和测试<br>3. 后续可包装为Web/API | DELIVERY_PLAN.md Local前端定义 |
| **架构模式** | 领域驱动+端口适配器 | 1. 核心逻辑与基础设施解耦<br>2. 后续形态只需替换适配层<br>3. 符合洋葱圈模型 | PRD.md 3.1 可拆卸架构设计 |

### 3. 与洋葱圈模型的映射

| 洋葱圈层级 | Local实现 | 未来MVP/Full替换 |
|-----------|----------|-----------------|
| **模型层** | `core/prompts/` | 复用，不变 |
| **引擎层** | `core/engine/` + `core/domain/` | 复用，不变 |
| **适配层** | `adapters/storage/sqlite.py` | 替换为 `adapters/storage/postgres.py` |
| **适配层** | `adapters/datasource/csv.py` | 替换为 `adapters/datasource/api.py` |
| **入口层** | `cmd/main.py` (CLI) | 替换为 `cmd/api.py` (FastAPI) |

### 4. 核心领域模型（三种形态共用）

```python
# core/domain/models.py
# 这些模型在 Local/MVP/Full 中完全一致
- AIAgent: AI交易员实体
- Strategy: 策略文档（五维度）
- Trade: 交易记录
- Position: 持仓
- Portfolio: 账户组合
```

### 5. 适配器接口设计（开闭原则）

```python
# adapters/storage/interface.py
class Storage(ABC):
    @abstractmethod
    def save_agent(self, agent: AIAgent) -> None: ...
    
# adapters/datasource/interface.py  
class DataSource(ABC):
    @abstractmethod
    def get_stock_data(self, symbol: str) -> StockData: ...
```

**开闭原则体现**：
- 新增存储方式？继承 `Storage` 接口即可
- 新增数据源？继承 `DataSource` 接口即可
- 核心引擎无需修改

### 6. 最小依赖原则

**Local形态依赖清单**：
```
标准库: sqlite3, datetime, uuid, typing, abc, csv, pathlib
第三方: 
  - pydantic (数据验证，后续形态也需要)
  - pyyaml (配置文件)
  - loguru (日志，比标准库logging易用)
  - rich (CLI美化，可选)
```

**明确不引入的依赖**（避免过度设计）：
- ❌ FastAPI/Flask (Local不需要Web)
- ❌ SQLAlchemy (SQLite直接用标准库足够)
- ❌ Redis (Local不需要缓存)
- ❌ Docker (Local直接运行)
- ❌ 消息队列 (Local单进程)

### 7. 与Legacy代码的关系

**复用的资产**（从 `legacy/` 复制并清理）：
1. `legacy/services/trading-ai-service/src/ai_service/prompts/` → `core/prompts/`
2. 策略收集五维度逻辑 → `core/engine/strategy.py`
3. 交易计算逻辑 → `core/engine/trading.py`

**不直接使用Legacy代码的原因**：
1. Legacy是六服务架构，过于复杂
2. Local需要简化版本
3. 从干净核心开始，避免历史包袱

### 8. 目录结构最终形态

```
local/
├── core/
│   ├── __init__.py
│   ├── domain/
│   │   ├── __init__.py
│   │   ├── models.py          # AIAgent, Trade, Position等
│   │   └── enums.py           # RiskLevel, DecisionAction等
│   ├── engine/
│   │   ├── __init__.py
│   │   ├── agent.py           # AI交易员生命周期管理
│   │   ├── strategy.py        # 策略收集与存储
│   │   └── trading.py         # 虚拟交易执行
│   └── prompts/
│       ├── __init__.py
│       ├── base.py            # Prompt基类
│       ├── strategy.py        # 策略收集Prompt
│       └── trading.py         # 交易决策Prompt
├── adapters/
│   ├── __init__.py
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── interface.py       # Storage抽象接口
│   │   └── sqlite.py          # SQLite实现
│   └── datasource/
│       ├── __init__.py
│       ├── interface.py       # DataSource抽象接口
│       └── csv.py             # CSV文件实现
├── cmd/
│   ├── __init__.py
│   └── main.py                # CLI入口
├── config/
│   └── local.yaml             # 配置文件
├── data/                      # 本地数据目录（gitignore）
│   ├── agents/                # AI交易员数据
│   ├── trades/                # 交易记录
│   └── stocks/                # CSV股票数据
└── README.md                  # Local使用说明
```

### 9. 快速开始流程

```bash
# 1. 准备股票数据
cp some_stock_data.csv local/data/stocks/sh000001.csv

# 2. 创建AI交易员
python -m local.cmd.main create-agent \
  --name "测试AI" \
  --risk-level conservative \
  --initial-capital 100000

# 3. 运行交易决策
python -m local.cmd.main trade --agent-id <id>

# 4. 查看结果
python -m local.cmd.main report --agent-id <id>
```

### 10. 向MVP演进的路径

**Phase 1: 核心验证（当前）**
- 实现 `core/` 基础逻辑
- SQLite存储验证
- CSV数据源验证

**Phase 2: 适配层扩展（未来）**
- 新增 `adapters/storage/postgres.py`
- 新增 `adapters/datasource/sina_api.py`
- 核心引擎零修改

**Phase 3: 入口层扩展（未来）**
- 新增 `cmd/api.py` (FastAPI)
- 复用相同的核心和适配器

---

## 决策依据汇总

| 决策点 | 来源文档 | 具体章节 |
|--------|---------|---------|
| Local无用户系统 | DELIVERY_PLAN.md | 功能交付矩阵 |
| Local使用CSV数据源 | DELIVERY_PLAN.md | 详细功能边界-交易执行 |
| Local CLI交互 | DELIVERY_PLAN.md | 详细功能边界-AI创建 |
| 五维度策略收集 | PRD.md | 4.2.2 策略收集机制 |
| 洋葱圈可拆卸架构 | PRD.md | discussion-log.md 2026-03-05 |
| Python技术栈 | discussion-log.md | 2026-02-27 大模型策略 |
| DeepSeek必选 | PRD.md | 5. 待定项清单 #1 |
| 虚拟资金10,000起 | PRD.md | 2.3 商业模式-投资研究点数 |

