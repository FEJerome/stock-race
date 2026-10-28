import { ContractError } from "./errors.js";

export const UNICODE_PROFILE_VERSION = "unicode@1";

function assertWellFormed(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new ContractError("UNPAIRED_SURROGATE", "Unpaired high surrogate is forbidden");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new ContractError("UNPAIRED_SURROGATE", "Unpaired low surrogate is forbidden");
    }
  }
}

export function normalizeUnicode(value: unknown): unknown {
  if (typeof value === "string") {
    assertWellFormed(value);
    return value.normalize("NFC");
  }
  if (Array.isArray(value)) {
    return value.map(normalizeUnicode);
  }
  if (value !== null && typeof value === "object") {
    const result = Object.create(null) as Record<string, unknown>;
    const normalizedKeys = new Set<string>();
    for (const [key, child] of Object.entries(value)) {
      assertWellFormed(key);
      const normalizedKey = key.normalize("NFC");
      if (normalizedKeys.has(normalizedKey)) {
        throw new ContractError("DUPLICATE_NFC_KEY", `NFC key collision at ${normalizedKey}`);
      }
      normalizedKeys.add(normalizedKey);
      result[normalizedKey] = normalizeUnicode(child);
    }
    return result;
  }
  return value;
}

export function escapeJsonString(value: string): string {
  assertWellFormed(value);
  let escaped = '"';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    switch (code) {
      case 0x22:
        escaped += '\\"';
        break;
      case 0x5c:
        escaped += "\\\\";
        break;
      case 0x08:
        escaped += "\\b";
        break;
      case 0x09:
        escaped += "\\t";
        break;
      case 0x0a:
        escaped += "\\n";
        break;
      case 0x0c:
        escaped += "\\f";
        break;
      case 0x0d:
        escaped += "\\r";
        break;
      default:
        escaped += code <= 0x1f
          ? `\\u${code.toString(16).padStart(4, "0")}`
          : value[index];
    }
  }
  return `${escaped}"`;
}
