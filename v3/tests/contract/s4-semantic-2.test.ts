import { describe, expect, it } from "vitest";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import {
  validateRunSpec2Semantics,
  validateStrategySemantics2,
} from "../../core/strategy/validation/semantic-validator-2.js";
import { runPortfolio } from "../../application/run-portfolio/index.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import type { RunSpec2 } from "../../core/strategy/generated/run-spec-2.types.js";
import { ALPHA, BETA, buildDraft, clone, toRunInput } from "../s4-helpers.js";
import { SCENARIOS } from "../s4-scenarios.js";

const registry = createRegistryV1();

function baseDraft(): StrategyDraft2 {
  return buildDraft({
    assets: [ALPHA, BETA],
    entry: { gt: [{ ref: "close" }, { const: "5" }] },
    exits: [{ lt: [{ ref: "close" }, { const: "0.5" }] }],
    positionStopLossFraction: "0.08",
    portfolioStopFraction: "0.15",
    allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.40" } },
  });
}

function draftIssues(draft: StrategyDraft2) {
  return validateStrategySemantics2(draft, registry, "ohlcv");
}

function hasIssue(issues: { code: string; path: string }[], code: string, path: string): boolean {
  return issues.some((issue) => issue.code === code && issue.path === path);
}

describe("S4 §12.9 draft semantics: dual stop-loss open interval (0, 1)", () => {
  it.each(["0", "0.00", "1", "1.00", "1.5", "-0.1", "2"])(
    "rejects out-of-interval stop fraction %s on both risk lines",
    (value) => {
      const draft = baseDraft();
      draft.risk.positionStopLossFraction = value;
      draft.risk.portfolioStopFraction = value;
      const issues = draftIssues(draft);
      expect(hasIssue(issues, "INVALID_STOP_LOSS_FRACTION", "/risk/positionStopLossFraction")).toBe(true);
      expect(hasIssue(issues, "INVALID_STOP_LOSS_FRACTION", "/risk/portfolioStopFraction")).toBe(true);
    },
  );

  it.each(["0.000000000001", "0.5", "0.999999999999"])("accepts in-interval fraction %s", (value) => {
    const draft = baseDraft();
    draft.risk.positionStopLossFraction = value;
    draft.risk.portfolioStopFraction = value;
    expect(draftIssues(draft)).toEqual([]);
  });

  it("rejects malformed decimal strings instead of clamping them", () => {
    const draft = baseDraft();
    draft.risk.positionStopLossFraction = "0.08x";
    expect(hasIssue(draftIssues(draft), "INVALID_DECIMAL_STRING", "/risk/positionStopLossFraction")).toBe(true);
  });
});

describe("S4 §12.9 draft semantics: allocation parameter domains", () => {
  it.each(["0", "0.001", "0.009", "1.01", "2"])("rejects fcfs maxPerAssetCashFraction %s outside [0.01, 1]", (value) => {
    const draft = baseDraft();
    draft.allocation = { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: value } };
    expect(hasIssue(draftIssues(draft), "INVALID_ALLOCATION_PARAM", "/allocation/params/maxPerAssetCashFraction")).toBe(true);
  });

  it.each(["0.01", "1"])("accepts boundary maxPerAssetCashFraction %s", (value) => {
    const draft = baseDraft();
    draft.allocation = { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: value } };
    expect(draftIssues(draft)).toEqual([]);
  });

  it.each([0, 1, 6, 2.5])("rejects equal-split maxPositions %s outside integer [2, 5]", (value) => {
    const draft = baseDraft();
    draft.allocation = { template: "equal-split@1", params: { maxPositions: value } } as StrategyDraft2["allocation"];
    expect(hasIssue(draftIssues(draft), "INVALID_ALLOCATION_PARAM", "/allocation/params/maxPositions")).toBe(true);
  });

  it("rejects maxPositions above the universe size (schema cannot compare)", () => {
    const draft = baseDraft();
    draft.allocation = { template: "equal-split@1", params: { maxPositions: 3 } };
    expect(hasIssue(draftIssues(draft), "INVALID_ALLOCATION_PARAM", "/allocation/params/maxPositions")).toBe(true);
    draft.allocation = { template: "equal-split@1", params: { maxPositions: 2 } };
    expect(draftIssues(draft)).toEqual([]);
  });
});

describe("S4 §12.9 draft semantics: 1.0.0 AST checks still apply to 2.0.0 drafts", () => {
  it("flags unknown indicators and invalid exit fractions through the shared AST stage", () => {
    const draft = baseDraft();
    draft.indicators = { m: { use: "rsi@1", params: {} } };
    expect(hasIssue(draftIssues(draft), "UNKNOWN_INDICATOR", "/indicators/m/use")).toBe(true);

    const fractionDraft = baseDraft();
    fractionDraft.position.exitSize.positionFraction = "1.5";
    expect(hasIssue(draftIssues(fractionDraft), "INVALID_POSITION_FRACTION", "/position/exitSize/positionFraction")).toBe(true);
  });
});

