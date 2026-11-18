import { digestCanonical } from "../../core/strategy/canonical/digest.js";
import { ContractError } from "../../core/strategy/canonical/errors.js";
import { canonicalizeStrategyDraft2 } from "../../core/strategy/canonical/strategy-canonical-2.js";
import type { ConfirmedRevision } from "../../core/strategy/generated/confirmed-revision.types.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { Schema2ValidationError } from "../../core/strategy/validation/schema-validator-2.js";
import { validateStrategySemantics2 } from "../../core/strategy/validation/semantic-validator-2.js";
import type { StrategyStore } from "../ports/strategy-store.js";
import type {
  ConfirmStrategyInput,
  ConfirmStrategyOptions,
  ConfirmStrategyResult,
} from "./confirm-strategy.js";

/**
 * 2.0.0 counterpart of confirmStrategy (contract §12.6): the confirmation
 * gate is unchanged — recompute canonical + digest over the full four-cell
 * draft, reject on expectedDigest mismatch (CONFIRM_DIGEST_MISMATCH), keep
 * the ConfirmedRevision{strategyId,revision,digest} shape and the
 * digest-addressed store layout. §12.9 semantic rejection runs before the
 * digest is computed: a four-cell card with an out-of-domain stop-loss or
 * allocation parameter can never be signed. The 1.0.0 confirm path is
 * untouched.
 */
export async function confirmStrategy2(
  store: StrategyStore,
  input: ConfirmStrategyInput,
  options: ConfirmStrategyOptions = {},
): Promise<ConfirmStrategyResult> {
  let canonicalAst: string;
  try {
    canonicalAst = canonicalizeStrategyDraft2(input.currentDraft);
  } catch (error) {
    if (error instanceof Schema2ValidationError) {
      return {
        ok: false,
        code: "CONFIRM_INVALID_DRAFT",
        message: "currentDraft 未通过 2.0.0 schema 校验，不得确认",
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
  const semanticIssues = validateStrategySemantics2(
    JSON.parse(canonicalAst),
    createRegistryV1(),
    input.observationKind ?? "ohlcv",
  );
  if (semanticIssues.length > 0) {
    return {
      ok: false,
      code: "CONFIRM_INVALID_DRAFT",
      message: "currentDraft 未通过 2.0.0 语义校验（§12.9），不得确认",
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
  if (input.strategyId !== undefined && !(await store.hasStrategy(input.strategyId))) {
    return {
      ok: false,
      code: "STRATEGY_ID_UNKNOWN",
      message: `未知 strategyId：${input.strategyId}，不得由 caller 自创`,
      issues: null,
      actualDigest: strategyDigest,
    };
  }
  const confirmation: ConfirmedRevision = await store.commitConfirmation(
    {
      ...(input.strategyId !== undefined ? { strategyId: input.strategyId } : {}),
      digest: strategyDigest,
      createdAt: (options.now ?? (() => new Date().toISOString()))(),
    },
    canonicalAst,
  );
  return { ok: true, confirmation, canonicalAst, strategyDigest };
}
