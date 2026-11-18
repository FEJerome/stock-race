import type { BoolExpression, SeriesExpression, StrategyDraft } from "../generated/strategy-draft.types.js";
import type { Readback } from "../generated/readback.types.js";
import { ContractError } from "../canonical/errors.js";
import { digestCanonical } from "../canonical/digest.js";
import { parseJsonInput } from "../validation/json-input.js";
import { assertValidStrategyDraft } from "../validation/schema-validator.js";
import { validateStrategySemantics } from "../validation/semantic-validator.js";
import type { ObservationKind, Registry } from "../registry/types.js";
import { displayDecimal, displayPercent, renderIndicator } from "./templates-zh-cn.js";

function series(expression: SeriesExpression): string {
  if ("const" in expression) return displayDecimal(expression.const);
  if ("ref" in expression) return expression.ref;
  if ("lag" in expression) return `${series(expression.lag.input)} 滞后 ${expression.lag.periods} 个有效观测`;
  if ("registeredSeriesFn" in expression) {
    return `${expression.registeredSeriesFn.use}(${expression.registeredSeriesFn.args.map(series).join(", ")})`;
  }
  for (const [operator, symbol] of [["add", "+"], ["sub", "−"], ["mul", "×"], ["div", "÷"]] as const) {
    if (operator in expression) {
      const pair = (expression as unknown as Record<string, [SeriesExpression, SeriesExpression]>)[operator]!;
      return `（${series(pair[0])} ${symbol} ${series(pair[1])}）`;
    }
  }
  throw new ContractError("UNKNOWN_SERIES_EXPRESSION", "Unknown SeriesExpression in readback");
}

function bool(expression: BoolExpression): string {
  for (const [operator, symbol] of [["gt", ">"], ["gte", ">="], ["lt", "<"], ["lte", "<="], ["eq", "="], ["neq", "≠"]] as const) {
    if (operator in expression) {
      const pair = (expression as unknown as Record<string, [SeriesExpression, SeriesExpression]>)[operator]!;
      return `${series(pair[0])} ${symbol} ${series(pair[1])}`;
    }
  }
  if ("crossAbove" in expression) return `${series(expression.crossAbove[0])} 上穿 ${series(expression.crossAbove[1])}`;
  if ("crossBelow" in expression) return `${series(expression.crossBelow[0])} 下穿 ${series(expression.crossBelow[1])}`;
  if ("all" in expression) {
    return `（${expression.all.map((item) => {
      const rendered = bool(item);
      return ["gt", "gte", "lt", "lte", "eq", "neq"].some((operator) => operator in item)
        ? `（${rendered}）`
        : rendered;
    }).join(" 且 ")}）`;
  }
  if ("any" in expression) return `（${expression.any.map(bool).join(" 或 ")}）`;
  if ("not" in expression) return `非（${bool(expression.not)}）`;
  if ("within" in expression) return `最近 ${expression.within.window} 个有效观测内（${bool(expression.within.condition)}）`;
  throw new ContractError("UNKNOWN_BOOL_EXPRESSION", "Unknown BoolExpression in readback");
}

export function createAuthoritativeReadback(
  canonicalAst: string,
  registry: Registry,
  observationKind: ObservationKind = "ohlcv",
): Readback {
  const parsed = parseJsonInput(canonicalAst);
  assertValidStrategyDraft(parsed);
  const strategy = parsed as StrategyDraft;
  const semanticIssues = validateStrategySemantics(strategy, registry, observationKind);
  if (semanticIssues.length > 0) {
    throw new ContractError("INVALID_STRATEGY_SEMANTICS", "Canonical AST failed semantic validation");
  }

  const summary = `策略「${strategy.name}」；注册表 ${registry.registryVersion}。`;
  const clauses: Readback["clauses"] = [];
  for (const id of Object.keys(strategy.indicators).sort()) {
    const usage = strategy.indicators[id]!;
    const definition = registry.indicators.get(usage.use)!;
    clauses.push({
      astPath: `/indicators/${id}`,
      text: renderIndicator(id, definition, usage.params ?? {}),
    });
  }
  clauses.push({ astPath: "/entry", text: `入场条件：${bool(strategy.entry)}。` });
  strategy.exits.forEach((expression, index) => {
    clauses.push({ astPath: `/exits/${index}`, text: `出场规则 ${index + 1}：${bool(expression)}。` });
  });
  clauses.push({
    astPath: "/position",
    text: `仓位：仅做多，禁止加仓；入场使用可用现金的 ${displayPercent(strategy.position.entrySize.cashFraction)}%，出场使用持仓的 ${displayPercent(strategy.position.exitSize.positionFraction)}%。`,
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

// Additive aliases shared with the 2.0.0 readback (readback-2.ts). Exported under
// explicit names so the core barrel stays unambiguous; the 1.0.0 functions above —
// and every 1.0.0 clause text — are byte-unchanged (readback-v1 golden guard).
export { bool as renderReadbackBool, series as renderReadbackSeries };
