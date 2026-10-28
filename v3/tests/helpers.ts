import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const testRoot = path.dirname(fileURLToPath(import.meta.url));

export function readFixture(relativePath: string): string {
  return readFileSync(path.join(testRoot, relativePath), "utf8");
}

export function readJsonFixture(relativePath: string): unknown {
  return JSON.parse(readFixture(relativePath));
}
