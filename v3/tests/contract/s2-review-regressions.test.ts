import { describe, expect, it } from "vitest";
import { runBacktest } from "../../application/run-backtest/index.js";
import { prepareFixtureRun } from "../../adapters/market/fixture/index.js";
import type { StrategyDraft } from "../../core/strategy/generated/strategy-draft.types.js";
import { basicInput } from "../s2-helpers.js";
import { readJsonFixture } from "../helpers.js";

describe("independent review regressions", () => {
  it("preserves complete warmup status in failure and RunFailed event", () => {
    const input = basicInput();
    const result = runBacktest(prepareFixtureRun({
      ...input,
      strategy: readJsonFixture("fixtures/strategy/valid/macd-kdj.json") as StrategyDraft,
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const expected = {
      astMinimum: 36,
      extraObservations: 0,
      requiredPriorObservations: 36,
      actualPriorObservations: 0,
    };
    expect(result.error).toEqual(expect.objectContaining({ code: "INSUFFICIENT_WARMUP", details: expected }));
    const terminal = result.events.find((event) => event.type === "RunFailed")!;
    expect(terminal.payload).toEqual(expect.objectContaining(expected));
  });

  it("accepts zero-base corporate actions and emits exactly one successful terminal", () => {
    const input = basicInput();
    input.snapshot.corporateActions = [
      { type: "cashDividend", recordDate: "2024-01-01", exDate: "2024-01-02", payDate: "2024-01-03", cashPerShare: "1.00" },
      { type: "bonusIssue", recordDate: "2024-01-01", exDate: "2024-01-02", listingDate: "2024-01-03", ratioNumerator: 1, ratioDenominator: 10 },
    ];
    const result = runBacktest(prepareFixtureRun(input));
    expect(result.ok).toBe(true);
    expect(result.events.filter((event) => event.type === "RunCompleted")).toHaveLength(1);
    expect(result.events.filter((event) => event.type === "RunFailed")).toHaveLength(0);
  });

  it("records actual position on a suspended record date", () => {
    const input = basicInput();
    input.snapshot.sessions[2] = { date: "2024-01-03", status: "suspended" };
    input.snapshot.corporateActions = [
      { type: "cashDividend", recordDate: "2024-01-03", exDate: "2024-01-04", payDate: "2024-01-05", cashPerShare: "1.00" },
    ];
    const result = runBacktest(prepareFixtureRun(input));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.some((event) => event.type === "CorporateActionApplied" && event.payload && typeof event.payload === "object" && "quantity" in event.payload && event.payload.quantity === "100")).toBe(true);
      expect(result.events.some((event) => event.type === "CashChanged" && event.reasonCodes.includes("DIVIDEND_PAID"))).toBe(true);
    }
  });

  it("defers buy-and-hold past a suspended candidate and distinguishes no candidate", () => {
    const deferred = basicInput();
    deferred.snapshot.sessions[1] = { date: "2024-01-02", status: "suspended" };
    const deferredResult = runBacktest(prepareFixtureRun(deferred));
    expect(deferredResult.ok).toBe(true);
    if (deferredResult.ok) {
      expect(deferredResult.report.buyAndHold).toEqual({ finalEquity: "1893.99", cumulativeReturn: "-0.053005000000", reason: null });
    }

    const noCandidate = basicInput();
    noCandidate.runSpec.data.end = noCandidate.runSpec.data.start;
    const noCandidateResult = runBacktest(noCandidate);
    expect(noCandidateResult.ok).toBe(true);
    if (noCandidateResult.ok) {
      expect(noCandidateResult.report.buyAndHold.reason).toBe("NO_ELIGIBLE_FILL_SESSION");
    }
  });

  it("rejects negative snapshot Price with exact path before valuation", () => {
    const input = basicInput();
    input.snapshot.sessions[0]!.bar!.close = "-0.01";
    const result = runBacktest(prepareFixtureRun(input));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DECIMAL_NEGATIVE_VALUE");
      expect(result.error.path).toBe("/sessions/0/bar/close");
    }
  });

  it("links corporate actions and dividend payment to real snapshot inputs", () => {
    const input = basicInput();
    input.snapshot.corporateActions = [
      { type: "cashDividend", recordDate: "2024-01-03", exDate: "2024-01-04", payDate: "2024-01-05", cashPerShare: "1.234" },
    ];
    const result = runBacktest(prepareFixtureRun(input));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const action = result.events.find((event) => event.type === "CorporateActionApplied" && event.reasonCodes.includes("DIVIDEND_RECEIVABLE"))!;
    expect(action.inputRefs).toEqual(expect.objectContaining({
      snapshot: result.report.snapshotDigest,
      corporateAction: "cashDividend",
      recordDate: "2024-01-03",
      exDate: "2024-01-04",
    }));
    const paid = result.events.find((event) => event.type === "CashChanged" && event.reasonCodes.includes("DIVIDEND_PAID"))!;
    expect(paid.inputRefs).toEqual(expect.objectContaining({
      snapshot: result.report.snapshotDigest,
      corporateAction: "cashDividend",
      receivable: "123.40",
    }));
  });
});
