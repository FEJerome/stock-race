import type { Series } from "../registry/types.js";
import type { BoolSeries } from "./types.js";

function cross(left: Series, right: Series, direction: "above" | "below"): BoolSeries {
  return left.map((current, index) => {
    if (index === 0) {
      return "unavailable";
    }
    const previousLeft = left[index - 1];
    const previousRight = right[index - 1];
    const currentRight = right[index];
    if (previousLeft == null || previousRight == null || current == null || currentRight == null) {
      return "unavailable";
    }
    return direction === "above"
      ? previousLeft.lte(previousRight) && current.gt(currentRight)
      : previousLeft.gte(previousRight) && current.lt(currentRight);
  });
}

export function crossAbove(left: Series, right: Series): BoolSeries {
  return cross(left, right, "above");
}

export function crossBelow(left: Series, right: Series): BoolSeries {
  return cross(left, right, "below");
}
