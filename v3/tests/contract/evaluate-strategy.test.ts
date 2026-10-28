import { describe, expect, it } from "vitest";
import {
  createRegistryV1,
  evaluateStrategy,
  type IndicatorInput,
  type StrategyDraft,
} from "../../core/strategy/index.js";
import { readJsonFixture } from "../helpers.js";
import { formatSeries } from "../s1-helpers.js";

const golden = readJsonFixture("golden/macd-kdj-v1.json") as {
  input: IndicatorInput;
  macdParams: { fast: number; slow: number; signal: number };
  expected: { dif: (string | null)[]; dea: (string | null)[]; crossAbove: unknown; within3: unknown };
};

describe("registry-driven strategy evaluation", () => {
  it("evaluates refs, cross and within without strategy-name branches", () => {
    const strategy = {
      schemaVersion: "1.0.0",
      name: "registry driven",
      indicators: { m: { use: "macd@1", params: golden.macdParams } },
      entry: { within: { window: 3, condition: { crossAbove: [{ ref: "m.dif" }, { ref: "m.dea" }] } } },
      exits: [{ crossBelow: [{ ref: "m.dif" }, { ref: "m.dea" }] }],
      position: {
        side: "long",
        allowAdd: false,
        entrySize: { cashFraction: "0.50" },
        exitSize: { positionFraction: "1.00" },
      },
    } as StrategyDraft;
    const result = evaluateStrategy(strategy, createRegistryV1(), golden.input);
    expect(formatSeries(result.indicators["m.dif"]!)).toEqual(golden.expected.dif);
    expect(formatSeries(result.indicators["m.dea"]!)).toEqual(golden.expected.dea);
    expect(result.entry).toEqual(golden.expected.within3);
    expect(result.exits[0]).toEqual(["unavailable", "unavailable", "unavailable", "unavailable", false, false, false]);
  });
});
