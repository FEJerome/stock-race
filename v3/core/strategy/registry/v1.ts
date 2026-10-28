import { digestJson } from "../canonical/digest.js";
import type { CapabilityManifest } from "../generated/capability-manifest.types.js";
import { computeKdj, type KdjParams } from "../indicators/kdj.js";
import { computeMacd, type MacdParams } from "../indicators/macd.js";
import type { IndicatorDefinition, ManifestIndicator, Registry } from "./types.js";

type IndicatorSeed = Omit<ManifestIndicator, "implementationDigest">;

function defineIndicator(seed: IndicatorSeed, compute: IndicatorDefinition["compute"]): IndicatorDefinition {
  return { ...seed, implementationDigest: digestJson(seed), compute };
}

const macd = defineIndicator({
  key: "macd",
  version: 1,
  use: "macd@1",
  paramSchema: {
    fast: { type: "integer", minimum: 1, maximum: 9007199254740991 },
    slow: { type: "integer", minimum: 1, maximum: 9007199254740991 },
    signal: { type: "integer", minimum: 1, maximum: 9007199254740991 },
  },
  requiredInputs: { ohlcv: ["close"], nav: ["unitNav"], index: ["close"] },
  outputs: [
    { name: "dif", type: "scalar", warmup: "slow-1" },
    { name: "dea", type: "scalar", warmup: "slow+signal-2" },
    { name: "hist", type: "scalar", warmup: "slow+signal-2" },
  ],
  observationKinds: ["ohlcv", "nav", "index"],
  causal: true,
  formula: "EMA SMA seed; DIF=EMA_fast-EMA_slow; DEA=SMA/EMA of DIF; HIST=2*(DIF-DEA)",
  rounding: "indicator-arithmetic@1",
}, (input, params) => computeMacd(input, params as MacdParams));

const kdj = defineIndicator({
  key: "kdj",
  version: 1,
  use: "kdj@1",
  paramSchema: {
    period: { type: "integer", minimum: 1, maximum: 9007199254740991 },
    kSmooth: { type: "integer", minimum: 1, maximum: 9007199254740991 },
    dSmooth: { type: "integer", minimum: 1, maximum: 9007199254740991 },
  },
  requiredInputs: { ohlcv: ["high", "low", "close"] },
  outputs: [
    { name: "rsv", type: "scalar", warmup: "period-1" },
    { name: "k", type: "scalar", warmup: "period-1" },
    { name: "d", type: "scalar", warmup: "period-1" },
    { name: "j", type: "scalar", warmup: "period-1" },
  ],
  observationKinds: ["ohlcv"],
  causal: true,
  formula: "RSV=100*(C-LLV)/(HHV-LLV), flat=50; K/D seed=50; J=3K-2D",
  rounding: "indicator-arithmetic@1",
}, (input, params) => computeKdj(input, params as KdjParams));

const contextRefs: Registry["contextRefs"] = [
  { ref: "open", type: "price", observationKinds: ["ohlcv", "index"] },
  { ref: "high", type: "price", observationKinds: ["ohlcv", "index"] },
  { ref: "low", type: "price", observationKinds: ["ohlcv", "index"] },
  { ref: "close", type: "price", observationKinds: ["ohlcv", "index"] },
  { ref: "volume", type: "quantity", observationKinds: ["ohlcv"] },
  { ref: "unitNav", type: "price", observationKinds: ["nav"] },
  { ref: "cumulativeNav", type: "price", observationKinds: ["nav"] },
  { ref: "position.state", type: "state", observationKinds: ["ohlcv", "nav", "index"] },
  { ref: "position.quantity", type: "quantity", observationKinds: ["ohlcv", "nav", "index"] },
  { ref: "position.entryPrice", type: "price", observationKinds: ["ohlcv", "nav", "index"] },
  { ref: "position.barsHeld", type: "scalar", observationKinds: ["ohlcv", "nav", "index"] },
  { ref: "account.availableCash", type: "scalar", observationKinds: ["ohlcv", "nav", "index"] },
];

export function createRegistryV1(): Registry {
  return {
    registryVersion: "1.0.0",
    observationKinds: ["ohlcv", "nav", "index"],
    indicators: new Map([
      [kdj.use, kdj],
      [macd.use, macd],
    ]),
    seriesFunctions: new Map(),
    contextRefs: contextRefs.map((definition) => ({ ...definition, observationKinds: [...definition.observationKinds] })),
  };
}
