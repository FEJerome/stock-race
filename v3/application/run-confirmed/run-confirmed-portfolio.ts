import type { PortfolioRunInput, PortfolioRunResult } from "../../core/engine/portfolio/types.js";
import { runPortfolio } from "../run-portfolio/index.js";
import type { StrategyStore } from "../ports/strategy-store.js";

export type ConfirmedPortfolioRunResult =
  | { readonly ok: true; readonly result: PortfolioRunResult }
  | {
      readonly ok: false;
      readonly code: "STRATEGY_NOT_CONFIRMED" | "CONFIRMED_DIGEST_MISMATCH";
      readonly message: string;
    };

/**
 * Confirmed gate for portfolio runs (contract 3.3 + §12.6): a 2.0.0 run is
 * refused unless the referenced {strategyId, revision} was confirmed and the
 * RunSpec digest matches the signed four-cell card. Layered before the
 * engine-level STRATEGY_DIGEST_MISMATCH backstop; this use case only checks
 * the gate and never rewrites input.
 */
export async function runConfirmedPortfolio(
  store: StrategyStore,
  input: PortfolioRunInput,
): Promise<ConfirmedPortfolioRunResult> {
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
  return { ok: true, result: runPortfolio(input) };
}
