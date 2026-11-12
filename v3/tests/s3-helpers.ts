import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createDeterministicFakeAdapter,
  loadFakeScenarios,
  type DeterministicFakeAdapter,
  type FakeScenarioTable,
} from "../adapters/model/deterministic/index.js";
import { createFileStrategyStore } from "../adapters/persistence/file/strategy-store.js";
import type { StrategyStore } from "../application/ports/strategy-store.js";
import { testRoot } from "./helpers.js";

let cachedScenarios: FakeScenarioTable | null = null;

export function fakeScenarios(): FakeScenarioTable {
  cachedScenarios ??= loadFakeScenarios(path.join(testRoot, "fixtures", "s3"));
  return cachedScenarios;
}

export function fakePort(scenario: string): DeterministicFakeAdapter {
  return createDeterministicFakeAdapter({ scenarios: fakeScenarios(), scenario });
}

export function tmpDataRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "s3-data-"));
}

export function tmpStrategyStore(): { rootDir: string; store: StrategyStore } {
  const rootDir = tmpDataRoot();
  return { rootDir, store: createFileStrategyStore(rootDir) };
}
