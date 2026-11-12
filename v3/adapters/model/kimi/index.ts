import type { ModelProvenance } from "../../../core/strategy/generated/model-provenance.types.js";
import type {
  ModelDraftRequest,
  ModelDraftResponse,
  StrategyDraftPort,
} from "../../../application/ports/model.js";
import { callChatCompletions } from "./client.js";
import { buildDraftMessages } from "./prompt.js";

/** 脱敏请求元数据（decisions 2026-11-12 第 5 项：prompt/响应原文不落盘，仅元数据落 .local）。 */
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
  /** 仅 composition root 从 secret provider 注入；不得进日志/错误消息/provenance。 */
  readonly apiKey: string;
  /** 真实 provider model id 须经探针证实后配置，adapter 不设默认值。 */
  readonly modelId: string;
  /** Moonshot OpenAI 兼容端点（探针证实前不作能力声称）。 */
  readonly baseUrl?: string;
  /** 单请求超时，默认 60s。 */
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly metadataSink?: (entry: ModelRequestMetadata) => void;
}

/**
 * 真实 Kimi adapter（契约 6.1）：仅存在于 hosts/local composition root；
 * 返回 rawText 不解析；不产生订单/不改 RunSpec/不逐日调用/不替代回读。
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
