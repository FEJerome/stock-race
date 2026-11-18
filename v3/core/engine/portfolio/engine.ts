import type Decimal from "decimal.js";
import type { DataSnapshot, RunEvent } from "../../market/types.js";
import { digestSnapshot, validateSnapshotValues } from "../../market/snapshot.js";
import { normalizeRunSpec2 } from "../../market/run-spec-2.js";
import { validateDataSnapshot } from "../../market/contract-validators.js";
import { ContractError } from "../../strategy/canonical/errors.js";
import { digestJson } from "../../strategy/canonical/digest.js";
import { digestStrategyDraft2 } from "../../strategy/canonical/strategy-canonical-2.js";
import {
  InternalDecimal,
  formatFinancialMoney,
  formatFinancialRate,
  internalAdd,
  internalDivide,
  internalMultiply,
  internalSubtract,
} from "../../strategy/canonical/rounding-profile.js";
import { checkWarmup, InsufficientWarmupError } from "../../strategy/evaluation/warmup.js";
import { evaluateStrategy } from "../../strategy/evaluation/evaluate.js";
import { createRegistryV1 } from "../../strategy/registry/v1.js";
import type { Observation, Series } from "../../strategy/registry/types.js";
import type { StrategyDraft } from "../../strategy/generated/strategy-draft.types.js";
import type { StrategyDraft2 } from "../../strategy/generated/strategy-draft-2.types.js";
import {
  validateRunSpec2,
  validateStrategyDraft2,
} from "../../strategy/validation/schema-validator-2.js";
import {
  validateRunSpec2Semantics,
  validateStrategySemantics2,
} from "../../strategy/validation/semantic-validator-2.js";
import {
  calculateFees,
  maxAffordableBuyQuantity,
  validateSellQuantity,
  CN_STOCK_FEE_PROFILE,
} from "../profiles.js";
import { buildPortfolioReport, finalizePortfolioReport } from "../../report/report-2.js";
import type {
  PortfolioAssetSummary,
  PortfolioDailyRecord,
  PortfolioFillRecord,
  PortfolioOrderRecord,
  PortfolioRunInput,
  PortfolioRunResult,
  PortfolioSimulation,
} from "./types.js";

/**
 * Constrained-portfolio deterministic engine (contract chapter 12, engineVersion "2.0.0").
 *
 * Coexistence: this module is parallel to ../engine.ts; the 1.0.0 single-asset path is
 * byte-frozen and untouched. Dispatch on runSpecVersion happens at the caller.
 *
 * Pinned trading semantics (plan §3.3 + contract §12.2/§12.5/§12.9):
 * - Unified four-bucket cash pool (available/reserved/unsettled/receivable) shared by all
 *   assets; per-asset lots, pending intents, and signal histories.
 * - Union trading calendar: a day where an asset has no bar (suspended, or no session at
 *   all) contributes no evaluation and no fills for that asset; valuation carries the last
 *   close with an explicit STALE mark (§12.5).
 * - Signal evaluation order within a close: authored `universe.assets` order. This authored
 *   order is the "signal arrival order" for first-come-first-served — it is the semantic
 *   reason §12.2 keeps the universe order digest-significant. Simultaneous signals are
 *   therefore resolved deterministically.
 * - Close-phase order: per-asset signals → per-asset stop-loss check → portfolio stop check
 *   → template budget allocation → next-session intents (sells first, then buys, both in
 *   authored order) → per-asset marks → one portfolio-level MarkToMarket.
 * - Per-asset stop: raw close < last entry price × (1 − positionStopLossFraction) → forced
 *   full exit of that asset at its next open (reason POSITION_STOP_LOSS; re-issued daily
 *   while the condition holds and no sell intent is pending).
 * - Portfolio stop: equity drawdown from the historical peak ≥ portfolioStopFraction →
 *   liquidate all sellable positions at their next opens (reason PORTFOLIO_STOP_LOSS,
 *   re-issued daily until flat) and never open new positions afterwards. The first trigger
 *   is recorded as a MetricComputed event carrying the PORTFOLIO_STOP_LOSS reason code.
 * - first-come-first-served@1: per-candidate budget = min(maxPerAssetCashFraction × cash
 *   pool total at close, available); rejected candidates are recorded and do not block
 *   later candidates; the run stops opening positions when the pool cannot afford a lot.
 * - equal-split@1: per-slot budget = available at allocation start ÷ free slots at
 *   allocation start (free = maxPositions − open positions); candidates beyond the free
 *   slots are rejected with NO_FREE_POSITION_SLOT; an unaffordable candidate is rejected
 *   with INSUFFICIENT_CASH and does not consume a slot.
 * - No intents are created on the last union day of the range (1.0.0 precedent).
 * - Semantic validation (§12.9) runs before the strategy draft is digested; the runDigest
 *   itself is computed up-front for ledger labeling only (1.0.0 precedent).
 */
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
  readonly intentId: string;
  readonly assetId: string;
  readonly side: "buy" | "sell";
  readonly quantity: number;
  /** Close-time committed budget cap (buys only): the template allocates once, at close;
   * execution fills at the actual open price with budget = min(cap, available). */
  readonly budgetCap: Decimal | null;
  readonly reservedCash: string;
  readonly createdSeq: number;
}

interface DividendClaim {
  readonly assetId: string;
  readonly amount: string;
  readonly payDate: string;
}

interface FeeTotals {
  commission: string;
  transferFee: string;
  stampDuty: string;
  total: string;
}

