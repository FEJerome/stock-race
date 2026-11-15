# 2026-10-28 · V3 S2 Stock Demo Execution and Reporting Assumptions Final Approval

*Translated from the Chinese original on 2026-11-15.*

## Decision

The maintainer approved opening **SR-008 "V3 Stock Kernel and CLI"** per the recommended wording. The sole residence of the complete frozen values is [V3 Demo Complete Contract section 7.2.3](../features/v3-demo-complete-contract.md#723-s2-股票执行与报告冻结值维护者终审通过); this document records only the approval summary and evidence entry points.

1. Initial capital may be user-entered within `1000.00～100000000.00 CNY`, defaulting to `100000.00`; the actual value enters RunSpec/digest; compare must use the same initial capital.
2. Commission is 0.025% of trade amount, minimum 5 CNY per order, charged on both buy and sell — explicitly a Demo assumption. Stamp tax is 0.05% on sell; transfer fee is 0.01‰ of trade amount, charged on both sides; each fee is HALF_UP-rounded to the cent and then summed.
3. Fixed 1-tick directional slippage: upward on buys, downward on sells; buys in integral multiples of 100 shares; non-round-lot sells are allowed only as selling the entire remaining odd-lot position in a single order.
4. T-day signal, T+1 open fill, and same-day buys not sellable. Cash, positions, and corporate actions are booked per `cn-stock-settlement@1`; cash dividends are not reinvested, bonus/split shares enter the position, and dividend tax is not simulated but is explicitly displayed.
5. Cost pairing, buy-and-hold, and maximum drawdown follow `cn-stock-report@1`, including FIFO, post-fee win rate of closed lots, buy-and-hold under the same assumptions, and a pre-run initial-cash drawdown anchor.

## Effective-period evidence and official sources

- The 2024 sell-side stamp tax is 0.05%: statutory securities transaction stamp tax is levied on the transferor, halved since 2023-08-28.
- The Shanghai/Shenzhen A-share transfer fee has been 0.01‰ of trade amount, charged on both sides, since 2022-04-29.
- To support multi-year intervals, the contract keeps a stamp-tax effective-period split before/after 2023-08-28; trades earlier than 2022-04-29 are explicitly rejected, with no retroactive fee-rate derivation.
- Commission, fixed slippage, conservative cash settlement, and the omission of dividend tax are all explicit Demo assumptions; no claim is made that these are the complete rules of all brokers or of live trading.

Sources:
- [Announcement by the Ministry of Finance and the State Taxation Administration on halving the securities transaction stamp tax](https://www.gov.cn/zhengce/zhengceku/202308/content_6900443.htm)
- [Stamp Tax Law of the People's Republic of China](https://fgk.chinatax.gov.cn/zcfgk/c100009/c5193058/content.html)
- [ChinaClear transfer fee adjustment (CCTV report)](http://jingji.cctv.com/2022/04/29/ARTIfffB49l5SPprJ1xJuymW220429.shtml)

## Authorization boundary

Only the S2 implementation of manual/synthetic snapshots, the stock pure kernel, the file snapshot adapter, and the CLI is opened. Real market data access, real Kimi, public data, deployment, remote pushes, and S3-and-later slices are not authorized. Implementation must first produce per-event hand-computed goldens and valid reds, then complete self-verification, inspection, and zero-context independent review.

## Same-version clarification · three S2 inspection semantics

After S2 inspection, the planning side clarified, without changing the business package already approved by the maintainer:

1. The buy-and-hold starting point is the first session in which the strategy is allowed to fill under the current RunSpec/warmup — not the first session of the interval, and not waiting for an actual signal; a no-signal strategy still has a benchmark.
2. Bonus/split shares do not change the total cash cost of the original buy lots; they only adjust/dilute the cost of the remaining lots; zero-cost gains must not be fabricated, and cash reconciliation must not be lost.
3. `position.state` is a numeric sequence `0=flat, 1=long`, consistent with the current-bar quantity; the current bar's quantity/availableCash uses the state after actual fills/settlement.

The RunEvent evidence requirements are also clarified: the original intent, actual fill, quantity-correction reason, and inputRefs must be complete; empty references by default or silently changing quantities are forbidden. Implementation defects and the above clarifications are all remediated and re-verified against the same canon, without opening subsequent slices.
