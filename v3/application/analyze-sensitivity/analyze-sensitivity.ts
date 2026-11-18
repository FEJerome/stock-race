import { InternalDecimal } from "../../core/strategy/canonical/rounding-profile.js";
import { digestStrategyDraft2 } from "../../core/strategy/canonical/strategy-canonical-2.js";
import { normalizeDecimal } from "../../core/strategy/canonical/decimal-profile.js";
import type { DataSnapshot } from "../../core/market/types.js";
import type { RunSpec2 } from "../../core/strategy/generated/run-spec-2.types.js";
import type { SensitivityReport } from "../../core/strategy/generated/sensitivity-report.types.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import type { PortfolioRunInput, PortfolioRunResult } from "../../core/engine/portfolio/types.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import type { Registry } from "../../core/strategy/registry/types.js";
import { assertValidSensitivityReport } from "../../core/strategy/validation/schema-validator-2.js";
import { parseJsonInput } from "../../core/strategy/validation/json-input.js";
import { runPortfolio } from "../run-portfolio/index.js";
import { validateStrategyUseCase2 } from "../validate-strategy/validate-strategy-2.js";
import type { StrategyStore } from "../ports/strategy-store.js";

/** Hard cap on sensitivity variants for this slice (contract §12.7). */
export const SENSITIVITY_MAX_VARIANTS = 8;

/**
 * One minimum step for ratio parameters (contract §12.7 "ratio parameters
 * ±one minimum step"): the declared ratio grid of the interview surface is
 * one percentage point (0.08 / 0.15 / 0.40 are all authored at 0.01
 * granularity), so the step is 0.01, applied in decimal-string arithmetic.
 * Integer parameters step by ±1 (contract §12.7).
 */
export const RATIO_PERTURBATION_STEP = "0.01";

export interface AnalyzeSensitivityInput {
  readonly runSpec: RunSpec2;
  /** One frozen DataSnapshot per scheduled asset, exactly as the base run consumes them. */
  readonly snapshots: readonly DataSnapshot[];
}

export interface AnalyzeSensitivityOptions {
  /** Test-only seam for pinning metric outcomes; defaults to the real portfolio engine. */
  readonly run?: (input: PortfolioRunInput) => PortfolioRunResult;
}

export interface OmittedVariant {
  readonly paramPath: string;
  readonly direction: "down" | "up";
  /** First validation issue code or engine error code that made the variant un-runnable. */
  readonly reason: string;
}

export type AnalyzeSensitivityResult =
  | {
      readonly ok: true;
      readonly report: SensitivityReport;
      /** Variants whose perturbed draft failed the validation chain or whose run failed. */
      readonly omitted: readonly OmittedVariant[];
    }
  | {
      readonly ok: false;
      readonly code: "STRATEGY_NOT_CONFIRMED" | "CONFIRMED_DIGEST_MISMATCH" | "CANONICAL_AST_MISSING" | "BASE_RUN_FAILED" | "NO_VIABLE_VARIANTS";
      readonly message: string;
    };

interface ParamSpec {
  readonly paramPath: string;
  readonly kind: "integer" | "ratio";
  /** Integer params carry a number; ratio params carry the authored decimal string. */
  readonly base: number | string;
}

/**
 * Perturbation surface (documented slice policy): the typed numeric parameter
 * declarations of the four-cell draft — indicator params declared in the
 * registry, both risk stop-loss fractions, the allocation template's
 * parameter, and the exit position fraction. AST expression literals
 * (const/lag/within) carry no declared parameter type and are not perturbed.
 * Order is fixed: indicators (ids then params, UTF-16 code-unit order), then
 * risk, then allocation, then exit fraction; each parameter yields a down
 * variant then an up variant.
 */
