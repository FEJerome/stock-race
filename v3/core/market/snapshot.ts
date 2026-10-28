import type { DataSnapshot } from "../strategy/generated/data-snapshot.types.js";
import { digestJson } from "../strategy/canonical/digest.js";

export function digestSnapshot(snapshot: DataSnapshot): string {
  const { digest: _digest, ...content } = snapshot;
  return digestJson(content);
}

export function materializeSnapshot(snapshot: DataSnapshot): DataSnapshot {
  const digest = digestSnapshot(snapshot);
  if (snapshot.digest !== `sha256:${"0".repeat(64)}` && snapshot.digest !== digest) {
    throw new Error("SNAPSHOT_DIGEST_MISMATCH");
  }
  return { ...snapshot, digest };
}
