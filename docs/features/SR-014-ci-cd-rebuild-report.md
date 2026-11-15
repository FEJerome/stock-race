# SR-014 删旧 CI/CD 与 V3 CI 重建 — 执行报告

*Chinese working canon kept for traceability; not product documentation.*

- **执行人**：实施会话（执行验证台）
- **日期**：2026-11-15
- **分支**：`sr-014-cicd`（worktree，基线 origin/main = e3bc511）
- **授权**：维护者 2026-11-14 晚批准删除旧 CI/CD

## 结论

旧 `.github/workflows/ci.yml`、`cd.yml` 已删除；新建单个 `.github/workflows/v3.yml`，仅覆盖 v3/ 目录的依赖安装、生成物校验、类型检查、全量测试，无部署环节。全部 CI 命令已在 worktree 内本地实测通过。

## 旧 workflow 核查（只读调研结论）

- `ci.yml`：四个 job 分别对应旧四服务（backend / frontend / ai-service / data-service），依赖 postgres/redis service 容器与 `backend/`、`frontend/` 下的锁文件；末尾 docker-build job 推 Docker Hub。**无任何 v3/ 相关逻辑**。
- `cd.yml`：纯 Docker 构建推送 + 占位 k8s 部署/冒烟测试 + tag 发 release，全部面向旧四服务。**无任何 v3/ 相关逻辑**。
- 两份文件中的 secrets（DOCKER_USERNAME/PASSWORD、vars.PRODUCTION_API_URL）随文件一并退出使用，新 workflow 不引用任何 secrets/vars。
- 文档侧引用：`docs/architecture/CODE_MAP.md`、`docs/architecture/PROJECT_STRUCTURE.md`（2026-02 历史资料）仍提及 ci.yml/cd.yml 文件名。按协作底座，历史文档更新不归本任务，已挂账。

## 新 V3 CI 设计（.github/workflows/v3.yml）

- **触发**：push 至 main/develop、PR 指向 main，均带 `paths: v3/** + .github/workflows/v3.yml` 过滤（workflow 自身变更也触发）。
- **单 job `v3`**（ubuntu-latest，Node 20——与 v3/package.json `engines: >=20` 对齐）：
  1. `npm ci`（cache-dependency-path: v3/package-lock.json）
  2. `npm run check:generated`（JSON Schema 生成物漂移检查，先于编译失败更快）
  3. `npm run typecheck`（`tsc --noEmit`）
  4. `npm test`（`vitest run`，vitest.config.ts include `tests/**/*.test.ts`）
- 无部署、无 secrets、不触碰 v3/ 以外目录；注释均为英文技术向。

## 自验证据（worktree 内逐命令实测，2026-11-15）

本机 Node v24.13.1；v3/ 下原无 node_modules，以下均以干净 `npm ci` 后状态执行：

| 命令 | 结果 |
|---|---|
| `npm ci`（v3/） | 通过，0 vulnerabilities |
| `npm run check:generated` | 通过，输出 "Generated types are in sync with JSON Schema." |
| `npm run typecheck` | 通过，exit 0，无输出 |
| `npm test` | 通过，23 个测试文件 / 149 个用例全过，2.41s |
| YAML 语法校验（yaml CLI round-trip + valid） | 通过，结构回显与意图一致 |

未发现测试本地跑不通的情况，未改动任何 v3/ 业务代码。

## 变更清单

- 删除：`.github/workflows/ci.yml`、`.github/workflows/cd.yml`
- 新增：`.github/workflows/v3.yml`

## 挂账清单（移交规划台）

1. **历史文档引用未更新**：`docs/architecture/CODE_MAP.md:246-247,321-322`、`docs/architecture/PROJECT_STRUCTURE.md:90-91` 仍写 ci.yml/cd.yml，需随文档任务清理。
2. **分支策略待规划台确认**：新 CI 沿用旧触发面（push main/develop + PR main）；若后续采用主干直推或其他分支模型，触发条件需再调。
3. **合并与推送归规划台**：本分支严禁 push/merge，待复审后由规划台处置。
4. develop 分支目前与 main 的关系（是否需要 CI 兜底）未核验，按旧 workflow 惯例保留触发。
