import { materializeSnapshot } from "../core/market/snapshot.js";
import { digestStrategyDraft2 } from "../core/strategy/canonical/strategy-canonical-2.js";
import type { DataSnapshot } from "../core/market/types.js";
import type { RunSpec2 } from "../core/strategy/generated/run-spec-2.types.js";
import type { StrategyDraft2 } from "../core/strategy/generated/strategy-draft-2.types.js";
import type { PortfolioRunInput } from "../core/engine/portfolio/types.js";

export interface DaySpec {
  readonly date: string;
  readonly status?: "trading" | "suspended";
  readonly open?: string;
  readonly high?: string;
  readonly low?: string;
  readonly close?: string;
}

export function buildSnapshot(assetId: string, days: readonly DaySpec[]): DataSnapshot {
  const sessions = days.map((day) => {
    const status = day.status ?? "trading";
    if (status !== "trading") return { date: day.date, status };
    const open = day.open ?? day.close!;
    const close = day.close!;
    return {
      date: day.date,
      status,
      bar: {
        date: day.date,
        open,
        high: day.high ?? (Number(open) > Number(close) ? open : close),
        low: day.low ?? (Number(open) < Number(close) ? open : close),
        close,
        volume: "1000",
      },
    };
  }) as DataSnapshot["sessions"];
  return {
    snapshotVersion: "1.0.0",
    digest: `sha256:${"0".repeat(64)}`,
    assetIdentity: { assetId, type: "stock", sourceTypeRaw: "synthetic", status: "active" },
    observationKind: "ohlcv",
    sessions,
    corporateActions: [],
    source: [{ name: "hand-authored-synthetic", interface: "fixture", libraryVersion: "1" }],
    fixedRange: { start: days[0]!.date, end: days[days.length - 1]!.date },
    adjustment: "raw",
    pricePrecision: 2,
    volumeUnit: "share",
    qualityIssues: [],
    usageRestriction: "local synthetic contract test only",
  };
}

export interface DraftOptions {
  readonly assets: readonly string[];
  readonly entry: StrategyDraft2["entry"];
  readonly exits: StrategyDraft2["exits"];
  readonly positionStopLossFraction: string;
  readonly portfolioStopFraction: string;
  readonly allocation: StrategyDraft2["allocation"];
  readonly exitPositionFraction?: string;
}

export function buildDraft(options: DraftOptions): StrategyDraft2 {
  return {
    schemaVersion: "2.0.0",
    name: "S4 synthetic portfolio probe",
    universe: { assets: [...options.assets] },
    indicators: {},
    entry: options.entry,
    exits: options.exits,
    risk: {
      positionStopLossFraction: options.positionStopLossFraction,
      portfolioStopFraction: options.portfolioStopFraction,
    },
    allocation: options.allocation,
    position: {
      side: "long",
      allowAdd: false,
      exitSize: { positionFraction: options.exitPositionFraction ?? "1.00" },
    },
  } as StrategyDraft2;
}

export interface PortfolioScenario {
  readonly strategy: StrategyDraft2;
  readonly runSpec: RunSpec2;
  readonly snapshots: DataSnapshot[];
}

export function preparePortfolioScenario(input: {
  readonly strategy: StrategyDraft2;
  readonly snapshots: DataSnapshot[];
  readonly start: string;
  readonly end: string;
  readonly initialCash: string;
}): PortfolioScenario {
  const snapshots = input.snapshots.map((snapshot) => materializeSnapshot(snapshot));
  const runSpec = {
    runSpecVersion: "2.0.0",
    strategy: { id: "s4-synthetic", revision: 1, digest: digestStrategyDraft2(input.strategy) },
    assets: input.strategy.universe.assets.map((assetId) => ({
      assetId,
      assetType: "stock",
      executionProfile: "cn-stock@1",
    })),
    data: {
      snapshots: input.strategy.universe.assets.map((assetId) => ({
        assetId,
        snapshotDigest: snapshots.find((snapshot) => snapshot.assetIdentity.assetId === assetId)!.digest,
      })),
      start: input.start,
      end: input.end,
    },
    warmup: { extraObservations: 0 },
    account: { initialCash: input.initialCash, currency: "CNY" },
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
  return { strategy: input.strategy, runSpec, snapshots };
}

export function toRunInput(scenario: PortfolioScenario): PortfolioRunInput {
  return { strategy: scenario.strategy, runSpec: scenario.runSpec, snapshots: scenario.snapshots };
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const ALPHA = "stock:synthetic.alpha";
export const BETA = "stock:synthetic.beta";
export const GAMMA = "stock:synthetic.gamma";
