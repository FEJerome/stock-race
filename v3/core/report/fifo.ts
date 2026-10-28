import type { DataSnapshot } from "../market/types.js";
import type { FillRecord } from "../engine/types.js";
import { ContractError } from "../strategy/canonical/errors.js";
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

export function calculateFifoBatchOutcomes(
  fills: readonly FillRecord[],
  corporateActions: DataSnapshot["corporateActions"] = [],
): BatchOutcome[] {
  const timeline = [
    ...fills.map((fill, order) => ({ kind: "fill" as const, date: fill.date, fill, order })),
    ...corporateActions.filter((action) => action.type === "bonusIssue")
      .map((action) => ({ kind: "bonus" as const, date: action.recordDate, action, order: Number.MAX_SAFE_INTEGER })),
  ].sort((left, right) => left.date === right.date ? left.order - right.order : left.date < right.date ? -1 : 1);
  const queue: OpenBatch[] = [];
  const outcomes: BatchOutcome[] = [];

  for (const item of timeline) {
    if (item.kind === "bonus") {
      const batch = queue.find((candidate) => candidate.remaining > 0);
      if (!batch) throw new ContractError("FIFO_BONUS_WITHOUT_OPEN_BATCH", "Bonus has no open cost batch");
      const action = item.action;
      const rawQuantity = internalDivide(
        internalMultiply(String(batch.remaining), String(action.ratioNumerator)),
        String(action.ratioDenominator),
      );
      if (!rawQuantity.isInteger()) throw new ContractError("FRACTIONAL_BONUS_QUANTITY", "Bonus quantity is not an integer");
      const quantity = rawQuantity.toNumber();
      batch.remaining += quantity;
      batch.originalQuantity += quantity;
      continue;
    }

    const fill = item.fill;
    const quantity = Number(fill.quantity);
    if (fill.side === "buy") {
      queue.push({ originalQuantity: quantity, remaining: quantity, cost: formatFinancialMoney(new InternalDecimal(fill.cashDelta).abs()), proceeds: "0.00" });
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
        : new InternalDecimal(formatFinancialMoney(internalMultiply(internalDivide(fill.cashDelta, String(quantity)), String(matched))));
      batch.proceeds = formatFinancialMoney(internalAdd(batch.proceeds, allocation));
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
