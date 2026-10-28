import type { StrategyDraft } from "../generated/strategy-draft.types.js";
import { ContractError } from "../canonical/errors.js";
import { InternalDecimal } from "../canonical/rounding-profile.js";
import type { IndicatorInput, Registry, Series } from "../registry/types.js";
import type { BoolSeries } from "./types.js";
import { evaluateBool } from "./boolean.js";

export interface StrategyEvaluationInput extends IndicatorInput {
  readonly contextRefs?: Readonly<Record<string, Series>>;
}

export interface StrategyEvaluation {
  readonly indicators: Readonly<Record<string, Series>>;
  readonly entry: BoolSeries;
  readonly exits: readonly BoolSeries[];
}

export function evaluateStrategy(
  strategy: StrategyDraft,
  registry: Registry,
  input: StrategyEvaluationInput,
): StrategyEvaluation {
  const length = input.observations.length;
  const refs: Record<string, Series> = {};
  for (const definition of registry.contextRefs) {
    if (!definition.observationKinds.includes(input.observationKind)) {
      continue;
    }
    if (input.observations.every((observation) => observation[definition.ref] !== undefined)) {
      refs[definition.ref] = input.observations.map((observation) => {
        const value = observation[definition.ref];
        return value === undefined ? null : new InternalDecimal(value);
      });
    }
  }

  const indicators: Record<string, Series> = {};
  for (const [id, indicator] of Object.entries(strategy.indicators)) {
    const definition = registry.indicators.get(indicator.use);
    if (!definition) {
      throw new ContractError("UNKNOWN_INDICATOR", `Unknown indicator: ${indicator.use}`);
    }
    if (!definition.observationKinds.includes(input.observationKind)) {
      throw new ContractError("OBSERVATION_KIND_UNSUPPORTED", `${indicator.use} does not support ${input.observationKind}`);
    }
    const params = Object.fromEntries(Object.entries(indicator.params ?? {}).map(([key, value]) => [key, Number(value)]));
    const computed = definition.compute(input, params).series;
    for (const output of definition.outputs) {
      const ref = `${id}.${output.name}`;
      indicators[ref] = computed[output.name]!;
      refs[ref] = computed[output.name]!;
    }
  }

  for (const [ref, series] of Object.entries(input.contextRefs ?? {})) {
    if (series.length !== length) {
      throw new ContractError(
        "CONTEXT_REF_LENGTH_MISMATCH",
        `Context ref ${ref} has ${series.length} observations; expected ${length}`,
      );
    }
    if (refs[ref] !== undefined) {
      throw new ContractError("CONTEXT_REF_CONFLICT", `Context ref cannot override authoritative series: ${ref}`);
    }
    refs[ref] = series;
  }

  return {
    indicators,
    entry: evaluateBool(strategy.entry, { refs }, length),
    exits: strategy.exits.map((expression) => evaluateBool(expression, { refs }, length)),
  };
}
