# SR-005：develop 演进与 main 资产抽核

- 日期：2026-10-27
- 范围：`047bbf9..b70ca94` 的 develop 关键演进、develop 顶点 `local/` 的真实架构，以及 main 旧 v1 与 10 月新增底座的资产处置。
- 场地：新正典为维护者本机 stock-race 仓库的 main 检出；develop 证据来自 stock-race-legacy-develop 仓库的 detached `b70ca94`（原始绝对路径为私有环境路径，不再记录）。
- 方法：三条独立只读盘点，主会话抽核分支拓扑、关键提交、Local 决策/交易/适配器边界与资产处置依据；不逐提交复述，不做全仓审计。
- 边界：未联网、安装、启动、操作数据库/API、运行测试或历史脚本；未读取实际环境文件及既定脱敏跳过文件。除本报告外未修改文件。

## 结论摘要

1. **develop 是 v1 后的连续重构与产品探索线，不是已经完成的 Local/MVP/Full 三产品。** 顶点只有 Local 具有实质代码；Full 只有 README，MVP 只有 README 和四篇文档。
2. **演进有三次重要重定义**：Local 从离线 CLI 改为本地服务；三形态从目录/文档设想转为以 Local 为实现中心；最终 MVP 又从实时竞赛转向收盘后的“AI 复盘搭档”。最后一项是文档转向，不是已落地功能。
3. **Local 有真实的接口抽象和业务实现，但不是纯内核 + 适配器注入架构。** 它采用 FastAPI 单体、services 子包中的 ABC、模块级工厂和 ORM；交易与决策仍直接依赖具体服务。
4. **main 的 10 月协作/研究底座应保留，v1 代码按能力选择性验证复用。** develop/local 存在另一套行情与 AI 适配器，不应误判为 main 所有旧组件都“独有”，也不能把 develop 整体视为更佳版本。
5. **建议组合使用归档 tag、现有参考分支和选择性移植。** 直接清理当前树可以减少误导，但应放在归档入口、目标架构和移植范围明确之后；清理工作树不等于治理历史中的敏感内容，也不替代运行验证。

---

## 一、develop 的真实演进

### 1. 分支事实

- merge-base 为 `047bbf9`（2026-02-05）；`origin/main...origin/develop` 为 1/304，当前 `main...origin/develop` 为 5/304。
- `5b5df63` 是 origin/main 顶点和当前 main 的祖先，不是 origin/develop 的祖先；`8ebdd4c` 只在 develop 线。
- 当前 main 的 `backend/`、`ai-service/`、`data-service/`、`frontend/`、`scripts/`、`docker/` 和 `docker-compose.yml` 与 `047bbf9` 无差异；10 月新增提交没有修改这些业务资产。

### 2. 阶段时间线

下表“代码/提交事实”只描述入库变化；“文档宣称”不等于功能验收。

