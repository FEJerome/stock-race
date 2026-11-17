import { describe, expect, it } from "vitest";
import {
  canonicalizeStrategyDraft2,
  digestStrategyDraft2,
  digestCanonical,
  digestJson,
  validateRunSpec2,
  validateSensitivityReport,
  validateStrategyDraft2,
  validateReport2,
  validateCapabilityManifest,
  createCapabilityManifest,
  createRegistryV1,
} from "../../core/strategy/index.js";
import { normalizeRunSpec2 } from "../../core/market/run-spec-2.js";
import { canonicalizeJson } from "../../core/strategy/index.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import type { RunSpec2 } from "../../core/strategy/generated/run-spec-2.types.js";
import { readJsonFixture } from "../helpers.js";

interface CanonicalVector {
  caseId: string;
  kind: "strategy-draft-2" | "run-spec-2";
  input: StrategyDraft2 | RunSpec2;
  canonical: string;
  digest: string;
}

const vectorFile = readJsonFixture("golden/s4-canonical-vectors.json") as CanonicalVector[];

const validFcfsDraft = (readJsonFixture("golden/s4-canonical-vectors.json") as { input: StrategyDraft2 }[])[0]!.input;

function issuesOf(value: unknown): { code: string; path: string }[] {
  return validateStrategyDraft2(value).map((issue) => ({ code: issue.code, path: issue.path }));
}

function hasIssue(issues: { code: string; path: string }[], code: string, path: string): boolean {
  return issues.some((issue) => issue.code === code && issue.path === path);
}

describe("S4 StrategyDraft 2.0.0 positive vectors", () => {
  it("accepts a complete four-cell first-come-first-served draft with zero issues", () => {
    expect(validateStrategyDraft2(validFcfsDraft)).toEqual([]);
    expect(() => canonicalizeStrategyDraft2(validFcfsDraft)).not.toThrow();
  });

  it("accepts a complete four-cell equal-split draft with zero issues", () => {
    const draft = vectorFile[1]!.input;
    expect(validateStrategyDraft2(draft)).toEqual([]);
  });

  it("keeps universe asset order as authored (no canonical sorting of drafts)", () => {
    const canonical = canonicalizeStrategyDraft2(validFcfsDraft);
    expect(canonical).toContain('"assets":["stock:synthetic.beta","stock:synthetic.alpha"]');
  });
});

describe("S4 StrategyDraft 2.0.0 negative vectors", () => {
  const base = () => JSON.parse(JSON.stringify(validFcfsDraft));

  it("rejects a draft missing the risk cell", () => {
    const draft = base();
    delete draft.risk;
    expect(hasIssue(issuesOf(draft), "REQUIRED_PROPERTY", "/risk")).toBe(true);
  });

  it("rejects a draft missing the allocation cell", () => {
    const draft = base();
    delete draft.allocation;
    expect(hasIssue(issuesOf(draft), "REQUIRED_PROPERTY", "/allocation")).toBe(true);
  });

  it("rejects a universe below two assets", () => {
    const draft = base();
    draft.universe.assets = ["stock:synthetic.alpha"];
    expect(hasIssue(issuesOf(draft), "SCHEMA_SIZE_MISMATCH", "/universe/assets")).toBe(true);
  });

  it("rejects a universe above five assets", () => {
    const draft = base();
    draft.universe.assets = ["a", "b", "c", "d", "e", "f"];
    expect(hasIssue(issuesOf(draft), "SCHEMA_SIZE_MISMATCH", "/universe/assets")).toBe(true);
  });

  it("rejects duplicate universe assets", () => {
    const draft = base();
    draft.universe.assets = ["stock:synthetic.alpha", "stock:synthetic.alpha"];
    expect(hasIssue(issuesOf(draft), "SCHEMA_SIZE_MISMATCH", "/universe/assets")).toBe(true);
  });

  it("rejects the 1.0.0 entrySize field in a 2.0.0 draft", () => {
    const draft = base();
    draft.position.entrySize = { cashFraction: "0.5" };
    const issues = issuesOf(draft);
    expect(hasIssue(issues, "ADDITIONAL_PROPERTY", "/position/entrySize")).toBe(true);
  });

  it("rejects schemaVersion 1.0.0 with the version error code", () => {
    const draft = base();
    draft.schemaVersion = "1.0.0";
    expect(hasIssue(issuesOf(draft), "UNSUPPORTED_SCHEMA_VERSION", "/schemaVersion")).toBe(true);
  });

  it("rejects unknown scheduling templates", () => {
    const draft = base();
    draft.allocation.template = "priority-order@1";
    expect(hasIssue(issuesOf(draft), "SCHEMA_UNION_MISMATCH", "/allocation")).toBe(true);
  });

  it("rejects first-come-first-served params on an equal-split template", () => {
    const draft = base();
    draft.allocation.template = "equal-split@1";
    const issues = issuesOf(draft);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.path === "/allocation" || issue.path.startsWith("/allocation/"))).toBe(true);
  });

  it("rejects numeric (non-string) stop-loss fractions", () => {
    const draft = base();
    draft.risk.positionStopLossFraction = 0.08;
    expect(hasIssue(issuesOf(draft), "SCHEMA_TYPE_MISMATCH", "/risk/positionStopLossFraction")).toBe(true);
  });

  it("rejects extra root fields", () => {
    const draft = base();
    draft.surprise = true;
    expect(hasIssue(issuesOf(draft), "ADDITIONAL_PROPERTY", "/surprise")).toBe(true);
  });
});

