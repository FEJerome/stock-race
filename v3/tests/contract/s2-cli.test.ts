import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSync } from "esbuild";
import { runBacktest } from "../../application/run-backtest/index.js";
import { basicInput } from "../s2-helpers.js";
import { testRoot } from "../helpers.js";

describe("CLI and application parity", () => {
  it("returns the identical RunEvent and Report hashes for the golden fixture", () => {
    const root = path.resolve(testRoot, "..");
    const bundle = path.join(root, ".local", "s2-test-cli.cjs");
    buildSync({
      entryPoints: [path.join(root, "hosts", "cli", "run-backtest-cli.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: bundle,
    });
    const stdout = execFileSync(process.execPath, [
      bundle,
      "--strategy", "tests/fixtures/s2/basic-strategy.json",
      "--run-spec", "tests/fixtures/s2/basic-run-spec.json",
      "--snapshot", "tests/fixtures/s2/basic-snapshot.json",
    ], { cwd: root, encoding: "utf8" });
    const cli = JSON.parse(stdout) as ReturnType<typeof runBacktest>;
    const application = runBacktest(basicInput());
    expect(cli).toEqual(application);
  });
});
