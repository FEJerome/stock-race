import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { STORE_DIGEST_PATTERN } from "../../adapters/persistence/file/strategy-store.js";
import { confirmStrategy } from "../../application/confirm-strategy/index.js";
import { draftStrategy } from "../../application/draft-strategy/index.js";
import { runConfirmedBacktest } from "../../application/run-confirmed/index.js";
import type { StockRunInput } from "../../core/engine/types.js";
import { createCapabilityManifest } from "../../core/strategy/registry/capability-manifest.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { ContractError } from "../../core/strategy/canonical/errors.js";
import { parseJsonInput } from "../../core/strategy/validation/json-input.js";
import type { LocalComposition } from "./composition-root.js";

/**
 * node:http routes (loopback-only by default, contract 2.3):
 *   GET  /capabilities
 *   POST /strategies/draft
 *   POST /strategies/confirm
 *   POST /runs
 *   GET  /runs/:runDigest
 * provenance in responses passes the provider label through verbatim (fake
 * results must stay identifiable).
 */
export function createLocalRequestHandler(
  composition: LocalComposition,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const send = (response: ServerResponse, status: number, body: unknown): void => {
    const payload = JSON.stringify(body, null, 2);
    response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    response.end(payload);
  };

  const readBody = async (request: IncomingMessage): Promise<unknown> => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(chunk as Buffer);
    }
    return parseJsonInput(Buffer.concat(chunks).toString("utf8"));
  };

  let tempCounter = 0;
  /** Atomic write: temp file in the same directory + rename (final clause of contract 2.3). */
  const writeFileAtomic = async (file: string, content: string): Promise<void> => {
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp-${process.pid}-${(tempCounter += 1)}`;
    await writeFile(temp, content, "utf8");
    await rename(temp, file);
  };

  /** B1: runDigest may enter path joining only after passing the contract whitelist. */
  const runDigestPath = (runDigest: string): string => {
    if (!STORE_DIGEST_PATTERN.test(runDigest)) {
      throw new ContractError("INVALID_STORE_DIGEST", "runDigest 不符白名单");
    }
    return path.join(composition.dataRoot, "runs", `${runDigest.replace(/^sha256:/, "")}.json`);
  };

  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/capabilities") {
        send(response, 200, createCapabilityManifest(createRegistryV1()));
        return;
      }
      if (request.method === "POST" && url.pathname === "/strategies/draft") {
        const body = (await readBody(request)) as {
          intent?: string;
          conversation?: readonly { role: "user" | "assistant"; content: string }[];
          baseCanonicalAst?: string;
          observationKind?: "ohlcv" | "nav" | "index";
        };
        if (typeof body.intent !== "string" || body.intent.trim() === "") {
          send(response, 400, { code: "BAD_REQUEST", message: "intent 必须是非空字符串" });
          return;
        }
        const result = await draftStrategy(composition.modelPort, {
          intent: body.intent,
          ...(body.conversation !== undefined ? { conversation: body.conversation } : {}),
          ...(body.baseCanonicalAst !== undefined ? { baseCanonicalAst: body.baseCanonicalAst } : {}),
          ...(body.observationKind !== undefined ? { observationKind: body.observationKind } : {}),
        });
        if (result.status === "model-error") {
          send(response, 502, result);
          return;
        }
        send(response, 200, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/strategies/confirm") {
        const body = (await readBody(request)) as {
          strategyId?: string;
          currentDraft?: unknown;
          expectedDigest?: string;
        };
        if (body.currentDraft === undefined || typeof body.expectedDigest !== "string") {
          send(response, 400, { code: "BAD_REQUEST", message: "currentDraft 与 expectedDigest 必填" });
          return;
        }
        const result = await confirmStrategy(composition.store, {
          ...(body.strategyId !== undefined ? { strategyId: body.strategyId } : {}),
          currentDraft: body.currentDraft,
          expectedDigest: body.expectedDigest,
        });
        if (!result.ok) {
          send(response, result.code === "CONFIRM_DIGEST_MISMATCH" ? 409 : 422, result);
          return;
        }
        send(response, 200, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/runs") {
        const body = (await readBody(request)) as StockRunInput;
        const strategyRef = body?.runSpec?.strategy;
        if (
          !strategyRef ||
          typeof strategyRef.id !== "string" ||
          typeof strategyRef.revision !== "number" ||
          typeof strategyRef.digest !== "string"
        ) {
          send(response, 400, { code: "BAD_REQUEST", message: "runSpec.strategy.{id,revision,digest} 必填" });
          return;
        }
        const gated = await runConfirmedBacktest(composition.store, body);
        if (!gated.ok) {
          send(response, 409, gated);
          return;
        }
        const result = gated.result;
        await writeFileAtomic(runDigestPath(result.runDigest), JSON.stringify(result));
        send(response, 200, result);
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/runs/")) {
        const runDigest = decodeURIComponent(url.pathname.slice("/runs/".length));
        // Whitelist check stays outside the inner try: the ContractError must bubble to the unified catch and map to 400, never be swallowed into a 404
        const file = runDigestPath(runDigest);
        try {
          const content = await readFile(file, "utf8");
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          response.end(content);
        } catch {
          send(response, 404, { code: "RUN_NOT_FOUND", message: `未找到 run：${runDigest}` });
        }
        return;
      }
      send(response, 404, { code: "NOT_FOUND", message: `${request.method} ${url.pathname}` });
    } catch (error) {
      if (error instanceof ContractError) {
        send(response, 400, { code: error.code, message: error.message, path: error.path });
        return;
      }
      send(response, 500, { code: "INTERNAL_ERROR", message: "unexpected host error" });
    }
  };
}
