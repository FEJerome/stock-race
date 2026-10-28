import { prepareFixtureRun } from "../adapters/market/fixture/index.js";
import type { StockRunInput } from "../core/engine/types.js";
import type { DataSnapshot, RunSpec } from "../core/market/types.js";
import type { StrategyDraft } from "../core/strategy/generated/strategy-draft.types.js";
import { readJsonFixture } from "./helpers.js";

export function basicInput(): StockRunInput {
  return prepareFixtureRun({
    strategy: readJsonFixture("fixtures/s2/basic-strategy.json") as StrategyDraft,
    runSpec: readJsonFixture("fixtures/s2/basic-run-spec.json") as RunSpec,
    snapshot: readJsonFixture("fixtures/s2/basic-snapshot.json") as DataSnapshot,
  });
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
