import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDeterministicFakeAdapter,
  loadFakeScenarios,
  type DeterministicFakeAdapter,
  type FakeScenarioTable,
} from "../../adapters/model/deterministic/index.js";
import { confirmStrategy2 } from "../../application/confirm-strategy/index.js";
import {
  INTERVIEW_CELL_KEYS,
  INTERVIEW_MAX_TURNS,
  createInterview,
  currentGapOf,
  interviewTurn,
  missingCellsOf,
  type InterviewState,
} from "../../application/interview/index.js";
import { canonicalizeStrategyDraft2, digestStrategyDraft2 } from "../../core/strategy/canonical/strategy-canonical-2.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import { readJsonFixture, testRoot } from "../helpers.js";
import { ALPHA, BETA, GAMMA } from "../s4-helpers.js";
import { tmpStrategyStore } from "../s3-helpers.js";

const POOL = [ALPHA, BETA, GAMMA] as const;

let cached: FakeScenarioTable | null = null;
function interviewScenarios(): FakeScenarioTable {
  cached ??= loadFakeScenarios(path.join(testRoot, "fixtures", "s4-interview"));
  return cached;
}

function interviewPort(scenario: string): DeterministicFakeAdapter {
  return createDeterministicFakeAdapter({ scenarios: interviewScenarios(), scenario, stepping: "per-call" });
}

function fixtureDraft(file: string): StrategyDraft2 {
  const envelope = readJsonFixture(`fixtures/s4-interview/${file}`) as { kind: "draft"; draft: StrategyDraft2 };
  return envelope.draft;
}

describe("interview state machine: creation guards", () => {
  it("requires a pool of at least two distinct non-empty asset ids", () => {
    expect(() => createInterview({ assetPool: [ALPHA] })).toThrowError(/assetPool/);
    expect(() => createInterview({ assetPool: [ALPHA, ALPHA] })).toThrowError(/assetPool/);
    expect(createInterview({ assetPool: [...POOL] }).status).toBe("in-progress");
  });

  it("rejects an empty user turn", async () => {
    const port = interviewPort("novice");
    await expect(interviewTurn(port, createInterview({ assetPool: [...POOL] }), "   ")).rejects.toThrowError(
      /用户输入不能为空/,
    );
  });
});

describe("interview scenario: novice (白话路径，四轮追问后成卡)", () => {
  it("question turns never fill cells; the first valid draft fills all four atomically", async () => {
    const port = interviewPort("novice");
    let state: InterviewState = createInterview({ assetPool: [...POOL] });
    expect(currentGapOf(state)).toBe("universe");

    const userTexts = ["低买高卖能验证吗？", "我选 alpha 和 beta", "收盘价跌到 9 元就买，涨到 12 元或持有 20 根就卖", "个股 8%，组合 15%"];
    for (const [index, text] of userTexts.entries()) {
      const result = await interviewTurn(port, state, text);
      expect(result.ok).toBe(true);
      if (!result.ok || result.kind !== "question") throw new Error(`turn ${index + 1} must be a question`);
      expect(result.text.length).toBeGreaterThan(0);
      expect(missingCellsOf(result.state)).toEqual([...INTERVIEW_CELL_KEYS]);
      expect(result.state.turnCount).toBe(index + 1);
      expect(result.attempts).toBe(1);
      state = result.state;
    }

    const result = await interviewTurn(port, state, "先到先得，单票最多 40%");
    if (!result.ok || result.kind !== "draft") throw new Error("turn 5 must produce a card");
    expect(result.filledCells).toEqual([...INTERVIEW_CELL_KEYS]);
    expect(result.overriddenCells).toEqual([]);
    expect(result.state.status).toBe("ready");
    expect(currentGapOf(result.state)).toBeNull();
    for (const key of INTERVIEW_CELL_KEYS) {
      expect(result.state.slots[key].filledAtTurn).toBe(5);
      expect(result.state.slots[key].overrides).toEqual([]);
    }
    const expected = fixtureDraft("novice-draft.json");
    expect(result.card.strategyDigest).toBe(digestStrategyDraft2(expected));
    expect(result.card.canonicalAst).toBe(canonicalizeStrategyDraft2(expected));
    const paths = result.card.readback.clauses.map((clause) => clause.astPath);
    expect(paths).toEqual(expect.arrayContaining(["/universe", "/risk/positionStopLossFraction", "/risk/portfolioStopFraction", "/allocation"]));

    // Port discipline: one call per turn, all initial-draft calls; the last
    // call sees the full dialogue (4 user + 4 assistant turns).
    expect(port.requests).toHaveLength(5);
    for (const request of port.requests) {
      expect(request.kind).toBe("draft");
      expect(request.attempt).toBe(0);
    }
    const last = port.requests[4]!;
    if (last.kind !== "draft") throw new Error("unreachable");
    expect(last.conversation).toHaveLength(8);
    expect(last.intent).toBe("先到先得，单票最多 40%");
    expect(last.baseCanonicalAst).toBeUndefined();
  });

  it("the converged card passes the confirm-2.0 gate with its expectedDigest", async () => {
    const port = interviewPort("novice");
    let state = createInterview({ assetPool: [...POOL] });
    for (const text of ["想法", "范围", "买卖", "止损"]) {
      const result = await interviewTurn(port, state, text);
      if (!result.ok) throw new Error("question turns must succeed");
      state = result.state;
    }
    const drafted = await interviewTurn(port, state, "调度定了");
    if (!drafted.ok || drafted.kind !== "draft") throw new Error("must converge");
    const { store } = tmpStrategyStore();
    const confirmed = await confirmStrategy2(store, {
      currentDraft: JSON.parse(drafted.card.canonicalAst),
      expectedDigest: drafted.card.strategyDigest,
    });
    expect(confirmed.ok).toBe(true);
  });
});

