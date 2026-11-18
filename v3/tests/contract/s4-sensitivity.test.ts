import { describe, expect, it } from "vitest";
import { analyzeSensitivity } from "../../application/analyze-sensitivity/index.js";
import { confirmStrategy2 } from "../../application/confirm-strategy/index.js";
import { runPortfolio } from "../../application/run-portfolio/index.js";
import { runConfirmedPortfolio } from "../../application/run-confirmed/index.js";
import { digestJson } from "../../core/strategy/canonical/digest.js";
import { digestStrategyDraft2 } from "../../core/strategy/canonical/strategy-canonical-2.js";
import type { PortfolioRunInput, PortfolioRunResult } from "../../core/engine/portfolio/types.js";
import type { Report2 } from "../../core/strategy/generated/report-2.types.js";
import type { RunSpec2 } from "../../core/strategy/generated/run-spec-2.types.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import type { SensitivityReport } from "../../core/strategy/generated/sensitivity-report.types.js";
import { validateSensitivityReport } from "../../core/strategy/validation/schema-validator-2.js";
import { ALPHA, BETA, buildDraft } from "../s4-helpers.js";
import { SCENARIOS } from "../s4-scenarios.js";
import { tmpStrategyStore } from "../s3-helpers.js";

const FIXED_NOW = "2026-11-18T08:00:00.000Z";

async function confirmDraft(store: Parameters<typeof confirmStrategy2>[0], draft: StrategyDraft2) {
  const result = await confirmStrategy2(
    store,
    { currentDraft: draft, expectedDigest: digestStrategyDraft2(draft) },
    { now: () => FIXED_NOW },
  );
  if (!result.ok) throw new Error("must confirm");
  return result.confirmation;
}

function confirmedRunSpec(runSpec: RunSpec2, confirmation: { strategyId: string; revision: number; digest: string }): RunSpec2 {
  return {
    ...runSpec,
    strategy: { id: confirmation.strategyId, revision: confirmation.revision, digest: confirmation.digest },
  };
}

/** Stub runner: the first call is the base run, every later call a variant. */
function stubRun(baseMetrics: Report2["metrics"], variantMetrics: Report2["metrics"]) {
  let calls = 0;
  const inputs: PortfolioRunInput[] = [];
  const run = (input: PortfolioRunInput): PortfolioRunResult => {
    inputs.push(input);
    calls += 1;
    const metrics = calls === 1 ? baseMetrics : variantMetrics;
    return {
      ok: true,
      runDigest: digestJson(input.runSpec),
      events: [],
      report: { metrics } as Report2,
    };
  };
  return { run, inputs, calls: () => calls };
}

const METRICS = (cumulativeReturn: string, excessReturn: string | null): Report2["metrics"] => ({
  cumulativeReturn,
  maxDrawdown: "0.100000000000",
  tradeCount: 2,
  winRate: null,
  winRateReason: "NO_CLOSED_LOTS",
  excessReturn,
  excessReturnReason: excessReturn === null ? "BUY_AND_HOLD_UNAVAILABLE" : null,
});

describe("analyze-sensitivity: confirmation gate (only signed four-cell cards are analyzed)", () => {
  it("refuses an unconfirmed strategy", async () => {
    const { store } = tmpStrategyStore();
    const scenario = SCENARIOS.positionStopLoss();
    const result = await analyzeSensitivity(store, {
      runSpec: confirmedRunSpec(scenario.runSpec, { strategyId: "strategy-000099", revision: 1, digest: scenario.runSpec.strategy.digest }),
      snapshots: scenario.snapshots,
    });
    expect(result).toMatchObject({ ok: false, code: "STRATEGY_NOT_CONFIRMED" });
  });

  it("refuses a RunSpec whose digest differs from the confirmation", async () => {
    const { store } = tmpStrategyStore();
    const scenario = SCENARIOS.positionStopLoss();
    const confirmation = await confirmDraft(store, scenario.strategy);
    const result = await analyzeSensitivity(store, {
      runSpec: confirmedRunSpec(scenario.runSpec, { ...confirmation, digest: "sha256:" + "1".repeat(64) }),
      snapshots: scenario.snapshots,
    });
    expect(result).toMatchObject({ ok: false, code: "CONFIRMED_DIGEST_MISMATCH" });
  });
});

