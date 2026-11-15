import type { StockRunInput, StockRunResult } from "../../core/engine/types.js";
import type { StrategyStore } from "../ports/strategy-store.js";

/**
 * Confirmed gate (contract 3.3: unconfirmed strategies are refused a run),
 * layered before the engine-level STRATEGY_DIGEST_MISMATCH backstop. The real
 * main flow must never go through prepareFixtureRun's automatic digest
 * backfill.
 */
export type ConfirmedRunResult =
  | { readonly ok: true; readonly result: StockRunResult }
  | {
      readonly ok: false;
      readonly code: "STRATEGY_NOT_CONFIRMED" | "CONFIRMED_DIGEST_MISMATCH";
      readonly message: string;
    };

import { runBacktest } from "../run-backtest/index.js";

/**
 * Confirmed gate (contract 3.3: unconfirmed strategies are refused a run),
 * layered before the engine-level STRATEGY_DIGEST_MISMATCH backstop. The real
 * main flow must never go through prepareFixtureRun's automatic digest
 * backfill — this use case only checks the gate and never rewrites input.
 */
export async function runConfirmedBacktest(
  store: StrategyStore,
  input: StockRunInput,
): Promise<ConfirmedRunResult> {
  const { id, revision, digest } = input.runSpec.strategy;
  const record = await store.findConfirmation(id, revision);
  if (!record) {
    return {
      ok: false,
      code: "STRATEGY_NOT_CONFIRMED",
      message: `策略 ${id} revision ${revision} 未经确认，拒绝运行`,
    };
  }
  if (record.digest !== digest) {
    return {
      ok: false,
      code: "CONFIRMED_DIGEST_MISMATCH",
      message: `RunSpec digest 与确认记录不符：${id} revision ${revision}`,
    };
  }
  return { ok: true, result: runBacktest(input) };
}
