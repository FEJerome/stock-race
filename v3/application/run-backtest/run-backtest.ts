import type { StockRunInput, StockRunResult } from "../../core/engine/types.js";
import { executeStockRun } from "../../core/engine/engine.js";

export function runBacktest(input: StockRunInput): StockRunResult {
  return executeStockRun(input);
}
