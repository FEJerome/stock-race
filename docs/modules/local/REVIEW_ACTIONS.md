# Local 形态开发评审治理文档

> **文档定位**：集中记录架构与实施规划的评审问题，追踪解决进度
> **生命周期**：临时文档，所有问题解决后删除，内容内化到正式文档
> **目标文档**：DELIVERY_PLAN.md / ARCHITECTURE.md / IMPLEMENTATION_PLAN.md

---

## 评审摘要

| 项目 | 内容 |
|------|------|
| **评审日期** | 2026-03-09 |
| **评审对象** | ARCHITECTURE.md / IMPLEMENTATION_PLAN.md / TODO.md |
| **总体评估** | 架构合理，但存在业务规则缺失、任务估算偏低、代码与规划偏差等问题 |
| **预计解决周期** | 3-5 天（文档修正阶段） |

### 关键发现

1. **PRD 覆盖度 75%** - 缺失周薪制度、AI职级晋升、激励档位解锁等关键业务规则
2. **代码与规划偏差** - 当前为 CLI 实现，Architecture 规划为 Web 架构
3. **任务估算偏低** - 6 个关键任务估算严重不足（数据源/AI适配器/Prompt工程）
4. **建议工期调整** - 从 6 周调整至 8 周更现实

---

## 问题治理清单

### P0 阻塞级（必须解决才能启动开发）

| # | 问题 | 影响 | 解决方案 | 目标文档 | 状态 | 备注 |
|---|------|------|---------|---------|------|------|
| 1 | **路径选择：CLI vs Web** | 决定项目形态 | 采用纯 Web 架构 | ARCHITECTURE.md | ✅ 已解决 | 纯 Web，CLI 移除或作为调试工具 |
| 2 | **周薪制度缺失** | 无法约束 AI 成本 | Local 无需工资系统（用户自付 API） | DELIVERY_PLAN.md | ✅ 已解决 | 完全跳过工资/预算约束 |
| 3 | **AI 职级晋升缺失** | 无法体验完整晋升 | 保留职级（仅能力差异，无成本） | IMPLEMENTATION_PLAN.md | ✅ 已解决 | 实习生→经理→合伙人 |
| 4 | **激励档位解锁缺失** | 档位控制失效 | 保留档位（仅频率差异，无成本） | IMPLEMENTATION_PLAN.md | ✅ 已解决 | 标准→积极→激进 |
| 5 | **试用期机制缺失** | 无法区分试用/正式 | Local 无需试用期 | IMPLEMENTATION_PLAN.md | ✅ 已解决 | 所有 AI 创建即正式工 |
| 6 | **Token 统计缺失** | 用户无法了解 API 成本 | 实现 Token 消耗统计 | ARCHITECTURE.md | 🟡 待实现 | 仅供参考，按模型记录 |

### P1 重要级（开发初期解决）

| # | 问题 | 影响 | 解决方案 | 目标文档 | 状态 | 备注 |
|---|------|------|---------|---------|------|------|
| 6 | 任务估算偏低 | 工期不可行 | 重新估算，调整时间线 | IMPLEMENTATION_PLAN.md | 🟡 待调整 | 6个任务需调整 |
| 7 | 数据模型不完整 | 缺少职级/档位字段 | 补充 AgentLevel 等模型 | ARCHITECTURE.md | 🟡 待补充 | 见【数据模型补充】 |
| 8 | 目录结构偏差 | 代码与规划不符 | 统一 backend/frontend 结构 | ARCHITECTURE.md | 🟡 待调整 | 保留 cmd/ 作为调试 |
| 9 | 缺少 API 规范 | 前后端联调困难 | 编写 API_SPEC.md | 新增文档 | 🟡 待创建 | REST + WebSocket |
| 10 | 收益计算逻辑缺失 | 无法展示收益率 | 补充收益率计算 | IMPLEMENTATION_PLAN.md | 🟡 待补充 | Phase 1.2 |

