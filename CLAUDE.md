# Stock-Race Collaboration Baseline

This file carries only the facts and boundaries that every project session must know reliably. Live task state and resource allocation are maintained in the maintainer's planning system and are not written here.

## Project Facts

- This repository is the historical code baseline of Stock-Race. Most of the code was written in February 2026; claims about completeness, usability, or deployment in the documentation do **not** represent a currently verified state.
- The code is organized into four modules: `frontend/` (React + TypeScript), `backend/` (Node.js + Express), `ai-service/` (Python + FastAPI), and `data-service/` (Python + FastAPI). Active development currently happens in `v3/`.
- The project is for simulated trading, strategy research, and tooling experiments only. **It must never be connected to live trading.**
- There is no production instance to maintain. Historical deployment documents are not current runbooks.

## Default Safety Boundaries

- Do not install dependencies, start services, modify databases, deploy, or call paid models or external data-write APIs without explicit authorization for the task at hand.
- Treat real environment files (`.env`, `.env.local`, `.env.production`, `.env.test`, etc.) as sensitive material. Except for `.env.example`, never read, print, or copy their values for investigation purposes.
- Credentials must never enter conversations, logs, test snapshots, commits, or public documentation. If a potentially valid credential is found, report only the file and variable name and let the maintainer decide how to handle it.
- Do not run database wipes, resets, system-level installs, or production deployment commands from historical documents. Review historical scripts before running them, and only under explicit task authorization.
- Business code and environment governance are handled by dedicated tasks; a collaboration-baseline task must not piggyback changes to the business implementation.

## Starting a New Session

1. Read this file and the current task brief first; confirm the task goal, scope, deliverables, and acceptance criteria.
2. Read [Collaboration Rules](docs/development/COLLABORATION.md), [Coding Standards](docs/development/CODING_STANDARDS.md), and relevant feature documents as the task requires.
3. Verify against the actual code, tests, and dependency manifests directly; do not load every historical document just to "get the full picture."
4. For environment tasks, start with the [Environment Guide](docs/usage/QUICK_START.md); for architecture research, start with the [Historical Architecture Notes](docs/architecture/README.md).
5. When a timestamp is needed, take the real date and time from the system; do not estimate.

## Division of Labor Between Main and Sub-agents

Sub-agents here are short tasks launched within the main session via the Agent tool. They are not new planning roles, receive no additional authorization, and do not change who is responsible for the task.

- The main agent keeps task decomposition, hands-on verification of key evidence, risk judgment, conclusion synthesis, and delivery. It does not indiscriminately re-read all materials.
- Independent code inventory, read-only searches, configuration and link scans, and document compilation are preferentially delegated to sub-agents with clear boundaries; the main agent spot-checks the returned evidence paths instead of reading the whole repository into its own context.
- Sub-agents are read-only by default: they must not read real environment files, run historical scripts, modify business code, or call external services. Their output must distinguish facts, inferences, and unverified items.
- Trading semantics, cross-module interfaces, security risks, and product conclusions are verified hands-on by the main agent; sub-agent results do not replace that judgment.
- Do not delegate for delegation's sake. Tasks too small to split effectively are done directly by the main agent. For large material, build an index or search first, then read selectively — main-context and quota are cost assets.

## Documentation Trust Order

1. The current task contract and its acceptance criteria;
2. Actual code, tests, dependency manifests, and runtime evidence;
3. Verified records in `docs/features/`, `docs/research/`, and `docs/decisions/`;
4. Other design, completion, and deployment documents from February 2026, for historical reference only.

When documents conflict, report and verify the conflict first — do not simply follow whichever document is most convenient.

## Collaboration and Git Boundaries

- Roles are positions, not fixed session names or personas. Responsibilities for planning, implementation, review, mechanical changes, and re-review are defined in the collaboration rules.
- An execution session handles only its own task by default. It does not expand scope, dispatch other tasks, merge, or allocate shared resources on its own; direct authorization from the maintainer takes precedence for specific actions.
- `main` is the shared baseline. Implementation work happens in a dedicated worktree and branch; do not commit directly in the main checkout.
- Review the change surface before committing; add only explicit files — blanket `git add` is forbidden. Commit, merge, and push only as authorized for the task.
- The executor must self-verify. Code, multi-file configuration, and environment changes require re-review by an independent session that did not participate in the implementation. User-visible presentation changes additionally require the maintainer's final sign-off.
- Cross-session messages are only for asking questions, delivering work, and requesting decisions. Important conclusions must be recorded back in the task document.

## Documentation Index

| Purpose | Entry |
|---|---|
| Human project entry | [README.md](README.md) |
| Collaboration roles and quality gates | [docs/development/COLLABORATION.md](docs/development/COLLABORATION.md) |
| Coding standards | [docs/development/CODING_STANDARDS.md](docs/development/CODING_STANDARDS.md) |
| Task execution canon | [docs/features/](docs/features/README.md) |
| Research evidence | [docs/research/](docs/research/README.md) |
| Technical decisions | [docs/decisions/](docs/decisions/README.md) |
| Environment guide | [docs/usage/QUICK_START.md](docs/usage/QUICK_START.md) |
| Historical architecture notes | [docs/architecture/README.md](docs/architecture/README.md) |
