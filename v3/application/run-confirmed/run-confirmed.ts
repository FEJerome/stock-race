import type { StockRunInput, StockRunResult } from "../../core/engine/types.js";
import type { StrategyStore } from "../ports/strategy-store.js";

/**
 * confirmed 闸（契约 3.3：未确认拒绝运行），叠加在引擎层
 * STRATEGY_DIGEST_MISMATCH 兜底之前。真实主流程不得经
 * prepareFixtureRun 的 digest 自动回填。
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
 * confirmed 闸（契约 3.3：未确认拒绝运行），叠加在引擎层
 * STRATEGY_DIGEST_MISMATCH 兜底之前。真实主流程不得经
 * prepareFixtureRun 的 digest 自动回填——本用例只做查闸，不改写 input。
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
