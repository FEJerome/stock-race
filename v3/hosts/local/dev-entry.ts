import path from "node:path";
import { createDeterministicFakeAdapter, loadFakeScenarios } from "../../adapters/model/deterministic/index.js";
import type { StrategyDraftPort } from "../../application/ports/model.js";
import { readSecretFromEnv } from "./secret-provider.js";
import { startLocalServer } from "./index.js";
import { buildPoolSnapshots, ensurePoolMaterialized } from "./slice-pool.js";

/**
 * Runnable entry for the playable S4 local web slice (Issue #55).
 *
 * Default mode is the deterministic fake interview driver (no real model
 * calls, no network): the browser flow is driven by the scripted scenarios so
 * the maintainer can play the whole slice offline. `--real` opts into the
 * real model adapter via environment secrets — that window is opened only
 * under separate maintainer authorization.
 *
 * Usage (via `npm run start:local`, cwd = v3/):
 *   --port <n>             default 4173
 *   --data-root <dir>      default <repo>/v3-data
 *   --scenarios-dir <dir>  default <repo>/v3/tests/fixtures/s4-interview
 *   --real                 use the real model adapter (env: V3_MODEL_API_KEY,
 *                          V3_MODEL_BASE_URL, V3_MODEL_ID) — authorized windows only
 */

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const cwd = process.cwd();
const repoRoot = path.resolve(cwd, "..");
const port = Number(argValue("--port") ?? "4173");
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`invalid --port: ${argValue("--port")}`);
}
const dataRoot = path.resolve(argValue("--data-root") ?? path.join(repoRoot, "v3-data"));
const scenariosDir = path.resolve(
  argValue("--scenarios-dir") ?? path.join(repoRoot, "v3", "tests", "fixtures", "s4-interview"),
);
const uiDir = path.join(cwd, "hosts", "local", "ui");
const useRealModel = process.argv.includes("--real");

async function main(): Promise<void> {
  const pool = buildPoolSnapshots();
  await ensurePoolMaterialized(dataRoot, pool);

  const compositionOptions = useRealModel
    ? {
        dataRoot,
        kimi: {
          apiKey: readSecretFromEnv("V3_MODEL_API_KEY"),
          modelId: process.env.V3_MODEL_ID ?? "deepseek-flash",
          baseUrl: process.env.V3_MODEL_BASE_URL ?? "https://api.deepseek.com",
        },
      }
    : (() => {
        const scenarios = loadFakeScenarios(scenariosDir);
        const makePort = (style?: string): StrategyDraftPort =>
          createDeterministicFakeAdapter({
            scenarios,
            scenario: style === "expert" ? "expert" : "novice",
            stepping: "per-call",
          });
        return {
          dataRoot,
          kimi: { apiKey: "deterministic-fake-no-key", modelId: "deterministic-fake" },
          testOverrides: {
            modelPort: makePort("novice"),
            interviewPortFactory: (style?: string) => makePort(style),
          },
        };
      })();

  const handle = await startLocalServer(compositionOptions, { uiDir, pool, port });

  const mode = useRealModel ? "real-model" : "deterministic-fake";
  console.log(
    [
      `Stock-Race V3 S4 slice (${mode})`,
      `url:        ${handle.url}`,
      `data root:  ${dataRoot}`,
      `pool:       ${pool.map((snapshot) => `${snapshot.assetIdentity.assetId} (${snapshot.fixedRange.start}..${snapshot.fixedRange.end})`).join(", ")}`,
      `mode note:  ${useRealModel ? "real model adapter — authorized window" : "deterministic fake interview driver; no model calls, no network"}`,
    ].join("\n"),
  );

  process.on("SIGINT", () => {
    void handle.close().then(() => process.exit(0));
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
