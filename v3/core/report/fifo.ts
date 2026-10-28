import type { FillRecord } from "../engine/types.js";
import { InternalDecimal, formatFinancialMoney, internalAdd, internalDivide, internalMultiply, internalSubtract } from "../strategy/canonical/rounding-profile.js";

export interface BatchOutcome {
  readonly quantity: string;
  readonly realizedPnl: string;
  readonly winning: boolean;
}

interface OpenBatch {
  originalQuantity: number;
  remaining: number;
  cost: string;
  proceeds: string;
}

export function calculateFifoBatchOutcomes(fills: readonly FillRecord[]): BatchOutcome[] {
  const queue: OpenBatch[] = [];
  const outcomes: BatchOutcome[] = [];
  for (const fill of fills) {
    const quantity = Number(fill.quantity);
    if (fill.side === "buy") {
      queue.push({ originalQuantity: quantity, remaining: quantity, cost: new InternalDecimal(fill.cashDelta).abs().toFixed(2), proceeds: "0.00" });
      continue;
    }
    let sellRemaining = quantity;
    let unallocatedProceeds = new InternalDecimal(fill.cashDelta);
    while (sellRemaining > 0 && queue.length > 0) {
      const batch = queue[0]!;
      const matched = Math.min(batch.remaining, sellRemaining);
      const isLastFragment = matched === sellRemaining;
      const allocation = isLastFragment
        ? unallocatedProceeds
        : new InternalDecimal(internalMultiply(internalDivide(fill.cashDelta, String(quantity)), String(matched)).toFixed(2));
      batch.proceeds = internalAdd(batch.proceeds, allocation).toFixed(2);
      unallocatedProceeds = internalSubtract(unallocatedProceeds, allocation);
      batch.remaining -= matched;
      sellRemaining -= matched;
      if (batch.remaining === 0) {
        const pnl = internalSubtract(batch.proceeds, batch.cost);
        outcomes.push({ quantity: String(batch.originalQuantity), realizedPnl: formatFinancialMoney(pnl), winning: pnl.gt(0) });
        queue.shift();
      }
    }
  }
  return outcomes;
}
