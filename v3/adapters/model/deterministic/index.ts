import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  ModelDraftRequest,
  ModelDraftResponse,
  ModelErrorClass,
  StrategyDraftPort,
} from "../../../application/ports/model.js";
import { parseJsonInput } from "../../../core/strategy/validation/json-input.js";

/** canned 输出的一步：要么固定 rawText，要么固定错误。 */
export type FakeScenarioStep =
  | { readonly rawText: string }
  | { readonly error: { readonly class: ModelErrorClass; readonly message: string; readonly retryable: boolean } };

export type FakeScenarioTable = Readonly<Record<string, readonly FakeScenarioStep[]>>;

export interface DeterministicFakeAdapter extends StrategyDraftPort {
  /** 测试观测用：记录每次收到的请求。 */
  readonly requests: readonly ModelDraftRequest[];
}

interface ScenarioFileStep {
  readonly rawTextFile?: string;
  readonly error?: { readonly class: ModelErrorClass; readonly message: string; readonly retryable: boolean };
}

/**
 * deterministic fake（契约 6.2）：scenario 键控 canned 输出，不做关键字理解；
 * 无命中 scenario 构造即抛错（防误用）；attempt 超出序列时重复最后一步。
 * 只能由测试装配注入，不进 hosts/local 对外主流程。
 * provenance 恒为 deterministic-fake，latencyMs 恒 0（确定性，不引墙钟）。
 */
export function createDeterministicFakeAdapter(options: {
  readonly scenarios: FakeScenarioTable;
  readonly scenario: string;
}): DeterministicFakeAdapter {
  const steps = options.scenarios[options.scenario];
  if (!steps || steps.length === 0) {
    throw new Error(`Unknown deterministic-fake scenario: ${options.scenario}`);
  }
  const requests: ModelDraftRequest[] = [];
  return {
    requests,
    draft(request: ModelDraftRequest): Promise<ModelDraftResponse> {
      requests.push(request);
      const step = steps[Math.min(request.attempt, steps.length - 1)]!;
      const provenance = {
        provider: "deterministic-fake" as const,
        modelId: "deterministic-fake",
        attempt: request.attempt,
        latencyMs: 0,
        ...("error" in step ? { errorClass: step.error.class } : {}),
      };
      if ("error" in step) {
        return Promise.resolve({ ok: false, error: step.error, provenance });
      }
      return Promise.resolve({ ok: true, rawText: step.rawText, provenance });
    },
  };
}

/** 从 fixtures 目录读取 scenarios.json 与其引用的 rawText 文件。 */
export function loadFakeScenarios(dir: string): FakeScenarioTable {
  const index = parseJsonInput(readFileSync(path.join(dir, "scenarios.json"), "utf8")) as Record<
    string,
    { attempts: readonly ScenarioFileStep[] }
  >;
  const table: Record<string, readonly FakeScenarioStep[]> = {};
  for (const [name, scenario] of Object.entries(index)) {
    table[name] = scenario.attempts.map((step) => {
      if (step.rawTextFile !== undefined) {
        return { rawText: readFileSync(path.join(dir, step.rawTextFile), "utf8") };
      }
      if (step.error) {
        return { error: step.error };
      }
      throw new Error(`Invalid scenario step in ${name}: need rawTextFile or error`);
    });
  }
  return table;
}

export type { ModelDraftResponse };
