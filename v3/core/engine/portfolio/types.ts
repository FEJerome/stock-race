import type { WarmupStatus } from "../../strategy/evaluation/warmup.js";
import type { DataSnapshot, RunEvent } from "../../market/types.js";
import type { RunSpec2 } from "../../strategy/generated/run-spec-2.types.js";
import type { Report2 } from "../../strategy/generated/report-2.types.js";
import type { StrategyDraft2 } from "../../strategy/generated/strategy-draft-2.types.js";
import type { FillRecord, OrderRecord } from "../types.js";

export interface PortfolioRunInput {
  readonly runSpec: RunSpec2;
  /** One frozen DataSnapshot per scheduled asset; matched by assetIdentity.assetId. */
  readonly snapshots: readonly DataSnapshot[];
  readonly strategy: StrategyDraft2;
}

export interface PortfolioRunFailure {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly details?: WarmupStatus;
}

export type PortfolioRunResult =
  | { readonly ok: true; readonly runDigest: string; readonly events: readonly RunEvent[]; readonly report: Report2 }
  | { readonly ok: false; readonly runDigest: string; readonly events: readonly RunEvent[]; readonly error: PortfolioRunFailure };

/** FillRecord plus explicit asset attribution (contract §12.7: attribution is explicit, never positional). */
export interface PortfolioFillRecord extends FillRecord {
  readonly assetId: string;
}

export interface PortfolioOrderRecord extends OrderRecord {
  readonly assetId: string;
}

export interface PortfolioAssetSummary {
  readonly assetId: string;
  readonly fillCount: number;
  readonly fees: { commission: string; transferFee: string; stampDuty: string; total: string };
  readonly endingPosition: { total: string; sellable: string; reserved: string; unsettled: string };
  readonly positionStopLossTriggers: number;
}

export interface PortfolioDailyRecord {
  readonly date: string;
  readonly equity: string;
  readonly cash: { available: string; reserved: string; unsettled: string; receivable: string; total: string };
  readonly positions: readonly { assetId: string; total: string; sellable: string; reserved: string; unsettled: string }[];
}

export interface PortfolioSimulation {
  readonly daily: PortfolioDailyRecord[];
  readonly fills: PortfolioFillRecord[];
  readonly orders: PortfolioOrderRecord[];
  readonly rejections: PortfolioOrderRecord[];
  readonly fees: { commission: string; transferFee: string; stampDuty: string; total: string };
  readonly perAsset: readonly PortfolioAssetSummary[];
  readonly finalEquity: string;
  readonly equitySeries: string[];
  readonly buyHoldReason: "NO_ELIGIBLE_FILL_SESSION" | "NO_AFFORDABLE_STARTING_LOT" | null;
}
