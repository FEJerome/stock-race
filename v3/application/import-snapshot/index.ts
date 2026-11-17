import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DataSnapshot } from "../../core/strategy/generated/data-snapshot.types.js";
import { validateDataSnapshot } from "../../core/market/contract-validators.js";
import { materializeSnapshot, validateSnapshotValues } from "../../core/market/snapshot.js";
import { canonicalizeJson } from "../../core/strategy/canonical/canonical-json.js";
import { ContractError } from "../../core/strategy/canonical/errors.js";
import { parseJsonInput } from "../../core/strategy/validation/json-input.js";

export interface ImportSnapshotOptions {
  preparedPath: string;
  manifestPath?: string | undefined;
  snapshotsRoot: string;
  /** Injected for deterministic tests; defaults to the real wall-clock time. */
  now?: string | undefined;
}

export interface ImportSnapshotResult {
  digest: string;
  snapshotDir: string;
  snapshotPath: string;
  manifestPath: string;
  /** False when an identical snapshot was already frozen (idempotent re-run). */
  wrote: boolean;
}

function assertNoSchemaIssues(snapshot: unknown): void {
  const issues = validateDataSnapshot(snapshot);
  if (issues.length > 0) {
    throw new ContractError(
      "SNAPSHOT_SCHEMA_INVALID",
      `prepared snapshot failed schema validation: ${JSON.stringify(issues)}`,
    );
  }
}

export function importSnapshot(options: ImportSnapshotOptions): ImportSnapshotResult {
  const prepared = parseJsonInput(readFileSync(options.preparedPath, "utf8"));
  assertNoSchemaIssues(prepared);
  const snapshot = prepared as DataSnapshot;
  validateSnapshotValues(snapshot);
  const materialized = materializeSnapshot(snapshot);
  const digest = materialized.digest;

  // ':' is illegal in Windows directory names; sanitize deterministically.
  const snapshotDir = path.join(options.snapshotsRoot, digest.replace(/:/g, "_"));
  const snapshotPath = path.join(snapshotDir, "snapshot.json");
  const manifestPath = path.join(snapshotDir, "import-manifest.json");
  const canonicalBytes = canonicalizeJson(materialized);

  let wrote = true;
  if (existsSync(snapshotDir)) {
    const existing = readFileSync(snapshotPath, "utf8");
    if (existing !== canonicalBytes) {
      throw new ContractError(
        "SNAPSHOT_DIR_CONFLICT",
        `snapshot directory ${snapshotDir} already exists with different bytes; refusing to overwrite`,
      );
    }
    wrote = false;
  } else {
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(snapshotPath, canonicalBytes);
  }

  if (wrote || !existsSync(manifestPath)) {
    const base = options.manifestPath === undefined
      ? {}
      : parseJsonInput(readFileSync(options.manifestPath, "utf8")) as Record<string, unknown>;
    const manifest = {
      ...base,
      snapshotDigest: digest,
      createdAt: options.now ?? new Date().toISOString(),
    };
    writeFileSync(manifestPath, canonicalizeJson(manifest));
  }

  // Readback verification: the frozen bytes must re-materialize to the same digest.
  const reread = parseJsonInput(readFileSync(snapshotPath, "utf8")) as DataSnapshot;
  const rereadDigest = materializeSnapshot(reread).digest;
  if (rereadDigest !== digest) {
    throw new ContractError(
      "SNAPSHOT_READBACK_MISMATCH",
      `frozen snapshot readback digest ${rereadDigest} != ${digest}`,
    );
  }

  return { digest, snapshotDir, snapshotPath, manifestPath, wrote };
}
