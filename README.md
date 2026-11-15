# Stock-Race

> 中文读者：`docs/` 下部分文档为中文，核心篇目英文版迁移中（decisions 与 SYSTEM_ARCHITECTURE 优先）。

> **Note: the four legacy modules (`frontend/`, `backend/`, `ai-service/`, `data-service/`) are historical archives and do not represent current code quality or usability.**

Stock-Race is a project built around simulated stock trading, strategy validation, and model experimentation. This repository retains the early implementation formed in February 2026, which is being re-verified and reworked into a researchable, reproducible, and collaborative open-source tool project.

> **For simulation and research only — never connected to live trading. Claims of "complete" or "production-ready" status, or deployment descriptions in historical documents, do not represent current verified state.**

## What this repository contains

| Directory | Description |
|---|---|
| `frontend/` | React + TypeScript frontend (historical archive) |
| `backend/` | Node.js + Express business backend (historical archive) |
| `ai-service/` | Python + FastAPI model interaction and decision service (historical archive) |
| `data-service/` | Python + FastAPI market data collection and processing service (historical archive) |
| `v3/` | Active development area — TypeScript workspace (`core/`, `application/`, `adapters/`, `hosts/`, `tests/`) |
| `docs/` | Design, research, task, and collaboration documents; see [docs/README.md](docs/README.md) for the index |
| `scripts/` | Historical installation, demo, and validation scripts — must be reviewed before running |

The presence of these modules does not mean they can run together. Code, interfaces, dependencies, and data pipelines will be verified item by item in dedicated research and environment tasks.

## Current environment and safety boundaries

- This project is managed as a local development project; there is no online production instance to maintain.
- Actual `.env*` files may contain historical configuration or credentials and are not publishable examples; safety templates use `.env.example` uniformly.
- Until the environment guide completes verification, do not follow historical documents to perform system-level installs, database resets, or production deployments.
- Historical model APIs, data sources, and scripts may no longer work; do not call external paid services without an explicit task.

## Where to start reading

- Stable rules for project sessions: [CLAUDE.md](CLAUDE.md)
- Collaboration roles, quality gates, and workspace rules: [COLLABORATION.md](docs/development/COLLABORATION.md)
- Verified tech stack and development conventions: [CODING_STANDARDS.md](docs/development/CODING_STANDARDS.md)
- Environment verification status: [QUICK_START.md](docs/usage/QUICK_START.md)
- Task specifications and acceptance criteria: [features/](docs/features/README.md)
- Research evidence: [research/](docs/research/README.md)
- Technical decisions: [decisions/](docs/decisions/README.md)
- Credibility notes for early architecture material: [architecture/](docs/architecture/README.md)
- Full documentation index: [docs/README.md](docs/README.md)

## Documentation maintenance principles

Live task status is maintained by the project-designated STATUS ledger; this README does not duplicate task lists. Design details belong in feature or decision documents, research conclusions must carry evidence, and session messages or handoff drafts are not the final home of knowledge.

Environment startup commands will be added after configuration and dependency verification; until then, this repository makes no unverified "one-click startup" promises.