### P2 优化级（迭代中完善）

| # | 问题 | 影响 | 解决方案 | 目标文档 | 状态 | 备注 |
|---|------|------|---------|---------|------|------|
| 11 | 称号系统未规划 | 缺少趣味性 | 简化实现或延后 | IMPLEMENTATION_PLAN.md | 🟢 可选 | 不影响核心功能 |
| 12 | 自填 API 安全细节 | 密钥存储风险 | AES-256 加密方案 | ARCHITECTURE.md | 🟢 可选 | Local 自用风险低 |
| 13 | 性能指标未定义 | 无法评估性能 | 补充性能基准 | IMPLEMENTATION_PLAN.md | 🟢 可选 | 上线前补充 |
| 14 | 合规 UI 细节 | 可能使用禁用词汇 | 文案审查清单 | DELIVERY_PLAN.md | 🟢 可选 | 前端开发时对照 |
| 15 | 数据一致性处理 | 行情与交易时差 | 增加价格刷新机制 | ARCHITECTURE.md | 🟢 可选 | 交易执行时处理 |

---

## 决策项（需项目负责人确认）

### 决策 #1：产品形态路径

**问题**：当前代码是 CLI 实现，Architecture 规划是 Web 架构，如何取舍？

| 选项 | 说明 | 影响 |
|------|------|------|
| **A. 纯 Web** | CLI 仅作为遗留参考，不维护 | 需要重写 main.py，工作量 +2 天 |
| **B. Web 为主，CLI 为辅** | CLI 保留为调试工具 | 需要维护两套入口，工作量 +1 天 |
| **C. 纯 CLI** | 放弃 Web 规划，专注 CLI | 与 Architecture 不符，需重写文档 |

**推荐**：选项 A（纯 Web）
- Local 自用场景更适合 Web 界面
- 与 Full 演进路径一致（Vue 3 组件复用）
- CLI 功能可作为 FastAPI 的 admin 端点保留

**决策记录**：
- [x] 已确认选项：**A. 纯 Web**
- [x] 决策日期：2026-03-09
- [x] 决策原因：可视化更强，可展示图表，与 Full 演进路径一致

---

### 决策 #2：业务规则完整度（已调整）

**确认方案**：Local 采用"核心验证版" + Token 统计 + 职级/档位（无成本版）

| 功能 | Local 处理 | 说明 |
|------|-----------|------|
| 周薪/工资 | ❌ 完全跳过 | 用户自付 API 成本，无平台成本约束 |
| 试用期 | ❌ 完全去掉 | 所有 AI 创建即正式工 |
| Token 统计 | ✅ 实现 | 仅供参考，展示 API 调用成本 |
| AI 职级 | ✅ 保留 | 实习生/经理/合伙人，仅能力差异，无工资 |
| 激励档位 | ✅ 保留 | 标准/积极/激进，仅决策频率差异，无工资 |

**职级能力差异**：
- 决策唤醒频率、上下文空间、对话轮数
- 实习生→经理→合伙人 ≈ 3 倍能力差距

**激励档位差异**：
- 仅影响决策唤醒频率
- 标准→积极→激进 ≈ 1.2 倍差距

**Token 统计**：
- 按模型记录 input/output tokens
- 基于公开定价计算成本（~95% 准确）
- 展示维度：今日/本周/本月、按功能、按模型

**问题**：PRD 中的周薪/职级/激励等规则，Local 版本是否完整实现？

| 选项 | 说明 | 影响 | 工期 |
|------|------|------|------|
| **A. 完整规则** | 实现所有业务规则 | 体验最完整，需 +2 周 | 8 周 |
| **B. 简化规则** | 仅保留核心约束 | 体验可接受，需 +1 周 | 7 周 |
| **C. 仅演示** | 界面展示，不实际约束 | 开发最快，但功能残缺 | 6 周 |

