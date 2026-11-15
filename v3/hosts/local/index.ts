import { createServer, type Server } from "node:http";
import {
  createLocalComposition,
  type LocalComposition,
  type LocalCompositionOptions,
} from "./composition-root.js";
import { createLocalRequestHandler } from "./routes.js";

export interface LocalServerHandle {
  readonly server: Server;
  readonly composition: LocalComposition;
  readonly url: string;
  close(): Promise<void>;
}

/** Starts a loopback-only local API (port 0 = random free port, test-friendly; contract 2.3 defaults to loopback only). */
export async function startLocalServer(options: LocalCompositionOptions): Promise<LocalServerHandle> {
  const composition = createLocalComposition(options);
  const server = createServer((request, response) => {
    createLocalRequestHandler(composition)(request, response).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      }
      response.end(JSON.stringify({ code: "INTERNAL_ERROR", message: "unexpected host error" }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
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
export type { LocalComposition, LocalCompositionOptions };
