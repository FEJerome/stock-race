import { canonicalizeJson } from "../../core/strategy/canonical/canonical-json.js";
import { ContractError } from "../../core/strategy/canonical/errors.js";
import { digestCanonical } from "../../core/strategy/canonical/digest.js";
import type { ModelProvenance } from "../../core/strategy/generated/model-provenance.types.js";
import type { Readback } from "../../core/strategy/generated/readback.types.js";
import type { ValidationIssue } from "../../core/strategy/generated/validation-issue.types.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import { createCapabilityManifest } from "../../core/strategy/registry/capability-manifest.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { parseJsonInput } from "../../core/strategy/validation/json-input.js";
import { DRAFT_MAX_ATTEMPTS } from "../draft-strategy/draft-strategy.js";
import type { ConversationTurn, ModelDraftRequest, StrategyDraftPort } from "../ports/model.js";
import { validateStrategyUseCase2 } from "../validate-strategy/validate-strategy-2.js";

/** Convergence cap for the four-cell interview (S4 plan: hard top at 12 user turns). */
export const INTERVIEW_MAX_TURNS = 12;

/** The four product cells (contract §12.2), in the order the interview walks them. */
export const INTERVIEW_CELL_KEYS = ["universe", "rules", "risk", "allocation"] as const;
export type InterviewCellKey = (typeof INTERVIEW_CELL_KEYS)[number];

export interface CellOverride {
  /** Turn at which this value was replaced (用户改口). */
  readonly turn: number;
  /** Canonical JSON of the replaced cell slice — kept as the audit trail (留痕). */
  readonly canonicalValue: string;
}

export interface CellSlot {
  readonly status: "empty" | "filled";
  /** Canonical JSON of the cell slice as it appears in the latest valid draft. */
  readonly canonicalValue: string | null;
  readonly filledAtTurn: number | null;
  /** Previous values, oldest first; a cell is only ever overwritten by a later valid draft. */
  readonly overrides: readonly CellOverride[];
}

export interface InterviewState {
  readonly status: "in-progress" | "ready" | "failed";
  /** Completed user turns (model-error turns are not consumed — the exchange never happened). */
  readonly turnCount: number;
  readonly slots: Readonly<Record<InterviewCellKey, CellSlot>>;
  readonly transcript: readonly ConversationTurn[];
  /** Canonical AST of the latest valid draft; fed back as the baseline for adjustments. */
  readonly lastCanonicalAst: string | null;
  /** Slice asset pool: the interview may only narrow the universe inside this set. */
  readonly assetPool: readonly string[];
}

export interface InterviewCard {
  readonly canonicalAst: string;
  readonly strategyDigest: string;
  readonly readback: Readback;
}

export type InterviewTurnResult =
  | {
      readonly ok: true;
      readonly kind: "question";
      readonly text: string;
      readonly state: InterviewState;
      readonly missingCells: readonly InterviewCellKey[];
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    }
  | {
      readonly ok: true;
      readonly kind: "draft";
      readonly state: InterviewState;
      readonly card: InterviewCard;
      readonly filledCells: readonly InterviewCellKey[];
      readonly overriddenCells: readonly InterviewCellKey[];
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly kind: "invalid";
      readonly issues: readonly ValidationIssue[];
      readonly state: InterviewState;
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly kind: "model-error";
      readonly errorCode: string;
      readonly message: string;
      readonly issues: readonly ValidationIssue[] | null;
      readonly state: InterviewState;
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly kind: "not-converged";
      readonly code: "INTERVIEW_NOT_CONVERGED";
      readonly message: string;
      readonly state: InterviewState;
      readonly missingCells: readonly InterviewCellKey[];
    }
  | {
      readonly ok: false;
      readonly kind: "closed";
      readonly code: "INTERVIEW_CLOSED";
      readonly message: string;
      readonly state: InterviewState;
    };

function emptySlot(): CellSlot {
  return { status: "empty", canonicalValue: null, filledAtTurn: null, overrides: [] };
}

