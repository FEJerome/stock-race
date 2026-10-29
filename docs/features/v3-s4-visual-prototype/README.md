# V3 S4 视觉浏览器原型

> 状态：S4 设计闸第 3 件候选稿，待与 Feature Map、线框／状态矩阵一起由御主统一设计终审；本原型不授权 S4 业务实施。
>
> 这是纯静态视觉与交互原型，不是已完成的三场景产品。所有结果均为 **synthetic contract test**，不代表真实 Kimi、真实行情、真实收益或实盘能力。

## 1. 打开方式与目标尺寸

直接双击 [index.html](index.html)，或将它拖入 Chromium / Edge / Firefox。无需 npm、构建工具、本地服务或网络；不要通过 `fetch` 读取 golden，因此 `file://` 可直接运行。

- 目标展示尺寸：**1600 × 1000**；1440 × 900 保持同一信息层级。
- 1280 宽度起可完整使用；窄屏提供降级布局，但本轮审美终审以桌面展示尺寸为准。
- 推荐走查顺序：A 策略生成舱 → “运行回测”打开同源完成 Run → B 播放／拖动／点事件 → “查看报告” → C 详细层与证据链。
- 顶部“状态走查”打开关键错误与空态；它只预览视觉样式，不创建新 Run。

## 2. 文件清单

| 文件 | 用途 |
|---|---|
| `index.html` | 三幕语义结构、A0～A4 / B0～B5 / C0～C4 区域、状态走查与数据表对话框 |
| `styles.css` | 深色视觉 tokens、目标尺寸布局、响应式降级、动效与 reduced-motion 处理 |
| `data.js` | 内嵌只读 S2 fixture / golden 数据及同源 CLI 关键事件子集；浏览器运行时不请求数据 |
| `app.js` | 三幕跳转、共享 cursor、播放、事件证据、SVG 图表、报告 tabs、数据表与复制交互 |

没有第三方依赖、外部字体、图片或 CDN 请求。

## 3. 数据出处与真实性边界

### 基础输入与结果

- `v3/tests/fixtures/s2/basic-strategy.json`
- `v3/tests/fixtures/s2/basic-run-spec.json`
- `v3/tests/fixtures/s2/basic-snapshot.json`
- `v3/tests/golden/s2-basic-run.json`

### 事件与 digest 证据

`v3/tests/golden/s2-basic-run.json` 不含完整 RunEvent 流和 digest。为避免伪造 B4 / C4，原型从同一 fixture 的 S2 终审 CLI 输出抽取真实字段：

- `.local/sr008-s2-qa/inspection/review-fix-cli-result.json`
- 同源 Run：`sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70`
- 完整流共 34 条事件；原型内嵌其中 **23 条关键事件的原值子集**，界面明确标注“23 个关键事件 / 完整流 34 条”，没有将子集冒称完整流。
- A / C 展示计算后报告中的真实 `strategyDigest` 与 `snapshotDigest`；原始 RunSpec fixture 中全 0 的输入占位 digest 没被当作输出身份使用。

### 展示取舍

- 价格图只使用六日 raw OHLCV。`indicators: {}`，因此明确显示“无指标序列”，不补画 MACD / KDJ。
- 六日策略权益和回撤来自 golden；买入持有只有 golden 给出的期末值 `1993.99`，所以图中只画**期末点**，不扩成虚构日频曲线。
- 两笔实际成交和一笔拒单均按原值显示；`tradeCount=2` 不把拒单计入成交。
- 模型来源固定标为“S2 fixture · 非 Kimi”。“运行回测”按钮在原型里只打开已完成同源 Run，并弹出说明；不执行内核、不模拟逐日生成事件。
- 当前只有 v1 的真实完成 Run，**没有虚构 v2 指标、版本提升或第二条收益曲线**。

## 4. 设计决策（候御主终审）

### 视觉与信息层级

- **方向**：石墨色策略指挥舱。主证据线用蓝色，版本／基准／回撤用橙色，状态色独立；避免把收益负值直接等同于界面错误。
- **字体**：离线系统字体。中文与界面使用 Segoe UI / Microsoft YaHei UI 等系统栈，digest、数值列和事件编号使用 Cascadia Code / Consolas 等等宽栈。
- **A 三栏比例**：目标尺寸约 **28 : 37 : 35**。A2 结构化规则略宽，A1 收敛意图与历史，A3 保持回读和确认同屏。
- **密度**：P0 常驻；P1 在运行带和 compare 对齐区核对；P2 用 disclosures、事件证据和详细层承接。首屏四指标保持契约顺序。
- **图表**：2px 线、8px 以上关键点、细实线网格、选择性端点标签；无双 y 轴。权益与回撤分图。所有图表有 hover / 键盘读数与数据表视图。
- **色彩校验**：图系列使用 `#3987e5` / `#d95926`，对 `#1a1a19` 图表表面运行 dataviz palette validator，lightness、chroma、CVD、normal-vision、contrast 全部 PASS。图例、形状和文字标签不依赖颜色单独编码。

### 动效与三幕衔接

- 场景进入采用 280ms、`cubic-bezier(.22,.8,.28,1)` 的短距离上移＋透明度变化；按钮和 tab 反馈为 150～220ms。
- 动效只说明场景和 cursor 变化，不制造“模型正在逐日思考”或“内核正在产生收益”的假象；遵守 `prefers-reduced-motion`。
- A → B 保留 confirmed revision 与 runDigest；B ↔ C 保留日期 cursor；B / C → A“基于此版本调整”显示明确 v1 基线，工作轴进入 drafting，旧 Run 轴仍为 completed。

