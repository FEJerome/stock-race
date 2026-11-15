import type { ModelProvenance } from "../../core/strategy/generated/model-provenance.types.js";
import type { Readback } from "../../core/strategy/generated/readback.types.js";
import type { ValidationIssue } from "../../core/strategy/generated/validation-issue.types.js";
import { createCapabilityManifest } from "../../core/strategy/registry/capability-manifest.js";
import type { ObservationKind } from "../../core/strategy/registry/types.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { validateStrategyUseCase } from "../validate-strategy/index.js";
import type { ConversationTurn, ModelDraftRequest, StrategyDraftPort } from "../ports/model.js";

export interface DraftStrategyInput {
  readonly intent: string;
  readonly conversation?: readonly ConversationTurn[];
  readonly baseCanonicalAst?: string;
  readonly observationKind?: ObservationKind;
}

/**
 * Result axis aligned with the product state matrix: valid / invalid / model-error.
 * - valid: some round's output passed the full validation chain
 *   (parseJsonInput → schema → semantics → canonical → readback).
 * - invalid: the model produced a draft that fails validation and repair
 *   makes no progress (byte-identical repeated output stops repair early).
 * - model-error: port-level failure (TIMEOUT/UNAVAILABLE…), or still broken
 *   after two repair rounds (REPAIR_EXHAUSTED).
 * provenance covers every port call; attempts = number of port calls.
 */
export type DraftStrategyResult =
  | {
      readonly ok: true;
      readonly status: "valid";
      readonly canonicalAst: string;
      readonly strategyDigest: string;
      readonly readback: Readback;
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly status: "invalid";
      readonly issues: readonly ValidationIssue[];
      readonly lastRawText: string;
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly status: "model-error";
      readonly errorCode: string;
      readonly message: string;
      readonly issues: readonly ValidationIssue[] | null;
      readonly intent: string;
      readonly lastRawText: string | null;
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    };

/** Repair-round cap: initial draft + two repair rounds (contract 3.3). */
export const DRAFT_MAX_ATTEMPTS = 3;

/**
 * Orchestration (plan §2.2): assemble request → port.draft → parseJsonInput →
 * reuse the full validateStrategyUseCase chain. rawText returned by the port
 * is untrusted; the validation chain is the single parsing entry point.
 * If invalid and repair rounds remain → feed issues back; byte-identical
 * repetition of the previous draft counts as no progress and stops early at
 * invalid; still broken after two rounds → REPAIR_EXHAUSTED.
 * Port-level failure (timeout/unavailable) → model-error, keeping intent and
 * the last draft, with no fallback to a fake.
 * The use case is stateless; the product state axis is held by the host.
 */
export async function draftStrategy(
  port: StrategyDraftPort,
  input: DraftStrategyInput,
): Promise<DraftStrategyResult> {
  const capabilityManifest = createCapabilityManifest(createRegistryV1());
  const conversation = input.conversation ?? [];
  const provenance: ModelProvenance[] = [];
  let lastRawText: string | null = null;
  let lastIssues: readonly ValidationIssue[] = [];
  let repairIssues: readonly ValidationIssue[] | undefined;

  for (let attempt = 0; attempt < DRAFT_MAX_ATTEMPTS; attempt += 1) {
    // Contract 3.3: repair rounds receive only structured errors and the capability manifest — intent/conversation/baseline appear in the initial draft only.
    const request: ModelDraftRequest =
      attempt === 0
        ? {
            kind: "draft",
            intent: input.intent,
            conversation,
            capabilityManifest,
            ...(input.baseCanonicalAst !== undefined ? { baseCanonicalAst: input.baseCanonicalAst } : {}),
            attempt,
          }
        : { kind: "repair", repairIssues: repairIssues ?? [], capabilityManifest, attempt };
    const response = await port.draft(request);
    provenance.push(response.provenance);
    if (!response.ok) {
      return {
        ok: false,
        status: "model-error",
        errorCode: response.error.class,
        message: response.error.message,
        issues: null,
        intent: input.intent,
        lastRawText,
        provenance,
        attempts: attempt + 1,
      };
    }
    if (lastRawText !== null && response.rawText === lastRawText) {
      // Byte-identical repeat of the previous draft: repair carries no new information, stop early at invalid (exactly decidable under the deterministic fake).
      return {
        ok: false,
        status: "invalid",
        issues: lastIssues,
        lastRawText,
        provenance,
        attempts: attempt + 1,
      };
    }
    lastRawText = response.rawText;
    const validation = validateStrategyUseCase(response.rawText, {
      ...(input.observationKind !== undefined ? { observationKind: input.observationKind } : {}),
    });
    if (validation.ok) {
      return {
        ok: true,
        status: "valid",
        canonicalAst: validation.canonicalAst!,
        strategyDigest: validation.strategyDigest!,
        readback: validation.readback!,
        provenance,
        attempts: attempt + 1,
      };
    }
    lastIssues = validation.issues;
    repairIssues = validation.issues;
  }
  return {
    ok: false,
    status: "model-error",
    errorCode: "REPAIR_EXHAUSTED",
    message: `Draft still invalid after ${DRAFT_MAX_ATTEMPTS} attempts (initial + two repair rounds)`,
    issues: lastIssues,
    intent: input.intent,
    lastRawText,
    provenance,
    attempts: DRAFT_MAX_ATTEMPTS,
  };
}
