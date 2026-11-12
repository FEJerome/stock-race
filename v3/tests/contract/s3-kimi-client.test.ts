import { describe, expect, it } from "vitest";
import { callChatCompletions } from "../../adapters/model/kimi/client.js";

const OPTIONS = {
  apiKey: "test-placeholder-not-a-real-key",
  modelId: "kimi-unprobed",
  baseUrl: "http://127.0.0.1:1",
  timeoutMs: 500,
};

const MESSAGES = [{ role: "user" as const, content: "ping" }];

describe("S3 复审回归：kimi client 错误分类与重试边界", () => {
  it("s3-kimi-bad-output: 200 但非 JSON 响应体 → BAD_OUTPUT，不重试", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("<html>not json</html>", { status: 200 });
    }) as typeof fetch;
    const result = await callChatCompletions({ ...OPTIONS, fetchImpl }, MESSAGES);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.class).toBe("BAD_OUTPUT");
    expect(result.error.retryable).toBe(false);
    expect(calls).toBe(1);
  });

  it("s3-kimi-retry-once: 网络错误仅重试一次，随后 UNAVAILABLE 上浮", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const result = await callChatCompletions({ ...OPTIONS, fetchImpl }, MESSAGES);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.class).toBe("UNAVAILABLE");
    expect(calls).toBe(2); // 首发 + 恰好一次重试
  });

  it("s3-kimi-429-no-retry: 429 不重试，RATE_LIMITED 直接上浮", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("{}", { status: 429 });
    }) as typeof fetch;
    const result = await callChatCompletions({ ...OPTIONS, fetchImpl }, MESSAGES);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.class).toBe("RATE_LIMITED");
    expect(calls).toBe(1);
  });
});
