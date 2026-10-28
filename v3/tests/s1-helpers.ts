import { formatIndicatorOutput } from "../core/strategy/index.js";
import type { Series } from "../core/strategy/registry/types.js";

export function formatSeries(series: Series): (string | null)[] {
  return series.map((value) => value === null ? null : formatIndicatorOutput(value));
}
