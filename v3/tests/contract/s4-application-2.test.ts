import { describe, expect, it } from "vitest";
import { confirmStrategy2 } from "../../application/confirm-strategy/index.js";
import { runConfirmedPortfolio } from "../../application/run-confirmed/index.js";
import { validateStrategyUseCase2 } from "../../application/validate-strategy/index.js";
import { digestStrategyDraft2 } from "../../core/strategy/canonical/strategy-canonical-2.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import { createAuthoritativeReadback2 } from "../../core/strategy/readback/readback-2.js";
import { canonicalizeStrategyDraft2 } from "../../core/strategy/canonical/strategy-canonical-2.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { validateReadback } from "../../core/strategy/validation/contract-validators.js";
import { validateReport2 } from "../../core/strategy/validation/schema-validator-2.js";
import { ALPHA, BETA, buildDraft } from "../s4-helpers.js";
import { SCENARIOS } from "../s4-scenarios.js";
import { tmpStrategyStore } from "../s3-helpers.js";

const FIXED_NOW = "2026-11-18T08:00:00.000Z";

const registry = createRegistryV1();

/** A valid four-cell draft with an indicator, universe order [beta, alpha] (authored order is digest-significant). */
function fourCellDraft(): StrategyDraft2 {
  const base = buildDraft({
    assets: [BETA, ALPHA],
    entry: { gt: [{ ref: "close" }, { const: "5" }] },
    exits: [{ lt: [{ ref: "close" }, { const: "0.5" }] }],
    positionStopLossFraction: "0.08",
    portfolioStopFraction: "0.15",
    allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.40" } },
  });
  return {
    ...base,
    name: "四格演示",
    indicators: { m: { use: "macd@1", params: { fast: 12, slow: 26, signal: 9 } } },
  };
}

describe("authoritative readback 2.0.0 (contract §12.6)", () => {
  const draft = fourCellDraft();
  const readback = createAuthoritativeReadback2(canonicalizeStrategyDraft2(draft), registry);

  it("adds /universe, /risk and /allocation clause groups with astPath back-references", () => {
    expect(readback.clauses).toEqual([
      { astPath: "/universe", text: "管理范围：共 2 只股票，按此顺序管理：stock:synthetic.beta、stock:synthetic.alpha。" },
      { astPath: "/indicators/m", text: "指标 m：MACD(fast=12, slow=26, signal=9)。" },
      { astPath: "/entry", text: "入场条件：close > 5。" },
      { astPath: "/exits/0", text: "出场规则 1：close < 0.5。" },
      {
        astPath: "/risk/positionStopLossFraction",
        text: "个股止损：当某只持仓股票的收盘价相对其成本价下跌达到 8% 时，下一交易日开盘强制卖出该股票全部持仓。",
      },
      {
        astPath: "/risk/portfolioStopFraction",
        text: "组合止损：当组合总权益相对其历史峰值回撤达到 15% 时，下一交易日开盘卖出全部可卖持仓，此后不再开新仓。",
      },
      {
        astPath: "/allocation",
        text: "资金调度：先到先得（first-come-first-served@1）；按信号到达顺序从统一资金池拨款，单只股票最多占用统一资金池的 40%，资金池耗尽后不再开新仓。",
      },
      { astPath: "/position", text: "仓位：仅做多，禁止加仓；出场卖出持仓的 100%。" },
    ]);
    expect(readback.summary).toBe("组合策略「四格演示」；注册表 1.0.0。");
    expect(readback.text).toBe([readback.summary, ...readback.clauses.map((clause) => clause.text)].join("\n"));
    expect(readback.strategyDigest).toBe(digestStrategyDraft2(draft));
    expect(readback.readbackVersion).toBe("1.0.0");
    expect(validateReadback(readback)).toEqual([]);
  });

  it("renders the equal-split template with every parameter", () => {
    const equalSplit = {
      ...draft,
      universe: { assets: [ALPHA, BETA, "stock:synthetic.gamma"] },
      allocation: { template: "equal-split@1", params: { maxPositions: 2 } },
    } as StrategyDraft2;
    const result = createAuthoritativeReadback2(canonicalizeStrategyDraft2(equalSplit), registry);
    expect(result.clauses.find((clause) => clause.astPath === "/allocation")?.text).toBe(
      "资金调度：均匀分仓（equal-split@1）；最多同时持有 2 只股票，可用现金在空闲仓位名额内均分。",
    );
  });

  it("keeps the authored universe order in the clause (order is digest-significant, §12.2)", () => {
    const reversed = { ...draft, universe: { assets: [ALPHA, BETA] } } as StrategyDraft2;
    const result = createAuthoritativeReadback2(canonicalizeStrategyDraft2(reversed), registry);
    expect(result.clauses[0]).toEqual({
      astPath: "/universe",
      text: "管理范围：共 2 只股票，按此顺序管理：stock:synthetic.alpha、stock:synthetic.beta。",
    });
    expect(result.strategyDigest).not.toBe(digestStrategyDraft2(draft));
  });

  it("refuses a semantically invalid 2.0.0 draft instead of producing a readback", () => {
    const invalid = { ...draft, risk: { positionStopLossFraction: "0", portfolioStopFraction: "0.15" } } as StrategyDraft2;
    expect(() => createAuthoritativeReadback2(canonicalizeStrategyDraft2(invalid), registry)).toThrowError(
      /failed semantic validation/,
    );
  });
});

