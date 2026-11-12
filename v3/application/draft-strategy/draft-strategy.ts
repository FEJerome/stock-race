import type { ModelProvenance } from "../../core/strategy/generated/model-provenance.types.js";
import type { Readback } from "../../core/strategy/generated/readback.types.js";
import type { ValidationIssue } from "../../core/strategy/generated/validation-issue.types.js";
import { createCapabilityManifest } from "../../core/strategy/registry/capability-manifest.js";
import type { ObservationKind } from "../../core/strategy/registry/types.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { validateStrategyUseCase } from "../validate-strategy/index.js";
import type { ConversationTurn, ModelDraftRequest, StrategyDraftPort } from "../ports/model.js";

export interface DraftStrategyInput {
  readonly intent: string;
  readonly conversation?: readonly ConversationTurn[];
  readonly baseCanonicalAst?: string;
  readonly observationKind?: ObservationKind;
}

/**
 * 结果轴对齐产品状态矩阵：valid / invalid / model-error。
 * - valid：某一轮输出通过完整校验链（parseJsonInput→schema→语义→canonical→回读）。
 * - invalid：模型给出了草稿但校验不过，且修复无进展（输出逐字节重复即提前停修）。
 * - model-error：port 层失败（TIMEOUT/UNAVAILABLE…），或两轮修复仍坏（REPAIR_EXHAUSTED）。
 * provenance 覆盖每一次 port 调用，attempts=port 调用次数。
 */
export type DraftStrategyResult =
  | {
      readonly ok: true;
      readonly status: "valid";
      readonly canonicalAst: string;
      readonly strategyDigest: string;
      readonly readback: Readback;
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly status: "invalid";
      readonly issues: readonly ValidationIssue[];
      readonly lastRawText: string;
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly status: "model-error";
      readonly errorCode: string;
      readonly message: string;
      readonly issues: readonly ValidationIssue[] | null;
      readonly intent: string;
      readonly lastRawText: string | null;
      readonly provenance: readonly ModelProvenance[];
      readonly attempts: number;
    };

/** 修复轮上限：首发 + 两轮修复（契约 3.3）。 */
export const DRAFT_MAX_ATTEMPTS = 3;

/**
 * 编排（方案 §2.2）：组装请求 → port.draft → parseJsonInput → 复用
 * validateStrategyUseCase 全链。port 返回的 rawText 不受信任，唯一解析
 * 入口在校验链内部。invalid 且仍有修复轮 → issues 回灌；模型逐字节重复
 * 上一稿视为无进展，提前停在 invalid；两轮仍坏 → REPAIR_EXHAUSTED。
 * port 层失败（超时/不可用）→ model-error，保留 intent 与最后草稿，不切 fake。
 * 用例无状态；产品状态轴由 host 持有。
 */
export async function draftStrategy(
  port: StrategyDraftPort,
  input: DraftStrategyInput,
): Promise<DraftStrategyResult> {
  const capabilityManifest = createCapabilityManifest(createRegistryV1());
  const conversation = input.conversation ?? [];
  const provenance: ModelProvenance[] = [];
  let lastRawText: string | null = null;
  let lastIssues: readonly ValidationIssue[] = [];
  let repairIssues: readonly ValidationIssue[] | undefined;

  for (let attempt = 0; attempt < DRAFT_MAX_ATTEMPTS; attempt += 1) {
    const request: ModelDraftRequest = {
      intent: input.intent,
      conversation,
      capabilityManifest,
      ...(input.baseCanonicalAst !== undefined ? { baseCanonicalAst: input.baseCanonicalAst } : {}),
      ...(repairIssues !== undefined ? { repairIssues } : {}),
      attempt,
    };
    const response = await port.draft(request);
    provenance.push(response.provenance);
    if (!response.ok) {
      return {
        ok: false,
        status: "model-error",
        errorCode: response.error.class,
        message: response.error.message,
        issues: null,
        intent: input.intent,
        lastRawText,
        provenance,
        attempts: attempt + 1,
      };
    }
    if (lastRawText !== null && response.rawText === lastRawText) {
      // 逐字节重复上一稿：修复无新信息，提前停在 invalid（deterministic fake 下精确可判定）。
      return {
        ok: false,
        status: "invalid",
        issues: lastIssues,
        lastRawText,
        provenance,
        attempts: attempt + 1,
      };
    }
    lastRawText = response.rawText;
    const validation = validateStrategyUseCase(response.rawText, {
      ...(input.observationKind !== undefined ? { observationKind: input.observationKind } : {}),
    });
    if (validation.ok) {
      return {
        ok: true,
        status: "valid",
        canonicalAst: validation.canonicalAst!,
        strategyDigest: validation.strategyDigest!,
        readback: validation.readback!,
        provenance,
        attempts: attempt + 1,
      };
    }
    lastIssues = validation.issues;
    repairIssues = validation.issues;
  }
  return {
    ok: false,
    status: "model-error",
    errorCode: "REPAIR_EXHAUSTED",
    message: `Draft still invalid after ${DRAFT_MAX_ATTEMPTS} attempts (initial + two repair rounds)`,
    issues: lastIssues,
    intent: input.intent,
    lastRawText,
    provenance,
    attempts: DRAFT_MAX_ATTEMPTS,
  };
}
