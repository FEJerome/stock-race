import { createServer, type Server } from "node:http";
import {
  createLocalComposition,
  type LocalComposition,
  type LocalCompositionOptions,
} from "./composition-root.js";
import { createLocalRequestHandler, type LocalRouteExtras } from "./routes.js";

export interface LocalServerHandle {
  readonly server: Server;
  readonly composition: LocalComposition;
  readonly url: string;
  close(): Promise<void>;
}

export interface LocalServerExtras extends LocalRouteExtras {
  /** Fixed port (default 0 = random free port, test-friendly). */
  readonly port?: number;
}

/**
 * Starts a loopback-only local API (contract 2.3 defaults to loopback only).
 * Without extras this is the plain JSON API; with extras (uiDir, slice pool,
 * fixed port) it becomes the playable S4 web slice. Port 0 picks a random
 * free port.
 */
export async function startLocalServer(
  options: LocalCompositionOptions,
  extras: LocalServerExtras = {},
): Promise<LocalServerHandle> {
  const composition = createLocalComposition(options);
  // The handler is created once: it now carries cross-request state (interview
  // session manager, atomic-write counter), so per-request construction would
  // silently drop sessions between turns.
  const handler = createLocalRequestHandler(composition, extras);
  const server = createServer((request, response) => {
    handler(request, response).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      }
      response.end(JSON.stringify({ code: "INTERNAL_ERROR", message: "unexpected host error" }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(extras.port ?? 0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("local server failed to bind");
  }
  return {
    server,
    composition,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export { createLocalComposition, createLocalRequestHandler };
export type { LocalComposition, LocalCompositionOptions, LocalRouteExtras };