describe("analyze-sensitivity: end-to-end on the portfolio engine", () => {
  it("runs every viable variant as a complete deterministic run with its own runDigest", async () => {
    const { store } = tmpStrategyStore();
    const scenario = SCENARIOS.positionStopLoss();
    const confirmation = await confirmDraft(store, scenario.strategy);
    const runSpec = confirmedRunSpec(scenario.runSpec, confirmation);

    const result = await analyzeSensitivity(store, { runSpec, snapshots: scenario.snapshots });
    if (!result.ok) throw new Error(result.message);
    const { report, omitted } = result;

    expect(validateSensitivityReport(report)).toEqual([]);
    expect(report.sensitivityReportVersion).toBe("1.0.0");
    expect(report.strategyDigest).toBe(confirmation.digest);
    expect(report.strategyRevision).toBe(confirmation.revision);

    // 4 ratio params × 2 directions = 8 candidates; the exit-fraction up
    // variant (1.01) fails the (0, 1] domain and is omitted, never clamped.
    expect(report.variants).toHaveLength(7);
    expect(omitted).toEqual([
      { paramPath: "/position/exitSize/positionFraction", direction: "up", reason: "INVALID_POSITION_FRACTION" },
    ]);
    expect(report.variants.map((variant) => variant.paramPath)).toEqual([
      "/risk/positionStopLossFraction",
      "/risk/positionStopLossFraction",
      "/risk/portfolioStopFraction",
      "/risk/portfolioStopFraction",
      "/allocation/params/maxPerAssetCashFraction",
      "/allocation/params/maxPerAssetCashFraction",
      "/position/exitSize/positionFraction",
    ]);
    expect(report.variants.find((v) => v.paramPath === "/risk/positionStopLossFraction" && v.variantId.endsWith(":down")))
      .toMatchObject({ baseValue: "0.080000000000", perturbedValue: "0.070000000000" });

    // The base run digest is identical to a direct confirmed run: the
    // analysis reuses the frozen engine semantics and changes nothing.
    const direct = await runConfirmedPortfolio(store, {
      strategy: scenario.strategy,
      runSpec,
      snapshots: scenario.snapshots,
    });
    if (!direct.ok || !direct.result.ok) throw new Error("direct run must succeed");
    expect(report.baseRunDigest).toBe(direct.result.runDigest);
    for (const variant of report.variants) {
      expect(variant.runDigest).not.toBe(report.baseRunDigest);
    }

    // Reproducible: a second analysis is byte-identical.
    const again = await analyzeSensitivity(store, { runSpec, snapshots: scenario.snapshots });
    if (!again.ok) throw new Error("second analysis must succeed");
    expect(JSON.stringify(again.report)).toBe(JSON.stringify(report));
  });
});

