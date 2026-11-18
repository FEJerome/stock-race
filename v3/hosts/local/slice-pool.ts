import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { materializeSnapshot } from "../../core/market/snapshot.js";
import type { DataSnapshot } from "../../core/market/types.js";

/**
 * Slice pool (S4 plan §4.2): three hand-authored synthetic stocks that ship
 * with the repository so the local host is fully playable offline. They are
 * NOT real market data; every UI surface and API payload marks them
 * `hand-authored-synthetic`.
 *
 * The price paths are authored against the deterministic-fake interview card
 * (entry close ≤ 9, exits close ≥ 12 or barsHeld ≥ 20, 8% position stop):
 * - alpha: dips to 8.90 early (entry), trends up, exits on barsHeld — a clean round trip.
 * - beta: dips to 8.85 (entry), rallies, then drops 27% — the position stop-loss
 *   fires before barsHeld; the rule set later re-enters because close ≤ 9 again.
 * - gamma: oscillates in 9.42–9.82 and never produces a signal (no-signal control).
 */

export interface PoolAsset {
  readonly assetId: string;
  /** One-line persona-flavoured description shown in the interview and dispatch surfaces. */
  readonly description: string;
  readonly closes: readonly string[];
}

const START_DATE = "2024-01-02";
const TRADING_DAYS = 48;

/** Deterministic weekday series (weekends skipped; synthetic pool needs no real calendar). */
export function tradingDays(start: string, count: number): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (days.length < count) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export const POOL_ASSETS: readonly PoolAsset[] = [
  {
    assetId: "stock:synthetic.alpha",
    description: "稳健大盘风格 · 缓涨缓跌的蓝筹性格",
    closes: [
      "10.00", "9.80", "9.55", "9.25", "8.90", "8.95", "9.05", "9.15",
      "9.30", "9.45", "9.60", "9.75", "9.90", "10.05", "10.20", "10.35",
      "10.50", "10.62", "10.75", "10.88", "11.00", "11.12", "11.25", "11.38",
      "11.50", "11.62", "11.75", "11.85", "11.95", "12.05", "12.15", "12.20",
      "12.15", "12.10", "12.05", "12.00", "12.05", "12.10", "12.15", "12.20",
      "12.25", "12.20", "12.15", "12.20", "12.25", "12.30", "12.25", "12.30",
    ],
  },
  {
    assetId: "stock:synthetic.beta",
    description: "高波动题材风格 · 涨得快跌得也狠",
    closes: [
      "11.00", "10.70", "10.40", "10.15", "9.90", "9.60", "9.35", "9.10",
      "8.95", "8.85", "8.90", "9.10", "9.35", "9.60", "9.85", "10.10",
      "10.35", "10.60", "10.85", "11.05", "10.75", "10.35", "9.95", "9.55",
      "9.10", "8.65", "8.20", "7.80", "7.90", "8.05", "8.25", "8.45",
      "8.65", "8.85", "9.05", "9.25", "9.45", "9.60", "9.75", "9.90",
      "10.05", "10.15", "10.25", "10.35", "10.40", "10.45", "10.45", "10.50",
    ],
  },
  {
    assetId: "stock:synthetic.gamma",
    description: "横盘现金奶牛风格 · 一年画一条直线",
    closes: [
      "9.60", "9.52", "9.45", "9.42", "9.45", "9.52", "9.60", "9.68",
      "9.75", "9.80", "9.82", "9.78", "9.70", "9.62", "9.55", "9.50",
      "9.48", "9.52", "9.58", "9.66", "9.72", "9.76", "9.74", "9.68",
      "9.60", "9.52", "9.46", "9.44", "9.50", "9.58", "9.66", "9.72",
      "9.76", "9.72", "9.64", "9.56", "9.50", "9.46", "9.50", "9.58",
      "9.66", "9.72", "9.78", "9.74", "9.66", "9.58", "9.52", "9.60",
    ],
  },
];

function buildSnapshot(asset: PoolAsset, days: readonly string[]): DataSnapshot {
  if (asset.closes.length !== days.length) {
    throw new Error(`pool asset ${asset.assetId}: ${asset.closes.length} closes for ${days.length} days`);
  }
  const sessions = days.map((date, index) => {
    const close = asset.closes[index]!;
    const open = index === 0 ? close : asset.closes[index - 1]!;
    const high = (Math.max(Number(open), Number(close)) * 1.003).toFixed(2);
    const low = (Math.min(Number(open), Number(close)) * 0.997).toFixed(2);
    return {
      date,
      status: "trading",
      bar: { date, open, high, low, close, volume: "1000000" },
    };
  }) as DataSnapshot["sessions"];
  return {
    snapshotVersion: "1.0.0",
    digest: `sha256:${"0".repeat(64)}`,
    assetIdentity: { assetId: asset.assetId, type: "stock", sourceTypeRaw: "synthetic", status: "active" },
    observationKind: "ohlcv",
    sessions,
    corporateActions: [],
    source: [{ name: "hand-authored-synthetic", interface: "fixture", libraryVersion: "1" }],
    fixedRange: { start: days[0]!, end: days[days.length - 1]! },
    adjustment: "raw",
    pricePrecision: 2,
    volumeUnit: "share",
    qualityIssues: [],
    usageRestriction: "local synthetic slice pool only — never real market data",
  };
}

/** The materialized pool snapshots (digests computed once, deterministically). */
export function buildPoolSnapshots(): DataSnapshot[] {
  const days = tradingDays(START_DATE, TRADING_DAYS);
  return POOL_ASSETS.map((asset) => materializeSnapshot(buildSnapshot(asset, days)));
}

export interface PoolListingEntry {
  readonly assetId: string;
  readonly description: string;
  readonly snapshotDigest: string;
  readonly range: { readonly start: string; readonly end: string };
  readonly sessions: number;
  readonly source: string;
}

/** Summary used by GET /snapshots (the interview asset pool and the dispatch surface). */
export function listPool(snapshots: readonly DataSnapshot[]): PoolListingEntry[] {
  return snapshots.map((snapshot) => {
    const asset = POOL_ASSETS.find((entry) => entry.assetId === snapshot.assetIdentity.assetId);
    return {
      assetId: snapshot.assetIdentity.assetId,
      description: asset?.description ?? "",
      snapshotDigest: snapshot.digest,
      range: snapshot.fixedRange,
      sessions: snapshot.sessions.length,
      source: snapshot.source[0]!.name,
    };
  });
}

/**
 * Filesystem-safe encoding for asset ids (Windows forbids ":" in file names,
 * the same constraint the strategy store documents for digest paths).
 */
export function encodeAssetIdForPath(assetId: string): string {
  return assetId.replace(/:/g, "__");
}

/**
 * Materializes the slice pool under <dataRoot>/snapshots/<encoded assetId>/snapshot.json.
 * Existing files with the identical materialized content are left untouched
 * (idempotent; the pool is immutable by construction).
 */
export async function ensurePoolMaterialized(dataRoot: string, snapshots: readonly DataSnapshot[]): Promise<void> {
  for (const snapshot of snapshots) {
    const file = path.join(dataRoot, "snapshots", encodeAssetIdForPath(snapshot.assetIdentity.assetId), "snapshot.json");
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    try {
      const existing = await readFile(file, "utf8");
      if (existing === content) continue;
    } catch {
      // missing or unreadable → (re)write below
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
}