**简化规则（选项 B）定义**：
- 周薪：仅记录成本，不做预算硬约束（超预算警告但不阻止）
- 职级：保留三级晋升，但简化升级条件（固定交易日而非复杂计算）
- 激励：保留三档，解锁条件简化（实习 Lv.3 → 正式立即解锁）
- 试用期：保留 5 天概念，工资折扣计算保留

**决策记录**：
- [ ] 已确认选项：___
- [ ] 决策日期：___
- [ ] 决策原因：___

---

### 决策 #3：MVP 范围

**问题**：Phase 1.2 任务过多（23 个），是否采用 MVP 策略先跑通核心循环？

| 选项 | 说明 | 首版周期 | 完整周期 |
|------|------|---------|---------|
| **A. 完整 Phase 1.2** | 按规划实现所有功能 | - | 5 周 |
| **B. MVP 精简** | 先跑通 DeepSeek + 东方财富 + 表单策略 | 2 周 | 5 周 |
| **C. 混合策略** | Phase 1.2 分两次迭代 | 3 周 | 5 周 |

**推荐**：选项 B（MVP 精简）
- 快速验证核心循环：创建 AI → 获取行情 → 执行交易
- 2 周后可演示，增强信心
- 后续迭代补充多模型、策略对话、新闻等

**MVP 功能边界**：
- ✅ AI 创建（仅 DeepSeek，表单策略）
- ✅ 实时行情（仅东方财富）
- ✅ 虚拟交易（买入/卖出）
- ✅ 持仓/收益展示
- ❌ 多模型支持（延后）
- ❌ 策略对话（延后）
- ❌ 新闻/舆论（延后）
- ❌ AI 职级晋升（延后）

**决策记录**：
- [x] 已确认选项：**A. 完整实现 Phase 1.2**
- [x] 决策日期：2026-03-09
- [x] 决策原因：一次性验证所有技术点，无需后续返工。Phase 1.2 周期5周，在第3周末设置检查点确保核心流程已通

---

### 决策 #4：数据源架构（已确定）

**问题**：Local 形态的数据采集系统应该采用简化版还是完整复刻 v0.9 的多数据源架构？

| 选项 | 说明 | 数据源数量 | 技术复杂度 | 验证价值 |
|------|------|-----------|-----------|---------|
| **A. 简化版** | 仅东方财富 + CSV 备用 | 2 | 低 | 低 |
| **B. 精简多源** | 新浪 + 东方财富 + CSV | 3 | 中 | 中 |
| **C. 完整复刻** | 完整复刻 v0.9 六数据源架构 | 6+ | 高 | **高** |

**v0.9 六数据源架构**：
- 实时数据源：新浪财经、腾讯财经、东方财富
- 历史数据源：AkShare、Baostock
- 财务数据源：Tushare（需 Token）
- 备用数据源：CSV（离线/测试）

**核心组件**：
1. **DataSourceRouter** - 多源路由、权重分配
2. **CircuitBreaker** - 熔断降级、故障检测
3. **数据对齐服务** - 多源数据时间对齐、字段标准化

**决策记录**：
- [x] 已确认选项：**C. 完整复刻**
- [x] 决策日期：2026-03-09
- [x] 决策原因：Local 形态作为技术验证版，完整复刻可验证所有技术点，为 Full 演进提供完整参考

**影响范围**：
- IMPLEMENTATION_PLAN.md - 数据采集系统任务扩展
- ARCHITECTURE.md - 添加 DataSourceRouter 详细设计
- 新增工时：~40h（6 个数据源 + 路由 + 熔断 + 对齐）

---

## 业务规则设计（已确认，待写入正式文档）

### 规则 #1：工资制度（Local 不适用）

**决策**：Local 形态完全跳过工资系统

**理由**：
- Local 为自用版，用户自付 API 成本
- 无平台成本约束需求
- 开发周期节省 2-3 周

**DELIVERY_PLAN 标注**：周薪/订阅为 ❌ 不支持（MVP/Full 商业功能）

---

