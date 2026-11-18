# S4 Portfolio Golden — Hand-Calculation Audit Table

This document is the PR-2 hand-review table for `s4-portfolio-run.json`. Every frozen
number was computed by hand from the contract rules (chapter 12 + §7.2.3 fee/settlement
profiles) before the engine output was accepted as golden. Fee rule recap: fill price =
open ± 0.01 tick; lot = 100 shares; commission = max(0.00025 × amount, 5.00);
transfer = 0.00001 × amount; stamp (sell only, dates ≥ 2023-08-28) = 0.0005 × amount;
money quantized HALF_UP at scale 2.

Scenario key: D1=2024-01-02 … D5=2024-01-08 (all dates ≥ fee floor 2022-04-29).

## A. fcfsSimultaneous — first-come-first-served, simultaneous signals

Universe authored `[beta, alpha]`; cash 10000.00; cap = 0.40 × 10000 = 4000 per asset.
Both assets signal entry at D1 close (close 10 > 5): simultaneous signals resolve in
authored order — beta's intent (intent-1) precedes alpha's (intent-2).

- D1 close: estimate 10.01 → floor(4000 / 1001) = 3 lots → 300 shares; cost = 300×10.01
  + 5.00 + 0.03 = 3008.03 reserved per asset; available 10000 − 6016.06 = 3983.94.
- D2 open (10.00): both fill 300 @10.01, cost 3008.03 each; fees per asset 5.03.
- Final equity = 3983.94 + 300×12 + 300×12 = **11183.94**; return 0.118394; maxDD 0.
- B&H (cap 5000 each): 400 @10.01 each → 1981.92 + 400×12×2 = **11581.92** → excess −0.039798.

## B. equalSplitSlots — equal-split, maxPositions 2, three candidates

Cash 10000; freeSlots = 2 → per-slot budget 5000. Authored `[alpha, beta, gamma]`.

- D1: alpha 400 shares (4004.00 + 5.04 = 4009.04), beta 400; gamma → NO_FREE_POSITION_SLOT
  (repeated D1–D4; D5 is the last day so no intents are created).
- Final equity = 1981.92 + 800×12 = **11581.92**.
- B&H (cap 3333.33 each): 300 @10.01 ×3 → 975.91 + 900×12 = **11775.91**.

## C. insufficientCash — pool too small for the expensive asset

Cash 2500; cap = 0.40 × pool. beta closes 5.00 on D1 (entry `close > 5` false), 5.50 on D2.

- D1: alpha (close 10) → floor(1000 / 1001) = 0 → INSUFFICIENT_CASH (repeats D1–D4).
- D2: beta (close 5.50) → floor(1000 / 551) = 1 → 100 shares reserved 556.01.
- D3 open 5.50: beta fills 100 @5.51 (551.00 + 5.01 = 556.01); available 1943.99.
- Final equity = 1943.99 + 100×6.00 = **2543.99**; maxDD 0.002404 (D3 dip to 2493.99).
- B&H (cap 1250): beta 200 @5.01, alpha 100 @10.01 → 486.98 + 1200 + 1100 = **2786.98**.

## D. positionStopLoss — per-asset stop forces full exit; re-entry allowed

Cash 5000; cap = 0.60 × pool = 3000; positionStopLossFraction 0.08 → threshold 10.01×0.92
= 9.2092.

- D1: alpha 200 @ est 10.01 reserved 2007.02; D2 fills 200 @10.01.
- D3 close 9.10 < 9.2092 → POSITION_STOP_LOSS intent for the full 200 (triggers = 1).
- D4 open 9.00: sell 200 @8.99 → 1798.00 − (5.00 + 0.02 + 0.90) = 1792.08 unsettled.
- D4 close 8.80 > 5: re-entry candidate (position stop does not ban re-entry) → budget
  min(0.6 × 4785.06 = 2871.04, 2992.98) → 300 shares reserved 2648.03.
- D5: settle 1792.08; fill 300 @8.81 (2643.00 + 5.03); available 2137.03.
- Final equity = 2137.03 + 300×8.80 = **4777.03**; maxDD (5192.98 − 4777.03)/5192.98 =
  0.080098517614.
- B&H (cap 2500 each): alpha 200 @10.01, beta 2400 @1.01 → 563.96 + 1760 + 2400 = **4723.96**.

## E. portfolioStop — portfolio stop liquidates all and blocks new entries

Cash 10000; cap = 6000. alpha 500 (5010.05), beta 400 (4009.04) filled D2 @10.01.

- D3 close 7.00: equity = 980.91 + 900×7 = 7280.91; drawdown from peak 10000 = 0.271909
  ≥ 0.15 → PORTFOLIO_STOP_LOSS (MetricComputed). Both assets also breach the per-asset
  threshold (7.00 < 9.2092), so intents carry POSITION_STOP_LOSS + PORTFOLIO_STOP_LOSS.
- D4 open 6.90: alpha sells 500 @6.89 → 3445.00 − 6.75 = 3438.25; beta 400 → 2756.00 −
  6.41 = 2749.59; unsettled 6187.84.
- D4/D5: entry signals (6.90 > 5) are suppressed — no buy intents after the trigger.
- Final equity = 980.91 + 6187.84 = **7168.75**; return −0.283125; B&H **7501.92**.

## F. suspension — no fills/evaluation on suspended days, stale marks

Authored `[beta, alpha]`; both buy 300 @10.01 on D2. alpha exits (close 16 > 15) at D2
close → sell intent; D3 alpha suspended → SUSPENDED rejection; D4 re-signals → sell
intent; D5 open 15.90 → fill 300 @15.89 = 4767.00 − (5.00 + 0.05 + 2.38) = 4759.57.

- No SignalEvaluated for alpha on D3 / beta on D4; MarkToMarket carries STALE those days.
- Final equity = 3983.94 + 4759.57 (unsettled) + 300×11.50 = **12193.51**.
- B&H (cap 5000 each): 400 @10.01 each → 1981.92 + 400×11.80 + 400×11.50 = **11301.92**.

## G. oddLotExit — fractional exit leaving an odd lot is rejected

Cash 5000; cap = 0.80 × 5000 = 4000 → alpha 300 @10.01 filled D2. exitSize fraction 0.5 →
floor(300 × 0.5) = 150, neither a lot multiple nor the full remainder →
ODD_LOT_NOT_FULL_REMAINDER at D2–D4 closes.

- Final equity = 1991.97 + 300×11 = **5291.97**.
- B&H (cap 2500 each): alpha 200 @10.01 (2007.02), beta 2400 @1.01 (2429.02) →
  563.96 + 2200 + 2400 = **5163.96**.
