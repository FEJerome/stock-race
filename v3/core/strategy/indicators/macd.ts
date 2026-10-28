import type Decimal from "decimal.js";
import {
  InternalDecimal,
  internalAdd,
  internalDivide,
  internalMultiply,
  internalSubtract,
} from "../canonical/rounding-profile.js";
import type { Series } from "../registry/types.js";
import type { IndicatorInput, IndicatorParams } from "../registry/types.js";

export interface MacdParams extends IndicatorParams {
  readonly fast: number;
  readonly slow: number;
  readonly signal: number;
}

export interface MacdComputation {
  readonly series: Readonly<Record<"fast" | "slow" | "dif" | "dea" | "hist", Series>>;
}

function sma(values: readonly Decimal[]): Decimal {
  const sum = values.reduce<Decimal>((total, value) => internalAdd(total, value), new InternalDecimal(0));
  return internalDivide(sum, String(values.length));
}

function ema(values: readonly Decimal[], period: number): Series {
  const output: (Decimal | null)[] = Array.from({ length: values.length }, () => null);
  if (values.length < period) {
    return output;
  }
  const alpha = internalDivide("2", String(period + 1));
  const complement = internalSubtract("1", alpha);
  let previous = sma(values.slice(0, period));
  output[period - 1] = previous;
  for (let index = period; index < values.length; index += 1) {
    previous = internalAdd(
      internalMultiply(alpha, values[index]!),
      internalMultiply(complement, previous),
    );
    output[index] = previous;
  }
  return output;
}

function subtractSeries(left: Series, right: Series): Series {
  return left.map((value, index) => value === null || right[index] === null
    ? null
    : internalSubtract(value, right[index]!));
}

export function computeMacd(input: IndicatorInput, params: MacdParams): MacdComputation {
  const close = input.observations.map((observation) => new InternalDecimal(
    input.observationKind === "nav" ? observation.unitNav! : observation.close!,
  ));
  const fast = ema(close, params.fast);
  const slow = ema(close, params.slow);
  const dif = subtractSeries(fast, slow);
  const firstDif = params.slow - 1;
  const validDif = dif.slice(firstDif).map((value) => value!);
  const validDea = ema(validDif, params.signal);
  const dea: (Decimal | null)[] = Array.from({ length: close.length }, () => null);
  validDea.forEach((value, index) => {
    dea[firstDif + index] = value;
  });
  const hist = dif.map((value, index) => value === null || dea[index] === null
    ? null
    : internalMultiply("2", internalSubtract(value, dea[index]!)));
  return { series: { fast, slow, dif, dea, hist } };
}
