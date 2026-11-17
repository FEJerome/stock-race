import { importSnapshot } from "../../application/import-snapshot/index.js";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return process.argv[index + 1]!;
}

const manifestIndex = process.argv.indexOf("--manifest");
const result = importSnapshot({
  preparedPath: argument("--prepared"),
  ...(manifestIndex >= 0 ? { manifestPath: argument("--manifest") } : {}),
  snapshotsRoot: argument("--snapshots-root"),
});
console.log(JSON.stringify(result, null, 2));
