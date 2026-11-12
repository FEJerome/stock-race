import { describe, expect, it } from "vitest";
import { confirmStrategy } from "../../application/confirm-strategy/index.js";
import { draftStrategy } from "../../application/draft-strategy/index.js";
import { digestJson } from "../../core/strategy/canonical/digest.js";
import { createCapabilityManifest } from "../../core/strategy/registry/capability-manifest.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { fakePort, tmpStrategyStore } from "../s3-helpers.js";

describe("S3 边界与标识", () => {
  it("s3-manifest-deterministic: createCapabilityManifest 输出 digest 固定（prompt 输入契约）", () => {
    const first = digestJson(createCapabilityManifest(createRegistryV1()));
    const second = digestJson(createCapabilityManifest(createRegistryV1()));
    expect(first).toBe(second);
    // golden 冻结值（2026-11-12 实施时算出并冻结）：任何 manifest 漂移都会打破本断言
    expect(first).toBe("sha256:03ed1d7aa51a6fb9ead4fb330d1743bf976f3a6d071aac586b66f35fac3f86bc");
  });

  it("s3-fake-not-counted-as-real: fake 产出在验收层可经 provenance 识别，且不进确认记录", async () => {
    const { store } = tmpStrategyStore();
    const result = await draftStrategy(fakePort("legal-macd-kdj"), { intent: "识别 fake" });
    if (!result.ok) throw new Error("draft should be valid");
    // 验收层可识别：每一次调用的 provider/modelId 都是 deterministic-fake
    expect(result.provenance.length).toBeGreaterThan(0);
    for (const entry of result.provenance) {
      expect(entry.provider).toBe("deterministic-fake");
      expect(entry.modelId).toBe("deterministic-fake");
    }
    // fake 标识不混入策略产物：canonical AST / digest / 回读中无 fake 字样
    expect(result.canonicalAst).not.toContain("deterministic-fake");
    expect(JSON.stringify(result.readback)).not.toContain("deterministic-fake");
    // ConfirmedRevision 只含 {strategyId, revision, digest, createdAt}，无 provenance 通道
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
