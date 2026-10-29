# Stock-Race V3 Demo 完整契约

## 状态

**御主已于 2026-10-28 按推荐口径终审通过；SR-006 S0 与 SR-007 S1 均已完成并合并。SR-008「V3 S2 股票内核与 CLI」已按冻结的 Demo 执行与报告假设开放，后续切片仍按依赖与质量闸逐段推进。**

本文件整合已确认决策、已完成研究与 S0/S1 冻结值，是当前唯一实施正典。它不构成业务实现、运行验收、真实模型能力、数据许可或外部部署证明。S0 仅允许在规划侧分配的独立 worktree 中按第 8.1 节安装最小依赖、编写契约骨架与测试；真实模型调用、外部真实数据接入、公开数据打包、部署和其他切片仍需后续相应授权。

若本文件与已确认决策冲突，先上浮核对，不选择方便实现的解释；后续变更必须更新本文件并复审，不另建平行正典。

## 0. 正典引用与已拍板边界

### 0.1 引用住所

| 文件 | 本契约继承的内容 |
|---|---|
| [V3 Demo 命名与分支代际](../decisions/2026-10-27-v3-demo-naming.md) | V1/V2/V3 代际、main 唯一施工正典、develop 只作历史资产线 |
| [V3 技术边界（原文件名保留 v1）](../decisions/2026-10-27-v1-demo-boundary.md) | 单资产、受控声明式语言、模型不直接下单、深色三场景 |
| [V3 技术底座与 P0 资产范围](../decisions/2026-10-27-v3-architecture-foundation.md) | TypeScript 纯内核、本地 Web＋CLI、目录依赖、快照与内容寻址、P0 范围 |
| [V3 视觉展示叙事](../decisions/2026-10-27-v3-demo-visual-narrative.md) | 三幕叙事、四分钟展示、版本对比、视觉与内核并行 |
| [历史数据源证据](../research/2026-10-27-v3-legacy-data-source-evidence.md) | 历史声称/脚本/真实 JSON 的证据分层、旧缺陷和最小验证地图 |
| [真实数据源最小探针](../research/2026-10-27-v3-data-source-probe.md) | 四资产局部真实结果、四层验证、kill unknown、数据许可限制 |

本文件对既有 decisions/research 只引用、不复制其完整调研过程或原始数据集。第 4.2 节另含本轮新增的官方静态补证，按“官方 URL＋访问日期＋字段摘录＋本地探针对账”单列证据索引，不冒称既有研究报告内容。

### 0.2 不重新翻案的事项

1. 当前产品是 **Stock-Race V3 Demo**，不另称 `v3.0.0`；main 管未来，develop 管参考，不整支合并。
2. 只用于模拟交易和策略研究，不接实盘；每个 Run 只有一个资产，不做同场组合、跨资产再平衡或组合净值。
3. TypeScript 严格模式、唯一确定性纯模拟内核、本地单用户 Web、CLI 第二验收宿主。
4. 路径固定为“自然语言意图 → 声明式 AST → schema/语义校验 → 权威回读 → 用户确认 → 确定性执行”。模型不生成可执行任意代码，不直接产生订单。
5. 普通股票、T+1 股票 ETF、普通场外开放式基金和指数按各自语义处理；基金 P0 不降级，指数不可直接交易。
6. 华丽视觉与叙事完整性是核心验收；视觉可与内核并行，但不能以静态假收益冒充真实运行。
7. Demo 真实用户主流程使用真实 Kimi K3.1 Pro 生成和调整策略；deterministic fake 只用于自动化测试，真实用户流程失败不得切换 fake。
8. 默认展示样本不是能力上限：支持更多独立单资产样本、用户自选资产与历史区间，以及单资产全历史或连续多年；全市场全量历史不是首版验收前提，每个快照仍须分别验证质量与许可。

---

## 1. 产品目标、非目标与展示验收

### 1.1 产品目标

V3 Demo 要证明一条完整链路：用户的一句投资意图可以变成**可检查、可解释、可复现的规则**，规则在冻结历史数据上自动形成完整结果，用户能同步看见价格、指标、信号、订单、净值和回撤，并能比较确认过的规则版本。

核心验收不是“模型能聊天”或“页面有曲线”，而是：

- 模型能力边界清楚，所有可执行语义均来自确认后的 AST；
- 运行具有真实数据出处、确定事件顺序、守恒账本和可复现摘要；
- 三场景共享同一策略 revision、RunSpec 和 RunEvent 时间轴；
- 四资产不被强行统一成股票成交模型，未知语义显式阻断。

### 1.2 非目标

- 实盘下单、券商接入、自动实时交易、荐股或收益承诺。
- 同场多资产组合、组合资金分配、跨资产再平衡。
- 任意 Python/JavaScript 策略、模型自主工具调用或模型逐日决策。
- 分钟级撮合、订单簿、复杂流动性、杠杆、做空和组合级风险模型。
- 在 P0 内默认支持 QDII、FOF、货币、封闭基金、T+0/跨境/债券/商品 ETF，或未声明的特殊股票交易规则。
- 以旧四服务、随机 mock、静态曲线或历史“生产就绪”描述替代新内核验收。
- 把全市场全量历史作为首版验收前提；该非目标不限制单资产全历史或连续多年研究。

### 1.2.1 展示默认值与能力边界

- 600519/2024、510300、000300、000001 等仅为默认展示或契约验证样本，不构成资产、代码、年份或数据长度上限。
- 用户可选择注册表和执行 profile 已支持的独立单资产与历史区间，包括单资产全历史或连续多年；每个 Run 仍为单资产，版本 compare 不构成组合交易。
- **全历史仅指“所选 DataSnapshot 内经核验的全部可用历史”**；若宣称“自上市/成立起完整”，必须另有覆盖起点、连续性和完整性证明，不得把未获得或未经核验的数据静默截断后称为全历史。
- 验收必须包含**至少一个默认样本之外的独立单资产样本，以及至少一个用户自选的多年区间**，不能只证明固定 Demo 数据可运行；四资产原有身份、数据质量、公司行动、可见性和许可门禁不因此豁免。
- 全市场全量历史不作为首版放行前提；扩大资产或区间时，逐个 DataSnapshot 验证数据质量、执行语义和许可，未验证者显式拒绝。

### 1.3 四分钟完整展示剧本

以下时长和逐幕布局为候选，叙事顺序与联动要求已确定。

| 时间 | 场景与操作 | 必须可见的证据 |
|---|---|---|
| 00:00–00:45 | 在策略生成舱输入“MACD 三日内金叉，KDJ 过滤”的意图，由真实 Kimi K3.1 Pro 生成 MACD+KDJ 组合 AST | 自然语言、指标参数、逻辑树、注册表版本、真实模型来源；没有 buy/sell 直接由模型输出 |
| 00:45–01:10 | 展示一次校验反馈、权威语义回读，用户确认并锁定策略 v1 | JSON Pointer 错误、修复后的 AST、确定性回读、revision 与 strategy digest；确认前不可运行 |
| 01:10–02:20 | 一键运行，完整结果算定后进入历史推演剧场；播放、暂停、加速、拖动并跳到结果 | 共享时间轴上的价格、指标、信号原因、意图/成交/拒单、净值和回撤；没有逐日模型请求 |
| 02:20–03:10 | 打开结果报告，查看首屏四指标、订单、数据假设和买入持有对照 | 累计收益、最大回撤、交易次数、相对买入持有；Run/Report hash 与空态原因 |
| 03:10–03:40 | 通过真实 Kimi K3.1 Pro 调整参数形成 v2，重新回读确认，在同一资产/快照/区间运行并比较 v1/v2 | 两个独立 digest；同初始资金、同费用/滑点/可见性、同执行及引擎/注册表/canonicalization 版本；版本差异与对齐结果 |
| 03:40–04:00 | 收束到“模型不直接下单，意图成为可审计规则，确定性内核负责执行” | 策略 revision、DataSnapshot、RunEvent 和 Report 的可复现证据链 |

### 1.4 三场景交互与数据需求

#### A. 策略生成舱

**候选布局：**左栏自然语言与修改历史，中栏结构化规则/参数/逻辑树，右栏权威回读、校验和确认。具体栏宽、动效、配色细节待视觉终审。

必须提供：

- `CapabilityManifest`：可用指标、函数、资产 observation kind、参数范围和注册表版本；
- `StrategyDraft`、`ValidationIssue[]`、canonical AST、权威 `Readback`；
- `ModelProvenance`：真实用户流程固定记录真实 Kimi K3.1 Pro 的模型版本、请求/修复次数；deterministic fake 只允许自动化测试并明确标识，真实失败不得切 fake 或伪装成功；
- `ConfirmedRevision{strategyId,revision,digest}` 与运行所需 RunSpec 假设；
- `empty/drafting/invalid/valid/confirming/confirmed/model-error/data-error` 状态。

用户修改可执行语义后，原确认失效，生成新 revision 并重新确认。模型给出的辅助解释不能替代从 canonical AST 生成的权威回读。

#### B. 历史推演剧场

**候选布局：**共享时间轴为主视图，价格/指标在上，信号与订单在中，净值/回撤在下；右侧或抽屉展示当日规则解释和事件证据。

必须提供：

- 已完成的 `RunSummary`、有序 `RunEvent[]`、指标序列和 `Report`；
- 每个事件的 `seq/tradingDate/phase/type/reasonCodes/inputRefs`；
- 播放 cursor、速度、暂停、拖动、跳结果和关键事件定位；
- 数据来源、复权、单位、缺失/停牌、stale 估值和阻断标记。

