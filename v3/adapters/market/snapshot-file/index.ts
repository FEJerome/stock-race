import { readFileSync } from "node:fs";
import type { DataSnapshot } from "../../../core/market/types.js";
import { materializeSnapshot } from "../../../core/market/snapshot.js";
import { parseJsonInput } from "../../../core/strategy/validation/json-input.js";

export function loadSnapshotFile(path: string): DataSnapshot {
  return materializeSnapshot(parseJsonInput(readFileSync(path, "utf8")) as DataSnapshot);
}
