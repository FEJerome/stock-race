# 2026-10-27 · V3 Technical Foundation and P0 Asset Scope

*Translated from the Chinese original on 2026-11-15.*

## Status

Technical direction confirmed; detailed schemas, real data sources, specific fee rates, and external model capabilities still need to be frozen through follow-up contracts and probes. This decision does not authorize business implementation or external calls.

## Decision

1. **V3 uses a single pure-simulation kernel implemented in TypeScript strict mode**; the first host is a local single-user Web app: Node 20+ Express API/BFF and React/Vite; the CLI is the second acceptance host. The new construction root is `v3/`, layered as `core / application / adapters / hosts`, with dependency direction `hosts → application → core`; adapters do not call each other, and core depends on no I/O, system clock, randomness, or environment variables.
2. Strategies use versioned JSON Schema, generated types, and a controlled indicator/function registry; no string evaluation or arbitrary code execution. Authoritative semantic readback is rendered deterministically from the canonical AST and the registry; user confirmation binds to a strategy digest, and any modification must produce a new revision and require re-confirmation.
3. The kernel generates the complete ordered event stream and report in one pass from frozen inputs. No network, model, or wall-clock access during a run, and no random-result fallback; the historical theater only moves the replay cursor and does not re-execute trades.
4. First-version run storage uses immutable data snapshots and content-addressed JSON files; no database is presumed for the local demo. The old Python collector, if reused, serves only as an offline importer.
5. **P0 asset scope**:
   - Shanghai/Shenzhen A-share stocks: real calendar, T+1, fees, corporate actions, and trading restrictions.
   - Exchange-traded funds (ETF): initially limited to T+1 stock ETFs; other subtypes are explicitly rejected.
   - Off-exchange open-end funds: handled by NAV visibility time, subscription/redemption at unknown NAV, share confirmation, and cash arrival; QDII, money market, closed-end, and other fund profiles are out of scope for the first version.
   - Indices: analyzable and usable as benchmarks; not directly tradable; no fake orders or fake equity curves are generated.
6. The visual contract and the kernel proceed in parallel. The three scenes may consume the golden event streams produced by contract tests ahead of time, but must not substitute static mocks or fabricated returns for real run results.
7. The old main branch's `data-service/` is the first research target for data-source historical research; develop is used only to compare increments and supplements of the same-named directory. Historical conclusions and tests serve only as a verification map and are not directly treated as currently available facts.
8. Real data sources, display intervals, fee/slippage profiles, and Kimi K3.1 Pro structured-output capabilities still need separate verification; actual external calls must be separately authorized, and old model configuration must not be used as evidence of new model capability.

## Follow-up verification entry points

The follow-up complete V3 contract should specify acceptance for DSL/RunSpec/DataSnapshot/RunEvent, indicator goldens, asset timelines, model negative cases, cross-host consistency, and replay consistency. Once concrete data-source and model probe results exist, the corresponding profiles and adapter contracts are then frozen.
