# 2026-11-12 · V3 Two Modes and Live Watch (live-sim) Contract Freeze

*Translated from the Chinese original on 2026-11-15.*

> The maintainer appended two same-day decisions as patches (paused-resume formal clause, market profile extension point); the latest contract hash is in the "2026-11-12 Patches" section at the end.

## Decision

The maintainer gave final approval to **SR-011 "V3 Two-Modes and Live Watch Contract Upgrade"** per the planning side's recommended wording; the sole residence of the complete frozen text is [V3 Demo Complete Contract chapter 11](../features/v3-demo-complete-contract.md#11-两态与实时值守live-sim契约2026-11-12-冻结). Post-upgrade full-contract SHA-256=`08df4ecb0abf81792fcead4ae2534e5dfe546beeecdba8503f930c51b2f8a33f`. All eleven business assumptions were approved per the recommended wording:

1. **Wake cycle**: only one EOD wake per trading day after close; no intraday cycles.
2. **Simulated fill confirmation time**: T+1 EOD backfills the open price, and the watch UI states "fill confirmation lags the signal by one trading day"; the intraday immediate-backfill alternative is not adopted.
3. **EOD wake time**: no earlier than 15:30 (Asia/Shanghai); if data has not arrived within the fallback window, it is treated as stale; the exact window duration is an explicit implementation-time configuration, must be versioned, and must be displayed.
4. **live watch asset scope**: Shanghai/Shenzhen stocks first; ETFs, funds, and indices keep the existing analysis-only gate.
5. **News positioning**: observation bookkeeping + watch display + review material only; not fed into AST signals; items without a real publishedAt are marked `UNKNOWN_PUBLISH_TIME` and not booked.
6. **stale threshold**: N=3 consecutive stale cycles → the watch turns `paused` and is surfaced to the user.
7. **live virtual ledger initial capital**: set independently, defaulting to `100000.00 CNY`, with no cross-reference to historical Run capital.
8. **Display-layer wording**: live and historical Runs may be shown side by side on one screen, with a mandatory mode indicator; this does not constitute a contract compare; P0 forbids cross-mode contract compare.
9. **News source licensing**: sources without verified licenses are not connected; AKShare-style "academic research only" statements are directly excluded from open-source distribution.
10. **live execution profile**: a new independent `cn-stock-live-sim@1`, with initial values aligned item-by-item to the section 7.2.3 backtest frozen values; it may evolve independently in the future without polluting the backtest frozen values.
11. **run-event schema upgrade path**: minor upgrade of the same schema file (option A); no separate live-event schema; three new schemas — live-run-spec / live-observation / news-observation — all go through the existing `generate:types` + `check:generated` pipeline.

## Architectural stance

live-sim adopts **rolling observation + full deterministic re-run per cycle**: each cycle builds a complete live-domain DataSnapshot from accumulated observations, and the same deterministic engine regenerates the entire event chain and ledger. Core targets zero semantic change; idempotency and crash recovery are guaranteed by determinism. The overall architecture and the nine-dimension details follow contract sections 11.2–11.12; this document does not reproduce the full text.

## Rationale

- Reuses the frozen deterministic kernel, avoiding drift between two sets of fill logic; idempotency, recovery, and cross-host consistency can all be enforced by determinism proofs and byte-level goldens.
- An independent `liveRunId`, an independent live namespace, and the mandatory `mode:"live-sim"` indicator ensure live watch can never impersonate a frozen-snapshot backtest, and the two-mode isolation is machine-verifiable.
- T+1 EOD backfill is truthful semantics: it does not fabricate an intraday open-price visibility time, and the delay is explicitly displayed in the watch UI.

## Impact scope

