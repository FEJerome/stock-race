# SR-003：旧代码与交易链调研

- 日期：2026-10-27
- 研究目标：为“模型帮助形成或调整量化规则，规则在虚拟盘执行；模型不直接下单”的后续讨论核实历史代码，不作产品拍板。
- 范围：`ai-service` 决策链、`backend` 虚拟账户与交易执行、`data-service` 行情与历史数据，以及必要的前端调用和演示脚本。
- 方法：只读代码、配置结构、依赖清单和测试；主会话亲核跨模块接口、交易语义和时间机制，三个独立模块先分别盘点。
- 脱敏边界：按续研要求，整文件跳过 `ai-service/src/ai_service/core/security.py`，不评价其内容；未读取任何实际 `.env` 值。本报告不包含凭据事项或值。
- 验证边界：未安装依赖、启动服务、操作数据库、调用外部 API 或运行历史脚本；因此“事实”指静态代码事实，不等于运行验收通过。

## 结论摘要

1. **旧版主链是让大模型直接输出 buy/sell/hold/sell_all，而不是由量化规则引擎产生信号。** AI 服务只有提示词约束、输出校验和警告；后端另有硬编码交易约束，演示脚本另有简单阈值逻辑，二者都不是通用策略规则引擎。
2. **AI 决策不会自动进入订单执行。** 后端请求决策后只写 `decision_logs`；订单由独立的 `POST /api/trades` 创建。且 backend 与 ai-service 之间存在行情字段、响应字段及批量请求结构错位，不能把该链描述为已联通。
3. **账户、订单、成交、持仓有数据库模型和执行代码，收益只有部分实现。** 执行不是订单簿撮合；限价/止损单直接按订单价成交，待执行订单没有调度调用。随机降级行情可进入成交价，执行写回字段又与 Prisma 模型不一致。
4. **没有回测、历史重演、模拟时钟、倍速或回合制。** 账户 paused 只是状态门槛。可局部复用的是采集器、历史表结构和持仓计算；回放事件时钟、确定性规则执行、调度与可复现快照均需新建。
5. **行情代码同时包含真实源、陈旧日线、历史收盘价备份和随机模拟数据，来源标记与时间语义不可靠。** 默认 v1 历史查询还有缺失方法调用；数据库不可用时会返回无模拟标记的随机历史。
6. **历史文档中的“后端执行”“完整数据链”“生产就绪”不能作为现状证明。** 前端 AI 与下单服务仍以 mock 为主，所谓交易集成测试也 mock 掉执行服务和仓储。

---

## 1. 模型直接决策，还是已有量化规则引擎？

### 1.1 事实：模型直接产生交易动作

