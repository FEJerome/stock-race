import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";
import { importSnapshot } from "../../application/import-snapshot/index.js";
import { loadSnapshotFile } from "../../adapters/market/snapshot-file/index.js";
import { testRoot } from "../helpers.js";

const FIXTURE_DIR = path.join(testRoot, "fixtures", "import-snapshot");
const PREPARED = path.join(FIXTURE_DIR, "mini-prepared.json");
const MANIFEST = path.join(FIXTURE_DIR, "mini-import-manifest.json");

// Golden digest for the hand-authored mini fixture; pinning it makes any
// canonicalization change visible as a test failure.
const GOLDEN_DIGEST = "sha256:4a8b4910c7ab2e06748bb80949394a73ed4bd57ebef49de8a743ffbedd7a3337";

function tempRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), "import-snapshot-test-"));
}

describe("import-snapshot materialization", () => {
  it("produces the golden digest and freezes canonical bytes", () => {
    const root = tempRoot();
    const result = importSnapshot({
      preparedPath: PREPARED,
      manifestPath: MANIFEST,
      snapshotsRoot: root,
      now: "2026-11-17T00:00:00.000Z",
    });
    expect(result.digest).toBe(GOLDEN_DIGEST);
    expect(result.wrote).toBe(true);
    expect(result.snapshotDir).toBe(path.join(root, GOLDEN_DIGEST.replace(/:/g, "_")));

    const frozen = readFileSync(result.snapshotPath, "utf8");
    const frozenJson = JSON.parse(frozen) as { digest: string };
    expect(frozenJson.digest).toBe(GOLDEN_DIGEST);

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8")) as {
      snapshotDigest: string;
      createdAt: string;
      assetId: string;
      adjustmentFormula: string;
    };
    expect(manifest.snapshotDigest).toBe(GOLDEN_DIGEST);
    expect(manifest.createdAt).toBe("2026-11-17T00:00:00.000Z");
    expect(manifest.assetId).toBe("stock:cn-a.sh.600519");
    expect(manifest.adjustmentFormula).toBe("adjustment-formula@1");
  });

  it("is idempotent: re-import returns wrote=false with byte-identical output", () => {
    const root = tempRoot();
    const first = importSnapshot({ preparedPath: PREPARED, snapshotsRoot: root });
    const bytesAfterFirst = readFileSync(first.snapshotPath, "utf8");
    const second = importSnapshot({ preparedPath: PREPARED, snapshotsRoot: root });
    expect(second.wrote).toBe(false);
    expect(second.digest).toBe(first.digest);
    expect(readFileSync(second.snapshotPath, "utf8")).toBe(bytesAfterFirst);
  });

  it("freezes a snapshot loadable by the snapshot-file adapter", () => {
    const root = tempRoot();
    const result = importSnapshot({ preparedPath: PREPARED, snapshotsRoot: root });
    const snapshot = loadSnapshotFile(result.snapshotPath);
    expect(snapshot.digest).toBe(result.digest);
    expect(snapshot.sessions).toHaveLength(5);
  });

  it("refuses to overwrite a conflicting snapshot directory", () => {
    const root = tempRoot();
    const first = importSnapshot({ preparedPath: PREPARED, snapshotsRoot: root });
    const tampered = JSON.parse(readFileSync(PREPARED, "utf8")) as { sessions: unknown[] };
    tampered.sessions = tampered.sessions.slice(1);
    const tamperedPath = path.join(root, "tampered.json");
    writeFileSync(tamperedPath, JSON.stringify(tampered));
    // same digest directory name, different content -> conflict guard
    writeFileSync(first.snapshotPath, "{\"tampered\":true}");
    expect(() => importSnapshot({ preparedPath: PREPARED, snapshotsRoot: root })).toThrowError(
      /already exists with different bytes/,
    );
  });

  it("rejects schema-invalid prepared input", () => {
    const root = tempRoot();
    const invalid = JSON.parse(readFileSync(PREPARED, "utf8")) as Record<string, unknown>;
    invalid.unexpectedField = true;
    const invalidPath = path.join(root, "invalid.json");
    writeFileSync(invalidPath, JSON.stringify(invalid));
    expect(() => importSnapshot({ preparedPath: invalidPath, snapshotsRoot: root })).toThrowError(
      /failed schema validation/,
    );
  });

  it("rejects decimal values beyond Price scale 6", () => {
    const root = tempRoot();
    const bad = JSON.parse(readFileSync(PREPARED, "utf8")) as {
      sessions: { bar?: { close: string } }[];
    };
    bad.sessions[0]!.bar!.close = "10.2000001";
    const badPath = path.join(root, "bad-decimal.json");
    writeFileSync(badPath, JSON.stringify(bad));
    expect(() => importSnapshot({ preparedPath: badPath, snapshotsRoot: root })).toThrowError(
      /accepts scale 6/,
    );
  });

  it("CLI and application agree on the frozen digest", () => {
    const v3Root = path.resolve(testRoot, "..");
    const bundle = path.join(v3Root, ".local", "import-snapshot-test.cjs");
    buildSync({
      entryPoints: [path.join(v3Root, "hosts", "cli", "import-snapshot.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: bundle,
    });
    const root = tempRoot();
    const stdout = execFileSync(process.execPath, [
      bundle,
      "--prepared", PREPARED,
      "--manifest", MANIFEST,
      "--snapshots-root", root,
    ], { cwd: v3Root, encoding: "utf8" });
    const cli = JSON.parse(stdout) as { digest: string; wrote: boolean };
    const app = importSnapshot({ preparedPath: PREPARED, manifestPath: MANIFEST, snapshotsRoot: tempRoot() });
    expect(cli.digest).toBe(app.digest);
    expect(cli.wrote).toBe(true);
  });
});
