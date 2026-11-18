import type { StrategyDraft2 } from "../generated/strategy-draft-2.types.js";
import type { RunSpec2 } from "../generated/run-spec-2.types.js";
import type { StrategyDraft } from "../generated/strategy-draft.types.js";
import type { ValidationIssue } from "../generated/validation-issue.types.js";
import { InternalDecimal } from "../canonical/rounding-profile.js";
import type Decimal from "decimal.js";
import { normalizeDecimal } from "../canonical/decimal-profile.js";
import { ContractError } from "../canonical/errors.js";
import type { ObservationKind, Registry } from "../registry/types.js";
import { validateStrategySemantics } from "./semantic-validator.js";

type IssueOptions = Partial<Pick<ValidationIssue, "expected" | "actual" | "hint" | "registryRef">>;

function issue(code: string, path: string, message: string, options: IssueOptions = {}): ValidationIssue {
  return { code, severity: "error", path, message, ...options };
}

function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.sort((left, right) => {
    const leftKey = `${left.path}|${left.code}|${left.message}`;
    const rightKey = `${right.path}|${right.code}|${right.message}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

// Reuse the frozen 1.0.0 AST semantic checks (indicators / entry / exits / exit fraction) by
// wrapping the 2.0.0 draft in a synthetic 1.0.0 shell, mirroring strategy-canonical-2.ts.
// The 1.0.0-only entrySize check is neutralized with a constant "1" placeholder; the 2.0.0
// allocation cell replaces it and is validated below. Issue paths are version-independent.
function astSemanticsOf(draft: StrategyDraft2, registry: Registry, observationKind: ObservationKind): ValidationIssue[] {
  const shell = {
    schemaVersion: "1.0.0",
    name: draft.name,
    indicators: draft.indicators,
    entry: draft.entry,
    exits: draft.exits,
    position: {
      side: "long",
      allowAdd: false,
      entrySize: { cashFraction: "1" },
      exitSize: { positionFraction: draft.position.exitSize.positionFraction },
    },
  } as unknown as StrategyDraft;
  return validateStrategySemantics(shell, registry, observationKind);
}

function checkRateString(value: string, path: string, issues: ValidationIssue[]): Decimal | null {
  try {
    normalizeDecimal(value, "Rate");
  } catch (error) {
    if (error instanceof ContractError) {
      issues.push(issue(error.code, path, error.message, { actual: value }));
      return null;
    }
    throw error;
  }
  return new InternalDecimal(value);
}

/**
 * Semantic-stage obligations of contract §12.9 for StrategyDraft 2.0.0. A draft that is
 * schema-valid but violates any item here must be rejected before canonicalization, digest,
 * readback, or confirmation — never silently clamped or default-filled.
 */
export function validateStrategySemantics2(
  draft: StrategyDraft2,
  registry: Registry,
  observationKind: ObservationKind,
): ValidationIssue[] {
  const issues = astSemanticsOf(draft, registry, observationKind);

  for (const [path, value] of [
    ["/risk/positionStopLossFraction", draft.risk.positionStopLossFraction],
    ["/risk/portfolioStopFraction", draft.risk.portfolioStopFraction],
  ] as const) {
    const decimal = checkRateString(value, path, issues);
    if (decimal !== null && (decimal.lte(0) || decimal.gte(1))) {
      issues.push(issue("INVALID_STOP_LOSS_FRACTION", path, "止损线必须严格位于开区间 (0, 1)", {
        expected: "0 < fraction < 1",
        actual: value,
      }));
    }
  }

  if (draft.allocation.template === "first-come-first-served@1") {
    const path = "/allocation/params/maxPerAssetCashFraction";
    const value = draft.allocation.params.maxPerAssetCashFraction;
    const decimal = checkRateString(value, path, issues);
    if (decimal !== null && (decimal.lt(new InternalDecimal("0.01")) || decimal.gt(1))) {
      issues.push(issue("INVALID_ALLOCATION_PARAM", path, "单票资金比例必须位于 [0.01, 1]", {
        expected: "0.01 <= fraction <= 1",
        actual: value,
      }));
    }
  } else {
    const path = "/allocation/params/maxPositions";
    const value = draft.allocation.params.maxPositions;
    if (!Number.isSafeInteger(value) || value < 2 || value > 5) {
      issues.push(issue("INVALID_ALLOCATION_PARAM", path, "maxPositions 必须是 [2, 5] 内的整数", {
        expected: "integer in [2, 5]",
        actual: value,
      }));
    } else if (value > draft.universe.assets.length) {
      issues.push(issue("INVALID_ALLOCATION_PARAM", path, "maxPositions 不能超过管理范围资产数", {
        expected: `<= ${draft.universe.assets.length} (len(universe.assets))`,
        actual: value,
      }));
    }
  }

  return sortIssues(issues);
}

function duplicateAssetIds(entries: readonly { assetId: string }[]): Map<string, number> {
  const firstIndex = new Map<string, number>();
  const duplicates = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (firstIndex.has(entry.assetId)) {
      if (!duplicates.has(entry.assetId)) duplicates.set(entry.assetId, index);
    } else {
      firstIndex.set(entry.assetId, index);
    }
  });
  return duplicates;
}

/**
 * Semantic-stage obligations of contract §12.9 for RunSpec 2.0.0: per-array assetId
 * uniqueness (including the same assetId bound to two different snapshot digests), the
 * exact 1:1 binding between assets and data.snapshots, and — when the confirmed draft is
 * supplied — the exact assetId set equality between the run spec and the signed universe.
 */
export function validateRunSpec2Semantics(runSpec: RunSpec2, draft?: StrategyDraft2): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [assetId, index] of duplicateAssetIds(runSpec.assets)) {
    issues.push(issue("DUPLICATE_ASSET_ID", `/assets/${index}/assetId`, `assets 内 assetId 重复：${assetId}`, {
      actual: assetId,
    }));
  }
  for (const [assetId, index] of duplicateAssetIds(runSpec.data.snapshots)) {
    issues.push(issue("DUPLICATE_ASSET_ID", `/data/snapshots/${index}/assetId`, `data.snapshots 内 assetId 重复：${assetId}`, {
      actual: assetId,
    }));
  }

  const scheduled = new Set(runSpec.assets.map((asset) => asset.assetId));
  const bound = new Set(runSpec.data.snapshots.map((binding) => binding.assetId));
  runSpec.data.snapshots.forEach((binding, index) => {
    if (!scheduled.has(binding.assetId)) {
      issues.push(issue("ASSET_SNAPSHOT_BINDING_MISMATCH", `/data/snapshots/${index}/assetId`,
        `快照绑定指向未排程的资产：${binding.assetId}`, { actual: binding.assetId }));
    }
  });
  runSpec.assets.forEach((asset, index) => {
    if (!bound.has(asset.assetId)) {
      issues.push(issue("ASSET_SNAPSHOT_BINDING_MISMATCH", `/assets/${index}/assetId`,
        `排程资产缺少冻结快照绑定：${asset.assetId}`, { actual: asset.assetId }));
    }
  });

  if (draft !== undefined) {
    const universe = new Set(draft.universe.assets);
    for (const assetId of scheduled) {
      if (!universe.has(assetId)) {
        issues.push(issue("RUNSPEC_UNIVERSE_MISMATCH", "/assets", `运行资产超出已签署的管理范围：${assetId}`, {
          actual: assetId,
        }));
      }
    }
    draft.universe.assets.forEach((assetId, index) => {
      if (!scheduled.has(assetId)) {
        issues.push(issue("RUNSPEC_UNIVERSE_MISMATCH", `/universe/assets/${index}`,
          `已签署资产未被本次运行覆盖：${assetId}`, { actual: assetId }));
      }
    });
  }

  return sortIssues(issues);
}
