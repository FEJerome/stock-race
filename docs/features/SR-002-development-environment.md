# SR-002 开发环境与敏感配置治理

## 状态与目标

已在独立分支 `SR-002-env-governance` 完成最小环境治理，基线为本地 main `b5edf4f147152fb1ec0fd72aee8eb0931291ac8b`。本任务只处理环境文件跟踪、安全模板、本地数据忽略和环境文档，不构成旧服务或 V3 的运行验收。

目标是阻止实际环境文件继续进入未来提交，为旧配置提供不含真实凭据的参考，并保持 V3 TypeScript、本地 Web/CLI 与隔离数据探针的边界。

## 范围与非目标

实际变更仅包括：

- 六个实际环境文件仅从 Git 索引脱跟踪，当前工作区磁盘文件保留；
- 新增根 `.env.example`，安全更新旧四模块 `.env.example`；
- `.gitignore` 只新增根 `/v3-data/`；
- 更新 `docs/usage/QUICK_START.md`，新增本 feature。

未修改旧依赖、业务代码、数据库、部署配置或实际环境文件内容；未安装包、未启动服务、未调用外部接口，也未引入 V3 Kimi 配置。既有 `.local/v3-data-probe-20261027T1605` 探针未触碰。

## 配置治理口径

- 根模板只覆盖旧 Compose 插值变量，明确不是 V3 配置或生产部署指南。
- 旧模块模板使用 loopback 地址和 `__SET_LOCAL_ONLY__` 占位符；外部密钥留空，data-service 外部数据源默认关闭。
- backend 模板同时保留 Prisma 使用的 `DATABASE_URL` 与旧服务读取的 `DB_*`，并补齐旧服务间 API Key 的空白配置项。
- frontend 模板只保留代码实际读取的 `VITE_API_BASE_URL` 与 `VITE_WS_URL`，不包含密钥。
- V3 尚无包清单、锁文件或 Local composition root，因此本任务不创建空壳依赖或模型环境模板。后续首个工程切片须提交真实包清单和锁文件，并实际复现 Windows 安装与测试。

## 验证记录（2026-10-28）

全程未读取、打印或复制实际环境文件值。对含脱跟踪删除的 cached diff 只使用 `name-status`，未输出旧环境内容。

1. `git rm --cached -- <六个实际环境路径>`：成功，仅移除索引记录。
2. 对六路径逐一执行 `test -f`：全部通过，本机文件仍存在。
3. `git check-ignore -v --no-index -- <六个实际环境路径> .local/v3-data-probe-20261027T1605 v3-data/probe`：六路径均命中既有 `.env.*` 规则，探针命中 `.local/`，V3 数据命中新增 `/v3-data/`。
4. `git ls-files -- '*.env' '*.env.*' '**/.env' '**/.env.*'`：只剩根目录和旧四模块共五个 `.env.example`。
5. 对五个模板检索旧弱口令、旧占位密钥、`0.0.0.0` 和 `KIMI`：无匹配。
6. `git diff --cached --check -- <仅模板、.gitignore 和文档安全路径>`：通过，无空白错误。
7. `git diff --cached --name-status`：变更面仅为本文件“范围与非目标”列出的路径，无业务代码、依赖或主工作区其他文档。

## 未验证项与后续风险

- 未进行 V3 或旧四模块的依赖安装、构建、测试、启动或跨服务验证；V3 当前没有可声称通过的 npm 命令。
- 脱跟踪不会清除 Git 历史，不等于历史凭据已经脱敏。疑似有效凭据轮换、其他 checkout 的本机文件留存和历史治理须由维护者另案处理。
- `ai-service/src/ai_service/core/security.py` 的硬编码密钥、backend 的代码内弱默认值及根 `test_api_key.py` 的密钥打印行为不属于本任务修改面；相关历史脚本未运行，源码风险需独立安全任务处理。
- 模板安全化不证明旧服务可以使用这些配置启动；代码内默认值、依赖锁文件和旧基础设施兼容性仍待独立任务核验。
- 本任务交付后仍需未参与实施的独立会话复审；不授权 push 或 merge。
