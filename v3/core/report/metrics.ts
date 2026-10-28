import {
  InternalDecimal,
  formatFinancialRate,
  internalDivide,
  internalSubtract,
} from "../strategy/canonical/rounding-profile.js";

export function calculateMaxDrawdown(equity: readonly string[]): string {
  if (equity.length === 0) return "0.000000000000";
  let peak = new InternalDecimal(equity[0]!);
  let maximum = new InternalDecimal(0);
  for (const value of equity) {
    const current = new InternalDecimal(value);
    if (current.gt(peak)) peak = current;
    if (peak.gt(0)) {
      const drawdown = internalDivide(internalSubtract(peak, current), peak);
      if (drawdown.gt(maximum)) maximum = drawdown;
    }
  }
  return formatFinancialRate(maximum);
}

export function calculateCurrentDrawdown(equity: readonly string[]): string {
  if (equity.length === 0) return "0.000000000000";
  const current = new InternalDecimal(equity.at(-1)!);
  const peak = equity.reduce((value, item) => {
    const candidate = new InternalDecimal(item);
    return candidate.gt(value) ? candidate : value;
  }, new InternalDecimal(equity[0]!));
  return peak.gt(0) ? formatFinancialRate(internalDivide(internalSubtract(peak, current), peak)) : "0.000000000000";
}

export function calculateCumulativeReturn(initialCash: string, finalEquity: string): string {
  return formatFinancialRate(internalSubtract(internalDivide(finalEquity, initialCash), "1"));
}
