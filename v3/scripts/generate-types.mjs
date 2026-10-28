import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileFromFile } from "json-schema-to-typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "core", "strategy", "schema");
const outputDir = path.join(root, "core", "strategy", "generated");
const checkOnly = process.argv.includes("--check");
const artifacts = [
  ["common.schema.json", "common.types.ts", "Common"],
  ["strategy-draft.schema.json", "strategy-draft.types.ts", "StrategyDraft"],
  ["validation-issue.schema.json", "validation-issue.types.ts", "ValidationIssue"],
  ["capability-manifest.schema.json", "capability-manifest.types.ts", "CapabilityManifest"],
  ["readback.schema.json", "readback.types.ts", "Readback"],
  ["run-spec.schema.json", "run-spec.types.ts", "RunSpec"],
  ["data-snapshot.schema.json", "data-snapshot.types.ts", "DataSnapshot"],
  ["run-event.schema.json", "run-event.types.ts", "RunEvent"],
  ["report.schema.json", "report.types.ts", "Report"],
];

const options = {
  bannerComment: "/* Generated from JSON Schema. Do not edit manually. */",
  style: { singleQuote: true },
};

let drifted = false;
for (const [schemaFile, outputFile, name] of artifacts) {
  const generated = await compileFromFile(path.join(schemaDir, schemaFile), name, options);
  const destination = path.join(outputDir, outputFile);
  if (checkOnly) {
    let current;
    try {
      current = await readFile(destination, "utf8");
    } catch {
      current = null;
    }
    if (current !== null && current.replace(/\r\n/g, "\n") !== generated.replace(/\r\n/g, "\n")) {
      console.error(`Generated type drift: ${path.relative(root, destination)}`);
      drifted = true;
    } else if (current === null) {
      console.error(`Generated type missing: ${path.relative(root, destination)}`);
      drifted = true;
    }
  } else {
    await mkdir(outputDir, { recursive: true });
    await writeFile(destination, generated, "utf8");
    console.log(`Generated ${path.relative(root, destination)}`);
  }
}

if (drifted) {
  process.exitCode = 1;
} else if (checkOnly) {
  console.log("Generated types are in sync with JSON Schema.");
}
