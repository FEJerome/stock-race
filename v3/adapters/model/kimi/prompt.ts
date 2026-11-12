import type { ModelDraftRequest } from "../../../application/ports/model.js";
import type { ChatMessage } from "./client.js";

/**
 * 阿一 system prompt（草案）：角色 + 三边界（对话引导脚本 §3：只引导表达 /
 * 收敛 AST / 不替代权威回读；不荐股）。
 * 文案终审权在御主（decisions 2026-11-12 第 9 项），本稿仅为施工占位，
 * 未终审前不得对外声称定稿。
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

function repairSection(request: ModelDraftRequest): string {
  if (!request.repairIssues || request.repairIssues.length === 0) return "";
  const lines = request.repairIssues.map(
    (issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`,
  );
  return [
    "你上一稿未通过校验。以下是结构化校验错误，请只输出修正后的完整 StrategyDraft JSON：",
    ...lines,
  ].join("\n");
}

/**
 * 确定性 prompt 组装：system（角色+边界+能力清单）+ few-shot + 对话历史 +
 * 当前意图/基线 AST/修复轮结构化错误。manifest 序列化输入即确定性输出，
 * 其 digest 由 s3-manifest-deterministic 冻结看护。
 */
export function buildDraftMessages(request: ModelDraftRequest): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT_DRAFT}\n\ncapability manifest:\n${JSON.stringify(request.capabilityManifest)}`,
    },
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
  const repair = repairSection(request);
  if (repair !== "") sections.push(repair);
  messages.push({ role: "user", content: sections.join("\n\n") });
  return messages;
}
