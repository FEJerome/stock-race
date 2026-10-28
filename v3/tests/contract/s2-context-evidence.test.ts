import { describe, expect, it } from "vitest";
import { runBacktest } from "../../application/run-backtest/index.js";
import { prepareFixtureRun } from "../../adapters/market/fixture/index.js";
import type { StrategyDraft } from "../../core/strategy/generated/strategy-draft.types.js";
import type { DataSnapshot } from "../../core/market/types.js";
import { readJsonFixture } from "../helpers.js";
import { basicInput } from "../s2-helpers.js";

describe("current-session context and intent/fill evidence", () => {
  it("uses actual fill-session quantity, available cash and barsHeld=0", () => {
    const input = basicInput();
    const strategy = {
      ...input.strategy,
      exits: [{ all: [
        { gte: [{ ref: "position.quantity" }, { const: "100" }] },
        { eq: [{ ref: "position.state" }, { const: "1" }] },
        { eq: [{ ref: "account.availableCash" }, { const: "993.99" }] },
        { eq: [{ ref: "position.barsHeld" }, { const: "0" }] },
      ] }],
    } as StrategyDraft;
    const result = runBacktest(prepareFixtureRun({ ...input, strategy }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.fills.map((fill) => (fill as { date: string }).date).slice(0, 2)).toEqual(["2024-01-02", "2024-01-03"]);
    }
  });

  it("links intent, adjusted fill, cash and position refs across a downward gap", () => {
    const input = basicInput();
    input.snapshot.sessions[1]!.bar!.open = "8.00";
    const result = runBacktest(prepareFixtureRun(input));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const intent = result.events.find((event) => event.type === "OrderIntentCreated" && event.reasonCodes.includes("BUY_NEXT_SESSION"))!;
    const fill = result.events.find((event) => event.type === "OrderFilled" && event.reasonCodes.includes("BUY"))!;
    expect(result.report.fills[0]).toEqual(expect.objectContaining({ quantity: "200" }));
    expect(fill.reasonCodes).toContain("ORDER_SIZE_ADJUSTED");
    expect(intent.payload).toEqual(expect.objectContaining({ quantity: "100", estimatedPrice: "10.01", estimatedBudget: "2000.00" }));
    expect(fill.inputRefs.intent).toBe(intent.inputRefs.intent);
    expect(fill.payload).toEqual(expect.objectContaining({ intentQuantity: "100", quantity: "200", quantityReason: "OPEN_PRICE_OR_AVAILABLE_CASH_CHANGED" }));
    const fillRef = fill.inputRefs.fill;
    expect(result.events.some((event) => event.type === "CashChanged" && event.reasonCodes.includes("BUY_COST") && event.inputRefs.fill === fillRef && event.inputRefs.intent === intent.inputRefs.intent)).toBe(true);
    expect(result.events.some((event) => event.type === "PositionChanged" && event.reasonCodes.includes("BUY_UNSETTLED") && event.inputRefs.fill === fillRef && event.inputRefs.intent === intent.inputRefs.intent)).toBe(true);
  });

  it("uses flat state at the clear session so a new entry can form", () => {
    const input = basicInput();
    const strategy = {
      ...input.strategy,
      entry: { all: [{ eq: [{ ref: "position.state" }, { const: "0" }] }, { gt: [{ const: "1" }, { const: "0" }] }] },
      exits: [{ eq: [{ ref: "position.barsHeld" }, { const: "0" }] }],
    } as StrategyDraft;
    const result = runBacktest(prepareFixtureRun({ ...input, strategy }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const fills = result.report.fills as { date: string; side: string }[];
      expect(fills.slice(0, 2).map((fill) => fill.date)).toEqual(["2024-01-02", "2024-01-03"]);
      expect(fills.length).toBeGreaterThanOrEqual(3);
      expect(fills[2]).toEqual(expect.objectContaining({ side: "buy" }));
      expect(fills[2]!.date > "2024-01-03").toBe(true);
    }
  });

  it("starts buy-and-hold at the first strategy-eligible fill session after warmup", () => {
    const input = basicInput();
    const start = Date.UTC(2024, 0, 1);
    const dates = Array.from({ length: 40 }, (_value, index) => new Date(start + index * 86400000).toISOString().slice(0, 10));
    input.snapshot.sessions = dates.map((date, index) => ({
      date,
      status: "trading",
      bar: { date, open: index === 37 ? "18.00" : "10.00", high: "20.00", low: "1.00", close: "10.00", volume: "1000" },
    })) as DataSnapshot["sessions"];
    input.snapshot.fixedRange = { start: dates[0]!, end: dates[39]! };
    input.runSpec.data.start = dates[36]!;
    input.runSpec.data.end = dates[39]!;
    const result = runBacktest(prepareFixtureRun({
      ...input,
      strategy: readJsonFixture("fixtures/strategy/valid/macd-kdj.json") as StrategyDraft,
    }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.buyAndHold.finalEquity).toBe("1193.98");
  });
});
