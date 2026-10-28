import { describe, expect, it } from "vitest";
import { runBacktest } from "../../application/run-backtest/index.js";
import { validateReport, validateRunEvent } from "../../core/market/contract-validators.js";
import { basicInput } from "../s2-helpers.js";
import { readJsonFixture } from "../helpers.js";

const golden = readJsonFixture("golden/s2-basic-run.json") as Record<string, any>;

describe("S2 basic hand-calculated run", () => {
  it("matches fills, fees, daily four-bucket cash, positions and report metrics", () => {
    const result = runBacktest(basicInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.fills).toEqual(golden.fills);
    expect(result.report.daily).toEqual(golden.daily);
    expect(result.report.metrics).toEqual(golden.metrics);
    expect(result.report.fees).toEqual(golden.fees);
    expect(result.report.cash.total).toBe(golden.final.cash);
    expect(result.report.finalEquity).toBe(golden.final.equity);
    expect(result.report.position.total).toBe(golden.final.position);
    expect(result.report.buyAndHold).toEqual(golden.buyAndHold);
    expect(validateReport(result.report)).toEqual([]);
    result.events.forEach((event) => expect(validateRunEvent(event)).toEqual([]));
  });

  it("is byte-stable across repeated runs and includes actual initial cash in runDigest", () => {
    const first = runBacktest(basicInput());
    const second = runBacktest(basicInput());
    expect(second).toEqual(first);
    const changed = basicInput();
    changed.runSpec.account.initialCash = "2001.00";
    const third = runBacktest(changed);
    expect(third.runDigest).not.toBe(first.runDigest);
    const normalized = basicInput();
    normalized.runSpec.account.initialCash = "2000";
    expect(runBacktest(normalized)).toEqual(first);
  });

  it("rejects initial cash outside the user-fillable range", () => {
    for (const initialCash of ["999.00", "100000001.00"]) {
      const input = basicInput();
      input.runSpec.account.initialCash = initialCash;
      const result = runBacktest(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_INITIAL_CASH");
    }
  });
});