function enumerateParams(draft: StrategyDraft2, registry: Registry): ParamSpec[] {
  const specs: ParamSpec[] = [];
  for (const id of Object.keys(draft.indicators).sort()) {
    const usage = draft.indicators[id]!;
    const definition = registry.indicators.get(usage.use);
    if (!definition) continue;
    const params = (usage.params ?? {}) as Readonly<Record<string, number | string | boolean>>;
    for (const name of Object.keys(definition.paramSchema).sort()) {
      const value = params[name];
      if (value === undefined) continue;
      const declared = (definition.paramSchema as Readonly<Record<string, { type: string }>>)[name]!;
      if (declared.type === "integer" && typeof value === "number") {
        specs.push({ paramPath: `/indicators/${id}/params/${name}`, kind: "integer", base: value });
      }
    }
  }
  specs.push({ paramPath: "/risk/positionStopLossFraction", kind: "ratio", base: draft.risk.positionStopLossFraction });
  specs.push({ paramPath: "/risk/portfolioStopFraction", kind: "ratio", base: draft.risk.portfolioStopFraction });
  if (draft.allocation.template === "first-come-first-served@1") {
    specs.push({
      paramPath: "/allocation/params/maxPerAssetCashFraction",
      kind: "ratio",
      base: draft.allocation.params.maxPerAssetCashFraction,
    });
  } else {
    specs.push({ paramPath: "/allocation/params/maxPositions", kind: "integer", base: draft.allocation.params.maxPositions });
  }
  specs.push({ paramPath: "/position/exitSize/positionFraction", kind: "ratio", base: draft.position.exitSize.positionFraction });
  return specs;
}

function perturb(spec: ParamSpec, direction: "down" | "up"): number | string {
  const sign = direction === "down" ? -1 : 1;
  if (spec.kind === "integer") return (spec.base as number) + sign;
  const shifted = new InternalDecimal(spec.base as string).plus(new InternalDecimal(RATIO_PERTURBATION_STEP).times(sign));
  return normalizeDecimal(shifted.toString(), "Rate");
}

function withPerturbation(draft: StrategyDraft2, spec: ParamSpec, value: number | string): StrategyDraft2 {
  const next = JSON.parse(JSON.stringify(draft)) as StrategyDraft2;
  if (spec.paramPath.startsWith("/indicators/")) {
    const [, , id, , name] = spec.paramPath.split("/");
    (next.indicators[id!]!.params as Record<string, number | string>)[name!] = value;
  } else if (spec.paramPath === "/risk/positionStopLossFraction") {
    next.risk.positionStopLossFraction = value as string;
  } else if (spec.paramPath === "/risk/portfolioStopFraction") {
    next.risk.portfolioStopFraction = value as string;
  } else if (spec.paramPath === "/allocation/params/maxPerAssetCashFraction" && next.allocation.template === "first-come-first-served@1") {
    next.allocation.params.maxPerAssetCashFraction = value as string;
  } else if (spec.paramPath === "/allocation/params/maxPositions" && next.allocation.template === "equal-split@1") {
    next.allocation.params.maxPositions = value as number;
  } else if (spec.paramPath === "/position/exitSize/positionFraction") {
    next.position.exitSize.positionFraction = value as string;
  }
  return next;
}

function signOf(rate: string): number {
  const value = new InternalDecimal(rate);
  if (value.isZero()) return 0;
  return value.isPositive() ? 1 : -1;
}

/**
 * Sensitivity (overfitting) gate (contract §12.7): perturbs each typed
 * numeric parameter of the CONFIRMED strategy — the draft is re-read from the
 * store by digest, so what is perturbed is exactly what the user signed —
 * runs every variant as a complete deterministic run with its own runDigest,
 * and assembles a standalone SensitivityReport. A variant is a flip when the
 * cumulative-return sign category changes (+/−/0) or the excess-vs-buy-hold
 * conclusion reverses; any flip makes the strategy untrustworthy (no
 * smoothing, no averaging). Variants whose perturbed draft fails the
 * validation chain or whose run fails are omitted and listed in `omitted`.
 * The artifact never enters the core Report digest semantics.
 */
