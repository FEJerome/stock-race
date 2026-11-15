# Stock-Race V3

V3 is the active development area of this repository: a dependency-light TypeScript engine for simulated A-share trading, strategy drafting/validation, and backtesting. The older four-module stack in the repository root is a historical baseline; V3 is where current design and verification effort goes.

## Layout

- `core/` — domain engine: the event-ledger trading engine (hash-chained event log), market model, strategy model, and report generation. No I/O, no framework dependencies.
- `adapters/` — infrastructure adapters that connect the core to the outside world: market data, LLM providers (e.g. Kimi), and persistence.
- `application/` — use cases that orchestrate the core through ports: draft-strategy, confirm-strategy, validate-strategy, run-backtest, run-confirmed.
- `hosts/` — entry points that drive the use cases: `cli` and `local`.
- `tests/` — vitest suites: contract tests, golden tests, and shared fixtures/helpers.

## Getting Started

Requires Node 20+.

```sh
npm ci
npm test
```

Other checks: `npm run typecheck` and `npm run check:generated` (verifies the generated contract types are in sync).

## Contract

The behavioral contract for the V3 demo — including the frozen-hash reference — lives in [docs/features/v3-demo-complete-contract.md](../docs/features/v3-demo-complete-contract.md). It is the canonical spec the engine and tests are held against.

## Note on Chinese strings

User-facing strings, model prompts, and validation messages in V3 are in Chinese by design: the product targets A-share retail scenarios and Chinese-language models. This is a deliberate positioning choice, not unfinished translation work.
