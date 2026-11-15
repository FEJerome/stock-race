import { describe, expect, it } from "vitest";
import { draftStrategy } from "../../application/draft-strategy/index.js";
import {
  canonicalizeStrategyDraft,
  digestStrategyDraft,
} from "../../core/strategy/canonical/strategy-canonical.js";
import { readJsonFixture } from "../helpers.js";
import { fakePort } from "../s3-helpers.js";

describe("S3 draft pipeline (driven by the deterministic fake, contract 7.2 S3 row)", () => {
  it("s3-draft-legal: legal-macd-kdj passes in one round with canonicalAst/digest/readback all present", async () => {
    const result = await draftStrategy(fakePort("legal-macd-kdj"), {
      intent: "MACD 三日内金叉，KDJ 过滤",
    });
    if (!result.ok) throw new Error(`expected valid, got ${result.status}`);
    const fixture = readJsonFixture("fixtures/s3/legal-macd-kdj.json");
    expect(result.status).toBe("valid");
    expect(result.canonicalAst).toBe(canonicalizeStrategyDraft(fixture));
    expect(result.strategyDigest).toBe(digestStrategyDraft(fixture));
    expect(result.readback.strategyDigest).toBe(result.strategyDigest);
    expect(result.readback.text).toContain("MACD 三日内金叉，KDJ 过滤");
    expect(result.attempts).toBe(1);
    expect(result.provenance).toHaveLength(1);
    expect(result.provenance[0]).toMatchObject({
      provider: "deterministic-fake",
      modelId: "deterministic-fake",
      attempt: 0,
      latencyMs: 0,
    });
  });

  it("s3-draft-bad-json: truncated JSON rejected at the json-input boundary, no digest", async () => {
    const result = await draftStrategy(fakePort("bad-json-truncated"), { intent: "任意" });
    if (result.ok || result.status !== "invalid") throw new Error("expected invalid");
    expect("strategyDigest" in result).toBe(false);
    expect(result.issues.some((issue) => issue.code === "INVALID_JSON")).toBe(true);
    expect(result.attempts).toBe(2); // repeated canned output is byte-identical → repair makes no progress and stops early
  });

  it("s3-draft-unknown-indicator: macd@99 → UNKNOWN_INDICATOR", async () => {
    const result = await draftStrategy(fakePort("unknown-indicator"), { intent: "任意" });
    if (result.ok || result.status !== "invalid") throw new Error("expected invalid");
    expect(
      result.issues.some((issue) => issue.code === "UNKNOWN_INDICATOR" && issue.path === "/indicators/m/use"),
    ).toBe(true);
  });

  it("s3-draft-extra-field: additionalProperties rejected", async () => {
    const result = await draftStrategy(fakePort("extra-field"), { intent: "任意" });
    if (result.ok || result.status !== "invalid") throw new Error("expected invalid");
    expect(result.issues.some((issue) => issue.code === "ADDITIONAL_PROPERTY")).toBe(true);
  });

  it("s3-draft-numeric-const: const as JSON number → UNSAFE_JSON_NUMBER_TOKEN", async () => {
    const result = await draftStrategy(fakePort("numeric-const"), { intent: "任意" });
    if (result.ok || result.status !== "invalid") throw new Error("expected invalid");
    expect(result.issues.some((issue) => issue.code === "UNSAFE_JSON_NUMBER_TOKEN")).toBe(true);
  });

  it("s3-draft-future-reference: undeclared ref → UNKNOWN_REFERENCE", async () => {
    const result = await draftStrategy(fakePort("future-reference"), { intent: "任意" });
    if (result.ok || result.status !== "invalid") throw new Error("expected invalid");
    expect(result.issues.some((issue) => issue.code === "UNKNOWN_REFERENCE")).toBe(true);
  });

  it("s3-draft-repair-success: attempt0 broken → issues fed back → attempt1 legal", async () => {
    const port = fakePort("repair-success-at-attempt-1");
    const result = await draftStrategy(port, { intent: "先错后对" });
    if (!result.ok) throw new Error(`expected valid, got ${result.status}`);
    expect(result.attempts).toBe(2);
    expect(result.provenance.map((entry) => entry.attempt)).toEqual([0, 1]);
    expect(port.requests).toHaveLength(2);
    expect(port.requests[1]!.attempt).toBe(1);
    expect(port.requests[1]!.kind).toBe("repair");
    const repair = port.requests[1]!;
    if (repair.kind !== "repair") throw new Error("expected repair request");
    expect(repair.repairIssues.length).toBeGreaterThan(0);
    expect(repair.repairIssues.some((issue) => issue.code === "UNKNOWN_INDICATOR")).toBe(true);
    expect(repair.capabilityManifest.manifestVersion).toBe("1.0.0");
  });

  it("s3-draft-repair-exhausted: still broken after two rounds → REPAIR_EXHAUSTED/model-error, port called exactly 3 times", async () => {
    const port = fakePort("repair-exhausted");
    const result = await draftStrategy(port, { intent: "屡修屡坏" });
    if (result.ok || result.status !== "model-error") throw new Error("expected model-error");
    expect(result.errorCode).toBe("REPAIR_EXHAUSTED");
    expect(result.issues).not.toBeNull();
    expect(result.intent).toBe("屡修屡坏");
    expect(port.requests).toHaveLength(3); // initial + 2 repairs; a 4th call never happens
    expect(result.attempts).toBe(3);
  });

  it("s3-draft-timeout: port timeout → model-error, intent preserved, no repair or upward retry", async () => {
    const result = await draftStrategy(fakePort("timeout"), { intent: "会超时的意图" });
    if (result.ok || result.status !== "model-error") throw new Error("expected model-error");
    expect(result.errorCode).toBe("TIMEOUT");
    expect(result.intent).toBe("会超时的意图");
    expect(result.lastRawText).toBeNull();
    expect(result.attempts).toBe(1);
    expect(result.provenance[0]!.errorClass).toBe("TIMEOUT");
  });

  it("s3-draft-transport-error: transport 5xx → model-error, no fallback to fake", async () => {
    const result = await draftStrategy(fakePort("transport-5xx"), { intent: "服务不可用" });
    if (result.ok || result.status !== "model-error") throw new Error("expected model-error");
    expect(result.errorCode).toBe("UNAVAILABLE");
    expect(result.intent).toBe("服务不可用");
    expect(result.attempts).toBe(1);
  });

  it("s3-draft-observation-kind: kdj@1 is ohlcv-only, OBSERVATION_KIND_UNSUPPORTED under nav kind", async () => {
    const result = await draftStrategy(fakePort("legal-kdj-only"), {
      intent: "基金净值上跑 KDJ",
      observationKind: "nav",
    });
    if (result.ok || result.status !== "invalid") throw new Error("expected invalid");
    expect(
      result.issues.some((issue) => issue.code === "OBSERVATION_KIND_UNSUPPORTED"),
    ).toBe(true);
  });
});