describe("S4 RunSpec 2.0.0 vectors", () => {
  const validRunSpec = vectorFile[2]!.input as RunSpec2;

  it("accepts a complete portfolio run spec with zero issues", () => {
    expect(validateRunSpec2(validRunSpec)).toEqual([]);
  });

  it("rejects a single-asset run spec", () => {
    const spec = JSON.parse(JSON.stringify(validRunSpec));
    spec.assets = spec.assets.slice(0, 1);
    expect(
      validateRunSpec2(spec).some((issue) => issue.code === "SCHEMA_SIZE_MISMATCH" && issue.path === "/assets"),
    ).toBe(true);
  });

  it("rejects runSpecVersion 1.0.0 with the version error code", () => {
    const spec = JSON.parse(JSON.stringify(validRunSpec));
    spec.runSpecVersion = "1.0.0";
    expect(
      validateRunSpec2(spec).some((issue) => issue.code === "UNSUPPORTED_SCHEMA_VERSION" && issue.path === "/runSpecVersion"),
    ).toBe(true);
  });

  it("rejects a 1.0.0 engineVersion inside a 2.0.0 run spec", () => {
    const spec = JSON.parse(JSON.stringify(validRunSpec));
    spec.engine.engineVersion = "1.0.0";
    expect(
      validateRunSpec2(spec).some((issue) => issue.code === "SCHEMA_CONST_MISMATCH" && issue.path === "/engine/engineVersion"),
    ).toBe(true);
  });

  it("rejects the 1.0.0 single snapshotDigest field", () => {
    const spec = JSON.parse(JSON.stringify(validRunSpec));
    delete spec.data.snapshots;
    spec.data.snapshotDigest = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
    const issues = validateRunSpec2(spec);
    expect(issues.some((issue) => issue.code === "REQUIRED_PROPERTY" && issue.path === "/data/snapshots")).toBe(true);
    expect(issues.some((issue) => issue.code === "ADDITIONAL_PROPERTY" && issue.path === "/data/snapshotDigest")).toBe(true);
  });

  it("normalizes asset and snapshot arrays by assetId so order does not change the digest", () => {
    const reordered = JSON.parse(JSON.stringify(validRunSpec));
    reordered.assets = [reordered.assets[1], reordered.assets[0]];
    reordered.data.snapshots = [reordered.data.snapshots[1], reordered.data.snapshots[0]];
    const first = digestJson(normalizeRunSpec2(validRunSpec));
    const second = digestJson(normalizeRunSpec2(reordered));
    expect(first).toBe(second);
  });

  it("normalizes initialCash to Money scale 2", () => {
    const canonical = canonicalizeJson(normalizeRunSpec2(validRunSpec));
    expect(canonical).toContain('"initialCash":"100000.00"');
  });
});

