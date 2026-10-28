import { describe, expect, it } from "vitest";
import {
  InternalDecimal,
  crossAbove,
  crossBelow,
  evaluateBool,
  formatIndicatorOutput,
  isTriggered,
  within,
  type Series,
  type BoolExpression,
} from "../../core/strategy/index.js";
import { readJsonFixture } from "../helpers.js";

const golden = readJsonFixture("golden/expression-v1.json") as {
  nearThreshold: {
    previous: { a: string; b: string };
    current: { a: string; b: string };
    display: { previousA: string; previousB: string; currentA: string; currentB: string };
    crossAbove: boolean;
  };
  halfUp: { input: string; expected: string }[];
};

function series(values: (string | null)[]): Series {
  return values.map((value) => value === null ? null : new InternalDecimal(value));
}

describe("cross/within and internal three-valued logic", () => {
  it("crosses on internal values even when scale=8 displays are equal", () => {
    const { previous, current, display } = golden.nearThreshold;
    const left = series([previous.a, current.a]);
    const right = series([previous.b, current.b]);
    expect(crossAbove(left, right)).toEqual(["unavailable", golden.nearThreshold.crossAbove]);
    expect(formatIndicatorOutput(left[0]!)).toBe(display.previousA);
    expect(formatIndicatorOutput(right[0]!)).toBe(display.previousB);
    expect(formatIndicatorOutput(left[1]!)).toBe(display.currentA);
    expect(formatIndicatorOutput(right[1]!)).toBe(display.currentB);
  });

  it("uses frozen equality and unavailable rules", () => {
    expect(crossAbove(series(["1", "2", "2"]), series(["1", "1", "2"]))).toEqual(["unavailable", true, false]);
    expect(crossBelow(series(["1", "0", "0"]), series(["1", "1", "0"]))).toEqual(["unavailable", true, false]);
    expect(crossAbove(series([null, "2"]), series(["1", "1"]))).toEqual(["unavailable", "unavailable"]);
    expect(crossAbove(series(["1", null]), series(["1", "1"]))).toEqual(["unavailable", "unavailable"]);
  });

  it("requires a complete within window and propagates unavailable through not", () => {
    const condition = within([true, false, true], 3);
    expect(condition).toEqual(["unavailable", "unavailable", true]);
    const unknown = within([false, "unavailable", false], 3);
    expect(unknown).toEqual(["unavailable", "unavailable", "unavailable"]);
    const refs = { x: series([null]) };
    expect(evaluateBool({ not: { within: { window: 3, condition: { gt: [{ ref: "x" }, { const: "0" }] } } } }, { refs }, 1)).toEqual(["unavailable"]);
  });

  it("implements all/any short-circuit truth without erasing unknown", () => {
    const refs = { yes: series(["1"]), no: series(["0"]), unknown: series([null]) };
    const yes: BoolExpression = { gt: [{ ref: "yes" }, { const: "0" }] };
    const no: BoolExpression = { gt: [{ ref: "no" }, { const: "0" }] };
    const unknown: BoolExpression = { gt: [{ ref: "unknown" }, { const: "0" }] };
    expect(evaluateBool({ all: [no, unknown] }, { refs }, 1)).toEqual([false]);
    expect(evaluateBool({ all: [yes, unknown] }, { refs }, 1)).toEqual(["unavailable"]);
    expect(evaluateBool({ any: [yes, unknown] }, { refs }, 1)).toEqual([true]);
    expect(evaluateBool({ any: [no, unknown] }, { refs }, 1)).toEqual(["unavailable"]);
    expect(evaluateBool({ not: unknown }, { refs }, 1)).toEqual(["unavailable"]);
  });

  it("only true can trigger", () => {
    expect(isTriggered(true)).toBe(true);
    expect(isTriggered(false)).toBe(false);
    expect(isTriggered("unavailable")).toBe(false);
  });

  it("keeps frozen HALF_UP output boundaries", () => {
    for (const vector of golden.halfUp) {
      expect(formatIndicatorOutput(vector.input)).toBe(vector.expected);
    }
  });
});
