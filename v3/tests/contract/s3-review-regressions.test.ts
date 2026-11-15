import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { confirmStrategy } from "../../application/confirm-strategy/index.js";
import { draftStrategy } from "../../application/draft-strategy/index.js";
import { ContractError } from "../../core/strategy/canonical/errors.js";
import { digestStrategyDraft } from "../../core/strategy/canonical/strategy-canonical.js";
import type { StrategyDraft } from "../../core/strategy/generated/strategy-draft.types.js";
import { startLocalServer } from "../../hosts/local/index.js";
import { readJsonFixture, testRoot } from "../helpers.js";
import { clone } from "../s2-helpers.js";
import { fakePort, tmpDataRoot, tmpStrategyStore } from "../s3-helpers.js";

const NOW = "2026-11-12T08:00:00.000Z";
const KIMI_TEST_CONFIG = { apiKey: "test-placeholder-not-a-real-key", modelId: "kimi-unprobed" };

function v2Draft(): StrategyDraft {
  const draft = clone(readJsonFixture("fixtures/s3/legal-macd-kdj.json")) as StrategyDraft;
  draft.name = "阿一面试样例·v2";
  draft.indicators["m"]!.params!["signal"] = 5;
  return draft;
}

function v3Draft(): StrategyDraft {
  const draft = v2Draft();
  draft.name = "阿一面试样例·v3";
  draft.indicators["m"]!.params!["signal"] = 7;
  return draft;
}

async function confirmFirst(store: Parameters<typeof confirmStrategy>[0]) {
  const draft = await draftStrategy(fakePort("legal-macd-kdj"), { intent: "首版" });
  if (!draft.ok) throw new Error("draft should be valid");
  const confirmed = await confirmStrategy(
    store,
    { currentDraft: JSON.parse(draft.canonicalAst), expectedDigest: draft.strategyDigest },
    { now: () => NOW },
  );
  if (!confirmed.ok) throw new Error("first confirm should succeed");
  return { draft, confirmed };
}

describe("S3 re-review regression: B1 path-join whitelist", () => {
  it("s3-store-path-guard: malformed digest/strategyId rejected before the file layer", async () => {
    const { store } = tmpStrategyStore();
    const traversalDigest = "sha256:../../etc/passwd";
    await expect(store.loadCanonicalAst(traversalDigest)).rejects.toBeInstanceOf(ContractError);
    await expect(store.loadCanonicalAst(traversalDigest)).rejects.toMatchObject({
      code: "INVALID_STORE_DIGEST",
    });
    await expect(store.findConfirmation("../escape", 1)).rejects.toMatchObject({
      code: "INVALID_STRATEGY_ID",
    });
    await expect(store.listConfirmations("strategy-000001;rm")).rejects.toMatchObject({
      code: "INVALID_STRATEGY_ID",
    });
    await expect(
      store.commitConfirmation(
        { strategyId: "../escape", digest: `sha256:${"0".repeat(64)}`, createdAt: NOW },
        "{}",
      ),
    ).rejects.toMatchObject({ code: "INVALID_STRATEGY_ID" });
    await expect(
      store.commitConfirmation({ digest: "sha256:not-hex", createdAt: NOW }, "{}"),
    ).rejects.toMatchObject({ code: "INVALID_STORE_DIGEST" });
  });

  it("s3-local-run-digest-guard: runDigest outside the whitelist on GET /runs → 400, no path traversal", async () => {
    const handle = await startLocalServer({ dataRoot: tmpDataRoot(), kimi: KIMI_TEST_CONFIG });
    try {
      const evil = encodeURIComponent("sha256:../../../../package.json");
      const response = await fetch(`${handle.url}/runs/${evil}`);
      expect(response.status).toBe(400);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("INVALID_STORE_DIGEST");
    } finally {
      await handle.close();
    }
  });
});