interface AssetState {
  readonly assetId: string;
  readonly snapshot: DataSnapshot;
  readonly sessionIndexByDate: Map<string, number>;
  readonly lots: PositionLot[];
  reservedPosition: number;
  lastEntryPrice: string;
  lastClose: string;
  readonly entryPriceByDate: Map<string, string>;
  readonly buyIndices: number[];
  readonly recordedPositions: Map<string, number>;
  stopLossTriggers: number;
  readonly fills: PortfolioFillRecord[];
  readonly orders: PortfolioOrderRecord[];
  readonly rejections: PortfolioOrderRecord[];
  readonly fees: FeeTotals;
  pending: PendingIntent | null;
  buyHoldAttempted: boolean;
}

function money(value: Decimal | string): string {
  return formatFinancialMoney(value);
}

function zeroFees(): FeeTotals {
  return { commission: "0.00", transferFee: "0.00", stampDuty: "0.00", total: "0.00" };
}

function simulate(input: PortfolioRunInput, runDigest: string, ledger: EventLedger, buyHold: boolean): PortfolioSimulation {
  const { runSpec, strategy } = input;
  const registry = createRegistryV1();
  // Per-asset state in AUTHORED universe order: this order is the evaluation order and the
  // first-come-first-served arrival order (see module docstring).
  const states: AssetState[] = strategy.universe.assets.map((assetId) => {
    const snapshot = input.snapshots.find((candidate) => candidate.assetIdentity.assetId === assetId);
    if (!snapshot) throw new ContractError("ASSET_MISMATCH", `No snapshot provided for universe asset ${assetId}`);
    return {
      assetId,
      snapshot,
      sessionIndexByDate: new Map(snapshot.sessions.map((session, index) => [session.date, index])),
      lots: [],
      reservedPosition: 0,
      lastEntryPrice: "0.00",
      lastClose: "0.00",
      entryPriceByDate: new Map(),
      buyIndices: [],
      recordedPositions: new Map(),
      stopLossTriggers: 0,
      fills: [],
      orders: [],
      rejections: [],
      fees: zeroFees(),
      pending: null,
      buyHoldAttempted: false,
    };
  });

  // Union trading calendar across all snapshots, restricted to the run range.
  const dateSet = new Set<string>();
  for (const state of states) {
    for (const session of state.snapshot.sessions) {
      if (session.date >= runSpec.data.start && session.date <= runSpec.data.end) dateSet.add(session.date);
    }
  }
  const dates = [...dateSet].sort();
  if (dates.length === 0) throw new ContractError("EMPTY_RUN_RANGE", "No sessions in requested range");
  const dateIndex = new Map(dates.map((date, index) => [date, index]));

  const assetCount = states.length;
  const buyHoldCapPerAsset = internalDivide(runSpec.account.initialCash, String(assetCount));

  let available = new InternalDecimal(runSpec.account.initialCash);
  let reserved = new InternalDecimal(0);
  let unsettled = new InternalDecimal(0);
  let receivable = new InternalDecimal(0);
  const claims: DividendClaim[] = [];
  const pendingQueue: PendingIntent[] = [];
  let nextIntentId = 1;
  let nextSeq = 1;
  let portfolioStopActive = false;

  const daily: PortfolioDailyRecord[] = [];
  const equitySeries = [money(available)];

  const totalPosition = (state: AssetState) => state.lots.reduce((sum, lot) => sum + lot.remaining, 0);
  const sessionIndexAt = (state: AssetState, date: string): number => {
    // Latest session index of this asset at or before `date`; -1 when the asset has no
    // session yet. Drives T+1 sellability against the asset's own session list.
    const exact = state.sessionIndexByDate.get(date);
    if (exact !== undefined) return exact;
    let latest = -1;
    for (let index = 0; index < state.snapshot.sessions.length; index += 1) {
      if (state.snapshot.sessions[index]!.date <= date) latest = index;
      else break;
    }
    return latest;
  };
  const sellableAt = (state: AssetState, sessionIndex: number) =>
    state.lots.filter((lot) => lot.availableIndex <= sessionIndex).reduce((sum, lot) => sum + lot.remaining, -state.reservedPosition);
  const intentSellable = (state: AssetState, sessionIndex: number) => {
    // Mirror 1.0.0: settled sellable plus lots maturing at the asset's next session.
    const settled = Math.max(0, sellableAt(state, sessionIndex));
    const maturing = state.lots
      .filter((lot) => lot.availableIndex === sessionIndex + 1 && lot.entryPrice !== "0.00")
      .reduce((sum, lot) => sum + lot.remaining, 0);
    return settled + maturing;
  };
  const cashTotal = () => money(internalAdd(internalAdd(available, reserved), internalAdd(unsettled, receivable)));
  const cashSnapshot = (): PortfolioDailyRecord["cash"] => ({
    available: money(available), reserved: money(reserved), unsettled: money(unsettled), receivable: money(receivable), total: cashTotal(),
  });
  const markPriceOf = (state: AssetState, date: string): string => {
    const sessionIndex = state.sessionIndexByDate.get(date);
    const session = sessionIndex === undefined ? undefined : state.snapshot.sessions[sessionIndex]!;
    return session?.status === "trading" && session.bar ? session.bar.close : state.lastClose;
  };
  const positionValue = (state: AssetState, date: string) =>
    internalMultiply(markPriceOf(state, date), String(totalPosition(state)));
  const equityAt = (date: string) =>
    money(states.reduce((sum, state) => internalAdd(sum, positionValue(state, date)), new InternalDecimal(cashTotal())));
  const addFees = (state: AssetState, breakdown: ReturnType<typeof calculateFees>) => {
    state.fees.commission = money(internalAdd(state.fees.commission, breakdown.commission));
    state.fees.transferFee = money(internalAdd(state.fees.transferFee, breakdown.transferFee));
    state.fees.stampDuty = money(internalAdd(state.fees.stampDuty, breakdown.stampDuty));
    state.fees.total = money(internalAdd(state.fees.total, breakdown.total));
  };
  const reject = (state: AssetState, date: string, side: "buy" | "sell", quantity: number, reason: string, intentId?: string) => {
    const record = { assetId: state.assetId, date, side, quantity: String(quantity), status: "rejected" as const, reason };
    state.orders.push(record);
    state.rejections.push(record);
    ledger.add(date, "open-execution", "OrderRejected", [reason], record,
      intentId ? { intent: intentId, asset: state.assetId } : { asset: state.assetId });
  };

  for (const date of dates) {
    const dayIndex = dateIndex.get(date)!;
    const isLastDay = dayIndex === dates.length - 1;

    // ---- session-open: per-asset session events (authored order) ----
    for (const state of states) {
      const sessionIndex = state.sessionIndexByDate.get(date);
      if (sessionIndex === undefined) continue;
      const session = state.snapshot.sessions[sessionIndex]!;
      ledger.add(date, "session-open", "SessionOpened", [session.status.toUpperCase()], { index: sessionIndex },
        { bar: date, snapshot: state.snapshot.digest, asset: state.assetId });
      if (session.status === "missing") {
        throw new ContractError("MISSING_MARKET_DATA", `Unknown missing market data at ${date}`, `/sessions/${sessionIndex}`);
      }
    }

    if (unsettled.gt(0)) {
      const amount = money(unsettled);
      available = internalAdd(available, unsettled);
      unsettled = new InternalDecimal(0);
      ledger.add(date, "session-open", "CashChanged", ["SELL_PROCEEDS_SETTLED"], { amount });
    }

    for (const state of states) {
      const sessionIndex = state.sessionIndexByDate.get(date);
      if (sessionIndex === undefined) continue;
      for (const lot of state.lots.filter((item) => item.availableIndex === sessionIndex)) {
        ledger.add(date, "session-open", "PositionChanged", ["POSITION_SELLABLE"], { quantity: String(lot.remaining) },
          { asset: state.assetId });
      }
    }

    // ---- session-open: corporate actions per asset (authored order) ----
    // ---- session-open: corporate actions per asset (authored order) ----
    for (const state of states) {
      for (const action of state.snapshot.corporateActions.filter((item) => item.exDate === date)) {
        const base = state.recordedPositions.get(action.recordDate);
        if (base === undefined) throw new ContractError("MISSING_CORPORATE_ACTION_BASE", `No record-date position for ${action.type}`);
        const inputRefs = {
          snapshot: state.snapshot.digest,
          corporateAction: action.type,
          recordDate: action.recordDate,
          exDate: action.exDate,
          asset: state.assetId,
        };
        if (base === 0) {
          ledger.add(date, "session-open", "CorporateActionApplied", ["ZERO_BASE"], { quantity: "0" }, inputRefs);
          continue;
        }
        if (action.type === "cashDividend") {
          const amount = money(internalMultiply(String(base), action.cashPerShare));
          receivable = internalAdd(receivable, amount);
          claims.push({ assetId: state.assetId, amount, payDate: action.payDate });
          ledger.add(date, "session-open", "CorporateActionApplied", ["DIVIDEND_RECEIVABLE"], { quantity: String(base), amount }, inputRefs);
        } else {
          const rawQuantity = internalDivide(internalMultiply(String(base), String(action.ratioNumerator)), String(action.ratioDenominator));
          if (!rawQuantity.isInteger()) throw new ContractError("FRACTIONAL_BONUS_QUANTITY", "Bonus quantity is not an integer");
          const quantity = rawQuantity.toNumber();
          const listingIndex = state.snapshot.sessions.findIndex((item) => item.date === action.listingDate);
          if (listingIndex < 0) throw new ContractError("MISSING_BONUS_LISTING_DATE", "Bonus listing session is missing");
          state.lots.push({ originalQuantity: quantity, remaining: quantity, availableIndex: listingIndex, entryPrice: "0.00" });
          ledger.add(date, "session-open", "CorporateActionApplied", ["BONUS_POSITION"], { quantity: String(quantity), listingDate: action.listingDate }, inputRefs);
        }
      }
    }

    for (const claim of [...claims].filter((item) => item.payDate === date)) {
      available = internalAdd(available, claim.amount);
      receivable = internalSubtract(receivable, claim.amount);
      claims.splice(claims.indexOf(claim), 1);
      ledger.add(date, "session-open", "CashChanged", ["DIVIDEND_PAID"], { amount: claim.amount }, {
        asset: claim.assetId,
        corporateAction: "cashDividend",
        receivable: claim.amount,
      });
    }

    // ---- open-execution: buy-and-hold seeding (first eligible trading day per asset) ----
    if (buyHold) {
      for (const state of states) {
        if (state.buyHoldAttempted || dayIndex === 0) continue;
        const sessionIndex = state.sessionIndexByDate.get(date);
        if (sessionIndex === undefined) continue;
        const session = state.snapshot.sessions[sessionIndex]!;
        if (session.status !== "trading" || !session.bar) continue;
        state.buyHoldAttempted = true;
        const bar = session.bar;
        const price = money(internalAdd(bar.open, CN_STOCK_FEE_PROFILE.tick));
        const budget = money(InternalDecimal.min(buyHoldCapPerAsset, available));
        const quantity = maxAffordableBuyQuantity(budget, price, date);
        const intentId = `intent-buyhold-${state.assetId}`;
        if (quantity === 0) {
          reject(state, date, "buy", 0, "INSUFFICIENT_CASH", intentId);
          continue;
        }
        const breakdown = calculateFees(price, quantity, "buy", date);
        const cost = money(internalAdd(breakdown.amount, breakdown.total));
        available = internalSubtract(available, cost);
        if (available.lt(0)) throw new ContractError("CASH_CONSERVATION", "Negative available cash");
        state.lots.push({ originalQuantity: quantity, remaining: quantity, availableIndex: sessionIndex + 1, entryPrice: price });
        state.buyIndices.push(sessionIndex);
        state.lastEntryPrice = price;
        const fill: PortfolioFillRecord = {
          assetId: state.assetId, date, side: "buy", price, quantity: String(quantity), amount: breakdown.amount,
          commission: breakdown.commission, transferFee: breakdown.transferFee,
          stampDuty: breakdown.stampDuty, fees: breakdown.total, cashDelta: money(new InternalDecimal(cost).neg()),
        };
        state.fills.push(fill);
        state.orders.push({ assetId: state.assetId, date, side: "buy", quantity: String(quantity), status: "filled", reason: null });
        addFees(state, breakdown);
        const fillRef = { intent: intentId, fill: `fill-${state.fills.length}`, bar: date, asset: state.assetId };
        ledger.add(date, "open-execution", "OrderFilled", ["BUY"], fill, fillRef);
        ledger.add(date, "open-execution", "CashChanged", ["BUY_COST"], { amount: money(new InternalDecimal(cost).neg()) }, fillRef);
        ledger.add(date, "open-execution", "PositionChanged", ["BUY_UNSETTLED"], { quantity: String(quantity) }, fillRef);
      }
    }

    // ---- open-execution: pending intents in creation order ----
    for (const intent of [...pendingQueue]) {
      const state = states.find((candidate) => candidate.assetId === intent.assetId)!;
      const sessionIndex = state.sessionIndexByDate.get(date);
      if (sessionIndex === undefined) continue; // no session today: the intent carries forward
      const session = state.snapshot.sessions[sessionIndex]!;
      if (session.status !== "trading" || !session.bar) {
        if (intent.side === "buy") {
          available = internalAdd(available, intent.reservedCash);
          reserved = internalSubtract(reserved, intent.reservedCash);
        } else {
          state.reservedPosition = 0;
        }
        reject(state, date, intent.side, intent.quantity, "SUSPENDED", intent.intentId);
        state.pending = null;
        pendingQueue.splice(pendingQueue.indexOf(intent), 1);
        continue;
      }
      const bar = session.bar;
      if (intent.side === "buy") {
        if (new InternalDecimal(intent.reservedCash).gt(0)) {
          available = internalAdd(available, intent.reservedCash);
          reserved = internalSubtract(reserved, intent.reservedCash);
          ledger.add(date, "session-open", "CashChanged", ["RESERVE_RELEASED"], { amount: intent.reservedCash },
            { intent: intent.intentId, asset: state.assetId });
        }
        const price = money(internalAdd(bar.open, CN_STOCK_FEE_PROFILE.tick));
        const cap = intent.budgetCap ?? new InternalDecimal(cashTotal());
        const budget = money(InternalDecimal.min(cap, available));
        const quantity = maxAffordableBuyQuantity(budget, price, date);
        if (quantity === 0) {
          reject(state, date, "buy", 0, "INSUFFICIENT_CASH", intent.intentId);
        } else {
          const breakdown = calculateFees(price, quantity, "buy", date);
          const cost = money(internalAdd(breakdown.amount, breakdown.total));
          available = internalSubtract(available, cost);
          if (available.lt(0)) throw new ContractError("CASH_CONSERVATION", "Negative available cash");
          state.lots.push({ originalQuantity: quantity, remaining: quantity, availableIndex: sessionIndex + 1, entryPrice: price });
          state.buyIndices.push(sessionIndex);
          state.lastEntryPrice = price;
          const fill: PortfolioFillRecord = {
            assetId: state.assetId, date, side: "buy", price, quantity: String(quantity), amount: breakdown.amount,
            commission: breakdown.commission, transferFee: breakdown.transferFee,
            stampDuty: breakdown.stampDuty, fees: breakdown.total, cashDelta: money(new InternalDecimal(cost).neg()),
          };
          state.fills.push(fill);
          state.orders.push({ assetId: state.assetId, date, side: "buy", quantity: String(quantity), status: "filled", reason: null });
          addFees(state, breakdown);
          const fillRef = { intent: intent.intentId, fill: `fill-${state.fills.length}`, bar: date, asset: state.assetId };
          const sizeAdjusted = quantity !== intent.quantity;
          ledger.add(date, "open-execution", "OrderFilled", sizeAdjusted ? ["BUY", "ORDER_SIZE_ADJUSTED"] : ["BUY"], {
            ...fill,
            intentQuantity: String(intent.quantity),
            quantityReason: sizeAdjusted ? "OPEN_PRICE_OR_AVAILABLE_CASH_CHANGED" : null,
          }, fillRef);
          ledger.add(date, "open-execution", "CashChanged", ["BUY_COST"], { amount: money(new InternalDecimal(cost).neg()) }, fillRef);
          ledger.add(date, "open-execution", "PositionChanged", ["BUY_UNSETTLED"], { quantity: String(quantity) }, fillRef);
        }
      } else {
        const quantity = intent.quantity;
        const price = money(internalSubtract(bar.open, CN_STOCK_FEE_PROFILE.tick));
        if (new InternalDecimal(price).lte(0) || !validateSellQuantity(quantity, sellableAt(state, sessionIndex) + state.reservedPosition)) {
          state.reservedPosition = 0;
          reject(state, date, "sell", quantity, new InternalDecimal(price).lte(0) ? "NON_POSITIVE_PRICE" : "ODD_LOT_NOT_FULL_REMAINDER", intent.intentId);
        } else {
          const breakdown = calculateFees(price, quantity, "sell", date);
          const proceeds = money(internalSubtract(breakdown.amount, breakdown.total));
          state.reservedPosition -= quantity;
          let remaining = quantity;
          for (const lot of state.lots) {
            if (remaining === 0) break;
            if (lot.availableIndex > sessionIndex || lot.remaining === 0) continue;
            const matched = Math.min(lot.remaining, remaining);
            lot.remaining -= matched;
            remaining -= matched;
          }
          if (remaining !== 0) throw new ContractError("POSITION_CONSERVATION", "Sell quantity exceeds position");
          unsettled = internalAdd(unsettled, proceeds);
          const fill: PortfolioFillRecord = {
            assetId: state.assetId, date, side: "sell", price, quantity: String(quantity), amount: breakdown.amount,
            commission: breakdown.commission, transferFee: breakdown.transferFee,
            stampDuty: breakdown.stampDuty, fees: breakdown.total, cashDelta: proceeds,
          };
          state.fills.push(fill);
          state.orders.push({ assetId: state.assetId, date, side: "sell", quantity: String(quantity), status: "filled", reason: null });
          addFees(state, breakdown);
          const fillRef = { intent: intent.intentId, fill: `fill-${state.fills.length}`, bar: date, asset: state.assetId };
          ledger.add(date, "open-execution", "OrderFilled", ["SELL"], fill, fillRef);
          ledger.add(date, "open-execution", "CashChanged", ["SELL_UNSETTLED"], { amount: proceeds }, fillRef);
          ledger.add(date, "open-execution", "PositionChanged", ["SELL_FILLED"], { quantity: String(quantity) }, fillRef);
        }
      }
      state.pending = null;
      pendingQueue.splice(pendingQueue.indexOf(intent), 1);
    }

    // ---- close: per-asset signal evaluation (authored order) ----
    interface CloseFlags {
      state: AssetState;
      sessionIndex: number;
      trading: boolean;
      entry: boolean;
      exit: boolean;
      stopLoss: boolean;
    }
    const flags: CloseFlags[] = [];
    for (const state of states) {
      const sessionIndex = state.sessionIndexByDate.get(date);
      const session = sessionIndex === undefined ? undefined : state.snapshot.sessions[sessionIndex]!;
      const trading = session?.status === "trading" && session.bar !== undefined;
      if (!trading) {
        flags.push({ state, sessionIndex: sessionIndexAt(state, date), trading: false, entry: false, exit: false, stopLoss: false });
        continue;
      }
      const bar = session!.bar!;
      state.lastClose = bar.close;
      state.entryPriceByDate.set(date, state.lastEntryPrice);

      if (buyHold) {
        flags.push({ state, sessionIndex: sessionIndex!, trading: true, entry: false, exit: false, stopLoss: false });
        continue;
      }

      const history = state.snapshot.sessions.slice(0, sessionIndex! + 1)
        .filter((item) => item.status === "trading" && item.bar)
        .map((item) => {
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
      const dailyAt = (target: string): PortfolioDailyRecord | undefined => {
        for (let cursor = daily.length - 1; cursor >= 0; cursor -= 1) {
          if (daily[cursor]!.date <= target) return daily[cursor];
        }
        return undefined;
      };
      const positionTotalAt = (target: string): string => {
        const record = dailyAt(target);
        return record?.positions.find((position) => position.assetId === state.assetId)?.total ?? "0";
      };
      const barsHeld = history.map((observation) => {
        const observationDate = observation.date!;
        const buyIndex = state.buyIndices
          .filter((candidate) => state.snapshot.sessions[candidate]!.date <= observationDate)
          .at(-1);
        if (buyIndex === undefined) return new InternalDecimal(0);
        const buyDate = state.snapshot.sessions[buyIndex]!.date;
        const held = history.filter((candidate) => candidate.date! > buyDate && candidate.date! <= observationDate).length;
        return new InternalDecimal(held);
      });
      const contextRefs: Record<string, Series> = {
        "position.barsHeld": barsHeld,
        "position.state": history.map((observation) => new InternalDecimal(
          (observation.date === date ? String(totalPosition(state)) : positionTotalAt(observation.date!)) !== "0" ? 1 : 0,
        )),
        "position.quantity": history.map((observation) => new InternalDecimal(
          observation.date === date ? String(totalPosition(state)) : positionTotalAt(observation.date!),
        )),
        "position.entryPrice": history.map((observation) => new InternalDecimal(
          state.entryPriceByDate.get(observation.date!) ?? "0.00",
        )),
        "account.availableCash": history.map((observation) => new InternalDecimal(
          observation.date === date ? money(available) : dailyAt(observation.date!)?.cash.available ?? runSpec.account.initialCash,
        )),
      };
      const evaluation = evaluateStrategy(strategy as unknown as StrategyDraft, registry, {
        observationKind: "ohlcv",
        observations: history,
        contextRefs,
      });
      const current = history.length - 1;
      const entryRaw = evaluation.entry[current]!;
      const exit = evaluation.exits.some((series) => series[current] === true);
      ledger.add(date, "close", "SignalEvaluated", [entryRaw === true ? "ENTRY_TRUE" : exit ? "EXIT_TRUE" : "NO_SIGNAL"], { entry: entryRaw, exit },
        { bar: date, snapshot: state.snapshot.digest, strategyPath: "/entry", asset: state.assetId });

      // Per-asset stop-loss: raw close below entry price × (1 − x) forces a full exit of
      // this asset at its next open. Measured against the raw cost price (§12.2).
      const holdingPosition = totalPosition(state) > 0;
      const threshold = internalMultiply(state.lastEntryPrice, internalSubtract("1", strategy.risk.positionStopLossFraction));
      const stopLoss = holdingPosition && new InternalDecimal(state.lastEntryPrice).gt(0) && new InternalDecimal(bar.close).lt(threshold);
      flags.push({ state, sessionIndex: sessionIndex!, trading: true, entry: entryRaw === true, exit, stopLoss });
    }

    // ---- close: portfolio stop check (drawdown from historical equity peak) ----
    const equityToday = equityAt(date);
    if (!buyHold && !isLastDay) {
      const peak = equitySeries.reduce((top, value) => {
        const candidate = new InternalDecimal(value);
        return candidate.gt(top) ? candidate : top;
      }, new InternalDecimal(equitySeries[0]!));
      const current = new InternalDecimal(equityToday);
      const drawdown = peak.gt(0) ? internalDivide(internalSubtract(peak, current), peak) : new InternalDecimal(0);
      if (!portfolioStopActive && drawdown.gte(new InternalDecimal(strategy.risk.portfolioStopFraction))) {
        portfolioStopActive = true;
        ledger.add(date, "close", "MetricComputed", ["PORTFOLIO_STOP_LOSS"], {
          peak: money(peak),
          equity: equityToday,
          drawdown: formatFinancialRate(drawdown),
          threshold: strategy.risk.portfolioStopFraction,
        });
      }
    }

    // ---- close: sell intents (exit ∪ per-asset stop ∪ portfolio liquidation), authored order ----
    if (!buyHold && !isLastDay) {
      for (const flag of flags) {
        const { state } = flag;
        if (totalPosition(state) === 0 || state.pending !== null) continue;
        const sellable = intentSellable(state, flag.sessionIndex);
        if (sellable <= 0) continue;
        const wantsExit = flag.trading && flag.exit;
        const wantsStop = flag.trading && flag.stopLoss;
        const wantsLiquidation = portfolioStopActive;
        if (!wantsExit && !wantsStop && !wantsLiquidation) continue;
        const forced = wantsStop || wantsLiquidation;
        const quantity = forced
          ? sellable
          : new InternalDecimal(sellable).mul(strategy.position.exitSize.positionFraction).floor().toNumber();
        const reasonCodes = [
          ...(wantsExit ? ["SELL_NEXT_SESSION"] : []),
          ...(wantsStop ? ["POSITION_STOP_LOSS"] : []),
          ...(wantsLiquidation ? ["PORTFOLIO_STOP_LOSS"] : []),
        ];
        if (!forced && !validateSellQuantity(quantity, sellable)) {
          reject(state, date, "sell", quantity, "ODD_LOT_NOT_FULL_REMAINDER");
          continue;
        }
        if (wantsStop) state.stopLossTriggers += 1;
        state.reservedPosition = quantity;
        const intent: PendingIntent = {
          intentId: `intent-${nextIntentId++}`,
          assetId: state.assetId,
          side: "sell",
          quantity,
          budgetCap: null,
          reservedCash: "0.00",
          createdSeq: nextSeq++,
        };
        state.pending = intent;
        pendingQueue.push(intent);
        const order = { assetId: state.assetId, intentId: intent.intentId, date, side: "sell" as const, quantity: String(quantity), status: "created" as const, reason: null };
        state.orders.push(order);
        const session = flag.trading ? state.snapshot.sessions[state.sessionIndexByDate.get(date)!]! : undefined;
        ledger.add(date, "close", "OrderIntentCreated", reasonCodes,
          { ...order, referencePrice: session?.bar?.close ?? state.lastClose, sellableQuantity: String(sellable) },
          { intent: intent.intentId, bar: date, strategyPath: wantsStop || wantsLiquidation ? "/risk" : "/exits/0", asset: state.assetId });
        ledger.add(date, "close", "PositionChanged", ["SELL_RESERVED"], { quantity: String(quantity) },
          { intent: intent.intentId, asset: state.assetId });
      }
    }

    // ---- close: template budget allocation → buy intents (authored order = arrival order) ----
    if (!buyHold && !isLastDay && !portfolioStopActive) {
      const candidates = flags.filter((flag) =>
        flag.trading && flag.entry && totalPosition(flag.state) === 0 && flag.state.pending === null);
      if (candidates.length > 0) {
        const cashTotalAtClose = cashTotal();
        const availableAtStart = money(available);
        let committedSlots = 0;
        const openPositions = states.filter((state) => totalPosition(state) > 0).length;
        const freeSlotsAtStart = strategy.allocation.template === "equal-split@1"
          ? Math.max(0, strategy.allocation.params.maxPositions - openPositions)
          : 0;
        const budgetPerSlot = strategy.allocation.template === "equal-split@1" && freeSlotsAtStart > 0
          ? internalDivide(availableAtStart, String(freeSlotsAtStart))
          : null;
        const perAssetCap = strategy.allocation.template === "first-come-first-served@1"
          ? internalMultiply(cashTotalAtClose, strategy.allocation.params.maxPerAssetCashFraction)
          : null;

        for (const flag of candidates) {
          const { state } = flag;
          const session = state.snapshot.sessions[state.sessionIndexByDate.get(date)!]!;
          const bar = session.bar!;
          const estimate = money(internalAdd(bar.close, CN_STOCK_FEE_PROFILE.tick));
          const nextDate = dates[dayIndex + 1]!;
          if (strategy.allocation.template === "equal-split@1" && freeSlotsAtStart - committedSlots <= 0) {
            reject(state, date, "buy", 0, "NO_FREE_POSITION_SLOT");
            continue;
          }
          const cap = perAssetCap ?? budgetPerSlot!;
          const budget = money(InternalDecimal.min(cap, available));
          const quantity = maxAffordableBuyQuantity(budget, estimate, nextDate);
          if (quantity === 0) {
            reject(state, date, "buy", 0, "INSUFFICIENT_CASH");
            continue;
          }
          const estimateFees = calculateFees(estimate, quantity, "buy", nextDate);
          const cost = money(internalAdd(estimateFees.amount, estimateFees.total));
          available = internalSubtract(available, cost);
          reserved = internalAdd(reserved, cost);
          const intent: PendingIntent = {
            intentId: `intent-${nextIntentId++}`,
            assetId: state.assetId,
            side: "buy",
            quantity,
            budgetCap: cap,
            reservedCash: cost,
            createdSeq: nextSeq++,
          };
          state.pending = intent;
          pendingQueue.push(intent);
          committedSlots += 1;
          const order = { assetId: state.assetId, intentId: intent.intentId, date, side: "buy" as const, quantity: String(quantity), status: "created" as const, reason: null };
          state.orders.push(order);
          ledger.add(date, "close", "OrderIntentCreated", ["BUY_NEXT_SESSION"],
            { ...order, estimatedPrice: estimate, estimatedBudget: budget },
            { intent: intent.intentId, bar: date, strategyPath: "/entry", asset: state.assetId });
          ledger.add(date, "close", "CashChanged", ["BUY_RESERVED"], { amount: cost },
            { intent: intent.intentId, asset: state.assetId });
        }
      }
    }

    // ---- close: marks, daily record, equity series ----
    for (const state of states) {
      const sessionIndex = state.sessionIndexByDate.get(date);
      const session = sessionIndex === undefined ? undefined : state.snapshot.sessions[sessionIndex]!;
      const trading = session?.status === "trading" && session.bar !== undefined;
      if (sessionIndex !== undefined) {
        // Record-date position basis: end-of-day holdings on every session the asset has
        // (1.0.0 precedent: trading and suspended days both record).
        state.recordedPositions.set(date, totalPosition(state));
      }
      const mark = trading ? session!.bar!.close : state.lastClose;
      ledger.add(date, "close", "MarkToMarket", trading ? [] : ["STALE"], {
        close: mark,
        quantity: String(totalPosition(state)),
        marketValue: money(internalMultiply(mark, String(totalPosition(state)))),
      }, { asset: state.assetId });
    }
    ledger.add(date, "close", "MarkToMarket", [], { equity: equityToday });

    daily.push({
      date,
      equity: equityToday,
      cash: cashSnapshot(),
      positions: states.map((state) => {
        const index = sessionIndexAt(state, date);
        const total = totalPosition(state);
        const sellable = Math.max(0, sellableAt(state, index));
        return {
          assetId: state.assetId,
          total: String(total),
          sellable: String(sellable),
          reserved: String(state.reservedPosition),
          unsettled: String(total - sellable - state.reservedPosition),
        };
      }),
    });
    equitySeries.push(equityToday);
  }

  const fills = states.flatMap((state) => state.fills);
  const orders = states.flatMap((state) => state.orders);
  const rejections = states.flatMap((state) => state.rejections);
  const fees = states.reduce((totals, state) => ({
    commission: money(internalAdd(totals.commission, state.fees.commission)),
    transferFee: money(internalAdd(totals.transferFee, state.fees.transferFee)),
    stampDuty: money(internalAdd(totals.stampDuty, state.fees.stampDuty)),
    total: money(internalAdd(totals.total, state.fees.total)),
  }), zeroFees());
  const perAsset: PortfolioAssetSummary[] = states.map((state) => {
    const last = daily.at(-1)?.positions.find((position) => position.assetId === state.assetId);
    return {
      assetId: state.assetId,
      fillCount: state.fills.length,
      fees: state.fees,
      endingPosition: last
        ? { total: last.total, sellable: last.sellable, reserved: last.reserved, unsettled: last.unsettled }
        : { total: "0", sellable: "0", reserved: "0", unsettled: "0" },
      positionStopLossTriggers: state.stopLossTriggers,
    };
  });

  return {
    daily,
    fills,
    orders,
    rejections,
    fees,
    perAsset,
    finalEquity: daily.at(-1)?.equity ?? money(runSpec.account.initialCash),
    equitySeries,
    buyHoldReason: buyHold
      ? states.every((state) => !state.buyHoldAttempted)
        ? "NO_ELIGIBLE_FILL_SESSION"
        : fills.some((fill) => fill.side === "buy") ? null : "NO_AFFORDABLE_STARTING_LOT"
      : null,
  };
}

function failure(runDigest: string, ledger: EventLedger, error: ContractError): PortfolioRunResult {
  const date = ledger.events.at(-1)?.tradingDate ?? "1970-01-01";
  const details = error instanceof InsufficientWarmupError ? error.status : undefined;
  ledger.add(date, "run-end", "RunFailed", [error.code], { code: error.code, path: error.path, message: error.message, ...details });
  return {
    ok: false,
    runDigest,
    events: ledger.events,
    error: { code: error.code, message: error.message, path: error.path, ...(details ? { details } : {}) },
  };
}

export function executePortfolioRun(originalInput: PortfolioRunInput): PortfolioRunResult {
  let runDigest = digestJson(originalInput.runSpec);
  let ledger = new EventLedger(runDigest);
  try {
    const input = { ...originalInput, runSpec: normalizeRunSpec2(originalInput.runSpec) };
    runDigest = digestJson(input.runSpec);
    ledger = new EventLedger(runDigest);

    const specIssues = validateRunSpec2(input.runSpec);
    if (specIssues.length > 0) throw new ContractError(specIssues[0]!.code, specIssues[0]!.message, specIssues[0]!.path);
    const draftIssues = validateStrategyDraft2(input.strategy);
    if (draftIssues.length > 0) throw new ContractError(draftIssues[0]!.code, draftIssues[0]!.message, draftIssues[0]!.path);

    // §12.9 semantic stage: both documents are rejected here — before the strategy draft
    // reaches canonicalization/digest — never clamped, never default-filled.
    const registry = createRegistryV1();
    const draftSemanticIssues = validateStrategySemantics2(input.strategy, registry, "ohlcv");
    if (draftSemanticIssues.length > 0) {
      throw new ContractError(draftSemanticIssues[0]!.code, draftSemanticIssues[0]!.message, draftSemanticIssues[0]!.path);
    }
    const specSemanticIssues = validateRunSpec2Semantics(input.runSpec, input.strategy);
    if (specSemanticIssues.length > 0) {
      throw new ContractError(specSemanticIssues[0]!.code, specSemanticIssues[0]!.message, specSemanticIssues[0]!.path);
    }

    const initialCash = input.runSpec.account.initialCash;
    if (new InternalDecimal(initialCash).lt(1000) || new InternalDecimal(initialCash).gt(100000000)) {
      throw new ContractError("INVALID_INITIAL_CASH", "Initial cash must be between 1000 and 100000000 CNY", "/account/initialCash");
    }
    if (input.runSpec.data.start > input.runSpec.data.end) throw new ContractError("INVALID_RUN_RANGE", "Run start is after end");
    if (input.runSpec.strategy.digest !== digestStrategyDraft2(input.strategy)) {
      throw new ContractError("STRATEGY_DIGEST_MISMATCH", "Confirmed strategy digest mismatch");
    }

    const snapshotsById = new Map<string, DataSnapshot>();
    for (const snapshot of input.snapshots) {
      if (snapshotsById.has(snapshot.assetIdentity.assetId)) {
        throw new ContractError("ASSET_MISMATCH", `Two snapshots supplied for ${snapshot.assetIdentity.assetId}`);
      }
      snapshotsById.set(snapshot.assetIdentity.assetId, snapshot);
    }
    for (const asset of input.runSpec.assets) {
      const snapshot = snapshotsById.get(asset.assetId);
      if (!snapshot) throw new ContractError("ASSET_MISMATCH", "RunSpec and snapshot assets differ", "/assets");
      const snapshotIssues = validateDataSnapshot(snapshot);
      if (snapshotIssues.length > 0) throw new ContractError(snapshotIssues[0]!.code, snapshotIssues[0]!.message, snapshotIssues[0]!.path);
      validateSnapshotValues(snapshot);
      if (snapshot.digest !== digestSnapshot(snapshot)) throw new ContractError("SNAPSHOT_DIGEST_MISMATCH", "Snapshot digest mismatch");
      const binding = input.runSpec.data.snapshots.find((candidate) => candidate.assetId === asset.assetId)!;
      if (binding.snapshotDigest !== snapshot.digest) throw new ContractError("SNAPSHOT_REFERENCE_MISMATCH", "RunSpec references another snapshot");
      if (snapshot.qualityIssues.some((qualityIssue) => qualityIssue.blocking)) {
        throw new ContractError("BLOCKING_DATA_QUALITY", "Snapshot contains blocking quality issues");
      }
      const prior = snapshot.sessions.filter((session) => session.date < input.runSpec.data.start && session.status === "trading" && session.bar).length;
      try {
        checkWarmup(input.strategy as unknown as StrategyDraft, registry, prior, input.runSpec.warmup.extraObservations);
      } catch (error) {
        if (error instanceof InsufficientWarmupError) {
          throw new InsufficientWarmupError({ ...error.status });
        }
        throw error;
      }
    }

    const main = simulate(input, runDigest, ledger, false);
    const buyHold = simulate(input, runDigest, new EventLedger(runDigest), true);
    const preliminaryReport = buildPortfolioReport(input, main, buyHold, ledger.events, runDigest);
    ledger.add(input.runSpec.data.end, "run-end", "MetricComputed", [], { finalEquity: main.finalEquity });
    ledger.add(input.runSpec.data.end, "run-end", "RunCompleted", [], { eventCount: ledger.events.length + 1 });
    const report = finalizePortfolioReport(preliminaryReport, ledger.events);
    return { ok: true, runDigest, events: ledger.events, report };
  } catch (error) {
    if (error instanceof ContractError) return failure(runDigest, ledger, error);
    throw error;
  }
}