describe("validateStrategyUseCase2 (§12.9 semantic stage precedes canonical/digest/readback)", () => {
  it("valid draft passes the full chain and carries the four-cell readback", () => {
    const draft = fourCellDraft();
    const result = validateStrategyUseCase2(draft);
    expect(result.ok).toBe(true);
    expect(result.canonicalAst).toBe(canonicalizeStrategyDraft2(draft));
    expect(result.strategyDigest).toBe(digestStrategyDraft2(draft));
    expect(result.readback?.clauses.map((clause) => clause.astPath)).toContain("/allocation");
  });

  it("accepts raw JSON text input through parseJsonInput", () => {
    expect(validateStrategyUseCase2(JSON.stringify(fourCellDraft())).ok).toBe(true);
  });

  it("missing cell → schema REQUIRED_PROPERTY, no digest or readback", () => {
    const draft = fourCellDraft() as unknown as Record<string, unknown>;
    delete draft.risk;
    const result = validateStrategyUseCase2(draft);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ code: "REQUIRED_PROPERTY", path: "/risk" })]);
    expect(result.canonicalAst).toBeNull();
    expect(result.strategyDigest).toBeNull();
    expect(result.readback).toBeNull();
  });

  it.each([
    ["0", "/risk/positionStopLossFraction"],
    ["1", "/risk/positionStopLossFraction"],
    ["1.5", "/risk/portfolioStopFraction"],
  ])("stop-loss %s is rejected at the semantic stage before any digest exists", (value, path) => {
    const draft = fourCellDraft() as unknown as { risk: Record<string, string> };
    if (path === "/risk/portfolioStopFraction") draft.risk.portfolioStopFraction = value;
    else draft.risk.positionStopLossFraction = value;
    const result = validateStrategyUseCase2(draft);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ code: "INVALID_STOP_LOSS_FRACTION", path })]);
    expect(result.strategyDigest).toBeNull();
    expect(result.readback).toBeNull();
  });

  it("allocation domain violations are semantic rejections (never clamped, never defaulted)", () => {
    const draft = fourCellDraft();
    const fraction = validateStrategyUseCase2({
      ...draft,
      allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.001" } },
    });
    expect(fraction.issues).toEqual([
      expect.objectContaining({ code: "INVALID_ALLOCATION_PARAM", path: "/allocation/params/maxPerAssetCashFraction" }),
    ]);
    const slots = validateStrategyUseCase2({
      ...draft,
      allocation: { template: "equal-split@1", params: { maxPositions: 4 } },
    });
    expect(slots.issues).toEqual([
      expect.objectContaining({ code: "INVALID_ALLOCATION_PARAM", path: "/allocation/params/maxPositions" }),
    ]);
  });

  it("reuses the frozen 1.0.0 AST semantics per asset (unknown indicator rejected)", () => {
    const draft = fourCellDraft();
    const result = validateStrategyUseCase2({
      ...draft,
      indicators: { m: { use: "macd@99", params: { fast: 12, slow: 26, signal: 9 } } },
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "UNKNOWN_INDICATOR", path: "/indicators/m/use" })]),
    );
  });
});

