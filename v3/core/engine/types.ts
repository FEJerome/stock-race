import type { WarmupStatus } from "../strategy/evaluation/warmup.js";
import type { DataSnapshot, Report, RunEvent, RunSpec } from "../market/types.js";
import type { StrategyDraft } from "../strategy/generated/strategy-draft.types.js";

export interface StockRunInput {
  readonly runSpec: RunSpec;
  readonly snapshot: DataSnapshot;
  readonly strategy: StrategyDraft;
}

export interface RunFailure {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly details?: WarmupStatus;
}

export type StockRunResult =
  | { readonly ok: true; readonly runDigest: string; readonly events: readonly RunEvent[]; readonly report: Report }
  | { readonly ok: false; readonly runDigest: string; readonly events: readonly RunEvent[]; readonly error: RunFailure };

export interface FillRecord {
  readonly date: string;
  readonly side: "buy" | "sell";
  readonly price: string;
  readonly quantity: string;
  readonly amount: string;
  readonly commission: string;
  readonly transferFee: string;
  readonly stampDuty: string;
  readonly fees: string;
  readonly cashDelta: string;
}

export interface OrderRecord {
  readonly intentId?: string;
  readonly date: string;
  readonly side: "buy" | "sell";
  readonly quantity: string;
  readonly status: "created" | "filled" | "rejected" | "cancelled";
  readonly reason: string | null;
}

export interface Simulation {
  readonly daily: Report["daily"];
  readonly fills: FillRecord[];
  readonly orders: OrderRecord[];
  readonly rejections: OrderRecord[];
  readonly fees: Report["fees"];
  readonly cash: Report["cash"];
  readonly position: Report["position"];
  readonly finalEquity: string;
  readonly equitySeries: string[];
  readonly buyHoldReason: "NO_ELIGIBLE_FILL_SESSION" | "NO_AFFORDABLE_STARTING_LOT" | null;
}
