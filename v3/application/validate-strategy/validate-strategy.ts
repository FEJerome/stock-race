import { ContractError } from "../../core/strategy/canonical/errors.js";
import { canonicalizeStrategyDraft } from "../../core/strategy/canonical/strategy-canonical.js";
import { digestCanonical } from "../../core/strategy/canonical/digest.js";
import type { Readback } from "../../core/strategy/generated/readback.types.js";
import type { ValidationIssue } from "../../core/strategy/generated/validation-issue.types.js";
import { createAuthoritativeReadback } from "../../core/strategy/readback/readback.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import type { ObservationKind } from "../../core/strategy/registry/types.js";
import { parseJsonInput } from "../../core/strategy/validation/json-input.js";
import { validateStrategyDraft, assertValidStrategyDraft } from "../../core/strategy/validation/schema-validator.js";
import { validateStrategySemantics } from "../../core/strategy/validation/semantic-validator.js";

export interface ValidateStrategyOptions {
  readonly observationKind?: ObservationKind;
}

export type ValidateStrategyResult = {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly canonicalAst: string | null;
  readonly strategyDigest: string | null;
  readonly readback: Readback | null;
};

function failure(issues: readonly ValidationIssue[]): ValidateStrategyResult {
  return { ok: false, issues, canonicalAst: null, strategyDigest: null, readback: null };
}

export function validateStrategyUseCase(input: unknown, options: ValidateStrategyOptions = {}): ValidateStrategyResult {
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
  const schemaIssues = validateStrategyDraft(value);
  if (schemaIssues.length > 0) return failure(schemaIssues);
  assertValidStrategyDraft(value);
  const strategy = value;
  const registry = createRegistryV1();
  const semanticIssues = validateStrategySemantics(strategy, registry, options.observationKind ?? "ohlcv");
  if (semanticIssues.length > 0) return failure(semanticIssues);
  const canonicalAst = canonicalizeStrategyDraft(strategy);
  const readback = createAuthoritativeReadback(canonicalAst, registry, options.observationKind ?? "ohlcv");
  return {
    ok: true,
    issues: [],
    canonicalAst,
    strategyDigest: digestCanonical(canonicalAst),
    readback,
  };
}
