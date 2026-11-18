import type { PortfolioScenario } from "./s4-helpers.js";
import { ALPHA, BETA, GAMMA, buildDraft, buildSnapshot, preparePortfolioScenario } from "./s4-helpers.js";
import type { StrategyDraft2 } from "../core/strategy/generated/strategy-draft-2.types.js";

const D1 = "2024-01-02";
const D2 = "2024-01-03";
const D3 = "2024-01-04";
const D4 = "2024-01-05";
const D5 = "2024-01-08";
export const DAYS = { D1, D2, D3, D4, D5 };
export const RANGE = { start: D1, end: D5 };

const entryAbove = (threshold: string): StrategyDraft2["entry"] => ({ gt: [{ ref: "close" }, { const: threshold }] });
const exitBelow = (threshold: string): StrategyDraft2["exits"] => [{ lt: [{ ref: "close" }, { const: threshold }] }];

/** A: first-come-first-served, simultaneous signals, authored order [beta, alpha] decides priority. */
export function scenarioFcfsSimultaneous(): PortfolioScenario {
  const alpha = buildSnapshot(ALPHA, [
    { date: D1, open: "10.00", close: "10.00" },
    { date: D2, open: "10.00", close: "11.00" },
    { date: D3, open: "11.00", close: "11.00" },
    { date: D4, open: "11.00", close: "12.00" },
    { date: D5, open: "12.00", close: "12.00" },
  ]);
  const beta = buildSnapshot(BETA, [
    { date: D1, open: "10.00", close: "10.00" },
    { date: D2, open: "10.00", close: "11.00" },
    { date: D3, open: "11.00", close: "11.00" },
    { date: D4, open: "11.00", close: "12.00" },
    { date: D5, open: "12.00", close: "12.00" },
  ]);
  const strategy = buildDraft({
    assets: [BETA, ALPHA],
    entry: entryAbove("5"),
    exits: exitBelow("0.5"),
    positionStopLossFraction: "0.08",
    portfolioStopFraction: "0.15",
    allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.40" } },
  });
  return preparePortfolioScenario({ strategy, snapshots: [alpha, beta], ...RANGE, initialCash: "10000.00" });
}

/** B: equal-split with three candidates and maxPositions 2: the third is rejected NO_FREE_POSITION_SLOT. */
export function scenarioEqualSplitSlots(): PortfolioScenario {
  const days = [
    { date: D1, open: "10.00", close: "10.00" },
    { date: D2, open: "10.00", close: "11.00" },
    { date: D3, open: "11.00", close: "11.00" },
    { date: D4, open: "11.00", close: "12.00" },
    { date: D5, open: "12.00", close: "12.00" },
  ];
  const alpha = buildSnapshot(ALPHA, days);
  const beta = buildSnapshot(BETA, days);
  const gamma = buildSnapshot(GAMMA, days);
  const strategy = buildDraft({
    assets: [ALPHA, BETA, GAMMA],
    entry: entryAbove("5"),
    exits: exitBelow("0.5"),
    positionStopLossFraction: "0.08",
    portfolioStopFraction: "0.15",
    allocation: { template: "equal-split@1", params: { maxPositions: 2 } },
  });
  return preparePortfolioScenario({ strategy, snapshots: [alpha, beta, gamma], ...RANGE, initialCash: "10000.00" });
}

/** C: first-come-first-served with a pool too small for the expensive asset (INSUFFICIENT_CASH). */
export function scenarioInsufficientCash(): PortfolioScenario {
  const beta = buildSnapshot(BETA, [
    { date: D1, open: "5.00", close: "5.00" },
    { date: D2, open: "5.00", close: "5.50" },
    { date: D3, open: "5.50", close: "5.50" },
    { date: D4, open: "5.50", close: "6.00" },
    { date: D5, open: "6.00", close: "6.00" },
  ]);
  const alpha = buildSnapshot(ALPHA, [
    { date: D1, open: "10.00", close: "10.00" },
    { date: D2, open: "10.00", close: "10.50" },
    { date: D3, open: "10.50", close: "10.50" },
    { date: D4, open: "10.50", close: "11.00" },
    { date: D5, open: "11.00", close: "11.00" },
  ]);
  const strategy = buildDraft({
    assets: [BETA, ALPHA],
    entry: entryAbove("5"),
    exits: exitBelow("0.5"),
    positionStopLossFraction: "0.08",
    portfolioStopFraction: "0.15",
    allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.40" } },
  });
  return preparePortfolioScenario({ strategy, snapshots: [beta, alpha], ...RANGE, initialCash: "2500.00" });
}

