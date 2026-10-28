import type { BoolExpression, SeriesExpression, StrategyDraft } from "../generated/strategy-draft.types.js";
import type { ValidationIssue } from "../generated/validation-issue.types.js";
import { InternalDecimal } from "../canonical/rounding-profile.js";
import type { ObservationKind, Registry } from "../registry/types.js";

type SeriesType = "scalar" | "price" | "quantity" | "rate" | "state";
type IssueOptions = Partial<Pick<ValidationIssue, "expected" | "actual" | "hint" | "registryRef">>;

function issue(code: string, path: string, message: string, options: IssueOptions = {}): ValidationIssue {
  return { code, severity: "error", path, message, ...options };
}

function numeric(type: SeriesType | null): boolean {
  return type !== null && type !== "state";
}

export function validateStrategySemantics(
  strategy: StrategyDraft,
  registry: Registry,
  observationKind: ObservationKind,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const base = `/indicators`;

  for (const [id, usage] of Object.entries(strategy.indicators)) {
    const path = `${base}/${id}`;
    const definition = registry.indicators.get(usage.use);
    if (!definition) {
      issues.push(issue("UNKNOWN_INDICATOR", `${path}/use`, "未注册的指标或版本", {
        expected: "registry 中的 key@version",
        actual: usage.use,
        hint: "选择能力清单中的指标",
      }));
      continue;
    }
    if (!definition.causal) {
      issues.push(issue("NON_CAUSAL_INDICATOR", `${path}/use`, "指标必须满足因果性", { actual: usage.use }));
    }
    if (!definition.observationKinds.includes(observationKind)) {
      issues.push(issue("OBSERVATION_KIND_UNSUPPORTED", `${path}/use`, "指标不支持该 observation kind", {
        expected: [...definition.observationKinds], actual: observationKind,
      }));
    }
    const params = usage.params ?? {};
    for (const [name, spec] of Object.entries(definition.paramSchema)) {
      const value = params[name];
      if (value === undefined) {
        issues.push(issue("REQUIRED_INDICATOR_PARAM", `${path}/params/${name}`, "缺少指标参数", { expected: spec }));
      } else if (typeof value !== "number" || !Number.isSafeInteger(value) || value < spec.minimum || value > spec.maximum) {
        issues.push(issue("INVALID_INDICATOR_PARAM", `${path}/params/${name}`, "指标参数超出声明范围", { expected: spec, actual: value }));
      }
    }
    for (const name of Object.keys(params)) {
      if (!definition.paramSchema[name]) {
        issues.push(issue("UNKNOWN_INDICATOR_PARAM", `${path}/params/${name}`, "未声明的指标参数", { actual: params[name] }));
      }
    }
    if (usage.use === "macd@1" && typeof params.fast === "number" && typeof params.slow === "number" && params.fast >= params.slow) {
      issues.push(issue("INVALID_INDICATOR_PARAM", `${path}/params/fast`, "MACD fast 必须小于 slow", {
        expected: "fast < slow", actual: params.fast,
      }));
    }
  }

  function seriesType(expression: SeriesExpression, path: string): SeriesType | null {
    if ("const" in expression) return "scalar";
    if ("ref" in expression) {
      const context = registry.contextRefs.find((definition) => definition.ref === expression.ref);
      if (context) {
        if (!context.observationKinds.includes(observationKind)) {
          issues.push(issue("OBSERVATION_KIND_UNSUPPORTED", `${path}/ref`, "引用不支持该 observation kind", {
            expected: [...context.observationKinds], actual: observationKind,
          }));
          return null;
        }
        return context.type;
      }
      const separator = expression.ref.indexOf(".");
      if (separator > 0) {
        const id = expression.ref.slice(0, separator);
        const output = expression.ref.slice(separator + 1);
        const usage = strategy.indicators[id];
        const definition = usage ? registry.indicators.get(usage.use) : undefined;
        if (definition) {
          const outputDefinition = definition.outputs.find((item) => item.name === output);
          if (!outputDefinition) {
            issues.push(issue("UNKNOWN_INDICATOR_OUTPUT", `${path}/ref`, "未注册的指标输出", {
              expected: definition.outputs.map((item) => item.name), actual: output,
            }));
            return null;
          }
          return outputDefinition.type;
        }
      }
      issues.push(issue("UNKNOWN_REFERENCE", `${path}/ref`, "未声明或不可证明因果的引用", { actual: expression.ref }));
      return null;
    }
    if ("lag" in expression) return seriesType(expression.lag.input, `${path}/lag/input`);
    if ("registeredSeriesFn" in expression) {
      const fn = expression.registeredSeriesFn;
      if (!registry.seriesFunctions.has(fn.use)) {
        issues.push(issue("UNKNOWN_SERIES_FUNCTION", `${path}/registeredSeriesFn/use`, "未注册或非因果的序列函数", { actual: fn.use }));
      }
      fn.args.forEach((argument, index) => seriesType(argument, `${path}/registeredSeriesFn/args/${index}`));
      return null;
    }
    for (const operator of ["add", "sub", "mul", "div"] as const) {
      if (operator in expression) {
        const pair = (expression as unknown as Record<string, [SeriesExpression, SeriesExpression]>)[operator]!;
        const left = seriesType(pair[0], `${path}/${operator}/0`);
        const right = seriesType(pair[1], `${path}/${operator}/1`);
        if (!numeric(left) || !numeric(right)) {
          issues.push(issue("SERIES_TYPE_MISMATCH", `${path}/${operator}`, "算术运算要求数值序列", {
            expected: "numeric series", actual: [left, right],
          }));
          return null;
        }
        return left === right ? left : "scalar";
      }
    }
    issues.push(issue("UNKNOWN_SERIES_EXPRESSION", path, "未知序列表达式"));
    return null;
  }

  function bool(expression: BoolExpression, path: string): void {
    for (const operator of ["gt", "gte", "lt", "lte", "eq", "neq", "crossAbove", "crossBelow"] as const) {
      if (operator in expression) {
        const pair = (expression as unknown as Record<string, [SeriesExpression, SeriesExpression]>)[operator]!;
        const left = seriesType(pair[0], `${path}/${operator}/0`);
        const right = seriesType(pair[1], `${path}/${operator}/1`);
        if (!numeric(left) || !numeric(right)) {
          issues.push(issue("BOOL_TYPE_MISMATCH", `${path}/${operator}`, "比较或交叉要求数值序列", {
            expected: "numeric series",
            actual: [left, right],
          }));
        }
        return;
      }
    }
    if ("all" in expression) {
      expression.all.forEach((item, index) => bool(item, `${path}/all/${index}`));
      return;
    }
    if ("any" in expression) {
      expression.any.forEach((item, index) => bool(item, `${path}/any/${index}`));
      return;
    }
    if ("not" in expression) {
      bool(expression.not, `${path}/not`);
      return;
    }
    if ("within" in expression) {
      bool(expression.within.condition, `${path}/within/condition`);
      return;
    }
    issues.push(issue("UNKNOWN_BOOL_EXPRESSION", path, "未知布尔表达式"));
  }

  bool(strategy.entry, "/entry");
  strategy.exits.forEach((expression, index) => bool(expression, `/exits/${index}`));

  for (const [path, value] of [
    ["/position/entrySize/cashFraction", strategy.position.entrySize.cashFraction],
    ["/position/exitSize/positionFraction", strategy.position.exitSize.positionFraction],
  ] as const) {
    const decimal = new InternalDecimal(value);
    if (decimal.lte(0) || decimal.gt(1)) {
      issues.push(issue("INVALID_POSITION_FRACTION", path, "仓位比例必须大于 0 且不超过 1", {
        expected: "0 < fraction <= 1", actual: value,
      }));
    }
  }

  return issues.sort((left, right) => {
    const leftKey = `${left.path}|${left.code}|${left.message}`;
    const rightKey = `${right.path}|${right.code}|${right.message}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}
