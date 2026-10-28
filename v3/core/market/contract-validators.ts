import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import commonSchema from "../strategy/schema/common.schema.json" with { type: "json" };
import runSpecSchema from "../strategy/schema/run-spec.schema.json" with { type: "json" };
import dataSnapshotSchema from "../strategy/schema/data-snapshot.schema.json" with { type: "json" };
import runEventSchema from "../strategy/schema/run-event.schema.json" with { type: "json" };
import reportSchema from "../strategy/schema/report.schema.json" with { type: "json" };
import type { ValidationIssue } from "../strategy/generated/validation-issue.types.js";

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, coerceTypes: false, useDefaults: false });
for (const schema of [commonSchema, runSpecSchema, dataSnapshotSchema, runEventSchema, reportSchema]) ajv.addSchema(schema);
const validators = {
  runSpec: ajv.getSchema(runSpecSchema.$id) as ValidateFunction,
  snapshot: ajv.getSchema(dataSnapshotSchema.$id) as ValidateFunction,
  event: ajv.getSchema(runEventSchema.$id) as ValidateFunction,
  report: ajv.getSchema(reportSchema.$id) as ValidateFunction,
};

function validate(validator: ValidateFunction, value: unknown): ValidationIssue[] {
  if (validator(value)) return [];
  return (validator.errors ?? []).map((error) => ({
    code: `SCHEMA_${error.keyword.toUpperCase()}`,
    severity: "error" as const,
    path: `${error.instancePath}${error.keyword === "required" ? `/${String(error.params.missingProperty)}` : ""}${error.keyword === "additionalProperties" ? `/${String(error.params.additionalProperty)}` : ""}`,
    message: error.message ?? "Schema validation failed",
  }));
}

export function validateRunSpec(value: unknown): ValidationIssue[] { return validate(validators.runSpec, value); }
export function validateDataSnapshot(value: unknown): ValidationIssue[] { return validate(validators.snapshot, value); }
export function validateRunEvent(value: unknown): ValidationIssue[] { return validate(validators.event, value); }
export function validateReport(value: unknown): ValidationIssue[] { return validate(validators.report, value); }
