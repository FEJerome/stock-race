import type { ModelCallError } from "../../../application/ports/model.js";

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface KimiClientOptions {
  readonly apiKey: string;
  readonly modelId: string;
  /** Moonshot OpenAI 兼容端点（官方文档口径，探针证实前不作能力声称）。 */
  readonly baseUrl?: string;
  /** 单请求超时（默认 60s，方案 §2.4）。 */
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
/** 仅网络错误/5xx 重试一次；4xx/429 不重试（遇 429 停手上浮）。 */
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
 * 单次 chat/completions 调用（含一次网络重试）。错误消息只含状态码/错误类，
 * 不回显响应体或请求头，apiKey 不出现在任何返回值中。
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
    // 传输格式假设为 JSON object；原生 JSON Schema 能力待探针证实，本地严格校验不依赖传输格式（契约 6.3）。
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
        // 200 但响应体非 JSON：这是 BAD_OUTPUT（模型/网关输出问题），不是网络错误，不重试
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
        // 超时不重试（单次预算内直接上浮），网络错误重试一次
        return { ok: false, error: classified, latencyMs: Date.now() - startedAt };
      }
      lastError = classified;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError ?? { class: "UNKNOWN", message: "request failed", retryable: false }, latencyMs: Date.now() - startedAt };
}
