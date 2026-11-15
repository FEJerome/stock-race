import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSnapshotFile } from "../../adapters/market/snapshot-file/index.js";
import { confirmStrategy } from "../../application/confirm-strategy/index.js";
import { draftStrategy } from "../../application/draft-strategy/index.js";
import { runConfirmedBacktest } from "../../application/run-confirmed/index.js";
import {
  digestStrategyDraft,
} from "../../core/strategy/canonical/strategy-canonical.js";
import type { StrategyDraft } from "../../core/strategy/generated/strategy-draft.types.js";
import type { RunSpec } from "../../core/strategy/generated/run-spec.types.js";
import { readJsonFixture, testRoot } from "../helpers.js";
import { clone } from "../s2-helpers.js";
import { fakePort, tmpStrategyStore } from "../s3-helpers.js";

const FIXED_NOW = "2026-11-12T08:00:00.000Z";

async function draftLegalMacdKdj() {
  const result = await draftStrategy(fakePort("legal-macd-kdj"), { intent: "MACD 三日内金叉，KDJ 过滤" });
  if (!result.ok) throw new Error("draft should be valid");
  return result;
}

function editedV2(): StrategyDraft {
  const draft = clone(readJsonFixture("fixtures/s3/legal-macd-kdj.json")) as StrategyDraft;
  draft.name = "MACD 三日内金叉，KDJ 过滤 v2";
  draft.indicators["m"]!.params!["signal"] = 5;
  return draft;
}

/** Real main-flow construction: no prepareFixtureRun; every digest comes explicitly from a confirmation record or a computed value. */
function realRunInput(strategy: StrategyDraft, strategyRef: RunSpec["strategy"]) {
  const snapshot = loadSnapshotFile(path.join(testRoot, "fixtures", "s2", "basic-snapshot.json"));
  const runSpec = clone(readJsonFixture("fixtures/s2/basic-run-spec.json")) as RunSpec;
  return {
    strategy,
    snapshot,
    runSpec: {
      ...runSpec,
      strategy: strategyRef,
      data: { ...runSpec.data, snapshotDigest: snapshot.digest },
    },
  };
}