### 规则 #1（替代）：Token 消耗统计

```
统计维度：
- 时间维度：今日 / 本周 / 本月
- 功能维度：AI 决策 / 策略对话 / 新闻分析
- 模型维度：DeepSeek / 通义 / Kimi / GLM

成本计算：
- 基于 API 返回的 usage.prompt_tokens / completion_tokens
- 按模型公开定价计算（准确度 ~95%）
- 实时汇率转换为人民币显示

展示效果：
今日消耗: ¥2.35 (约 16,800 tokens)
本周消耗: ¥12.80
本月消耗: ¥45.60
```

**注意**：仅供参考，实际账单以 API 提供商为准

---

### 规则 #2：AI 职级晋升（核心验证版）

```
职级层级：
1. 实习生（Intern）- 默认创建
2. 经理（Manager）- Lv.6 可晋升
3. 合伙人（Partner）- Lv.12 可晋升

等级规则：
- 每 5 个交易日自动升 1 级
- 等级无上限，但职级有天花板

晋升规则：
- 实习生 Lv.6 → 晋升经理
- 经理 Lv.12 → 晋升合伙人
- 新雇佣的经理/合伙人从 Lv.1 开始（仅解锁职级能力）

能力差异（3 倍级）：
- 决策唤醒频率：合伙人 3x 经理 3x 实习生
- 上下文空间：合伙人 3x 经理 3x 实习生
- 对话轮数限制：合伙人 3x 经理 3x 实习生

Local 核心验证版：
- 自动升级，无需用户操作
- 等级影响激励档位解锁
- 无工资成本，仅体验成长
```

---

### 规则 #3：激励档位解锁（核心验证版）

```
档位设计：
- 标准模式（Standard）：基准能力，标准报告（100字）
- 积极模式（Active）：1.2x 能力，详细报告（150字）
- 激进模式（Aggressive）：1.2x 能力，超详细报告（250字+预测）

能力差异（1.2 倍级）：
- 主要影响决策唤醒频率
- 激进档可额外增加上下文空间和对话轮数

解锁规则：
- 实习生：Lv.3 解锁积极档，Lv.6 晋升经理后解锁激进档
- 经理：立即解锁积极档，Lv.3 解锁激进档
- 合伙人：立即解锁全部档位

档位切换：
- 用户随时可调整档位
- 调整后立即生效
- 无工资成本差异（Local 无工资系统）

Local 核心验证版：
- 仅影响 AI 决策质量和频率
- 无经济成本约束
- 作为用户微调 AI 行为的手段
```

---

### 规则 #4：初始资金设置（已确认）

**设计原则**：
- 用户无"投资研究点数"概念，直接设置"初始资金"
- 创建 AI 时按职级提供默认值，用户可自由修改

**资金范围**：
- 下限：1万（硬性限制，低于则提示）
- 上限：10亿（硬性限制，高于则提示"大额资金风险"）

**职级默认值**：
| 职级 | 默认值 | 说明 |
|------|--------|------|
| 实习生 | 50万 | 适合新手体验 |
| 经理 | 100万 | 中等规模测试 |
| 合伙人 | 500万 | 大规模策略验证 |

**实现逻辑**：
```python
class CreateAgentRequest(BaseModel):
    name: str
    initial_capital: Decimal  # 用户输入，范围 1万-10亿
    agent_level: AgentLevel   # 决定表单默认值
    # ... 其他字段

DEFAULT_CAPITAL = {
    AgentLevel.INTERN: 500000,      # 50万
    AgentLevel.MANAGER: 1000000,    # 100万
    AgentLevel.PARTNER: 5000000,    # 500万
}

MIN_CAPITAL = 10000      # 1万
MAX_CAPITAL = 1000000000 # 10亿
```

**确认状态**：✅ 已确认

### 收益率计算逻辑（已确认）

**核心指标**：

