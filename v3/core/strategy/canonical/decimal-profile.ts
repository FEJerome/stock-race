import Decimal from "decimal.js";
import { ContractError } from "./errors.js";

export type DecimalValueType = "Money" | "Price" | "Quantity" | "Rate" | "Scalar";

export const DECIMAL_PROFILE = {
  version: "decimal@1",
  precision: 64,
  maxIntegerDigits: 18,
  maxSignificantDigits: 38,
  values: {
    Money: { scale: 2, signed: true },
    Price: { scale: 6, signed: false },
    Quantity: { scale: 6, signed: false },
    Rate: { scale: 12, signed: true },
    Scalar: { scale: 12, signed: true },
  },
} as const;

const DECIMAL_PATTERN = /^-?(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

export function normalizeDecimal(input: string, type: DecimalValueType): string {
  const match = DECIMAL_PATTERN.exec(input);
  if (!match) {
    throw new ContractError("INVALID_DECIMAL_STRING", `Invalid decimal string for ${type}`);
  }

  const { scale, signed } = DECIMAL_PROFILE.values[type];
  const fraction = match[2] ?? "";
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) {
    throw new ContractError(
      "DECIMAL_SCALE_EXCEEDED",
      `${type} accepts scale ${scale}; non-zero digits beyond scale are forbidden`,
    );
  }

  const value = new Decimal(input);
  if (!value.isFinite()) {
    throw new ContractError("NON_FINITE_DECIMAL", `${type} must be finite`);
  }
  if (value.isZero()) {
    return `0.${"0".repeat(scale)}`;
  }
  if (!signed && value.isNegative()) {
    throw new ContractError("DECIMAL_NEGATIVE_VALUE", `${type} must be non-negative`);
  }

  const canonical = value.toFixed(scale);
  const unsigned = canonical.startsWith("-") ? canonical.slice(1) : canonical;
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  const integerDigits = integerPart === "0" ? 0 : integerPart?.length ?? 0;
  if (integerDigits > DECIMAL_PROFILE.maxIntegerDigits) {
    throw new ContractError(
      "DECIMAL_INTEGER_DIGITS_EXCEEDED",
      `${type} exceeds ${DECIMAL_PROFILE.maxIntegerDigits} integer digits`,
    );
  }

  const significantDigits = `${integerPart}${fractionPart}`.replace(/^0+/, "").length;
  if (significantDigits > DECIMAL_PROFILE.maxSignificantDigits) {
    throw new ContractError(
      "DECIMAL_SIGNIFICANT_DIGITS_EXCEEDED",
      `${type} exceeds ${DECIMAL_PROFILE.maxSignificantDigits} significant digits`,
    );
  }
  return canonical;
}
