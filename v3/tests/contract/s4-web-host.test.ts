import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  createDeterministicFakeAdapter,
  loadFakeScenarios,
  type FakeScenarioTable,
} from "../../adapters/model/deterministic/index.js";
import { runPortfolio } from "../../application/run-portfolio/index.js";
import type { DataSnapshot } from "../../core/market/types.js";
import type { RunSpec2 } from "../../core/strategy/generated/run-spec-2.types.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import { digestStrategyDraft2 } from "../../core/strategy/canonical/strategy-canonical-2.js";
import { startLocalServer, type LocalServerHandle } from "../../hosts/local/index.js";
import { buildPoolSnapshots, ensurePoolMaterialized } from "../../hosts/local/slice-pool.js";
import { testRoot } from "../helpers.js";

const KIMI_TEST_CONFIG = { apiKey: "test-placeholder-not-a-real-key", modelId: "kimi-unprobed" };

let cachedScenarios: FakeScenarioTable | null = null;
function s4Scenarios(): FakeScenarioTable {
  cachedScenarios ??= loadFakeScenarios(path.join(testRoot, "fixtures", "s4-interview"));
  return cachedScenarios;
}

function makeInterviewPort(style?: string) {
  return createDeterministicFakeAdapter({
    scenarios: s4Scenarios(),
    scenario: style === "expert" ? "expert" : "novice",
    stepping: "per-call",
  });
}

async function startSlice(dataRoot: string): Promise<LocalServerHandle> {
  const pool = buildPoolSnapshots();
  await ensurePoolMaterialized(dataRoot, pool);
  return startLocalServer(
    {
      dataRoot,
      kimi: KIMI_TEST_CONFIG,
      testOverrides: {
        modelPort: makeInterviewPort("novice"),
        interviewPortFactory: (style?: string) => makeInterviewPort(style),
      },
    },
    { pool },
  );
}