describe("S4 Report 2.0.0 and SensitivityReport vectors", () => {
  const digest = "sha256:" + "ab".repeat(32);
  const cash = { available: "1.00", reserved: "0.00", unsettled: "0.00", receivable: "0.00", total: "1.00" };
  const position = { total: "0", sellable: "0", reserved: "0", unsettled: "0" };
  const fees = { commission: "0.00", transferFee: "0.00", stampDuty: "0.00", total: "0.00" };

  const validReport2 = {
    reportVersion: "2.0.0",
    runDigest: digest,
    strategyDigest: digest,
    snapshots: [
      { assetId: "stock:synthetic.alpha", snapshotDigest: digest },
      { assetId: "stock:synthetic.beta", snapshotDigest: digest },
    ],
    range: { start: "2024-01-02", end: "2024-12-31" },
    initialCash: "100000.00",
    finalEquity: "100000.00",
    metrics: {
      cumulativeReturn: "0.000000000000",
      maxDrawdown: "0.000000000000",
      tradeCount: 0,
      winRate: null,
      winRateReason: "NO_CLOSED_BATCHES",
      excessReturn: null,
      excessReturnReason: "BUY_AND_HOLD_UNAVAILABLE",
    },
    daily: [],
    assets: [
      { assetId: "stock:synthetic.alpha", fillCount: 0, fees, endingPosition: position, positionStopLossTriggers: 0 },
      { assetId: "stock:synthetic.beta", fillCount: 0, fees, endingPosition: position, positionStopLossTriggers: 0 },
    ],
    orders: [],
    fills: [],
    rejections: [],
    fees,
    cash,
    positions: [],
    buyAndHold: { finalEquity: null, cumulativeReturn: null, reason: "NO_FILLS" },
    assumptions: [],
    warnings: ["NO_FILLS"],
    eventDigest: digest,
    reportDigest: digest,
  };

  const validSensitivityReport = {
    sensitivityReportVersion: "1.0.0",
    strategyDigest: digest,
    strategyRevision: 1,
    baseRunDigest: digest,
    variants: [
      {
        variantId: "positionStopLossFraction+step",
        paramPath: "/risk/positionStopLossFraction",
        baseValue: "0.08",
        perturbedValue: "0.09",
        runDigest: digest,
        metrics: {
          cumulativeReturn: "-0.010000000000",
          maxDrawdown: "0.080000000000",
          tradeCount: 3,
          excessReturn: null,
        },
        flip: { cumulativeReturnSignChanged: true, excessReturnReversed: false },
      },
    ],
    verdict: { trustworthy: false, flippedVariantCount: 1, reasons: ["CUMULATIVE_RETURN_SIGN_FLIP"] },
  };

  it("accepts a minimal valid Report 2.0.0", () => {
    expect(validateReport2(validReport2)).toEqual([]);
  });

  it("reverts the 1.0.0 snapshotDigest field in Report 2.0.0", () => {
    const report = JSON.parse(JSON.stringify(validReport2));
    delete report.snapshots;
    report.snapshotDigest = digest;
    const issues = validateReport2(report);
    expect(issues.some((issue) => issue.code === "REQUIRED_PROPERTY" && issue.path === "/snapshots")).toBe(true);
    expect(issues.some((issue) => issue.code === "ADDITIONAL_PROPERTY" && issue.path === "/snapshotDigest")).toBe(true);
  });

  it("accepts a valid SensitivityReport with a flip verdict", () => {
    expect(validateSensitivityReport(validSensitivityReport)).toEqual([]);
  });

  it("enforces the eight-variant cap on sensitivity runs", () => {
    const report = JSON.parse(JSON.stringify(validSensitivityReport));
    report.variants = Array.from({ length: 9 }, () => JSON.parse(JSON.stringify(report.variants[0])));
    expect(
      validateSensitivityReport(report).some((issue) => issue.code === "SCHEMA_SIZE_MISMATCH" && issue.path === "/variants"),
    ).toBe(true);
  });

  it("rejects unknown verdict reason enums", () => {
    const report = JSON.parse(JSON.stringify(validSensitivityReport));
    report.verdict.reasons = ["LOOKS_FINE"];
    expect(
      validateSensitivityReport(report).some((issue) => issue.code === "SCHEMA_ENUM_MISMATCH" && issue.path === "/verdict/reasons/0"),
    ).toBe(true);
  });

  it("declares both scheduling templates in the 1.1.0 capability manifest", () => {
    const manifest = createCapabilityManifest(createRegistryV1());
    expect(validateCapabilityManifest(manifest)).toEqual([]);
    const uses = manifest.allocationTemplates.map((template) => template.use).sort();
    expect(uses).toEqual(["equal-split@1", "first-come-first-served@1"]);
  });
});

describe("S4 StrategyDraft 2.0.0 digest semantics", () => {
  it("is stable across object key order and all-zero decimal tails", () => {
    const reordered = JSON.parse(JSON.stringify(validFcfsDraft));
    reordered.risk = { portfolioStopFraction: "0.15000", positionStopLossFraction: "0.0800" };
    expect(digestStrategyDraft2(reordered)).toBe(digestStrategyDraft2(validFcfsDraft));
  });

  it("changes digest when any of the four cells change", () => {
    const baseDigest = digestStrategyDraft2(validFcfsDraft);
    const changedRisk = JSON.parse(JSON.stringify(validFcfsDraft));
    changedRisk.risk.portfolioStopFraction = "0.20";
    expect(digestStrategyDraft2(changedRisk)).not.toBe(baseDigest);
    const changedAllocation = JSON.parse(JSON.stringify(validFcfsDraft));
    changedAllocation.allocation.params.maxPerAssetCashFraction = "0.41";
    expect(digestStrategyDraft2(changedAllocation)).not.toBe(baseDigest);
    const changedUniverse = JSON.parse(JSON.stringify(validFcfsDraft));
    changedUniverse.universe.assets[0] = "stock:synthetic.gamma";
    expect(digestStrategyDraft2(changedUniverse)).not.toBe(baseDigest);
  });

  it("matches the independently computed canonical vectors (hand-authored canonical, standard-library digests)", () => {
    const vectors = vectorFile;
    for (const vector of vectors) {
      const canonical = vector.kind === "run-spec-2"
        ? canonicalizeJson(normalizeRunSpec2(vector.input as RunSpec2))
        : canonicalizeStrategyDraft2(vector.input);
      expect(canonical, vector.caseId).toBe(vector.canonical);
      expect(digestCanonical(canonical), vector.caseId).toBe(vector.digest);
    }
  });
});
