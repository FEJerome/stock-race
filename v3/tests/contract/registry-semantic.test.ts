import { describe, expect, it } from "vitest";
import {
  createCapabilityManifest,
  createRegistryV1,
  validateCapabilityManifest,
  validateStrategySemantics,
  type StrategyDraft,
} from "../../core/strategy/index.js";
import { readJsonFixture } from "../helpers.js";

const strategy = readJsonFixture("fixtures/strategy/valid/macd-kdj.json") as StrategyDraft;
const registry = createRegistryV1();

function withIndicator(use: string): StrategyDraft {
  return { ...strategy, indicators: { m: { use, params: { fast: 12, slow: 26, signal: 9 } } } } as StrategyDraft;
}

describe("registry v1 and CapabilityManifest", () => {
  it("publishes versioned MACD/KDJ capabilities and deterministic implementation digests", () => {
    const manifest = createCapabilityManifest(registry);
    expect(validateCapabilityManifest(manifest)).toEqual([]);
    expect(manifest.indicators.map((item) => item.use)).toEqual(["kdj@1", "macd@1"]);
    expect(manifest.seriesFunctions).toEqual([]);
    expect(manifest.indicators.every((item) => item.causal && item.implementationDigest.startsWith("sha256:"))).toBe(true);
    expect(createCapabilityManifest(registry)).toEqual(manifest);
  });

  it("rejects a malformed manifest", () => {
    const manifest = createCapabilityManifest(registry) as unknown as Record<string, unknown>;
    expect(validateCapabilityManifest({ ...manifest, extra: true }).length).toBeGreaterThan(0);
  });
});

describe("semantic validation", () => {
  it("accepts the frozen strategy on ohlcv", () => {
    expect(validateStrategySemantics(strategy, registry, "ohlcv")).toEqual([]);
  });

  it("allows numeric equality against a scalar constant", () => {
    const equality = { ...strategy, entry: { eq: [{ ref: "close" }, { const: "100" }] } } as StrategyDraft;
    expect(validateStrategySemantics(equality, registry, "ohlcv")).toEqual([]);
  });

  it("locates unknown indicator versions", () => {
    const issues = validateStrategySemantics(withIndicator("macd@99"), registry, "ohlcv");
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNKNOWN_INDICATOR", path: "/indicators/m/use" }),
    ]));
  });

  it("locates unknown outputs and references", () => {
    const unknownOutput = { ...strategy, entry: { gt: [{ ref: "m.unknown" }, { const: "0" }] } } as StrategyDraft;
    expect(validateStrategySemantics(unknownOutput, registry, "ohlcv")).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNKNOWN_INDICATOR_OUTPUT", path: "/entry/gt/0/ref" }),
    ]));
    const unknownRef = { ...strategy, entry: { gt: [{ ref: "future.close" }, { const: "0" }] } } as StrategyDraft;
    expect(validateStrategySemantics(unknownRef, registry, "ohlcv")).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNKNOWN_REFERENCE", path: "/entry/gt/0/ref" }),
    ]));
  });

  it("enforces observation kinds and causal registered functions", () => {
    expect(validateStrategySemantics(strategy, registry, "nav")).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "OBSERVATION_KIND_UNSUPPORTED", path: "/indicators/k/use" }),
    ]));
    const fn = {
      ...strategy,
      entry: { gt: [{ registeredSeriesFn: { use: "future@1", args: [{ ref: "close" }] } }, { const: "0" }] },
    } as StrategyDraft;
    expect(validateStrategySemantics(fn, registry, "ohlcv")).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNKNOWN_SERIES_FUNCTION", path: "/entry/gt/0/registeredSeriesFn/use" }),
    ]));
  });

  it("validates params, numeric types and position fractions", () => {
    const badParams = withIndicator("macd@1");
    badParams.indicators.m!.params = { fast: 26, slow: 12, signal: 9, extra: 1 };
    const issues = validateStrategySemantics(badParams, registry, "ohlcv");
    expect(issues.some((issue) => issue.path === "/indicators/m/params/extra")).toBe(true);
    expect(issues.some((issue) => issue.path === "/indicators/m/params/fast")).toBe(true);

    const badType = { ...strategy, entry: { gt: [{ add: [{ ref: "position.state" }, { const: "1" }] }, { const: "0" }] } } as StrategyDraft;
    expect(validateStrategySemantics(badType, registry, "ohlcv").length).toBeGreaterThan(0);

    const badFraction = {
      ...strategy,
      position: { ...strategy.position, entrySize: { cashFraction: "1.01" } },
    } as StrategyDraft;
    expect(validateStrategySemantics(badFraction, registry, "ohlcv")).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_POSITION_FRACTION", path: "/position/entrySize/cashFraction" }),
    ]));
  });
});