**完整结果先算定，剧场只做只读投影。** cursor 变化不得重新运行策略、调用模型、改变账本或改变最终 hash。

#### C. 结果与版本对比报告

**首屏四指标：**累计收益、最大回撤、交易次数、相对买入持有超额；胜率及其成本配对口径放入详细层。首屏四指标与信息层级已终审，具体动效与最终审美仍须御主视觉走查；小样本胜率不得被包装成统计结论。

必须提供：

- 日频收益/回撤序列、现金/持仓、订单、成交、拒单及费用；
- 策略 revision、RunSpec、DataSnapshot、费用/滑点/执行 profile、事件与报告 digest；
- 同资产、同快照、同区间、同初始资金、同执行假设，且 `engineVersion/registryVersion/canonicalizationVersion` 一致的版本 compare；
- 无交易、数据不足、指标不适用时返回 `null + reason`，不得填 0 或编造曲线。

### 1.5 S4 产品流程与视觉设计前置闸（御主批准）

为避免“内核正确但展示失败”，S4 不能只凭三场景名称和技术契约直接开工。以下三件套是前端实施的必要前置产物，不是可选文档装饰：

1. **一页 Feature Map＋用户流程**：覆盖输入意图、生成、校验、权威回读、确认、运行、回放、调整 v2 与版本比较；逐项写清用户动作、系统反馈和验收结果。可用轻量用例图表达参与者和系统边界，但不为繁重 UML 增加维护负担。
2. **三场景线框与状态矩阵**：标明每个场景的区域、按钮、图表、信息层级和跳转；覆盖 empty/drafting/invalid/valid/confirming/confirmed/running/completed/model-error/data-error，以及无交易、数据不足、全部拒单等状态，不能只设计成功路径。
3. **实际视觉稿或浏览器原型**：让维护者在 S4 施工前看到目标展示尺寸下的配色、字体、信息密度、图表、动效与三幕衔接。原型可以使用契约 golden，但不得以静态假收益冒充真实运行。

硬性顺序为：

> S2 形成真实 golden 事件流 → 完成三件套 → 御主设计终审 → S4 实施 → 自动化交互验收 → 零上下文候选评审 → 御主最终视觉走查。

三件套形成后必须进入 feature 正典并保留可复核版本，不得只存在会话或聊天记录中。未完成三件套和御主设计终审，不得开放 S4 业务实施；S0/S1/S2 不因本闸返工，S3 可在其自身授权边界内并行。

---

## 2. 技术底座、目录与依赖

### 2.1 目标目录

```text
v3/
  core/
    src/
      strategy/       # AST、schema、canonical/digest、注册表、校验、权威回读
      market/         # 资产、Bar/NAV、日历、公司行动、DataSnapshot 类型
      engine/         # warmup、时间线、执行、守恒、RunEvent 账本
      report/         # 指标、Report、compare
  application/
    src/
      ports/          # Model、MarketData、SnapshotStore、RunStore 等 ports
      draft-strategy/
      validate-strategy/
      confirm-strategy/
      run-backtest/
      compare-runs/
      project-replay/
  adapters/
    model/
      kimi/
      deterministic/
    market/
      fixture/
      snapshot-file/
      akshare-import/
      baostock-import/
    persistence/
      file/
  hosts/
    local/            # Node 20+ Express API/BFF 与 composition root
    web/              # React/Vite 三场景及只读回放投影
    cli/              # 第二验收宿主，复用 application 用例
  tests/
    contract/
    fixtures/
    golden/
    integration/
```

上述具体文件名为候选；`v3/`、四层和宿主边界已确定。实现任务不得顺手修改旧 `frontend/backend/ai-service/data-service` 来冒充该结构。

### 2.2 依赖方向

- `hosts → application → core`；`hosts → adapters → application/core`。
- core 不依赖外层、I/O、网络、数据库、系统时钟、随机数或环境变量。
- application 只定义用例和 ports，不选择 Kimi、文件系统或具体数据源。
- adapters 实现 ports，彼此不互调；旧 Python 源只能作为离线导入器，不成为内核服务依赖。
- Web 不保存模型密钥，不复制执行规则；CLI 与 Web 使用同一 application 用例，不各写一套回测。

### 2.3 Local Web composition root

`hosts/local` 是首版唯一**对外运行装配点**：构造注册表、真实 Kimi adapter、快照库、RunStore 和用例，提供本地 API 并为 Web 提供构建产物；deterministic fake 只能由测试装配注入，不得进入该对外主流程。默认仅绑定 loopback，不向公网暴露；真实模型凭据只通过本地 secret provider 注入，不进入 AST、快照、日志或浏览器。

`tests/contract/chromium` 仅作为跨运行时一致性测试装配，复用同一 core 和固定夹具，不是产品宿主、不是 Web 业务执行路径，也不装配 Kimi、网络或密钥。生产 Web 仍调用 Local API；CLI 与测试专用 Chromium Worker 的比较不改变首版 Local 单宿主边界。

首版不预设数据库。文件写入必须原子化，读取时校验 manifest 与内容 digest；不完整写入不得被当作成功运行。

### 2.4 文件快照与内容寻址运行记录

候选本地布局：

```text
v3-data/
  snapshots/<snapshotDigest>/
    manifest.json
    observations.jsonl
    events.jsonl
  strategies/<strategyDigest>/
    strategy.json
  runs/<runDigest>/
    run-spec.json
    events.jsonl
    report.json
    manifest.json
```

- 数据、策略和运行分别按 canonical 内容寻址；`createdAt` 等展示元数据不进入可复现 digest。
- `runDigest = SHA256(canonical(RunSpec))`；同一 digest 重复请求返回已有完整结果，不制造不同结果。
- 原始数据能否写入仓库或公开目录受许可约束；内容寻址不等于获得数据分发权。

---

## 3. 策略、运行、数据与结果契约

### 3.1 版本与 digest 总原则

- `schemaVersion`、DSL AST schema、指标 `registryVersion`、执行 `engineVersion`、`canonicalizationVersion` 各自独立，不与产品代际 V3 混用。
- canonical JSON 使用 UTF-8、对象键排序、数组保序、无多余空白，禁止 NaN/Infinity；金额、份额、费率和比例使用十进制字符串及显式 scale/rounding。
- JSON number 的原始 token 只接受 `-?(0|[1-9][0-9]*)` 且数值为安全整数；在 JS Number 转换前拒绝小数点、指数、多余前导零和超范围整数，canonical `-0` 归为 `0`，不得靠解析后的 `Number.isSafeInteger` 补救。
- `strategyDigest` 覆盖全部可执行 AST 语义，不含模型辅助散文、墙钟或随机 ID；`strategyId/revision` 由 application 分配。
- `snapshotDigest` 覆盖身份、观测、日历、公司行动、来源与精度元数据；`runDigest` 覆盖完整 RunSpec。
- 所有 digest 使用 SHA-256，并记录 canonicalization 版本；验证时同时检查结构版本与内容 digest。

### 3.2 StrategyDraft / StrategySpec

模型只能写 `StrategyDraft` 的声明式字段。`strategyId/revision/digest`、资产、快照、初始资金、费用和执行 profile 均由 application/用户侧控制。

候选 AST 节点：

```text
SeriesExpr = const | ref | lag | arithmetic | registeredSeriesFn
BoolExpr   = compare | crossAbove | crossBelow | all | any | not | within
```

- `lag` 必须为非负整数；未来引用、未声明字段和不可证明因果的函数直接拒绝。
- `const` 连续量只接受十进制字符串，不接受 JSON number；JSON number 仅用于 schema 声明的安全整数参数，如指标周期、`lag` 和 `within.window`。
- `within.window` 以有效观测计数，不是自然日；NAV、股票和指数的 observation kind 不得混淆。
- `exits` 为有序规则，冲突按显式优先级处理；P0 为 long-only、单资产、禁止加仓/反转，仓位用 `cashFraction/positionFraction` 十进制字符串。
- 内建只读 context refs 由能力清单声明，P0 为 `position.state/quantity/entryPrice/barsHeld` 与 `account.availableCash`；`position.state` 是数值序列，`0=flat`、`1=long`，必须与当根 quantity 一致。当根求值使用当根实际成交/结算后的 quantity 与 availableCash，不得滞后一日；`position.barsHeld` 在成交后的当根有效观测计为 0，之后每增加一根有效观测加 1，未声明字段直接拒绝。
- 指标和函数只能来自注册表，引擎不得出现 `if strategyIsMacdKdj` 一类策略分支。

注册表每项至少包含：

```text
key@version、paramSchema、requiredInputs、outputs/types、observationKinds、
warmup 推导规则、公式与初始种子、精度/舍入、causal=true、implementationDigest
```

MACD 的 DIF/DEA/柱值口径、KDJ 的 RSV 和平滑种子必须固定；新增指标不修改已有策略语义。

#### MACD+KDJ 示例（数据，不是硬编码策略）

```json
{
  "schemaVersion": "1.0.0",
  "name": "MACD 三日内金叉，KDJ 过滤",
  "indicators": {
    "m": {"use": "macd@1", "params": {"fast": 12, "slow": 26, "signal": 9}},
    "k": {"use": "kdj@1", "params": {"period": 9, "kSmooth": 3, "dSmooth": 3}}
  },
  "entry": {"all": [
    {"within": {"window": 3, "condition":
      {"crossAbove": [{"ref": "m.dif"}, {"ref": "m.dea"}]}}},
    {"gt": [{"ref": "k.k"}, {"ref": "k.d"}]},
    {"lt": [{"ref": "k.j"}, {"const": "90"}]}
  ]},
  "exits": [{"any": [
    {"crossBelow": [{"ref": "m.dif"}, {"ref": "m.dea"}]},
    {"gte": [{"ref": "position.barsHeld"}, {"const": "20"}]}
  ]}],
  "position": {
    "side": "long",
    "allowAdd": false,
    "entrySize": {"cashFraction": "0.50"},
    "exitSize": {"positionFraction": "1.00"}
  }
}
```

