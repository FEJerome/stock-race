import type { BoolExpression, StrategyDraft, SeriesExpression } from "../generated/strategy-draft.types.js";
import { canonicalizeJson } from "./canonical-json.js";
import { normalizeDecimal } from "./decimal-profile.js";
import { digestCanonical } from "./digest.js";
import { assertValidStrategyDraft } from "../validation/schema-validator.js";

function normalizeBinary(operands: [SeriesExpression, SeriesExpression]): [SeriesExpression, SeriesExpression] {
  return [normalizeSeries(operands[0]), normalizeSeries(operands[1])];
}

function normalizeSeries(expression: SeriesExpression): SeriesExpression {
  if ("const" in expression) {
    return { const: normalizeDecimal(expression.const, "Scalar") };
  }
  if ("ref" in expression) {
    return { ...expression };
  }
  if ("lag" in expression) {
    return { lag: { ...expression.lag, input: normalizeSeries(expression.lag.input) } };
  }
  if ("registeredSeriesFn" in expression) {
    return {
      registeredSeriesFn: {
        ...expression.registeredSeriesFn,
        args: expression.registeredSeriesFn.args.map(normalizeSeries) as typeof expression.registeredSeriesFn.args,
      },
    };
  }
  if ("add" in expression) return { add: normalizeBinary(expression.add) };
  if ("sub" in expression) return { sub: normalizeBinary(expression.sub) };
  if ("mul" in expression) return { mul: normalizeBinary(expression.mul) };
  if ("div" in expression) return { div: normalizeBinary(expression.div) };
  throw new TypeError("Unknown SeriesExpression after schema validation");
}

function normalizeBool(expression: BoolExpression): BoolExpression {
  if ("gt" in expression) return { gt: normalizeBinary(expression.gt) };
  if ("gte" in expression) return { gte: normalizeBinary(expression.gte) };
  if ("lt" in expression) return { lt: normalizeBinary(expression.lt) };
  if ("lte" in expression) return { lte: normalizeBinary(expression.lte) };
  if ("eq" in expression) return { eq: normalizeBinary(expression.eq) };
  if ("neq" in expression) return { neq: normalizeBinary(expression.neq) };
  if ("crossAbove" in expression) return { crossAbove: normalizeBinary(expression.crossAbove) };
  if ("crossBelow" in expression) return { crossBelow: normalizeBinary(expression.crossBelow) };
  if ("all" in expression) {
    return { all: expression.all.map(normalizeBool) as typeof expression.all };
  }
  if ("any" in expression) {
    return { any: expression.any.map(normalizeBool) as typeof expression.any };
  }
  if ("not" in expression) {
    return { not: normalizeBool(expression.not) };
  }
  if ("within" in expression) {
    return { within: { ...expression.within, condition: normalizeBool(expression.within.condition) } };
  }
  throw new TypeError("Unknown BoolExpression after schema validation");
}

export function normalizeStrategyDraft(value: StrategyDraft): StrategyDraft {
  return {
    ...value,
    indicators: Object.fromEntries(
      Object.entries(value.indicators).map(([key, indicator]) => [key, {
        ...indicator,
        ...(indicator.params ? { params: { ...indicator.params } } : {}),
      }]),
    ),
    entry: normalizeBool(value.entry),
    exits: value.exits.map(normalizeBool) as typeof value.exits,
    position: {
      ...value.position,
      entrySize: { cashFraction: normalizeDecimal(value.position.entrySize.cashFraction, "Rate") },
      exitSize: { positionFraction: normalizeDecimal(value.position.exitSize.positionFraction, "Rate") },
    },
  };
}

export function canonicalizeStrategyDraft(value: unknown): string {
  assertValidStrategyDraft(value);
  return canonicalizeJson(normalizeStrategyDraft(value));
}

export function digestStrategyDraft(value: unknown): string {
  return digestCanonical(canonicalizeStrategyDraft(value));
}