describe("confirmStrategy2 (contract §12.6: expectedDigest gate and ConfirmedRevision shape unchanged)", () => {
  it("confirms a valid four-cell draft and persists the canonical AST", async () => {
    const { store } = tmpStrategyStore();
    const draft = fourCellDraft();
    const digest = digestStrategyDraft2(draft);
    const result = await confirmStrategy2(
      store,
      { currentDraft: draft, expectedDigest: digest },
      { now: () => FIXED_NOW },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("must confirm");
    expect(result.confirmation.digest).toBe(digest);
    expect(result.confirmation.revision).toBe(1);
    expect(result.confirmation.createdAt).toBe(FIXED_NOW);
    expect(result.canonicalAst).toBe(canonicalizeStrategyDraft2(draft));
    expect(await store.loadCanonicalAst(digest)).toBe(result.canonicalAst);
  });

  it("rejects on expectedDigest mismatch (CONFIRM_DIGEST_MISMATCH)", async () => {
    const { store } = tmpStrategyStore();
    const draft = fourCellDraft();
    const result = await confirmStrategy2(store, {
      currentDraft: draft,
      expectedDigest: "sha256:" + "0".repeat(64),
    });
    expect(result).toMatchObject({ ok: false, code: "CONFIRM_DIGEST_MISMATCH", actualDigest: digestStrategyDraft2(draft) });
  });

  it("rejects §12.9-invalid drafts before digest/confirmation (CONFIRM_INVALID_DRAFT)", async () => {
    const { store } = tmpStrategyStore();
    const draft = { ...fourCellDraft(), risk: { positionStopLossFraction: "1", portfolioStopFraction: "0.15" } } as StrategyDraft2;
    const result = await confirmStrategy2(store, {
      currentDraft: draft,
      expectedDigest: digestStrategyDraft2(draft),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("must reject");
    expect(result.code).toBe("CONFIRM_INVALID_DRAFT");
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "INVALID_STOP_LOSS_FRACTION", path: "/risk/positionStopLossFraction" }),
    ]);
    expect(await store.listConfirmations("strategy-000001")).toEqual([]);
  });

  it("rejects schema-invalid drafts (missing cell) with CONFIRM_INVALID_DRAFT", async () => {
    const { store } = tmpStrategyStore();
    const draft = fourCellDraft() as unknown as Record<string, unknown>;
    delete draft.allocation;
    const result = await confirmStrategy2(store, { currentDraft: draft, expectedDigest: "sha256:" + "0".repeat(64) });
    expect(result).toMatchObject({ ok: false, code: "CONFIRM_INVALID_DRAFT" });
  });

  it("refuses caller-invented strategyIds and allocates revisions monotonically for adjust-v2", async () => {
    const { store } = tmpStrategyStore();
    const draft = fourCellDraft();
    const unknown = await confirmStrategy2(store, {
      strategyId: "strategy-999999",
      currentDraft: draft,
      expectedDigest: digestStrategyDraft2(draft),
    });
    expect(unknown).toMatchObject({ ok: false, code: "STRATEGY_ID_UNKNOWN" });

    const v1 = await confirmStrategy2(store, { currentDraft: draft, expectedDigest: digestStrategyDraft2(draft) });
    if (!v1.ok) throw new Error("v1 must confirm");
    const adjusted = {
      ...fourCellDraft(),
      risk: { positionStopLossFraction: "0.10", portfolioStopFraction: "0.15" },
    } as StrategyDraft2;
    const v2 = await confirmStrategy2(store, {
      strategyId: v1.confirmation.strategyId,
      currentDraft: adjusted,
      expectedDigest: digestStrategyDraft2(adjusted),
    });
    if (!v2.ok) throw new Error("v2 must confirm");
    expect(v2.confirmation.strategyId).toBe(v1.confirmation.strategyId);
    expect(v2.confirmation.revision).toBe(2);
    expect(v2.confirmation.digest).not.toBe(v1.confirmation.digest);
  });

  it("never confirms a 1.0.0 draft through the 2.0.0 gate", async () => {
    const { store } = tmpStrategyStore();
    const legacy = {
      schemaVersion: "1.0.0",
      name: "legacy",
      indicators: {},
      entry: { gt: [{ ref: "close" }, { const: "5" }] },
      exits: [{ lt: [{ ref: "close" }, { const: "4" }] }],
      position: { side: "long", allowAdd: false, entrySize: { cashFraction: "0.50" }, exitSize: { positionFraction: "1.00" } },
    };
    const result = await confirmStrategy2(store, { currentDraft: legacy, expectedDigest: "sha256:" + "0".repeat(64) });
    expect(result).toMatchObject({ ok: false, code: "CONFIRM_INVALID_DRAFT" });
  });
});

