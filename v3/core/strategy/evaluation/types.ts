import type { Series } from "../registry/types.js";

export type BoolValue = boolean | "unavailable";
export type BoolSeries = readonly BoolValue[];

export interface EvaluationContext {
  readonly refs: Readonly<Record<string, Series>>;
}

export function isTriggered(value: BoolValue): value is true {
  return value === true;
}