/** D: per-asset stop-loss forces a full exit at next open; re-entry afterwards is allowed. */
export function scenarioPositionStopLoss(): PortfolioScenario {
  const alpha = buildSnapshot(ALPHA, [
    { date: D1, open: "10.00", close: "10.00" },
    { date: D2, open: "10.00", close: "11.00" },
    { date: D3, open: "11.00", close: "9.10" },
    { date: D4, open: "9.00", close: "8.80" },
    { date: D5, open: "8.80", close: "8.80" },
  ]);
  const beta = buildSnapshot(BETA, [
    { date: D1, open: "1.00", close: "1.00" },
    { date: D2, open: "1.00", close: "1.00" },
    { date: D3, open: "1.00", close: "1.00" },
    { date: D4, open: "1.00", close: "1.00" },
    { date: D5, open: "1.00", close: "1.00" },
  ]);
  const strategy = buildDraft({
    assets: [ALPHA, BETA],
    entry: entryAbove("5"),
    exits: exitBelow("0.5"),
    positionStopLossFraction: "0.08",
    portfolioStopFraction: "0.15",
    allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.60" } },
  });
  return preparePortfolioScenario({ strategy, snapshots: [alpha, beta], ...RANGE, initialCash: "5000.00" });
}

/** E: portfolio stop-loss liquidates everything at next open and blocks new positions afterwards. */
export function scenarioPortfolioStop(): PortfolioScenario {
  const days = [
    { date: D1, open: "10.00", close: "10.00" },
    { date: D2, open: "10.00", close: "10.00" },
    { date: D3, open: "10.00", close: "7.00" },
    { date: D4, open: "6.90", close: "6.90" },
    { date: D5, open: "6.90", close: "6.90" },
  ];
  const alpha = buildSnapshot(ALPHA, days);
  const beta = buildSnapshot(BETA, days);
  const strategy = buildDraft({
    assets: [ALPHA, BETA],
    entry: entryAbove("5"),
    exits: exitBelow("0.5"),
    positionStopLossFraction: "0.08",
    portfolioStopFraction: "0.15",
    allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.60" } },
  });
  return preparePortfolioScenario({ strategy, snapshots: [alpha, beta], ...RANGE, initialCash: "10000.00" });
}

/** F: suspension — pending sell rejected SUSPENDED, no evaluation on suspended days, stale marks. */
export function scenarioSuspension(): PortfolioScenario {
  const alpha = buildSnapshot(ALPHA, [
    { date: D1, open: "10.00", close: "10.00" },
    { date: D2, open: "10.00", close: "16.00" },
    { date: D3, status: "suspended" },
    { date: D4, open: "15.90", close: "16.00" },
    { date: D5, open: "15.90", close: "11.80" },
  ]);
  const beta = buildSnapshot(BETA, [
    { date: D1, open: "10.00", close: "10.00" },
    { date: D2, open: "10.00", close: "11.00" },
    { date: D3, open: "11.00", close: "11.00" },
    { date: D4, status: "suspended" },
    { date: D5, open: "11.50", close: "11.50" },
  ]);
  const strategy = buildDraft({
    assets: [BETA, ALPHA],
    entry: entryAbove("5"),
    exits: [{ gt: [{ ref: "close" }, { const: "15" }] }],
    positionStopLossFraction: "0.08",
    portfolioStopFraction: "0.15",
    allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.40" } },
  });
  return preparePortfolioScenario({ strategy, snapshots: [beta, alpha], ...RANGE, initialCash: "10000.00" });
}

/** G: fractional exit size that leaves an odd lot is rejected (ODD_LOT_NOT_FULL_REMAINDER). */
export function scenarioOddLotExit(): PortfolioScenario {
  const alpha = buildSnapshot(ALPHA, [
    { date: D1, open: "10.00", close: "10.00" },
    { date: D2, open: "10.00", close: "11.00" },
    { date: D3, open: "11.00", close: "11.00" },
    { date: D4, open: "11.00", close: "11.00" },
    { date: D5, open: "11.00", close: "11.00" },
  ]);
  const beta = buildSnapshot(BETA, [
    { date: D1, open: "1.00", close: "1.00" },
    { date: D2, open: "1.00", close: "1.00" },
    { date: D3, open: "1.00", close: "1.00" },
    { date: D4, open: "1.00", close: "1.00" },
    { date: D5, open: "1.00", close: "1.00" },
  ]);
  const strategy = buildDraft({
    assets: [ALPHA, BETA],
    entry: entryAbove("5"),
    exits: [{ gt: [{ ref: "close" }, { const: "10.5" }] }],
    positionStopLossFraction: "0.08",
    portfolioStopFraction: "0.15",
    allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.80" } },
    exitPositionFraction: "0.5",
  });
  return preparePortfolioScenario({ strategy, snapshots: [alpha, beta], ...RANGE, initialCash: "5000.00" });
}

export const SCENARIOS = {
  fcfsSimultaneous: scenarioFcfsSimultaneous,
  equalSplitSlots: scenarioEqualSplitSlots,
  insufficientCash: scenarioInsufficientCash,
  positionStopLoss: scenarioPositionStopLoss,
  portfolioStop: scenarioPortfolioStop,
  suspension: scenarioSuspension,
  oddLotExit: scenarioOddLotExit,
} as const;