| 指标 | 公式 | 用途 |
|------|------|------|
| **总收益率** | (当前总资产 - 初始资金) / 初始资金 × 100% | 整体收益表现 |
| **日收益率** | (今日总资产 - 昨日总资产) / 昨日总资产 × 100% | 每日波动 |
| **年化收益率** | (1 + 总收益率)^(365/持仓天数) - 1 | 标准化比较 |
| **最大回撤** | max((峰值 - 谷值) / 峰值) × 100% | 风险控制 |
| **夏普比率** | (年化收益率 - 无风险利率) / 收益率标准差 | 风险调整后收益 |
| **胜率** | 盈利交易次数 / 总交易次数 × 100% | 交易质量 |
| **盈亏比** | 平均盈利金额 / 平均亏损金额 | 交易效率 |

**实现位置**：`services/portfolio_service.py`

```python
class PortfolioMetrics:
    """收益指标计算服务"""

    def calculate_all(self, agent_id: UUID) -> PortfolioStats:
        agent = self.get_agent(agent_id)
        trades = self.get_trade_history(agent_id)
        daily_values = self.get_daily_asset_values(agent_id)

        return PortfolioStats(
            total_return=self._total_return(agent, daily_values),
            annualized_return=self._annualized_return(daily_values),
            max_drawdown=self._max_drawdown(daily_values),
            sharpe_ratio=self._sharpe_ratio(daily_values),
            win_rate=self._win_rate(trades),
            profit_loss_ratio=self._pl_ratio(trades),
            total_trades=len(trades),
            profitable_trades=len([t for t in trades if t.realized_pnl > 0]),
        )

    def _max_drawdown(self, values: List[DailyValue]) -> float:
        """最大回撤计算"""
        peak = values[0].total_asset
        max_dd = 0
        for v in values:
            if v.total_asset > peak:
                peak = v.total_asset
            dd = (peak - v.total_asset) / peak
            max_dd = max(max_dd, dd)
        return max_dd * 100

    def _sharpe_ratio(self, values: List[DailyValue], risk_free_rate: float = 0.03) -> float:
        """夏普比率计算"""
        returns = [(v2.total_asset - v1.total_asset) / v1.total_asset
                   for v1, v2 in zip(values[:-1], values[1:])]
        if not returns or np.std(returns) == 0:
            return 0
        excess_return = np.mean(returns) * 252 - risk_free_rate  # 252个交易日
        return excess_return / (np.std(returns) * np.sqrt(252))
```

**前端展示**：
- AgentDetail.vue：展示各 AI 交易员的核心指标卡片
- Dashboard.vue：多 AI 对比图表（收益曲线、夏普比率排行）

**确认状态**：✅ 已确认

---

## 数据模型补充（待写入 ARCHITECTURE）

### 新增枚举

```python
# core/domain/enums.py

class AgentLevel(str, Enum):
    """AI 职级"""
    INTERN = "intern"           # 实习生
    MANAGER = "manager"         # 经理
    PARTNER = "partner"         # 合伙人

class IncentiveLevel(str, Enum):
    """激励档位"""
    STANDARD = "standard"       # 标准
    ACTIVE = "active"           # 积极
    AGGRESSIVE = "aggressive"   # 激进
```

### 模型字段补充

```python
# AIAgent 模型新增字段
class AIAgent(BaseModel):
    # ... 现有字段 ...

    # 职级系统
    level: AgentLevel = Field(default=AgentLevel.INTERN)
    agent_level: int = Field(default=1, description="AI 等级 Lv.1-Lv.∞")

    # 激励档位
    incentive_level: IncentiveLevel = Field(default=IncentiveLevel.STANDARD)

    # 创建时间（用于等级计算）
    created_at: datetime = Field(default_factory=datetime.now)

    # Token 消耗统计
    total_input_tokens: int = Field(default=0)
    total_output_tokens: int = Field(default=0)
    total_api_cost: Decimal = Field(default=Decimal("0"))
```

### 新增服务接口