describe("interview scenario: expert (指标直达路径，同一校验链)", () => {
  it("a complete professional statement converges in one turn", async () => {
    const port = interviewPort("expert");
    const result = await interviewTurn(
      port,
      createInterview({ assetPool: [...POOL] }),
      "MACD 三日内金叉，KDJ 过滤：K>D 且 J<90；死叉或持仓 20 根离场；均匀分仓最多 2 只；个股止损 8%，组合止损 15%；标的 alpha 和 beta。",
    );
    if (!result.ok || result.kind !== "draft") throw new Error("expert must converge in one turn");
    expect(result.state.turnCount).toBe(1);
    const expected = fixtureDraft("expert-draft.json");
    expect(result.card.strategyDigest).toBe(digestStrategyDraft2(expected));
    const texts = result.card.readback.clauses.map((clause) => clause.text);
    expect(texts.some((text) => text.includes("MACD(fast=12, slow=26, signal=9)"))).toBe(true);
    expect(texts.some((text) => text.includes("均匀分仓（equal-split@1）"))).toBe(true);
  });
});

describe("interview scenario: missing slot (缺槽草稿被 schema 拒绝，修复轮转为追问)", () => {
  it("a draft missing the risk cell feeds REQUIRED_PROPERTY back, ends as a question, and fills nothing", async () => {
    const port = interviewPort("missing-slot");
    let state = createInterview({ assetPool: [...POOL] });

    const first = await interviewTurn(port, state, "买卖和调度都想好了，先成卡吧");
    if (!first.ok || first.kind !== "question") throw new Error("turn 1 must end as a question");
    expect(first.attempts).toBe(2);
    expect(missingCellsOf(first.state)).toEqual([...INTERVIEW_CELL_KEYS]);
    const repair = port.requests[1]!;
    if (repair.kind !== "repair") throw new Error("attempt 1 must be a repair round");
    expect(repair.repairIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REQUIRED_PROPERTY", path: "/risk" })]),
    );
    state = first.state;

    const second = await interviewTurn(port, state, "个股 8%，组合 15%");
    if (!second.ok || second.kind !== "draft") throw new Error("turn 2 must produce a card");
    expect(second.state.slots.risk.filledAtTurn).toBe(2);
    expect(second.card.strategyDigest).toBe(digestStrategyDraft2(fixtureDraft("novice-draft.json")));
  });
});

