import { describe, expect, it } from "vitest";
import { callChatCompletions } from "../../adapters/model/kimi/client.js";

const OPTIONS = {
  apiKey: "test-placeholder-not-a-real-key",
  modelId: "kimi-unprobed",
  baseUrl: "http://127.0.0.1:1",
  timeoutMs: 500,
};

const MESSAGES = [{ role: "user" as const, content: "ping" }];

describe("S3 re-review regression: kimi client error classification and retry boundaries", () => {
  it("s3-kimi-bad-output: 200 with a non-JSON body → BAD_OUTPUT, no retry", async () => {
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

  it("s3-kimi-retry-once: network errors retry exactly once, then surface as UNAVAILABLE", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const result = await callChatCompletions({ ...OPTIONS, fetchImpl }, MESSAGES);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.class).toBe("UNAVAILABLE");
    expect(calls).toBe(2); // initial call + exactly one retry
  });

  it("s3-kimi-429-no-retry: 429 is never retried, RATE_LIMITED surfaces immediately", async () => {
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