### 3.3 校验、统一错误与确认

校验顺序：输入大小/深度限制 → JSON parse → JSON Schema（禁止额外字段）→ 注册表/类型/资产/因果校验 → canonical AST → digest → 权威回读 → 用户确认。

统一错误：

```json
{
  "code": "UNKNOWN_INDICATOR",
  "severity": "error",
  "path": "/indicators/m/use",
  "message": "未注册的指标或版本",
  "expected": "registry 中的 key@version",
  "actual": "macd@99",
  "hint": "选择能力清单中的指标",
  "registryRef": null
}
```

- error 阻断确认和运行；warning 必须可见，不能伪装成“全部通过”。
- 模型修复只接收结构化错误与能力清单，最多两轮候选修复；仍失败则返回失败，不切换 fake。
- 权威回读由 canonical AST＋注册表模板确定性生成；模型解释只能作为辅助。
- `ConfirmStrategy` 必须携带 `expectedDigest`，防止确认后内容被替换；未确认或 digest 不符的 Run 必须拒绝。

### 3.4 RunSpec

```json
{
  "runSpecVersion": "1.0.0",
  "strategy": {"id": "srv_...", "revision": 1, "digest": "sha256:..."},
  "asset": {"assetId": "stock:sh.600519", "assetType": "stock", "executionProfile": "cn-stock@1"},
  "data": {"snapshotDigest": "sha256:...", "start": "2024-01-02", "end": "2024-12-31"},
  "warmup": {"extraObservations": 0},
  "account": {"initialCash": "100000.00", "currency": "CNY"},
  "execution": {
    "feeProfileVersion": "cn-stock-demo-fee@1",
    "slippageProfileVersion": "cn-stock-one-tick@1",
    "visibilityRuleVersion": "asset-default@1"
  },
  "engine": {
    "engineVersion": "1.0.0",
    "registryVersion": "1.0.0",
    "canonicalizationVersion": "1.0.0",
    "decimalProfileVersion": "decimal@1",
    "roundingProfileVersion": "rounding@1",
    "indicatorArithmeticProfileVersion": "indicator-arithmetic@1"
  }
}
```

RunSpec 不可由模型修改。`account.initialCash` 允许用户在 **1,000.00～100,000,000.00 CNY** 内自填，默认 `100000.00`，使用 Money scale=2 的十进制字符串；超出范围或格式非法必须报错，不得静默夹取。范围内资金不足以买入最小交易单位时允许形成有效 Run，但必须如实记录拒单/无交易原因，不得自动补足或改写资金。版本 compare 仍要求初始资金完全一致。`warmup` 与 `warmup.extraObservations` 在 schema 中均为 required；缺失必须产生 schema error，canonicalizer 不得补默认值。`warmup.extraObservations` 为非负安全整数，只有 application 的 RunSpec 模板可以显式写入默认 `0`，完整 warmup 对象进入 runDigest；它只能在 AST 推导的最小 warmup 上增加验证余量，不能减少最小值或改变指标种子锚点。运行确认页必须同时展示策略 digest 与数据、区间、warmup、初始资金、费用/滑点、可见性和执行假设。示例中的 600519/2024 仅为默认展示配置，不构成资产或区间限制。

### 3.5 DataSnapshot

候选字段：

```text
snapshotVersion/digest、assetIdentity{assetId,type,sourceTypeRaw,status}、
observationKind{ohlcv|nav|index}、observations[]、calendarRef、corporateActions[]、
source[{name,interface,libraryVersion}]、fixedRange、fieldSchema、
adjustment{raw|qfq|hfq|unknown}、pricePrecision、volumeUnit、
sourceEventTime/navDate、publishedAt?、ingestedAt、
visibilityCoverage、qualityIssues[]、usageRestriction
```

硬性规则：

- `navDate` 与 `publishedAt` 是不同字段；采集时间 `ingestedAt` 也不是官方发布时间。
- 原始 OHLC 与复权序列分开；多源只比较不平均，不合成无法溯源的价格。
- 快照不可变，缺失语义必须写入 `qualityIssues`；阻断项存在时不能被标成完整可执行数据。
- 真实探针可先转本地夹具，入库/公开必须另行核许可。

### 3.6 RunEvent

```text
eventVersion、runDigest、seq、tradingDate、phase、type、
reasonCodes[]、inputRefs{bar/snapshot/strategyPath/intent/fill}、payload、
previousEventHash、eventHash
```

候选事件包括：

- `SessionOpened`、`CorporateActionApplied`；
- `SignalEvaluated`、`OrderIntentCreated`、`OrderRejected`、`OrderFilled`；
- `PositionChanged`、`CashChanged`、`MarkToMarket`；
- `MetricComputed`、`RunCompleted`、`RunFailed`。

事件按 seq 全序排列；拒单、跳过、stale 估值和守恒检查也必须入账。`OrderIntentCreated` 必须保留原始意图数量、价格/资金依据与有效 inputRefs；`OrderFilled` 必须引用原 intent 并保留实际成交数量。允许成交时按可用资金/持仓重算数量，但必须记录原数量、实际数量和 `ORDER_SIZE_ADJUSTED` 等原因及引用，不得静默把 intent=100 写成 fill=300。不得用默认空 inputRefs 掩盖缺失证据；确无外部输入的系统事件也必须显式说明。事件哈希链只证明内容未被改动，不代替 golden 对正确性的验证。

### 3.7 Report / CompareResult

Report 至少包含：Run/Strategy/Snapshot 引用、区间、初始/最终权益、日频净值和回撤、收益指标、交易统计、订单/成交/拒单、费用、现金与份额、在途应收、买入持有对照、假设与警告、指标可用性、事件和报告 digest。

- 累计收益为 `finalEquity / initialCash - 1`；最大回撤为历史权益峰值到其后谷值的最大相对跌幅，峰值必须为正。
- 交易胜率按执行 profile 中版本化的成本配对规则计算，分母为已平仓批次；不得把所有卖出都计为盈利，分母为零时返回 `null + reason`。
- 其他指标不足同样返回 `null + reason`，不写 0。
- 买入持有使用同一可成交起点、原始价、费用和滑点；指数仅作指数序列比较，不生成虚假资金曲线。
- compare 只允许同资产、快照、区间、初始资金、执行 profile，且 `engineVersion/registryVersion/canonicalizationVersion` 均一致的运行；跨引擎版本对比在 P0 中拒绝，须另作迁移研究，不能包装成策略版本差异。策略 revision/digest 必须分别保留。
- 失败运行可以保留 `RunFailed` 诊断，但不得输出标为成功的完整报告。

---

## 4. 四资产矩阵与基金官方补证

### 4.1 资产契约矩阵

| 资产 | 身份与数据 | 日历/可见性 | 执行时间线与费用 | 公司行动 | 当前状态与显式拒绝 |
|---|---|---|---|---|---|
| 沪深股票 | `assetId`、主数据、raw OHLCV、preclose、tradestatus、isST、来源精度 | 真实交易所日历；T 收盘后仅使用已可见数据；点时复权信号 | T 信号/T+1 开盘；T+1 可卖；原始价＋方向滑点；独立佣金/最低额/印花税/过户等版本化 profile | 现金分红、送转、除权/登记/派息和复权因子进入账本 | **可进入执行契约草案**。ST/板块/上市初期等无明确 profile 者拒绝；缺公司行动不得称完整回测 |
| T+1 股票 ETF | ETF 身份、raw OHLCV、preclose、单位/精度；不是 NAV 替代物 | 交易所日历；当前 raw/qfq 已局部探针 | 目标仍为 T 信号/T+1 开盘，独立费用 profile；不得直接套股票印花税/单位 | 当前只有累计分红等局部信息，完整现金/份额事件不足 | **P0 目标保留，当前只进分析契约**。完整公司行动和 T+1 规则未补齐前冻结执行；其他 ETF subtype 拒绝 |
| 普通场外开放式基金 | 普通开放式身份、unit/cumulative NAV、navDate、publishedAt?、分红/拆分 | 独立 NAV 日历＋开放日＋特别披露日；可见性由真实 publishedAt 或御主批准的规则决定 | 已可见 NAV 产生信号，下一合格开放日 cutoff 前申赎，按当日未知 NAV 成交；确认和现金到账另建 profile；申赎费独立 | 分红、拆分和累计/单位口径分开；不重复扣基金层面已反映费用 | **P0 不降级，S6 按已终审 B 规则实施；SR-008 S2 已开放，后续切片未开放**。QDII、FOF、货币、封闭、ETF/LOF 等拒绝；navDate 不得冒充 publishedAt |
| 指数 | 指数身份、OHLC/点位、来源精度、price/total-return 类型 | 指数发布/交易日历；来源事件时间与采集时间分离 | 不执行、不生成订单/费用/资金曲线；仅分析和基准 | 不做股票式公司行动；收益类型必须另证 | **只可分析**。类型未标注时不得称全收益或买入持有可成交；需要交易代理时由用户另选 ETF |