describe("S4 §12.9 run-spec semantics", () => {
  const scenario = SCENARIOS.fcfsSimultaneous();
  const baseSpec = scenario.runSpec;
  const draft = scenario.strategy;

  it("rejects duplicate assetId inside assets", () => {
    const spec = clone(baseSpec);
    spec.assets = [spec.assets[0]!, spec.assets[0]!] as RunSpec2["assets"];
    spec.data.snapshots = [spec.data.snapshots[0]!, spec.data.snapshots[1]!] as RunSpec2["data"]["snapshots"];
    const issues = validateRunSpec2Semantics(spec);
    expect(hasIssue(issues, "DUPLICATE_ASSET_ID", "/assets/1/assetId")).toBe(true);
  });

  it("rejects the same assetId bound to two different snapshot digests", () => {
    const spec = clone(baseSpec);
    spec.data.snapshots = [
      spec.data.snapshots[0]!,
      { assetId: spec.data.snapshots[0]!.assetId, snapshotDigest: `sha256:${"f".repeat(64)}` },
    ] as RunSpec2["data"]["snapshots"];
    const issues = validateRunSpec2Semantics(spec);
    expect(hasIssue(issues, "DUPLICATE_ASSET_ID", "/data/snapshots/1/assetId")).toBe(true);
  });

  it("rejects missing and extra snapshot bindings (assets ↔ snapshots must be 1:1)", () => {
    const missing = clone(baseSpec);
    missing.data.snapshots = [missing.data.snapshots[0]!, { assetId: "stock:synthetic.ghost", snapshotDigest: `sha256:${"e".repeat(64)}` }] as RunSpec2["data"]["snapshots"];
    const issues = validateRunSpec2Semantics(missing);
    expect(hasIssue(issues, "ASSET_SNAPSHOT_BINDING_MISMATCH", "/data/snapshots/1/assetId")).toBe(true);
    expect(issues.some((issue) => issue.code === "ASSET_SNAPSHOT_BINDING_MISMATCH" && issue.path.startsWith("/assets/"))).toBe(true);
  });

  it("rejects a run spec wider or narrower than the signed universe", () => {
    const wider = clone(baseSpec);
    wider.assets = [...wider.assets, { assetId: "stock:synthetic.gamma", assetType: "stock", executionProfile: "cn-stock@1" }] as RunSpec2["assets"];
    wider.data.snapshots = [...wider.data.snapshots, { assetId: "stock:synthetic.gamma", snapshotDigest: `sha256:${"d".repeat(64)}` }] as RunSpec2["data"]["snapshots"];
    expect(hasIssue(validateRunSpec2Semantics(wider, draft), "RUNSPEC_UNIVERSE_MISMATCH", "/assets")).toBe(true);

    const narrower = clone(baseSpec);
    narrower.assets = [narrower.assets[0]!] as unknown as RunSpec2["assets"];
    narrower.data.snapshots = [narrower.data.snapshots[0]!] as unknown as RunSpec2["data"]["snapshots"];
    expect(validateRunSpec2Semantics(narrower, draft).some((issue) => issue.code === "RUNSPEC_UNIVERSE_MISMATCH")).toBe(true);

    expect(validateRunSpec2Semantics(baseSpec, draft)).toEqual([]);
  });
});

describe("S4 §12.9 engine integration: semantic violations fail before digest/readback", () => {
  it("rejects a run whose stop-loss fraction is exactly 1 with a structured code", () => {
    const scenario = clone(SCENARIOS.fcfsSimultaneous());
    scenario.strategy.risk.portfolioStopFraction = "1";
    const result = runPortfolio(toRunInput(scenario));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_STOP_LOSS_FRACTION");
      expect(result.error.path).toBe("/risk/portfolioStopFraction");
    }
  });

  it("rejects duplicate assetId bindings with a structured code", () => {
    const scenario = clone(SCENARIOS.fcfsSimultaneous());
    scenario.runSpec.data.snapshots = [
      scenario.runSpec.data.snapshots[0]!,
      { assetId: scenario.runSpec.data.snapshots[0]!.assetId, snapshotDigest: `sha256:${"f".repeat(64)}` },
    ] as RunSpec2["data"]["snapshots"];
    const result = runPortfolio(toRunInput(scenario));
    expect(result.ok).toBe(false);
    // A duplicated snapshot binding also breaks the 1:1 binding; the engine surfaces the
    // first sorted issue, and either structured code is a valid rejection of this document.
    if (!result.ok) expect(["DUPLICATE_ASSET_ID", "ASSET_SNAPSHOT_BINDING_MISMATCH"]).toContain(result.error.code);
  });

  it("rejects a run spec whose assets exceed the signed universe", () => {
    const scenario = clone(SCENARIOS.fcfsSimultaneous());
    scenario.runSpec.assets = [
      scenario.runSpec.assets[0]!,
      { assetId: "stock:synthetic.gamma", assetType: "stock", executionProfile: "cn-stock@1" },
    ] as RunSpec2["assets"];
    scenario.runSpec.data.snapshots = [
      scenario.runSpec.data.snapshots[0]!,
      { assetId: "stock:synthetic.gamma", snapshotDigest: scenario.runSpec.data.snapshots[0]!.snapshotDigest },
    ] as RunSpec2["data"]["snapshots"];
    const result = runPortfolio(toRunInput(scenario));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RUNSPEC_UNIVERSE_MISMATCH");
  });
});
