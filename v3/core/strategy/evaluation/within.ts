import type { BoolSeries } from "./types.js";

export function within(condition: BoolSeries, window: number): BoolSeries {
  return condition.map((_value, index) => {
    if (index < window - 1) {
      return "unavailable";
    }
    const values = condition.slice(index - window + 1, index + 1);
    if (values.includes(true)) {
      return true;
    }
    return values.includes("unavailable") ? "unavailable" : false;
  });
}
