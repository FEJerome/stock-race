# Documentation Index

Entry-level index of the `docs/` tree. Some historical documents are written in Chinese; English versions of core documents are being migrated progressively, with `docs/decisions/` and `docs/architecture/SYSTEM_ARCHITECTURE.md` prioritized.

## Directory guide

| Directory | Contents |
|---|---|
| [development/](development/) | Collaboration rules, quality gates, and development conventions. Key: [COLLABORATION.md](development/COLLABORATION.md), [CODING_STANDARDS.md](development/CODING_STANDARDS.md) |
| [features/](features/) | Task execution canon — goals, scope, interface/file changes, acceptance criteria, and verification records. Key: [features/README.md](features/README.md) |
| [decisions/](decisions/) | Formal technical decisions affecting project direction, interfaces, data, or safety boundaries. Key: [decisions/README.md](decisions/README.md) |
| [research/](research/) | Reviewable technical research and code-study evidence. Key: [research/README.md](research/README.md); long-term evidence in [research/evidence/](research/evidence/README.md) |
| [architecture/](architecture/) | Design documents formed in February 2026 — historical intent, not proof of current state. Key: [architecture/README.md](architecture/README.md), [SYSTEM_ARCHITECTURE.md](architecture/SYSTEM_ARCHITECTURE.md) |
| [usage/](usage/) | Environment guide and user-facing notes. Key: [QUICK_START.md](usage/QUICK_START.md), [IMPORTANT_NOTES.md](usage/IMPORTANT_NOTES.md), [USER_GUIDE.md](usage/USER_GUIDE.md) |
| [testing/](testing/) | Historical test and validation reports for the legacy four-service implementation |
| [deployment/](deployment/) | Historical deployment guides and production-readiness reports — not a current runbook |
| [modules/](modules/) | Per-module TODO and completion notes for the legacy `backend/` and `frontend/` |
| [analysis/](analysis/) | Early requirements, technology evaluation, and external-site analysis |
| [data_sources/](data_sources/) | Multi-source data strategy notes |
| [coordination/](coordination/) | Historical coordination, dependency, and progress records |
| [operations/](operations/) | Troubleshooting notes |
| [planning/](planning/) | Historical implementation phase plans |

## Loose historical files

Files at the root of `docs/` (e.g., `TYPESCRIPT_MIGRATION_REPORT.md`, `data_acquisition_plan.md`, `data_acquisition_implementation.md`, `dev_order_changes_summary.md`, `progress_report.md`) are historical records from the February 2026 implementation round; treat them as archive material and verify against current code before use.

## Reading order for new sessions

1. [Root README](../README.md) and [CLAUDE.md](../CLAUDE.md) for project-level rules and boundaries.
2. [development/COLLABORATION.md](development/COLLABORATION.md) and [development/CODING_STANDARDS.md](development/CODING_STANDARDS.md) for working conventions.
3. [usage/QUICK_START.md](usage/QUICK_START.md) for environment verification status.
4. Directory-specific READMEs above for deeper material.
