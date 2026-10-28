import { ContractError } from "./errors.js";
import { escapeJsonString, normalizeUnicode } from "./unicode-profile.js";

export const CANONICALIZATION_VERSION = "canonicalization@1";

function serialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return escapeJsonString(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new ContractError("UNSAFE_JSON_NUMBER", "Canonical JSON numbers must be safe integers");
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ContractError("UNSUPPORTED_JSON_VALUE", "Only plain JSON objects are supported");
    }
    const entries = Object.entries(value as Record<string, unknown>);
    entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, child]) => `${escapeJsonString(key)}:${serialize(child)}`).join(",")}}`;
  }
  throw new ContractError("UNSUPPORTED_JSON_VALUE", `Unsupported JSON value type: ${typeof value}`);
}

export function canonicalizeJson(value: unknown): string {
  return serialize(normalizeUnicode(value));
}
