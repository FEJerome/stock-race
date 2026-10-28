import { describe, expect, it } from "vitest";
import {
  assertValidStrategyDraft,
  validateStrategyDraft,
  validateValidationIssue,
} from "../../core/strategy/index.js";
import { readJsonFixture } from "../helpers.js";

describe("strategy-draft JSON Schema", () => {
  it("accepts the frozen MACD+KDJ example", () => {
    const value = readJsonFixture("fixtures/strategy/valid/macd-kdj.json");
    expect(validateStrategyDraft(value)).toEqual([]);
    expect(() => assertValidStrategyDraft(value)).not.toThrow();
  });

  it("rejects an additional field at its exact JSON Pointer", () => {
    const issues = validateStrategyDraft(readJsonFixture("fixtures/strategy/invalid/extra-field.json"));
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ADDITIONAL_PROPERTY", path: "/indicators/m/unexpected" }),
      ]),
    );
  });

  it("rejects an unknown schema version", () => {
    const issues = validateStrategyDraft(readJsonFixture("fixtures/strategy/invalid/unknown-version.json"));
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNSUPPORTED_SCHEMA_VERSION", path: "/schemaVersion" }),
      ]),
    );
  });

  it("rejects JSON numeric continuous constants", () => {
    const issues = validateStrategyDraft(readJsonFixture("fixtures/strategy/invalid/numeric-const.json"));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => issue.path.includes("/entry"))).toBe(true);
  });

  it("maps required fields to the missing property path and sorts errors", () => {
    const issues = validateStrategyDraft({ schemaVersion: "1.0.0" });
    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REQUIRED_PROPERTY", path: "/name" })]),
    );
    const paths = issues.map((issue) => `${issue.path}\u0000${issue.code}\u0000${issue.message}`);
    expect(paths).toEqual([...paths].sort());
  });

  it("rejects negative lag without relying on registry validation", () => {
    const value = readJsonFixture("fixtures/strategy/valid/macd-kdj.json") as Record<string, unknown>;
    value.entry = { gt: [{ lag: { input: { ref: "m.dif" }, periods: -1 } }, { const: "0" }] };
    expect(validateStrategyDraft(value).length).toBeGreaterThan(0);
  });
});

describe("validation-issue JSON Schema", () => {
  it("accepts the contract issue shape", () => {
    expect(validateValidationIssue({
      code: "UNKNOWN_INDICATOR",
      severity: "error",
      path: "/indicators/m/use",
      message: "未注册的指标或版本",
      expected: "registry 中的 key@version",
      actual: "macd@99",
      hint: "选择能力清单中的指标",
      registryRef: null,
    })).toEqual([]);
  });

  it("rejects additional fields and invalid JSON Pointers", () => {
    const issues = validateValidationIssue({
      code: "X",
      severity: "error",
      path: "not-a-pointer",
      message: "bad",
      extra: true,
    });
    expect(issues.length).toBeGreaterThan(0);
  });
});
