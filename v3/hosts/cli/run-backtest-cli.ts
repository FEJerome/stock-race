import { readFileSync } from "node:fs";
import { runBacktest } from "../../application/run-backtest/index.js";
import { prepareFixtureRun } from "../../adapters/market/fixture/index.js";
import { loadSnapshotFile } from "../../adapters/market/snapshot-file/index.js";
import type { RunSpec } from "../../core/market/types.js";
import type { StrategyDraft } from "../../core/strategy/generated/strategy-draft.types.js";
import { parseJsonInput } from "../../core/strategy/validation/json-input.js";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return process.argv[index + 1]!;
}

const strategy = parseJsonInput(readFileSync(argument("--strategy"), "utf8")) as StrategyDraft;
const runSpec = parseJsonInput(readFileSync(argument("--run-spec"), "utf8")) as RunSpec;
const snapshot = loadSnapshotFile(argument("--snapshot"));
const result = runBacktest(prepareFixtureRun({ strategy, runSpec, snapshot }));
console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exitCode = 1;
}
