import type { CapabilityManifest } from "../generated/capability-manifest.types.js";
import type { Registry } from "./types.js";

export function createCapabilityManifest(registry: Registry): CapabilityManifest {
  return {
    manifestVersion: "1.0.0",
    registryVersion: "1.0.0",
    observationKinds: ["ohlcv", "nav", "index"],
    indicators: [...registry.indicators.values()]
      .sort((left, right) => left.use < right.use ? -1 : left.use > right.use ? 1 : 0)
      .map(({ compute: _compute, ...definition }) => definition),
    seriesFunctions: [...registry.seriesFunctions.values()].map((definition) => ({ ...definition })),
    contextRefs: registry.contextRefs.map((definition) => ({ ...definition })),
  };
}
