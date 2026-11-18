import type { StrategyDraft2 } from "../generated/strategy-draft-2.types.js";
import { canonicalizeJson } from "./canonical-json.js";
import { normalizeDecimal, type DecimalValueType } from "./decimal-profile.js";
import { digestCanonical } from "./digest.js";
import { ContractError } from "./errors.js";
import { assertValidStrategyDraft2 } from "../validation/schema-validator-2.js";

// Reuse the frozen 1.0.0 AST normalization by round-tripping expression subtrees
// through the existing canonical machinery: expression nodes are version-independent.
import { normalizeStrategyDraft } from "./strategy-canonical.js";
import type { StrategyDraft } from "../generated/strategy-draft.types.js";

function normalizeDecimalAt(input: string, type: DecimalValueType, path: string): string {
  try {
    return normalizeDecimal(input, type);
  } catch (error) {
    if (error instanceof ContractError && error.path === "") {
      throw new ContractError(error.code, error.message, path);
    }
    throw error;
  }
}

function normalizeAstSubtree<T>(value: T): T {
  // normalizeStrategyDraft only touches indicators/entry/exits/position decimals; wrapping the
  // expression in a synthetic 1.0.0 shell lets us reuse the frozen traversal for shared AST nodes.
  const shell = {
    schemaVersion: "1.0.0",
    name: "normalization-shell",
    indicators: {},
    entry: value,
    exits: [{ gt: [{ const: "1" }, { const: "0" }] }],
    position: { side: "long", allowAdd: false, entrySize: { cashFraction: "1" }, exitSize: { positionFraction: "1" } },
  } as unknown as StrategyDraft;
  return normalizeStrategyDraft(shell).entry as unknown as T;
}

export function normalizeStrategyDraft2(value: StrategyDraft2): StrategyDraft2 {
  return {
    ...value,
    universe: { ...value.universe, assets: [...value.universe.assets] },
    indicators: Object.fromEntries(
      Object.entries(value.indicators).map(([key, indicator]) => [key, {
        ...indicator,
        ...(indicator.params ? { params: { ...indicator.params } } : {}),
      }]),
    ),
    entry: normalizeAstSubtree(value.entry),
    exits: value.exits.map((expression) => normalizeAstSubtree(expression)) as StrategyDraft2["exits"],
    risk: {
      positionStopLossFraction: normalizeDecimalAt(
        value.risk.positionStopLossFraction,
        "Rate",
        "/risk/positionStopLossFraction",
      ),
      portfolioStopFraction: normalizeDecimalAt(
        value.risk.portfolioStopFraction,
        "Rate",
        "/risk/portfolioStopFraction",
      ),
    },
    allocation: value.allocation.template === "first-come-first-served@1"
      ? {
          template: "first-come-first-served@1",
          params: {
            maxPerAssetCashFraction: normalizeDecimalAt(
              value.allocation.params.maxPerAssetCashFraction,
              "Rate",
              "/allocation/params/maxPerAssetCashFraction",
            ),
          },
        }
      : {
          template: "equal-split@1",
          params: { ...value.allocation.params },
        },
    position: {
      ...value.position,
      exitSize: {
        positionFraction: normalizeDecimalAt(
          value.position.exitSize.positionFraction,
          "Rate",
          "/position/exitSize/positionFraction",
        ),
      },
    },
  };
}

export function canonicalizeStrategyDraft2(value: unknown): string {
  assertValidStrategyDraft2(value);
  return canonicalizeJson(normalizeStrategyDraft2(value));
}

export function digestStrategyDraft2(value: unknown): string {
  return digestCanonical(canonicalizeStrategyDraft2(value));
}
