import type { Report, RunEvent } from "../market/types.js";
import { digestJson } from "../strategy/canonical/digest.js";
import { formatFinancialRate, internalDivide, internalSubtract } from "../strategy/canonical/rounding-profile.js";
import type { Simulation, StockRunInput } from "../engine/types.js";
import { calculateFifoBatchOutcomes } from "./fifo.js";
import { calculateCumulativeReturn, calculateCurrentDrawdown, calculateMaxDrawdown } from "./metrics.js";
import { validateReport } from "../market/contract-validators.js";
import { ContractError } from "../strategy/canonical/errors.js";

export function buildStockReport(
  input: StockRunInput,
  main: Simulation,
  buyHold: Simulation,
  events: readonly RunEvent[],
  runDigest: string,
): Report {
  const daily = main.daily.map((day, index) => ({
    ...day,
    drawdown: calculateCurrentDrawdown(main.equitySeries.slice(0, index + 2)),
  }));
  const outcomes = calculateFifoBatchOutcomes(main.fills, input.snapshot.corporateActions);
  const wins = outcomes.filter((outcome) => outcome.winning).length;
  const winRate = outcomes.length > 0 ? formatFinancialRate(internalDivide(String(wins), String(outcomes.length))) : null;
  const buyHoldStarted = buyHold.fills.some((fill) => fill.side === "buy");
  const buyHoldReturn = buyHoldStarted ? calculateCumulativeReturn(input.runSpec.account.initialCash, buyHold.finalEquity) : null;
  const strategyReturn = calculateCumulativeReturn(input.runSpec.account.initialCash, main.finalEquity);
  const base = {
    reportVersion: "1.0.0" as const,
    runDigest,
    strategyDigest: input.runSpec.strategy.digest,
    snapshotDigest: input.snapshot.digest,
    range: { start: input.runSpec.data.start, end: input.runSpec.data.end },
    initialCash: input.runSpec.account.initialCash,
    finalEquity: main.finalEquity,
    metrics: {
      cumulativeReturn: strategyReturn,
      maxDrawdown: calculateMaxDrawdown(main.equitySeries),
      tradeCount: main.fills.length,
      winRate,
      winRateReason: outcomes.length === 0 ? "NO_CLOSED_BATCHES" : null,
      excessReturn: buyHoldReturn === null ? null : formatFinancialRate(internalSubtract(strategyReturn, buyHoldReturn)),
      excessReturnReason: buyHoldReturn === null ? "BUY_AND_HOLD_UNAVAILABLE" : null,
    },
    daily,
    orders: main.orders,
    fills: main.fills,
    rejections: main.rejections,
    fees: main.fees,
    cash: main.cash,
    position: main.position,
    buyAndHold: {
      finalEquity: buyHoldStarted ? buyHold.finalEquity : null,
      cumulativeReturn: buyHoldReturn,
      reason: buyHoldStarted ? null : "NO_AFFORDABLE_STARTING_LOT",
    },
    assumptions: [
      "cn-stock-demo-fee@1",
      "cn-stock-one-tick@1",
      "cn-stock-settlement@1",
      "cn-stock-report@1",
      "DIVIDEND_TAX_NOT_SIMULATED",
      "SYNTHETIC_DEMO_ONLY_NOT_LIVE_TRADING",
    ],
    warnings: main.fills.length === 0 ? ["NO_FILLS"] : [],
    eventDigest: digestJson(events),
  };
  const report = { ...base, reportDigest: digestJson(base) };
  const issues = validateReport(report);
  if (issues.length > 0) throw new ContractError(issues[0]!.code, issues[0]!.message, issues[0]!.path);
  return report;
}
