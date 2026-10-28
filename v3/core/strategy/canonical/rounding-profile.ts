import Decimal from "decimal.js";
import { ContractError } from "./errors.js";

export type InternalDecimalInput = string | Decimal;

export const InternalDecimal = Decimal.clone({
  precision: 64,
  rounding: Decimal.ROUND_HALF_EVEN,
});

function toInternalDecimal(input: InternalDecimalInput): Decimal {
  try {
    const value = new InternalDecimal(input);
    if (!value.isFinite()) {
      throw new ContractError("NON_FINITE_INTERNAL_DECIMAL", "Internal decimal must be finite");
    }
    return value;
  } catch (error) {
    if (error instanceof ContractError) {
      throw error;
    }
    throw new ContractError("INVALID_INTERNAL_DECIMAL", "Invalid internal decimal input");
  }
}

function finalise(value: Decimal): Decimal {
  if (!value.isFinite()) {
    throw new ContractError("NON_FINITE_INTERNAL_DECIMAL", "Internal decimal result must be finite");
  }
  const rounded = value.toSignificantDigits(64, Decimal.ROUND_HALF_EVEN);
  return rounded.isZero() ? new InternalDecimal(0) : rounded;
}

function formatHalfUp(value: InternalDecimalInput, scale: number): string {
  const rounded = toInternalDecimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  return rounded.isZero() ? `0.${"0".repeat(scale)}` : rounded.toFixed(scale);
}

export function internalAdd(left: InternalDecimalInput, right: InternalDecimalInput): Decimal {
  return finalise(toInternalDecimal(left).plus(toInternalDecimal(right)));
}

export function internalSubtract(left: InternalDecimalInput, right: InternalDecimalInput): Decimal {
  return finalise(toInternalDecimal(left).minus(toInternalDecimal(right)));
}

export function internalMultiply(left: InternalDecimalInput, right: InternalDecimalInput): Decimal {
  return finalise(toInternalDecimal(left).times(toInternalDecimal(right)));
}

export function internalDivide(left: InternalDecimalInput, right: InternalDecimalInput): Decimal {
  const divisor = toInternalDecimal(right);
  if (divisor.isZero()) {
    throw new ContractError("DIVISION_BY_ZERO", "Internal decimal division by zero");
  }
  return finalise(toInternalDecimal(left).div(divisor));
}

export function formatIndicatorOutput(value: InternalDecimalInput): string {
  return formatHalfUp(value, 8);
}

export function formatFinancialRate(value: InternalDecimalInput): string {
  return formatHalfUp(value, 12);
}

export function formatFinancialMoney(value: InternalDecimalInput): string {
  return formatHalfUp(value, 2);
}
