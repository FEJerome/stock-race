import type { BoolExpression, StrategyDraft, SeriesExpression } from "../generated/strategy-draft.types.js";
import { canonicalizeJson } from "./canonical-json.js";
import { normalizeDecimal, type DecimalValueType } from "./decimal-profile.js";
import { digestCanonical } from "./digest.js";
import { ContractError } from "./errors.js";
import { assertValidStrategyDraft } from "../validation/schema-validator.js";

function normalizeDecimalAt(input: string, type: DecimalValueType, path: string): string {
  try {
    return normalizeDecimal(input, type);
  } catch (error) {
    if (error instanceof ContractError && error.path === "") {
      throw new ContractError(error.code, error.message, path);
    }
    throw error;
  }
}

function normalizeBinary(operands: [SeriesExpression, SeriesExpression], path: string): [SeriesExpression, SeriesExpression] {
  return [normalizeSeries(operands[0], `${path}/0`), normalizeSeries(operands[1], `${path}/1`)];
}

function normalizeSeries(expression: SeriesExpression, path: string): SeriesExpression {
  if ("const" in expression) {
    return { const: normalizeDecimalAt(expression.const, "Scalar", `${path}/const`) };
  }
  if ("ref" in expression) {
    return { ...expression };
  }
  if ("lag" in expression) {
    return { lag: { ...expression.lag, input: normalizeSeries(expression.lag.input, `${path}/lag/input`) } };
  }
  if ("registeredSeriesFn" in expression) {
    return {
      registeredSeriesFn: {
        ...expression.registeredSeriesFn,
        args: expression.registeredSeriesFn.args.map((argument, index) =>
          normalizeSeries(argument, `${path}/registeredSeriesFn/args/${index}`)) as typeof expression.registeredSeriesFn.args,
      },
    };
  }
  if ("add" in expression) return { add: normalizeBinary(expression.add, `${path}/add`) };
  if ("sub" in expression) return { sub: normalizeBinary(expression.sub, `${path}/sub`) };
  if ("mul" in expression) return { mul: normalizeBinary(expression.mul, `${path}/mul`) };
  if ("div" in expression) return { div: normalizeBinary(expression.div, `${path}/div`) };
  throw new TypeError("Unknown SeriesExpression after schema validation");
}

function normalizeBool(expression: BoolExpression, path: string): BoolExpression {
  if ("gt" in expression) return { gt: normalizeBinary(expression.gt, `${path}/gt`) };
  if ("gte" in expression) return { gte: normalizeBinary(expression.gte, `${path}/gte`) };
  if ("lt" in expression) return { lt: normalizeBinary(expression.lt, `${path}/lt`) };
  if ("lte" in expression) return { lte: normalizeBinary(expression.lte, `${path}/lte`) };
  if ("eq" in expression) return { eq: normalizeBinary(expression.eq, `${path}/eq`) };
  if ("neq" in expression) return { neq: normalizeBinary(expression.neq, `${path}/neq`) };
  if ("crossAbove" in expression) return { crossAbove: normalizeBinary(expression.crossAbove, `${path}/crossAbove`) };
  if ("crossBelow" in expression) return { crossBelow: normalizeBinary(expression.crossBelow, `${path}/crossBelow`) };
  if ("all" in expression) {
    return { all: expression.all.map((item, index) => normalizeBool(item, `${path}/all/${index}`)) as typeof expression.all };
  }
  if ("any" in expression) {
    return { any: expression.any.map((item, index) => normalizeBool(item, `${path}/any/${index}`)) as typeof expression.any };
  }
  if ("not" in expression) {
    return { not: normalizeBool(expression.not, `${path}/not`) };
  }
  if ("within" in expression) {
    return { within: { ...expression.within, condition: normalizeBool(expression.within.condition, `${path}/within/condition`) } };
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
    entry: normalizeBool(value.entry, "/entry"),
    exits: value.exits.map((expression, index) => normalizeBool(expression, `/exits/${index}`)) as typeof value.exits,
    position: {
      ...value.position,
      entrySize: {
        cashFraction: normalizeDecimalAt(
          value.position.entrySize.cashFraction,
          "Rate",
          "/position/entrySize/cashFraction",
        ),
      },
      exitSize: {
        positionFraction: normalizeDecimalAt(
          value.position.exitSize.positionFraction,
          "Rate",
          "/position/exitSize/positionFraction",
        ),
      },
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
