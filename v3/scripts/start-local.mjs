import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

/**
 * start:local — bundles the dev entry with esbuild (already a devDependency,
 * zero new runtime deps) into .local/ and runs it. All CLI arguments are
 * forwarded, e.g. `npm run start:local -- --port 4173`.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, ".local", "s4-local-host.cjs");

buildSync({
  entryPoints: [path.join(root, "hosts", "local", "dev-entry.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: bundle,
});

const child = spawn(process.execPath, [bundle, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
