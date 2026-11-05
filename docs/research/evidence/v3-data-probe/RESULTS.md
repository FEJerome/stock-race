# V3 · AKShare＋Baostock 最小真实数据探针结果

- 日期：2026-10-27
- 范围：仅 AKShare、Baostock；以历史日线/NAV 为主，不做实时源排名。
- 运行时：全新隔离 Python 3.10.11 venv。
- 库版本：AKShare 1.18.88、Baostock 0.9.4、pandas 2.3.3、numpy 2.2.6、requests 2.34.2。
- 边界：未读旧 Key/环境文件，未调用 Tushare/Kimi，未启动旧服务或旧脚本，未写数据库，未公开数据。
- 原始证据只保存在本目录；所有 rawHash 和 manifest hash 已复核一致。

## 总结判断

**支持以“部分通过、带阻断项”进入数据契约草案和本地夹具设计；不支持据此冻结完整四资产执行契约。**

股票原始日线、交易日历、现金分红和 preclose 的内部一致性证据最完整。ETF 可进入原始日线分析契约，指数可进入非交易分析契约。普通基金 NAV 可进入 schema，但缺少 `publishedAt`，在执行前必须另有真实发布时间或经维护者批准的保守可见规则。

## 证据入口

- 首轮：`evidence/manifest.json`
  - SHA-256：`137aad468901ae07448df4a1b866ba3e925754b0b71671f2b6ef88fc8cb5583b`
- 补充：`evidence-supplement/manifest.json`
  - SHA-256：`e6ea793b9ee5f724a0199faa45693393122c763965a4773ca4b19f2cbf8f0dde`
- 派生复核：
  - `evidence/derived-review.json`
  - `evidence/corporate-action-check.json`
  - `evidence-supplement/supplement-derived-review.json`
- 脚本与依赖：`scripts/`、`scripts/pip-freeze.txt`、`scripts/api-inspection.json`
- 官方静态说明：`scripts/official-static-notes.json`

`raw.csv` 是库返回 DataFrame 的本地 UTF-8 序列化，不冒充上游 HTTP 原始报文；这一点已写入 manifest。

## 通过项

### 1. 普通开放式基金候选与 NAV

- 110011 的身份实际为 **易方达优质精选混合（QDII），基金类型 QDII-混合**，因此不作为普通开放式 P0 样本。
- 补充候选 000001 经身份接口返回：**华夏成长混合，混合型-偏股**；排除项检查未命中 QDII、FOF、货币、封闭、ETF/LOF，随后才调用开放式基金 NAV 接口。
- 000001 单位 NAV 与累计 NAV 各返回 6030 行，2024 固定区间各 243 行，两个序列日期完全相同。
- 采集时最新可见的单位/累计 `navDate` 均为 **2026-10-26**；未假定 2026-10-27 NAV 已发布。
- 两只基金均有历史分红返回；两者在 2024 固定区间都没有分红事件。这是“固定区间事件数为零”，不是接口调用失败。

### 2. ETF 510300

- AKShare 原始日线和前复权日线各 242 行，日期集合一致，OHLC/schema 检查通过。
- Baostock 原始日线 242 行；身份补充返回“华泰柏瑞沪深300ETF”，原始 `type=5,status=1`。类型数字只按原值保留，不自行扩展执行规则。
- 2024-01-02、2024-12-31 两个日期的 AKShare/Baostock OHLC **逐项精确一致**；两日成交额也精确一致。
- 两日 Baostock/AKShare 成交量比约为 100，和“股 vs 手”一致但存在取整差异；未把两个单位直接合并。
- raw/qfq 的 242 行均有 OHLC 差异，证明返回了不同序列，但不独立证明复权计算正确。
- ETF 分红接口返回 14 行，2024-01-18 有一条累计分红 0.669。文档语义是除息日和累计分红，不是完整单次公司行动账本。

### 3. 指数 000300

- AKShare 身份表返回 `000300/沪深300/2005-04-08`；Baostock 返回“沪深300指数”，原始 `type=2,status=1`。代码没有与股票 000001 等命名空间混用。
- AKShare 主接口 `index_zh_a_hist` 连接失败后，未重试；同库替代 `stock_zh_index_daily` 返回全历史，本地过滤出 2024 年 242 行。
- 与 Baostock 在两个日期的**原始严格十进制等值比较失败**：差异为 0.0001～0.0005，对应 3 位与 4 位小数。
- 独立的显式 `ROUND_HALF_UP 0.001` 检查在两个日期全部 OHLC 对齐。原始失败仍保留在 manifest；契约必须固定指数精度，不能声称原始值完全相等。

### 4. 股票 sh.600519

