import type { ModelDraftRequest } from "../../../application/ports/model.js";
import type { ChatMessage } from "./client.js";

/**
 * A YI system prompt (draft): role + three boundaries (conversation-guidance
 * script §3: guide expression only / converge to AST / never replace the
 * authoritative readback; no stock recommendations).
 * Final copy approval rests with the maintainer (decisions 2026-11-12 item 9);
 * this draft is a construction placeholder and must not be presented as final
 * before that approval.
 */
const SYSTEM_PROMPT_DRAFT = [
  "你是「阿一」，基金公司的第一位 AI 经理人，一名对话式策略私教。",
  "边界一：你只引导用户把投资想法表达清楚，绝不给投资建议、不荐股、不预测行情。",
  "边界二：对话必须收敛为声明式 StrategyDraft JSON——你只输出 JSON，不输出解释散文，不输出代码，不产生任何订单。",
  "边界三：权威回读由系统从 canonical AST 生成，你的人话只是包装，不得替代回读。",
  "你只能使用能力清单（capability manifest）中声明的指标、参数、序列函数与上下文引用；未声明的一律不得使用。",
  "连续量（价格、比例、常数）必须是十进制字符串，不得使用 JSON number。",
  "schemaVersion 固定为 \"1.0.0\"；position 固定 side=long、allowAdd=false。",
  "输出仅为一个 StrategyDraft JSON 对象，不得包含 markdown 代码围栏或任何其他文字。",
].join("\n");

const FEW_SHOT_USER = "MACD 三日内金叉，KDJ 过滤：K 大于 D，J 小于 90；死叉或持仓 20 根离场；半仓。";

const FEW_SHOT_ASSISTANT = JSON.stringify({
  schemaVersion: "1.0.0",
  name: "MACD 三日内金叉，KDJ 过滤",
  indicators: {
    m: { use: "macd@1", params: { fast: 12, slow: 26, signal: 9 } },
    k: { use: "kdj@1", params: { period: 9, kSmooth: 3, dSmooth: 3 } },
  },
  entry: {
    all: [
      { within: { window: 3, condition: { crossAbove: [{ ref: "m.dif" }, { ref: "m.dea" }] } } },
      { gt: [{ ref: "k.k" }, { ref: "k.d" }] },
      { lt: [{ ref: "k.j" }, { const: "90" }] },
    ],
  },
  exits: [
    {
      any: [
        { crossBelow: [{ ref: "m.dif" }, { ref: "m.dea" }] },
        { gte: [{ ref: "position.barsHeld" }, { const: "20" }] },
      ],
    },
  ],
  position: {
    side: "long",
    allowAdd: false,
    entrySize: { cashFraction: "0.50" },
    exitSize: { positionFraction: "1.00" },
  },
});

function repairContent(request: ModelDraftRequest & { kind: "repair" }): string {
  const lines = request.repairIssues.map(
    (issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`,
  );
  return [
    "你上一稿未通过校验。以下是结构化校验错误，请只输出修正后的完整 StrategyDraft JSON：",
    ...lines,
  ].join("\n");
}

/**
 * Deterministic prompt assembly:
 * - Initial: system (role + boundaries + capability manifest) + few-shot +
 *   conversation history + intent / baseline AST;
 * - Repair round (contract 3.3): system (role + boundaries + capability
 *   manifest) + structured errors only — no intent, no conversation history,
 *   no baseline AST, and no repeated few-shot.
 * Serializing the manifest input is the deterministic output; its digest is
 * pinned and guarded by s3-manifest-deterministic.
 */
export function buildDraftMessages(request: ModelDraftRequest): ChatMessage[] {
  const system: ChatMessage = {
    role: "system",
    content: `${SYSTEM_PROMPT_DRAFT}

capability manifest:\n${JSON.stringify(request.capabilityManifest)}`,
  };
  if (request.kind === "repair") {
    return [system, { role: "user", content: repairContent(request) }];
  }
  const messages: ChatMessage[] = [
    system,
    { role: "user", content: FEW_SHOT_USER },
    { role: "assistant", content: FEW_SHOT_ASSISTANT },
  ];
  for (const turn of request.conversation) {
    messages.push({ role: turn.role, content: turn.content });
  }
  const sections: string[] = [];
  if (request.baseCanonicalAst !== undefined) {
    sections.push(`基线策略 AST（在此之上调整）：\n${request.baseCanonicalAst}`);
  }
  sections.push(`用户意图：${request.intent}`);
  messages.push({ role: "user", content: sections.join("\n\n") });
  return messages;
}
