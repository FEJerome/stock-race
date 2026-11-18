import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const v3Root = path.resolve(root, "..", "v3");
const dataRoot = path.join(root, ".data");
const port = 4399;

/**
 * The e2e server is the same `npm run start:local` entry the maintainer uses,
 * pinned to the deterministic fake interview driver and the in-repo synthetic
 * snapshot pool: zero network at test time, fully reproducible artifacts.
 */
export default defineConfig({
  testDir: path.join(root, "tests"),
  outputDir: path.join(root, "test-results"),
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: path.join(root, "playwright-report") }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1600, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node scripts/start-local.mjs --port ${port} --data-root "${dataRoot}"`,
    cwd: v3Root,
    url: `http://127.0.0.1:${port}/snapshots`,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
