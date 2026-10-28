import { describe, expect, it } from "vitest";
import { parseJsonInput } from "../../core/strategy/index.js";

describe("json-input lossless number tokens", () => {
  it.each(["1.0", "1e0", "1e3", "0.5", "01", "9007199254740992", "-9007199254740992"])(
    "rejects %s before JS Number conversion",
    (token) => {
      expect(() => parseJsonInput(`{"n":${token}}`)).toThrowError(
        expect.objectContaining({ code: "UNSAFE_JSON_NUMBER_TOKEN" }),
      );
    },
  );

  it("accepts safe integer tokens and canonical negative zero", () => {
    expect(parseJsonInput('{"max":9007199254740991,"min":-9007199254740991,"zero":-0}')).toEqual({
      max: 9007199254740991,
      min: -9007199254740991,
      zero: -0,
    });
  });

  it("does not inspect digits inside strings as number tokens", () => {
    expect(parseJsonInput('{"s":"1.0 1e3 9007199254740992"}')).toEqual({
      s: "1.0 1e3 9007199254740992",
    });
  });

  it("rejects raw duplicate keys", () => {
    expect(() => parseJsonInput('{"a":1,"a":2}')).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_JSON_KEY" }),
    );
  });

  it("rejects malformed JSON and excessive depth", () => {
    expect(() => parseJsonInput('{"a":')).toThrowError(
      expect.objectContaining({ code: "INVALID_JSON" }),
    );
    const excessive = `${"[".repeat(65)}0${"]".repeat(65)}`;
    expect(() => parseJsonInput(excessive)).toThrowError(
      expect.objectContaining({ code: "JSON_DEPTH_EXCEEDED" }),
    );
  });
});