### compare 默认选中项

默认 **v1 为基线，v2 未选择**。C2 展示单 Run 空态和待检查的对齐条件，不展示差值。选择比较版本时说明当前没有第二个完成 Run；版本差值必须等真实 v2 重新确认、运行并对齐后再出现。

## 5. 错误与空态覆盖取舍

顶部“状态走查”提供 7 类独立视觉稿；主流程另覆盖真实零持仓、真实单笔拒单和单 Run compare。16 项矩阵不逐项画成独立页面，覆盖如下。

| 线框矩阵情况 | 本原型覆盖 |
|---|---|
| 无交易、无信号 | 独立走查稿：真实 0 计数与“未产生入场信号”分开 |
| 有信号但从未成交 | 由“全部拒单”稿表达信号／意图／成交分离；未另画取消分支专稿 |
| 全部拒单 | 独立走查稿：拒单原因、0 fills、信号不计成交 |
| 零持仓 | 主流程真实 golden：期末 0 持仓，但保留 2 fills、费用和胜率 |
| 数据不足 / warmup 不足 | 独立 data-error / failed 稿：`INSUFFICIENT_WARMUP`、path、required / actual 位置与成功报告阻断 |
| 空历史 / 区间无观测 | 复用 data-error 容器与“无成功时间轴／报告”规则；未另画独立空历史稿 |
| 指标不足 / 不适用 | 独立 null + reason 稿：“—”与原位原因，其他指标保留 |
| 买入持有不适用 | 同一 null + reason 稿覆盖，明确缺失基准不等于超额 0 |
| 已确认停牌 / stale 估值 | **未单独成稿**；golden 没有该状态，未伪造日期或 stale 标记。待终审是否要求补充纯样式稿 |
| 原因未知的数据缺失 | 复用 data-error / failed 的失败诊断结构；未虚构具体数据错误值 |
| 模型输出无效 | model-error 稿覆盖真实模型失败边界；JSON Pointer 定位在 A3 结构中保留，未另画每种无效输出 |
| 资产不支持 | **未单独成稿**；不改变资产或伪造执行结果 |
| 基金可见性未决 | **未单独成稿**；不在股票 golden 上套用基金语义 |
| 其他 RunFailed | data-error / failed 稿覆盖失败事件、诊断与无成功 Report 的视觉层级 |
| 只有一个完成 Run | 主流程 C2 实际状态：v1 完整，v2 待运行，无自我比较 |
| compare 条件不齐 | 独立走查稿：列出不一致字段，禁用版本差值，保留独立报告入口语义 |

11 态主矩阵中，confirmed / completed 由主流程成稿，drafting 由“基于此版本调整”实际联动，valid 未确认由走查稿覆盖；empty、confirming、running 等未逐项成稿。前两件正典已定义其完整行为，本轮优先送审关键失败与空态样式。

## 6. 已接通的演示交互

- 三场景 tab、A → B、B → C、B / C → A 基线调整；工作 revision 与选中 Run 分轴显示。
- B：六 session cursor、播放／暂停、1× / 2× / 4×、拖动、跳结果、事件过滤、上一／下一关键事件。
- B：价格、泳道、权益、回撤与 B4 事件证据同步；事件包含 seq / date / phase / type / reasonCodes / inputRefs / payload / hash chain。
- C：7 个详细层 tabs、完整 digest 复制、图表 hover 与键盘方向键、原始 OHLCV 和日频账本数据表。
- 所有图表数据均可在不依赖 tooltip 的情况下读取；`Escape` 可关闭原生 dialog。

## 7. 待御主终审项

1. 石墨底、蓝／橙证据编码、系统字体与目标尺寸下的信息密度是否符合四分钟展示节奏。
2. A 三栏约 28 : 37 : 35，以及 B 右侧 340px 事件证据栏是否合适。
3. 场景 280ms 与控件 150～220ms 的动效是否克制、连贯。
4. compare 默认“v1 基线 / v2 未选择”和单 Run 空态是否作为正式默认。
5. 买入持有只画期末点、指标为空不补线，是否作为数据不足时的标准视觉表达。
6. 第 5 节列出的停牌／stale、资产不支持、基金可见性未决等未独立成稿项，是否需在 S4 施工前补纯样式稿。
7. 1600 × 1000 下 B 幕文档高度约 1067px，存在轻微纵向滚动；是否接受，或继续压缩图表与证据区高度。

## 8. 自验记录（2026-10-29）

- `node --check data.js` 与 `node --check app.js` 通过。
- 数据断言通过：三份 fixture 完整等值；golden 的 fills / daily / metrics / fees / buyAndHold 等值；23 条内嵌事件逐条等同同源 CLI 对应 seq；订单、拒单、现金、持仓与 run / event / report / strategy / snapshot digest 等值。
- Chromium 直接以 `file://` 打开，1600 × 1000：A → B → C、播放／暂停、cursor 拖动、seq 7 成交证据、报告拒单 tab、六行数据表、基于 v1 调整阻断与 null + reason 走查均通过；cursor 与场景切换不改变 Run 身份。
- 浏览器 console 0 errors / 0 warnings；1600 宽度无横向页面溢出。临时浏览器截图未纳入交付目录。

## 9. 边界

本目录只新增设计原型与说明，不修改 S0 / S1 / S2 代码、既有契约或业务实现，不接入真实模型、行情、网络、数据库或实盘，不做 Git 提交。终审前 S4 实施不开放。
