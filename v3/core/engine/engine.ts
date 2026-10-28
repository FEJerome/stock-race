import type Decimal from "decimal.js";
import type { Report, RunEvent } from "../market/types.js";
import { digestSnapshot } from "../market/snapshot.js";
import { normalizeRunSpec } from "../market/run-spec.js";
import { validateDataSnapshot, validateRunSpec } from "../market/contract-validators.js";
import { ContractError } from "../strategy/canonical/errors.js";
import { digestJson } from "../strategy/canonical/digest.js";
import { digestStrategyDraft } from "../strategy/canonical/strategy-canonical.js";
import {
  InternalDecimal,
  formatFinancialMoney,
  internalAdd,
  internalDivide,
  internalMultiply,
  internalSubtract,
} from "../strategy/canonical/rounding-profile.js";
import { checkWarmup } from "../strategy/evaluation/warmup.js";
import { evaluateStrategy } from "../strategy/evaluation/evaluate.js";
import { createRegistryV1 } from "../strategy/registry/v1.js";
import type { Observation, Series } from "../strategy/registry/types.js";
import { buildStockReport } from "../report/report.js";
import { calculateFees, maxAffordableBuyQuantity, validateSellQuantity, CN_STOCK_FEE_PROFILE } from "./profiles.js";
import type { FillRecord, OrderRecord, Simulation, StockRunInput, StockRunResult } from "./types.js";

const GENESIS_HASH = `sha256:${"0".repeat(64)}`;

class EventLedger {
  readonly events: RunEvent[] = [];
  constructor(private readonly runDigest: string) {}

  add(date: string, phase: RunEvent["phase"], type: RunEvent["type"], reasonCodes: string[], payload: unknown, inputRefs: RunEvent["inputRefs"] = { system: "no-external-input" }): void {
    const previousEventHash = this.events.at(-1)?.eventHash ?? GENESIS_HASH;
    const base = {
      eventVersion: "1.0.0" as const,
      runDigest: this.runDigest,
      seq: this.events.length,
      tradingDate: date,
      phase,
      type,
      reasonCodes,
      inputRefs,
      payload,
      previousEventHash,
    };
    this.events.push({ ...base, eventHash: digestJson(base) });
  }
}

interface PositionLot {
  originalQuantity: number;
  remaining: number;
  availableIndex: number;
  entryPrice: string;
}

interface PendingIntent {
  intentId: string;
  side: "buy" | "sell";
  quantity: number;
  cashFraction: string;
}

interface DividendClaim {
  amount: string;
  payDate: string;
}

function money(value: Decimal | string): string {
  return formatFinancialMoney(value);
}