动作枚举直接包含 `buy / sell / hold / sell_all`：[schemas.py:11-16](../../ai-service/src/ai_service/models/schemas.py#L11-L16)。系统提示词要求模型输出交易动作、股票代码、可选数量、目标价和止损价：[base_prompts.py:113-153](../../ai-service/src/ai_service/prompts/base_prompts.py#L113-L153)。

实际生成链为：

`DecisionService.generate_decision()` → 适配器工厂 → 构造提示词 → `adapter.generate()` → 从模型文本提取 JSON → 构造 `DecisionResult`。

对应实现见 [decision_service.py:41-122](../../ai-service/src/ai_service/services/decision_service.py#L41-L122)。解析器直接读取模型给出的 `action`，再校验枚举、股票范围、置信度、数量及价格格式：[decision_service.py:188-306](../../ai-service/src/ai_service/services/decision_service.py#L188-L306)。

服务间入口 `POST /api/v1/decision/service-generate` 将简化请求转换成 `DecisionRequest`，随后调用同一生成链：[decision.py:113-218](../../ai-service/src/ai_service/api/endpoints/decision.py#L113-L218)。

### 1.2 事实：没有通用量化规则引擎

对 Python、JavaScript、TypeScript 源码检索 `RuleEngine / rule_engine / StrategyEngine / strategy_engine / quantitative / 规则引擎 / 量化规则` 无实现命中。AI 服务中所谓“约束”只有两类：

- 写给模型看的提示词文本，例如最大持仓、最小交易金额：[base_prompts.py:155-173](../../ai-service/src/ai_service/prompts/base_prompts.py#L155-L173)。
- 生成前的警告检查；函数只返回 warnings，不阻断决策：[decision_service.py:325-360](../../ai-service/src/ai_service/services/decision_service.py#L325-L360)，入口仍继续生成：[decision.py:193-205](../../ai-service/src/ai_service/api/endpoints/decision.py#L193-L205)。

后端的 `tradingRules` 是执行约束集合，包含交易时段、T+1、价格限制和费率：[VirtualTradingService.js:7-25](../../backend/src/services/VirtualTradingService.js#L7-L25)。它没有规则版本、条件表达式、指标计算、策略评估或模型修改规则的接口；`getTradingRules/updateTradingRules` 除自身定义外没有调用方。因此不能把它等同于“量化策略引擎”。

演示脚本的 `AIDecisionEngine` 明确写着“模拟大模型 API”，按涨跌幅和成交量阈值直接产生买卖动作：[demo_stock_race.py:108-219](../../scripts/demo_stock_race.py#L108-L219)。这是独立的演示规则片段，不是 ai-service 的规则引擎。

### 1.3 事实：模型适配能力并不完整

适配器工厂支持 OpenAI、Claude、DeepSeek、Qwen、Wenxin 的分派：[base.py:168-210](../../ai-service/src/ai_service/adapters/base.py#L168-L210)；但 Qwen 和 Wenxin 的 `generate()` 都直接抛出“未实现”异常：[qwen_adapter.py:37-46](../../ai-service/src/ai_service/adapters/qwen_adapter.py#L37-L46)、[wenxin_adapter.py:33-42](../../ai-service/src/ai_service/adapters/wenxin_adapter.py#L33-L42)。服务间入口还固定使用单一 provider/model，而不是按账户模型选择：[decision.py:183-191](../../ai-service/src/ai_service/api/endpoints/decision.py#L183-L191)。

### 1.4 推断

- 适配器抽象、提示词构造和结构化输出解析可作为“模型辅助形成规则”的交互基础，但现有 `DecisionResult` 是交易动作模型，不是可版本化、可确定执行的规则定义。
- 后续若采用“模型不直接下单”，不能把现有 buy/sell 输出简单换一个名称；需要新增独立的规则表示与确定性执行层。这是基于当前代码边界的复用建议，不是产品决策。

---

## 2. 虚拟账户、订单、成交、持仓、收益在哪里，AI 如何进入交易链？

### 2.1 事实：五类能力的落点

| 能力 | 静态实现与边界 |
|---|---|
| 虚拟账户 | Prisma `AIAccount` 保存初始/当前余额、总资产和状态：[schema.prisma:32-59](../../backend/prisma/schema.prisma#L32-L59)。余额更新和总资产计算在 [AIAccountRepository.js:50-121](../../backend/src/models/AIAccountRepository.js#L50-L121)。 |
| 订单 | `Trade` 保存类型、数量、价格、金额、费用和状态：[schema.prisma:109-136](../../backend/prisma/schema.prisma#L109-L136)。`POST /api/trades` 进入创建控制器：[trades.js:162](../../backend/src/routes/trades.js#L162)、[TradeController.js:178-188](../../backend/src/controllers/TradeController.js#L178-L188)。 |
| 成交/执行 | `VirtualTradingService.executeTradeOrder()` 校验后调用买入或卖出并更新状态：[VirtualTradingService.js:188-265](../../backend/src/services/VirtualTradingService.js#L188-L265)。没有订单簿或对手盘撮合；限价和止损单直接使用订单价：[VirtualTradingService.js:366-392](../../backend/src/services/VirtualTradingService.js#L366-L392)。 |
| 持仓 | `Portfolio` 保存数量、均价、市值和盈亏：[schema.prisma:86-107](../../backend/prisma/schema.prisma#L86-L107)。买入加权均价、卖减仓/清仓在 [PortfolioRepository.js:50-115](../../backend/src/models/PortfolioRepository.js#L50-L115)。 |
| 收益 | 账户总收益率有基础计算，但胜率把所有卖出视为盈利：[AIAccountRepository.js:129-170](../../backend/src/models/AIAccountRepository.js#L129-L170)。交易绩效同样把卖出笔数当盈利笔数、亏损数设为零：[TradeRepository.js:182-236](../../backend/src/models/TradeRepository.js#L182-L236)。持仓历史直接返回空数组：[PortfolioRepository.js:321-330](../../backend/src/models/PortfolioRepository.js#L321-L330)。 |

因此，不能把“收益分析”视为完整实现；当前只有余额、持仓估值和简化统计，缺少可靠的交易配对盈亏与历史净值序列。

### 2.2 事实：AI 结果只到决策日志，不自动下单

后端入口为 `POST /api/ai-accounts/:accountId/decisions/request`：[aiAccounts.js:475](../../backend/src/routes/aiAccounts.js#L475)。调用链为：

`AIController.requestAIDecision()` → `callAIService()` → `AIService.requestDecision()` → ai-service `/api/v1/decision/service-generate` → 写 `decision_logs` → 返回 recommendation。

证据见 [AIController.js:648-770](../../backend/src/controllers/AIController.js#L648-L770)、[AIController.js:1077-1126](../../backend/src/controllers/AIController.js#L1077-L1126)、[AIService.js:28-58](../../backend/src/services/AIService.js#L28-L58)。`AIController` 没有订单仓储或虚拟交易执行调用。`DecisionLog.tradeId` 虽可关联订单，但此入口没有赋值：[AIController.js:725-738](../../backend/src/controllers/AIController.js#L725-L738)。

订单链是另一条入口：控制器创建 `Trade` 后，只有市价单立即调用执行；限价/止损单保持 pending：[TradeController.js:323-360](../../backend/src/controllers/TradeController.js#L323-L360)。`executePendingOrders()` 虽存在，但在 `backend/src` 没有调用方：[VirtualTradingService.js:494-532](../../backend/src/services/VirtualTradingService.js#L494-L532)。

**结论：旧版既没有“模型直接下单”的执行连接，也没有“模型建议经规则引擎后自动执行”的连接。现状是决策日志链和手动/独立订单链并列。**

### 2.3 事实：跨服务契约存在多处静态错位

1. backend 发送行情字段 `price`，见 [AIController.js:1083-1092](../../backend/src/controllers/AIController.js#L1083-L1092)；ai-service 却读取 `current_price`，缺省为零：[decision.py:174-181](../../ai-service/src/ai_service/api/endpoints/decision.py#L174-L181)。
2. backend 的账户组合只取调用方可选传入的 `data.portfolioData`，没有从刚查出的账户或持仓仓储组装：[AIController.js:1098-1108](../../backend/src/controllers/AIController.js#L1098-L1108)；ai-service 缺省使用固定初始余额、零持仓：[decision.py:160-171](../../ai-service/src/ai_service/api/endpoints/decision.py#L160-L171)。
3. ai-service 的响应将动作、理由、置信度、数量等嵌套在 `decision` 对象中：[schemas.py:129-170](../../ai-service/src/ai_service/models/schemas.py#L129-L170)。backend 却把整个 `response.data.decision` 当动作，同时从响应顶层读取 `reasoning/confidence/suggested_quantity/suggested_price`：[AIService.js:41-52](../../backend/src/services/AIService.js#L41-L52)。
4. 批量调用中，backend 发送 `{requests: [...]}` 并期望 `{decisions: [...]}`：[AIService.js:66-100](../../backend/src/services/AIService.js#L66-L100)；ai-service 接收裸数组并返回裸数组：[decision.py:318-408](../../ai-service/src/ai_service/api/endpoints/decision.py#L318-L408)。

这些是由双方代码直接可见的契约事实；实际错误表现未运行验证。

### 2.4 事实：mock 和演示分布在每一层

- backend 的 AI 请求失败会返回随机 buy/sell/hold、随机数量和价格：[AIService.js:53-58](../../backend/src/services/AIService.js#L53-L58)、[AIService.js:241-267](../../backend/src/services/AIService.js#L241-L267)。控制器没有把失败降级作为请求失败处理，仍按正常决策记录和返回。
- backend 的行情请求失败或健康状态不可用会返回随机价格：[DataService.js:54-118](../../backend/src/services/DataService.js#L54-L118)、[DataService.js:410-437](../../backend/src/services/DataService.js#L410-L437)。执行器只取其中的 `price`，没有拒绝 `is_fallback` 数据：[VirtualTradingService.js:366-388](../../backend/src/services/VirtualTradingService.js#L366-L388)。
- 前端 AI 账户、决策和触发分析均返回本地 mock，真实 API 代码被注释：[ai.service.ts:9-58](../../frontend/src/services/ai.service.ts#L9-L58)、[ai.service.ts:189-213](../../frontend/src/services/ai.service.ts#L189-L213)。
- 前端创建订单也返回本地 pending 对象，真实 `POST /trades` 被注释：[trading.service.ts:110-136](../../frontend/src/services/trading.service.ts#L110-L136)。
- 收益图即使成功取得组合汇总，中间日期仍按固定倍数构造：[ProfitChart.tsx:71-94](../../frontend/src/components/charts/ProfitChart.tsx#L71-L94)。
- 独立演示脚本使用随机行情、模拟 AI 和内存持仓：[demo_stock_race.py:27-106](../../scripts/demo_stock_race.py#L27-L106)、[demo_stock_race.py:225-397](../../scripts/demo_stock_race.py#L225-L397)。

### 2.5 推断：执行一致性需要优先重修

执行写回使用 `executionPrice / actualAmount / actualFee`：[VirtualTradingService.js:227-233](../../backend/src/services/VirtualTradingService.js#L227-L233)，而 Prisma `Trade` 只有 `price / amount / fee / netAmount` 等字段：[schema.prisma:109-125](../../backend/prisma/schema.prisma#L109-L125)。实际 Prisma 错误表现未运行验证；若 ORM 拒绝未知字段，余额与持仓已在状态写回前变更，而 catch 只尝试把订单置为 rejected，没有看到包裹全链的事务，可能留下部分提交。

此外，余额校验、扣款和持仓更新分散在多次仓储调用中：[VirtualTradingService.js:204-236](../../backend/src/services/VirtualTradingService.js#L204-L236)、[VirtualTradingService.js:273-304](../../backend/src/services/VirtualTradingService.js#L273-L304)。并发超支和失败回滚需要专门测试，现有静态实现不能提供一致性保证。

---

## 3. 是否已有回测、历史重演、模拟时钟、倍速、暂停或回合制？

### 3.1 事实：没有这些能力

对 backend、ai-service、data-service、frontend 和脚本中的代码/配置检索 `backtest / replay / simulation clock / virtual clock / 回测 / 历史重演 / 模拟时钟 / 倍速` 无命中；各模块盘点也未发现等价事件推进机制。

- 所有交易时间来自系统 `new Date()` 或 `datetime.now()`，没有可注入时钟。后端交易时段只比较服务器本地时分：[VirtualTradingService.js:424-439](../../backend/src/services/VirtualTradingService.js#L424-L439)。
- 账户可有 `paused/stopped` 状态，但它只是账户校验和决策请求门槛，不是全局回放暂停：[AIController.js:697-707](../../backend/src/controllers/AIController.js#L697-L707)。
- 后端只有数据健康检查和每 5 秒行情广播定时器；后者拉取并推送当前行情，不推进虚拟时间：[WebSocketService.js:507-558](../../backend/src/services/WebSocketService.js#L507-L558)。
- data-service 的启动任务只有空转的 `MarketMonitor`：[main.py:30-60](../../data-service/src/data_service/main.py#L30-L60)、[market_monitor.py:38-49](../../data-service/src/data_service/services/market_monitor.py#L38-L49)；`DataCollector.collect_stock_data()` 只 sleep 后返回空数据：[data_collector.py:35-44](../../data-service/src/data_service/services/data_collector.py#L35-L44)。
- 演示脚本的“模拟下一个交易日”只是再次生成随机价格，不是历史重演：[demo_stock_race.py:487-500](../../scripts/demo_stock_race.py#L487-L500)。

T+1 也不是回测时间机制：当前只检查近 24 小时买入并添加警告，不阻止卖出：[VirtualTradingService.js:130-146](../../backend/src/services/VirtualTradingService.js#L130-L146)。

### 3.2 推断：现有资产最多复用到哪一步

可复用的候选是“历史数据获取/落库接口 + 账户持仓基本计算 + 通知抽象”。不能复用为现成回测的部分包括：

- 没有统一的历史事件序列和按时间可见的数据视图；
- 没有模拟时钟、倍速、暂停、单步/回合调度；
- 没有确定性规则执行与模型规则版本快照；
- 没有可复现的成交、费用、持仓和净值快照；
- 当前随机降级会污染历史输入和成交价格，必须先隔离。

因此，后续工程可复用局部数据访问和领域模型，不应把现有定时器改造成“伪回测”。事件时钟和规则执行是新建能力。

---

## 4. 行情来源、频率、历史数据与存储；实时和历史是否混淆？

### 4.1 事实：来源和采集抽象

`DataSource` 抽象定义报价、历史、股票信息和批量报价接口：[base.py:27-109](../../data-service/src/data_service/collectors/base.py#L27-L109)。路由器配置列出新浪、腾讯、东方财富、AKShare、Baostock、Tushare：[router.py:97-166](../../data-service/src/data_service/collectors/router.py#L97-L166)。

历史能力在单个采集器中确实出现，而非完整回测数据服务：

- Baostock 支持日/周/月及 5/15/30/60 分钟，代码使用后复权：[baostock.py:164-215](../../data-service/src/data_service/collectors/baostock.py#L164-L215)。
- AKShare 支持分钟和日/周/月，代码使用前复权：[akshare.py:285-352](../../data-service/src/data_service/collectors/akshare.py#L285-L352)。
- 两者复权口径不同，当前没有统一元数据证明可拼接成同一价格序列。

这些只是客户端实现；数据源当前可用性、权限、字段稳定性和返回质量均未调用验证。

### 4.2 事实：频率主要是按需读取和缓存，不是可靠周期采集

- v1 报价依次读取 Redis、30 秒内的数据库值，再调用数据源；缓存不足 5 秒视为新鲜：[data_service.py:138-187](../../data-service/src/data_service/services/data_service.py#L138-L187)。
- Redis 报价 TTL 为 10 秒：[cache.py:245-272](../../data-service/src/data_service/storage/cache.py#L245-L272)。
- `COLLECTION_INTERVAL=60` 只有配置定义，未找到消费者：[config.py:53-56](../../data-service/src/data_service/core/config.py#L53-L56)。
- 后端每 5 秒推送一次订阅行情，但这不是历史采样或数据采集调度：[WebSocketService.js:510-518](../../backend/src/services/WebSocketService.js#L510-L518)。

所以“实时”没有可保证的固定频率或延时 SLA；它只是按需采集、短缓存和定时推送的组合。

### 4.3 事实：历史接口与存储结构存在，但默认链路有阻断点

v1 提供 `GET /api/v1/stocks/{symbol}/history`，允许分钟、小时、日、周、月参数：[routes.py:75-95](../../data-service/src/data_service/api/routes.py#L75-L95)。`stock_history` 建表代码以 `(symbol, timestamp, interval)` 为主键并创建 Timescale hypertable：[database.py:129-151](../../data-service/src/data_service/storage/database.py#L129-L151)；`stock_quotes` 另表保存报价：[database.py:99-127](../../data-service/src/data_service/storage/database.py#L99-L127)。

但 v1 服务在数据库数据不足时调用 `self.data_router.get_stock_history()`：[data_service.py:275-310](../../data-service/src/data_service/services/data_service.py#L275-L310)，而 `DataSourceRouter` 没有该方法；路由器只实现报价和批量报价等入口。该异常被宽捕获并返回空列表。

增强版绕开路由器、逐源调用历史接口，但默认先调用 Redis 的 `get_cached_history`，随后还调用 `cache_history`：[enhanced_data_service.py:299-362](../../data-service/src/data_service/services/enhanced_data_service.py#L299-L362)；这两个方法在所用 `RedisCache` 中不存在。默认入口仍是 v1，而非 enhanced：[run.py:11-22](../../data-service/run.py#L11-L22)，Compose 也指向 `data_service.main:app`（`docker-compose.yml:166`）。

因此，“采集器有历史方法”不等于“历史 API 已可用”。

### 4.4 事实：实时、历史与模拟数据存在混淆

1. Baostock 的 quote 明确只是最近交易日日线，却把 `timestamp` 写成当前采集时间：[baostock.py:69-80](../../data-service/src/data_service/collectors/baostock.py#L69-L80)、[baostock.py:137-153](../../data-service/src/data_service/collectors/baostock.py#L137-L153)。
2. 新浪响应虽保留源 `date/time`，主时间戳同样写 `datetime.now()`：[sina.py:61-96](../../data-service/src/data_service/collectors/sina.py#L61-L96)。这表示采集时刻，不应无说明地当作行情发生时刻。
3. 全源失败时可用最新历史收盘价生成“当前报价”，时间戳也为当前时刻：[data_quality.py:762-800](../../data-service/src/data_service/utils/data_quality.py#L762-L800)。
4. Timescale 未连接或查询异常时，存储层直接返回随机报价/历史：[database.py:255-268](../../data-service/src/data_service/storage/database.py#L255-L268)、[database.py:305-360](../../data-service/src/data_service/storage/database.py#L305-L360)。生成器使用 `random` 和当前/请求时间：[database.py:613-712](../../data-service/src/data_service/storage/database.py#L613-L712)，`StockQuote/StockData` 模型没有模拟来源字段：[stock.py:55-97](../../data-service/src/data_service/models/stock.py#L55-L97)。
5. backend 对成功 HTTP 响应硬编码 `is_fallback: false`，无法保留数据服务内部的模拟语义：[DataService.js:71-98](../../backend/src/services/DataService.js#L71-L98)。

**结论：实时与历史不仅在命名上混淆，随机模拟数据还可能无来源标记地进入正常响应和交易定价。**

### 4.5 事实与推断：时间体系不足

- 事实：行情链普遍使用 naive `datetime.now()`，数据表却使用 `TIMESTAMPTZ`；市场状态只按本地时间和周末判断，且 v1 不处理午休：[data_service.py:383-410](../../data-service/src/data_service/services/data_service.py#L383-L410)。
- 推断：容器、数据库会话和 A 股本地时区不一致时，时间可能偏移；aware/naive 混用也可能导致比较异常。未启动环境验证实际时区和异常表现。
- 推断：历史回放前必须统一时区、行情事件时间与采集时间，并引入真实交易日历；仅复用当前“09:30—15:00 + 排除周末”不足以保证可复现。

---

## 5. 哪些模块值得复用、需重修或不应沿用？

以下为基于上述证据的工程建议，均为推断，不代表实施授权或产品拍板。

### 5.1 可候选复用，但仍需测试

- **模型适配器工厂与提示词/输出解析框架**：保留其隔离供应商和处理结构化输出的思路；用于规则生成时需重新定义输出 schema，而非沿用买卖动作 schema。
- **采集器统一抽象与单源历史实现**：`DataSource`、Baostock、AKShare 可作为历史数据适配层候选；先验证外部可用性、复权口径、字段和限流。
- **TimescaleDB 表结构思路**：`stock_history` 的 symbol/time/interval 维度可作为历史仓库起点；需补充数据源、复权、事件时间、采集时间和质量标记。
- **Prisma 账户/订单/持仓基本模型与加权均价算法**：可作为领域模型参考，不应视为已具备事务一致性。
- **WebSocket 通知抽象**：可复用为结果通知，不应承担回放时钟或规则调度。

### 5.2 需重修后才有价值

- **backend ↔ ai-service 契约**：统一行情字段、嵌套响应、批量 body/response，并从服务端账户与持仓构造输入；增加契约测试。
- **虚拟交易执行**：统一 Prisma 写回字段，使用事务与并发控制，明确订单状态机、限价/止损生命周期和费用口径，建立真实逐笔盈亏与净值历史。
- **历史查询链**：修复 router 缺失方法和 Redis 缺失方法，明确默认入口；增加真实存储与源适配的集成测试。
- **时间与日历**：统一 aware datetime、A 股时区、交易日历、午休和事件时间语义。
- **收益与展示**：用真实成交配对和账户快照替代“卖出即盈利”和前端固定曲线。

### 5.3 不应沿用到新主链

- AI 或行情失败后以随机结果继续记录“成功决策”或成交的降级策略。
- 存储层静默生成无来源标记的随机报价/历史。
- 把最近日线、历史收盘价或随机数盖上当前时间后当作实时行情。
- 把硬编码执行约束或演示阈值逻辑宣称为量化规则引擎。
- 把当前空转的 collector/monitor、无调用方的 pending 执行方法当作调度基础。
- 用 mock 仓储/执行服务的测试证明端到端链路已经联通。

---

## 6. 旧文档与代码冲突，以及仍未验证项

### 6.1 关键冲突（事实）

1. **文档称“AI 服务分析 → 交易信号 → 后端执行”**：[CODE_MAP.md:264-268](../../docs/architecture/CODE_MAP.md#L264-L268)。代码实际只写决策日志，订单需另行创建，且跨服务契约错位。
2. **数据流文档画出“风险评估 → 决策执行 → 交易服务”**：[DATA_FLOW_ARCHITECTURE.md:250-272](../../docs/architecture/DATA_FLOW_ARCHITECTURE.md#L250-L272)。代码没有该自动执行链，AI 侧风险检查也只是 warnings。
3. **需求把回测列为第三期高级功能**：[REQUIREMENTS.md:158-163](../../docs/analysis/REQUIREMENTS.md#L158-L163)，与代码无回测实现一致；因此不能用其他“完成”描述反向证明已有回测。
4. **代码地图声称完整实现 TimescaleDB、实时推送和完整测试**：[CODE_MAP.md:349-375](../../docs/architecture/CODE_MAP.md#L349-L375)。代码虽有建表与缓存结构，但默认历史链有缺失方法，监控/采集有空壳，测试大量 mock；这些完成描述没有当前运行证据。
5. **前端界面看似具备 AI 决策、下单与收益曲线**，但其服务层真实调用被注释，收益中间点也是构造数据；不能作为后端能力验收。
6. 当前根 README 已明确历史“完成/生产就绪”不代表现状：[README.md:3-18](../../README.md#L3-L18)。本报告与该信任原则一致。

### 6.2 测试能证明什么

AI 单元测试通过 patch 适配器验证了解析主流程：[test_decision_service.py:26-68](../../ai-service/tests/unit/test_decision_service.py#L26-L68)，不证明真实模型或跨服务接口可用。

名为交易流程集成测试的文件 mock 了全部仓储，并进一步 mock 整个 `VirtualTradingService`：[trade-flow.test.js:8-44](../../backend/test/integration/trade-flow.test.js#L8-L44)。它不能覆盖真实数据库、执行一致性、实际成交价或 AI→订单连接。

### 6.3 未验证清单

- 未运行任何测试，未做 Python/JavaScript 依赖安装或静态编译；本次结论均来自只读检查。
- 未验证数据库中是否已有表、数据量、历史覆盖率、时区设置和实际一致性。
- 未验证任何真实模型、数据源、Redis、TimescaleDB 或服务间网络连通性。
- 未运行 Prisma 执行写回，未知字段的具体异常及是否已产生部分提交仍需隔离测试。
- 未验证 `paused` 之外是否存在外部运维脚本驱动交易；仓内源码未发现调度调用，不等于外部系统不存在。
- 脱敏跳过文件未审查，不形成对该文件或其安全性的结论。
- 历史文档中其他部署、性能、排名和指标声明不在本次逐项核实验收范围内。

## 给后续讨论的最小事实底座

当前最准确的描述是：**仓库同时具备“模型直接输出交易建议”和“独立虚拟交易执行”两套局部代码，但二者没有可靠的自动连接，也没有量化规则引擎或历史回放能力。** 后续讨论若以“模型辅助规则、规则确定执行”为前提，应把它视为新规则层、新时间/回放层与现有局部领域模型之间的重构，而不是在已有回测框架上增加一个模型入口。