**Baostock 复权注释纠正：**本次 0.9.4 包内 demo 与股票/ETF 的 raw 对账支持 `adjustflag=3` 为不复权；旧 main 把 3 注成“后复权”的注释不得沿用，历史复权声明必须按库版本和 raw 对账重审。

### 4.2 基金官方静态补证结果

本轮仅研究公开、无需登录的官方静态资料，没有调用新数据 API。访问日期均为 **2026-10-27**；[本地补证说明](../../.local/v3-data-probe-20261027T1605/fund-official-static-review.json)记录官方 URL、字段摘录和最新 NAV 对账，SHA-256 为 `701973a88cb81e962aa6b469b46310adabd5afc84977930db60af993a1a31a01`。该说明不冒充原始页面快照；live URL 后续变化不作为本次证据，独立终审需重新读取官方页面并核对当时记录。

#### A. 法定披露时限

[中国证监会《公开募集证券投资基金信息披露管理办法》](https://www.csrc.gov.cn/csrc/c106256/c1653985/content.shtml) 第十四条：

- 第（三）项要求开放式基金“**不晚于每个开放日的次日**”披露开放日份额净值和累计净值；原文写“次日”，不是“次一工作日”，且未给具体时刻。
- 第（四）项另要求“**不晚于半年度和年度最后一日的次日**”披露相应净值。

[中国政府网公开文本](https://www.gov.cn/gongbao/content/2019/content_5462516.htm) 与上述内容一致。

因此，2024-06-30 的非交易日 NAV 与“半年度最后一日”特别披露要求一致，可解释其为何需要独立 NAV observation 类型；但该条款仍不提供实际发布时间。

#### B. 基金公司页面实际字段

[华夏基金 000001 官方页面](https://www.chinaamc.com/fund/000001/jijinfeilv.shtml) 在本次静态读取中显示：

- `navDate=2026-10-26`，单位 NAV 1.019、累计 NAV 3.592，与本地 AKShare 探针的最新记录精确一致；
- 历史净值表只有净值日期、单位净值和累计净值，没有独立 `publishedAt` 或历史发布时间字段。

该对账只提升最新一条 NAV 的价值证据，不能倒推出每条历史 NAV 的发布时间，也不能把页面抓取时间当官方 publishedAt。

#### C. 历史回放可获得的发布时间

**本次公开静态补证未获得历史 `publishedAt`。** 这不等于证明所有官方渠道永远不存在，只表示当前证据不足以支持逐条历史可见性。

| 语义 | 本次结果 | 可否互相替代 |
|---|---|---|
| 法定披露时限 | 有“开放日次日”“半年/年末次日”的截止要求 | 不能当实际发布时间 |
| 页面实际 publishedAt | 华夏历史页未找到；只有 navDate | 不能由 navDate/ingestedAt 伪造 |
| 历史回放发布时间 | 未获得可逐条使用的官方时间戳 | 仍是基金执行阻断 |

### 4.3 基金可见规则终审结论

御主于 2026-10-28 选择 **B `NEXT_DAY_END_CONSERVATIVE`** 作为普通场外开放式基金的候选执行 profile：对适用第十四条第（三）项的普通开放式基金，NAV_T 只在 T 的次日 **23:59:59（Asia/Shanghai）后**才视为可见；之后首个合格开放日提交，按该开放日未知 NAV 成交。

该规则是保守产品假设，不是实际 `publishedAt`。实现必须记录 `visibilityRuleVersion`、法规依据、延迟风险和错误处理，并在运行确认页与报告中展示；若随后发现更晚的真实发布时间，以更晚者为准或使运行失败。A `ACTUAL_PUBLISHED_AT` 留作取得真实历史发布时间后的升级路径，C 未选用；实现者不得改选或静默降级。

基金 P0 范围不变，但本次终审只开放 S0，S6 仍须按切片依赖另行启动。

---

## 5. 确定性回测契约

### 5.1 冻结输入与运行边界

运行前必须冻结 confirmed strategy、DataSnapshot、RunSpec、注册表/引擎/执行/可见性版本。运行过程中：

- 不访问网络、模型、数据库、墙钟或随机数；
- 不以随机行情、随机模型结果、上一价或零值填补未知；
- 不使用运行终点锚定前复权后回头计算所有历史信号；
- 所有外部不确定性在运行前转为显式数据或阻断错误。

### 5.2 Warmup 与点时数据

- warmup 从 AST 递归推导：指标周期、滞后、交叉、within 和嵌套窗口共同决定所需观测数；用户只能通过 `warmup.extraObservations` 增加，不能减少。
- 指标序列固定锚定 DataSnapshot 的首个有效观测，不以用户请求起点重新播种；增加 extra warmup 只增加验证余量，不得改变共同区间结果。不同快照仍以各自 snapshotDigest 区分，不跨快照假称同一指标序列。
- 请求起点之前加载足量历史；`requiredPriorObservations = AST 推导最小值 + warmup.extraObservations`。不足时返回 `INSUFFICIENT_WARMUP` 及 AST 最小值、extra、required/actual 观测数，不逐分支降级或静默缩短区间；任一 AST 分支 warmup 不足都整体阻断，不靠布尔短电路绕过。
- 指标只能读取当次决策已生效且可见的数据和公司行动；信号使用点时连续序列，成交和账本使用原始价与真实权益事件。
- cross 和后续递推使用内部未按展示 scale 量化的值；展示/golden 输出量化不得反向改变后续指标。每日指标可进行预计算的前提是通过前缀不变性测试，否则逐日更新。

### 5.3 时间线与成交

股票及未来解冻后的 ETF：

1. T 盘前应用当次可见公司行动和上一决策意图；
2. T 开盘按执行 profile 成交或拒单；
3. T 收盘估值、更新指标并评估确认后的 AST；
4. 生成下一交易日意图，默认仅下一交易日有效；未成交记录取消原因。

P0 不多空反转、不日内止损成交、不默认加仓。数量按成交时可用资金/持仓、方向滑点、tick/lot、最低费用确定；当日买入不可当日卖出，现金可用与未结算分开。

基金使用独立的“可见 NAV → 下一合格开放日未知 NAV 申赎 → 确认/到账”时间线，不能套上述开盘成交模型。

### 5.4 十进制定点、单位与精度

- `Money/Price/Quantity/Rate` 为不同值类型，使用十进制定点、显式 scale 和 rounding mode，序列化为字符串。
- 手/股、份额、指数点位、元/分的转换只能在有元数据的 adapter 中进行；不得在内核猜测 100 倍关系。
- 指数等值比较与展示必须有明确 precision profile；原始值差异、显式舍入结果分别留证。
- 费用、现金、份额、公司行动和净值每一步都执行守恒检查；P0 不允许负现金、负份额或不明来源的余额调整。
- 现金至少区分 `available/reserved/unsettled/receivable`；基金在途申赎款按状态转移并始终计入总权益或相应负债，扣款后不得凭空消失，确认时也不得重复计值。

### 5.5 停牌、缺数与 stale

- 交易所日历无会话不等于停牌；有会话但无 bar 必须区分停牌与数据缺失。
- 已确认停牌不更新指标、不成交，估值可沿用最后价但必须标 stale；缺数原因未知则运行失败。
- 不用前向填充制造新观测，不把 0 当作通用有效价格。
- 基金特别披露日使用独立 observation kind，不伪装成股票交易日。

### 5.6 完整账本、报告与回放

每个事件后检查现金、份额、费用和权益守恒，保留意图、拒单、成交、公司行动、估值和指标原因。完整 RunEvent 与 Report 一次生成后，剧场和 compare 只做只读投影。

相同 RunSpec 必须产生相同 canonical event/report hash；重复运行、CLI/Local API/测试专用 Chromium、播放速度、暂停和拖动均不得改变结果。

---

## 6. Kimi 与 deterministic fake 边界

### 6.1 模型 port

`StrategyDraftPort` 只接受自然语言、能力清单、可选旧 AST 和结构化校验错误，只返回不受信任的 StrategyDraft JSON。它不能：

- 产生订单、选择实际成交、执行代码或调用交易工具；
- 修改 RunSpec、快照、费用、确认状态或注册表；
- 在回测逐日循环中被调用；
- 用自然语言解释替代权威回读。

真实 Kimi adapter 仅存在于 Local composition root，密钥不进入浏览器或证据；请求、超时、有限重试/修复、用量和错误均需脱敏记录。

### 6.2 deterministic fake（仅自动化测试）

- 只允许在单元、契约、golden 和自动化界面测试中使用，不得进入真实用户主流程或作为生产降级路径。
- 与真实 adapter 实现同一 port，以固定 scenario/canned 输出覆盖合法、坏 JSON、未知指标、未来引用、额外字段、修复序列和超时。
- 不做“理解自然语言”的关键字模拟，不在真实模型失败时自动接管；真实用户流程失败必须原样呈现并阻断。
- 所有输出仍走同一 schema/语义校验，测试界面若展示 fake 结果必须明示 `deterministic-fake` 和测试来源，不能冒充真实 Kimi。

### 6.3 真实模型状态

**Demo 真实用户主流程必须使用真实 Kimi K3.1 Pro 生成和调整策略；真实能力未探针前，最终主流程放行仍被阻断。** 最终放行必须至少完成一次真实 Kimi 成功生成 v1、一次真实 Kimi 成功调整形成 v2，并分别通过 schema/语义校验、权威回读和用户确认；fake 只能抵扣自动化测试，不能抵扣这两项真实验收。其真实 provider model id、原生 JSON Schema 能力、上下文、限额、价格和错误语义均不作能力声称。自动化开发/契约测试只使用 fake；真实模型集成与主流程验收必须单独 opt-in 并另行授权。若仅支持 JSON object，传输格式与本地严格校验必须分别陈述。

---

## 7. 契约测试与验收矩阵

### 7.1 测试分层

- **单元测试**：纯函数、指标、表达式、舍入、错误和守恒。
- **契约/golden 测试**：跨模块 schema、RunSpec/Snapshot/Event/Report、手算结果、跨宿主一致性。
- **真实集成测试**：AKShare/Baostock、真实 Kimi 等外部能力，单独 opt-in；当前探针只证明其样本范围。deterministic fake 仅服务前述自动化测试，真实用户主流程必须另用真实 Kimi 验收，fake 通过不得抵扣真实主流程门禁。
- **维护者验收**：四分钟剧本、视觉、叙事和用户可见错误，不能由自动化测试替代。

所有实施切片先写失败测试，再实现；历史“已红”不存在于本契约阶段，不能预写为已通过。

### 7.2 切片验收矩阵

| 切片/门禁 | 必须先红的重点 | golden/真实夹具 | 通过证据 |
|---|---|---|---|
| S0 schema 与 canonical | 额外字段、未知版本、十进制规范化、digest 稳定、坏路径错误 | 合法/非法 AST、canonical 向量 | 单元＋契约；类型由同一 schema 生成 |
| S1 注册表与指标 | MACD/KDJ 种子、warmup、cross 当日、负 lag、未知输出、前缀不变性 | 短参数手算 OHLC 与期望值 | 不与旧实现互证；手算 golden 通过 |
| S2 股票内核与 CLI | warmup 不足、T/T+1、当日买不可卖、停牌/缺数、费用/lot、现金份额守恒 | 手工小日历＋600519 分红/preclose 案例 | 完整事件和报告逐条对答案；重复 hash 一致 |
| S3 模型与确认 | 坏 JSON、未知指标、模型超时、未确认运行、修改后旧 digest、真实用户失败切 fake、以 fake 通过冒充真实生成/调整 | deterministic fake 全序列（仅自动化）；真实 Kimi 成功生成 v1 与调整形成 v2 的独立证据 | 自动化测试无外部调用；真实主流程两次真实成功及各自校验/回读/确认齐全，失败不降级，fake 不抵扣真实验收 |
| S4 三场景与 compare | cursor 不改 hash、无逐日模型、v2 未确认、compare 条件不齐、空态 | golden RunEvent/Report | 三场景联动、四指标、版本对比、错误与空态通过 |
| S5 ETF/指数 | ETF 执行在公司行动缺口时仍被允许、单位混用、指数被下单、原始差异被隐藏 | 510300 两源 OHLC/成交量、000300 严格差异＋显式舍入 | ETF 仅分析；指数分析-only；单位和精度显式 |
| S6 基金 | QDII 被普通 profile 接收、navDate 当 publishedAt、特别披露日套股票日历、未批准规则被默认选择 | 000001 最新官方对账、2024-06-30 NAV、无 publishedAt 负例 | 选定 visibility profile 后才测执行；阻断时明确报错 |
| S7 真实集成 | 只检查 200/非空、忽略单位/复权、旧 Key/付费调用混入默认测试 | 固定绝对区间、来源/版本/rawHash | 真实结果独立标记，不与 fake/单元结果混合 |
| S8 跨宿主、样本扩展与性能 | Node/Local API/测试专用 Chromium 结果不同、播放改变结果、墙钟/随机进入 digest、默认样本被当能力上限、全历史被静默截断、四资产门禁被扩展样本绕过 | 同一 golden 在 CLI 与测试专用 Chromium Web Worker；至少一个默认外独立单资产及一个用户自选多年区间；按 1.2.1 定义的全历史快照；生产 Web 仍走 Local API | canonical event/report 字节等价；扩展样本和区间通过且原资产门禁不豁免；性能实测留档 |

### 7.2.1 对应切片施工前必须冻结的契约细节

以下项目**必须先于对应实现和 golden 编写冻结并复审**。不得先跑实现，再用实现输出反推种子、舍入、费用或报告答案；当前未拍板的具体数值只表示后续契约工作，不允许借“待定”跳过。

| 切片 | 施工前必须形成的版本化契约 | golden 独立性要求 |
|---|---|---|
| S0 十进制、Unicode 与舍入 | `DecimalProfile`：Money/Price/Quantity/Rate 的 scale、允许范围、正负零、尾随零、溢出和字符串格式；`UnicodeProfile`：规范化形式、大小写敏感性、键排序、字符串转义和 locale 无关格式；`RoundingProfile`：每种运算的 rounding mode、应用顺序及 tick/lot/费用舍入 | canonical 向量和边界值由契约人工给出，包含 Unicode 等价/非等价、负零、精度溢出和舍入边界，不读取实现结果生成答案 |
| S1 MACD/KDJ、cross/within/warmup | EMA 初值/首个有效值与 NaN 传播；MACD DIF/DEA/柱值乘数；KDJ RSV 周期、最高最低价相等处理、K/D 初始种子、平滑和 J 公式；crossAbove/Below 的相等与缺失值规则；within 是否含当前观测、窗口计数；指标＋lag＋cross＋within 的 warmup 递推 | 短参数序列、种子、交叉日、窗口边界和预热长度均先手算，再与实现比较；不得以当前库默认行为替代契约 |
| S2 费用、结算、配对与报告 | 费率生效期、最低佣金、税费/其他费用、滑点/tick/lot、费用舍入与收取顺序；可卖批次、available/reserved/unsettled/receivable 结算规则；分红除权/派息和送转账本；成本配对方法、部分平仓及费用后已实现盈亏/胜率；买入持有的起购、费用、分红现金或再投、送转和期末估值；最大回撤的期初权益锚点与首日跳空处理 | 现金、份额、费用、公司行动、净值和回撤逐事件先手算；胜率/买入持有/最大回撤的答案不得由同一实现反推，期初权益必须作为显式锚点入账 |

这些冻结项是 S0/S1/S2 的放行前置条件，不扩大产品范围；需要御主决定的业务假设仍进入第 10 章，其余由对应契约任务明确并独立复审。

### 7.2.2 S0/S1 冻结值（御主终审通过）

本小节是施工方案与检验清单对照后的技术裁决，已随完整契约于 2026-10-28 终审通过，并作为 S0/S1 的实施与检验依据。后续如需改动，必须升级相应 profile/registry 版本并重新独立复审，不得静默改答案；S0/S1 已完成，S2 按第 7.2.3 节开放。

#### S0 `decimal@1` / `rounding@1`

- 外部值类型 `Money/Price/Quantity/Rate/Scalar` 的 scale 分别为 `2/6/6/12/12`；Money、Rate、Scalar 有符号，Price、Quantity 非负。规范化后的外部值最多 18 个整数位、38 个有效十进制位，字段 schema 可进一步收紧范围；原始输入长度另设上限，资产 tick/lot 不从通用 scale 推断。
- 连续量只接受无指数、无前导 `+`、无空白、无多余前导零的十进制字符串。不足 scale 补零；超出 scale 的额外尾数只有在全零时才接受并规范化，否则返回 `DECIMAL_SCALE_EXCEEDED`，解析时不隐式舍入。`-0` 统一为正零，NaN/Infinity、规范化后第 39 位外部有效数字或显式字段值域溢出显式失败。
- JSON number 的原始 token 只接受 `-?(0|[1-9][0-9]*)` 且数值为安全整数，在 JS Number 转换前检查；拒绝 `1.0`、`1e0`、小数、指数、多余前导零和超范围整数。canonical 输出普通十进制整数，`-0` 归为 `0`。连续 AST 常量、金额、价格、份额、费率不得走 JSON number。
- 内部 Decimal 运算使用独立 constructor、`precision=64`、`ROUND_HALF_EVEN`，禁止全局配置漂移和中间 double。每次 `+ - * /` 都在该上下文中 finalise 为最多 64 位有效数字，循环小数按此舍入递推，不存在“第 65 位一律失败”；除零、NaN/Infinity 或非有限结果报错。比较使用上述内部结果，不做展示 scale 舍入。
- 指标仅在展示/golden 输出边界按 `scale=8`、`ROUND_HALF_UP` 量化；cross 与后续递推使用内部值，禁止每根量化后再参与下一根。S2 的财务费用、tick/lot 和收取顺序另用版本化规则冻结；费用组件候选为分别 `ROUND_HALF_UP` 到 Money scale 后求和，不在 S0 冒充完整费用契约。累计收益、回撤等财务报告 Rate 输出同样归财务边界按 scale=12 HALF_UP，不落入指标内部 HALF_EVEN 规则。

#### S0 `unicode@1` / `canonicalization@1`

- JSON 解析拒绝重复键；键和字符串值统一 NFC，NFC 后发生键冲突同样拒绝。大小写敏感，不做 locale/casefold/NFKC/trim 语义改写；动态 indicator id 限定 ASCII，拒绝未配对 surrogate。
- 对象键按 UTF-16 code unit 原序排序，不使用 `localeCompare`；数组保序、无多余空白。字符串转义固定为：引号与反斜杠使用 `\"` 与 `\\`；U+0008/0009/000A/000C/000D 分别使用 `\b/\t/\n/\f/\r`；其余 U+0000–U+001F 使用 `\u00xx` 小写 hex。非 ASCII 直接输出 UTF-8，不额外转义 `/`、U+2028/U+2029 或其他非 ASCII。
- digest 为 `sha256:` 加 64 位小写 hex，输入为 canonical UTF-8 字节。schema 禁止额外字段，不做 coerce/default/removeAdditional；校验错误按 path/code/message 稳定排序，required/additionalProperty 也映射到准确 JSON Pointer。
- 类型只由同一 JSON Schema 生成，生成文件提交且禁止手改，以 `check:generated` 检查漂移。

以下已知向量由契约直接给出并已经独立标准库复算，不得由实现输出回填：

| case | canonical JSON | SHA-256 |
|---|---|---|
| 空对象 | `{}` | `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a` |
| 键排序、数组保序 | `{"a":1,"b":[2,1]}` | `e9d26fb0100c3f9ef569c38ced9811ec35059c3c999b8683fde59ed24e6e66e8` |
| NFC 的 `é中`；NFD 等价输入归一到此值 | `{"s":"é中"}` | `ac54597a2eff1d6219ad3c1e69fa5dec41232219a99badb93cf4a098f31d5ae0` |
| 输入与 canonical 均为 `{"s":"\n中"}`，其中 `\n` 是两个 ASCII 字节；canonical hex=`7b 22 73 22 3a 22 5c 6e e4 b8 ad 22 7d` | `{"s":"\n中"}` | `26b5d4c3cec8a6c2f500cbbf0905fe6d8343628630d9d7921862512dfba45364` |
| U+000B 无短转义，固定为小写 `b`；canonical hex=`7b 22 73 22 3a 22 5c 75 30 30 30 62 22 7d` | `{"s":"\u000b"}` | `d02e72cd71ab7c3e52ae1c7f8721e6fbecd25b9a1487b947931c62c3d2db3606` |
| Rate `-0.0`/`0`/零的各合法尾随零形式归一 | `{"rate":"0.000000000000"}` | `f0a328f7e442468f3f099dc04e04ad0eec184a5c1ca417d4cfa8ad04a65feb5b` |
| Rate `0.5` 补到 scale=12 | `{"rate":"0.500000000000"}` | `6748639edbf4efca01ee8c87b25223a7336541457efd57460f566c3925e899f9` |
| Rate `0.123456789` 补到 scale=12 | `{"rate":"0.123456789000"}` | `d3ae8b1d8b6551c3d9a40173673877850b57a04c182742b58e205b2bf06d98aa` |

另须覆盖大小写/全半角不合并、NFC 后键冲突、非零超 scale 尾数、精度溢出、舍入边界和安全整数边界。`0.1234567890123` 因第 13 位非零而拒绝，`0.1234567890120` 因额外尾数全零而接受；`1.0`、`1e3` 和 `9007199254740992` 作为 JSON number 均在 Number 转换前拒绝。

#### S1 `macd@1` / `kdj@1` 与表达式可用性

- 所有指标以 DataSnapshot 首个有效观测为种子锚点。首个有效值之前为 unavailable，不以 0、false 或 NaN 冒充已知值；非法/未知输入显式失败。
- MACD 参数为正整数且 `fast<slow`。EMA alpha=`2/(n+1)`，首个 EMA 为前 n 个输入的 SMA；DIF 首个有效索引为 `slow-1`，DEA 从首个有效 DIF 起取 signal 个值的 SMA 作种子，首个有效索引为 `slow+signal-2`，`HIST=2*(DIF-DEA)`。
- KDJ 窗口含当根，`RSV=100*(C-LLV_n)/(HHV_n-LLV_n)`；HHV=LLV 时 RSV=50。首个有效 RSV 处平滑前 K=D=50，当根也执行一次平滑：`K=Kprev+(RSV-Kprev)/kSmooth`、`D=Dprev+(K-Dprev)/dSmooth`、`J=3K-2D`。
- `crossAbove` 为前值 `a<=b` 且当前 `a>b`，`crossBelow` 对称；当前或前值 unavailable 时结果 unavailable。`within(N)` 含当前、按同类有效观测计数，要求完整 N 根；不足整窗为 unavailable。
- DSL BoolExpr 类型不变，运行求值内部使用 `true/false/unavailable` 三态：`not(unavailable)=unavailable`；`all` 有 false 则 false、否则有 unavailable 则 unavailable、全 true 才 true；`any` 有 true 则 true、否则有 unavailable 则 unavailable、全 false 才 false。只有 true 触发信号。confirmed Run 在 warmup 未满足时整体阻断，不得逐点用假值驱动 `not`、entry 或 exit；warmed 后遇未知缺数仍失败。
- warmup 递推：`W(ref/const)=0`，`W(lag_k)=W(x)+k`，组合/算术取子节点最大，`W(cross)=max(W(a),W(b))+1`，`W(within_N)=W(cond)+N-1`；MACD DIF 为 `slow-1`、DEA/HIST 为 `slow+signal-2`，KDJ 为 `period-1`。默认 MACD(12,26,9)+cross+within(3) 的 W=`26+9-2+1+2=36`，第 37 个有效观测才可评估。

#### S1 独立手算 golden 候选

输入 i=0..6：`C=[1,2,4,2,1,2,4]`、`H=[2,3,4,4,3,3,5]`、`L=[0,1,1,1,0,1,1]`；MACD(2,3,2)、KDJ(2,2,2)。以下均为 scale=8 HALF_UP 展示值，答案由公式直接推导并经独立分数算术复核，不来自旧实现或待测实现：

- fast：i1=`1.50000000`；i2..6=`[3.16666667,2.38888889,1.46296296,1.82098765,3.27366255]`。
- slow：i2..6=`[2.33333333,2.16666667,1.58333333,1.79166667,2.89583333]`。
- DIF：i2..6=`[0.83333333,0.22222222,-0.12037037,0.02932099,0.37782922]`。
- DEA：i3..6=`[0.52777778,0.09567901,0.05144033,0.26903292]`。
- HIST：i3..6=`[-0.61111111,-0.43209877,-0.04423868,0.21759259]`。
- DIF/DEA `crossAbove` 仅 i6=true；`within(3,crossAbove)` 在 i6=true，之前按可用性规则为 unavailable，不得产生 true。
- KDJ RSV i1..6=`[66.66666667,100.00000000,33.33333333,25.00000000,66.66666667,75.00000000]`。
- K=`[58.33333333,79.16666667,56.25000000,40.62500000,53.64583333,64.32291667]`。
- D=`[54.16666667,66.66666667,61.45833333,51.04166667,52.34375000,58.33333333]`。
- J=`[66.66666667,104.16666667,45.83333333,19.79166667,56.25000000,76.30208333]`。
- 另加首个有效窗口 H=L 的负例：RSV=K=D=J=50；后续平窗按递推向 50 平滑，不可每次硬重置。

上述 OHLC 数组是数学简写，实际 fixture 的连续 Price 值使用 scale=6 字符串。cross 序列 i0..3=unavailable、i4/i5=false、i6=true；within(3,cross) i0..5=unavailable、i6=true，`not(within)` 同期同样不得为 true。另加近阈值向量：prev `(a,b)=(1.000000001,1.000000002)`、curr `(1.000000003,1.000000002)`，两端 scale=8 显示分别相等，但内部 `crossAbove=true`；再加精确值 `0.000000015→0.00000002`、`0.000000025→0.00000003`，证明展示输出使用 HALF_UP 而非 HALF_EVEN。

同一序列逐前缀计算与完整序列的共同前缀一致；追加未来数据或增加 extra warmup 不改已有值。extra=0/1 必须产生不同 runDigest；历史足够时共同区间数值不变，只提高预热门禁。golden 改值必须走契约复审。有效先红使用可编译中性桩和行为断言，缺模块、导入、语法或类型编译失败不算有效红；保存 caseId、冻结版本、命令、commit、退出码和 red 日志。S0 在 Node/Chromium 比 canonical 字节和 digest，S1 比完整指标序列、unavailable、cross/within/warmup，并各做非提交 mutation 证明测试能抓错。

### 7.2.3 S2 股票执行与报告冻结值（御主终审通过）

本小节是 SR-008 的唯一执行假设来源。全部值都是版本化 Demo profile 的组成部分，必须在运行确认页和报告中展示；不得由实现者另换默认值。它们不构成实盘规则承诺或投资建议。

#### 费用、滑点与交易单位 `cn-stock-demo-fee@1` / `cn-stock-one-tick@1`

- profile 当前只支持 **2022-04-29 及以后**的成交，早于该日返回 `UNSUPPORTED_FEE_PERIOD`，不得套用现费率倒算。佣金始终作为 Demo 假设：成交金额 `0.00025`、单笔最低 `5.00` 元、买卖双向。
- 过户费按成交金额 `0.00001`、买卖双向。印花税仅卖出：2022-04-29～2023-08-27 为 `0.001`，自 2023-08-28 起为 `0.0005`。税费按成交日选择生效版本，不由运行终点决定。
- 每个费用组件分别计算并以 `ROUND_HALF_UP` 舍入到 Money scale=2 后再求和。佣金先取费率金额与最低 5 元的较大者再舍入；费用基数为滑点后实际成交金额。
- 股票 tick=`0.01` 元。买入成交价为原始开盘价加 1 tick，卖出为原始开盘价减 1 tick；不做随机滑点，若价格越界或成为非正数则拒单。
- 买入数量为 100 股整数倍，按滑点后价格和全部买入费用计算最大可负担数量，不得出现负现金。卖出数量不得超过可卖持仓；非 100 股整数倍的卖出只允许一次卖出全部剩余可卖零股，不模拟复杂零股申报。

#### 现金、持仓与公司行动 `cn-stock-settlement@1`

- 现金分为 `available/reserved/unsettled/receivable`，彼此不重复计数，总现金为四者之和。买入意图按最大预计成本从 available 转入 reserved；成交时扣除实际成本并释放余款，拒单/取消全额释放。
- 本 Demo 保守假设卖出款在成交时进入 unsettled，下一交易 session 开盘转为 available；不模拟提现。买入份额在成交时进入不可卖持仓，下一交易 session 才转为 sellable。卖出意图先冻结对应数量，成交/拒单/取消分别结算或解冻。
- 每个事件后检查现金、份额与权益守恒；不允许负现金、负份额、重复结算或无来源余额调整。P0 仍不融资、不做空、不加仓、不反转。
- 现金分红以登记日收盘持仓计算，除息日形成 receivable，派息日转为 available；不自动再投资，**红利税暂不模拟并作为 Demo 假设展示**。派息所需日期或金额缺失时，不得宣称完整执行。
- 送转/拆股按登记日持仓增加份额，实际上市日转为 sellable；缺少上市日时执行阻断，不猜测立即可卖。**原买入批次总现金成本不因送转改变，剩余成本随送转后数量调整/稀释；若此前已有部分卖出，只调整剩余批次成本，不得制造零成本收益或丢失现金对账。**信号继续使用点时复权序列，成交和账本使用原始价与真实权益事件。

#### 成本配对、买入持有与回撤 `cn-stock-report@1`

- P0 不加仓，每个实际买入 fill 形成一个成本批次；部分卖出按 FIFO 配对。批次全部卖出后才计入已平仓批次，批次已实现盈亏=对应卖出净收入−买入总成本，包含全部买卖费用。部分片段按数量比例分摊，最后一片段承担舍入尾差，保证与现金账本一致。
- 胜率=已实现盈亏大于 0 的已平仓批次/全部已平仓批次；盈亏为 0 不计胜，分母为 0 时返回 `null+reason`。未平仓部分只计未实现盈亏。首屏交易次数=实际成交订单数，买卖订单分别计数后求和，不以信号或拒单充数。
- 买入持有在**该策略于当前 RunSpec/warmup 下首个允许成交的 session**开始，而不是区间首 session，也不等待策略首个实际信号；即使策略最终无信号，基准仍须存在。买入持有以相同初始资金、滑点和费用买入最大可负担 100 股整数倍，余款保留；现金分红不再投、送转进入持仓，期末按同一原始收盘价估值。无法形成起始买入时返回 `null+reason`。
- 最大回撤以**运行前初始现金**为首个权益锚点，之后使用每日收盘总权益；从任一历史正峰值到其后谷值计算最大相对跌幅，因此首日跳空和首日亏损不得被隐藏。报告 Rate 输出按 scale=12 HALF_UP。
- 所有费用、公司行动、现金、份额、配对、买入持有和回撤 golden 必须逐事件先手算，再与实现比较；不得以同一实现输出反推答案。

### 7.3 真实探针转夹具的边界

优先转换：股票分红/preclose 算术、ETF 两源 OHLC 与成交量单位、指数精度、基金最新官方对账、非交易日 NAV、主接口失败与替代。

真实原始数据先保留本地；能否进入 `v3/tests/fixtures` 必须单独核许可和维护者授权。许可不足时，使用独立手算合成夹具表达同一语义，不能复制原始数据集绕过限制。

[AKShare 官方声明](https://akshare.akfamily.xyz/special.html)明确写有“**仅用于学术研究，不可做任何商业用途**”，并提示数据风险和接口可能移除；这不是上游数据再分发授权。AKShare/Baostock 的包许可证是代码元数据，不等于行情数据许可。

### 7.4 三场景、错误与空态验收

1. 无效自然语言结果能定位到 AST 路径，修改后回读同步变化；确认后运行按钮才可用。
2. 一键运行只调用一次内核，完成后剧场可暂停、加速、拖动和跳结果，最终 hash 不变。
3. 修改参数生成新 revision，v1/v2 在同一数据与执行假设下比较，订单和版本均可追溯。
4. 模型不可用、模型输出无效、数据缺失、warmup 不足、未确认、资产不支持、基金可见性未决均有独立错误/空态，不显示假成功。
5. 无交易、指标不足、空历史、零持仓、全部拒单等状态有解释，不用 0 或固定曲线掩盖。
6. S4 送审前，Feature Map、用户流程、线框、状态矩阵和实际视觉稿/原型版本齐全，御主设计终审记录可追溯；缺失败路径或未过设计终审不得进入实施。

### 7.5 性能与可复现候选预算

以下为候选验收预算，不是当前性能声称：在维护者确认的参考机上，连续十年单资产日线的纯内核运行（不含数据导入和模型）目标 P95＜2 秒，完整 Run＋Report＜5 秒，本地回放 cursor 更新 P95＜50ms。十年只是基准样本而非能力上限；对按 1.2.1 定义的单资产全历史或更长区间，须另测观测数/事件数扩展性并记录预算，不得静默截断。若事件量设计改变，先审预算再实现，不以降低事件完整性换速度。

验收须保存机器/运行时、数据规模、冷/热缓存、重复次数、P50/P95、事件/report hash；至少连续 20 次同输入结果一致，并证明运行期无网络调用。

---

## 8. 实施切片与依赖顺序

本表是后续授权后的实施建议，不在本文件授权范围内。每个代码/多文件配置切片都需实施者自验和未参与实施的独立复审；用户可见变化另需维护者终审。

| 切片 | 目标与输入/输出 | 预计改动面/文件边界 | 依赖与并行 | 验收/复审 |
|---|---|---|---|---|
| S0 契约骨架 | 输入本契约；输出 schema、类型生成、canonical/digest、Probe/Golden 工具和先红测试 | `v3/core/strategy`、`v3/tests/{contract,fixtures,golden}`、严格 TS 工程文件 | 最先；视觉可并行评审 golden 事件形状；7.2.1 的 S0 冻结项先于实现/golden | 冻结项复审＋schema/negative/canonical；独立复审 |
| S1 DSL/注册表/回读 | 输入 AST；输出有效策略、指标序列、错误、权威回读 | `core/strategy`、`application/validate-strategy`、fake fixtures | 依赖 S0；生成舱可与 golden 并行，但真实主流程放行另受 S3 约束；7.2.1 的 S1 冻结项先于实现/golden | 冻结项复审＋手算 MACD/KDJ/cross/within/warmup；独立复审 |
| S2 快照＋股票内核＋CLI | 输入 confirmed AST/RunSpec/Snapshot；输出完整 RunEvent/Report | `core/market`、`core/engine`、`core/report`、`application/run-backtest`、`adapters/market/{fixture,snapshot-file}`、`hosts/cli` | 依赖 S0/S1；剧场可用 golden 并行；真实导入可独立验证；7.2.1 的 S2 冻结项先于实现/golden | 冻结项复审＋费用/结算/配对/买入持有/回撤手算、守恒、T/T+1、公司行动、CLI golden；独立复审 |
| S3 Local 装配＋真实模型/确认 | 输入自然语言/旧 AST；输出真实 Kimi draft/valid/confirmed revision；测试另有 fake 输出 | `application/{draft,confirm}`、`adapters/model`、`hosts/local` | 依赖 S1；真实 Kimi 探针与 S2/Web 并行，但最终真实主流程放行依赖 S3，fake/golden 不解除该门禁 | 真实 Kimi 成功生成 v1 与调整 v2，各自校验/回读/确认通过，失败不切 fake、密钥边界；独立安全复审 |
| S4 Web 三场景＋compare | 输入 golden 或真实用例输出；输出三场景、回放和版本比较 | `application/{compare-runs,project-replay}`、`hosts/web`、必要 Local DTO；不改内核语义 | 依赖 S2 形成真实 golden 后先完成 1.5 三件套与御主设计终审，才开放 S4 实施；真实联动按 S1/S2/S3 接入，最终主流程必须使用真实 Kimi | 三场景/空态/性能/可复现；fake/golden 仅作开发测试，不替代真实主流程验收；独立复审＋御主视觉终审 |
| S5 ETF/指数 profile | 输入资产 profile 与探针；输出分析契约、单位/精度规则、显式执行拒绝 | `core/market`、相关 adapters/fixtures/tests | 依赖 S2；可与 S4 并行 | 两源 OHLC、指数舍入、ETF 缺口拒绝执行；独立复审 |
| S6 基金可见性与执行 | 输入已终审的 `NEXT_DAY_END_CONSERVATIVE` profile、官方补证；输出基金 P0 执行或继续阻断 | `core/market`、`core/engine` 基金时间线、fund fixtures/tests | 依赖 S2 与专项开放；外部证据不足不得宣称真实能力 | publishedAt/特别披露/未知 NAV/确认到账；独立复审＋御主确认 |
| S7 真实集成与硬化 | 输入各切片；输出真实 Kimi 主流程、默认外样本/区间、外部探针、性能和重复性最终证据 | `tests/integration`、扩展样本与全历史性能夹具、文档验证记录；不改业务语义 | 对应切片后；真实 Kimi/数据均单独授权；不得以 fake 或默认样本结果替代 | 四层真实验证、跨宿主、全历史扩展与性能；独立复审 |

视觉只能消费契约测试生成的 golden 事件流或真实 Run 输出，并明确标识来源；不得先画静态收益再让内核迁就页面。

### 8.1 S0/S1 工程边界（均已完成）

- 首切片使用 `v3/` 下单一 npm ESM 包，暂不引入 workspaces；以 tsconfig path 保持 core/application 边界。Node engines=`>=20`，依赖精确版本并提交 lockfile v3；当前本机 Node 24 只满足版本下限，不代替 Node 20/Windows 干净环境实测。
- 运行时依赖候选限 `ajv`、`decimal.js`、`@noble/hashes`、`json-dup-key-validator`；开发依赖候选限 `typescript`、`vitest`、`json-schema-to-typescript`、`@types/node`。原始数字 token 无损校验与重复键检查必须在 `json-input` 边界同时成立；若现有组合做不到，先上浮依赖 diff，不暗增包。S0/S1 不安装 Express/React/Vite/Kimi SDK、数据库或数据源库。
- 工程文件限 `v3/` 包清单、锁文件、严格 TS/Vitest 配置和类型生成脚本；实现限 `core/strategy` 的 schema/generated/canonical/validation/registry/indicators/evaluation/readback、`application/validate-strategy` 与 `tests/{contract,fixtures,golden}`。不改 market/engine/report、hosts、真实 model/market adapters 或旧四模块。
- scripts 至少包含 `generate:types`、`check:generated`、`typecheck`、`test`。获授权后在独立 worktree 首次安装并锁定依赖，再以干净安装执行 `npm ci && npm run check:generated && npm run typecheck && npm test`，记录 Node/npm/OS 与真实 red/green 结果。
- S0 冻结复审→S0 red/实现/自验→检验与独立复审通过后，才解冻 S1；S1 同闸执行。S1 通过不解冻 S2/S3，真实 Kimi 与外部数据继续单独授权。

### 8.2 S0 交付与质量证据（2026-10-28）

- SR-006 送审与合并 commit=`1836cef7d43399dc40ea4e1d8bb1c96cc1749a0d`；相对 `f1dca0a` 仅新增 34 个 S0 文件，无 S1、旧模块、真实模型或外部数据改动，已 FF 合并本地 main，未推送。
- 实施者自验、检验与零上下文独立复审均通过。独立复跑 `npm ci && npm run check:generated && npm run typecheck && npm test` 退出码 0，5 个测试文件 50 个测试全绿；有效 red 为 44 个行为断言失败，mutation 能抓换行转义错误，恢复后再次全绿。
- 8/8 canonical golden 已由独立标准库复算一致。Chromium 六向量探针与 Node 一致，但它是一次性证据，不是持续浏览器测试，也未覆盖全部 8 向量。
- 实测环境为 Windows 11 / Node 24.18.0 / npm 11.16.0；Node 20 与其他 OS 未验证。第三方 parser 空字符串键分类、直接 Decimal 调用长度护栏等仅作后续边界观察，不冒称本轮缺陷已修。
- 检验与独立复审证据保存于 `.local/sr006-s0-qa/`；S0 worktree 与分支已清理，资源清零。S1 可补充嵌套重复键与内部 HALF_EVEN 精确中点回归测试，不因此扩大实现范围。

### 8.3 S1 交付与质量证据（2026-10-28）

- SR-007 送审与合并 HEAD=`62086560cc683976bdef39d6a0969ea77852be52`，由 S1 实现 `084130d` 与三项限定修复组成；相对 `e963ae8` 共 38 个文件，仅含 S1 与获准的两条 S0 回归，无依赖、旧模块、S2 或外部适配器改动，已 FF 合并本地 main，未推送。
- 初检打回 contextRefs 覆盖、canonical Decimal 错误管道与 NAV 输入声明三项；返修具有 targeted red/green，最终独立全链 `npm ci && npm run check:generated && npm run typecheck && npm test` 退出码 0，11 个测试文件 89 个测试全绿。
- 零上下文独立复审使用 Fraction/Decimal 复算完整 MACD/KDJ、crossAbove、within3，全部匹配 golden；contextRefs、统一 failure/JSON Pointer、requiredInputs、三态/warmup/前缀不变性与权威回读均通过。
- Chromium 完整指标证据为一次性探针；实测 Windows 11 / Node 24.18.0 / npm 11.16.0，Node 20、其他 OS、真实 Kimi、行情与外部数据仍未验证或调用。
- 检验与独立复审证据保存于 `.local/sr007-s1-qa/`；worktree、分支与资源已清理。S2 的费用、结算、公司行动、成本配对和报告假设已在第 7.2.3 节冻结，不得由实现者自行改选。

### 8.4 S2 交付与质量证据（2026-10-29）

- SR-008 送审与合并 HEAD=`0dde9669d5c6ccd4a4e5f5ace5ee97a48ca47e05`，由 S2 实现 `3826ea7` 与六项独立复审修复组成；相对 `a785023` 共 36 个文件、+1751 行，仅含 S2 快照/股票内核/报告/CLI、生成类型与测试夹具，无依赖、旧模块、S3 或外部适配器改动，已 FF 合并本地 main，未推送。
- 检验初检打回当根 context 滞后、`position.state` 缺失、财务 HALF_UP 误用、intent-fill 证据链四项，三项技术语义由规划直裁（A 首个允许成交 session／B 送转稀释剩余批次成本／C state=0 flat、1 long）并入 `a785023`；返修后检验 PASS。零上下文独立复审再 FAIL 六项（warmup 诊断/status、零持仓送转与双终态、停牌登记基数、买入持有停牌顺延、负 Price 入估值、公司行动伪空 refs），经限定返修后由检验与独立复审双复验 PASS。
- 最终独立复跑 `npm ci && npm run check:generated && npm run typecheck && npm test` 退出码 0，17 个测试文件 116 个测试全绿，CLI/application 完整 RunEvent/Report hash 一致。原复审探针六场景复验全部符合预期：warmup details=36/0/36/0 且入 RunFailed payload、零基数送转唯一 RunCompleted、停牌登记基数 100 送转 10、买入持有顺延 finalEquity=1893.99 且 reason=null、负 close 估值前 DECIMAL_NEGATIVE_VALUE 精确 path 失败、公司行动/派息真实 refs；独立断言覆盖终态互斥、事件 seq/hash chain、event/report digest、每日四桶现金与持仓合计、最终现金/权益一致性，全部 PASS。
- 实测环境为 Windows 11 / Node 24.18.0 / npm 11.16.0；Node 20、其他 OS、真实 Kimi、真实行情与外部数据仍未验证或调用，S3/S4 未开放。
- 检验、独立复审与独立复验证据保存于 `.local/sr008-s2-qa/`（inspection／independent-review／independent-recheck）；worktree、分支与资源已清理。

---

## 9. 旧资产移植、归档与清理

### 9.1 移植门槛

每项候选必须：

1. 钉住来源 commit 和具体文件，不整支合并 main/develop；
2. 先建立新 port、负例、手算 golden 和来源/时间/单位元数据；
3. 剥离随机兜底、全局单例、旧 ORM/墙钟和模型直接交易接线；
4. 通过新契约测试后，再单独授权真实集成；
5. 在验证记录写明静态复用、运行通过和未核验项，不能因“develop 更新”免检。

可候选：当前 AKShare/Baostock 的独立同步库调用、旧字段映射/解析负例、指标公式对照、严格校验测试意图、历史修复位置。旧 async 包装、随机 KDJ、随机行情、HOLD 降级和旧 VirtualTradingService 不进入新主链。

### 9.2 归档与清理时机

- 保留 main 协作底座和 develop 历史参考线，不另造平行正典。
- 只有在目标垂直切片通过、归档入口可定位、所需资产完成移植、引用更新且独立复审后，才可另提旧树清理任务。
- 清理当前树、归档 tag/分支、敏感历史治理是不同授权事项；不得借 V3 实施顺带大清理或改写历史。

本契约不授权删除、归档移动、合并或推送。

---

## 10. 终审结论与后续授权边界

御主于 2026-10-28 按推荐口径完成终审，以下五项已经拍板：

1. **基金可见性采用 B**：`NEXT_DAY_END_CONSERVATIVE` 作为明确展示的保守产品假设；真实 `publishedAt` 路径 A 留作后续升级，S6 仍按依赖专项启动。
2. **ETF 仅分析、不执行**：完整公司行动与 T+1 证据补齐前保持执行阻断，其他 ETF subtype 继续显式拒绝。
3. **视觉采用单页三幕与约四分钟节奏**：首屏四指标为累计收益、最大回撤、交易次数、相对买入持有，胜率放详细层；最终审美仍由御主视觉走查。
4. **默认样本不是能力上限**：600519/2024 只作验证样本，支持更多独立单资产、自选区间与快照内全历史；费用、滑点、可见性和指数假设全部展示。
5. **真实主流程与数据边界**：Demo 主流程使用真实 Kimi，fake 仅自动化测试；真实 Kimi 调用另行授权，原始数据继续本地保存，不默认公开打包。

### 后续仍需证据或专项授权

- S2 已按第 7.2.3 节冻结并开放，但真实行情导入不在本切片授权内；费用、滑点、结算和公司行动均作为版本化 Demo 假设展示。
- ETF 完整公司行动与 T+1 执行证据、指数 return type 与精度元数据仍须补齐；未补前只按分析契约处理。
- Kimi 的真实 provider model id、结构化输出、限额、成本与错误语义未探针；真实生成 v1/调整 v2 与付费调用须单独 opt-in，fake 不抵扣最终门禁。
- 数据许可与公开展示未开放；AKShare/Baostock 原始数据继续本地，公开样本、分发、部署和 SR-004 另批。
- 本契约通过不等于全部功能已完成。SR-006 S0 与 SR-007 S1 已完成并合并；当前仅开放 SR-008 S2，S3 及后续切片仍须依第 8 章顺序和质量闸推进。
