import type { IndicatorDefinition } from "../registry/types.js";
import type { EqualSplitAllocation, FcfsAllocation } from "../generated/strategy-draft-2.types.js";
import { internalMultiply } from "../canonical/rounding-profile.js";

export const READBACK_TEMPLATE_VERSION = "1.0.0";

export function displayDecimal(value: string): string {
  const [integer, fraction] = value.split(".");
  if (!fraction) return integer!;
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${integer}.${trimmed}` : integer!;
}

export function displayPercent(value: string): string {
  return displayDecimal(internalMultiply(value, "100").toFixed());
}

export function renderIndicator(id: string, definition: IndicatorDefinition, params: Readonly<Record<string, string | number | boolean>>): string {
  if (definition.use === "macd@1") {
    return `指标 ${id}：MACD(fast=${params.fast}, slow=${params.slow}, signal=${params.signal})。`;
  }
  if (definition.use === "kdj@1") {
    return `指标 ${id}：KDJ(period=${params.period}, kSmooth=${params.kSmooth}, dSmooth=${params.dSmooth})。`;
  }
  return `指标 ${id}：${definition.use}。`;
}

// ── S4 supplement (contract §12.6): additive clause templates for the 2.0.0
// four-cell drafts. Everything above is byte-frozen by the readback-v1 golden;
// the functions below are new and used only by readback-2.ts.

/** Cell ① /universe: managed assets, listed in authored (digest-significant) order. */
export function renderUniverse(assets: readonly string[]): string {
  return `管理范围：共 ${assets.length} 只股票，按此顺序管理：${assets.join("、")}。`;
}

/** Cell ③ /risk/positionStopLossFraction: per-asset stop-loss with its meaning. */
export function renderPositionStopLoss(fraction: string): string {
  return `个股止损：当某只持仓股票的收盘价相对其成本价下跌达到 ${displayPercent(fraction)}% 时，下一交易日开盘强制卖出该股票全部持仓。`;
}

/** Cell ③ /risk/portfolioStopFraction: portfolio stop-loss with its meaning. */
export function renderPortfolioStop(fraction: string): string {
  return `组合止损：当组合总权益相对其历史峰值回撤达到 ${displayPercent(fraction)}% 时，下一交易日开盘卖出全部可卖持仓，此后不再开新仓。`;
}

/** Cell ④ /allocation: scheduling template name plus every parameter. */
export function renderAllocation(allocation: FcfsAllocation | EqualSplitAllocation): string {
  if (allocation.template === "first-come-first-served@1") {
    return `资金调度：先到先得（first-come-first-served@1）；按信号到达顺序从统一资金池拨款，单只股票最多占用统一资金池的 ${displayPercent(allocation.params.maxPerAssetCashFraction)}%，资金池耗尽后不再开新仓。`;
  }
  return `资金调度：均匀分仓（equal-split@1）；最多同时持有 ${allocation.params.maxPositions} 只股票，可用现金在空闲仓位名额内均分。`;
}

/** 2.0.0 /position: no entry size — capital allocation lives in cell ④. */
export function renderPosition2(exitPositionFraction: string): string {
  return `仓位：仅做多，禁止加仓；出场卖出持仓的 ${displayPercent(exitPositionFraction)}%。`;
}
