import type { RunSpec } from "../strategy/generated/run-spec.types.js";
import { normalizeDecimal } from "../strategy/canonical/decimal-profile.js";

export function normalizeRunSpec(runSpec: RunSpec): RunSpec {
  return {
    ...runSpec,
    account: {
      ...runSpec.account,
      initialCash: normalizeDecimal(runSpec.account.initialCash, "Money"),
    },
  };
}
