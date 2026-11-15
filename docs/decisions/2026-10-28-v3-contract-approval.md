# 2026-10-28 · V3 Demo Complete Contract Final Approval and S0 Opening

*Translated from the Chinese original on 2026-11-15.*

## Decision

The maintainer gave final approval to the [V3 Demo Complete Contract](../features/v3-demo-complete-contract.md) per the planning side's recommended wording. Submitted canon SHA-256=`537fbf224baa2226c0515bcaea73ba10b48a6e38d248d76643950f51f66441b3`.

1. Ordinary off-exchange open-end funds use `NEXT_DAY_END_CONSERVATIVE`: NAV_T becomes visible only after 23:59:59 on day T+1 (Asia/Shanghai), and subscription/redemption then occurs at unknown NAV on the first eligible open day thereafter. This rule is an explicitly presented conservative product assumption, not the actual `publishedAt`; the real publication-time path is left for a future upgrade.
2. T+1 stock ETFs are analysis-only and not executed until complete corporate-action and execution evidence is in place; other ETF subtypes remain explicitly rejected.
3. Visuals use a single-page three-act layout with an approximately four-minute presentation pace. The four first-screen indicators are cumulative return, maximum drawdown, trade count, and return versus buy-and-hold; win rate moves to the detail layer, and final aesthetics remain subject to the maintainer's visual walkthrough.
4. 600519/2024 serves only as the default validation sample and does not constitute an upper limit on assets, codes, or years. More independent single assets, user-selected intervals, and full in-snapshot history are supported, with fees, slippage, visibility, and index assumptions fully displayed.
5. The demo's real user main flow uses real Kimi; deterministic fake is used only for automated testing. Real model calls are separately authorized; raw data continues to be stored locally and is not publicly packaged by default.

## Work-start boundary

- Only **SR-006 "V3 S0 Contract Skeleton"** is opened, implementing the section 8.1 minimal engineering, schema/canonical/digest, and contract tests in an independent worktree assigned by the planning side.
- After S0 completes, it must pass the implementer's self-verification, inspection, and an independent review by a session not involved in the implementation; only then is S1 opened. S2 and subsequent slices do not automatically start because of this final approval.
- Real Kimi, real market data access, public data distribution, deployment, remote pushes, and SR-004 are not authorized.
- Contract changes must return to the same feature canon for re-review; no parallel specification is to be created.

## Same-version revision · newline canonical golden hash erratum

Before S0 implementation, inspection found that the newline vector's canonical JSON and explicit hex were correct, but the registered SHA-256 was wrong. Only that hash is corrected from `7db16a5860923cd8050cbca1670d36b60aa97cc97077c285a101e1be696e494e` to `26b5d4c3cec8a6c2f500cbbf0905fe6d8343628630d9d7921862512dfba45364`; the canonical JSON and hex=`7b 22 73 22 3a 22 5c 6e e4 b8 ad 22 7d` are unchanged. All 8 canonical vectors have been independently re-verified against explicit bytes.

Post-revision complete contract SHA-256=`3b8b444b8a268758bf99c804c6d77c6737e3ddfd9e903e8f5a5bfe8190d85e9d`. This erratum does not change the five final-approval conclusions, the S0 scope, or the subsequent authorization boundary.
