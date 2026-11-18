import { runPortfolio } from "../../application/run-portfolio/index.js";
import { loadSnapshotFile } from "../../adapters/market/snapshot-file/index.js";
import type { DataSnapshot } from "../../core/market/types.js";
import type { RunSpec2 } from "../../core/strategy/generated/run-spec-2.types.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import { parseJsonInput } from "../../core/strategy/validation/json-input.js";
import { readFileSync } from "node:fs";

/**
 * Portfolio run CLI (S4 supplement §12.4): same engine entry as the local web
 * host, so identical inputs must yield an identical runDigest on both hosts.
 *
 *   run-portfolio-cli --strategy <draft-2.json> --run-spec <run-spec-2.json> --snapshots <snapshot.json...>
 *
 * Snapshots are passed as explicit files (one per scheduled asset); each file
 * is materialized and its digest must match the runSpec binding.
 */
function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return process.argv[index + 1]!;
}

function argumentList(name: string): string[] {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    throw new Error(`Missing required argument: ${name}`);
  }
  const values: string[] = [];
  for (let cursor = index + 1; cursor < process.argv.length && !process.argv[cursor]!.startsWith("--"); cursor += 1) {
    values.push(process.argv[cursor]!);
  }
  if (values.length === 0) {
    throw new Error(`Missing required argument: ${name} (at least one file)`);
  }
  return values;
}

const strategy = parseJsonInput(readFileSync(argument("--strategy"), "utf8")) as StrategyDraft2;
const runSpec = parseJsonInput(readFileSync(argument("--run-spec"), "utf8")) as RunSpec2;
const snapshots: DataSnapshot[] = argumentList("--snapshots").map((file) => loadSnapshotFile(file));

for (const binding of runSpec.data.snapshots) {
  const snapshot = snapshots.find((entry) => entry.assetIdentity.assetId === binding.assetId);
  if (snapshot === undefined) {
    throw new Error(`snapshot file missing for asset ${binding.assetId}`);
  }
  if (snapshot.digest !== binding.snapshotDigest) {
    throw new Error(`snapshot digest mismatch for ${binding.assetId}: file ${snapshot.digest} ≠ binding ${binding.snapshotDigest}`);
  }
}

const result = runPortfolio({ strategy, runSpec, snapshots });
console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exitCode = 1;
}
