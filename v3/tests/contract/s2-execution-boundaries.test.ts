import { describe, expect, it } from "vitest";
import { runBacktest } from "../../application/run-backtest/index.js";
import { calculateFees, maxAffordableBuyQuantity, validateSellQuantity } from "../../core/engine/profiles.js";
import { validateDataSnapshot } from "../../core/market/contract-validators.js";
import { basicInput, clone } from "../s2-helpers.js";
import { prepareFixtureRun } from "../../adapters/market/fixture/index.js";
import { readJsonFixture } from "../helpers.js";
import type { StrategyDraft } from "../../core/strategy/generated/strategy-draft.types.js";

describe("fees, lots and execution boundaries", () => {
  it("uses the frozen fee periods and component rounding", () => {
    expect(calculateFees("10.00", 100, "sell", "2023-08-27")).toEqual({
      price: "10.00", quantity: "100", amount: "1000.00", commission: "5.00", transferFee: "0.01", stampDuty: "1.00", total: "6.01",
    });
    expect(calculateFees("10.00", 100, "sell", "2023-08-28").total).toBe("5.51");
    expect(maxAffordableBuyQuantity("1000.00", "10.01", "2024-01-01")).toBe(0);
    expect(maxAffordableBuyQuantity("2000.00", "10.01", "2024-01-01")).toBe(100);
    expect(validateSellQuantity(50, 110)).toBe(false);
    expect(validateSellQuantity(110, 110)).toBe(true);
    expect(validateSellQuantity(100, 110)).toBe(true);
  });

  it("rejects fills before the supported fee period without a success report", () => {
    const input = basicInput();
    input.snapshot.sessions.forEach((session, index) => {
      session.date = `2022-04-0${index + 1}`;
      if (session.bar) session.bar.date = session.date;
    });
    input.snapshot.fixedRange = { start: "2022-04-01", end: "2022-04-06" };
    input.runSpec.data.start = "2022-04-01";
    input.runSpec.data.end = "2022-04-06";
    const result = runBacktest(prepareFixtureRun(input));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSUPPORTED_FEE_PERIOD");
  });

  it("allows low cash with explicit rejection and null buy-and-hold", () => {
    const input = basicInput();
    input.runSpec.account.initialCash = "1000.00";
    const result = runBacktest(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.metrics.tradeCount).toBe(0);
      expect(result.report.buyAndHold.reason).not.toBeNull();
    }
  });
});

describe("warmup, suspension and unknown missing data", () => {
  it("blocks insufficient warmup", () => {
    const input = basicInput();
    const warmed = prepareFixtureRun({ ...input, strategy: readJsonFixture("fixtures/strategy/valid/macd-kdj.json") as StrategyDraft });
    const result = runBacktest(warmed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INSUFFICIENT_WARMUP");
  });

  it("keeps confirmed suspension stale without fabricating an observation", () => {
    const input = basicInput();
    input.snapshot.sessions[1] = { date: "2024-01-02", status: "suspended" };
    const result = runBacktest(prepareFixtureRun(input));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.fills.some((fill) => (fill as { date: string }).date === "2024-01-02")).toBe(false);
      expect(result.events.some((event) => event.tradingDate === "2024-01-02" && event.type === "MarkToMarket" && event.reasonCodes.includes("STALE"))).toBe(true);
    }
  });

  it("fails unknown missing data without a success report", () => {
    const input = basicInput();
    input.snapshot.sessions[1] = { date: "2024-01-02", status: "missing" };
    const result = runBacktest(prepareFixtureRun(input));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_MARKET_DATA");
  });

  it("rejects corporate actions missing required dates", () => {
    const input = basicInput();
    input.snapshot.corporateActions = [{ type: "bonusIssue", recordDate: "2024-01-03", exDate: "2024-01-04", ratioNumerator: 1, ratioDenominator: 10 } as never];
    expect(validateDataSnapshot(input.snapshot).length).toBeGreaterThan(0);
  });
});
