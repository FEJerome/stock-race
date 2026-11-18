import { describe, expect, it } from "vitest";
import { runPortfolio } from "../../application/run-portfolio/index.js";
import { validateRunEvent } from "../../core/market/contract-validators.js";
import { validateReport2 } from "../../core/strategy/validation/schema-validator-2.js";
import { normalizeRunSpec2 } from "../../core/market/run-spec-2.js";
import { digestJson } from "../../core/strategy/canonical/digest.js";
import { InternalDecimal, internalAdd } from "../../core/strategy/canonical/rounding-profile.js";
import type { RunEvent } from "../../core/market/types.js";
import { readJsonFixture } from "../helpers.js";
import { clone, toRunInput } from "../s4-helpers.js";
import { SCENARIOS } from "../s4-scenarios.js";

const golden = readJsonFixture("golden/s4-portfolio-run.json") as Record<string, Record<string, unknown>>;

function run(name: keyof typeof SCENARIOS) {
  const result = runPortfolio(toRunInput(SCENARIOS[name]()));
  expect(result.ok, `${name} must succeed`).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

describe("S4 portfolio engine golden scenarios (hand-calculated, see s4-portfolio-hand-calc.md)", () => {
  for (const name of Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]) {
    it(`${name}: fills, rejections, daily, metrics, fees, positions, assets and buyAndHold match the frozen golden`, () => {
      const result = run(name);
      const expected = golden[name]!;
      const report = result.report;
      expect(report.fills).toEqual(expected.fills);
      expect(report.rejections).toEqual(expected.rejections);
      expect(report.daily).toEqual(expected.daily);
      expect(report.metrics).toEqual(expected.metrics);
      expect(report.fees).toEqual(expected.fees);
      expect(report.cash).toEqual(expected.cash);
      expect(report.positions).toEqual(expected.positions);
      expect(report.assets).toEqual(expected.assets);
      expect(report.buyAndHold).toEqual(expected.buyAndHold);
      expect(report.assumptions).toEqual(expected.assumptions);
      expect(report.warnings).toEqual(expected.warnings);
      expect(report.finalEquity).toBe(expected.finalEquity);
      expect(result.runDigest).toBe(expected.runDigest);
      expect(validateReport2(report)).toEqual([]);
      result.events.forEach((event) => expect(validateRunEvent(event)).toEqual([]));
    });
  }

  it("is byte-stable across repeated runs and insensitive to runSpec array order", () => {
    const scenario = SCENARIOS.fcfsSimultaneous();
    const first = runPortfolio(toRunInput(scenario));
    const second = runPortfolio(toRunInput(clone(scenario)));
    expect(second).toEqual(first);

    const reordered = clone(scenario);
    reordered.runSpec.assets = [...reordered.runSpec.assets].reverse() as typeof reordered.runSpec.assets;
    reordered.runSpec.data.snapshots = [...reordered.runSpec.data.snapshots].reverse() as typeof reordered.runSpec.data.snapshots;
    const third = runPortfolio(toRunInput(reordered));
    expect(third.runDigest).toBe(first.runDigest);
    expect(third).toEqual(first);
  });

  it("runDigest is the digest of the canonical normalized run spec (independent recomputation)", () => {
    const scenario = SCENARIOS.fcfsSimultaneous();
    const result = runPortfolio(toRunInput(scenario));
    expect(result.runDigest).toBe(digestJson(normalizeRunSpec2(scenario.runSpec)));
  });

  it("simultaneous signals resolve in authored universe order (first-come-first-served)", () => {
    const result = run("fcfsSimultaneous");
    const intents = result.events.filter((event) => event.type === "OrderIntentCreated");
    expect(intents.map((event) => event.inputRefs.asset)).toEqual(["stock:synthetic.beta", "stock:synthetic.alpha"]);
    expect(result.report.fills.map((fill) => (fill as { assetId: string }).assetId)).toEqual([
      "stock:synthetic.beta",
      "stock:synthetic.alpha",
    ]);
  });
});

