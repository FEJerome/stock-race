import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import commonSchema from "../schema/common.schema.json" with { type: "json" };
import strategyDraftSchema from "../schema/strategy-draft.schema.json" with { type: "json" };
import strategyDraft2Schema from "../schema/strategy-draft-2.schema.json" with { type: "json" };
import runSpec2Schema from "../schema/run-spec-2.schema.json" with { type: "json" };
import report2Schema from "../schema/report-2.schema.json" with { type: "json" };
import sensitivityReportSchema from "../schema/sensitivity-report.schema.json" with { type: "json" };
import validationIssueSchema from "../schema/validation-issue.schema.json" with { type: "json" };
import type { StrategyDraft2 } from "../generated/strategy-draft-2.types.js";
import type { RunSpec2 } from "../generated/run-spec-2.types.js";
import type { Report2 } from "../generated/report-2.types.js";
import type { SensitivityReport } from "../generated/sensitivity-report.types.js";
import type { ValidationIssue } from "../generated/validation-issue.types.js";
import { ContractError } from "../canonical/errors.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
ajv.addSchema(commonSchema);
ajv.addSchema(strategyDraftSchema);
ajv.addSchema(validationIssueSchema);
ajv.addSchema(strategyDraft2Schema);
ajv.addSchema(runSpec2Schema);
ajv.addSchema(report2Schema);
ajv.addSchema(sensitivityReportSchema);

const draft2Validator = ajv.getSchema(strategyDraft2Schema.$id) as ValidateFunction;
const runSpec2Validator = ajv.getSchema(runSpec2Schema.$id) as ValidateFunction;
const report2Validator = ajv.getSchema(report2Schema.$id) as ValidateFunction;
const sensitivityReportValidator = ajv.getSchema(sensitivityReportSchema.$id) as ValidateFunction;

function escapePointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function actualAtPath(root: unknown, path: string): unknown {
  if (path === "") return root;
  let current = root;
  for (const rawSegment of path.slice(1).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function issueFromError(error: ErrorObject, root: unknown): ValidationIssue {
  let path = error.instancePath;
  let code = "SCHEMA_VALIDATION_FAILED";
  if (error.keyword === "required") {
    path = `${path}/${escapePointer(String(error.params.missingProperty))}`;
    code = "REQUIRED_PROPERTY";
  } else if (error.keyword === "additionalProperties") {
    path = `${path}/${escapePointer(String(error.params.additionalProperty))}`;
    code = "ADDITIONAL_PROPERTY";
  } else if (error.keyword === "const" && (path === "/schemaVersion" || path === "/runSpecVersion" || path === "/reportVersion" || path === "/sensitivityReportVersion")) {
    code = "UNSUPPORTED_SCHEMA_VERSION";
  } else if (error.keyword === "const") {
    code = "SCHEMA_CONST_MISMATCH";
  } else if (error.keyword === "type") {
    code = "SCHEMA_TYPE_MISMATCH";
  } else if (error.keyword === "pattern") {
    code = "SCHEMA_PATTERN_MISMATCH";
  } else if (error.keyword === "minimum" || error.keyword === "maximum") {
    code = "SCHEMA_RANGE_MISMATCH";
  } else if (error.keyword === "oneOf" || error.keyword === "anyOf") {
    code = "SCHEMA_UNION_MISMATCH";
  } else if (error.keyword === "enum") {
    code = "SCHEMA_ENUM_MISMATCH";
  } else if (error.keyword === "propertyNames") {
    code = "INVALID_PROPERTY_NAME";
  } else if (error.keyword === "minItems" || error.keyword === "maxItems" || error.keyword === "minLength" || error.keyword === "maxLength" || error.keyword === "uniqueItems") {
    code = "SCHEMA_SIZE_MISMATCH";
  }

  const issue: ValidationIssue = {
    code,
    severity: "error",
    path,
    message: error.message ?? "JSON Schema validation failed",
  };
  const actual = actualAtPath(root, path);
  if (actual !== undefined) issue.actual = actual;
  if (typeof error.schema === "string" || typeof error.schema === "number" || typeof error.schema === "boolean") {
    issue.expected = error.schema;
  }
  return issue;
}

function validate(validator: ValidateFunction, value: unknown): ValidationIssue[] {
  if (validator(value)) return [];
  return (validator.errors ?? [])
    .map((error) => issueFromError(error, value))
    .sort((left, right) => {
      const leftKey = `${left.path}${left.code}${left.message}`;
      const rightKey = `${right.path}${right.code}${right.message}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}

export class Schema2ValidationError extends ContractError {
  readonly issues: ValidationIssue[];

  constructor(artifact: string, issues: ValidationIssue[]) {
    super(`${artifact}_SCHEMA_INVALID`, `${artifact} does not satisfy its JSON Schema`);
    this.issues = issues;
  }
}

export function validateStrategyDraft2(value: unknown): ValidationIssue[] {
  return validate(draft2Validator, value);
}

export function assertValidStrategyDraft2(value: unknown): asserts value is StrategyDraft2 {
  const issues = validateStrategyDraft2(value);
  if (issues.length > 0) throw new Schema2ValidationError("STRATEGY_DRAFT_2", issues);
}

export function validateRunSpec2(value: unknown): ValidationIssue[] {
  return validate(runSpec2Validator, value);
}

export function assertValidRunSpec2(value: unknown): asserts value is RunSpec2 {
  const issues = validateRunSpec2(value);
  if (issues.length > 0) throw new Schema2ValidationError("RUN_SPEC_2", issues);
}

export function validateReport2(value: unknown): ValidationIssue[] {
  return validate(report2Validator, value);
}

export function assertValidReport2(value: unknown): asserts value is Report2 {
  const issues = validateReport2(value);
  if (issues.length > 0) throw new Schema2ValidationError("REPORT_2", issues);
}

export function validateSensitivityReport(value: unknown): ValidationIssue[] {
  return validate(sensitivityReportValidator, value);
}

export function assertValidSensitivityReport(value: unknown): asserts value is SensitivityReport {
  const issues = validateSensitivityReport(value);
  if (issues.length > 0) throw new Schema2ValidationError("SENSITIVITY_REPORT", issues);
}