describe("S3 confirm state machine and digest chain", () => {
  it("s3-confirm-happy: expectedDigest confirms → ConfirmedRevision persisted", async () => {
    const { rootDir, store } = tmpStrategyStore();
    const draft = await draftLegalMacdKdj();
    const result = await confirmStrategy(
      store,
      { currentDraft: JSON.parse(draft.canonicalAst), expectedDigest: draft.strategyDigest },
      { now: () => FIXED_NOW },
    );
    if (!result.ok) throw new Error(`expected confirmed, got ${result.code}`);
    expect(result.confirmation).toEqual({
      strategyId: "strategy-000001",
      revision: 1,
      digest: draft.strategyDigest,
      createdAt: FIXED_NOW,
    });
    expect(result.strategyDigest).toBe(draft.strategyDigest);
    expect(await store.findConfirmation("strategy-000001", 1)).toEqual(result.confirmation);
    expect(await store.loadCanonicalAst(draft.strategyDigest)).toBe(draft.canonicalAst);
    const digestHex = draft.strategyDigest.replace(/^sha256:/, "");
    expect(existsSync(path.join(rootDir, "strategies", digestHex, "strategy.json"))).toBe(true);
  });

  it("s3-confirm-mismatch: content swapped during confirmation → CONFIRM_DIGEST_MISMATCH, confirmation refused", async () => {
    const { store } = tmpStrategyStore();
    const draft = await draftLegalMacdKdj();
    const stale = await draftStrategy(fakePort("legal-plain-price"), { intent: "旧草稿" });
    if (!stale.ok) throw new Error("stale draft should be valid");
    const result = await confirmStrategy(
      store,
      { currentDraft: JSON.parse(draft.canonicalAst), expectedDigest: stale.strategyDigest },
      { now: () => FIXED_NOW },
    );
    if (result.ok) throw new Error("expected mismatch");
    expect(result.code).toBe("CONFIRM_DIGEST_MISMATCH");
    expect(result.actualDigest).toBe(draft.strategyDigest);
    // Rejected content must not consume strategyId/revision: a later valid confirm still starts at strategy-000001/r1
    const retry = await confirmStrategy(
      store,
      { currentDraft: JSON.parse(draft.canonicalAst), expectedDigest: draft.strategyDigest },
      { now: () => FIXED_NOW },
    );
    if (!retry.ok) throw new Error("retry should confirm");
    expect(retry.confirmation.strategyId).toBe("strategy-000001");
    expect(retry.confirmation.revision).toBe(1);
  });

  it("s3-confirm-stale-after-edit: semantics changed after confirm, engine rejects the old-digest RunSpec (no fixture backfill)", async () => {
    const { store } = tmpStrategyStore();
    const draft = await draftLegalMacdKdj();
    const confirmed = await confirmStrategy(
      store,
      { currentDraft: JSON.parse(draft.canonicalAst), expectedDigest: draft.strategyDigest },
      { now: () => FIXED_NOW },
    );
    if (!confirmed.ok) throw new Error("confirm should succeed");
    const v2 = editedV2();
    const v2Digest = digestStrategyDraft(v2);
    expect(v2Digest).not.toBe(draft.strategyDigest);
    // old-revision RunSpec + new AST: if the digest were fixture-backfilled the engine would not reject — this assertion guards that
    const input = realRunInput(v2, {
      id: confirmed.confirmation.strategyId,
      revision: confirmed.confirmation.revision,
      digest: confirmed.confirmation.digest,
    });
    const gated = await runConfirmedBacktest(store, input);
    if (!gated.ok) throw new Error(`gate should pass for confirmed digest, got ${gated.code}`);
    expect(gated.result.ok).toBe(false);
    if (!gated.result.ok) {
      expect(gated.result.error.code).toBe("STRATEGY_DIGEST_MISMATCH");
    }
  });

  it("s3-run-requires-confirmed: run built from an unconfirmed revision → refused by the confirmed gate, engine never entered", async () => {
    const { store } = tmpStrategyStore();
    const draft = await draftLegalMacdKdj();
    const confirmed = await confirmStrategy(
      store,
      { currentDraft: JSON.parse(draft.canonicalAst), expectedDigest: draft.strategyDigest },
      { now: () => FIXED_NOW },
    );
    if (!confirmed.ok) throw new Error("confirm should succeed");
    const v2 = editedV2();
    const v2Digest = digestStrategyDraft(v2);
    const input = realRunInput(v2, {
      id: confirmed.confirmation.strategyId,
      revision: 2,
      digest: v2Digest,
    });
    const gated = await runConfirmedBacktest(store, input);
    if (gated.ok) throw new Error("gate must reject unconfirmed revision");
    expect(gated.code).toBe("STRATEGY_NOT_CONFIRMED");
    // a completely unknown strategyId is refused the same way
    const unknown = await runConfirmedBacktest(store, realRunInput(v2, {
      id: "strategy-999999",
      revision: 1,
      digest: v2Digest,
    }));
    if (unknown.ok) throw new Error("gate must reject unknown strategyId");
    expect(unknown.code).toBe("STRATEGY_NOT_CONFIRMED");
  });

  it("s3-revision-monotonic: two confirms on one strategyId increment revision, digests stay independent", async () => {
    const { store } = tmpStrategyStore();
    const v1 = await draftLegalMacdKdj();
    const first = await confirmStrategy(
      store,
      { currentDraft: JSON.parse(v1.canonicalAst), expectedDigest: v1.strategyDigest },
      { now: () => FIXED_NOW },
    );
    if (!first.ok) throw new Error("first confirm should succeed");
    const v2 = editedV2();
    const v2Digest = digestStrategyDraft(v2);
    const second = await confirmStrategy(
      store,
      {
        strategyId: first.confirmation.strategyId,
        currentDraft: v2,
        expectedDigest: v2Digest,
      },
      { now: () => "2026-11-12T09:00:00.000Z" },
    );
    if (!second.ok) throw new Error("second confirm should succeed");
    expect(second.confirmation.strategyId).toBe(first.confirmation.strategyId);
    expect(second.confirmation.revision).toBe(2);
    expect(second.confirmation.digest).toBe(v2Digest);
    expect(second.confirmation.digest).not.toBe(first.confirmation.digest);
    const all = await store.listConfirmations(first.confirmation.strategyId);
    expect(all.map((entry) => entry.revision)).toEqual([1, 2]);
    // F10 v2 keeps the baseline identity: the old revision record remains queryable
    expect((await store.findConfirmation(first.confirmation.strategyId, 1))?.digest).toBe(
      first.confirmation.digest,
    );
    expect(await store.loadCanonicalAst(first.confirmation.digest)).toBe(v1.canonicalAst);
    expect(await store.loadCanonicalAst(v2Digest)).not.toBe(v1.canonicalAst);
  });
});
