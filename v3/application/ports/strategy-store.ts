import type { ConfirmedRevision } from "../../core/strategy/generated/confirmed-revision.types.js";

export interface ConfirmationAllocation {
  /** When omitted, the store allocates a new strategyId; when supplied, it must be an existing (already confirmed) id. */
  readonly strategyId?: string;
  readonly digest: string;
  readonly createdAt: string;
}

/**
 * Port for confirmation and revision persistence (contract 3.1: strategyId /
 * revision are allocated by the application; decisions 2026-11-12 item 4:
 * v3-data/strategies/<strategyDigest>/ file layout).
 * Display metadata such as createdAt never enters the strategyDigest.
 *
 * Allocation and persistence collapse into the single atomic
 * commitConfirmation operation: the implementation serializes internally, and
 * callers must not hand-roll the "allocate id → take revision → persist"
 * sequence themselves (it would double-allocate under concurrency).
 */
export interface StrategyStore {
  /** Whether the strategyId already exists (has at least one confirmation). */
  hasStrategy(strategyId: string): Promise<boolean>;
  /**
   * Atomically performs "allocate id (when omitted) → allocate monotonic
   * revision → persist" and returns the complete ConfirmedRevision.
   * Concurrent calls must serialize so revisions never collide.
   */
  commitConfirmation(allocation: ConfirmationAllocation, canonicalAst: string): Promise<ConfirmedRevision>;
  /** Looks up the confirmation record for a given strategyId+revision; null when unconfirmed. */
  findConfirmation(strategyId: string, revision: number): Promise<ConfirmedRevision | null>;
  /** Lists all confirmation records for a strategyId (ascending by revision). */
  listConfirmations(strategyId: string): Promise<readonly ConfirmedRevision[]>;
  /** Reads the confirmed canonical AST by digest; null when absent; content that does not match the digest must be rejected. */
  loadCanonicalAst(digest: string): Promise<string | null>;
}