describe("runConfirmedPortfolio (confirmed gate before the portfolio engine)", () => {
  it("refuses unconfirmed strategies (STRATEGY_NOT_CONFIRMED)", async () => {
    const { store } = tmpStrategyStore();
    const scenario = SCENARIOS.fcfsSimultaneous();
    const result = await runConfirmedPortfolio(store, {
      strategy: scenario.strategy,
      runSpec: { ...scenario.runSpec, strategy: { ...scenario.runSpec.strategy, id: "strategy-000042" } },
      snapshots: scenario.snapshots,
    });
    expect(result).toMatchObject({ ok: false, code: "STRATEGY_NOT_CONFIRMED" });
  });

  it("refuses a RunSpec whose digest differs from the confirmation (CONFIRMED_DIGEST_MISMATCH)", async () => {
    const { store } = tmpStrategyStore();
    const scenario = SCENARIOS.fcfsSimultaneous();
    const confirmed = await confirmStrategy2(store, {
      currentDraft: scenario.strategy,
      expectedDigest: digestStrategyDraft2(scenario.strategy),
    });
    if (!confirmed.ok) throw new Error("must confirm");
    const tampered = {
      ...scenario.runSpec,
      strategy: { ...scenario.runSpec.strategy, id: confirmed.confirmation.strategyId, digest: "sha256:" + "1".repeat(64) },
    };
    const result = await runConfirmedPortfolio(store, {
      strategy: scenario.strategy,
      runSpec: tampered,
      snapshots: scenario.snapshots,
    });
    expect(result).toMatchObject({ ok: false, code: "CONFIRMED_DIGEST_MISMATCH" });
  });

  it("runs the confirmed four-cell strategy through the unchanged portfolio engine", async () => {
    const { store } = tmpStrategyStore();
    const scenario = SCENARIOS.fcfsSimultaneous();
    const confirmed = await confirmStrategy2(store, {
      currentDraft: scenario.strategy,
      expectedDigest: digestStrategyDraft2(scenario.strategy),
    });
    if (!confirmed.ok) throw new Error("must confirm");
    const runSpec = {
      ...scenario.runSpec,
      strategy: {
        id: confirmed.confirmation.strategyId,
        revision: confirmed.confirmation.revision,
        digest: confirmed.confirmation.digest,
      },
    };
    const result = await runConfirmedPortfolio(store, {
      strategy: scenario.strategy,
      runSpec,
      snapshots: scenario.snapshots,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("must run");
    expect(result.result.ok).toBe(true);
    if (!result.result.ok) throw new Error(JSON.stringify(result.result.error));
    expect(validateReport2(result.result.report)).toEqual([]);
  });
});