describe("S3 re-review regression: B2 atomic write and read-time digest check", () => {
  it("s3-store-read-digest-check: tampered strategy.json → read refuses to treat it as a confirmed strategy", async () => {
    const { rootDir, store } = tmpStrategyStore();
    const { confirmed } = await confirmFirst(store);
    const digestHex = confirmed.confirmation.digest.replace(/^sha256:/, "");
    const strategyFile = path.join(rootDir, "strategies", digestHex, "strategy.json");
    writeFileSync(strategyFile, '{"tampered":true}', "utf8");
    await expect(store.loadCanonicalAst(confirmed.confirmation.digest)).rejects.toMatchObject({
      code: "STORE_CONTENT_DIGEST_MISMATCH",
    });
  });

  it("s3-store-atomic-write: no temp-file leftovers after confirmation persists", async () => {
    const { rootDir, store } = tmpStrategyStore();
    await confirmFirst(store);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
      );
    const leftovers = walk(path.join(rootDir, "strategies")).filter((file) =>
      file.includes(".tmp-"),
    );
    expect(leftovers).toEqual([]);
  });
});

describe("S3 re-review regression: M1 repair-round payload minimization (contract 3.3)", () => {
  it("s3-repair-payload-minimal: repair rounds carry only structured errors and the capability manifest", async () => {
    const port = fakePort("repair-success-at-attempt-1");
    const result = await draftStrategy(port, { intent: "初轮意图不应出现在修复轮" });
    if (!result.ok) throw new Error("expected valid");
    expect(port.requests).toHaveLength(2);
    const first = port.requests[0]!;
    expect(first.kind).toBe("draft");
    if (first.kind === "draft") {
      expect(first.intent).toBe("初轮意图不应出现在修复轮");
    }
    const repair = port.requests[1]!;
    expect(repair.kind).toBe("repair");
    expect("intent" in repair).toBe(false);
    expect("conversation" in repair).toBe(false);
    expect("baseCanonicalAst" in repair).toBe(false);
    if (repair.kind === "repair") {
      expect(repair.repairIssues.length).toBeGreaterThan(0);
      expect(repair.repairIssues.some((issue) => issue.code === "UNKNOWN_INDICATOR")).toBe(true);
    }
    expect(repair.capabilityManifest.manifestVersion).toBe("1.0.0");
  });
});

describe("S3 re-review regression: M2/M3 strategyId uniqueness and concurrency", () => {
  it("s3-confirm-unknown-id: caller-supplied unknown strategyId → STRATEGY_ID_UNKNOWN", async () => {
    const { store } = tmpStrategyStore();
    const draft = v2Draft();
    const result = await confirmStrategy(
      store,
      {
        strategyId: "strategy-000099",
        currentDraft: draft,
        expectedDigest: digestStrategyDraft(draft),
      },
      { now: () => NOW },
    );
    if (result.ok) throw new Error("unknown strategyId must be rejected");
    expect(result.code).toBe("STRATEGY_ID_UNKNOWN");
  });

  it("s3-confirm-concurrent: concurrent confirms on one strategyId → revisions serialize and never collide", async () => {
    const { store } = tmpStrategyStore();
    const { confirmed } = await confirmFirst(store);
    const strategyId = confirmed.confirmation.strategyId;
    const [second, third] = await Promise.all([
      confirmStrategy(
        store,
        { strategyId, currentDraft: v2Draft(), expectedDigest: digestStrategyDraft(v2Draft()) },
        { now: () => "2026-11-12T09:00:00.000Z" },
      ),
      confirmStrategy(
        store,
        { strategyId, currentDraft: v3Draft(), expectedDigest: digestStrategyDraft(v3Draft()) },
        { now: () => "2026-11-12T10:00:00.000Z" },
      ),
    ]);
    if (!second.ok || !third.ok) throw new Error("both confirms should succeed");
    const revisions = [second.confirmation.revision, third.confirmation.revision].sort();
    expect(revisions).toEqual([2, 3]);
    const all = await store.listConfirmations(strategyId);
    expect(all.map((entry) => entry.revision)).toEqual([1, 2, 3]);
  });
});

describe("S3 re-review regression: MINOR host boundaries", () => {
  it("s3-local-run-bad-body: POST /runs missing strategy reference → 400, not 500", async () => {
    const handle = await startLocalServer({ dataRoot: tmpDataRoot(), kimi: KIMI_TEST_CONFIG });
    try {
      const response = await fetch(`${handle.url}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ strategy: {}, runSpec: {}, snapshot: {} }),
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe("BAD_REQUEST");
    } finally {
      await handle.close();
    }
  });
});
