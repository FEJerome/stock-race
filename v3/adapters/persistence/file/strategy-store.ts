import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StrategyStore } from "../../../application/ports/strategy-store.js";
import type { ConfirmedRevision } from "../../../core/strategy/generated/confirmed-revision.types.js";

/**
 * v3-data/strategies/ 文件布局（decisions 2026-11-12 第 4 项）：
 *   <rootDir>/strategies/counter.json                             strategyId 计数器
 *   <rootDir>/strategies/<digest-hex>/strategy.json               canonical AST 原文
 *   <rootDir>/strategies/<digest-hex>/confirmations/<id>-r<n>.json ConfirmedRevision
 *   <rootDir>/strategies/index/<strategyId>.json                  revision 索引
 * digest 含 "sha256:" 前缀，落盘路径只取 hex 段（Windows 文件名禁冒号）。
 */
export function createFileStrategyStore(rootDir: string): StrategyStore {
  const strategiesDir = path.join(rootDir, "strategies");
  const indexDir = path.join(strategiesDir, "index");
  const counterPath = path.join(strategiesDir, "counter.json");

  const digestDir = (digest: string): string => path.join(strategiesDir, digest.replace(/^sha256:/, ""));
  const indexPath = (strategyId: string): string => path.join(indexDir, `${strategyId}.json`);

  interface StrategyIndex {
    readonly strategyId: string;
    readonly confirmations: ConfirmedRevision[];
  }

  async function readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async function readIndex(strategyId: string): Promise<StrategyIndex> {
    const existing = await readJson<StrategyIndex>(indexPath(strategyId));
    return existing ?? { strategyId, confirmations: [] };
  }

  return {
    async allocateStrategyId(): Promise<string> {
      await mkdir(strategiesDir, { recursive: true });
      const counter = (await readJson<{ next: number }>(counterPath)) ?? { next: 1 };
      const id = `strategy-${String(counter.next).padStart(6, "0")}`;
      await writeFile(counterPath, `${JSON.stringify({ next: counter.next + 1 }, null, 2)}\n`, "utf8");
      return id;
    },

    async nextRevision(strategyId: string): Promise<number> {
      const index = await readIndex(strategyId);
      return index.confirmations.length + 1;
    },

    async saveConfirmation(record: ConfirmedRevision, canonicalAst: string): Promise<void> {
      const dir = digestDir(record.digest);
      await mkdir(path.join(dir, "confirmations"), { recursive: true });
      await mkdir(indexDir, { recursive: true });
      await writeFile(path.join(dir, "strategy.json"), canonicalAst, "utf8");
      await writeFile(
        path.join(dir, "confirmations", `${record.strategyId}-r${record.revision}.json`),
        `${JSON.stringify(record, null, 2)}\n`,
        "utf8",
      );
      const index = await readIndex(record.strategyId);
      index.confirmations.push(record);
      index.confirmations.sort((left, right) => left.revision - right.revision);
      await writeFile(indexPath(record.strategyId), `${JSON.stringify(index, null, 2)}\n`, "utf8");
    },

    async findConfirmation(strategyId: string, revision: number): Promise<ConfirmedRevision | null> {
      const index = await readJson<StrategyIndex>(indexPath(strategyId));
      return index?.confirmations.find((entry) => entry.revision === revision) ?? null;
    },

    async listConfirmations(strategyId: string): Promise<readonly ConfirmedRevision[]> {
      const index = await readIndex(strategyId);
      return [...index.confirmations].sort((left, right) => left.revision - right.revision);
    },

    async loadCanonicalAst(digest: string): Promise<string | null> {
      try {
        return await readFile(path.join(digestDir(digest), "strategy.json"), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}

/** 供测试/诊断枚举：列出 index 目录下已知 strategyId。 */
export async function listStrategyIds(rootDir: string): Promise<readonly string[]> {
  try {
    const files = await readdir(path.join(rootDir, "strategies", "index"));
    return files.filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, ""));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