export function missingCellsOf(state: InterviewState): InterviewCellKey[] {
  return INTERVIEW_CELL_KEYS.filter((key) => state.slots[key].status === "empty");
}

/** The single gap the interview is currently working on (一次一缺口). */
export function currentGapOf(state: InterviewState): InterviewCellKey | null {
  return missingCellsOf(state)[0] ?? null;
}

export function createInterview(options: { readonly assetPool: readonly string[] }): InterviewState {
  const pool = options.assetPool;
  if (pool.length < 2 || pool.some((asset) => asset.length === 0) || new Set(pool).size !== pool.length) {
    throw new ContractError("INVALID_ASSET_POOL", "assetPool 必须是至少 2 个互不重复的非空资产 id", "/assetPool");
  }
  return {
    status: "in-progress",
    turnCount: 0,
    slots: { universe: emptySlot(), rules: emptySlot(), risk: emptySlot(), allocation: emptySlot() },
    transcript: [],
    lastCanonicalAst: null,
    assetPool: [...pool],
  };
}

// ── Envelope (contract §12.3): the model's rawText carries exactly
// {"kind":"question","text":"…"} or {"kind":"draft","draft":{…}}. The envelope
// is validated by the application; only the draft branch enters the full
// validation chain, and a question turn never fills a cell.

type InterviewEnvelope =
  | { readonly kind: "question"; readonly text: string }
  | { readonly kind: "draft"; readonly draft: unknown };

function envelopeIssue(path: string, message: string): ValidationIssue {
  return { code: "INVALID_INTERVIEW_ENVELOPE", severity: "error", path, message };
}

function parseEnvelope(rawText: string): { readonly ok: true; readonly envelope: InterviewEnvelope } | { readonly ok: false; readonly issues: ValidationIssue[] } {
  let value: unknown;
  try {
    value = parseJsonInput(rawText);
  } catch (error) {
    if (error instanceof ContractError) {
      return { ok: false, issues: [envelopeIssue("", `信封不是合法 JSON：${error.message}`)] };
    }
    throw error;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, issues: [envelopeIssue("", "信封必须是对象 {kind: question|draft, …}")] };
  }
  const keys = Object.keys(value).sort();
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind !== "question" && kind !== "draft") {
    return { ok: false, issues: [envelopeIssue("/kind", "kind 必须是 \"question\" 或 \"draft\"")] };
  }
  if (kind === "question") {
    if (keys.join(" ") !== "kind text") {
      return { ok: false, issues: [envelopeIssue("", "question 信封只允许携带 kind 与 text 两个字段")] };
    }
    if (typeof record.text !== "string" || record.text.length === 0) {
      return { ok: false, issues: [envelopeIssue("/text", "question.text 必须是非空字符串")] };
    }
    return { ok: true, envelope: { kind: "question", text: record.text } };
  }
  if (keys.join(" ") !== "draft kind") {
    return { ok: false, issues: [envelopeIssue("", "draft 信封只允许 kind 与 draft 两个字段")] };
  }
  if (record.draft === null || typeof record.draft !== "object") {
    return { ok: false, issues: [envelopeIssue("/draft", "draft.draft 必须是 StrategyDraft 2.0.0 对象")] };
  }
  return { ok: true, envelope: { kind: "draft", draft: record.draft } };
}

// ── Cell bookkeeping: a cell enters the card only from a draft that passed the
// full 2.0.0 chain (no hidden defaults — the application never invents a value,
// and model prose in question turns fills nothing). A later valid draft whose
// cell differs overrides the slot; the replaced value is kept in `overrides`.

function cellCanonicalValues(canonicalAst: string): Record<InterviewCellKey, string> {
  const draft = JSON.parse(canonicalAst) as StrategyDraft2;
  return {
    universe: canonicalizeJson(draft.universe),
    rules: canonicalizeJson({ entry: draft.entry, exits: draft.exits, indicators: draft.indicators }),
    risk: canonicalizeJson(draft.risk),
    allocation: canonicalizeJson(draft.allocation),
  };
}

