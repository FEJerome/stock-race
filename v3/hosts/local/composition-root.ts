import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createKimiAdapter, type ModelRequestMetadata } from "../../adapters/model/kimi/index.js";
import { createFileStrategyStore } from "../../adapters/persistence/file/strategy-store.js";
import type { StrategyDraftPort } from "../../application/ports/model.js";
import type { StrategyStore } from "../../application/ports/strategy-store.js";

export interface LocalCompositionOptions {
  /** v3-data root directory (confirmations/run results are persisted here). */
  readonly dataRoot: string;
  /** Kimi credentials and model config; the apiKey is injected via the secret provider and never appears in any returned value. */
  readonly kimi: {
    readonly apiKey: string;
    readonly modelId: string;
    readonly baseUrl?: string;
    readonly timeoutMs?: number;
  };
  /** Persistence path for redacted metadata (under .local/). */
  readonly metadataLogPath?: string;
  /**
   * Explicit test-wiring switch (contract 6.2): only test code may inject the
   * deterministic fake. The public main-flow construction path accepts no port
   * injection other than this parameter.
   * The optional interviewPortFactory hands each interview session a fresh port
   * instance (a scripted fake consumes one scenario per session and must never
   * be shared across sessions); the style argument carries the interview style
   * chosen on the landing page ("novice" | "expert") so a scripted driver can
   * pick the matching scenario. When omitted, modelPort serves interviews too.
   */
  readonly testOverrides?: {
    readonly modelPort?: StrategyDraftPort;
    readonly interviewPortFactory?: (style?: string) => StrategyDraftPort;
  };
}

export interface LocalComposition {
  /** Adapter identity visible to the outside (used for the "fake never enters the real main flow" assertion). */
  readonly adapterInfo: { readonly provider: "kimi" | "test-override"; readonly modelId: string };
  readonly modelPort: StrategyDraftPort;
  /** Fresh port per interview session; defaults to the shared modelPort. */
  readonly createInterviewPort: (style?: string) => StrategyDraftPort;
  readonly store: StrategyStore;
  readonly dataRoot: string;
}

/**
 * hosts/local composition root (node:http, zero dependencies; decisions
 * 2026-11-12 item 3).
 * By default only the real Kimi adapter is wired; the deterministic fake can
 * be injected by tests only through testOverrides — this module imports no
 * deterministic implementation.
 * Prompt/response bodies are never persisted; only request metadata is
 * appended to metadataLogPath (.local/).
 */
export function createLocalComposition(options: LocalCompositionOptions): LocalComposition {
  const store = createFileStrategyStore(options.dataRoot);
  const metadataSink = options.metadataLogPath
    ? (entry: ModelRequestMetadata): void => {
        mkdirSync(path.dirname(options.metadataLogPath!), { recursive: true });
        appendFileSync(options.metadataLogPath!, `${JSON.stringify(entry)}\n`, "utf8");
      }
    : undefined;
  if (options.testOverrides?.modelPort) {
    return {
      adapterInfo: { provider: "test-override", modelId: "injected-by-test" },
      modelPort: options.testOverrides.modelPort,
      createInterviewPort: options.testOverrides.interviewPortFactory ?? (() => options.testOverrides!.modelPort!),
      store,
      dataRoot: options.dataRoot,
    };
  }
  const kimiPort = createKimiAdapter({
    apiKey: options.kimi.apiKey,
    modelId: options.kimi.modelId,
    ...(options.kimi.baseUrl !== undefined ? { baseUrl: options.kimi.baseUrl } : {}),
    ...(options.kimi.timeoutMs !== undefined ? { timeoutMs: options.kimi.timeoutMs } : {}),
    ...(metadataSink ? { metadataSink } : {}),
  });
  return {
    adapterInfo: { provider: "kimi", modelId: options.kimi.modelId },
    modelPort: kimiPort,
    createInterviewPort: options.testOverrides?.interviewPortFactory ?? (() => kimiPort),
    store,
    dataRoot: options.dataRoot,
  };
}
