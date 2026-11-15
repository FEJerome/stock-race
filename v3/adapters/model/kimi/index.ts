import type { ModelProvenance } from "../../../core/strategy/generated/model-provenance.types.js";
import type {
  ModelDraftRequest,
  ModelDraftResponse,
  StrategyDraftPort,
} from "../../../application/ports/model.js";
import { callChatCompletions } from "./client.js";
import { buildDraftMessages } from "./prompt.js";

/** Redacted request metadata (decisions 2026-11-12 item 5: prompt/response bodies are never persisted; only metadata lands in .local). */
export interface ModelRequestMetadata {
  readonly at: string;
  readonly provider: "kimi";
  readonly modelId: string;
  readonly attempt: number;
  readonly latencyMs: number;
  readonly usage?: ModelProvenance["usage"];
  readonly errorClass?: ModelProvenance["errorClass"];
}

export interface KimiAdapterOptions {
  /** Injected by the composition root only, from the secret provider; must never reach logs/error messages/provenance. */
  readonly apiKey: string;
  /** The real provider model id must be configured after probe verification; the adapter sets no default. */
  readonly modelId: string;
  /** Moonshot OpenAI-compatible endpoint (no capability claims until verified by probe). */
  readonly baseUrl?: string;
  /** Per-request timeout, default 60s. */
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly metadataSink?: (entry: ModelRequestMetadata) => void;
}

/**
 * Real Kimi adapter (contract 6.1): exists only in the hosts/local
 * composition root; returns rawText unparsed; creates no orders, mutates no
 * RunSpec, performs no per-bar calls, and never replaces the readback.
 */
export function createKimiAdapter(options: KimiAdapterOptions): StrategyDraftPort {
  return {
    async draft(request: ModelDraftRequest): Promise<ModelDraftResponse> {
      const result = await callChatCompletions(options, buildDraftMessages(request));
      const provenance: ModelProvenance = {
        provider: "kimi",
        modelId: options.modelId,
        attempt: request.attempt,
        latencyMs: result.latencyMs,
        ...(result.ok && result.usage ? { usage: result.usage } : {}),
        ...(!result.ok ? { errorClass: result.error.class } : {}),
      };
      options.metadataSink?.({
        at: new Date().toISOString(),
        provider: "kimi",
        modelId: options.modelId,
        attempt: request.attempt,
        latencyMs: result.latencyMs,
        ...(result.ok && result.usage ? { usage: result.usage } : {}),
        ...(!result.ok ? { errorClass: result.error.class } : {}),
      });
      if (!result.ok) {
        return { ok: false, error: result.error, provenance };
      }
      return { ok: true, rawText: result.rawText, provenance };
    },
  };
}
