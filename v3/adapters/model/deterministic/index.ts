import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  ModelDraftRequest,
  ModelDraftResponse,
  ModelErrorClass,
  StrategyDraftPort,
} from "../../../application/ports/model.js";
import { parseJsonInput } from "../../../core/strategy/validation/json-input.js";

/** One step of canned output: either a fixed rawText or a fixed error. */
export type FakeScenarioStep =
  | { readonly rawText: string }
  | { readonly error: { readonly class: ModelErrorClass; readonly message: string; readonly retryable: boolean } };

export type FakeScenarioTable = Readonly<Record<string, readonly FakeScenarioStep[]>>;

export interface DeterministicFakeAdapter extends StrategyDraftPort {
  /** For test observation: records every request received. */
  readonly requests: readonly ModelDraftRequest[];
}

interface ScenarioFileStep {
  readonly rawTextFile?: string;
  readonly error?: { readonly class: ModelErrorClass; readonly message: string; readonly retryable: boolean };
}

/**
 * Deterministic fake (contract 6.2): scenario-keyed canned output, no keyword
 * understanding; constructing with an unknown scenario throws immediately
 * (misuse guard). Stepping modes:
 * - "per-attempt" (default): the step is selected by request.attempt, so a
 *   repair sequence stays inside one logical draft round; an attempt beyond
 *   the sequence repeats the last step.
 * - "per-call": each draft() call consumes the next step regardless of
 *   attempt, so a multi-turn interview scenario scripts every call across
 *   turns (the final step repeats once the script is exhausted).
 * Injectable only by test wiring, never part of the hosts/local public flow.
 * provenance is always deterministic-fake and latencyMs is always 0
 * (deterministic — no wall clock involved).
 */
export function createDeterministicFakeAdapter(options: {
  readonly scenarios: FakeScenarioTable;
  readonly scenario: string;
  readonly stepping?: "per-attempt" | "per-call";
}): DeterministicFakeAdapter {
  const steps = options.scenarios[options.scenario];
  if (!steps || steps.length === 0) {
    throw new Error(`Unknown deterministic-fake scenario: ${options.scenario}`);
  }
  const requests: ModelDraftRequest[] = [];
  let callCount = 0;
  return {
    requests,
    draft(request: ModelDraftRequest): Promise<ModelDraftResponse> {
      requests.push(request);
      const index = options.stepping === "per-call" ? callCount : request.attempt;
      callCount += 1;
      const step = steps[Math.min(index, steps.length - 1)]!;
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

/** Reads scenarios.json from a fixtures directory along with the rawText files it references. */
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
