# SR-006 S0 零上下文独立复审

## 结论

PASS；无必修项，建议合并送审 commit `1836cef7d43399dc40ea4e1d8bb1c96cc1749a0d`。

## 核对范围

- `git diff --name-status f1dca0a..HEAD`：仅 34 个新增 `v3/` 文件；`git diff --name-only f1dca0a..HEAD -- ':!v3'` 为空。
- HEAD 与送审 commit 一致；复审后 tracked 工作区干净；`git diff --check f1dca0a..HEAD` 通过。
- 未见 S1、真实 Kimi、行情/外部数据访问、旧四模块改动或 golden 回填。8 个 golden 的 canonical/digest 与冻结契约逐项一致。

## 实际复跑

在维护者本机 `sr006-s0` worktree 的 `v3` 目录执行（原始绝对路径为私有环境路径，不再记录）：

```sh
npm ci && npm run check:generated && npm run typecheck && npm test
```

退出码 0：干净安装 77 packages；generated 同步；typecheck 通过；5 个测试文件、50 个测试全部通过。环境为 Windows 11 / Node v24.18.0 / npm 11.16.0。日志：`checks.log`、`checks-exit-code.txt`、`environment.txt`。

补充复测：

- `python -I -` 以内嵌契约向量调用标准库 `hashlib.sha256`：8/8 digest 独立复算一致，退出码 0。日志：`golden-recompute.log`。
- `./node_modules/.bin/vite-node ../.local/sr006-s0-review/supplemental-probes.ts`：退出码 0。嵌套重复键、错误分类、UTF-16 code-unit 键序、内部 HALF_EVEN 精确中点均通过；另记录空键、name/digest 与直接 Decimal 长度行为。日志：`supplemental-probes.log`。

## 既有证据核对

- `red.log` / exit 1：可编译中性桩上的 44 个行为断言失败，不是缺模块或编译失败；`red-base.txt` 为 `49b4a0d`。更早的 `red-engineering-attempt.log` 含缺夹具错误，但未被当作最终有效 red。
- `green.log` / exit 0：基线 `f1dca0a`，50/50 通过。
- `mutation.log` / exit 1：把换行从固定 `\n` 改为 `\u000a` 后两个行为测试失败；`post-mutation-green.log` 恢复后 50/50 通过。
- Chromium 证据是一次性探针，6 个已测向量的 canonical 字节与 digest 和 golden 一致；不是持续浏览器测试，也未覆盖全部 8 个向量。

## 非阻断观察

1. `json-dup-key-validator@1.0.3` 将合法空字符串键（包括重复空键）归为 `INVALID_JSON`；嵌套普通重复键能正确得到 `DUPLICATE_JSON_KEY`。当前 StrategyDraft 的动态 ID 限 ASCII，空键不构成有效策略字段，故不阻断 S0；通用 JSON 入口后续若需接受空键须另处理。
2. `normalizeDecimal` 直接调用没有局部原始长度护栏，10002 字符全零小数可规范化；`parseJsonInput` 外层已有 1 MiB 限制，符合“原始输入长度另设上限”的当前边界。后续非 JSON 调用入口需带上限。
3. 提交内测试没有单独的嵌套重复键与内部 HALF_EVEN 精确中点用例；本次补充探针已验证实际行为，可后续沉淀为回归测试。
4. `name` 是 schema 必需的 StrategyDraft 声明字段并计入 digest，改名会改变 digest；它不是独立于 AST 的模型辅助散文，符合当前对整个 canonical StrategyDraft 求 digest 的实现口径。

## 未验证项

- Node 20 与其他 OS 未运行。
- 未复跑 Chromium；仅审阅既有的一次性 6 向量探针结果，不主张持续浏览器测试或全向量浏览器覆盖。
- 未进行真实 Kimi、行情、外部数据、S1 或旧模块运行验证；这些均不在 S0 送审范围。