- The contract adds chapter 11 (11.1–11.16) and updates the status section and the section 0.1 reference table; the semantics of existing chapters 1–10 are unchanged.
- Follow-up construction surface: `application` gains a ports layer and four live use cases; `adapters` gains live-poll / news / persistence-file; the scheduler is assembled in the hosts/local layer; core/engine/market/report are unchanged.
- Legacy asset reuse conclusion (contract section 11.15): the watch scheduling layer must be built entirely new; there is no real scheduling implementation in history to reuse.

## Alternatives

- Intraday-cycle wake and immediate T+1 intraday open-price backfill: requires probes on open-price visibility time; not in this version, left as a future upgrade path.
- Separate live event schema (option B): more thorough isolation, but high dual-chain dual-schema maintenance cost, and the theater/report projections would have to handle two event types; not adopted.
- Incremental execution engine: not built in this version; interfaces reserve an upgrade path; O(n²) re-runs at daily-frequency single-asset scale are bounded by the section 7.5 performance budget.

## Authorization boundary

This freeze **does not constitute construction authorization**. Schema JSON body changes, type regeneration, and all code implementation belong to the follow-up implementation tranche; real market data source integration, real news source integration, and watch scheduling deployment still require separate opt-in authorization per the section 7.1 real-integration wording. Implementation must still first produce hand-computed goldens and valid reds, then complete self-verification, inspection, and independent review by a session not involved in the implementation.

## Open items

The resume semantics after the watch turns `paused` (explicit user resume vs. auto-continue after data recovers) are not yet decided; before the corresponding construction slice starts, this must return to the planning side for adjudication, and implementers must not pick a default on their own.

> Closed on 2026-11-12: **resume = explicit user resume**; see the "2026-11-12 Patches" section at the end.

## Follow-up verification entry points

- The eight contract test requirements in contract section 11.14 (multi-cycle hand-computed goldens, idempotency, recovery, stale→paused, news boundary, isolation, red-first, cross-host byte equivalence).
- Contract section 11.16 non-goals and authorization boundary; any out-of-scope construction first returns to this decision and chapter 11 for verification.

## 2026-11-12 Patches (maintainer decisions, appended same day)

### Patch 1: paused-resume semantics promoted to a formal clause

After the watch turns `paused` following 3 consecutive stale cycles, **resume = explicit user resume**: the UI truthfully presents the absent interval (start/end trading days and cycle count) and the reason; after user confirmation, the deterministic engine catches up the owed cycles from accumulated observations and then continues; **no silent automatic resume** — data recovery does not trigger auto-continue. Rationale: consistent with the contract spirit of "no impersonation, no whitewashing" — an absentee manager should be visible to the boss. Contract landing: new formal clause in 11.9, expanded recovery assertions in item 4 of the 11.14 test requirements, and closure of the open-ambiguity item in 11.16 (this chapter currently has no undecided open items).

### Patch 2: market profile configuration extension point (new contract 11.17)

Fills and market rules are built in as a **configuration-driven market profile**, preserving extensibility for internationalization (supporting at least US stocks later). Profile = a versioned configuration package (`name@version`, digest enters RunSpec); nine parameter dimensions = trading calendar / trading sessions (including pre-market and after-hours switches) / settlement T+n / minimum trading unit (round lot or fractional shares) / same-day buy sellability / fee component table / price-limit rules (price limits or circuit breakers) / corporate-action handling / currency and precision. **This version only declares the extension point and does not implement US stocks** (per the 2026-10-27 precedent of not building ahead for the future); adding US stocks later = new profile configuration + new data source adapter + new calendar, **zero kernel changes**, still requiring separate authorization and passing the existing quality gates before enablement.

### Post-patch frozen wording

Post-patch full-contract SHA-256=`c6cc44ea20c904afcbb92fdd5c43450add7ec37e18813867f5b3109229a4cddd` (file-byte basis, same hashing basis as above). Both patches are contract declarations and semantic clauses and **do not constitute construction authorization**; the authorization boundary for schema JSON bodies, type regeneration, and code implementation is unchanged from the "Authorization boundary" section above.