export async function analyzeSensitivity(
  store: StrategyStore,
  input: AnalyzeSensitivityInput,
  options: AnalyzeSensitivityOptions = {},
): Promise<AnalyzeSensitivityResult> {
  const run = options.run ?? runPortfolio;
  const { id, revision, digest } = input.runSpec.strategy;

  const record = await store.findConfirmation(id, revision);
  if (!record) {
    return { ok: false, code: "STRATEGY_NOT_CONFIRMED", message: `策略 ${id} revision ${revision} 未经确认，拒绝敏感性分析` };
  }
  if (record.digest !== digest) {
    return { ok: false, code: "CONFIRMED_DIGEST_MISMATCH", message: `RunSpec digest 与确认记录不符：${id} revision ${revision}` };
  }
  const canonicalAst = await store.loadCanonicalAst(digest);
  if (canonicalAst === null) {
    return { ok: false, code: "CANONICAL_AST_MISSING", message: `确认记录存在但 canonical AST 缺失：${digest}` };
  }
  const baseStrategy = parseJsonInput(canonicalAst) as StrategyDraft2;

  const base = run({ strategy: baseStrategy, runSpec: input.runSpec, snapshots: input.snapshots });
  if (!base.ok) {
    return {
      ok: false,
      code: "BASE_RUN_FAILED",
      message: `基准运行失败（${base.error.code}）：${base.error.message}`,
    };
  }

  const registry = createRegistryV1();
  // Working array: the schema tuple union (minItems 1, maxItems 8) is only
  // satisfied after the loop, so assembly uses the element type and the final
  // artifact is cast right before the schema self-check.
  const variants: SensitivityReport["variants"][number][] = [];
  const omitted: OmittedVariant[] = [];

  for (const spec of enumerateParams(baseStrategy, registry)) {
    for (const direction of ["down", "up"] as const) {
      if (variants.length >= SENSITIVITY_MAX_VARIANTS) break;
      const perturbedValue = perturb(spec, direction);
      const variantDraft = withPerturbation(baseStrategy, spec, perturbedValue);
      const validation = validateStrategyUseCase2(variantDraft);
      if (!validation.ok) {
        omitted.push({ paramPath: spec.paramPath, direction, reason: validation.issues[0]?.code ?? "INVALID_VARIANT" });
        continue;
      }
      const variantRunSpec: RunSpec2 = {
        ...input.runSpec,
        strategy: { id, revision, digest: digestStrategyDraft2(variantDraft) },
      };
      const result = run({ strategy: variantDraft, runSpec: variantRunSpec, snapshots: input.snapshots });
      if (!result.ok) {
        omitted.push({ paramPath: spec.paramPath, direction, reason: result.error.code });
        continue;
      }
      const baseMetrics = base.report.metrics;
      const metrics = result.report.metrics;
      variants.push({
        variantId: `v${variants.length + 1}:${spec.paramPath}:${direction}`,
        paramPath: spec.paramPath,
        baseValue: spec.kind === "integer" ? (spec.base as number) : normalizeDecimal(spec.base as string, "Rate"),
        perturbedValue,
        runDigest: result.runDigest,
        metrics: {
          cumulativeReturn: metrics.cumulativeReturn,
          maxDrawdown: metrics.maxDrawdown,
          tradeCount: metrics.tradeCount,
          excessReturn: metrics.excessReturn,
        },
        flip: {
          cumulativeReturnSignChanged: signOf(metrics.cumulativeReturn) !== signOf(baseMetrics.cumulativeReturn),
          excessReturnReversed:
            baseMetrics.excessReturn !== null &&
            metrics.excessReturn !== null &&
            new InternalDecimal(baseMetrics.excessReturn).isPositive() !== new InternalDecimal(metrics.excessReturn).isPositive(),
        },
      });
    }
    if (variants.length >= SENSITIVITY_MAX_VARIANTS) break;
  }

  if (variants.length === 0) {
    // The artifact schema requires at least one variant; an analysis that
    // could not run a single variant is a failure, not an empty report.
    return {
      ok: false,
      code: "NO_VIABLE_VARIANTS",
      message: `全部参数变体均不可运行（${omitted.map((entry) => `${entry.paramPath}:${entry.direction}:${entry.reason}`).join("；")}）`,
    };
  }

  const flipped = variants.filter((variant) => variant.flip.cumulativeReturnSignChanged || variant.flip.excessReturnReversed);
  const reasons: ("CUMULATIVE_RETURN_SIGN_FLIP" | "EXCESS_RETURN_REVERSAL")[] = [];
  if (flipped.some((variant) => variant.flip.cumulativeReturnSignChanged)) reasons.push("CUMULATIVE_RETURN_SIGN_FLIP");
  if (flipped.some((variant) => variant.flip.excessReturnReversed)) reasons.push("EXCESS_RETURN_REVERSAL");

  const report: SensitivityReport = {
    sensitivityReportVersion: "1.0.0",
    strategyDigest: digest,
    strategyRevision: revision,
    baseRunDigest: base.runDigest,
    variants: variants as SensitivityReport["variants"],
    verdict: {
      trustworthy: flipped.length === 0,
      flippedVariantCount: flipped.length,
      reasons,
    },
  };
  assertValidSensitivityReport(report);
  return { ok: true, report, omitted };
}
