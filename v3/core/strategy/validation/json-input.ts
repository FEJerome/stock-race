import duplicateKeyValidator from "json-dup-key-validator";
import { ContractError } from "../canonical/errors.js";

export const JSON_INPUT_LIMITS = {
  maxBytes: 1_048_576,
  maxDepth: 64,
} as const;

const INTEGER_TOKEN = /^-?(0|[1-9][0-9]*)$/;
const MAX_SAFE_INTEGER = 9007199254740991n;
const MIN_SAFE_INTEGER = -9007199254740991n;

function isDelimiter(character: string | undefined): boolean {
  return character === undefined || character === "," || character === "]" || character === "}" || /\s/.test(character);
}

function scanInput(input: string): void {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      depth += 1;
      if (depth > JSON_INPUT_LIMITS.maxDepth) {
        throw new ContractError("JSON_DEPTH_EXCEEDED", "JSON input exceeds maximum depth");
      }
      continue;
    }
    if (character === "}" || character === "]") {
      depth -= 1;
      continue;
    }
    if (character === "-" || (character !== undefined && character >= "0" && character <= "9")) {
      const start = index;
      index += 1;
      while (!isDelimiter(input[index])) {
        index += 1;
      }
      const token = input.slice(start, index);
      index -= 1;
      if (!INTEGER_TOKEN.test(token)) {
        throw new ContractError("UNSAFE_JSON_NUMBER_TOKEN", `Forbidden JSON number token: ${token}`);
      }
      const integer = BigInt(token);
      if (integer > MAX_SAFE_INTEGER || integer < MIN_SAFE_INTEGER) {
        throw new ContractError("UNSAFE_JSON_NUMBER_TOKEN", `JSON integer exceeds safe range: ${token}`);
      }
    }
  }
}

export function parseJsonInput(input: string): unknown {
  if (new TextEncoder().encode(input).length > JSON_INPUT_LIMITS.maxBytes) {
    throw new ContractError("JSON_SIZE_EXCEEDED", "JSON input exceeds maximum UTF-8 byte length");
  }
  scanInput(input);

  const duplicateError = duplicateKeyValidator.validate(input);
  if (duplicateError !== undefined) {
    throw new ContractError(
      duplicateError.includes("duplicated keys") ? "DUPLICATE_JSON_KEY" : "INVALID_JSON",
      duplicateError,
    );
  }

  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    throw new ContractError("INVALID_JSON", error instanceof Error ? error.message : "Invalid JSON");
  }
}
