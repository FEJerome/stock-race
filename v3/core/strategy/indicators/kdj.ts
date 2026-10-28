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

export interface KdjParams extends IndicatorParams {
  readonly period: number;
  readonly kSmooth: number;
  readonly dSmooth: number;
}

export interface KdjComputation {
  readonly series: Readonly<Record<"rsv" | "k" | "d" | "j", Series>>;
}

export function computeKdj(input: IndicatorInput, params: KdjParams): KdjComputation {
  const length = input.observations.length;
  const rsv: (Decimal | null)[] = Array.from({ length }, () => null);
  const k: (Decimal | null)[] = Array.from({ length }, () => null);
  const d: (Decimal | null)[] = Array.from({ length }, () => null);
  const j: (Decimal | null)[] = Array.from({ length }, () => null);
  let previousK = new InternalDecimal(50);
  let previousD = new InternalDecimal(50);

  for (let index = params.period - 1; index < length; index += 1) {
    const window = input.observations.slice(index - params.period + 1, index + 1);
    const close = new InternalDecimal(input.observations[index]!.close!);
    const highest = window.reduce<Decimal>(
      (value, observation) => {
        const high = new InternalDecimal(observation.high!);
        return high.gt(value) ? high : value;
      },
      new InternalDecimal(window[0]!.high!),
    );
    const lowest = window.reduce<Decimal>(
      (value, observation) => {
        const low = new InternalDecimal(observation.low!);
        return low.lt(value) ? low : value;
      },
      new InternalDecimal(window[0]!.low!),
    );
    const denominator = internalSubtract(highest, lowest);
    const currentRsv = denominator.isZero()
      ? new InternalDecimal(50)
      : internalDivide(internalMultiply("100", internalSubtract(close, lowest)), denominator);
    const currentK = internalAdd(previousK, internalDivide(internalSubtract(currentRsv, previousK), String(params.kSmooth)));
    const currentD = internalAdd(previousD, internalDivide(internalSubtract(currentK, previousD), String(params.dSmooth)));
    const currentJ = internalSubtract(internalMultiply("3", currentK), internalMultiply("2", currentD));
    rsv[index] = currentRsv;
    k[index] = currentK;
    d[index] = currentD;
    j[index] = currentJ;
    previousK = currentK;
    previousD = currentD;
  }
  return { series: { rsv, k, d, j } };
}
