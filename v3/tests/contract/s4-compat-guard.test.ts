import { describe, expect, it } from "vitest";
import { digestJson, digestStrategyDraft } from "../../core/strategy/index.js";
import { readJsonFixture } from "../helpers.js";

// Content-addressed tripwire for every pre-S4 golden/vector file. Frozen digests were
// computed independently (Python standard-library canonical JSON) against the files at
// baseline main=8c1778c on 2026-11-17. Any drift in these files — value, ordering, or
// content — breaks this guard. Byte-level freezing is additionally enforced by review-time
// git diff; content digests are used here so the guard is line-ending agnostic across hosts.
const frozenGoldenContentDigests: Record<string, string> = {
  "canonical-vectors.json": "sha256:ebfc5ae70e74c6b48243910f15cbba7b8be1053b710b29e45906357d63f91dee",
  "expression-v1.json": "sha256:284f2de559f76a58f499c4a9992ecffbce54a88c6ea28215cfdf40439d054efc",
  "macd-kdj-v1.json": "sha256:f24753af23b428aa33c49d003b36fcd78e5b6e5794ee4e2353e627cf5917a840",
  "readback-v1.json": "sha256:992ce1a88fc0b791a0f8dc5eec0ce550ffb68503984179ed0e425e7be0fbfe29",
  "s2-basic-run.json": "sha256:45175212ff56ffc3bca96de76788dafb7142156991d39cf5bca191f2ee19ab6d",
};

describe("S4 compatibility guard: pre-S4 goldens and vectors stay frozen", () => {
  it("no pre-S4 golden content changed since baseline main=8c1778c", () => {
    for (const [file, frozen] of Object.entries(frozenGoldenContentDigests)) {
      expect(digestJson(readJsonFixture(`golden/${file}`)), file).toBe(frozen);
    }
  });

  it("the frozen MACD+KDJ 1.0.0 draft keeps its digest under the new code", () => {
    const draft = readJsonFixture("fixtures/strategy/valid/macd-kdj.json");
    expect(digestStrategyDraft(draft)).toBe(
      "sha256:e9607146942e44a9cab28721958a3bfcfa2a0fbafde14b6f7932cec7e77fd9c0",
    );
  });
});
