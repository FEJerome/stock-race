import { ContractError } from "../strategy/canonical/errors.js";
import {
  InternalDecimal,
  formatFinancialMoney,
  internalAdd,
  internalMultiply,
} from "../strategy/canonical/rounding-profile.js";

export interface FeeBreakdown {
  readonly price: string;
  readonly quantity: string;
  readonly amount: string;
  readonly commission: string;
  readonly transferFee: string;
  readonly stampDuty: string;
  readonly total: string;
}

export const CN_STOCK_FEE_PROFILE = {
  earliestFillDate: "2022-04-29",
  commissionRate: "0.00025",
  minimumCommission: "5.00",
  transferRate: "0.00001",
  stampDutyBefore: "0.001",
  stampDutyFrom: "0.0005",
  stampDutyChangeDate: "2023-08-28",
  tick: "0.01",
  lotSize: 100,
} as const;

export function calculateFees(price: string, quantity: number, side: "buy" | "sell", date: string): FeeBreakdown {
  if (date < CN_STOCK_FEE_PROFILE.earliestFillDate) {
    throw new ContractError("UNSUPPORTED_FEE_PERIOD", `Fill date ${date} is before 2022-04-29`);
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || new InternalDecimal(price).lte(0)) {
    throw new ContractError("INVALID_FILL", "Fill price and quantity must be positive");
  }
  const rawAmount = internalMultiply(price, String(quantity));
  const commissionBase = internalMultiply(rawAmount, CN_STOCK_FEE_PROFILE.commissionRate);
  const commission = formatFinancialMoney(commissionBase.gt(CN_STOCK_FEE_PROFILE.minimumCommission) ? commissionBase : CN_STOCK_FEE_PROFILE.minimumCommission);
  const transferFee = formatFinancialMoney(internalMultiply(rawAmount, CN_STOCK_FEE_PROFILE.transferRate));
  const stampDuty = side === "sell"
    ? formatFinancialMoney(internalMultiply(rawAmount, date < CN_STOCK_FEE_PROFILE.stampDutyChangeDate
      ? CN_STOCK_FEE_PROFILE.stampDutyBefore
      : CN_STOCK_FEE_PROFILE.stampDutyFrom))
    : "0.00";
  const total = formatFinancialMoney(internalAdd(internalAdd(commission, transferFee), stampDuty));
  return {
    price,
    quantity: String(quantity),
    amount: formatFinancialMoney(rawAmount),
    commission,
    transferFee,
    stampDuty,
    total,
  };
}

export function maxAffordableBuyQuantity(budget: string, price: string, date: string): number {
  if (date < CN_STOCK_FEE_PROFILE.earliestFillDate) {
    throw new ContractError("UNSUPPORTED_FEE_PERIOD", `Fill date ${date} is before 2022-04-29`);
  }
  const available = new InternalDecimal(budget);
  const unitPrice = new InternalDecimal(price);
  if (available.lte(0) || unitPrice.lte(0)) return 0;
  let quantity = available.div(unitPrice.mul(CN_STOCK_FEE_PROFILE.lotSize)).floor().toNumber() * CN_STOCK_FEE_PROFILE.lotSize;
  while (quantity > 0) {
    const fees = calculateFees(price, quantity, "buy", date);
    if (new InternalDecimal(fees.amount).plus(fees.total).lte(available)) return quantity;
    quantity -= CN_STOCK_FEE_PROFILE.lotSize;
  }
  return 0;
}

export function validateSellQuantity(quantity: number, sellable: number): boolean {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > sellable) return false;
  return quantity % CN_STOCK_FEE_PROFILE.lotSize === 0 || quantity === sellable;
}
