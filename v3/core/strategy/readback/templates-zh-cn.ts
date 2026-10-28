import type { IndicatorDefinition } from "../registry/types.js";
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