| 阶段 | 关键证据 | 事实与解释 |
|---|---|---|
| v1 功能扩展与服务化，02-06～02-13 | `2339694`（02-09，小程序 P0）、`f9124a4`（02-10，六服务架构文档）、`ac3e318`（02-13，全服务 Docker 化） | 在 v1 发布后继续加小程序、服务拆分、事件总线、健康检查和联调。不是到 5b5df63 就停止全部演进，而是 main 停住、develop 继续。 |
| 工程迁移与产品重设计，02-15～03-05 | `e152605`（WSL2 方案）、`63b6540`（自动化开发系统）、`28235f7`（02-27，产品核心设计讨论）、`59d1ada`（03-04，商业模式调整） | 前段有环境/自动化和小程序测试工作，后段大量产品讨论落在 `docs/v1/`。产品重设计主要是文档事实，不能当作代码落地。 |
| v0.9 归档与 v2 初始化，02-28～03-06 | `e087b20`（02-28，归档 v0.9 并初始化 v2）、`01f7640`（03-06，二次清理并建立新目录） | 旧实现被归档/清理，develop 开始新结构。既有 `v0.9-legacy-archived` tag 指向 `7cb1df5`。顶点没有 Go 文件，不能把技术宣言写成已完成重写。 |
| Local 首次实现并同日重定义，03-06 | `c7c102e`（Local 基础实现）、`62de3a3`（重新定义 Local） | 第一版 Local 是离线 CLI；同日文档改成 FastAPI + Vue 的本地服务。[DELIVERY_PLAN.md:11-16](https://github.com/FEJerome/stock-race/blob/b70ca94/docs/DELIVERY_PLAN.md#L11-L16) 明记这次变化。 |
| 三形态结构确立，03-08～03-09 | `52862e1`、`ec54f1c`、`8ebdd4c` | Local/MVP/Full 的目录和文档分层形成。[DELIVERY_PLAN.md:230-275](https://github.com/FEJerome/stock-race/blob/b70ca94/docs/DELIVERY_PLAN.md#L230-L275) 给出 Phase 1 Local、Phase 2 MVP、Phase 3 Full 的设想；它不是三形态均已实现的证据。 |
| Local 主实现与审查修正，03-10～03-12 | `37b9307`、`28c1e72`、`7888b76` | Local 增加多模型、行情、新闻、前端和交易实现，并经历 code review 修正。它是 develop 顶点唯一具有实质代码的产品形态。 |
| Phase 1.4 事件舆情扩展，03-12～03-13 | `51fdc15`、`b56dee0`、`e23cc54`、`5a0ad55`、`cdc272f`、`8f92a03` | 增加事件分析、实时采集、公告/财报/社交舆情及审查修复；任务管理同时转向 GitHub Issues。此阶段扩展了 Local，不等于 Full 落地。 |
| MVP 文档转向，03-20 | `b70ca94` | 只改 MVP README/文档。[MVP_DEFINITION.md:15-32](https://github.com/FEJerome/stock-race/blob/b70ca94/mvp/docs/MVP_DEFINITION.md#L15-L32) 改成每日收盘后单一人格化复盘，并明确不做实时交易、选股、排行和对话。该提交没有实现代码。 |

### 3. 顶点形态核查

- `full/` 只有 `README.md`。
- `mvp/` 只有 README 与 `COMPLIANCE_ANALYSIS.md`、`DIRECTION_REDEFINITION.md`、`MVP_DEFINITION.md`、`TECHNICAL_FEASIBILITY.md`。
- `local/` 才有后端、前端、demo 和测试。
- 因而，准确叙事是：**v1 扩展 → 产品重设计 → 旧代码归档 → Local 重构与实现 → MVP 文档转向**。三形态是组织框架，不是三个已交付产品。

### 4. 无法从 Git 确认

- 空窗期是否有未提交实现或线下决策。
- “生产就绪”“完整实现”等提交/文档措辞对应的真实运行验收范围。
- MVP 转向是否代表整个项目放弃竞赛，还是只改变 MVP；文档直接约束的是 MVP，不能自动外推为当前产品拍板。

---

## 二、develop/local 的真实架构与实现

### 1. 事实：有实质实现，但不是文档式纯内核

实际入口是 [local/backend/main.py:33-93](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/main.py#L33-L93)：初始化数据库、缓存、WebSocket 广播和清理调度，再注册 API 路由。实际后端目录为 `api/`、`models/`、`services/`、`alembic/` 和测试；没有独立的顶层 `core/`、`adapters/` 或纯 domain 包。

真实依赖方向大致为 `api → services → models`，但 API 也会直接调用 ORM，services 之间可互相导入。数据库会话通过 FastAPI Depends 注入；多数其他协作者通过模块级工厂/单例取得。

### 2. 适配器雏形是真实的

- AI 有 `AIAdapter` 抽象，要求 `make_decision/build_prompt/parse_response`：[base.py:157-207](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/ai_adapter/base.py#L157-L207)。工厂支持 Kimi、DeepSeek、Qwen、GLM：[__init__.py:27-48](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/ai_adapter/__init__.py#L27-L48)。
- 行情有 `DataSource` 抽象及带来源字段的 Quote/MarketData：[base.py:22-83](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/market_data/base.py#L22-L83)、[base.py:97-182](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/market_data/base.py#L97-L182)。
- 实际存在新浪、腾讯、东财、CSV、AKShare、Baostock、Tushare 等实现：[market_data/__init__.py:1-24](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/market_data/__init__.py#L1-L24)。路由器提供注册、故障转移和聚合：[router.py:27-77](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/market_data/router.py#L27-L77)、[router.py:79-141](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/market_data/router.py#L79-L141)。
- 事件窗口管理器至少展示了构造注入测试会话的方式：[event_window_manager.py:46-67](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/event_window_manager.py#L46-L67)、[tests/conftest.py:50-74](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/tests/conftest.py#L50-L74)。

**判断**：这些超过“只有目录命名”的程度，可作为 port 候选；但没有统一 composition root，领域对象又分布在 adapter base 内，所以仍不是“纯内核 + 端口注入”。

### 3. 交易实现有业务逻辑，但耦合具体基础设施

`TradingService` 实现买入资金检查、单股仓位限制、加权均价、卖出已实现盈亏和持仓更新：[trading_service.py:64-186](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/trading_service.py#L64-L186)、[trading_service.py:188-290](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/trading_service.py#L188-L290)。

但它同时：

- 直接依赖 SQLAlchemy 和 ORM 模型；
- 在构造函数抓取全局行情 router 并注册数据源：[trading_service.py:26-63](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/trading_service.py#L26-L63)；
- 自己调用 `db.commit()`；
- 用 float 保存资金，仓位上限硬编码；
- 未见交易时段/日历、完整订单生命周期和高级收益指标。

因此可抽取业务规则，不能原样称为纯交易内核。

### 4. AI 决策仍可直接驱动交易，且存在断点

`/api/agents/{agent_id}/decide` 汇总行情、持仓、组合、新闻与事件信息后调用模型：[decision.py:87-231](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/api/decision.py#L87-L231)。随后，买卖动作为 buy/sell 且置信度不低于 0.6 时，会调用 `trading_service.execute_trade()`：[decision.py:236-291](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/api/decision.py#L236-L291)。

关键限制：

- 买入路径读取 `portfolio.available_capital`，而组合实际返回 `cash`：[decision.py:240-247](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/api/decision.py#L240-L247)、[trading_service.py:364-400](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/trading_service.py#L364-L400)。静态推导为买入数量归零；卖出路径仍是模型可直接触发交易的代码。
- provider 固定为 Kimi，而不是按 `agent.model_provider` 选择：[decision.py:175-188](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/api/decision.py#L175-L188)。
- 决策历史明确是未持久化占位：[decision.py:324-340](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/api/decision.py#L324-L340)。
- 组合摘要只有基础收益：[trading_service.py:364-400](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/services/trading_service.py#L364-L400)，不能据此宣称夏普、回撤、胜率等完整分析已经实现。

所以 Local 不能作为“模型只辅助规则、规则确定执行”的现成实现；它仍属于模型交易动作驱动执行的旧范式。

### 5. 可填充新架构与不应继承

**推断：可候选抽取**

- AI/DataSource/News/Sentiment/Collector 的 ABC 与数据契约；
- 行情 router 的注册、聚合与故障转移思路；
- 交易中的资金、均价、持仓和已实现盈亏规则；
- 事件窗口、强度、时序分类和叙事中的可独立计算部分；
- ORM/DTO 与内存 SQLite、纯逻辑测试的写法。

**推断：不应原样继承**

- 全局单例工厂作为默认装配方式；
- API 直连 ORM 与 services 任意互调；
- 模型直接触发交易、固定 provider、决策不持久化；
- float 金额、硬编码交易约束和未经契约测试的字段映射；
- 把设计文档中的 core/engine/合规/指标目标当成现有实现。

### 6. 测试证据边界

存在内存 SQLite fixtures、纯逻辑测试和 Playwright E2E 代码，例如 [tests/conftest.py:17-74](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/tests/conftest.py#L17-L74) 与 [test_trade_flow.py:23-70](https://github.com/FEJerome/stock-race/blob/b70ca94/local/backend/tests/e2e/test_trade_flow.py#L23-L70)。也有依赖真实模型、数据源和网络的 integration 测试。

本次没有执行任何测试，因此只能确认测试资产存在，不能确认 Local 可启动、套件通过或外部集成可用。

---

## 三、main 与 develop 的资产关系

### 1. main 的独有价值

当前 main 在旧 v1 上新增了协作与研究底座，且业务代码未随 10 月工作改变：

- `CLAUDE.md`、根 README、协作规则、开发约定、环境入口；
- feature/research/decision 文档住所及 SR-001/SR-003 证据；
- 历史资料信任顺序、测试证据要求和主子智能体边界。

SR-001 明确本次只改底座、不改业务实现：[SR-001-collaboration-base.md:3-22](../../docs/features/SR-001-collaboration-base.md#L3-L22)。这些是当前新 main 的工作规则，应优先保留，而不是被 develop 的旧协作方案覆盖。

### 2. develop 不是简单的“更新版 main”

- develop 删除/移出旧多模块结构，转为 Local 单体与新产品文档；不能直接合并回 main 当作升级。
- 对行情与 AI，两侧有不同实现：main 有旧 v1 适配器/采集器，develop/local 也有另一套。应逐项比较接口、数据来源、历史能力、错误语义和测试，而不是笼统称某侧“独有”或“更好”。
- 对账户/订单/持仓，main 是 Express + Prisma/PostgreSQL，develop 是 FastAPI + SQLAlchemy/SQLite；模型与事务边界不同。
- 对前端，main 是 React，develop/local 是 Vue；不能按文件名直接替换。
- 对协作底座，10 月 main 是新的信任与复审体系；develop 的 Issues/.claude 自动化方案属于历史参考。

---

## 四、资产处置表

以下为工程建议，均为推断；不代表已经批准移动、删除或移植。

| 资产 | 对照关系与证据 | 建议 | 条件/理由 |
|---|---|---|---|
| 10 月 `CLAUDE.md`、协作/开发规则、feature/research/decision 住所 | 当前 main 新增，develop 不含这套信任体系 | **保留** | 是当前正典与后续任务边界。 |
| SR-001、SR-003 及本报告 | 当前核验证据 | **保留** | 防止再次把历史完成声明当现状。 |
| `.gitignore` 与公开配置模板 | 当前规则与模板 | **保留** | 环境治理由独立任务继续，不在资产清理中顺手处理。 |
| main Prisma 账户/订单/持仓模型与加权均价 | develop 有 SQLAlchemy 替代实现；main 缺陷见 SR-003 | **验证复用** | 参考领域语义，不继承执行写回和事务缺陷。 |
| main AI 适配器工厂、提示词与解析框架；develop AI ABC/工厂 | 两套接口与 provider 覆盖不同；Local 仍直接产生交易动作 | **验证复用** | 按目标 provider 和规则 schema 选择，重写模型输出为规则定义而非下单动作。 |
| main 历史采集/Timescale 结构；develop 行情 Source/Router/来源元数据 | 两套能力不完全重合 | **验证复用** | 比较历史区间、复权、事件时间、降级和测试后逐源移植。 |
| main VirtualTradingService；develop TradingService | 均有真实业务片段，也都有耦合/契约问题 | **验证复用或只作参考** | 可抽资金/持仓/盈亏规则，不整文件继承。 |
| develop 事件舆情计算与窗口管理 | main 旧 v1 没有同等新实现 | **选择性移植候选** | 只有新架构确认需要该能力时，先统一重复模型并补自洽测试。 |
| 两侧测试骨架与 fixtures | 有纯逻辑/内存测试，也有 mock 或真实外部依赖 | **验证复用** | 复用测试意图和夹具，不复用“已通过”的未核实声明。 |
| main React 与 develop Vue 前端 | 技术栈不同，且旧 main 有大量 mock | **只作参考** | 等产品界面与交互方向明确后重建或逐组件评审。 |
| 旧架构、部署、协调、完成报告 | 多处与代码现状冲突 | **只作参考** | 可留 Git 历史；当前树若保留必须维持清晰历史标记。 |
| Docker/Nginx/监控/CI 配置 | 面向旧部署形态，当前无锁文件且未运行验证 | **只作参考或验证复用** | 仅在部署架构确定后逐项重建与验证，不作为新底座默认能力。 |
| 随机 AI/行情降级、无来源模拟历史、模型直接交易接线 | SR-003 与 Local 决策链均有证据 | **不继承** | 与可复现研究和模型不直接下单方向冲突。 |
| 全局单例、空壳服务、占位历史与伪造绩效 | 两侧均有静态证据 | **不继承** | 不以目录/接口名称代替真实能力。 |

---

## 五、旧资产的三种处置方式及直接清理方案

### 1. 归档 tag

**适用**：钉住一个明确、不可变的旧基线，例如 `5b5df63` 所代表的 origin/main 最终 v1 合并状态。

**现状**：已有 `v1.0.0` tag 实际指向 `a54c8ec`，不是 `047bbf9` 或 `5b5df63`；已有 `v0.9-legacy-archived` 指向 `7cb1df5`。

**优点**：低成本、便于精确检索和比较，不改变当前工作树。**局限**：tag 本身不提供“哪些资产可用”的判断，也不会清理当前树；仍需在文档中说明用途。

**建议**：若准备清理旧 v1，可先由一个明确授权的治理任务决定是否为 `5b5df63` 增加精确归档 tag。它是强烈建议的可发现性保障，不是 Git 保存历史的技术前提。

### 2. 归档/参考分支

**适用**：保留一条会继续被查阅、对照或选择性取码的替代实现线。

**现状**：`origin/develop` 已天然保存三形态与 Local 历史；`origin/main` 也保存旧 v1 顶点。无需为了“保存”再复制一套。

**优点**：易浏览、易 diff、可在独立工作区取码。**局限**：分支可移动，名称也可能让人误以为仍在维护；需要清晰命名或保护规则。

**建议**：develop 保持参考线；是否为 v1 另建受保护归档分支属于可选冗余，不应与 tag 或新 main 正典混为一谈。

### 3. 选择性移植到新模块

**适用**：新 main 已定义目标内核、ports、数据契约和测试边界后，从 main v1 或 develop/local 取特定能力。

**优点**：避免整分支带入随机降级、全局单例和旧产品语义；允许按能力选择两侧更合适实现。**成本**：每个组件都要补契约、时间和运行验证，不能只做复制。

**建议**：每次移植注明来源 commit、保留测试意图、重新验证，不以“develop 更新”作为免检理由。

### 4. 直接清理当前树，依赖 Git 历史保存

**适用**：新 main 希望只呈现新架构与有效文档，旧 v1 不再作为可运行项目暴露。

**优点**：当前树更小、更清晰，减少误启动旧服务和误读完成文档；删除当前文件不会删除 main 祖先中的旧实现。当前业务树与 `047bbf9` 一致，也使旧基线容易识别。

**风险与前提**：

- 清理后取码门槛提高，需保留 tag/分支/文档索引等明确入口；
- 浅克隆、历史改写或误删 refs 会削弱可检索性，Git 历史也不等于异地备份；
- main v1 与 develop 的组件并非全部重复，不能假设“develop 都有”；
- 工作树清理不处理历史敏感内容，相关治理必须独立授权，不能与“保留旧历史”混为一项；
- 在目标架构尚未确定前清理，可能把仍有参考价值的实现变成难以发现的负担。

**建议**：它是归档与移植决策后的可选末步，不是唯一方案，也不是本轮默认动作。

### 5. 推荐组合

**保留当前 10 月底座 → 明确归档入口 → 保留 develop 参考线 → 按新模块选择性移植 → 再决定是否清理旧树。**

该组合同时满足“新 main 保持干净”和“旧资产可追溯”，但不要求立刻删除任何业务目录。

---

## 六、未验证与需拍板事项

### 未验证

- 未运行 main 或 Local 的服务、测试、数据库、模型或数据源。
- 未逐项性能/质量比较两侧所有适配器，只确认实现存在、接口和关键调用关系。
- 未核实 Local 首次启动、全部测试通过、默认源覆盖及外部依赖可用性。
- 未完整比较旧 main 架构文档与 develop 历史归档文档的文本差异。
- 未检查仓外备份、远端保护规则或未同步提交。

### 需维护者拍板

1. 新 main 的目标模块边界与当前树应保留哪些业务目录。
2. 每类能力从 main v1、develop/local 还是新实现中选择，以及相应验证门槛。
3. 是否为 `5b5df63` 增加归档 tag、是否另设受保护 v1 参考分支。
4. 何时以及按什么范围清理旧树；清理与环境/敏感历史治理保持独立任务。
5. develop 的事件舆情和 MVP 复盘方向是否属于新架构范围，不能仅因代码存在就自动继承。
