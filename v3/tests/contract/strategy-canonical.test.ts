import { describe, expect, it } from "vitest";
import {
  canonicalizeStrategyDraft,
  digestJson,
  digestStrategyDraft,
} from "../../core/strategy/index.js";
import { readJsonFixture } from "../helpers.js";
import type { StrategyDraft } from "../../core/strategy/generated/strategy-draft.types.js";

describe("strategy canonicalization and digest", () => {
  const original = readJsonFixture("fixtures/strategy/valid/macd-kdj.json") as StrategyDraft;

  it("normalizes all continuous AST constants and fractions to Scalar/Rate scale 12", () => {
    const canonical = canonicalizeStrategyDraft(original);
    expect(canonical).toContain('"const":"90.000000000000"');
    expect(canonical).toContain('"const":"20.000000000000"');
    expect(canonical).toContain('"cashFraction":"0.500000000000"');
    expect(canonical).toContain('"positionFraction":"1.000000000000"');
  });

  it("is stable across object key order and all-zero decimal tails", () => {
    const reordered = JSON.parse(JSON.stringify(original, (_key, value) => value)) as StrategyDraft;
    const withTail = {
      ...reordered,
      position: {
        ...reordered.position,
        entrySize: { cashFraction: "0.5000000000000" },
      },
    } as StrategyDraft;
    expect(digestStrategyDraft(withTail)).toBe(digestStrategyDraft(original));
  });

  it("changes digest when executable AST semantics change", () => {
    const changed = {
      ...original,
      position: {
        ...original.position,
        entrySize: { cashFraction: "0.51" },
      },
    } as StrategyDraft;
    expect(digestStrategyDraft(changed)).not.toBe(digestStrategyDraft(original));
  });

  it("does not normalize same-named indicator params as AST nodes", () => {
    const withParams = {
      ...original,
      indicators: {
        custom: {
          use: "custom@1",
          params: { const: "1.2", cashFraction: "0.5", periods: 3 },
        },
      },
    } as StrategyDraft;
    const canonical = canonicalizeStrategyDraft(withParams);
    expect(canonical).toContain('"params":{"cashFraction":"0.5","const":"1.2","periods":3}');
  });

  it("accepts and normalizes lag, arithmetic and registered series functions", () => {
    const generic = {
      ...original,
      entry: {
        within: {
          window: 2,
          condition: {
            not: {
              eq: [
                { lag: { input: { add: [{ ref: "m.dif" }, { const: "1" }] }, periods: 1 } },
                { registeredSeriesFn: { use: "scale@1", args: [{ ref: "m.dea" }] } },
              ],
            },
          },
        },
      },
    } as StrategyDraft;
    expect(canonicalizeStrategyDraft(generic)).toContain('"const":"1.000000000000"');
  });

  it("digestJson is the digest of canonical UTF-8 bytes", () => {
    expect(digestJson({ b: [2, 1], a: 1 })).toBe(
      "sha256:e9d26fb0100c3f9ef569c38ced9811ec35059c3c999b8683fde59ed24e6e66e8",
    );
  });
});