function simulate(input: StockRunInput, runDigest: string, ledger: EventLedger, buyHold: boolean): Simulation {
  const { snapshot, runSpec, strategy } = input;
  const registry = createRegistryV1();
  const sessions = snapshot.sessions;
  const rangeIndices = sessions.map((session, index) => ({ session, index }))
    .filter(({ session }) => session.date >= runSpec.data.start && session.date <= runSpec.data.end)
    .map(({ index }) => index);
  if (rangeIndices.length === 0) throw new ContractError("EMPTY_RUN_RANGE", "No sessions in requested range");

  const availableStart = new InternalDecimal(runSpec.account.initialCash);
  let available = availableStart;
  let reserved = new InternalDecimal(0);
  let unsettled = new InternalDecimal(0);
  let receivable = new InternalDecimal(0);
  let reservedPosition = 0;
  const buyHoldStartIndex = buyHold && rangeIndices.length > 1 ? rangeIndices[1]! : -1;
  let pending: PendingIntent | null = null;
  let nextIntentId = 1;
  const buyIndices: number[] = [];
  const entryPriceByDate = new Map<string, string>();
  let lastEntryPrice = "0.00";
  let lastClose = "0.00";
  const lots: PositionLot[] = [];
  const claims: DividendClaim[] = [];
  const recordedPositions = new Map<string, number>();
  const daily: Report["daily"] = [];
  const fills: FillRecord[] = [];
  const orders: OrderRecord[] = [];
  const rejections: OrderRecord[] = [];
  const fees = { commission: "0.00", transferFee: "0.00", stampDuty: "0.00", total: "0.00" };
  const equitySeries = [money(availableStart)];

  const totalPosition = () => lots.reduce((sum, lot) => sum + lot.remaining, 0);
  const sellableAt = (index: number) => lots.filter((lot) => lot.availableIndex <= index)
    .reduce((sum, lot) => sum + lot.remaining, -reservedPosition);
  const cashTotal = () => money(internalAdd(internalAdd(available, reserved), internalAdd(unsettled, receivable)));
  const cashSnapshot = (): Report["cash"] => ({
    available: money(available), reserved: money(reserved), unsettled: money(unsettled), receivable: money(receivable), total: cashTotal(),
  });
  const positionSnapshot = (index: number): Report["position"] => ({
    total: String(totalPosition()),
    sellable: String(Math.max(0, sellableAt(index))),
    reserved: String(reservedPosition),
    unsettled: String(totalPosition() - Math.max(0, sellableAt(index)) - reservedPosition),
  });
  const equityAt = (close: string) => money(internalAdd(cashTotal(), internalMultiply(close, String(totalPosition()))));
  const addFees = (breakdown: ReturnType<typeof calculateFees>) => {
    fees.commission = money(internalAdd(fees.commission, breakdown.commission));
    fees.transferFee = money(internalAdd(fees.transferFee, breakdown.transferFee));
    fees.stampDuty = money(internalAdd(fees.stampDuty, breakdown.stampDuty));
    fees.total = money(internalAdd(fees.total, breakdown.total));
  };
  const reject = (date: string, side: "buy" | "sell", quantity: number, reason: string, intentId?: string) => {
    const record = { date, side, quantity: String(quantity), status: "rejected" as const, reason };
    orders.push(record);
    rejections.push(record);
    ledger.add(date, "open-execution", "OrderRejected", [reason], record, intentId ? { intent: intentId } : { system: "no-external-input" });
  };

  for (const index of rangeIndices) {
    const session = sessions[index]!;
    const date = session.date;
    ledger.add(date, "session-open", "SessionOpened", [session.status.toUpperCase()], { index }, { bar: date, snapshot: snapshot.digest });
    if (session.status === "missing") {
      throw new ContractError("MISSING_MARKET_DATA", `Unknown missing market data at ${date}`, `/sessions/${index}`);
    }

    if (unsettled.gt(0)) {
      const amount = money(unsettled);
      available = internalAdd(available, unsettled);
      unsettled = new InternalDecimal(0);
      ledger.add(date, "session-open", "CashChanged", ["SELL_PROCEEDS_SETTLED"], { amount });
    }
    for (const lot of lots.filter((item) => item.availableIndex === index)) {
      ledger.add(date, "session-open", "PositionChanged", ["POSITION_SELLABLE"], { quantity: String(lot.remaining) });
    }

    for (const action of snapshot.corporateActions.filter((item) => item.exDate === date)) {
      const base = recordedPositions.get(action.recordDate);
      if (base === undefined) throw new ContractError("MISSING_CORPORATE_ACTION_BASE", `No record-date position for ${action.type}`);
      if (action.type === "cashDividend") {
        const amount = money(internalMultiply(String(base), action.cashPerShare));
        receivable = internalAdd(receivable, amount);
        claims.push({ amount, payDate: action.payDate });
        ledger.add(date, "session-open", "CorporateActionApplied", ["DIVIDEND_RECEIVABLE"], { quantity: String(base), amount });
      } else {
        const rawQuantity = internalDivide(internalMultiply(String(base), String(action.ratioNumerator)), String(action.ratioDenominator));
        if (!rawQuantity.isInteger()) throw new ContractError("FRACTIONAL_BONUS_QUANTITY", "Bonus quantity is not an integer");
        const quantity = rawQuantity.toNumber();
        const listingIndex = sessions.findIndex((item) => item.date === action.listingDate);
        if (listingIndex < 0) throw new ContractError("MISSING_BONUS_LISTING_DATE", "Bonus listing session is missing");
        lots.push({ originalQuantity: quantity, remaining: quantity, availableIndex: listingIndex, entryPrice: "0.00" });
        ledger.add(date, "session-open", "CorporateActionApplied", ["BONUS_POSITION"], { quantity: String(quantity), listingDate: action.listingDate });
      }
    }
    for (const claim of [...claims].filter((item) => item.payDate === date)) {
      available = internalAdd(available, claim.amount);
      receivable = internalSubtract(receivable, claim.amount);
      claims.splice(claims.indexOf(claim), 1);
      ledger.add(date, "session-open", "CashChanged", ["DIVIDEND_PAID"], { amount: claim.amount });
    }

    if (buyHold && index === buyHoldStartIndex) {
      pending = { intentId: "intent-buyhold", side: "buy", quantity: 0, cashFraction: "1.00" };
    }
    if (pending && session.status !== "trading") {
      if (pending.side === "buy") {
        available = internalAdd(available, reserved);
        reserved = new InternalDecimal(0);
      } else {
        reservedPosition = 0;
      }
      reject(date, pending.side, pending.quantity, "SUSPENDED", pending.intentId);
      pending = null;
    }

    if (pending && session.status === "trading" && session.bar) {
      const activeIntent = pending;
      const bar = session.bar;
      if (pending.side === "buy") {
        const released = money(reserved);
        if (reserved.gt(0)) {
          available = internalAdd(available, reserved);
          reserved = new InternalDecimal(0);
          ledger.add(date, "session-open", "CashChanged", ["RESERVE_RELEASED"], { amount: released });
        }
        const price = money(internalAdd(bar.open, CN_STOCK_FEE_PROFILE.tick));
        const budget = money(internalMultiply(available, activeIntent.cashFraction));
        const quantity = maxAffordableBuyQuantity(budget, price, date);
        if (quantity === 0) {
          reject(date, "buy", 0, "INSUFFICIENT_CASH", activeIntent.intentId);
        } else {
          const breakdown = calculateFees(price, quantity, "buy", date);
          const cost = money(internalAdd(breakdown.amount, breakdown.total));
          available = internalSubtract(available, cost);
          if (available.lt(0)) throw new ContractError("CASH_CONSERVATION", "Negative available cash");
          lots.push({ originalQuantity: quantity, remaining: quantity, availableIndex: index + 1, entryPrice: price });
          buyIndices.push(index);
          lastEntryPrice = price;
          const fill: FillRecord = {
            date, side: "buy", price, quantity: String(quantity), amount: breakdown.amount,
            commission: breakdown.commission, transferFee: breakdown.transferFee,
            stampDuty: breakdown.stampDuty, fees: breakdown.total, cashDelta: money(new InternalDecimal(cost).neg()),
          };
          fills.push(fill);
          orders.push({ date, side: "buy", quantity: String(quantity), status: "filled", reason: null });
          addFees(breakdown);
          const fillRef = { intent: activeIntent.intentId, fill: `fill-${fills.length}`, bar: date };
          const sizeAdjusted = quantity !== activeIntent.quantity;
          ledger.add(date, "open-execution", "OrderFilled", sizeAdjusted ? ["BUY", "ORDER_SIZE_ADJUSTED"] : ["BUY"], {
            ...fill,
            intentQuantity: String(activeIntent.quantity),
            quantityReason: sizeAdjusted ? "OPEN_PRICE_OR_AVAILABLE_CASH_CHANGED" : null,
          }, fillRef);
          ledger.add(date, "open-execution", "CashChanged", ["BUY_COST"], { amount: money(new InternalDecimal(cost).neg()) }, fillRef);
          ledger.add(date, "open-execution", "PositionChanged", ["BUY_UNSETTLED"], { quantity: String(quantity) }, fillRef);
        }
      } else {
        const quantity = activeIntent.quantity;
        const price = money(internalSubtract(bar.open, CN_STOCK_FEE_PROFILE.tick));
        if (new InternalDecimal(price).lte(0) || !validateSellQuantity(quantity, sellableAt(index) + reservedPosition)) {
          reservedPosition = 0;
          reject(date, "sell", quantity, new InternalDecimal(price).lte(0) ? "NON_POSITIVE_PRICE" : "ODD_LOT_NOT_FULL_REMAINDER", activeIntent.intentId);
        } else {
          const breakdown = calculateFees(price, quantity, "sell", date);
          const proceeds = money(internalSubtract(breakdown.amount, breakdown.total));
          reservedPosition -= quantity;
          let remaining = quantity;
          for (const lot of lots) {
            if (remaining === 0) break;
            if (lot.availableIndex > index || lot.remaining === 0) continue;
            const matched = Math.min(lot.remaining, remaining);
            lot.remaining -= matched;
            remaining -= matched;
          }
          if (remaining !== 0) throw new ContractError("POSITION_CONSERVATION", "Sell quantity exceeds position");
          unsettled = internalAdd(unsettled, proceeds);
          const fill: FillRecord = {
            date, side: "sell", price, quantity: String(quantity), amount: breakdown.amount,
            commission: breakdown.commission, transferFee: breakdown.transferFee,
            stampDuty: breakdown.stampDuty, fees: breakdown.total, cashDelta: proceeds,
          };
          fills.push(fill);
          orders.push({ date, side: "sell", quantity: String(quantity), status: "filled", reason: null });
          addFees(breakdown);
          const fillRef = { intent: activeIntent.intentId, fill: `fill-${fills.length}`, bar: date };
          ledger.add(date, "open-execution", "OrderFilled", ["SELL"], fill, fillRef);
          ledger.add(date, "open-execution", "CashChanged", ["SELL_UNSETTLED"], { amount: proceeds }, fillRef);
          ledger.add(date, "open-execution", "PositionChanged", ["SELL_FILLED"], { quantity: String(quantity) }, fillRef);
        }
      }
      pending = null;
    }

    if (session.status === "suspended") {
      ledger.add(date, "close", "MarkToMarket", ["STALE"], { close: lastClose, equity: equityAt(lastClose) });
      daily.push({ date, equity: equityAt(lastClose), drawdown: "0.000000000000", cash: cashSnapshot(), position: positionSnapshot(index) });
      equitySeries.push(equityAt(lastClose));
      continue;
    }
    const bar = session.bar;
    if (!bar) throw new ContractError("MISSING_MARKET_DATA", `Trading session has no bar at ${date}`);
    lastClose = bar.close;
    recordedPositions.set(date, totalPosition());
    entryPriceByDate.set(date, lastEntryPrice);

    if (!buyHold) {
      const history = sessions.slice(0, index + 1).filter((item) => item.status === "trading" && item.bar).map((item) => {
        const source = item.bar!;
        const observation: Observation = {
          ...source,
          open: source.signalOpen ?? source.open,
          high: source.signalHigh ?? source.high,
          low: source.signalLow ?? source.low,
          close: source.signalClose ?? source.close,
        };
        return observation;
      });
      const dailyAt = (date: string) => {
        for (let cursor = daily.length - 1; cursor >= 0; cursor -= 1) {
          if (daily[cursor]!.date <= date) return daily[cursor];
        }
        return undefined;
      };
      const barsHeld = history.map((observation) => {
        const date = observation.date!;
        const buyIndex = buyIndices.filter((candidate) => sessions[candidate]!.date <= date).at(-1);
        if (buyIndex === undefined) return new InternalDecimal(0);
        const buyDate = sessions[buyIndex]!.date;
        const held = history.filter((candidate) => candidate.date! > buyDate && candidate.date! <= date).length;
        return new InternalDecimal(held);
      });
      const contextRefs: Record<string, Series> = {
        "position.barsHeld": barsHeld,
        "position.state": history.map((observation) => {
          const quantity = observation.date === date
            ? totalPosition()
            : Number(dailyAt(observation.date!)?.position.total ?? "0");
          return new InternalDecimal(quantity > 0 ? 1 : 0);
        }),
        "position.quantity": history.map((observation) => new InternalDecimal(
          observation.date === date ? String(totalPosition()) : dailyAt(observation.date!)?.position.total ?? "0",
        )),
        "position.entryPrice": history.map((observation) => new InternalDecimal(entryPriceByDate.get(observation.date!) ?? "0.00")),
        "account.availableCash": history.map((observation) => new InternalDecimal(
          observation.date === date ? money(available) : dailyAt(observation.date!)?.cash.available ?? runSpec.account.initialCash,
        )),
      };
      const evaluation = evaluateStrategy(strategy, registry, {
        observationKind: "ohlcv",
        observations: history,
        contextRefs,
      });
      const current = history.length - 1;
      const entry = evaluation.entry[current]!;
      const exit = evaluation.exits.some((series) => series[current] === true);
      ledger.add(date, "close", "SignalEvaluated", [entry === true ? "ENTRY_TRUE" : exit ? "EXIT_TRUE" : "NO_SIGNAL"], { entry, exit }, { bar: date, snapshot: snapshot.digest, strategyPath: "/entry" });

      if (index !== rangeIndices.at(-1)) {
        if (totalPosition() === 0 && entry === true) {
          const fraction = strategy.position.entrySize.cashFraction;
          const estimate = money(internalAdd(bar.close, CN_STOCK_FEE_PROFILE.tick));
          const budget = money(internalMultiply(available, fraction));
          const quantity = maxAffordableBuyQuantity(budget, estimate, sessions[rangeIndices[rangeIndices.indexOf(index) + 1]!]!.date);
          if (quantity === 0) {
            reject(date, "buy", 0, "INSUFFICIENT_CASH");
          } else {
            const estimateFees = calculateFees(estimate, quantity, "buy", sessions[rangeIndices[rangeIndices.indexOf(index) + 1]!]!.date);
            const cost = money(internalAdd(estimateFees.amount, estimateFees.total));
            available = internalSubtract(available, cost);
            reserved = internalAdd(reserved, cost);
            pending = { intentId: `intent-${nextIntentId++}`, side: "buy", quantity, cashFraction: fraction };
            const intentId = pending.intentId;
            const order = { intentId, date, side: "buy" as const, quantity: String(quantity), status: "created" as const, reason: null };
            orders.push(order);
            ledger.add(date, "close", "OrderIntentCreated", ["BUY_NEXT_SESSION"], { ...order, estimatedPrice: estimate, estimatedBudget: budget }, { intent: intentId, bar: date, strategyPath: "/entry" });
            ledger.add(date, "close", "CashChanged", ["BUY_RESERVED"], { amount: cost }, { intent: intentId, bar: date });
          }
        } else if (totalPosition() > 0 && exit) {
          const settledSellable = Math.max(0, sellableAt(index));
          const nextSessionPurchases = lots.filter((lot) => lot.availableIndex === index + 1 && lot.entryPrice !== "0.00")
            .reduce((sum, lot) => sum + lot.remaining, 0);
          const sellable = settledSellable + nextSessionPurchases;
          const quantity = new InternalDecimal(sellable).mul(strategy.position.exitSize.positionFraction).floor().toNumber();
          if (!validateSellQuantity(quantity, sellable)) {
            reject(date, "sell", quantity, "ODD_LOT_NOT_FULL_REMAINDER");
          } else {
            reservedPosition = quantity;
            pending = { intentId: `intent-${nextIntentId++}`, side: "sell", quantity, cashFraction: "1.00" };
            const intentId = pending.intentId;
            const order = { intentId, date, side: "sell" as const, quantity: String(quantity), status: "created" as const, reason: null };
            orders.push(order);
            ledger.add(date, "close", "OrderIntentCreated", ["SELL_NEXT_SESSION"], { ...order, referencePrice: bar.close, sellableQuantity: String(sellable) }, { intent: intentId, bar: date, strategyPath: "/exits/0" });
            ledger.add(date, "close", "PositionChanged", ["SELL_RESERVED"], { quantity: String(quantity) }, { intent: intentId, bar: date });
          }
        }
      }
    }
    ledger.add(date, "close", "MarkToMarket", [], { close: lastClose, equity: equityAt(lastClose) });
    daily.push({ date, equity: equityAt(lastClose), drawdown: "0.000000000000", cash: cashSnapshot(), position: positionSnapshot(index) });
    equitySeries.push(equityAt(lastClose));
  }

  return {
    daily,
    fills,
    orders,
    rejections,
    fees,
    cash: daily.at(-1)?.cash ?? cashSnapshot(),
    position: daily.at(-1)?.position ?? positionSnapshot(rangeIndices.at(-1)!),
    finalEquity: daily.at(-1)?.equity ?? money(availableStart),
    equitySeries,
  };
}

