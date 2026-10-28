import type { StockRunInput } from "../../../core/engine/types.js";
import { materializeSnapshot } from "../../../core/market/snapshot.js";
import { digestStrategyDraft } from "../../../core/strategy/canonical/strategy-canonical.js";

export function prepareFixtureRun(input: StockRunInput): StockRunInput {
  const snapshot = materializeSnapshot({ ...input.snapshot, digest: `sha256:${"0".repeat(64)}` });
  return {
    ...input,
    snapshot,
    runSpec: {
      ...input.runSpec,
      strategy: { ...input.runSpec.strategy, digest: digestStrategyDraft(input.strategy) },
      data: { ...input.runSpec.data, snapshotDigest: snapshot.digest },
    },
  };
}