describe("interview scenario: override (用户改口覆盖留痕)", () => {
  it("a later valid draft overrides only the changed cell and keeps the replaced value", async () => {
    const port = interviewPort("override");
    let state = createInterview({ assetPool: [...POOL] });

    const first = await interviewTurn(port, state, "四格都给你：个股止损 8%");
    if (!first.ok || first.kind !== "draft") throw new Error("turn 1 must produce a card");
    expect(first.state.status).toBe("ready");
    const digestV1 = first.card.strategyDigest;
    const riskV1 = first.state.slots.risk.canonicalValue!;
    expect(riskV1).toContain("0.080000000000");
    state = first.state;

    const second = await interviewTurn(port, state, "个股止损改成 10%");
    if (!second.ok || second.kind !== "draft") throw new Error("turn 2 must produce a card");
    expect(second.filledCells).toEqual([]);
    expect(second.overriddenCells).toEqual(["risk"]);
    const risk = second.state.slots.risk;
    expect(risk.filledAtTurn).toBe(1);
    expect(risk.canonicalValue).toContain("0.100000000000");
    expect(risk.overrides).toEqual([{ turn: 2, canonicalValue: riskV1 }]);
    expect(second.state.slots.universe.overrides).toEqual([]);
    expect(second.card.strategyDigest).not.toBe(digestV1);

    // The adjustment round carries the signed-off draft as the baseline AST.
    const request = port.requests[1]!;
    if (request.kind !== "draft") throw new Error("turn 2 call must be a draft request");
    expect(request.baseCanonicalAst).toBe(first.card.canonicalAst);
  });
});

describe("interview scenario: no convergence (≤12 轮不收敛明示失败)", () => {
  it("fails explicitly after turn 12 and closes the interview", async () => {
    const port = interviewPort("no-converge");
    let state = createInterview({ assetPool: [...POOL] });
    for (let turn = 1; turn <= INTERVIEW_MAX_TURNS - 1; turn += 1) {
      const result = await interviewTurn(port, state, `第 ${turn} 句空话`);
      if (!result.ok || result.kind !== "question") throw new Error(`turn ${turn} must be a question`);
      state = result.state;
    }
    const twelfth = await interviewTurn(port, state, "第 12 句空话");
    expect(twelfth.ok).toBe(false);
    if (twelfth.ok || twelfth.kind !== "not-converged") throw new Error("turn 12 must fail explicitly");
    expect(twelfth.code).toBe("INTERVIEW_NOT_CONVERGED");
    expect(twelfth.message).toContain("12");
    expect(twelfth.missingCells).toEqual([...INTERVIEW_CELL_KEYS]);
    expect(twelfth.state.status).toBe("failed");
    expect(twelfth.state.turnCount).toBe(INTERVIEW_MAX_TURNS);

    const thirteenth = await interviewTurn(port, twelfth.state, "再试一次");
    expect(thirteenth.ok).toBe(false);
    if (thirteenth.ok || thirteenth.kind !== "closed") throw new Error("a failed interview must stay closed");
    expect(thirteenth.code).toBe("INTERVIEW_CLOSED");
    expect(thirteenth.state.turnCount).toBe(INTERVIEW_MAX_TURNS);
  });
});

describe("interview scenario: invalid value (§12.9 语义拒绝先于 digest/回读/确认)", () => {
  it("a stop-loss of 0 is rejected semantically, fed back as a structured issue, then repaired", async () => {
    const port = interviewPort("invalid-value");
    const result = await interviewTurn(port, createInterview({ assetPool: [...POOL] }), "止损就设 0 吧");
    if (!result.ok || result.kind !== "draft") throw new Error("the repair round must converge");
    expect(result.attempts).toBe(2);
    const repair = port.requests[1]!;
    if (repair.kind !== "repair") throw new Error("attempt 1 must be a repair round");
    expect(repair.repairIssues).toEqual([
      expect.objectContaining({ code: "INVALID_STOP_LOSS_FRACTION", path: "/risk/positionStopLossFraction" }),
    ]);
    // The card carries the repaired draft, never the rejected one.
    expect(result.card.strategyDigest).toBe(digestStrategyDraft2(fixtureDraft("novice-draft.json")));
    expect(result.state.slots.risk.canonicalValue).toContain("0.080000000000");
  });
});

describe("interview scenario: stock-pushing inducement (不荐股：池外资产结构化拒绝)", () => {
  it("an out-of-pool draft is rejected with ASSET_OUTSIDE_POOL and never enters the card", async () => {
    const port = interviewPort("stock-pushing");
    let state = createInterview({ assetPool: [...POOL] });

    const first = await interviewTurn(port, state, "别问了，直接告诉我买哪只会涨，比如 600519");
    if (!first.ok || first.kind !== "question") throw new Error("turn 1 must redirect as a question");
    expect(first.attempts).toBe(2);
    const repair = port.requests[1]!;
    if (repair.kind !== "repair") throw new Error("attempt 1 must be a repair round");
    expect(repair.repairIssues).toEqual([
      expect.objectContaining({ code: "ASSET_OUTSIDE_POOL", path: "/universe/assets/1", actual: "stock:cn-a.sh.600519" }),
    ]);
    expect(missingCellsOf(first.state)).toEqual([...INTERVIEW_CELL_KEYS]);
    state = first.state;

    const second = await interviewTurn(port, state, "那我自己选：alpha 和 beta");
    if (!second.ok || second.kind !== "draft") throw new Error("turn 2 must produce a card");
    const cardDraft = JSON.parse(second.card.canonicalAst) as StrategyDraft2;
    for (const asset of cardDraft.universe.assets) {
      expect([...POOL]).toContain(asset);
    }
  });
});