function failure(runDigest: string, ledger: EventLedger, error: ContractError): StockRunResult {
  const date = ledger.events.at(-1)?.tradingDate ?? "1970-01-01";
  ledger.add(date, "run-end", "RunFailed", [error.code], { code: error.code, path: error.path, message: error.message });
  return { ok: false, runDigest, events: ledger.events, error: { code: error.code, message: error.message, path: error.path } };
}

export function executeStockRun(originalInput: StockRunInput): StockRunResult {
  let runDigest = digestJson(originalInput.runSpec);
  let ledger = new EventLedger(runDigest);
  try {
    const input = { ...originalInput, runSpec: normalizeRunSpec(originalInput.runSpec) };
    runDigest = digestJson(input.runSpec);
    ledger = new EventLedger(runDigest);
    const specIssues = validateRunSpec(input.runSpec);
    if (specIssues.length > 0) throw new ContractError(specIssues[0]!.code, specIssues[0]!.message, specIssues[0]!.path);
    const snapshotIssues = validateDataSnapshot(input.snapshot);
    if (snapshotIssues.length > 0) throw new ContractError(snapshotIssues[0]!.code, snapshotIssues[0]!.message, snapshotIssues[0]!.path);
    const initialCash = input.runSpec.account.initialCash;
    if (new InternalDecimal(initialCash).lt(1000) || new InternalDecimal(initialCash).gt(100000000)) {
      throw new ContractError("INVALID_INITIAL_CASH", "Initial cash must be between 1000 and 100000000 CNY", "/account/initialCash");
    }
    if (input.snapshot.digest !== digestSnapshot(input.snapshot)) throw new ContractError("SNAPSHOT_DIGEST_MISMATCH", "Snapshot digest mismatch");
    if (input.runSpec.data.snapshotDigest !== input.snapshot.digest) throw new ContractError("SNAPSHOT_REFERENCE_MISMATCH", "RunSpec references another snapshot");
    if (input.runSpec.strategy.digest !== digestStrategyDraft(input.strategy)) throw new ContractError("STRATEGY_DIGEST_MISMATCH", "Confirmed strategy digest mismatch");
    if (input.runSpec.asset.assetId !== input.snapshot.assetIdentity.assetId) throw new ContractError("ASSET_MISMATCH", "RunSpec and snapshot assets differ");
    if (input.snapshot.qualityIssues.some((issue) => issue.blocking)) throw new ContractError("BLOCKING_DATA_QUALITY", "Snapshot contains blocking quality issues");
    if (input.runSpec.data.start > input.runSpec.data.end) throw new ContractError("INVALID_RUN_RANGE", "Run start is after end");
    const registry = createRegistryV1();
    const prior = input.snapshot.sessions.filter((session) => session.date < input.runSpec.data.start && session.status === "trading" && session.bar).length;
    checkWarmup(input.strategy, registry, prior, input.runSpec.warmup.extraObservations);

    const main = simulate(input, runDigest, ledger, false);
    const buyHold = simulate(input, runDigest, new EventLedger(runDigest), true);
    ledger.add(input.runSpec.data.end, "run-end", "MetricComputed", [], { finalEquity: main.finalEquity });
    ledger.add(input.runSpec.data.end, "run-end", "RunCompleted", [], { eventCount: ledger.events.length + 1 });
    const report = buildStockReport(input, main, buyHold, ledger.events, runDigest);
    return { ok: true, runDigest, events: ledger.events, report };
  } catch (error) {
    if (error instanceof ContractError) return failure(runDigest, ledger, error);
    throw error;
  }
}
