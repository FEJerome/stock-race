import { describe, expect, it } from "vitest";
import {
  InsufficientWarmupError,
  checkWarmup,
  createRegistryV1,
  deriveStrategyWarmup,
  digestJson,
  type StrategyDraft,
} from "../../core/strategy/index.js";
import { readJsonFixture } from "../helpers.js";

const strategy = readJsonFixture("fixtures/strategy/valid/macd-kdj.json") as StrategyDraft;
const registry = createRegistryV1();

describe("recursive warmup and snapshot-anchored gate", () => {
  it("derives the frozen MACD+cross+within minimum across every branch", () => {
    expect(deriveStrategyWarmup(strategy, registry)).toBe(36);
    const negated = { ...strategy, entry: { not: strategy.entry } } as StrategyDraft;
    expect(deriveStrategyWarmup(negated, registry)).toBe(36);
  });

  it("adds lag, cross and nested within without double counting", () => {
    const nested = {
      ...strategy,
      entry: {
        within: {
          window: 2,
          condition: {
            crossAbove: [
              { lag: { input: { ref: "m.dif" }, periods: 2 } },
              { ref: "m.dea" },
            ],
          },
        },
      },
    } as StrategyDraft;
    expect(deriveStrategyWarmup(nested, registry)).toBe(35);
  });

  it("blocks one missing observation and extra only raises the gate", () => {
    expect(() => checkWarmup(strategy, registry, 35, 0)).toThrowError(InsufficientWarmupError);
    expect(checkWarmup(strategy, registry, 36, 0)).toEqual({
      astMinimum: 36,
      extraObservations: 0,
      requiredPriorObservations: 36,
      actualPriorObservations: 36,
    });
    expect(checkWarmup(strategy, registry, 37, 1).requiredPriorObservations).toBe(37);
    expect(() => checkWarmup(strategy, registry, 36, 1)).toThrowError(
      expect.objectContaining({ code: "INSUFFICIENT_WARMUP" }),
    );
  });

  it("different explicit extra values enter content digests", () => {
    expect(digestJson({ warmup: { extraObservations: 0 } })).not.toBe(
      digestJson({ warmup: { extraObservations: 1 } }),
    );
  });
});
