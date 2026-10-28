import { describe, expect, it } from "vitest";
import { runBacktest } from "../../application/run-backtest/index.js";
import { prepareFixtureRun } from "../../adapters/market/fixture/index.js";
import type { DataSnapshot } from "../../core/market/types.js";
import type { FillRecord } from "../../core/engine/types.js";
import { calculateFifoBatchOutcomes } from "../../core/report/fifo.js";
import { calculateCumulativeReturn, calculateMaxDrawdown } from "../../core/report/metrics.js";
import { basicInput } from "../s2-helpers.js";

describe("corporate actions and report arithmetic", () => {
  it("applies dividend receivable/payable and bonus listing before odd-lot full sale", () => {
    const input = basicInput();
    input.snapshot.corporateActions = [
      { type: "cashDividend", recordDate: "2024-01-03", exDate: "2024-01-04", payDate: "2024-01-05", cashPerShare: "1.234" },
      { type: "bonusIssue", recordDate: "2024-01-03", exDate: "2024-01-04", listingDate: "2024-01-05", ratioNumerator: 1, ratioDenominator: 10 },
    ];
    const result = runBacktest(prepareFixtureRun(input));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events.some((event) => event.type === "CorporateActionApplied" && event.reasonCodes.includes("DIVIDEND_RECEIVABLE"))).toBe(true);
      expect(result.events.some((event) => event.type === "CashChanged" && event.reasonCodes.includes("DIVIDEND_PAID"))).toBe(true);
      expect(result.report.fills).toHaveLength(3);
      expect(result.report.fills[2]).toEqual(expect.objectContaining({ side: "sell", quantity: "10", cashDelta: "94.85" }));
      expect(result.report.position.total).toBe("0");
      expect(result.report.cash.total).toBe("2205.73");
      expect(result.report.metrics.winRate).toBe("1.000000000000");
    }
  });

  it("pairs partial FIFO fragments and ignores open batches in win-rate denominator", () => {
    const fills: FillRecord[] = [
      { date: "2024-01-01", side: "buy", price: "10.00", quantity: "200", amount: "2000.00", commission: "9.00", transferFee: "1.00", stampDuty: "0.00", fees: "10.00", cashDelta: "-2010.00" },
      { date: "2024-01-02", side: "sell", price: "10.00", quantity: "100", amount: "1000.00", commission: "4.00", transferFee: "1.00", stampDuty: "0.00", fees: "5.00", cashDelta: "995.00" },
      { date: "2024-01-03", side: "sell", price: "10.00", quantity: "100", amount: "1000.00", commission: "4.00", transferFee: "1.00", stampDuty: "0.00", fees: "5.00", cashDelta: "995.00" },
      { date: "2024-01-04", side: "buy", price: "10.00", quantity: "100", amount: "1000.00", commission: "5.00", transferFee: "0.00", stampDuty: "0.00", fees: "5.00", cashDelta: "-1005.00" },
    ];
    expect(calculateFifoBatchOutcomes(fills)).toEqual([{ quantity: "200", realizedPnl: "-20.00", winning: false }]);
  });

  it("allocates a sell fragment across FIFO batches without losing proceeds", () => {
    const fills: FillRecord[] = [
      { date: "2024-01-01", side: "buy", price: "10.00", quantity: "100", amount: "1000.00", commission: "5.00", transferFee: "0.00", stampDuty: "0.00", fees: "5.00", cashDelta: "-1005.00" },
      { date: "2024-01-02", side: "buy", price: "10.00", quantity: "100", amount: "1000.00", commission: "5.00", transferFee: "0.00", stampDuty: "0.00", fees: "5.00", cashDelta: "-1005.00" },
      { date: "2024-01-03", side: "sell", price: "10.00", quantity: "150", amount: "1500.00", commission: "0.00", transferFee: "0.00", stampDuty: "0.00", fees: "0.00", cashDelta: "1500.00" },
      { date: "2024-01-04", side: "sell", price: "10.00", quantity: "50", amount: "500.00", commission: "0.00", transferFee: "0.00", stampDuty: "0.00", fees: "0.00", cashDelta: "500.00" },
    ];
    expect(calculateFifoBatchOutcomes(fills)).toEqual([
      { quantity: "100", realizedPnl: "-5.00", winning: false },
      { quantity: "100", realizedPnl: "-5.00", winning: false },
    ]);
  });

  it("rounds non-final FIFO fragments HALF_UP and assigns the tail to the last", () => {
    const fills: FillRecord[] = [
      { date: "2024-01-01", side: "buy", price: "10.00", quantity: "50", amount: "500.00", commission: "0.00", transferFee: "0.00", stampDuty: "0.00", fees: "0.00", cashDelta: "0.00" },
      { date: "2024-01-02", side: "buy", price: "10.00", quantity: "50", amount: "500.00", commission: "0.00", transferFee: "0.00", stampDuty: "0.00", fees: "0.00", cashDelta: "0.00" },
      { date: "2024-01-03", side: "sell", price: "10.00", quantity: "100", amount: "1000.00", commission: "0.00", transferFee: "0.00", stampDuty: "0.00", fees: "0.00", cashDelta: "0.05" },
    ];
    expect(calculateFifoBatchOutcomes(fills)).toEqual([
      { quantity: "50", realizedPnl: "0.03", winning: true },
      { quantity: "50", realizedPnl: "0.02", winning: true },
    ]);
  });

  it("dilutes only remaining FIFO cost after a bonus following a partial sale", () => {
    const fills: FillRecord[] = [
      { date: "2024-01-01", side: "buy", price: "10.00", quantity: "100", amount: "1000.00", commission: "5.00", transferFee: "0.00", stampDuty: "0.00", fees: "5.00", cashDelta: "-1005.00" },
      { date: "2024-01-02", side: "sell", price: "10.00", quantity: "50", amount: "500.00", commission: "0.00", transferFee: "0.00", stampDuty: "0.00", fees: "0.00", cashDelta: "500.00" },
      { date: "2024-01-03", side: "sell", price: "10.00", quantity: "55", amount: "550.00", commission: "0.00", transferFee: "0.00", stampDuty: "0.00", fees: "0.00", cashDelta: "550.00" },
    ];
    const actions: DataSnapshot["corporateActions"] = [{ type: "bonusIssue", recordDate: "2024-01-02", exDate: "2024-01-02", listingDate: "2024-01-03", ratioNumerator: 1, ratioDenominator: 10 }];
    expect(calculateFifoBatchOutcomes(fills, actions)).toEqual([{ quantity: "105", realizedPnl: "45.00", winning: true }]);
  });

  it("anchors drawdown before the first session and formats financial rates", () => {
    expect(calculateMaxDrawdown(["1000.00", "900.00"])).toBe("0.100000000000");
    expect(calculateMaxDrawdown(["1000.00", "1100.00", "900.00", "1000.00"])).toBe("0.181818181818");
    expect(calculateCumulativeReturn("2000.00", "1987.48")).toBe("-0.006260000000");
  });
});
