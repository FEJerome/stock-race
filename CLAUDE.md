# Stock-Race 协作底座

本文件只承载所有项目会话必须稳定知道的事实与边界。实时任务、在飞状态和资源占用由维护者指定的规划信源承载，不写入本文件。

## 项目事实

- 本仓库是 Stock-Race 的历史代码基线，主要代码形成于 2026 年 2 月；文档中的完成度、可用性和部署描述不代表现状已验证。
- 代码分为四个模块：`frontend/`（React + TypeScript）、`backend/`（Node.js + Express）、`ai-service/`（Python + FastAPI）、`data-service/`（Python + FastAPI）。
- 项目只用于模拟交易、策略研究及相关工具实验，**不得接入实盘交易**。
- 当前没有需要维护的生产实例。历史部署文档不是当前运行手册。

## 默认安全边界

- 未经任务明确授权，不安装依赖、不启动服务、不修改数据库、不部署，也不调用付费模型或外部数据写入接口。
- `.env`、`.env.local`、`.env.production`、`.env.test` 等实际环境文件一律按敏感资料处理；除 `.env.example` 外，不因调研而读取、打印或复制其中的值。
- 凭据不得进入对话、日志、测试快照、提交或公开文档。发现疑似有效凭据时，只报告文件与变量名，先由维护者决定处置。
- 不执行历史文档中的清库、重置、系统级安装或生产部署命令。历史脚本也须先审查，再按当次任务授权运行。
- 业务代码、环境治理由独立任务处理；协作底座任务不得顺手修改业务实现。

## 新会话启动

1. 先读本文件和当次任务卡，确认任务编号、目标、范围、交付物与验收条件。
2. 按任务需要阅读 [协作规则](docs/development/COLLABORATION.md)、[开发约定](docs/development/CODING_STANDARDS.md) 和相关 feature 文档。
3. 直接核对相关代码、测试和依赖清单；不要为“了解全貌”加载全部历史文档。
4. 环境任务先读 [环境指南](docs/usage/QUICK_START.md)，架构调研先读 [历史资料说明](docs/architecture/README.md)。
5. 需要写时间戳时，先从系统取得真实日期时间；不要估算。

## 文档信任顺序

1. 当前任务契约与验收条件；
2. 实际代码、测试、依赖清单和运行证据；
3. `docs/features/`、`docs/research/`、`docs/decisions/` 中经核验的记录；
4. 其他 2026 年 2 月形成的设计、完成报告和部署文档，仅作历史参考。

文档之间冲突时，先报告并核实，不选择最方便的一份照做。

## 协作与 Git 边界

- 角色是岗位，不绑定固定会话名或人格。规划、执行、检验、机械修改与复审的职责见协作规则。
- 执行会话默认只处理当次任务，不自行扩大范围、派单、合并或分配共享资源；维护者对具体动作的直接授权优先。
- `main` 是共享基线。实施任务使用独立工作区和分支，不在主工作区直接提交。
- 提交前审查变更面，只添加明确文件，禁止全量 `git add`；提交、合并和推送按当次授权执行。
- 执行者必须自验；代码、多文件配置和环境改动须由未参与实施的独立会话复审。用户可见的呈现变化还须维护者终审。
- 跨会话消息只用于提问、交货和求裁，重要结论必须回到任务文档。

## 文档入口

| 用途 | 入口 |
|---|---|
| 人类项目入口 | [README.md](README.md) |
| 协作角色与质量闸 | [docs/development/COLLABORATION.md](docs/development/COLLABORATION.md) |
| 开发约定 | [docs/development/CODING_STANDARDS.md](docs/development/CODING_STANDARDS.md) |
| 任务执行正典 | [docs/features/](docs/features/README.md) |
| 调研证据 | [docs/research/](docs/research/README.md) |
| 技术决策 | [docs/decisions/](docs/decisions/README.md) |
| 环境指南 | [docs/usage/QUICK_START.md](docs/usage/QUICK_START.md) |
| 历史架构资料说明 | [docs/architecture/README.md](docs/architecture/README.md) |
