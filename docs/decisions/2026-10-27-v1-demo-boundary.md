# 2026-10-27 · V1 Strategy Lab Boundary

*Translated from the Chinese original on 2026-11-15.*

## Status

Confirmed. This decision constrains only the technical boundary of what was originally called V1 and is now called the **V3 Demo**; it does not mean the business implementation is complete. Product generation naming is defined in [V3 Demo Naming and Branch Generations](2026-10-27-v3-demo-naming.md).

## 1. V1 does not support same-session portfolio trading

Each V1 run task simulates a strategy against a single asset only; it does not trade multiple assets simultaneously and does not introduce portfolio capital allocation, cross-asset rebalancing, or portfolio-level net value.

Asset types such as stocks, ETFs, funds, and indices must each be handled with their own data and execution semantics; uniformity must not be achieved by assuming that an index can be traded directly or that all assets share one set of fill rules.

## 2. Strategy expression uses a controlled high-freedom language

Long-term approach: "declarative strategy language + controlled indicator/function registry":

`natural language → structured strategy → static validation → user confirmation → deterministic execution`

- Supports indicator parameters, expressions, logic composition, time windows, trade actions, and rule versions.
- The model does not directly generate and execute arbitrary Python/JavaScript code, nor does it directly produce orders.
- Unsupported indicators, functions, or semantics must raise explicit errors; the system must not pretend to understand and then generate results.
- Rules, indicators, and execution results must be verifiable, explainable, and reproducible.

## 3. V1 visuals use a dark strategy command deck

Visual presentation is a core acceptance criterion, not post-implementation polish. The first version is designed around three scenes:

1. **Strategy generation deck**: natural-language interaction, structured rules, parameters, and logic explanation.
2. **Historical replay theater**: automatic historical replay with prices, indicators, orders, and net value presented in sync; supports pause, speed-up, and skip.
3. **Results and comparison report**: a complete report of returns, drawdown, orders, per-asset results, and rule versions.

Adopt a dark institutional terminal style with cyan/blue and gold highlights, high-quality charts, and restrained animation. Automatic computation takes priority; per-day inspection is only an optional view and users are not required to click through day by day.

The confirmed presentation storyline and four-minute script are in [V3 Demo Visual Narrative](2026-10-27-v3-demo-visual-narrative.md).

## 4. Absolute boundary between SR and private investment tools

Stock-Race is for general simulation, strategy research, and related tool experiments only, and **will never connect to live trading, real broker order placement, or real account credentials**. Fixed securities and historical intervals serve only as research samples and do not constitute stock recommendations or actual buy/sell advice.

If tools involving specific stock recommendations, explicit buy/sell points, personalized operation advice, or real account features are ever developed for family members or specific users, they must be designed, reviewed, and managed as a **separate, privately used project**; SR must not add a live-trading adapter or breach this boundary in the name of a shared kernel. Whether a private project reuses generic technology must be re-authorized and re-validated within that separate project.
