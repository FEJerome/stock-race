import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { STORE_DIGEST_PATTERN, STORE_STRATEGY_ID_PATTERN } from "../../adapters/persistence/file/strategy-store.js";
import { loadSnapshotFile } from "../../adapters/market/snapshot-file/index.js";
import { confirmStrategy } from "../../application/confirm-strategy/index.js";
import { confirmStrategy2 } from "../../application/confirm-strategy/index.js";
import { draftStrategy } from "../../application/draft-strategy/index.js";
import { runConfirmedBacktest } from "../../application/run-confirmed/index.js";
import { runConfirmedPortfolio } from "../../application/run-confirmed/run-confirmed-portfolio.js";
import { analyzeSensitivity } from "../../application/analyze-sensitivity/index.js";
import type { StockRunInput } from "../../core/engine/types.js";
import type { DataSnapshot } from "../../core/market/types.js";
import { createCapabilityManifest } from "../../core/strategy/registry/capability-manifest.js";
import { createRegistryV1 } from "../../core/strategy/registry/v1.js";
import { ContractError } from "../../core/strategy/canonical/errors.js";
import { parseJsonInput } from "../../core/strategy/validation/json-input.js";
import type { RunSpec2 } from "../../core/strategy/generated/run-spec-2.types.js";
import type { StrategyDraft2 } from "../../core/strategy/generated/strategy-draft-2.types.js";
import type { LocalComposition } from "./composition-root.js";
import { listPool, encodeAssetIdForPath } from "./slice-pool.js";
import { InterviewSessionManager } from "./interview-sessions.js";

/** Optional host extras that turn the plain API into the playable S4 slice. */
export interface LocalRouteExtras {
  /** Directory with the static UI (index.html/styles.css/app.js/charts.js/ayi-logo.svg); absent ⇒ no static service. */
  readonly uiDir?: string;
  /** Slice snapshot pool (synthetic); backs GET /snapshots, the interview asset pool and portfolio run loading. */
  readonly pool?: readonly DataSnapshot[];
  /** Interview session manager; defaults to one built over the pool asset ids. */
  readonly sessions?: InterviewSessionManager;
}

/** Asset ids may enter path joining only after passing this whitelist (mirror of the digest whitelist rule). */
const ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,63}$/;

const STATIC_FILES: Readonly<Record<string, { readonly file: string; readonly contentType: string }>> = {
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" },
  "/charts.js": { file: "charts.js", contentType: "text/javascript; charset=utf-8" },
  "/ayi-logo.svg": { file: "ayi-logo.svg", contentType: "image/svg+xml" },
};

/**
 * node:http routes (loopback-only by default, contract 2.3):
 *   GET  /capabilities
 *   POST /strategies/draft                      (1.0.0 single-asset, unchanged)
 *   POST /strategies/confirm                    (1.0.0, unchanged)
 *   POST /strategies/confirm-2                  (2.0.0 four-cell confirmation)
 *   GET  /strategies                            (confirmed strategy index)
 *   GET  /strategies/:id/revisions
 *   POST /runs                                  (1.0.0, unchanged)
 *   GET  /runs/:runDigest                       (1.0.0, unchanged)
 *   POST /interview/start                       (four-cell interview session)
 *   POST /interview/turn
 *   GET  /snapshots                             (slice pool listing, source labelled)
 *   GET  /snapshots/:assetId                    (full frozen snapshot)
 *   POST /runs/portfolio                        (confirmed-gate portfolio run, persisted)
 *   GET  /runs/portfolio/:runDigest
 *   POST /runs/portfolio/:runDigest/sensitivity (overfitting gate, persisted)
 *   GET  /runs/portfolio/:runDigest/sensitivity
 *   GET  / and the static UI files              (only when uiDir is provided)
 * provenance in responses passes the provider label through verbatim (fake
 * results must stay identifiable).
 */
