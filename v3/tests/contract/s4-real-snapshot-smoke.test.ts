import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSnapshotFile } from "../../adapters/market/snapshot-file/index.js";
import { runPortfolio } from "../../application/run-portfolio/index.js";
import { validateRunEvent } from "../../core/market/contract-validators.js";
import { validateReport2 } from "../../core/strategy/validation/schema-validator-2.js";
import type { DataSnapshot } from "../../core/market/types.js";
import type { RunSpec2 } from "../../core/strategy/generated/run-spec-2.types.js";
import { digestStrategyDraft2 } from "../../core/strategy/canonical/strategy-canonical-2.js";
import { InternalDecimal, internalAdd } from "../../core/strategy/canonical/rounding-profile.js";
import { testRoot } from "../helpers.js";

// Opt-in local smoke over the two reconciled real A-share snapshots frozen under SR-023
// (000858 + 600036, 2023 warmup prefix + 2024 run window). The snapshots live OUTSIDE the
// repository (.local/v3-data, license-pending) so this test is skipped in CI unless
// V3_REAL_SNAPSHOT_SMOKE=1 is set explicitly.
const ENABLED = process.env.V3_REAL_SNAPSHOT_SMOKE === "1";

function findSnapshotsRoot(): string | null {
  if (process.env.V3_DATA_ROOT && existsSync(path.join(process.env.V3_DATA_ROOT, "snapshots"))) {
    return path.join(process.env.V3_DATA_ROOT, "snapshots");
  }
  let cursor = testRoot;
  for (let depth = 0; depth < 7; depth += 1) {
    const candidate = path.join(cursor, ".local", "v3-data", "snapshots");
    if (existsSync(candidate)) return candidate;
    cursor = path.dirname(cursor);
  }
  return null;
}

function loadByAssetId(root: string, assetId: string): DataSnapshot {
  for (const dir of readdirSync(root)) {
    const snapshotPath = path.join(root, dir, "snapshot.json");
    if (!existsSync(snapshotPath)) continue;
    const snapshot = loadSnapshotFile(snapshotPath);
    if (snapshot.assetIdentity.assetId === assetId) return snapshot;
  }
  throw new Error(`snapshot for ${assetId} not found under ${root}`);
}

const ASSETS = ["stock:cn-a.sh.600036", "stock:cn-a.sz.000858"] as const;

describe("S4 real A-share snapshot smoke (opt-in: V3_REAL_SNAPSHOT_SMOKE=1)", () => {
  const root = findSnapshotsRoot();
  const runnable = ENABLED && root !== null;

  it.skipIf(!runnable)("runs a two-asset portfolio over the frozen 2024 real snapshots deterministically", () => {
    const snapshots = ASSETS.map((assetId) => loadByAssetId(root!, assetId));
    const strategy = {
      schemaVersion: "2.0.0",
      name: "S4 real snapshot smoke",
      universe: { assets: [...ASSETS] },
      indicators: {},
      entry: { gt: [{ ref: "close" }, { const: "0" }] },
      exits: [{ lt: [{ ref: "close" }, { const: "0" }] }],
      risk: { positionStopLossFraction: "0.08", portfolioStopFraction: "0.15" },
      allocation: { template: "first-come-first-served@1", params: { maxPerAssetCashFraction: "0.40" } },
      position: { side: "long", allowAdd: false, exitSize: { positionFraction: "1.00" } },
    } as const;
    const runSpec = {
      runSpecVersion: "2.0.0",
      strategy: { id: "s4-real-smoke", revision: 1, digest: digestStrategyDraft2(strategy) },
      assets: ASSETS.map((assetId) => ({ assetId, assetType: "stock", executionProfile: "cn-stock@1" })),
      data: {
        snapshots: ASSETS.map((assetId) => ({
          assetId,
          snapshotDigest: snapshots.find((snapshot) => snapshot.assetIdentity.assetId === assetId)!.digest,
        })),
        start: "2024-01-01",
        end: "2024-12-31",
      },
      warmup: { extraObservations: 0 },
      account: { initialCash: "1000000.00", currency: "CNY" },
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
    } as unknown as RunSpec2;

    const input = { strategy: strategy as never, runSpec, snapshots };
    const first = runPortfolio(input);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(JSON.stringify(first.error));
    expect(runPortfolio(input)).toEqual(first);

    const report = first.report;
    expect(validateReport2(report)).toEqual([]);
    first.events.forEach((event) => expect(validateRunEvent(event)).toEqual([]));
    expect(report.fills.length).toBeGreaterThan(0);

    // Real 2024 dividends flow through the unified pool (receivable → paid).
    const dividendEvents = first.events.filter((event) =>
      event.type === "CorporateActionApplied" && event.reasonCodes.includes("DIVIDEND_RECEIVABLE"));
    expect(dividendEvents.length).toBeGreaterThan(0);

    // Equity reconciliation against raw snapshot closes for every trading day.
    for (const day of report.daily) {
      const positionValue = day.positions.reduce((sum, position) => {
        const snapshot = snapshots.find((candidate) => candidate.assetIdentity.assetId === position.assetId)!;
        const mark = snapshot.sessions
          .filter((session) => session.date <= day.date && session.status === "trading" && session.bar)
          .at(-1)?.bar?.close ?? "0.00";
        return internalAdd(sum, new InternalDecimal(mark).mul(position.total));
      }, new InternalDecimal(0));
      expect(day.equity, day.date).toBe(internalAdd(day.cash.total, positionValue).toFixed(2));
    }

    console.log(`real smoke runDigest=${first.runDigest}`);
    console.log(`fills=${report.fills.length} finalEquity=${report.finalEquity} return=${report.metrics.cumulativeReturn} maxDD=${report.metrics.maxDrawdown}`);
    console.log(`assets=${JSON.stringify(report.assets.map((a) => ({ id: a.assetId, fills: a.fillCount, stops: a.positionStopLossTriggers })))}`);
  });

  it.skipIf(ENABLED)("is skipped unless V3_REAL_SNAPSHOT_SMOKE=1 (snapshots stay outside the repo)", () => {
    expect(ENABLED).toBe(false);
  });
});
