import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startLocalServer, type LocalServerHandle } from "../../hosts/local/index.js";
import { createDeterministicFakeAdapter } from "../../adapters/model/deterministic/index.js";
import { testRoot } from "../helpers.js";
import { fakePort, fakeScenarios, tmpDataRoot } from "../s3-helpers.js";

const KIMI_TEST_CONFIG = { apiKey: "test-placeholder-not-a-real-key", modelId: "kimi-unprobed" };

async function postJson(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

describe("S3 hosts/local 组合根边界（node:http 零依赖）", () => {
  it("s3-fake-not-in-local-root: 对外组合根只装配真实 adapter；fake 无命中 scenario 即抛错", async () => {
    const handle: LocalServerHandle = await startLocalServer({
      dataRoot: tmpDataRoot(),
      kimi: KIMI_TEST_CONFIG,
    });
    try {
      expect(handle.composition.adapterInfo.provider).toBe("kimi");
      expect(handle.composition.adapterInfo.modelId).toBe("kimi-unprobed");
    } finally {
      await handle.close();
    }
    // 看护：hosts/local 源码不得 import deterministic fake 实现
    const hostsDir = path.resolve(testRoot, "..", "hosts", "local");
    for (const file of readdirSync(hostsDir)) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(path.join(hostsDir, file), "utf8");
      expect(source.includes("model/deterministic")).toBe(false);
    }
    // 防误用：无命中 scenario 构造即抛错
    expect(() =>
      createDeterministicFakeAdapter({ scenarios: fakeScenarios(), scenario: "no-such-scenario" }),
    ).toThrow();
  });

  it("s3-fake-provenance-label: fake 结果经 Local API 透出 deterministic-fake 标识", async () => {
    const handle = await startLocalServer({
      dataRoot: tmpDataRoot(),
      kimi: KIMI_TEST_CONFIG,
      testOverrides: { modelPort: fakePort("legal-macd-kdj") },
    });
    try {
      expect(handle.composition.adapterInfo.provider).toBe("test-override");
      const { status, json } = await postJson(`${handle.url}/strategies/draft`, {
        intent: "MACD 三日内金叉，KDJ 过滤",
      });
      expect(status).toBe(200);
      const body = json as { status: string; provenance: Array<{ provider: string; modelId: string }> };
      expect(body.status).toBe("valid");
      expect(body.provenance.length).toBeGreaterThan(0);
      expect(body.provenance.every((entry) => entry.provider === "deterministic-fake")).toBe(true);
      expect(JSON.stringify(body)).toContain("deterministic-fake");
    } finally {
      await handle.close();
    }
  });

  it("s3-real-failure-no-fallback: 真实 adapter 失败 → model-error，不触碰 fake", async () => {
    const handle = await startLocalServer({
      dataRoot: tmpDataRoot(),
      kimi: { ...KIMI_TEST_CONFIG, baseUrl: "http://127.0.0.1:1", timeoutMs: 1000 },
    });
    try {
      const { status, json } = await postJson(`${handle.url}/strategies/draft`, {
        intent: "真实模型不可达时必须原样失败",
      });
      expect(status).toBe(502);
      const body = json as {
        status: string;
        errorCode: string;
        provenance: Array<{ provider: string; errorClass?: string }>;
      };
      expect(body.status).toBe("model-error");
      expect(body.provenance.length).toBeGreaterThan(0);
      expect(body.provenance.every((entry) => entry.provider === "kimi")).toBe(true);
      expect(JSON.stringify(body)).not.toContain("deterministic-fake");
    } finally {
      await handle.close();
    }
  });

  it("s3-local-run-gate: 未确认策略经 Local API 构造 run → 409 STRATEGY_NOT_CONFIRMED", async () => {
    const handle = await startLocalServer({
      dataRoot: tmpDataRoot(),
      kimi: KIMI_TEST_CONFIG,
      testOverrides: { modelPort: fakePort("legal-macd-kdj") },
    });
    try {
      const snapshot = JSON.parse(
        readFileSync(path.join(testRoot, "fixtures", "s2", "basic-snapshot.json"), "utf8"),
      ) as unknown;
      const runSpec = JSON.parse(
        readFileSync(path.join(testRoot, "fixtures", "s2", "basic-run-spec.json"), "utf8"),
      ) as { strategy: unknown; data: Record<string, unknown> };
      const strategy = JSON.parse(
        readFileSync(path.join(testRoot, "fixtures", "s3", "legal-macd-kdj.json"), "utf8"),
      ) as unknown;
      runSpec.strategy = { id: "strategy-000001", revision: 1, digest: `sha256:${"0".repeat(64)}` };
      const { status, json } = await postJson(`${handle.url}/runs`, { strategy, runSpec, snapshot });
      expect(status).toBe(409);
      expect((json as { code: string }).code).toBe("STRATEGY_NOT_CONFIRMED");
    } finally {
      await handle.close();
    }
  });
});
