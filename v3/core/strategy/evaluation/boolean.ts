import type { BoolExpression } from "../generated/strategy-draft.types.js";
import { ContractError } from "../canonical/errors.js";
import type { Series } from "../registry/types.js";
import type { EvaluationContext, BoolSeries, BoolValue } from "./types.js";
import { evaluateSeries } from "./series.js";
import { crossAbove, crossBelow } from "./cross.js";
import { within } from "./within.js";

export function compareSeries(left: Series, right: Series, operator: string): BoolSeries {
  return left.map((value, index): BoolValue => {
    const other = right[index];
    if (value === null || other == null) {
      return "unavailable";
    }
    switch (operator) {
      case "gt": return value.gt(other);
      case "gte": return value.gte(other);
      case "lt": return value.lt(other);
      case "lte": return value.lte(other);
      case "eq": return value.eq(other);
      case "neq": return !value.eq(other);
      default: throw new ContractError("UNKNOWN_COMPARISON", `Unknown comparison: ${operator}`);
    }
  });
}

function all(expressions: readonly BoolExpression[], context: EvaluationContext, length: number): BoolSeries {
  const evaluated = expressions.map((expression) => evaluateBool(expression, context, length));
  return Array.from({ length }, (_value, index) => {
    const values = evaluated.map((series) => series[index]!);
    if (values.includes(false)) return false;
    return values.includes("unavailable") ? "unavailable" : true;
  });
}

function any(expressions: readonly BoolExpression[], context: EvaluationContext, length: number): BoolSeries {
  const evaluated = expressions.map((expression) => evaluateBool(expression, context, length));
  return Array.from({ length }, (_value, index) => {
    const values = evaluated.map((series) => series[index]!);
    if (values.includes(true)) return true;
    return values.includes("unavailable") ? "unavailable" : false;
  });
}

function operands(expression: BoolExpression, operator: string, context: EvaluationContext, length: number): [Series, Series] {
  const pair = (expression as unknown as Record<string, [import("../generated/strategy-draft.types.js").SeriesExpression, import("../generated/strategy-draft.types.js").SeriesExpression]>)[operator]!;
  return [evaluateSeries(pair[0], context, length), evaluateSeries(pair[1], context, length)];
}

export function evaluateBool(expression: BoolExpression, context: EvaluationContext, length: number): BoolSeries {
  for (const operator of ["gt", "gte", "lt", "lte", "eq", "neq"]) {
    if (operator in expression) {
      const [left, right] = operands(expression, operator, context, length);
      return compareSeries(left, right, operator);
    }
  }
  if ("crossAbove" in expression) return crossAbove(...operands(expression, "crossAbove", context, length));
  if ("crossBelow" in expression) return crossBelow(...operands(expression, "crossBelow", context, length));
  if ("all" in expression) return all(expression.all, context, length);
  if ("any" in expression) return any(expression.any, context, length);
  if ("not" in expression) {
    return evaluateBool(expression.not, context, length).map((value) => value === "unavailable" ? value : !value);
  }
  if ("within" in expression) {
    return within(evaluateBool(expression.within.condition, context, length), expression.within.window);
  }
  throw new ContractError("UNKNOWN_BOOL_EXPRESSION", "Unknown BoolExpression");
}
