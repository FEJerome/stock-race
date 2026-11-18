import type { RunSpec2 } from "../strategy/generated/run-spec-2.types.js";
import { normalizeDecimal } from "../strategy/canonical/decimal-profile.js";

function compareAssetId(left: { assetId: string }, right: { assetId: string }): number {
  // UTF-16 code-unit order, mirroring canonical JSON key ordering (no localeCompare).
  return left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0;
}

export function normalizeRunSpec2(runSpec: RunSpec2): RunSpec2 {
  return {
    ...runSpec,
    assets: [...runSpec.assets].sort(compareAssetId) as RunSpec2["assets"],
    data: {
      ...runSpec.data,
      snapshots: [...runSpec.data.snapshots].sort(compareAssetId) as RunSpec2["data"]["snapshots"],
    },
    account: {
      ...runSpec.account,
      initialCash: normalizeDecimal(runSpec.account.initialCash, "Money"),
    },
  };
}
