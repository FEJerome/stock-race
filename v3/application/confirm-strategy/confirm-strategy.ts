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
  /** When omitted, the application allocates a new strategyId (pass an existing id for F10 adjust-v2). */
  readonly strategyId?: string;
  /** The draft the user currently sees and confirms (AST from the same source as the readback). */
  readonly currentDraft: unknown;
  /** The expectedDigest shown in the readback at confirm time. */
  readonly expectedDigest: string;
  readonly observationKind?: ObservationKind;
}

export interface ConfirmStrategyOptions {
  /** Injectable clock (test determinism); createdAt is display metadata only and never enters the digest. */
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
      readonly code: "CONFIRM_DIGEST_MISMATCH" | "CONFIRM_INVALID_DRAFT" | "STRATEGY_ID_UNKNOWN";
      readonly message: string;
      readonly issues: readonly ValidationIssue[] | null;
      readonly actualDigest: string | null;
    };

/**
 * Confirmation (plan §2.3): recompute canonical+digest; if it differs from
 * expectedDigest → CONFIRM_DIGEST_MISMATCH (nothing but a valid readback may
 * be confirmed, and no strategyId/revision is consumed);
 * if it matches → the application allocates the strategyId (when omitted)
 * and a monotonically increasing revision → persisted.
 * createdAt is display metadata only and never enters the digest (contract 3.1).
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
  // M2: strategyId is allocated by the application; a caller-supplied id must
  // already exist, otherwise allocation uniqueness breaks (F10 v2 only allows
  // reusing previously confirmed ids).
  if (input.strategyId !== undefined && !(await store.hasStrategy(input.strategyId))) {
    return {
      ok: false,
      code: "STRATEGY_ID_UNKNOWN",
      message: `未知 strategyId：${input.strategyId}，不得由 caller 自创`,
      issues: null,
      actualDigest: strategyDigest,
    };
  }
  const confirmation = await store.commitConfirmation(
    {
      ...(input.strategyId !== undefined ? { strategyId: input.strategyId } : {}),
      digest: strategyDigest,
      createdAt: (options.now ?? (() => new Date().toISOString()))(),
    },
    canonicalAst,
  );
  return { ok: true, confirmation, canonicalAst, strategyDigest };
}
