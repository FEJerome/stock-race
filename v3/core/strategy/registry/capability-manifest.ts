import type { CapabilityManifest } from "../generated/capability-manifest.types.js";
import type { Registry } from "./types.js";

export function createCapabilityManifest(registry: Registry): CapabilityManifest {
  return {
    manifestVersion: "1.1.0",
    registryVersion: "1.0.0",
    observationKinds: ["ohlcv", "nav", "index"],
    indicators: [...registry.indicators.values()]
      .sort((left, right) => left.use < right.use ? -1 : left.use > right.use ? 1 : 0)
      .map(({ compute: _compute, ...definition }) => definition),
    seriesFunctions: [...registry.seriesFunctions.values()].map((definition) => ({ ...definition })),
    contextRefs: registry.contextRefs.map((definition) => ({ ...definition })),
    allocationTemplates: [
      {
        key: "first-come-first-served",
        version: 1,
        use: "first-come-first-served@1",
        description: "Commit cash in signal arrival order; each asset is capped at maxPerAssetCashFraction of the unified cash pool; no new position once the pool is exhausted.",
        paramSchema: {
          maxPerAssetCashFraction: {
            type: "decimal",
            minimum: "0.01",
            maximum: "1",
            description: "Maximum fraction of the unified cash pool a single asset may occupy.",
          },
        },
      },
      {
        key: "equal-split",
        version: 1,
        use: "equal-split@1",
        description: "Split available cash evenly across free position slots; at most maxPositions concurrent positions.",
        paramSchema: {
          maxPositions: {
            type: "integer",
            minimum: 2,
            maximum: 5,
            description: "Maximum number of concurrent positions.",
          },
        },
      },
    ],
  };
}