describe("analyze-sensitivity: flip gate (翻天 = 策略不可信)", () => {
  async function setup(draft: StrategyDraft2) {
    const { store } = tmpStrategyStore();
    const scenario = SCENARIOS.positionStopLoss();
    const confirmation = await confirmDraft(store, draft);
    const runSpec = confirmedRunSpec(scenario.runSpec, confirmation);
    return { store, runSpec, snapshots: scenario.snapshots };
  }

  function flipScenarioDraft(): StrategyDraft2 {
    return buildDraft({
      assets: [ALPHA, BETA],
      entry: { gt: [{ ref: "close" }, { const: "5" }] },
      exits: [{ lt: [{ ref: "close" }, { const: "0.5" }] }],
      positionStopLossFraction: "0.08",
      portfolioStopFraction: "0.15",
      allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.40" } },
    });
  }

  it("a cumulative-return sign flip forces the untrustworthy verdict with an explicit reason", async () => {
    const { store, runSpec, snapshots } = await setup(flipScenarioDraft());
    const stub = stubRun(METRICS("0.050000000000", "0.020000000000"), METRICS("-0.010000000000", "-0.005000000000"));
    const result = await analyzeSensitivity(store, { runSpec, snapshots }, { run: stub.run });
    if (!result.ok) throw new Error("must analyze");
    expect(result.report.verdict).toEqual({
      trustworthy: false,
      flippedVariantCount: result.report.variants.length,
      reasons: ["CUMULATIVE_RETURN_SIGN_FLIP", "EXCESS_RETURN_REVERSAL"],
    });
    expect(result.report.variants.every((variant) => variant.flip.cumulativeReturnSignChanged)).toBe(true);
    expect(result.report.variants.every((variant) => variant.flip.excessReturnReversed)).toBe(true);
  });

  it("no flip → trustworthy; null excess return can never count as a reversal", async () => {
    const { store, runSpec, snapshots } = await setup(flipScenarioDraft());
    const stub = stubRun(METRICS("0.050000000000", null), METRICS("0.040000000000", null));
    const result = await analyzeSensitivity(store, { runSpec, snapshots }, { run: stub.run });
    if (!result.ok) throw new Error("must analyze");
    expect(result.report.verdict).toEqual({ trustworthy: true, flippedVariantCount: 0, reasons: [] });
    expect(result.report.variants.every((variant) => !variant.flip.excessReturnReversed)).toBe(true);
  });

  it("perturbs at most 8 variants, indicators first in sorted order", async () => {
    const draft = {
      ...flipScenarioDraft(),
      indicators: {
        m: { use: "macd@1", params: { fast: 12, slow: 26, signal: 9 } },
        k: { use: "kdj@1", params: { period: 9, kSmooth: 3, dSmooth: 3 } },
      },
    } as StrategyDraft2;
    const { store, runSpec, snapshots } = await setup(draft);
    const stub = stubRun(METRICS("0.050000000000", null), METRICS("0.040000000000", null));
    const result = await analyzeSensitivity(store, { runSpec, snapshots }, { run: stub.run });
    if (!result.ok) throw new Error("must analyze");
    expect(result.report.variants).toHaveLength(8);
    expect(result.report.variants.map((variant) => variant.variantId)).toEqual([
      "v1:/indicators/k/params/dSmooth:down",
      "v2:/indicators/k/params/dSmooth:up",
      "v3:/indicators/k/params/kSmooth:down",
      "v4:/indicators/k/params/kSmooth:up",
      "v5:/indicators/k/params/period:down",
      "v6:/indicators/k/params/period:up",
      "v7:/indicators/m/params/fast:down",
      "v8:/indicators/m/params/fast:up",
    ]);
    expect(result.report.variants[0]).toMatchObject({ baseValue: 3, perturbedValue: 2 });
    expect(result.report.variants[1]).toMatchObject({ baseValue: 3, perturbedValue: 4 });
    // risk / allocation / exit params exist but fall beyond the cap — and are
    // never reached, so they are not listed as omitted either.
    expect(result.omitted).toEqual([]);
  });

  it("omitted variants are listed with their rejection reason (never silently dropped)", async () => {
    const draft = buildDraft({
      assets: [ALPHA, BETA],
      entry: { gt: [{ ref: "close" }, { const: "5" }] },
      exits: [{ lt: [{ ref: "close" }, { const: "0.5" }] }],
      positionStopLossFraction: "0.01",
      portfolioStopFraction: "0.15",
      allocation: { template: "equal-split@1", params: { maxPositions: 2 } },
    });
    const { store, runSpec, snapshots } = await setup(draft);
    const stub = stubRun(METRICS("0.050000000000", null), METRICS("0.040000000000", null));
    const result = await analyzeSensitivity(store, { runSpec, snapshots }, { run: stub.run });
    if (!result.ok) throw new Error("must analyze");
    // risk down (0.01 → 0) breaks the (0, 1) open interval; equal-split down
    // (2 → 1) breaks [2, 5] and up (2 → 3) exceeds the 2-asset universe;
    // exit up (1.00 → 1.01) breaks (0, 1].
    expect(result.omitted).toEqual([
      { paramPath: "/risk/positionStopLossFraction", direction: "down", reason: "INVALID_STOP_LOSS_FRACTION" },
      { paramPath: "/allocation/params/maxPositions", direction: "down", reason: "INVALID_ALLOCATION_PARAM" },
      { paramPath: "/allocation/params/maxPositions", direction: "up", reason: "INVALID_ALLOCATION_PARAM" },
      { paramPath: "/position/exitSize/positionFraction", direction: "up", reason: "INVALID_POSITION_FRACTION" },
    ]);
    expect(result.report.variants.map((variant) => `${variant.paramPath}:${variant.variantId.endsWith(":down") ? "down" : "up"}`))
      .toEqual([
        "/risk/positionStopLossFraction:up",
        "/risk/portfolioStopFraction:down",
        "/risk/portfolioStopFraction:up",
        "/position/exitSize/positionFraction:down",
      ]);
  });

  it("variant runs receive the perturbed strategy with its own digest in the RunSpec", async () => {
    const { store, runSpec, snapshots } = await setup(flipScenarioDraft());
    const stub = stubRun(METRICS("0.050000000000", null), METRICS("0.040000000000", null));
    const result = await analyzeSensitivity(store, { runSpec, snapshots }, { run: stub.run });
    if (!result.ok) throw new Error("must analyze");
    expect(stub.inputs.length).toBe(1 + result.report.variants.length);
    for (const [index, input] of stub.inputs.slice(1).entries()) {
      expect(input.runSpec.strategy.digest).toBe(digestStrategyDraft2(input.strategy));
      expect(digestJson(input.runSpec)).toBe(result.report.variants[index]!.runDigest);
    }
  });
});
