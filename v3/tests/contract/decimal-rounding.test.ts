import { describe, expect, it } from "vitest";
import {
  formatFinancialMoney,
  formatFinancialRate,
  formatIndicatorOutput,
  internalAdd,
  internalDivide,
  internalMultiply,
  internalSubtract,
  normalizeDecimal,
} from "../../core/strategy/index.js";

describe("decimal@1 external normalization", () => {
  it.each([
    ["Money", "1.2", "1.20"],
    ["Price", "1.234567", "1.234567"],
    ["Quantity", "2", "2.000000"],
    ["Rate", "0.5", "0.500000000000"],
    ["Scalar", "-0.000000000000", "0.000000000000"],
  ] as const)("normalizes %s", (type, input, expected) => {
    expect(normalizeDecimal(input, type)).toBe(expected);
  });

  it("accepts only all-zero digits beyond scale", () => {
    expect(normalizeDecimal("0.1234567890120", "Rate")).toBe("0.123456789012");
    expect(() => normalizeDecimal("0.1234567890123", "Rate")).toThrowError(
      expect.objectContaining({ code: "DECIMAL_SCALE_EXCEEDED" }),
    );
  });

  it("enforces lexical form, sign and range", () => {
    for (const input of ["+1", "01", "1e3", ".5", "1.", " 1", "NaN", "Infinity"]) {
      expect(() => normalizeDecimal(input, "Rate")).toThrow();
    }
    expect(() => normalizeDecimal("-1", "Price")).toThrowError(
      expect.objectContaining({ code: "DECIMAL_NEGATIVE_VALUE" }),
    );
    expect(() => normalizeDecimal("1234567890123456789", "Money")).toThrowError(
      expect.objectContaining({ code: "DECIMAL_INTEGER_DIGITS_EXCEEDED" }),
    );
    expect(() => normalizeDecimal("123456789012345678901234567890123456789", "Scalar")).toThrow();
  });
});

describe("rounding@1 internal and output boundaries", () => {
  it("finalises division to 64 significant digits with HALF_EVEN", () => {
    const result = internalDivide("1", "3").toString();
    expect(result).toBe(`0.${"3".repeat(64)}`);
  });

  it("finalises addition, subtraction and multiplication rather than failing at digit 65", () => {
    const tiny = `0.${"0".repeat(64)}1`;
    expect(internalAdd("1", tiny).toString()).toBe("1");
    expect(internalSubtract("1", tiny).toString()).toBe("1");
    expect(internalMultiply("1", tiny).toString()).toBe(`1e-65`);
  });

  it("rejects division by zero", () => {
    expect(() => internalDivide("1", "0")).toThrowError(
      expect.objectContaining({ code: "DIVISION_BY_ZERO" }),
    );
  });

  it("uses HALF_UP only at indicator output scale 8", () => {
    expect(formatIndicatorOutput("0.000000015")).toBe("0.00000002");
    expect(formatIndicatorOutput("0.000000025")).toBe("0.00000003");
    expect(internalAdd("0.000000015", "0").toFixed()).toBe("0.000000015");
  });

  it("uses the separate financial HALF_UP boundary", () => {
    expect(formatFinancialRate("0.1234567890125")).toBe("0.123456789013");
    expect(formatFinancialMoney("1.005")).toBe("1.01");
  });
});
