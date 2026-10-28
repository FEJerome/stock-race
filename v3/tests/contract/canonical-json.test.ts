import { describe, expect, it } from "vitest";
import {
  canonicalizeJson,
  digestCanonical,
  normalizeDecimal,
  type DecimalValueType,
} from "../../core/strategy/index.js";
import { readJsonFixture } from "../helpers.js";

interface GoldenVector {
  caseId: string;
  input: { rate?: string; s?: string } | Record<string, unknown>;
  decimalType?: DecimalValueType;
  canonical: string;
  canonicalHex?: string;
  digest: string;
}

const vectors = readJsonFixture("golden/canonical-vectors.json") as GoldenVector[];

function normalizedInput(vector: GoldenVector): unknown {
  if (vector.decimalType && "rate" in vector.input && typeof vector.input.rate === "string") {
    return { rate: normalizeDecimal(vector.input.rate, vector.decimalType) };
  }
  return vector.input;
}

describe("canonical JSON frozen vectors", () => {
  for (const vector of vectors) {
    it(vector.caseId, () => {
      const canonical = canonicalizeJson(normalizedInput(vector));
      expect(canonical).toBe(vector.canonical);
      if (vector.canonicalHex) {
        expect(Buffer.from(canonical, "utf8").toString("hex")).toBe(vector.canonicalHex);
      }
      expect(digestCanonical(canonical)).toBe(vector.digest);
    });
  }

  it("normalizes negative JSON zero", () => {
    expect(canonicalizeJson(-0)).toBe("0");
  });

  it("uses all fixed control escapes and leaves U+2028 unescaped", () => {
    expect(canonicalizeJson("\u0000\u0001\b\t\n\f\r\u001f")).toBe(
      '"\\u0000\\u0001\\b\\t\\n\\f\\r\\u001f"',
    );
    expect(canonicalizeJson(" ")).toBe('" "');
  });

  it("rejects non-integer and non-finite JSON numbers", () => {
    expect(() => canonicalizeJson(1.5)).toThrowError(expect.objectContaining({ code: "UNSAFE_JSON_NUMBER" }));
    expect(() => canonicalizeJson(Number.MAX_SAFE_INTEGER + 1)).toThrowError(
      expect.objectContaining({ code: "UNSAFE_JSON_NUMBER" }),
    );
    expect(() => canonicalizeJson(Number.NaN)).toThrowError(
      expect.objectContaining({ code: "UNSAFE_JSON_NUMBER" }),
    );
  });

  it("does not case-fold or compatibility-normalize full-width keys", () => {
    expect(canonicalizeJson({ "Ａ": 3, a: 2, A: 1 })).toBe('{"A":1,"a":2,"Ａ":3}');
  });

  it("rejects NFC key collisions and unpaired surrogates", () => {
    expect(() => canonicalizeJson({ "Å": 1, "Å": 2 })).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_NFC_KEY" }),
    );
    expect(() => canonicalizeJson("\ud800")).toThrowError(
      expect.objectContaining({ code: "UNPAIRED_SURROGATE" }),
    );
  });
});
