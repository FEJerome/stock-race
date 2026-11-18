import type { PortfolioRunInput, PortfolioRunResult } from "../../core/engine/portfolio/types.js";
import { executePortfolioRun } from "../../core/engine/portfolio/engine.js";

export function runPortfolio(input: PortfolioRunInput): PortfolioRunResult {
  return executePortfolioRun(input);
}