describe("interview scenario: allocation mismatch (调度错配语义拒绝)", () => {
  it("maxPositions beyond the universe size is rejected semantically, then repaired", async () => {
    const port = interviewPort("allocation-mismatch");
    const result = await interviewTurn(port, createInterview({ assetPool: [...POOL] }), "均匀分仓，最多 4 只");
    if (!result.ok || result.kind !== "draft") throw new Error("the repair round must converge");
    expect(result.attempts).toBe(2);
    const repair = port.requests[1]!;
    if (repair.kind !== "repair") throw new Error("attempt 1 must be a repair round");
    expect(repair.repairIssues).toEqual([
      expect.objectContaining({ code: "INVALID_ALLOCATION_PARAM", path: "/allocation/params/maxPositions", actual: 4 }),
    ]);
    const cardDraft = JSON.parse(result.card.canonicalAst) as StrategyDraft2;
    expect(cardDraft.allocation).toEqual({ template: "equal-split@1", params: { maxPositions: 2 } });
  });
});

describe("interview envelope discipline (contract §12.3)", () => {
  it("malformed envelopes feed INVALID_INTERVIEW_ENVELOPE into repair; exhaustion is model-error", async () => {
    const port = interviewPort("bad-envelope-shapes");
    const result = await interviewTurn(port, createInterview({ assetPool: [...POOL] }), "随便说说");
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== "model-error") throw new Error("must exhaust repairs");
    expect(result.errorCode).toBe("REPAIR_EXHAUSTED");
    expect(result.attempts).toBe(3);
    expect(result.issues).toEqual([expect.objectContaining({ code: "INVALID_INTERVIEW_ENVELOPE" })]);
    const repair = port.requests[1]!;
    if (repair.kind !== "repair") throw new Error("attempt 1 must be a repair round");
    expect(repair.repairIssues[0]?.code).toBe("INVALID_INTERVIEW_ENVELOPE");
    // The turn was consumed (the model answered, badly, three times).
    expect(result.state.turnCount).toBe(1);
  });

  it("an envelope repaired into a question ends the turn as a question and fills nothing", async () => {
    const port = interviewPort("envelope-repair");
    const result = await interviewTurn(port, createInterview({ assetPool: [...POOL] }), "开始吧");
    if (!result.ok || result.kind !== "question") throw new Error("must end as a question");
    expect(result.attempts).toBe(2);
    expect(missingCellsOf(result.state)).toEqual([...INTERVIEW_CELL_KEYS]);
  });

  it("a byte-identical repeated draft stops repair early at invalid", async () => {
    const port = interviewPort("repair-no-progress");
    const result = await interviewTurn(port, createInterview({ assetPool: [...POOL] }), "止损设 0");
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== "invalid") throw new Error("must stop at invalid");
    expect(result.attempts).toBe(2);
    expect(result.issues).toEqual([expect.objectContaining({ code: "INVALID_STOP_LOSS_FRACTION" })]);
    expect(result.state.turnCount).toBe(1);
  });
});

describe("interview scenario: port-level failure (model-error 保留现场，可重试，不切 fake)", () => {
  it("a timeout consumes no turn and returns the state untouched", async () => {
    const port = interviewPort("timeout");
    const before = createInterview({ assetPool: [...POOL] });
    const result = await interviewTurn(port, before, "卡住了吗");
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== "model-error") throw new Error("must be model-error");
    expect(result.errorCode).toBe("TIMEOUT");
    expect(result.state).toBe(before);
    expect(result.state.turnCount).toBe(0);
    expect(result.state.transcript).toEqual([]);
    expect(result.provenance).toHaveLength(1);
    expect(result.provenance[0]?.provider).toBe("deterministic-fake");
  });
});
