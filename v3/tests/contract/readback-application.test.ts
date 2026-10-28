import { describe, expect, it } from "vitest";
import {
  canonicalizeStrategyDraft,
  createAuthoritativeReadback,
  createRegistryV1,
  digestStrategyDraft,
  validateReadback,
  type StrategyDraft,
} from "../../core/strategy/index.js";
import { validateStrategyUseCase } from "../../application/validate-strategy/index.js";
import { readJsonFixture } from "../helpers.js";

const strategy = readJsonFixture("fixtures/strategy/valid/macd-kdj.json") as StrategyDraft;
const golden = readJsonFixture("golden/readback-v1.json") as {
  summary: string;
  clauses: { astPath: string; text: string }[];
};
const registry = createRegistryV1();

describe("authoritative readback", () => {
  it("matches the pre-authored deterministic template golden", () => {
    const readback = createAuthoritativeReadback(canonicalizeStrategyDraft(strategy), registry);
    expect(readback.summary).toBe(golden.summary);
    expect(readback.clauses).toEqual(golden.clauses);
    expect(readback.text).toBe([golden.summary, ...golden.clauses.map((clause) => clause.text)].join("\n"));
    expect(readback.strategyDigest).toBe(digestStrategyDraft(strategy));
    expect(validateReadback(readback)).toEqual([]);
  });

  it("is deterministic and changes with confirmed executable semantics", () => {
    const first = createAuthoritativeReadback(canonicalizeStrategyDraft(strategy), registry);
    const second = createAuthoritativeReadback(canonicalizeStrategyDraft(strategy), registry);
    expect(second).toEqual(first);
    const changed = {
      ...strategy,
      position: { ...strategy.position, entrySize: { cashFraction: "0.51" } },
    } as StrategyDraft;
    expect(createAuthoritativeReadback(canonicalizeStrategyDraft(changed), registry).text).not.toBe(first.text);
  });

  it("rejects malformed readback output", () => {
    const readback = createAuthoritativeReadback(canonicalizeStrategyDraft(strategy), registry);
    expect(validateReadback({ ...readback, strategyDigest: "bad" }).length).toBeGreaterThan(0);
  });
});

describe("application validate-strategy pipeline", () => {
  it("returns schema+semantic valid canonical AST, digest and readback", () => {
    const result = validateStrategyUseCase(strategy, { observationKind: "ohlcv" });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.canonicalAst).toBe(canonicalizeStrategyDraft(strategy));
    expect(result.strategyDigest).toBe(digestStrategyDraft(strategy));
    expect(result.readback?.clauses).toEqual(golden.clauses);
  });

  it("accepts raw JSON input without model involvement", () => {
    expect(validateStrategyUseCase(JSON.stringify(strategy)).ok).toBe(true);
  });

  it("carries observation kind through semantic validation and readback", () => {
    const navStrategy = {
      ...strategy,
      indicators: { m: strategy.indicators.m! },
      entry: { gt: [{ ref: "m.dif" }, { const: "0" }] },
      exits: [{ lt: [{ ref: "m.dif" }, { const: "0" }] }],
    } as StrategyDraft;
    const result = validateStrategyUseCase(navStrategy, { observationKind: "nav" });
    expect(result.ok).toBe(true);
    expect(result.readback).not.toBeNull();
  });

  it("returns schema failures without canonical artifacts", () => {
    const invalid = readJsonFixture("fixtures/strategy/invalid/numeric-const.json");
    const result = validateStrategyUseCase(invalid);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.canonicalAst).toBeNull();
    expect(result.strategyDigest).toBeNull();
    expect(result.readback).toBeNull();
  });

  it("maps continuous const canonical errors to unified failure with exact path", () => {
    const invalid = {
      ...strategy,
      entry: { lt: [{ ref: "k.j" }, { const: "90.0000000000001" }] },
    } as StrategyDraft;
    const result = validateStrategyUseCase(invalid);
    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "DECIMAL_SCALE_EXCEEDED", path: "/entry/lt/1/const" })],
      canonicalAst: null,
      strategyDigest: null,
      readback: null,
    });
  });

  it("maps cashFraction canonical errors to unified failure with exact path", () => {
    const invalid = {
      ...strategy,
      position: { ...strategy.position, entrySize: { cashFraction: "0.5000000000001" } },
    } as StrategyDraft;
    const result = validateStrategyUseCase(invalid);
    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "DECIMAL_SCALE_EXCEEDED", path: "/position/entrySize/cashFraction" })],
      canonicalAst: null,
      strategyDigest: null,
      readback: null,
    });
  });

  it("returns semantic failures with accurate paths", () => {
    const invalid = {
      ...strategy,
      indicators: { m: { use: "macd@99", params: { fast: 12, slow: 26, signal: 9 } } },
    };
    const result = validateStrategyUseCase(invalid);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNKNOWN_INDICATOR", path: "/indicators/m/use" }),
    ]));
    expect(result.readback).toBeNull();
  });
});
