import { ContractError } from "../../core/strategy/canonical/errors.js";
import { canonicalizeStrategyDraft2 } from "../../core/strategy/canonical/strategy-canonical-2.js";
import { digestCanonical } from "../../core/strategy/canonical/digest.js";
import type { Readback } from "../../core/strategy/generated/readback.types.js";
import type { ValidationIssue } from "../../core/strategy/generated/validation-issue.types.js";
import { createAuthoritativeReadback2 } from "../../core/strategy/readback/readback-2.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import type { ObservationKind } from "../../core/strategy/registry/types.js";
import { parseJsonInput } from "../../core/strategy/validation/json-input.js";
import { validateStrategyDraft2, assertValidStrategyDraft2 } from "../../core/strategy/validation/schema-validator-2.js";
import { validateStrategySemantics2 } from "../../core/strategy/validation/semantic-validator-2.js";
import type { ValidateStrategyResult } from "./validate-strategy.js";

export interface ValidateStrategy2Options {
  readonly observationKind?: ObservationKind;
}

function failure(issues: readonly ValidationIssue[]): ValidateStrategyResult {
  return { ok: false, issues, canonicalAst: null, strategyDigest: null, readback: null };
}

/**
 * 2.0.0 counterpart of validateStrategyUseCase — the same frozen chain
 * (§3.3): JSON parse → JSON Schema (no extra fields) → §12.9 semantic stage →
 * canonical normalization → digest → authoritative readback. The §12.9
 * semantic obligations (stop-loss open interval, allocation domains, and the
 * 1.0.0 AST semantics reused per asset) are enforced BEFORE canonicalization,
 * digest, and readback: a semantically rejected 2.0.0 draft never becomes
 * digestible or signable, and is never silently clamped or default-filled.
 */
export function validateStrategyUseCase2(input: unknown, options: ValidateStrategy2Options = {}): ValidateStrategyResult {
  let value = input;
  if (typeof input === "string") {
    try {
      value = parseJsonInput(input);
    } catch (error) {
      if (error instanceof ContractError) {
        return failure([{ code: error.code, severity: "error", path: error.path, message: error.message }]);
      }
      throw error;
    }
  }
  const schemaIssues = validateStrategyDraft2(value);
  if (schemaIssues.length > 0) return failure(schemaIssues);
  assertValidStrategyDraft2(value);
  const strategy = value;
  const registry = createRegistryV1();
  const semanticIssues = validateStrategySemantics2(strategy, registry, options.observationKind ?? "ohlcv");
  if (semanticIssues.length > 0) return failure(semanticIssues);
  try {
    const canonicalAst = canonicalizeStrategyDraft2(strategy);
    const readback: Readback = createAuthoritativeReadback2(canonicalAst, registry, options.observationKind ?? "ohlcv");
    return {
      ok: true,
      issues: [],
      canonicalAst,
      strategyDigest: digestCanonical(canonicalAst),
      readback,
    };
  } catch (error) {
    if (error instanceof ContractError) {
      return failure([{ code: error.code, severity: "error", path: error.path, message: error.message }]);
    }
    throw error;
  }
}
