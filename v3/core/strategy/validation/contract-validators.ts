import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import commonSchema from "../schema/common.schema.json" with { type: "json" };
import capabilityManifestSchema from "../schema/capability-manifest.schema.json" with { type: "json" };
import readbackSchema from "../schema/readback.schema.json" with { type: "json" };
import type { CapabilityManifest } from "../generated/capability-manifest.types.js";
import type { Readback } from "../generated/readback.types.js";
import type { ValidationIssue } from "../generated/validation-issue.types.js";
import { ContractError } from "../canonical/errors.js";

const ajv = new Ajv2020({ allErrors: true, strict: true, coerceTypes: false, useDefaults: false });
ajv.addSchema(commonSchema);
ajv.addSchema(capabilityManifestSchema);
ajv.addSchema(readbackSchema);
const capabilityValidator = ajv.getSchema(capabilityManifestSchema.$id) as ValidateFunction;
const readbackValidator = ajv.getSchema(readbackSchema.$id) as ValidateFunction;

function validate(validator: ValidateFunction, value: unknown): ValidationIssue[] {
  if (validator(value)) return [];
  return (validator.errors ?? []).map((error) => {
    let path = error.instancePath;
    if (error.keyword === "required") path += `/${String(error.params.missingProperty)}`;
    if (error.keyword === "additionalProperties") path += `/${String(error.params.additionalProperty)}`;
    return {
      code: error.keyword === "additionalProperties" ? "ADDITIONAL_PROPERTY" : `SCHEMA_${error.keyword.toUpperCase()}`,
      severity: "error" as const,
      path,
      message: error.message ?? "JSON Schema validation failed",
    };
  }).sort((left, right) => {
    const leftKey = `${left.path}|${left.code}`;
    const rightKey = `${right.path}|${right.code}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

export function validateCapabilityManifest(value: unknown): ValidationIssue[] {
  return validate(capabilityValidator, value);
}

export function validateReadback(value: unknown): ValidationIssue[] {
  return validate(readbackValidator, value);
}

export function assertValidCapabilityManifest(value: unknown): asserts value is CapabilityManifest {
  const issues = validateCapabilityManifest(value);
  if (issues.length > 0) throw new ContractError("INVALID_CAPABILITY_MANIFEST", "CapabilityManifest schema validation failed");
}

export function assertValidReadback(value: unknown): asserts value is Readback {
  const issues = validateReadback(value);
  if (issues.length > 0) throw new ContractError("INVALID_READBACK", "Readback schema validation failed");
}