function applyDraftToSlots(
  slots: InterviewState["slots"],
  canonicalAst: string,
  turn: number,
): { slots: InterviewState["slots"]; filled: InterviewCellKey[]; overridden: InterviewCellKey[] } {
  const cells = cellCanonicalValues(canonicalAst);
  const next: Record<InterviewCellKey, CellSlot> = { ...slots };
  const filled: InterviewCellKey[] = [];
  const overridden: InterviewCellKey[] = [];
  for (const key of INTERVIEW_CELL_KEYS) {
    const slot = slots[key];
    const value = cells[key];
    if (slot.status === "empty") {
      next[key] = { status: "filled", canonicalValue: value, filledAtTurn: turn, overrides: [] };
      filled.push(key);
    } else if (slot.canonicalValue !== value) {
      next[key] = {
        status: "filled",
        canonicalValue: value,
        filledAtTurn: slot.filledAtTurn,
        overrides: [...slot.overrides, { turn, canonicalValue: slot.canonicalValue! }],
      };
      overridden.push(key);
    } else {
      next[key] = slot;
    }
  }
  return { slots: next, filled, overridden };
}

/** The slice pool is the application-side boundary against stock-pushing: a draft whose universe names assets outside the pool is rejected with a structured issue and fed back as a repair round. */
function poolViolations(canonicalAst: string, pool: readonly string[]): ValidationIssue[] {
  const draft = JSON.parse(canonicalAst) as StrategyDraft2;
  const issues: ValidationIssue[] = [];
  draft.universe.assets.forEach((assetId, index) => {
    if (!pool.includes(assetId)) {
      issues.push({
        code: "ASSET_OUTSIDE_POOL",
        severity: "error",
        path: `/universe/assets/${index}`,
        message: `资产 ${assetId} 不在本轮可选股票池内，管理范围只能从池中选取`,
        expected: pool.join(", "),
        actual: assetId,
      });
    }
  });
  return issues;
}

/**
 * One interview turn (contract §12.3 + S4 plan): the user's text goes to the
 * port with the conversation, the capability manifest, and — once one exists —
 * the latest valid draft as baseline. The envelope is validated; a question
 * ends the turn with slots untouched; a draft branch runs the full 2.0.0 chain
 * (schema → §12.9 semantics → canonical → digest → readback) plus the pool
 * check, with at most two repair rounds (DRAFT_MAX_ATTEMPTS, unchanged).
 * A port-level failure consumes no turn: the state is returned unchanged so
 * the host can retry (model-error 态保留对话与已填格). When turn 12 closes
 * without all four cells filled, the interview fails explicitly
 * (INTERVIEW_NOT_CONVERGED) instead of dangling.
 */