```python
# services/token_tracker.py
class TokenTracker:
    """Token 消耗追踪服务"""

    def record_usage(self,
                     agent_id: UUID,
                     model: str,
                     input_tokens: int,
                     output_tokens: int,
                     action: str) -> Decimal:
        """记录 Token 消耗并返回成本"""
        pass

    def get_agent_stats(self, agent_id: UUID) -> TokenStats:
        """获取指定 AI 的统计"""
        pass

    def get_global_stats(self, period: str = "today") -> GlobalTokenStats:
        """获取全局统计"""
        pass

# services/promotion_service.py
class PromotionService:
    """职级晋升服务（无工资版本）"""

    def should_level_up(self, agent: AIAgent) -> bool:
        """判断是否升级（每5个交易日）"""
        pass

    def check_promotion_eligible(self, agent: AIAgent) -> Optional[AgentLevel]:
        """检查是否满足晋升条件"""
        pass

    def promote(self, agent_id: UUID) -> AIAgent:
        """执行晋升"""
        pass

    def get_incentive_availability(self, agent: AIAgent) -> List[IncentiveLevel]:
        """获取可用的激励档位"""
        pass
```

---

## 任务估算调整（待写入 IMPLEMENTATION_PLAN）

### 需调整的任务

| 任务 ID | 原估算 | 建议新估算 | 调整原因 |
|---------|--------|-----------|---------|
| B-1.2.5a-f 六数据源适配器 | 6h | **40h** | 新浪财经/腾讯/东财/AkShare/Baostock/Tushare |
| B-1.2.6a DataSourceRouter | 4h | **8h** | 动态路由、权重分配、多源管理 |
| B-1.2.6b 数据对齐服务 | - | **6h** | 多源数据时间对齐、字段标准化 |
| B-1.2.6c 熔断降级机制 | - | **6h** | 故障检测、自动切换、健康检查 |
| B-1.2.14 DeepSeek 适配器 | 4h | **8h** | 错误重试、Token 控制、超时处理 |
| B-1.3.1 策略 Prompt | 6h | **16h** | Prompt 工程需多轮调优 |
| B-1.3.10 多模型支持 | 6h | **20h** | 4 个模型适配器 + 统一接口测试 |
| B-1.3.11 新闻采集 | 4h | **12h** | 需复用 v0.9 逻辑，简化适配 |

### 新增任务

| 任务 ID | 说明 | 估算 | 优先级 | 依赖 |
|---------|------|------|--------|------|
| B-1.1.7 | API Key 配置管理 | 2h | P0 | - |
| B-1.1.8 | TokenTracker 服务 | 4h | P1 | - |
| B-1.2.17 | PromotionService 职级晋升 | 8h | P1 | B-1.2.1 |
| B-1.2.19 | **PortfolioService 收益计算** | **8h** | P1 | B-1.2.11 | 含收益率/夏普/最大回撤等 |
| F-1.2.12 | Token 统计面板 | 3h | P2 | B-1.1.8 |

### 时间线调整

```
原规划:                    调整后:
├── Phase 1.1: 1-2 周     ├── Phase 1.1: 2 周（增加配置任务）
├── Phase 1.2: 3-4 周     ├── Phase 1.2: 5 周（增加业务逻辑+六数据源）
└── Phase 1.3: 5-6 周     └── Phase 1.3: 8 周（预留调优时间+完整数据源）
     总计: 6 周                总计: 8 周（完整复刻版）
```

**MVP 精简版时间线**（如选择决策 #3 选项 B）：
```
├── Phase 1.1: 1 周
├── MVP 迭代: 2 周（精简功能）
└── Phase 1.2+: 4 周（补充功能）
     总计: 7 周（MVP + 完整）
```

---

## 完成检查清单（删除本文档前确认）

### P0 问题解决确认