describe("S4 portfolio engine event ledger auditability", () => {
  it("recomputes every event hash and the report digests independently", () => {
    const result = run("portfolioStop");
    let previous = `sha256:${"0".repeat(64)}`;
    result.events.forEach((event, index) => {
      expect(event.seq).toBe(index);
      expect(event.previousEventHash).toBe(previous);
      const { eventHash, ...content } = event as RunEvent & { eventHash: string };
      expect(digestJson(content)).toBe(eventHash);
      previous = eventHash;
    });
    expect(result.report.eventDigest).toBe(digestJson(result.events));
    const { reportDigest, ...reportContent } = result.report;
    expect(digestJson(reportContent)).toBe(reportDigest);
  });

  it("independently recomputes positions and equity from snapshots and fills (ledger reconciliation)", () => {
    for (const name of ["fcfsSimultaneous", "positionStopLoss", "portfolioStop", "suspension"] as const) {
      const scenario = SCENARIOS[name]();
      const result = run(name);
      const report = result.report;

      // Position conservation: ending totals equal buys minus sells per asset.
      for (const summary of report.assets) {
        const fills = report.fills.filter((fill) => (fill as { assetId: string }).assetId === summary.assetId) as
          { side: "buy" | "sell"; quantity: string }[];
        const net = fills.reduce((sum, fill) => sum + (fill.side === "buy" ? Number(fill.quantity) : -Number(fill.quantity)), 0);
        expect(net, `${name}/${summary.assetId} position conservation`).toBe(Number(summary.endingPosition.total));
      }

      // Cash conservation: buckets never negative, total equals the sum of parts, and
      // equity equals cash plus independently marked positions on every day.
      for (const day of report.daily) {
        for (const bucket of [day.cash.available, day.cash.reserved, day.cash.unsettled, day.cash.receivable]) {
          expect(new InternalDecimal(bucket).gte(0), `${name}/${day.date} negative cash bucket`).toBe(true);
        }
        const parts = [day.cash.available, day.cash.reserved, day.cash.unsettled, day.cash.receivable]
          .reduce((sum, value) => internalAdd(sum, value), new InternalDecimal(0));
        expect(day.cash.total).toBe(parts.toFixed(2));

        const positionValue = day.positions.reduce((sum, position) => {
          const snapshot = scenario.snapshots.find((candidate) => candidate.assetIdentity.assetId === position.assetId)!;
          const mark = snapshot.sessions
            .filter((session) => session.date <= day.date && session.status === "trading" && session.bar)
            .at(-1)?.bar?.close ?? "0.00";
          return internalAdd(sum, new InternalDecimal(mark).mul(position.total));
        }, new InternalDecimal(0));
        const equity = internalAdd(day.cash.total, positionValue);
        expect(day.equity, `${name}/${day.date} equity reconciliation`).toBe(equity.toFixed(2));
      }
    }
  });
});

describe("S4 portfolio stop-loss auditability", () => {
  it("records the portfolio stop trigger and blocks all subsequent buy intents", () => {
    const result = run("portfolioStop");
    const trigger = result.events.find((event) => event.reasonCodes.includes("PORTFOLIO_STOP_LOSS") && event.type === "MetricComputed");
    expect(trigger?.tradingDate).toBe("2024-01-04");
    const triggerSeq = trigger!.seq;
    const laterBuyIntents = result.events.filter((event) =>
      event.seq > triggerSeq && event.type === "OrderIntentCreated" && event.reasonCodes.includes("BUY_NEXT_SESSION"));
    expect(laterBuyIntents).toEqual([]);
    const liquidation = result.events.filter((event) =>
      event.type === "OrderIntentCreated" && event.reasonCodes.includes("PORTFOLIO_STOP_LOSS"));
    expect(liquidation.map((event) => event.inputRefs.asset)).toEqual(["stock:synthetic.alpha", "stock:synthetic.beta"]);
    for (const event of liquidation) {
      expect(event.reasonCodes).toContain("POSITION_STOP_LOSS");
    }
  });

  it("counts per-asset stop-loss triggers in the report assets section", () => {
    const result = run("positionStopLoss");
    const alpha = result.report.assets.find((summary) => summary.assetId === "stock:synthetic.alpha")!;
    expect(alpha.positionStopLossTriggers).toBe(1);
    const stopIntent = result.events.find((event) =>
      event.type === "OrderIntentCreated" && event.reasonCodes.includes("POSITION_STOP_LOSS"));
    expect(stopIntent?.inputRefs.asset).toBe("stock:synthetic.alpha");
  });
});

describe("S4 suspension semantics", () => {
  it("emits no evaluations on suspended days and marks stale positions explicitly", () => {
    const result = run("suspension");
    const evaluations = result.events.filter((event) => event.type === "SignalEvaluated");
    expect(evaluations.some((event) => event.tradingDate === "2024-01-04" && event.inputRefs.asset === "stock:synthetic.alpha")).toBe(false);
    expect(evaluations.some((event) => event.tradingDate === "2024-01-05" && event.inputRefs.asset === "stock:synthetic.beta")).toBe(false);

    const staleMarks = result.events.filter((event) => event.type === "MarkToMarket" && event.reasonCodes.includes("STALE"));
    expect(staleMarks.some((event) => event.tradingDate === "2024-01-04" && event.inputRefs.asset === "stock:synthetic.alpha")).toBe(true);
    expect(staleMarks.some((event) => event.tradingDate === "2024-01-05" && event.inputRefs.asset === "stock:synthetic.beta")).toBe(true);

    const suspendedRejection = result.report.rejections.find((rejection) => (rejection as { reason: string }).reason === "SUSPENDED");
    expect(suspendedRejection).toMatchObject({ assetId: "stock:synthetic.alpha", date: "2024-01-04", side: "sell" });
  });
});
