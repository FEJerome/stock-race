import type { CapabilityManifest } from "../../core/strategy/generated/capability-manifest.types.js";
import type { ModelProvenance } from "../../core/strategy/generated/model-provenance.types.js";
import type { ValidationIssue } from "../../core/strategy/generated/validation-issue.types.js";

/**
 * One turn of the A YI interview conversation history (contract 6.1: the port
 * accepts only natural language, the capability manifest, an optional old
 * AST, and structured validation errors).
 */
export interface ConversationTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

interface ModelDraftRequestBase {
  /** Deterministic capability manifest from createCapabilityManifest. */
  readonly capabilityManifest: CapabilityManifest;
  /** 0 = initial draft; 1/2 = repair rounds (capped at two, contract 3.3). */
  readonly attempt: number;
}

/**
 * Initial request: natural-language intent + interview history + optional
 * baseline AST.
 * Repair-round request (contract 3.3 verbatim: "model repair receives only
 * structured errors and the capability manifest"): the discriminated union
 * rules out intent/conversation/baseline in repair rounds at the type level.
 */
export type ModelDraftRequest =
  | (ModelDraftRequestBase & {
      readonly kind: "draft";
      /** User's natural-language intent. */
      readonly intent: string;
      /** A YI interview history; empty on the first round. */
      readonly conversation: readonly ConversationTurn[];
      /** Baseline canonical AST for F10 adjust-v2. */
      readonly baseCanonicalAst?: string;
    })
  | (ModelDraftRequestBase & {
      readonly kind: "repair";
      /** Sole business payload of a repair round: structured validation errors. */
      readonly repairIssues: readonly ValidationIssue[];
    });

export type ModelErrorClass = NonNullable<ModelProvenance["errorClass"]>;

export interface ModelCallError {
  readonly class: ModelErrorClass;
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * The port returns rawText unparsed: model output is untrusted and
 * parseJsonInput is the single parsing entry point.
 * The port cannot create orders, mutate a RunSpec, make per-bar calls, or
 * replace the authoritative readback — its signature has no such channel.
 * provenance contains no secret and no prompt/response bodies (redaction
 * policy, decisions 2026-11-12 item 5).
 */
export type ModelDraftResponse =
  | { readonly ok: true; readonly rawText: string; readonly provenance: ModelProvenance }
  | { readonly ok: false; readonly error: ModelCallError; readonly provenance: ModelProvenance };

export interface StrategyDraftPort {
  draft(request: ModelDraftRequest): Promise<ModelDraftResponse>;
}
