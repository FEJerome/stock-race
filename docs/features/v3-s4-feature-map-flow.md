# V3 S4 前置设计：Feature Map 与用户流程

> 状态：S4 设计闸第 1 件候选稿，待三件套齐全后由维护者统一设计终审；本文不授权 S4 实施。
>
> 命名注记（2026-11-14 维护者终审拍板）：AI 经理人中文名定为 **阿一**（2026-11-11 拍板），英文拼写定名 **A YI**；旧名「衡一 / HENG YI」弃用、「阿衡」禁用。
>
> 正典依据：[V3 Demo 完整契约](v3-demo-complete-contract.md) 1.1～1.5、3、5、6、7.4、8.4。线框与状态矩阵见 [V3 S4 三场景线框与状态矩阵](v3-s4-wireframe-state-matrix.md)。

## 1. 产品主链与边界

用户目标不是“让模型替自己交易”，而是把一句投资意图变成可检查、可解释、可复现的单资产模拟规则，并比较确认过的规则版本。

```text
自然语言意图
  → 真实 Kimi 生成声明式 StrategyDraft
  → schema / 注册表 / 类型 / 资产 / 因果校验
  → canonical AST + digest + 权威 Readback
  → 用户按 expectedDigest 确认 revision
  → 冻结 DataSnapshot + RunSpec，确定性运行一次
  → 完整 RunEvent[] + Report
  → 只读回放 / 结果报告
  → 基于指定旧 revision 调整形成 v2，再校验、回读、确认、运行
  → 满足对齐条件的 v1/v2 compare
```

- 模型只生成不受信任的声明式草稿，不生成订单、不修改 RunSpec、不参与逐日回测。
- 真实用户主流程只使用真实 Kimi K3.1 Pro；失败原样呈现， deterministic fake 仅用于自动化测试且必须明示。
- 所有场景只用于模拟交易和策略研究；不提供实盘入口，不作荐股或收益承诺。

## 2. 一页 Feature Map

| 编号 | 功能 | 用户动作 | 系统反馈 | 验收结果 |
|---|---|---|---|---|
| F01 | 招聘 AI 经理人（**2026-10-29 第三轮概念返修**） | 看到“雇一位 AI 股票经理人，送他回到过去的市场”；选择同一位阿一的“谨慎梳理／指标直达”面试风格，开始面试 | 进入 `drafting`；首屏突出角色与“招聘→穿越→围观→复盘”链，不做多模型／多经理人；职级、荣誉馆、更多经理人只作“暂未开放”点缀 | 三秒看懂雇佣角色与四环节；Demo 只有阿一；预写脚本非真实 Kimi；确认与运行权限仍由后续门禁决定 |
| F02 | 面试形成草稿（**第三轮返修**） | 与阿一多轮面试；白话输入先补触发条件，指标输入直接核对参数；可重放新手／老手预写脚本 | 阿一只引导表达、不荐股，按水平适配语言；真实主流程由真实 Kimi 返回 `StrategyDraft`，中栏入场／出场／仓位随对话逐块出现，并展示真实 `ModelProvenance` | 输出仅限声明式 AST；无订单或任意代码；模型失败进入 `model-error`，不切 fake；角色身份不得冒称自主决策或实时逐日工作 |
| F03 | 对话收敛、校验与修复（**第二轮返修**） | 补齐入场、出场和仓位；查看错误，修改意图或结构参数后重新校验；模型修复最多两轮 | 对话最终收敛到 AST，按统一顺序校验；错误以 `code/path/message/expected/actual/hint` 定位，warning 单独可见；“规则齐了”不等于校验通过或已确认 | 信息不全时确认与运行阻断；修复后 AST、回读和 digest 同步变化；额外字段、未知指标、未来引用不得通过 |
| F04 | 权威回读（**权威边界不变**） | 对照对话意图阅读回读摘要与逐条 clause，再决定是否确认 | 由 canonical AST＋注册表模板生成确定性 `Readback`，每条可回溯 `astPath`；模型辅助解释另标来源，对话中的总结不能替代权威回读 | 用户能核对入场、出场、仓位、参数和注册表版本；仅在有效未确认时显示“确认策略”；expectedDigest 确认前置不变 |
| F05 | 确认 revision | 点击“确认策略”，核对策略名、revision 与完整 digest | 以 `expectedDigest` 确认并生成 `ConfirmedRevision{strategyId,revision,digest}`；状态进入 `confirmed` | 未确认或 digest 不符均不得运行；确认期间内容被替换则失败；确认后修改可执行语义会产生新 revision，旧确认不继承 |
| F06 | 选择穿越目的地与执行假设（**第三轮返修**） | 选择市场／快照／历史区间，填写初始资金与 extra warmup，核对费用、滑点、结算、可见性和引擎版本 | 目的地展示完整 RunSpec、数据质量／许可／复权／单位和 warmup；CN A 股为 P0，US/JP 愿景禁用；真实沪深与真实行情未接入，原型仅 synthetic golden | 模型不能修改目的地或执行字段；非法输入显式报错；不支持的资产／区间阻断，不用固定曲线替代；确认前不能出发 |
| F07 | 一键运行 | 点击“运行回测” | 冻结 confirmed strategy、DataSnapshot 与 RunSpec，计算 `runDigest`；一次形成完整有序 `RunEvent[]` 和 `Report` | 运行期无模型、网络、随机数或墙钟；同 RunSpec 结果一致；失败保留 `RunFailed` 诊断，不输出成功报告 |
| F08 | 围观经理人工作（**第三轮返修**） | 看阿一何时买入、经历回撤、退出；播放、暂停、加速、拖动、跳结果；问“当时依据”展开事件抽屉 | 明示“他只知道那天及之前的事”；故事与回答只从点时 RunEvent/Report 推导，证据抽屉展示 `seq/tradingDate/phase/type/reasonCodes/inputRefs`、payload 和 hash | 完整结果先算定；cursor 不提供未来信息、不重跑策略、不调用模型、不改变 hash；warmup、停牌、stale 与拒单不被叙事隐藏 |
| F09 | 经理人复盘与穿越成绩单（**第三轮返修**） | 问阿一“当时为什么这么做”，先读人话复盘，再看四指标、详细层和证据 | 预写规则问答只引用当前 Run 的事件与数值；人话层回读单日变化、费用和买入持有对照；四指标、compare 和 digest 保留 | 不编造心理活动、市场因果或实时模型回复；不荐股、不外推短样本；指标不可用显示 `null + reason`；失败 Run 不伪装成功 |
| F10 | 调整形成 v2 | 从报告选择“基于此版本调整”，输入修改或编辑参数，再次生成／校验／回读／确认 | 明确显示基线 `strategyId/revision/digest`；形成独立新 revision 和 digest；默认带出基线 RunSpec 供用户核对 | v2 未重新确认不得运行；v1 与其 Run 保持只读；模型修改不得改变资产、快照、费用或执行假设 |
| F11 | 运行并比较版本 | 以同一数据与执行假设运行 v2，选择 v1/v2 compare | 展示两 revision 各自结果、指标差值、订单差异与对齐信息；保留两个独立 digest | 仅允许同资产、快照、区间、初始资金、执行假设，且 engine/registry/canonicalization 版本一致；不齐时列出不符项并拒绝差值结论 |

