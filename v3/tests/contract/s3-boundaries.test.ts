import { describe, expect, it } from "vitest";
import { confirmStrategy } from "../../application/confirm-strategy/index.js";
import { draftStrategy } from "../../application/draft-strategy/index.js";
import { digestJson } from "../../core/strategy/canonical/digest.js";
import { createCapabilityManifest } from "../../core/strategy/registry/capability-manifest.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { fakePort, tmpStrategyStore } from "../s3-helpers.js";

describe("S3 boundaries and identities", () => {
  it("s3-manifest-deterministic: createCapabilityManifest output digest is fixed (prompt-input contract)", () => {
    const first = digestJson(createCapabilityManifest(createRegistryV1()));
    const second = digestJson(createCapabilityManifest(createRegistryV1()));
    expect(first).toBe(second);
    // golden frozen value (computed and frozen at implementation on 2026-11-12): any manifest drift breaks this assertion
    expect(first).toBe("sha256:03ed1d7aa51a6fb9ead4fb330d1743bf976f3a6d071aac586b66f35fac3f86bc");
  });

  it("s3-fake-not-counted-as-real: fake output is identifiable at acceptance time via provenance and never enters confirmation records", async () => {
    const { store } = tmpStrategyStore();
    const result = await draftStrategy(fakePort("legal-macd-kdj"), { intent: "识别 fake" });
    if (!result.ok) throw new Error("draft should be valid");
    // Identifiable at acceptance: every call's provider/modelId is deterministic-fake
    expect(result.provenance.length).toBeGreaterThan(0);
    for (const entry of result.provenance) {
      expect(entry.provider).toBe("deterministic-fake");
      expect(entry.modelId).toBe("deterministic-fake");
    }
    // The fake label never leaks into strategy artifacts: no fake marker in canonical AST / digest / readback
    expect(result.canonicalAst).not.toContain("deterministic-fake");
    expect(JSON.stringify(result.readback)).not.toContain("deterministic-fake");
    // ConfirmedRevision contains only {strategyId, revision, digest, createdAt} — no provenance channel
    const confirmed = await confirmStrategy(
      store,
      { currentDraft: JSON.parse(result.canonicalAst), expectedDigest: result.strategyDigest },
      { now: () => "2026-11-12T08:00:00.000Z" },
    );
    if (!confirmed.ok) throw new Error("confirm should succeed");
    expect(Object.keys(confirmed.confirmation).sort()).toEqual([
      "createdAt",
      "digest",
      "revision",
      "strategyId",
    ]);
  });
});
