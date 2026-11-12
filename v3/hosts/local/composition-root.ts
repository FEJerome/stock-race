import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createKimiAdapter, type ModelRequestMetadata } from "../../adapters/model/kimi/index.js";
import { createFileStrategyStore } from "../../adapters/persistence/file/strategy-store.js";
import type { StrategyDraftPort } from "../../application/ports/model.js";
import type { StrategyStore } from "../../application/ports/strategy-store.js";

export interface LocalCompositionOptions {
  /** v3-data 根目录（确认/运行结果落盘）。 */
  readonly dataRoot: string;
  /** Kimi 凭据与模型配置；apiKey 经 secret provider 注入，不出现在任何返回值中。 */
  readonly kimi: {
    readonly apiKey: string;
    readonly modelId: string;
    readonly baseUrl?: string;
    readonly timeoutMs?: number;
  };
  /** 脱敏元数据落盘路径（.local/ 下）。 */
  readonly metadataLogPath?: string;
  /**
   * 显式测试装配开关（契约 6.2）：仅测试代码可注入 deterministic fake。
   * 对外主流程构造路径不接受此参数之外的任何 port 注入。
   */
  readonly testOverrides?: { readonly modelPort?: StrategyDraftPort };
}

export interface LocalComposition {
  /** 对外可见的 adapter 标识（用于「fake 不进真实主流程」断言）。 */
  readonly adapterInfo: { readonly provider: "kimi" | "test-override"; readonly modelId: string };
  readonly modelPort: StrategyDraftPort;
  readonly store: StrategyStore;
  readonly dataRoot: string;
}

/**
 * hosts/local 组合根（node:http 零依赖，decisions 2026-11-12 第 3 项）。
 * 默认仅装配真实 Kimi adapter；deterministic fake 只能经 testOverrides
 * 由测试显式注入，本模块不 import 任何 deterministic 实现。
 * prompt/响应原文不落盘；仅请求元数据追加到 metadataLogPath（.local/）。
 */
export function createLocalComposition(options: LocalCompositionOptions): LocalComposition {
  const store = createFileStrategyStore(options.dataRoot);
  const metadataSink = options.metadataLogPath
    ? (entry: ModelRequestMetadata): void => {
        mkdirSync(path.dirname(options.metadataLogPath!), { recursive: true });
        appendFileSync(options.metadataLogPath!, `${JSON.stringify(entry)}\n`, "utf8");
      }
    : undefined;
  if (options.testOverrides?.modelPort) {
    return {
      adapterInfo: { provider: "test-override", modelId: "injected-by-test" },
      modelPort: options.testOverrides.modelPort,
      store,
      dataRoot: options.dataRoot,
    };
  }
  return {
    adapterInfo: { provider: "kimi", modelId: options.kimi.modelId },
    modelPort: createKimiAdapter({
      apiKey: options.kimi.apiKey,
      modelId: options.kimi.modelId,
      ...(options.kimi.baseUrl !== undefined ? { baseUrl: options.kimi.baseUrl } : {}),
      ...(options.kimi.timeoutMs !== undefined ? { timeoutMs: options.kimi.timeoutMs } : {}),
      ...(metadataSink ? { metadataSink } : {}),
    }),
    store,
    dataRoot: options.dataRoot,
  };
}