## 3. 三场景分工与跳转

| 场景 | 主责功能 | 必带上下文 | 主要跳转 |
|---|---|---|---|
| A 策略生成舱 | F01～F07、F10 | 当前草稿／confirmed revision、能力清单、校验与模型来源、待运行 RunSpec | 运行完成进入 B；选择历史 Run 可去 B/C；从 C 带回指定基线 revision 调整 |
| B 历史推演剧场 | F08 | 已完成 runDigest、RunSummary、RunEvent[]、指标序列、Report 引用 | “查看报告”进入 C 且保持同一 runDigest；返回 A 不改写 Run |
| C 结果与版本对比报告 | F09～F11 | 当前 Report、可选基线 Report、两个 revision 与对齐结果 | “基于此版本调整”回 A；比较成功后仍可分别打开两个 Run 的 B/C |

三场景共享的是明确标识的 revision、RunSpec 和 Run 时间轴，不是互相可写的页面副本。编辑新草稿不得清空或改写旧 Run；查看旧报告也不得把旧确认状态套到新草稿。

## 4. 关键分支流程

```text
F02 模型超时／不可用／修复耗尽
  → model-error：保留意图与最后草稿，允许重试真实模型；禁止 fake 接管

F03 校验失败
  → invalid：定位 JSON Pointer；确认和运行均阻断

F05 expectedDigest 不符
  → 确认失败：重新读取当前 canonical AST 与回读；不得确认被替换内容

F06 数据缺失／warmup 不足／资产不支持／基金可见性未决
  → data-error：展示具体原因和 required/actual 等证据；当前 Run 不得伪装成功

F07 完成
  → completed：B、C 消费同一份完整事件流和报告

F10 修改可执行语义
  → 新 revision 回到 drafting/invalid/valid；旧 confirmed revision 与旧 Run 保留

F11 对齐条件不齐
  → 两个独立报告仍可查看；compare 区拒绝计算“策略版本差异”
```

## 5. 设计数据底与端到端验收

S4 线框使用 S2 已实现契约的真实输出形状，而不是虚构静态收益：

- [S2 golden](../../v3/tests/golden/s2-basic-run.json)：手算合成样本，6 个 session、2 笔实际成交，累计收益 `-0.006260000000`、最大回撤 `0.136737177471`、相对买入持有 `-0.003255000000`，期末权益 `1987.48`。
- [RunSpec](../../v3/tests/fixtures/s2/basic-run-spec.json)、[DataSnapshot](../../v3/tests/fixtures/s2/basic-snapshot.json)、[StrategyDraft](../../v3/tests/fixtures/s2/basic-strategy.json)：提供完整运行假设和六日原始 OHLCV。
- 这些是 **synthetic contract test** 证据，不是真实行情、真实 Kimi 或 S3/S4 已完成证明。真实主流程仍须分别通过真实 Kimi 生成 v1 与调整 v2 的门禁。

端到端验收必须同时证明：

1. 从意图到 v1/v2 compare 的每一步均可追溯，确认前不能运行，修改后旧 digest 不能复用。
2. 三场景读取同一 Run；播放与跳转不改变 canonical event/report hash，也无逐日模型请求。
3. 模型错误、数据错误、无交易、全部拒单、零持仓、空历史和指标不适用均有独立呈现，不用 0、fake 或固定曲线掩盖。
4. compare 的每一项对齐条件可见；跨引擎或跨数据差异不被包装成策略版本差异。

## 6. 待终审边界

本轮未发现需要改选契约的矛盾，也未新增产品能力。三栏比例、展示尺寸、配色、字体、图表动效和具体 compare 默认选中项归第 3 件视觉稿／原型及维护者终审；在这些设计三件套通过前，不开放 S4 实施。