export function createLocalRequestHandler(
  composition: LocalComposition,
  extras: LocalRouteExtras = {},
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

  const portfolioRunPath = (runDigest: string): string => {
    if (!STORE_DIGEST_PATTERN.test(runDigest)) {
      throw new ContractError("INVALID_STORE_DIGEST", "runDigest 不符白名单");
    }
    return path.join(composition.dataRoot, "runs", "portfolio", `${runDigest.replace(/^sha256:/, "")}.json`);
  };

  const sensitivityPath = (runDigest: string): string => {
    if (!STORE_DIGEST_PATTERN.test(runDigest)) {
      throw new ContractError("INVALID_STORE_DIGEST", "runDigest 不符白名单");
    }
    return path.join(composition.dataRoot, "sensitivity", `${runDigest.replace(/^sha256:/, "")}.json`);
  };

  const sessions =
    extras.sessions ?? new InterviewSessionManager((extras.pool ?? []).map((snapshot) => snapshot.assetIdentity.assetId));

  /** Loads one frozen snapshot per runSpec binding and verifies each digest against the binding. */
  const loadRunSnapshots = (runSpec: RunSpec2): DataSnapshot[] => {
    return runSpec.data.snapshots.map((binding) => {
      if (!ASSET_ID_PATTERN.test(binding.assetId)) {
        throw new ContractError("INVALID_ASSET_ID", `assetId 不符白名单：${binding.assetId}`, "/data/snapshots");
      }
      const file = path.join(composition.dataRoot, "snapshots", encodeAssetIdForPath(binding.assetId), "snapshot.json");
      let snapshot: DataSnapshot;
      try {
        snapshot = loadSnapshotFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new ContractError("SNAPSHOT_NOT_FOUND", `未找到快照：${binding.assetId}`, "/data/snapshots");
        }
        throw error;
      }
      if (snapshot.digest !== binding.snapshotDigest) {
        throw new ContractError(
          "SNAPSHOT_DIGEST_MISMATCH",
          `快照 ${binding.assetId} 的 digest 与 RunSpec 绑定不符`,
          "/data/snapshots",
        );
      }
      return snapshot;
    });
  };

  const readPortfolioRunFile = async (runDigest: string) => {
    const file = portfolioRunPath(runDigest);
    try {
      return parseJsonInput(await readFile(file, "utf8")) as { runSpec: RunSpec2; result: unknown };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };

  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      // ── Static UI (only when the host provides a uiDir) ──────────────────
      const staticEntry = STATIC_FILES[url.pathname];
      if (request.method === "GET" && staticEntry !== undefined) {
        if (extras.uiDir === undefined) {
          send(response, 404, { code: "NOT_FOUND", message: "static UI not enabled" });
          return;
        }
        try {
          const content = await readFile(path.join(extras.uiDir, staticEntry.file));
          response.writeHead(200, { "content-type": staticEntry.contentType, "cache-control": "no-store" });
          response.end(content);
        } catch {
          send(response, 404, { code: "NOT_FOUND", message: staticEntry.file });
        }
        return;
      }

      if (request.method === "GET" && url.pathname === "/capabilities") {
        send(response, 200, createCapabilityManifest(createRegistryV1()));
        return;
      }

      // ── Interview (four-cell slot filling) ───────────────────────────────
      if (request.method === "POST" && url.pathname === "/interview/start") {
        let body: { style?: string; baseCanonicalAst?: string } = {};
        try {
          body = ((await readBody(request)) ?? {}) as typeof body;
        } catch {
          body = {};
        }
        const style = body.style ?? "novice";
        const session = sessions.start({
          style,
          port: composition.createInterviewPort(style),
          ...(body.baseCanonicalAst !== undefined ? { baseCanonicalAst: body.baseCanonicalAst } : {}),
        });
        send(response, 200, {
          sessionId: session.id,
          style: session.style,
          status: session.state.status,
          slots: session.state.slots,
          assetPool: extras.pool !== undefined ? listPool(extras.pool) : session.state.assetPool,
          adapterInfo: composition.adapterInfo,
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/interview/turn") {
        const body = (await readBody(request)) as { sessionId?: string; text?: string };
        if (typeof body.sessionId !== "string" || typeof body.text !== "string" || body.text.trim() === "") {
          send(response, 400, { code: "BAD_REQUEST", message: "sessionId 与非空 text 必填" });
          return;
        }
        const session = sessions.get(body.sessionId);
        if (session === null) {
          send(response, 404, { code: "INTERVIEW_NOT_FOUND", message: `未找到面试会话：${body.sessionId}` });
          return;
        }
        const result = await sessions.turn(session, body.text);
        if (result.kind === "model-error") {
          send(response, 502, result);
          return;
        }
        send(response, 200, result);
        return;
      }

      // ── Slice pool snapshots (synthetic; source always labelled) ─────────
      if (request.method === "GET" && url.pathname === "/snapshots") {
        if (extras.pool === undefined) {
          send(response, 404, { code: "NOT_FOUND", message: "slice pool not enabled" });
          return;
        }
        send(response, 200, { source: "hand-authored-synthetic", assets: listPool(extras.pool) });
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/snapshots/")) {
        const assetId = decodeURIComponent(url.pathname.slice("/snapshots/".length));
        if (!ASSET_ID_PATTERN.test(assetId)) {
          send(response, 400, { code: "INVALID_ASSET_ID", message: "assetId 不符白名单" });
          return;
        }
        const snapshot = extras.pool?.find((entry) => entry.assetIdentity.assetId === assetId);
        if (snapshot === undefined) {
          send(response, 404, { code: "SNAPSHOT_NOT_FOUND", message: `池内未找到资产：${assetId}` });
          return;
        }
        send(response, 200, snapshot);
        return;
      }

      // ── Strategies ───────────────────────────────────────────────────────
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
      if (request.method === "POST" && url.pathname === "/strategies/confirm-2") {
        const body = (await readBody(request)) as {
          strategyId?: string;
          currentDraft?: unknown;
          expectedDigest?: string;
        };
        if (body.currentDraft === undefined || typeof body.expectedDigest !== "string") {
          send(response, 400, { code: "BAD_REQUEST", message: "currentDraft 与 expectedDigest 必填" });
          return;
        }
        const result = await confirmStrategy2(composition.store, {
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
      if (request.method === "GET" && url.pathname === "/strategies") {
        const indexDir = path.join(composition.dataRoot, "strategies", "index");
        let files: string[] = [];
        try {
          files = await readdir(indexDir);
        } catch {
          files = [];
        }
        const strategies: { strategyId: string; revisions: unknown[] }[] = [];
        for (const file of files.sort()) {
          const strategyId = file.replace(/\.json$/, "");
          if (!STORE_STRATEGY_ID_PATTERN.test(strategyId)) continue;
          const record = parseJsonInput(await readFile(path.join(indexDir, file), "utf8")) as {
            strategyId: string;
            confirmations: unknown[];
          };
          strategies.push({ strategyId: record.strategyId, revisions: record.confirmations });
        }
        send(response, 200, { strategies });
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/strategies/") && url.pathname.endsWith("/revisions")) {
        const strategyId = decodeURIComponent(
          url.pathname.slice("/strategies/".length, -"/revisions".length),
        );
        if (!STORE_STRATEGY_ID_PATTERN.test(strategyId)) {
          send(response, 400, { code: "INVALID_STRATEGY_ID", message: "strategyId 不符白名单" });
          return;
        }
        const file = path.join(composition.dataRoot, "strategies", "index", `${strategyId}.json`);
        try {
          const record = parseJsonInput(await readFile(file, "utf8")) as {
            strategyId: string;
            confirmations: unknown[];
          };
          send(response, 200, { strategyId: record.strategyId, revisions: record.confirmations });
        } catch {
          send(response, 404, { code: "STRATEGY_NOT_FOUND", message: `未找到策略：${strategyId}` });
        }
        return;
      }

      // ── Runs (1.0.0 single-asset, unchanged) ─────────────────────────────
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

      // ── Portfolio runs (2.0.0) ───────────────────────────────────────────
      if (request.method === "POST" && url.pathname === "/runs/portfolio") {
        const body = (await readBody(request)) as { runSpec?: RunSpec2 };
        const runSpec = body?.runSpec;
        const strategyRef = runSpec?.strategy;
        if (
          !runSpec ||
          !strategyRef ||
          typeof strategyRef.id !== "string" ||
          typeof strategyRef.revision !== "number" ||
          typeof strategyRef.digest !== "string"
        ) {
          send(response, 400, { code: "BAD_REQUEST", message: "runSpec.strategy.{id,revision,digest} 必填" });
          return;
        }
        const canonicalAst = await composition.store.loadCanonicalAst(strategyRef.digest);
        if (canonicalAst === null) {
          send(response, 409, {
            ok: false,
            code: "STRATEGY_NOT_CONFIRMED",
            message: `策略草稿 ${strategyRef.digest} 未经确认，拒绝运行`,
          });
          return;
        }
        const strategy = parseJsonInput(canonicalAst) as StrategyDraft2;
        const snapshots = loadRunSnapshots(runSpec);
        const gated = await runConfirmedPortfolio(composition.store, { strategy, runSpec, snapshots });
        if (!gated.ok) {
          send(response, 409, gated);
          return;
        }
        const result = gated.result;
        await writeFileAtomic(
          portfolioRunPath(result.runDigest),
          JSON.stringify({ runSpec, result }),
        );
        send(response, 200, result);
        return;
      }
      if (url.pathname.startsWith("/runs/portfolio/")) {
        const rest = decodeURIComponent(url.pathname.slice("/runs/portfolio/".length));
        const isSensitivity = rest.endsWith("/sensitivity");
        const runDigest = isSensitivity ? rest.slice(0, -"/sensitivity".length) : rest;
        if (isSensitivity) {
          if (request.method === "POST") {
            const stored = await readPortfolioRunFile(runDigest);
            if (stored === null) {
              send(response, 404, { code: "RUN_NOT_FOUND", message: `未找到组合 run：${runDigest}` });
              return;
            }
            const snapshots = loadRunSnapshots(stored.runSpec);
            const analysis = await analyzeSensitivity(composition.store, {
              runSpec: stored.runSpec,
              snapshots,
            });
            if (!analysis.ok) {
              send(response, 409, analysis);
              return;
            }
            const artifact = {
              baseRunDigest: runDigest,
              createdAt: new Date().toISOString(),
              report: analysis.report,
              omitted: analysis.omitted,
            };
            await writeFileAtomic(sensitivityPath(runDigest), JSON.stringify(artifact, null, 2));
            send(response, 200, artifact);
            return;
          }
          if (request.method === "GET") {
            try {
              const content = await readFile(sensitivityPath(runDigest), "utf8");
              response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
              response.end(content);
            } catch {
              send(response, 404, { code: "SENSITIVITY_NOT_FOUND", message: `未找到敏感性报告：${runDigest}` });
            }
            return;
          }
        }
        if (request.method === "GET" && !isSensitivity) {
          const stored = await readPortfolioRunFile(runDigest);
          if (stored === null) {
            send(response, 404, { code: "RUN_NOT_FOUND", message: `未找到组合 run：${runDigest}` });
            return;
          }
          send(response, 200, stored);
          return;
        }
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
