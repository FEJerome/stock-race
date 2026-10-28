import type Decimal from "decimal.js";
import type { SeriesExpression } from "../generated/strategy-draft.types.js";
import { ContractError } from "../canonical/errors.js";
import { normalizeDecimal } from "../canonical/decimal-profile.js";
import {
  InternalDecimal,
  internalAdd,
  internalDivide,
  internalMultiply,
  internalSubtract,
} from "../canonical/rounding-profile.js";
import type { Series } from "../registry/types.js";
import type { EvaluationContext } from "./types.js";

function binary(left: Series, right: Series, operation: (left: Decimal, right: Decimal) => Decimal): Series {
  return left.map((value, index) => value === null || right[index] === null
    ? null
    : operation(value, right[index]!));
}

export function evaluateSeries(expression: SeriesExpression, context: EvaluationContext, length: number): Series {
  if ("const" in expression) {
    const value = new InternalDecimal(normalizeDecimal(expression.const, "Scalar"));
    return Array.from({ length }, () => value);
  }
  if ("ref" in expression) {
    const series = context.refs[expression.ref];
    if (!series) {
      throw new ContractError("UNKNOWN_REFERENCE", `Unknown series ref: ${expression.ref}`);
    }
    return series;
  }
  if ("lag" in expression) {
    const input = evaluateSeries(expression.lag.input, context, length);
    return input.map((_value, index) => index >= expression.lag.periods ? input[index - expression.lag.periods]! : null);
  }
  if ("registeredSeriesFn" in expression) {
    throw new ContractError("UNKNOWN_SERIES_FUNCTION", `Unregistered series function: ${expression.registeredSeriesFn.use}`);
  }
  if ("add" in expression) {
    return binary(
      evaluateSeries(expression.add[0], context, length),
      evaluateSeries(expression.add[1], context, length),
      internalAdd,
    );
  }
  if ("sub" in expression) {
    return binary(
      evaluateSeries(expression.sub[0], context, length),
      evaluateSeries(expression.sub[1], context, length),
      internalSubtract,
    );
  }
  if ("mul" in expression) {
    return binary(
      evaluateSeries(expression.mul[0], context, length),
      evaluateSeries(expression.mul[1], context, length),
      internalMultiply,
    );
  }
  if ("div" in expression) {
    return binary(
      evaluateSeries(expression.div[0], context, length),
      evaluateSeries(expression.div[1], context, length),
      internalDivide,
    );
  }
  throw new ContractError("UNKNOWN_SERIES_EXPRESSION", "Unknown SeriesExpression");
}
