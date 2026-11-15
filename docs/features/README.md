# Feature Documents

> *This directory is the Chinese-language task execution canon of the project. It is kept as a traceability archive: these records document how tasks were actually scoped, executed, and verified, and they contain internal process terminology from that workflow. They are not product documentation. Each file below is a historical task record; internal process terms in them are historical usage, retained for evidence-chain integrity.*

`docs/features/` carries the task execution canon: goals, scope, interface or file changes, acceptance criteria, and the verification records actually produced.

## Writing Rules

- One main document per task; the task number and name appear together, e.g. `SR-001-collaboration-base.md`.
- Discuss and confirm the plan before implementation; scope changes during implementation must be recorded and authorized first.
- Live task status belongs to the project STATUS ledger; this directory does not duplicate the task board.
- Do not copy entire collaboration manuals or architecture documents here — link to their canonical locations instead.
- Verification records state the checks actually run, their results, and what was not covered; do not write plans as if they were results.
- Session messages, prompts, and handoff drafts are not a substitute for a feature document.

## Files

- `SR-001-collaboration-base.md` — collaboration baseline rebuild (task record, Chinese).
- `SR-002-development-environment.md` — development environment and sensitive-configuration governance (task record, Chinese).
- `SR-014-ci-cd-rebuild-report.md` — old CI/CD removal and V3 CI rebuild, execution report (Chinese).
- `v3-demo-complete-contract.md` — the complete V3 demo contract, including the frozen-hash reference used by the decision records.
- `v3-s4-*.md` — V3 S4 design and rework records (dialogue guide, feature map and flows, manager time-travel concept, naming review materials and rework report, wireframes and state matrix).
- `v3-s4-visual-prototype/` — the visual prototype artifacts referenced by the S4 records.
