import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConfirmationAllocation, StrategyStore } from "../../../application/ports/strategy-store.js";
import { digestCanonical } from "../../../core/strategy/canonical/digest.js";
import { ContractError } from "../../../core/strategy/canonical/errors.js";
import type { ConfirmedRevision } from "../../../core/strategy/generated/confirmed-revision.types.js";

/** 契约白名单：digest=sha256:64hex；strategyId=strategy-XXXXXX。进文件层前强制执行。 */
export const STORE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const STORE_STRATEGY_ID_PATTERN = /^strategy-[0-9]{6}$/;

export function assertStoreDigest(digest: string): void {
  if (!STORE_DIGEST_PATTERN.test(digest)) {
    throw new ContractError("INVALID_STORE_DIGEST", `digest 不符白名单：${digest.slice(0, 32)}…`);
  }
}

export function assertStoreStrategyId(strategyId: string): void {
  if (!STORE_STRATEGY_ID_PATTERN.test(strategyId)) {
    throw new ContractError("INVALID_STRATEGY_ID", `strategyId 不符白名单：${strategyId.slice(0, 32)}…`);
  }
}

let tempCounter = 0;

/** 原子写：同目录临时文件 + rename，不完整写入不得被当作成功（契约 2.3 末句）。 */
async function writeFileAtomic(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${(tempCounter += 1)}`;
  await writeFile(temp, content, "utf8");
  await rename(temp, file);
}

interface StrategyIndex {
  readonly strategyId: string;
  readonly confirmations: ConfirmedRevision[];
}

/**
 * v3-data/strategies/ 文件布局（decisions 2026-11-12 第 4 项）：
 *   <rootDir>/strategies/counter.json                             strategyId 计数器
 *   <rootDir>/strategies/<digest-hex>/strategy.json               canonical AST 原文
 *   <rootDir>/strategies/<digest-hex>/confirmations/<id>-r<n>.json ConfirmedRevision
 *   <rootDir>/strategies/index/<strategyId>.json                  revision 索引
 * digest 含 "sha256:" 前缀，落盘路径只取 hex 段（Windows 文件名禁冒号）。
 * 所有路径输入先过白名单；变更操作经单进程串行队列生效。
 */
export function createFileStrategyStore(rootDir: string): StrategyStore {
  const strategiesDir = path.join(rootDir, "strategies");
  const indexDir = path.join(strategiesDir, "index");
  const counterPath = path.join(strategiesDir, "counter.json");

  const digestDir = (digest: string): string => {
    assertStoreDigest(digest);
    return path.join(strategiesDir, digest.replace(/^sha256:/, ""));
  };
  const indexPath = (strategyId: string): string => {
    assertStoreStrategyId(strategyId);
    return path.join(indexDir, `${strategyId}.json`);
  };

  // M3：单进程串行队列——分配 id/revision 与落盘作为一个关键段生效，并发不重号。
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = queue.then(operation, operation);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
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
    async hasStrategy(strategyId: string): Promise<boolean> {
      assertStoreStrategyId(strategyId);
      return (await readJson<StrategyIndex>(indexPath(strategyId))) !== null;
    },

    async commitConfirmation(allocation: ConfirmationAllocation, canonicalAst: string): Promise<ConfirmedRevision> {
      assertStoreDigest(allocation.digest);
      if (allocation.strategyId !== undefined) assertStoreStrategyId(allocation.strategyId);
      return enqueue(async () => {
        let strategyId = allocation.strategyId;
        if (strategyId === undefined) {
          const counter = (await readJson<{ next: number }>(counterPath)) ?? { next: 1 };
          strategyId = `strategy-${String(counter.next).padStart(6, "0")}`;
          await writeFileAtomic(counterPath, `${JSON.stringify({ next: counter.next + 1 }, null, 2)}\n`);
        }
        const index = await readIndex(strategyId);
        const record: ConfirmedRevision = {
          strategyId,
          revision: index.confirmations.length + 1,
          digest: allocation.digest,
          createdAt: allocation.createdAt,
        };
        const dir = digestDir(allocation.digest);
        await writeFileAtomic(path.join(dir, "strategy.json"), canonicalAst);
        await writeFileAtomic(
          path.join(dir, "confirmations", `${record.strategyId}-r${record.revision}.json`),
          `${JSON.stringify(record, null, 2)}\n`,
        );
        const nextIndex: StrategyIndex = {
          strategyId,
          confirmations: [...index.confirmations, record].sort((left, right) => left.revision - right.revision),
        };
        await writeFileAtomic(indexPath(strategyId), `${JSON.stringify(nextIndex, null, 2)}\n`);
        return record;
      });
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
      let content: string;
      try {
        content = await readFile(path.join(digestDir(digest), "strategy.json"), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      // 契约 2.3 末句：读取时校验内容 digest，不完整/被篡改内容不得当作成功
      if (digestCanonical(content) !== digest) {
        throw new ContractError("STORE_CONTENT_DIGEST_MISMATCH", `策略内容与 digest 不符：${digest}`);
      }
      return content;
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
