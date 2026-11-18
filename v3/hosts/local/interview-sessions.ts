import {
  createInterview,
  interviewTurn,
  type InterviewState,
  type InterviewTurnResult,
} from "../../application/interview/index.js";
import type { StrategyDraftPort } from "../../application/ports/model.js";

export interface InterviewSession {
  readonly id: string;
  /** Interview style chosen on the landing page ("novice" | "expert"); selects the scripted scenario in fake mode. */
  readonly style: string;
  /**
   * The session's own port instance, created once at session start: a scripted
   * per-call fake consumes one scenario step per call, so sharing or recreating
   * it across turns would corrupt the script.
   */
  readonly port: StrategyDraftPort;
  state: InterviewState;
}

/**
 * In-memory interview sessions for the local host (S4 web slice). Sessions
 * are process-local by design: the local host is a single-user playground and
 * a restart simply starts a fresh interview — confirmed strategies and runs
 * persist under v3-data, conversational state does not need to.
 */
export class InterviewSessionManager {
  private readonly sessions = new Map<string, InterviewSession>();
  private counter = 0;

  constructor(private readonly assetPool: readonly string[]) {}

  start(options: { readonly style?: string; readonly baseCanonicalAst?: string; readonly port: StrategyDraftPort }): InterviewSession {
    this.counter += 1;
    const base = createInterview({ assetPool: this.assetPool });
    const session: InterviewSession = {
      id: `interview-${String(this.counter).padStart(4, "0")}`,
      style: options.style ?? "novice",
      port: options.port,
      state:
        options.baseCanonicalAst !== undefined
          ? // Adjustment flow: the previous signed card is the model's baseline; slots stay empty until a new valid draft re-fills them.
            { ...base, lastCanonicalAst: options.baseCanonicalAst }
          : base,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): InterviewSession | null {
    return this.sessions.get(id) ?? null;
  }

  async turn(session: InterviewSession, userText: string): Promise<InterviewTurnResult> {
    const result = await interviewTurn(session.port, session.state, userText);
    session.state = result.state;
    return result;
  }
}