- 证券主数据返回“贵州茅台”，`type=1,status=1`，上市日期 2001-08-27。
- 2024 原始日线 242 行，含 `preclose/tradestatus/isST/adjustflag`；全年 `tradestatus=1,isST=0,adjustflag=3`。
- 真实交易日历 366 个自然日记录，2024-01-01 非交易、2024-01-02 交易、2024-01-06 非交易均通过。全年 242 个交易日与股票 242 个日线日期**双向完全一致**。
- 两个 2024 现金分红事件完整返回，均有登记、除息、派息日期；送转字段为零。两个复权因子事件同日返回。
- 公司行动算术核验通过：
  - 2024-06-19：1521.50 − 30.876 = 1490.624，实际 preclose 1490.62；
  - 2024-12-20：1551.01 − 23.882 = 1527.128，实际 preclose 1527.13。
  两者均在 0.005 元舍入容差内，且正好是全年两次 preclose 与前一日原始收盘不一致的日期。
- AKShare 主接口失败后，同库 `stock_zh_a_daily(adjust="")` 替代调用一次成功；与 Baostock 在两个日期的 OHLC 精确一致，成交量一致，成交额只有 0.08/0.22 元的小数差。

### 5. Baostock 复权注释纠正

当前 Baostock 0.9.4 包内 demo 明确写 `adjustflag="3"` 为默认不复权，且本次 Baostock 股票/ETF 数据与 AKShare 明确 raw 的 OHLC 对账一致。**旧 main 把 3 注成“后复权”的注释不得沿用。** 旧数据文档中任何“3=后复权”的假设都应以本次版本和实际对账重新审查。

## 失败项与已执行替代

| 项目 | 原始失败 | 后续处理 |
|---|---|---|
| AKShare ETF 身份 `fund_individual_basic_info_xq` | `KeyError: 'data'` | 当前 ETF 列表替代又遇 `RemoteDisconnected`；最后用 Baostock 主数据补身份 |
| AKShare `index_zh_a_hist` | `RemoteDisconnected` | 不重试；同库 `stock_zh_index_daily` 一次成功 |
| AKShare `stock_zh_a_hist` | `RemoteDisconnected` | 不重试；同库 `stock_zh_a_daily` 一次成功 |
| 基金 2024 分红 | 两只基金均为 0 条 | 记录为固定区间无事件，不伪造成接口失败，也不补造事件 |

所有替代都有独立请求记录，未反复重试原接口。

## Kill unknown／执行前阻断项

1. **基金 publishedAt 缺失。** 单位/累计 NAV 和分红字段均未提供发布时间；最新 navDate 只是采集时表内最大日期。不能把 navDate 当 publishedAt，也不能据此完成无未来数据执行。
2. **基金需要独立 NAV 日历。** 110011 与普通基金 000001 的 2024 NAV 都包含非交易日 **2024-06-30**，且没有缺少交易日 NAV。该现象不是 QDII 独有；不能简单套交易所日历，也不能给非交易日现象编造原因。
3. **ETF T+1 与完整公司行动未由这些接口证明。** 身份为股票 ETF 不等于数据源提供结算规则；累计分红不足以生成所有份额/现金事件。
4. **指数价格/全收益类型未标注。** 身份和历史存在不能证明 return series 口径；指数仍不可直接交易。
5. **单位与精度必须显式化。** 不同接口的成交量单位、指数小数位和成交额尾差不同，不能用 JS float 或无说明合并。
6. **费用未验证。** 佣金、税费、基金申赎费、滑点、确认和到账规则不属于本次行情探针结果。
7. **许可与稳定性未解决。** 单次或单日下午成功不证明长期稳定；Baostock 两次 login 分别约 47.875 秒和 61.375 秒，应保留为性能事实而非 SLA。

## 是否进入数据契约

### 可以进入草案和本地契约测试

- `AssetIdentity{code,displayName,sourceTypeRaw,status}`，资产命名空间必须显式。
- `DailyBar{date,open,high,low,close,volume,amount,adjustment,source,precision}`，原始 OHLC 与复权序列分开。
- `NavBar{navDate,unitNav,cumulativeNav,source}`，`publishedAt` 保持必填但未知/待补，不得默认等于 navDate。
- `TradingCalendar`、`CorporateAction`、`AdjustmentFactor` 与来源/版本/采集时间/rawHash。
- 股票 raw+现金分红+preclose 算术、ETF 两源 OHLC、指数舍入、基金非交易日 NAV 都可转成本地固定夹具。

### 不能冻结为完整执行语义

- 基金可见时点和独立 NAV 日历规则；
- ETF 的 T+1 结算与完整公司行动；
- 指数 price/total-return 标签与统一精度；
- 全资产的单位、费用、成交和现金到账规则；
- 对外保存/展示/再分发数据的许可。

## 官方静态使用说明

AKShare `special.html` 明示“仅用于学术研究，不可做任何商业用途”，并有数据风险和接口可能移除的声明；未找到上游数据再分发授权。AKShare 包 MIT、Baostock 包 BSD 是代码元数据，不是行情数据许可。Baostock 公共页面本次只读到站点壳，未据此形成许可结论。

因此，本证据只用于当前本地模拟研究，不进入公开数据包，不宣称商业使用或再分发权。
