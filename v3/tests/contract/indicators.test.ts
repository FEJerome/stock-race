import { describe, expect, it } from "vitest";
import {
  computeKdj,
  computeMacd,
  crossAbove,
  within,
  type IndicatorInput,
} from "../../core/strategy/index.js";
import { readJsonFixture } from "../helpers.js";
import { formatSeries } from "../s1-helpers.js";

const golden = readJsonFixture("golden/macd-kdj-v1.json") as {
  input: IndicatorInput;
  macdParams: { fast: number; slow: number; signal: number };
  kdjParams: { period: number; kSmooth: number; dSmooth: number };
  expected: Record<string, unknown>;
};

describe("MACD/KDJ frozen hand-calculated golden", () => {
  it("matches every scale=8 output array without feeding display values back", () => {
    const macd = computeMacd(golden.input, golden.macdParams);
    const kdj = computeKdj(golden.input, golden.kdjParams);
    for (const key of ["fast", "slow", "dif", "dea", "hist"] as const) {
      expect(formatSeries(macd.series[key])).toEqual(golden.expected[key]);
    }
    for (const key of ["rsv", "k", "d", "j"] as const) {
      expect(formatSeries(kdj.series[key])).toEqual(golden.expected[key]);
    }
    expect(crossAbove(macd.series.dif, macd.series.dea)).toEqual(golden.expected.crossAbove);
    expect(within(crossAbove(macd.series.dif, macd.series.dea), 3)).toEqual(golden.expected.within3);
  });

  it("is prefix invariant from the same snapshot anchor", () => {
    const fullMacd = computeMacd(golden.input, golden.macdParams);
    const fullKdj = computeKdj(golden.input, golden.kdjParams);
    for (let end = 1; end <= golden.input.observations.length; end += 1) {
      const input = { ...golden.input, observations: golden.input.observations.slice(0, end) };
      const macd = computeMacd(input, golden.macdParams);
      const kdj = computeKdj(input, golden.kdjParams);
      for (const key of ["fast", "slow", "dif", "dea", "hist"] as const) {
        expect(formatSeries(macd.series[key])).toEqual(formatSeries(fullMacd.series[key]).slice(0, end));
        expect(macd.series[key].map((value) => value?.toString() ?? null)).toEqual(
          fullMacd.series[key].map((value) => value?.toString() ?? null).slice(0, end),
        );
      }
      for (const key of ["rsv", "k", "d", "j"] as const) {
        expect(formatSeries(kdj.series[key])).toEqual(formatSeries(fullKdj.series[key]).slice(0, end));
        expect(kdj.series[key].map((value) => value?.toString() ?? null)).toEqual(
          fullKdj.series[key].map((value) => value?.toString() ?? null).slice(0, end),
        );
      }
    }
  });

  it("maps NAV unitNav explicitly instead of inventing OHLC fields", () => {
    const input: IndicatorInput = {
      observationKind: "nav",
      observations: golden.input.observations.map((observation) => ({
        unitNav: observation.close!,
        cumulativeNav: observation.close!,
      })),
    };
    const result = computeMacd(input, golden.macdParams);
    expect(formatSeries(result.series.dif)).toEqual(golden.expected.dif);
  });

  it("handles H=L with the 50 seed and does not reset later flat windows", () => {
    const input: IndicatorInput = {
      observationKind: "ohlcv",
      observations: [
        { high: "1.000000", low: "1.000000", close: "1.000000" },
        { high: "2.000000", low: "0.000000", close: "2.000000" },
        { high: "2.000000", low: "2.000000", close: "2.000000" },
      ],
    };
    const result = computeKdj(input, { period: 1, kSmooth: 2, dSmooth: 2 });
    expect(formatSeries(result.series.rsv)).toEqual(["50.00000000", "100.00000000", "50.00000000"]);
    expect(formatSeries(result.series.k)).toEqual(["50.00000000", "75.00000000", "62.50000000"]);
    expect(formatSeries(result.series.d)).toEqual(["50.00000000", "62.50000000", "62.50000000"]);
    expect(formatSeries(result.series.j)).toEqual(["50.00000000", "100.00000000", "62.50000000"]);
  });
});
