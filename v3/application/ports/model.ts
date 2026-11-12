import type { CapabilityManifest } from "../../core/strategy/generated/capability-manifest.types.js";
import type { ModelProvenance } from "../../core/strategy/generated/model-provenance.types.js";
import type { ValidationIssue } from "../../core/strategy/generated/validation-issue.types.js";

/**
 * 阿一面试多轮历史中的一轮对话（契约 6.1：port 只接受自然语言、能力清单、
 * 可选旧 AST 和结构化校验错误）。
 */
export interface ConversationTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

interface ModelDraftRequestBase {
  /** 来自 createCapabilityManifest 的确定性能力清单。 */
  readonly capabilityManifest: CapabilityManifest;
  /** 0=首发；1/2=修复轮（上限两轮，契约 3.3）。 */
  readonly attempt: number;
}

/**
 * 首发请求：自然语言意图 + 面试历史 + 可选基线 AST。
 * 修复轮请求（契约 3.3 原文「模型修复只接收结构化错误与能力清单」）：
 * 判别联合从类型上封死意图/对话/基线混入修复轮的可能。
 */
export type ModelDraftRequest =
  | (ModelDraftRequestBase & {
      readonly kind: "draft";
      /** 用户自然语言意图。 */
      readonly intent: string;
      /** 阿一面试多轮历史，首轮为空。 */
      readonly conversation: readonly ConversationTurn[];
      /** F10 调整 v2 的基线 canonical AST。 */
      readonly baseCanonicalAst?: string;
    })
  | (ModelDraftRequestBase & {
      readonly kind: "repair";
      /** 修复轮唯一业务载荷：结构化校验错误。 */
      readonly repairIssues: readonly ValidationIssue[];
    });

export type ModelErrorClass = NonNullable<ModelProvenance["errorClass"]>;

export interface ModelCallError {
  readonly class: ModelErrorClass;
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * port 返回 rawText 不解析：模型输出不受信任，唯一解析入口是 parseJsonInput。
 * port 不能产生订单、改 RunSpec、逐日调用、替代权威回读——签名上没有这些通道。
 * provenance 不含密钥、不含 prompt/响应原文（脱敏口径，decisions 2026-11-12 第 5 项）。
 */
export type ModelDraftResponse =
  | { readonly ok: true; readonly rawText: string; readonly provenance: ModelProvenance }
  | { readonly ok: false; readonly error: ModelCallError; readonly provenance: ModelProvenance };

export interface StrategyDraftPort {
  draft(request: ModelDraftRequest): Promise<ModelDraftResponse>;
}
