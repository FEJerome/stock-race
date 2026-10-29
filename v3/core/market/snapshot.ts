import type { DataSnapshot } from "../strategy/generated/data-snapshot.types.js";
import { digestJson } from "../strategy/canonical/digest.js";
import { normalizeDecimal } from "../strategy/canonical/decimal-profile.js";
import { ContractError } from "../strategy/canonical/errors.js";

export function digestSnapshot(snapshot: DataSnapshot): string {
  const { digest: _digest, ...content } = snapshot;
  return digestJson(content);
}

export function validateSnapshotValues(snapshot: DataSnapshot): void {
  snapshot.sessions.forEach((session, sessionIndex) => {
    if (!session.bar) return;
    for (const field of ["open", "high", "low", "close", "signalOpen", "signalHigh", "signalLow", "signalClose"] as const) {
      const value = session.bar[field];
      if (value === undefined) continue;
      try {
        normalizeDecimal(value, "Price");
      } catch (error) {
        if (error instanceof ContractError) {
          throw new ContractError(error.code, error.message, `/sessions/${sessionIndex}/bar/${field}`);
        }
        throw error;
      }
    }
    try {
      normalizeDecimal(session.bar.volume, "Quantity");
    } catch (error) {
      if (error instanceof ContractError) {
        throw new ContractError(error.code, error.message, `/sessions/${sessionIndex}/bar/volume`);
      }
      throw error;
    }
  });
}

export function materializeSnapshot(snapshot: DataSnapshot): DataSnapshot {
  const digest = digestSnapshot(snapshot);
  if (snapshot.digest !== `sha256:${"0".repeat(64)}` && snapshot.digest !== digest) {
    throw new Error("SNAPSHOT_DIGEST_MISMATCH");
  }
  return { ...snapshot, digest };
}
