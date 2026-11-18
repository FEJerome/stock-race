import type { StrategyDraft2 } from "../generated/strategy-draft-2.types.js";
import type { Readback } from "../generated/readback.types.js";
import { ContractError } from "../canonical/errors.js";
import { digestCanonical } from "../canonical/digest.js";
import { parseJsonInput } from "../validation/json-input.js";
import { assertValidStrategyDraft2 } from "../validation/schema-validator-2.js";
import { validateStrategySemantics2 } from "../validation/semantic-validator-2.js";
import type { ObservationKind, Registry } from "../registry/types.js";
import { renderReadbackBool } from "./readback.js";
import {
  renderAllocation,
  renderIndicator,
  renderPortfolioStop,
  renderPosition2,
  renderPositionStopLoss,
  renderUniverse,
} from "./templates-zh-cn.js";

/**
 * Authoritative readback for StrategyDraft 2.0.0 (contract §12.6): the frozen
 * 1.0.0 clause templates are reused byte-identically for indicators / entry /
 * exits; three clause groups are added for the four-cell surface — /universe
 * (managed assets), /risk (both stop-loss lines with their meanings) and
 * /allocation (template name and every parameter) — each keeping its astPath
 * back-reference. The 2.0.0 /position clause drops the entry-size clause,
 * whose semantics moved to cell ④ (§12.2 breaking change).
 *
 * The Readback envelope stays at readbackVersion 1.0.0: §12.1 lists only
 * strategy-draft-2 / run-spec-2 / report-2 / sensitivity-report as the 2.0.0
 * family. §12.9 semantic obligations run before any readback is produced — a
 * semantically rejected draft never reaches this generator through the
 * application chain, and the re-check here is the backstop.
 */
export function createAuthoritativeReadback2(
  canonicalAst: string,
  registry: Registry,
  observationKind: ObservationKind = "ohlcv",
): Readback {
  const parsed = parseJsonInput(canonicalAst);
  assertValidStrategyDraft2(parsed);
  const strategy = parsed as StrategyDraft2;
  const semanticIssues = validateStrategySemantics2(strategy, registry, observationKind);
  if (semanticIssues.length > 0) {
    throw new ContractError("INVALID_STRATEGY_SEMANTICS", "Canonical AST failed semantic validation");
  }

  const summary = `组合策略「${strategy.name}」；注册表 ${registry.registryVersion}。`;
  const clauses: Readback["clauses"] = [];
  clauses.push({ astPath: "/universe", text: renderUniverse(strategy.universe.assets) });
  for (const id of Object.keys(strategy.indicators).sort()) {
    const usage = strategy.indicators[id]!;
    const definition = registry.indicators.get(usage.use)!;
    clauses.push({
      astPath: `/indicators/${id}`,
      text: renderIndicator(id, definition, usage.params ?? {}),
    });
  }
  clauses.push({ astPath: "/entry", text: `入场条件：${renderReadbackBool(strategy.entry)}。` });
  strategy.exits.forEach((expression, index) => {
    clauses.push({ astPath: `/exits/${index}`, text: `出场规则 ${index + 1}：${renderReadbackBool(expression)}。` });
  });
  clauses.push({
    astPath: "/risk/positionStopLossFraction",
    text: renderPositionStopLoss(strategy.risk.positionStopLossFraction),
  });
  clauses.push({
    astPath: "/risk/portfolioStopFraction",
    text: renderPortfolioStop(strategy.risk.portfolioStopFraction),
  });
  clauses.push({ astPath: "/allocation", text: renderAllocation(strategy.allocation) });
  clauses.push({
    astPath: "/position",
    text: renderPosition2(strategy.position.exitSize.positionFraction),
  });
  return {
    readbackVersion: "1.0.0",
    locale: "zh-CN",
    registryVersion: registry.registryVersion,
    canonicalizationVersion: "canonicalization@1",
    strategyDigest: digestCanonical(canonicalAst),
    summary,
    clauses,
    text: [summary, ...clauses.map((clause) => clause.text)].join("\n"),
  };
}
