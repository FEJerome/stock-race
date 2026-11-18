import type { RunEvent } from "../market/types.js";
import type { Report2 } from "../strategy/generated/report-2.types.js";
import { digestJson } from "../strategy/canonical/digest.js";
import { formatFinancialRate, internalDivide, internalSubtract } from "../strategy/canonical/rounding-profile.js";
import { ContractError } from "../strategy/canonical/errors.js";
import { validateReport2 } from "../strategy/validation/schema-validator-2.js";
import type { PortfolioRunInput, PortfolioSimulation } from "../engine/portfolio/types.js";
import { calculateFifoBatchOutcomes, type BatchOutcome } from "./fifo.js";
import { calculateCumulativeReturn, calculateCurrentDrawdown, calculateMaxDrawdown } from "./metrics.js";

export function finalizePortfolioReport(report: Report2, events: readonly RunEvent[]): Report2 {
  const { reportDigest: _previousDigest, ...content } = report;
  const base = { ...content, eventDigest: digestJson(events) };
  const finalized = { ...base, reportDigest: digestJson(base) };
  const issues = validateReport2(finalized);
  if (issues.length > 0) throw new ContractError(issues[0]!.code, issues[0]!.message, issues[0]!.path);
  return finalized;
}

/**
 * Report 2.0.0 assembly (contract §12.7): every 1.0.0 field semantic is preserved at
 * portfolio level; per-asset detail lives in assets[] with explicit assetId attribution;
 * the buy-and-hold benchmark is computed per asset under the same assumptions (equal
 * cash split, same fills/settlement rules) and aggregated into the single block.
 */
export function buildPortfolioReport(
  input: PortfolioRunInput,
  main: PortfolioSimulation,
  buyHold: PortfolioSimulation,
  events: readonly RunEvent[],
  runDigest: string,
): Report2 {
  const daily = main.daily.map((day, index) => ({
    date: day.date,
    equity: day.equity,
    drawdown: calculateCurrentDrawdown(main.equitySeries.slice(0, index + 2)),
    cash: day.cash,
    positions: [...day.positions]
      .sort((left, right) => (left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0))
      .map((position) => ({ ...position })),
  }));

  // Win rate: FIFO batch outcomes computed per asset (fills and corporate actions of that
  // asset only), then merged into the single portfolio-level win rate (§12.7).
  const outcomes: BatchOutcome[] = input.runSpec.assets.flatMap((asset) => {
    const snapshot = input.snapshots.find((candidate) => candidate.assetIdentity.assetId === asset.assetId)!;
    const assetFills = main.fills.filter((fill) => fill.assetId === asset.assetId);
    return calculateFifoBatchOutcomes(assetFills, snapshot.corporateActions);
  });
  const wins = outcomes.filter((outcome) => outcome.winning).length;
  const winRate = outcomes.length > 0 ? formatFinancialRate(internalDivide(String(wins), String(outcomes.length))) : null;

  const buyHoldStarted = buyHold.fills.some((fill) => fill.side === "buy");
  const buyHoldReturn = buyHoldStarted ? calculateCumulativeReturn(input.runSpec.account.initialCash, buyHold.finalEquity) : null;
  const strategyReturn = calculateCumulativeReturn(input.runSpec.account.initialCash, main.finalEquity);

  const finalDay = main.daily.at(-1);
  const positions = (finalDay?.positions ?? [])
    .map((position) => ({ ...position }))
    .sort((left, right) => (left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0));

  const base = {
    reportVersion: "2.0.0" as const,
    runDigest,
    strategyDigest: input.runSpec.strategy.digest,
    snapshots: input.runSpec.data.snapshots.map((binding) => ({ ...binding })),
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
    assets: [...main.perAsset]
      .sort((left, right) => (left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0))
      .map((summary) => ({
        assetId: summary.assetId,
        fillCount: summary.fillCount,
        fees: summary.fees,
        endingPosition: summary.endingPosition,
        positionStopLossTriggers: summary.positionStopLossTriggers,
      })),
    orders: main.orders.map((order) => ({ ...order })),
    fills: main.fills.map((fill) => ({ ...fill })),
    rejections: main.rejections.map((rejection) => ({ ...rejection })),
    fees: main.fees,
    cash: finalDay?.cash ?? { available: input.runSpec.account.initialCash, reserved: "0.00", unsettled: "0.00", receivable: "0.00", total: input.runSpec.account.initialCash },
    positions,
    buyAndHold: {
      finalEquity: buyHoldStarted ? buyHold.finalEquity : null,
      cumulativeReturn: buyHoldReturn,
      reason: buyHoldStarted ? null : buyHold.buyHoldReason,
    },
    assumptions: [
      "cn-stock-demo-fee@1",
      "cn-stock-one-tick@1",
      "cn-stock-settlement@1",
      "cn-stock-report@1",
      input.strategy.allocation.template,
      "DIVIDEND_TAX_NOT_SIMULATED",
      "SYNTHETIC_DEMO_ONLY_NOT_LIVE_TRADING",
    ],
    warnings: main.fills.length === 0 ? ["NO_FILLS"] : [],
    eventDigest: digestJson(events),
  };
  const report = { ...base, reportDigest: digestJson(base) } as unknown as Report2;
  const issues = validateReport2(report);
  if (issues.length > 0) throw new ContractError(issues[0]!.code, issues[0]!.message, issues[0]!.path);
  return report;
}
