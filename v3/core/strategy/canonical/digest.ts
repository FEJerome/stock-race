import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { canonicalizeJson } from "./canonical-json.js";

export function digestCanonical(canonical: string): string {
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(canonical)))}`;
}

export function digestJson(value: unknown): string {
  return digestCanonical(canonicalizeJson(value));
}