export async function interviewTurn(
  port: StrategyDraftPort,
  state: InterviewState,
  userText: string,
): Promise<InterviewTurnResult> {
  if (userText.trim().length === 0) {
    throw new ContractError("EMPTY_INTERVIEW_TURN", "用户输入不能为空", "/userText");
  }
  if (state.status === "failed") {
    return {
      ok: false,
      kind: "closed",
      code: "INTERVIEW_CLOSED",
      message: "面试已以不收敛告终，请重新开始",
      state,
    };
  }
  if (state.status === "in-progress" && state.turnCount >= INTERVIEW_MAX_TURNS) {
    return notConverged({ ...state, status: "failed" });
  }

  const turn = state.turnCount + 1;
  const consumedState: InterviewState = {
    ...state,
    turnCount: turn,
    transcript: [...state.transcript, { role: "user", content: userText }],
  };

  const capabilityManifest = createCapabilityManifest(createRegistryV1());
  const provenance: ModelProvenance[] = [];
  let lastRawText: string | null = null;
  let lastIssues: readonly ValidationIssue[] = [];

  const failAtCap = (result: InterviewTurnResult): InterviewTurnResult => {
    if (result.kind === "draft") return result;
    if (turn >= INTERVIEW_MAX_TURNS && state.status === "in-progress" && missingCellsOf(result.state).length > 0) {
      return notConverged({ ...result.state, status: "failed" });
    }
    return result;
  };

  for (let attempt = 0; attempt < DRAFT_MAX_ATTEMPTS; attempt += 1) {
    const request: ModelDraftRequest =
      attempt === 0
        ? {
            kind: "draft",
            intent: userText,
            conversation: state.transcript,
            capabilityManifest,
            ...(state.lastCanonicalAst !== null ? { baseCanonicalAst: state.lastCanonicalAst } : {}),
            attempt,
          }
        : { kind: "repair", repairIssues: lastIssues, capabilityManifest, attempt };
    const response = await port.draft(request);
    provenance.push(response.provenance);
    if (!response.ok) {
      // Port-level failure: the exchange never happened — turn not consumed,
      // state returned untouched (保留对话与各格, host may retry; no fake fallback).
      return {
        ok: false,
        kind: "model-error",
        errorCode: response.error.class,
        message: response.error.message,
        issues: null,
        state,
        provenance,
        attempts: attempt + 1,
      };
    }
    if (lastRawText !== null && response.rawText === lastRawText) {
      // Byte-identical repeat: repair carried no new information (same rule as draftStrategy).
      return failAtCap({
        ok: false,
        kind: "invalid",
        issues: lastIssues,
        state: consumedState,
        provenance,
        attempts: attempt + 1,
      });
    }
    lastRawText = response.rawText;

    const parsed = parseEnvelope(response.rawText);
    if (!parsed.ok) {
      lastIssues = parsed.issues;
      continue;
    }

    if (parsed.envelope.kind === "question") {
      const questioned: InterviewState = {
        ...consumedState,
        transcript: [...consumedState.transcript, { role: "assistant", content: response.rawText }],
      };
      return failAtCap({
        ok: true,
        kind: "question",
        text: parsed.envelope.text,
        state: questioned,
        missingCells: missingCellsOf(questioned),
        provenance,
        attempts: attempt + 1,
      });
    }

    // Draft branch: the only path that may fill cells — full chain first.
    const validation = validateStrategyUseCase2(parsed.envelope.draft);
    let issues: readonly ValidationIssue[] = validation.issues;
    if (validation.ok) {
      const pool = poolViolations(validation.canonicalAst!, state.assetPool);
      if (pool.length === 0) {
        const canonicalAst = validation.canonicalAst!;
        const { slots, filled, overridden } = applyDraftToSlots(state.slots, canonicalAst, turn);
        const ready: InterviewState = {
          ...consumedState,
          status: "ready",
          slots,
          transcript: [...consumedState.transcript, { role: "assistant", content: response.rawText }],
          lastCanonicalAst: canonicalAst,
        };
        return {
          ok: true,
          kind: "draft",
          state: ready,
          card: {
            canonicalAst,
            strategyDigest: validation.strategyDigest ?? digestCanonical(canonicalAst),
            readback: validation.readback!,
          },
          filledCells: filled,
          overriddenCells: overridden,
          provenance,
          attempts: attempt + 1,
        };
      }
      issues = pool;
    }
    lastIssues = issues;
  }

  return failAtCap({
    ok: false,
    kind: "model-error",
    errorCode: "REPAIR_EXHAUSTED",
    message: `本轮面试输出在第 ${DRAFT_MAX_ATTEMPTS} 次尝试后仍不可用（首轮 + 两轮修复）`,
    issues: lastIssues,
    state: consumedState,
    provenance,
    attempts: DRAFT_MAX_ATTEMPTS,
  });
}

function notConverged(state: InterviewState): InterviewTurnResult {
  return {
    ok: false,
    kind: "not-converged",
    code: "INTERVIEW_NOT_CONVERGED",
    message: `面试 ${INTERVIEW_MAX_TURNS} 轮内未能集齐四格（尚缺：${missingCellsOf(state).join("、") || "无"}），明示失败，请重新开始`,
    state,
    missingCells: missingCellsOf(state),
  };
}
