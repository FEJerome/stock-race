import { digestCanonical } from "../../core/strategy/canonical/digest.js";
import { ContractError } from "../../core/strategy/canonical/errors.js";
import { canonicalizeStrategyDraft } from "../../core/strategy/canonical/strategy-canonical.js";
import type { ConfirmedRevision } from "../../core/strategy/generated/confirmed-revision.types.js";
import type { ValidationIssue } from "../../core/strategy/generated/validation-issue.types.js";
import type { ObservationKind } from "../../core/strategy/registry/types.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { StrategyValidationError } from "../../core/strategy/validation/schema-validator.js";
import { validateStrategySemantics } from "../../core/strategy/validation/semantic-validator.js";
import type { StrategyStore } from "../ports/strategy-store.js";

export interface ConfirmStrategyInput {
  /** 缺省时由 application 分配新 strategyId（F10 调整 v2 时传入既有 id）。 */
  readonly strategyId?: string;
  /** 用户当前看到并确认的草稿（与回读同源的 AST）。 */
  readonly currentDraft: unknown;
  /** 用户确认时回读中展示的 expectedDigest。 */
  readonly expectedDigest: string;
  readonly observationKind?: ObservationKind;
}

export interface ConfirmStrategyOptions {
  /** 可注入时钟（测试确定性）；createdAt 只作展示元数据，不进 digest。 */
  readonly now?: () => string;
}

export type ConfirmStrategyResult =
  | {
      readonly ok: true;
      readonly confirmation: ConfirmedRevision;
      readonly canonicalAst: string;
      readonly strategyDigest: string;
    }
  | {
      readonly ok: false;
      readonly code: "CONFIRM_DIGEST_MISMATCH" | "CONFIRM_INVALID_DRAFT";
      readonly message: string;
      readonly issues: readonly ValidationIssue[] | null;
      readonly actualDigest: string | null;
    };

/**
 * 确认（方案 §2.3）：重算 canonical+digest，与 expectedDigest 不等 →
 * CONFIRM_DIGEST_MISMATCH（回 valid 不得确认，且不消耗 strategyId/revision）；
 * 相符 → application 分配 strategyId（缺省时）与单调递增 revision → 持久化。
 * createdAt 仅展示元数据，不进 digest（契约 3.1）。
 */
export async function confirmStrategy(
  store: StrategyStore,
  input: ConfirmStrategyInput,
  options: ConfirmStrategyOptions = {},
): Promise<ConfirmStrategyResult> {
  let canonicalAst: string;
  try {
    canonicalAst = canonicalizeStrategyDraft(input.currentDraft);
  } catch (error) {
    if (error instanceof StrategyValidationError) {
      return {
        ok: false,
        code: "CONFIRM_INVALID_DRAFT",
        message: "currentDraft 未通过 schema 校验，不得确认",
        issues: error.issues,
        actualDigest: null,
      };
    }
    if (error instanceof ContractError) {
      return {
        ok: false,
        code: "CONFIRM_INVALID_DRAFT",
        message: error.message,
        issues: [{ code: error.code, severity: "error", path: error.path, message: error.message }],
        actualDigest: null,
      };
    }
    throw error;
  }
  const semanticIssues = validateStrategySemantics(
    JSON.parse(canonicalAst),
    createRegistryV1(),
    input.observationKind ?? "ohlcv",
  );
  if (semanticIssues.length > 0) {
    return {
      ok: false,
      code: "CONFIRM_INVALID_DRAFT",
      message: "currentDraft 未通过语义校验，不得确认",
      issues: semanticIssues,
      actualDigest: null,
    };
  }
  const strategyDigest = digestCanonical(canonicalAst);
  if (strategyDigest !== input.expectedDigest) {
    return {
      ok: false,
      code: "CONFIRM_DIGEST_MISMATCH",
      message: "确认期间草稿已变化，回到 valid 状态重新确认",
      issues: null,
      actualDigest: strategyDigest,
    };
  }
  const strategyId = input.strategyId ?? (await store.allocateStrategyId());
  const revision = await store.nextRevision(strategyId);
  const confirmation: ConfirmedRevision = {
    strategyId,
    revision,
    digest: strategyDigest,
    createdAt: (options.now ?? (() => new Date().toISOString()))(),
  };
  await store.saveConfirmation(confirmation, canonicalAst);
  return { ok: true, confirmation, canonicalAst, strategyDigest };
}
