import type { BoolExpression, SeriesExpression, StrategyDraft } from "../generated/strategy-draft.types.js";
import { ContractError } from "../canonical/errors.js";
import type { IndicatorDefinition, Registry } from "../registry/types.js";

export interface WarmupStatus {
  readonly astMinimum: number;
  readonly extraObservations: number;
  readonly requiredPriorObservations: number;
  readonly actualPriorObservations: number;
}

export class InsufficientWarmupError extends ContractError {
  readonly status: WarmupStatus;
  constructor(status: WarmupStatus) {
    super("INSUFFICIENT_WARMUP", "Insufficient observations for strategy warmup");
    this.status = status;
  }
}

function indicatorWarmup(definition: IndicatorDefinition, output: string, params: Readonly<Record<string, number>>): number {
  if (definition.use === "macd@1") {
    if (output === "dif") return params.slow! - 1;
    if (output === "dea" || output === "hist") return params.slow! + params.signal! - 2;
  }
  if (definition.use === "kdj@1" && ["rsv", "k", "d", "j"].includes(output)) {
    return params.period! - 1;
  }
  throw new ContractError("UNKNOWN_INDICATOR_OUTPUT", `No warmup rule for ${definition.use}.${output}`);
}

function refWarmup(ref: string, strategy: StrategyDraft, registry: Registry): number {
  const separator = ref.indexOf(".");
  if (separator < 0) return 0;
  const id = ref.slice(0, separator);
  const output = ref.slice(separator + 1);
  const usage = strategy.indicators[id];
  if (!usage) return 0;
  const definition = registry.indicators.get(usage.use);
  if (!definition) {
    throw new ContractError("UNKNOWN_INDICATOR", `Unknown indicator: ${usage.use}`);
  }
  const params = Object.fromEntries(Object.entries(usage.params ?? {}).map(([key, value]) => [key, Number(value)]));
  return indicatorWarmup(definition, output, params);
}

function seriesWithStrategy(expression: SeriesExpression, strategy: StrategyDraft, registry: Registry): number {
  if ("ref" in expression) return refWarmup(expression.ref, strategy, registry);
  if ("const" in expression) return 0;
  if ("lag" in expression) return seriesWithStrategy(expression.lag.input, strategy, registry) + expression.lag.periods;
  if ("registeredSeriesFn" in expression) throw new ContractError("UNKNOWN_SERIES_FUNCTION", "Unknown registered series function");
  if ("add" in expression) return Math.max(seriesWithStrategy(expression.add[0], strategy, registry), seriesWithStrategy(expression.add[1], strategy, registry));
  if ("sub" in expression) return Math.max(seriesWithStrategy(expression.sub[0], strategy, registry), seriesWithStrategy(expression.sub[1], strategy, registry));
  if ("mul" in expression) return Math.max(seriesWithStrategy(expression.mul[0], strategy, registry), seriesWithStrategy(expression.mul[1], strategy, registry));
  if ("div" in expression) return Math.max(seriesWithStrategy(expression.div[0], strategy, registry), seriesWithStrategy(expression.div[1], strategy, registry));
  throw new ContractError("UNKNOWN_SERIES_EXPRESSION", "Unknown SeriesExpression");
}

function boolWarmup(expression: BoolExpression, strategy: StrategyDraft, registry: Registry): number {
  for (const operator of ["gt", "gte", "lt", "lte", "eq", "neq", "crossAbove", "crossBelow"] as const) {
    if (operator in expression) {
      const pair = (expression as unknown as Record<string, [SeriesExpression, SeriesExpression]>)[operator]!;
      const base = Math.max(seriesWithStrategy(pair[0], strategy, registry), seriesWithStrategy(pair[1], strategy, registry));
      return operator === "crossAbove" || operator === "crossBelow" ? base + 1 : base;
    }
  }
  if ("all" in expression) return Math.max(...expression.all.map((item) => boolWarmup(item, strategy, registry)));
  if ("any" in expression) return Math.max(...expression.any.map((item) => boolWarmup(item, strategy, registry)));
  if ("not" in expression) return boolWarmup(expression.not, strategy, registry);
  if ("within" in expression) return boolWarmup(expression.within.condition, strategy, registry) + expression.within.window - 1;
  throw new ContractError("UNKNOWN_BOOL_EXPRESSION", "Unknown BoolExpression");
}

export function deriveStrategyWarmup(strategy: StrategyDraft, registry: Registry): number {
  return Math.max(
    boolWarmup(strategy.entry, strategy, registry),
    ...strategy.exits.map((expression) => boolWarmup(expression, strategy, registry)),
  );
}

export function checkWarmup(
  strategy: StrategyDraft,
  registry: Registry,
  actualPriorObservations: number,
  extraObservations: number,
): WarmupStatus {
  if (!Number.isSafeInteger(actualPriorObservations) || actualPriorObservations < 0 ||
      !Number.isSafeInteger(extraObservations) || extraObservations < 0) {
    throw new ContractError("INVALID_WARMUP", "Warmup observations must be non-negative safe integers");
  }
  const astMinimum = deriveStrategyWarmup(strategy, registry);
  const status = {
    astMinimum,
    extraObservations,
    requiredPriorObservations: astMinimum + extraObservations,
    actualPriorObservations,
  };
  if (actualPriorObservations < status.requiredPriorObservations) {
    throw new InsufficientWarmupError(status);
  }
  return status;
}
