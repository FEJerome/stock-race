# Stock-Race

Stock-Race 是一个围绕股票模拟交易、策略验证与模型实验展开的项目。当前仓库保留 2026 年 2 月形成的早期实现，正在重新核验并改造为可研究、可复现、可协作的开源工具项目。

> **仅用于模拟与研究，不接入实盘交易。历史文档中的“完成”“生产就绪”或部署描述，不代表当前已经验证。**

## 当前仓库包含什么

| 目录 | 历史实现 |
|---|---|
| `frontend/` | React + TypeScript 前端 |
| `backend/` | Node.js + Express 业务后端 |
| `ai-service/` | Python + FastAPI 模型交互与决策服务 |
| `data-service/` | Python + FastAPI 行情数据采集与处理服务 |
| `docs/` | 设计、调研、任务与协作文档 |
| `scripts/` | 历史安装、演示和验证脚本，运行前必须审查 |

这些模块的存在不等于它们已经能够协同运行。代码、接口、依赖和数据链将在独立调研与环境任务中逐项核验。

## 当前环境与安全边界

- 当前按本地开发项目管理，没有在线生产实例需要维护。
- 实际 `.env*` 文件可能含历史配置或凭据，不属于可公开示例；安全模板统一使用 `.env.example`。
- 在环境指南完成核验前，不要按历史文档执行系统安装、数据库重置或生产部署。
- 历史模型 API、数据源和脚本可能已失效，未经明确任务不调用外部付费服务。

## 从哪份文档开始

- 项目会话稳定规则：[CLAUDE.md](CLAUDE.md)
- 协作角色、质量闸与工作区规则：[协作规则](docs/development/COLLABORATION.md)
- 真实技术栈与开发约定：[开发约定](docs/development/CODING_STANDARDS.md)
- 环境核验状态：[环境指南](docs/usage/QUICK_START.md)
- 任务规格与验收：[feature 文档](docs/features/README.md)
- 调研证据：[research 文档](docs/research/README.md)
- 技术决策：[decision 文档](docs/decisions/README.md)
- 早期架构资料的可信度说明：[历史架构资料](docs/architecture/README.md)

## 文档维护原则

实时任务状态由项目指定的 STATUS 底账维护，README 不复制任务清单。方案细节归 feature 或 decision 文档，调研结论必须有证据，会话消息与交接草稿不作为最终知识住所。

环境启动命令将在配置和依赖核验后补充；在此之前，本仓库不提供未经验证的“一键启动”承诺。
