import type { ModelCallError } from "../../../application/ports/model.js";

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface KimiClientOptions {
  readonly apiKey: string;
  readonly modelId: string;
  /** Moonshot OpenAI-compatible endpoint (per official docs; no capability claims until verified by probe). */
  readonly baseUrl?: string;
  /** Per-request timeout (default 60s, plan §2.4). */
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface KimiUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export type KimiCallResult =
  | { readonly ok: true; readonly rawText: string; readonly usage: KimiUsage | null; readonly latencyMs: number }
  | { readonly ok: false; readonly error: ModelCallError; readonly latencyMs: number };

const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_TIMEOUT_MS = 60_000;
/** Retry once only for network errors/5xx; never retry 4xx/429 (a 429 surfaces immediately). */
const MAX_NETWORK_RETRIES = 1;

function classifyHttp(status: number): ModelCallError {
  if (status === 429) {
    return { class: "RATE_LIMITED", message: `HTTP 429 rate limited`, retryable: false };
  }
  if (status === 401 || status === 403) {
    return { class: "AUTH", message: `HTTP ${status} authentication failed`, retryable: false };
  }
  if (status >= 500) {
    return { class: "UNAVAILABLE", message: `HTTP ${status} server error`, retryable: true };
  }
  return { class: "UNKNOWN", message: `HTTP ${status} request rejected`, retryable: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Single chat/completions call (including one network retry). Error messages
 * contain only the status code / error class — never the response body or
 * request headers — and the apiKey never appears in any returned value.
 */
export async function callChatCompletions(
  options: KimiClientOptions,
  messages: readonly ChatMessage[],
): Promise<KimiCallResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify({
    model: options.modelId,
    messages,
    // Transport format assumed to be JSON object; native JSON Schema capability awaits probe verification — local strict validation does not depend on the transport format (contract 6.3).
    response_format: { type: "json_object" },
  });

  const startedAt = Date.now();
  let lastError: ModelCallError | null = null;
  for (let attemptIndex = 0; attemptIndex <= MAX_NETWORK_RETRIES; attemptIndex += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = classifyHttp(response.status);
        if (!error.retryable || attemptIndex === MAX_NETWORK_RETRIES) {
          return { ok: false, error, latencyMs: Date.now() - startedAt };
        }
        lastError = error;
        continue;
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        // 200 with a non-JSON body: BAD_OUTPUT (a model/gateway output problem), not a network error — do not retry
        return {
          ok: false,
          error: { class: "BAD_OUTPUT", message: "response body is not valid JSON", retryable: false },
          latencyMs: Date.now() - startedAt,
        };
      }
      const latencyMs = Date.now() - startedAt;
      const content =
        isRecord(payload) && Array.isArray(payload.choices) && isRecord(payload.choices[0]) &&
        isRecord(payload.choices[0].message) && typeof payload.choices[0].message.content === "string"
          ? payload.choices[0].message.content
          : null;
      if (content === null || content.trim() === "") {
        return {
          ok: false,
          error: { class: "BAD_OUTPUT", message: "response missing choices[0].message.content", retryable: false },
          latencyMs,
        };
      }
      const rawUsage = isRecord(payload) && isRecord(payload.usage) ? payload.usage : null;
      const usage: KimiUsage | null =
        rawUsage && typeof rawUsage.prompt_tokens === "number" && typeof rawUsage.completion_tokens === "number"
          ? { promptTokens: rawUsage.prompt_tokens, completionTokens: rawUsage.completion_tokens }
          : null;
      return { ok: true, rawText: content, usage, latencyMs };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      const classified: ModelCallError = isAbort
        ? { class: "TIMEOUT", message: `request aborted after ${timeoutMs}ms`, retryable: true }
        : { class: "UNAVAILABLE", message: `network error: ${error instanceof Error ? error.name : "unknown"}`, retryable: true };
      if (attemptIndex === MAX_NETWORK_RETRIES || isAbort) {
        // Timeouts are never retried (surface within the single-attempt budget); network errors are retried once
        return { ok: false, error: classified, latencyMs: Date.now() - startedAt };
      }
      lastError = classified;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError ?? { class: "UNKNOWN", message: "request failed", retryable: false }, latencyMs: Date.now() - startedAt };
}