- [x] **决策 #1** 已记录（采用纯 Web 架构）
- [x] **决策 #2** 已记录（Local 采用核心验证版 + Token 统计 + 职级/档位无成本版）
- [x] **决策 #2** 已记录到 DELIVERY_PLAN.md（Local 功能边界）
- [x] **Token 统计** 已记录到 ARCHITECTURE.md（数据模型、服务接口）
- [x] **职级晋升** 已记录到 IMPLEMENTATION_PLAN.md（无工资版本）
- [x] **激励档位** 已记录到 IMPLEMENTATION_PLAN.md（无工资版本）
- [x] **决策 #4** 已记录（完整复刻 v0.9 六数据源架构）
- [x] **数据源架构** 已更新到 IMPLEMENTATION_PLAN.md（B-1.2.3 ~ B-1.2.8 扩展）
- [x] **DataSourceRouter** 已更新到 ARCHITECTURE.md（第 3.4 节）

### P1 问题解决确认

- [x] **问题 #6** 任务估算已调整，时间线已更新（6h→16h 等，总周期 6周→8周）
- [x] **问题 #7** 数据模型已补充（AgentLevel/IncentiveLevel 等）
- [x] **问题 #8** 目录结构已确认（模块化单体：backend/frontend/core/adapters）
- [x] **问题 #9** API_SPEC.md 延后创建（单人开发，FastAPI 自动生成文档足够）
- [x] **问题 #10** 收益率计算逻辑已规划（PortfolioService，含夏普/回撤/胜率等）

### P2 问题解决确认

- [x] **问题 #11** 称号系统 - 明确延后（非核心功能）
- [x] **问题 #12** API Key 加密 - 延后（Local 自用风险低）
- [x] **问题 #13** 性能指标 - 延后（上线前补充）
- [x] **问题 #14** 合规 UI - 开发时对照 PRD 2.5 执行
- [x] **问题 #15** 数据一致性 - 开发时处理（交易执行前刷新价格）

### 文档更新确认

- [x] ARCHITECTURE.md 已更新（含数据模型、目录结构、Token统计、功能边界、初始资金规则、收益率服务）
- [x] IMPLEMENTATION_PLAN.md 已更新（含业务规则、任务估算、时间线 8周、PortfolioService B-1.2.19）
- [x] DELIVERY_PLAN.md 已更新（含 Local 功能边界、Token统计）
- [x] TODO.md 已同步更新（任务列表与实际一致）

### 最终确认

- [x] 所有决策已内化到正式文档
- [x] 本文档内容已冗余，可删除
- [x] 团队已审阅更新后的文档（2026-03-09）

---

## 删除本文档的条件

**本文档可在以下条件满足后删除**：

1. ✅ 所有 P0 问题已解决（决策已记录到正式文档）
2. ✅ 所有 P1 问题已解决或明确处理方案
3. ✅ 目标文档（DELIVERY_PLAN/ARCHITECTURE/IMPLEMENTATION_PLAN/TODO）已更新
4. ⏳ 团队已审阅并确认更新后的文档

**当前状态**：✅ 所有问题解决，文档可删除

---

## 附录：快速参考

### 相关文档链接

- [PRD](../../../PRD.md) - 产品需求来源
- [DELIVERY_PLAN](../../../DELIVERY_PLAN.md) - 三形态边界
- [ARCHITECTURE](./ARCHITECTURE.md) - 技术架构（待更新）
- [IMPLEMENTATION_PLAN](./IMPLEMENTATION_PLAN.md) - 实施规划（待更新）
- [TODO](./TODO.md) - 任务追踪（待更新）

### 历史参考

- [v0.9 Market Data](../../../../archive/v0.9-legacy/docs/modules/market-data-service/HAVE_DONE.md)
- [v0.9 Trading AI](../../../../archive/v0.9-legacy/docs/modules/trading-ai-service/HAVE_DONE.md)
- [v0.9 News](../../../../archive/v0.9-legacy/docs/modules/news-service/HAVE_DONE.md)

---

*本文档创建时间: 2026-03-09*
*解决完成后删除，内容内化到正式文档*
