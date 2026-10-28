import type Decimal from "decimal.js";
import type { CapabilityManifest } from "../generated/capability-manifest.types.js";

export type ObservationKind = "ohlcv" | "nav" | "index";
export type Series = readonly (Decimal | null)[];
export type Observation = Readonly<Record<string, string>>;
export type IndicatorParams = Readonly<Record<string, number>>;
export type ManifestIndicator = CapabilityManifest["indicators"][number];
export type ContextRefDefinition = CapabilityManifest["contextRefs"][number];

export interface IndicatorInput {
  readonly observationKind: ObservationKind;
  readonly observations: readonly Observation[];
}

export interface IndicatorComputation {
  readonly series: Readonly<Record<string, Series>>;
}

export interface IndicatorDefinition extends ManifestIndicator {
  readonly compute: (input: IndicatorInput, params: IndicatorParams) => IndicatorComputation;
}

export interface Registry {
  readonly registryVersion: "1.0.0";
  readonly observationKinds: readonly ObservationKind[];
  readonly indicators: ReadonlyMap<string, IndicatorDefinition>;
  readonly seriesFunctions: ReadonlyMap<string, CapabilityManifest["seriesFunctions"][number]>;
  readonly contextRefs: readonly ContextRefDefinition[];
}

export function getIndicator(registry: Registry, use: string): IndicatorDefinition | undefined {
  return registry.indicators.get(use);
}