async function postJson(url: string, body: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

async function getJson(url: string): Promise<{ status: number; json: any }> {
  const response = await fetch(url);
  return { status: response.status, json: await response.json() };
}

function noviceDraft(): StrategyDraft2 {
  const envelope = JSON.parse(
    readFileSync(path.join(testRoot, "fixtures", "s4-interview", "novice-draft.json"), "utf8"),
  ) as { kind: string; draft: StrategyDraft2 };
  return envelope.draft;
}

function buildRunSpec(pool: readonly DataSnapshot[], strategy: { id: string; revision: number; digest: string }, draft: StrategyDraft2): RunSpec2 {
  const ids = draft.universe.assets;
  return {
    runSpecVersion: "2.0.0",
    strategy,
    assets: ids.map((assetId) => ({ assetId, assetType: "stock", executionProfile: "cn-stock@1" })),
    data: {
      snapshots: ids.map((assetId) => ({
        assetId,
        snapshotDigest: pool.find((snapshot) => snapshot.assetIdentity.assetId === assetId)!.digest,
      })),
      start: "2024-01-02",
      end: "2024-03-07",
    },
    warmup: { extraObservations: 0 },
    account: { initialCash: "100000.00", currency: "CNY" },
    execution: {
      feeProfileVersion: "cn-stock-demo-fee@1",
      slippageProfileVersion: "cn-stock-one-tick@1",
      visibilityRuleVersion: "asset-default@1",
      settlementProfileVersion: "cn-stock-settlement@1",
      reportProfileVersion: "cn-stock-report@1",
    },
    engine: {
      engineVersion: "2.0.0",
      registryVersion: "1.0.0",
      canonicalizationVersion: "canonicalization@1",
      decimalProfileVersion: "decimal@1",
      roundingProfileVersion: "rounding@1",
      indicatorArithmeticProfileVersion: "indicator-arithmetic@1",
    },
  } as RunSpec2;
}

/** Drives the five-turn novice interview to the strategy card, then confirms it. */
async function interviewAndConfirm(url: string): Promise<{ confirmation: any; canonicalAst: string; card: any }> {
  const started = await postJson(`${url}/interview/start`, { style: "novice" });
  expect(started.status).toBe(200);
  const sessionId = started.json.sessionId as string;
  let card: any = null;
  for (let turn = 1; turn <= 5; turn += 1) {
    const result = await postJson(`${url}/interview/turn`, { sessionId, text: `第 ${turn} 轮回答` });
    expect(result.status).toBe(200);
    if (turn < 5) {
      expect(result.json.kind).toBe("question");
    } else {
      expect(result.json.kind).toBe("draft");
      card = result.json.card;
    }
  }
  expect(card).not.toBeNull();
  // The four-cell readback carries the three new clause groups (contract §12.6).
  const paths = card.readback.clauses.map((clause: { astPath: string }) => clause.astPath);
  expect(paths).toContain("/universe");
  expect(paths).toContain("/risk/positionStopLossFraction");
  expect(paths).toContain("/risk/portfolioStopFraction");
  expect(paths).toContain("/allocation");
  const confirmed = await postJson(`${url}/strategies/confirm-2`, {
    currentDraft: JSON.parse(card.canonicalAst),
    expectedDigest: card.strategyDigest,
  });
  expect(confirmed.status).toBe(200);
  expect(confirmed.json.ok).toBe(true);
  return { confirmation: confirmed.json.confirmation, canonicalAst: card.canonicalAst, card };
}

describe("S4 web host slice (interview → confirm → portfolio run → sensitivity)", () => {
  it("serves the labelled synthetic slice pool", async () => {
    const dataRoot = mkdtempSync(path.join(tmpdir(), "s4-host-"));
    const handle = await startSlice(dataRoot);
    try {
      const { status, json } = await getJson(`${handle.url}/snapshots`);
      expect(status).toBe(200);
      expect(json.source).toBe("hand-authored-synthetic");
      expect(json.assets).toHaveLength(3);
      for (const asset of json.assets) {
        expect(asset.source).toBe("hand-authored-synthetic");
        expect(asset.snapshotDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(asset.sessions).toBe(48);
      }
      const full = await getJson(`${handle.url}/snapshots/stock:synthetic.alpha`);
      expect(full.status).toBe(200);
      expect(full.json.assetIdentity.assetId).toBe("stock:synthetic.alpha");
      expect(full.json.digest).toBe(json.assets.find((a: any) => a.assetId === "stock:synthetic.alpha").snapshotDigest);
      expect(full.json.sessions).toHaveLength(48);
    } finally {
      await handle.close();
    }
  });

  it("walks the full chain: interview fills all four cells, confirm signs the digest, portfolio run persists, sensitivity gate runs", async () => {
    const dataRoot = mkdtempSync(path.join(tmpdir(), "s4-host-"));
    const handle = await startSlice(dataRoot);
    try {
      const { confirmation, canonicalAst, card } = await interviewAndConfirm(handle.url);
      expect(confirmation.digest).toBe(card.strategyDigest);

      const draft = JSON.parse(canonicalAst) as StrategyDraft2;
      const runSpec = buildRunSpec(
        buildPoolSnapshots(),
        { id: confirmation.strategyId, revision: confirmation.revision, digest: confirmation.digest },
        draft,
      );
      const run = await postJson(`${handle.url}/runs/portfolio`, { runSpec });
      if (run.status !== 200) console.error("RUN 400 BODY:", JSON.stringify(run.json).slice(0, 500));
      expect(run.status).toBe(200);
      expect(run.json.ok).toBe(true);
      const result = run.json;
      expect(result.runDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      // Slice pool behaviour: alpha round-trips, beta hits the position stop-loss once.
      const alpha = result.report.assets.find((entry: any) => entry.assetId === "stock:synthetic.alpha");
      const beta = result.report.assets.find((entry: any) => entry.assetId === "stock:synthetic.beta");
      expect(alpha.fillCount).toBe(2);
      expect(beta.fillCount).toBe(3);
      expect(beta.positionStopLossTriggers).toBe(1);
      const stopIntents = result.events.filter(
        (event: any) => event.type === "OrderIntentCreated" && event.reasonCodes.includes("POSITION_STOP_LOSS"),
      );
      expect(stopIntents).toHaveLength(1);
      expect(stopIntents[0].inputRefs.asset).toBe("stock:synthetic.beta");
      expect(result.report.reportVersion).toBe("2.0.0");
      expect(result.report.eventDigest).toMatch(/^sha256:/);
      expect(result.report.reportDigest).toMatch(/^sha256:/);

      // The persisted run is re-readable with its runSpec.
      const reread = await getJson(`${handle.url}/runs/portfolio/${encodeURIComponent(result.runDigest)}`);
      expect(reread.status).toBe(200);
      expect(reread.json.result.runDigest).toBe(result.runDigest);
      expect(reread.json.runSpec.strategy.digest).toBe(confirmation.digest);

      // Sensitivity gate (contract §12.7): standalone artifact, persisted and re-readable.
      const sensitivity = await postJson(`${handle.url}/runs/portfolio/${encodeURIComponent(result.runDigest)}/sensitivity`, {});
      expect(sensitivity.status).toBe(200);
      expect(sensitivity.json.report.sensitivityReportVersion).toBe("1.0.0");
      expect(sensitivity.json.report.baseRunDigest).toBe(result.runDigest);
      expect(sensitivity.json.report.variants.length).toBeGreaterThan(0);
      expect(sensitivity.json.report.variants.length).toBeLessThanOrEqual(8);
      expect(typeof sensitivity.json.report.verdict.trustworthy).toBe("boolean");
      const rereadSensitivity = await getJson(
        `${handle.url}/runs/portfolio/${encodeURIComponent(result.runDigest)}/sensitivity`,
      );
      expect(rereadSensitivity.status).toBe(200);
      expect(rereadSensitivity.json.report).toEqual(sensitivity.json.report);
    } finally {
      await handle.close();
    }
  });

  it("rejects confirmation when expectedDigest does not match (CONFIRM_DIGEST_MISMATCH, 409)", async () => {
    const dataRoot = mkdtempSync(path.join(tmpdir(), "s4-host-"));
    const handle = await startSlice(dataRoot);
    try {
      const draft = noviceDraft();
      const wrongDigest = `sha256:${"0".repeat(64)}`;
      const { status, json } = await postJson(`${handle.url}/strategies/confirm-2`, {
        currentDraft: draft,
        expectedDigest: wrongDigest,
      });
      expect(status).toBe(409);
      expect(json.code).toBe("CONFIRM_DIGEST_MISMATCH");
      expect(json.actualDigest).toBe(digestStrategyDraft2(draft));
    } finally {
      await handle.close();
    }
  });

  it("rejects a portfolio run for an unconfirmed strategy (STRATEGY_NOT_CONFIRMED, 409)", async () => {
    const dataRoot = mkdtempSync(path.join(tmpdir(), "s4-host-"));
    const handle = await startSlice(dataRoot);
    try {
      const draft = noviceDraft();
      const runSpec = buildRunSpec(
        buildPoolSnapshots(),
        { id: "strategy-000009", revision: 1, digest: digestStrategyDraft2(draft) },
        draft,
      );
      const { status, json } = await postJson(`${handle.url}/runs/portfolio`, { runSpec });
      expect(status).toBe(409);
      expect(json.code).toBe("STRATEGY_NOT_CONFIRMED");
    } finally {
      await handle.close();
    }
  });

  it("keeps CLI and local host on the same runDigest for identical inputs (dual-host parity)", async () => {
    const dataRoot = mkdtempSync(path.join(tmpdir(), "s4-host-"));
    const pool = buildPoolSnapshots();
    await ensurePoolMaterialized(dataRoot, pool);
    const draft = noviceDraft();
    const runSpec = buildRunSpec(pool, { id: "s4-cli-parity", revision: 1, digest: digestStrategyDraft2(draft) }, draft);

    const root = path.resolve(testRoot, "..");
    const bundle = path.join(root, ".local", "s4-test-portfolio-cli.cjs");
    buildSync({
      entryPoints: [path.join(root, "hosts", "cli", "run-portfolio-cli.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: bundle,
    });
    const strategyFile = path.join(dataRoot, "strategy.json");
    const runSpecFile = path.join(dataRoot, "runspec.json");
    writeFileSync(strategyFile, JSON.stringify(draft), "utf8");
    writeFileSync(runSpecFile, JSON.stringify(runSpec), "utf8");
    const snapshotFiles = draft.universe.assets.map((assetId) =>
      path.join(dataRoot, "snapshots", assetId.replace(/:/g, "__"), "snapshot.json"),
    );
    const stdout = execFileSync(
      process.execPath,
      [bundle, "--strategy", strategyFile, "--run-spec", runSpecFile, "--snapshots", ...snapshotFiles],
      { cwd: root, encoding: "utf8" },
    );
    const cli = JSON.parse(stdout) as ReturnType<typeof runPortfolio>;
    const application = runPortfolio({ strategy: draft, runSpec, snapshots: pool.filter((s) => draft.universe.assets.includes(s.assetIdentity.assetId)) });
    expect(cli).toEqual(application);
    expect(cli.ok).toBe(true);
  });
});
