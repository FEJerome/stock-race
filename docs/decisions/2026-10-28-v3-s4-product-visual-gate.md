# 2026-10-28 · V3 S4 Product Flow and Visual Design Pre-gate

*Translated from the Chinese original on 2026-11-15.*

## Decision

The maintainer agreed to add a hard product-flow and visual-design gate before S4 frontend implementation. The sole residence of the detailed acceptance requirements is [V3 Demo Complete Contract section 1.5](../features/v3-demo-complete-contract.md#15-s4-产品流程与视觉设计前置闸维护者批准).

Before S4 starts, the following must be completed:

1. A one-page Feature Map plus user flow connecting input intent, generation, validation, confirmation, run, replay, adjustment, and comparison, with user actions, system feedback, and acceptance results spelled out.
2. Three-scene wireframes and a state matrix covering not only the happy path but also model/data errors, unconfirmed, no-trades, insufficient-data, and all-orders-rejected states.
3. Actual visual designs or a browser prototype, reviewed at the target display size for color, typography, information density, charts, animation, and act transitions.

Hard sequence:

> S2 produces real golden event streams → the three artifacts → maintainer design final review → S4 implementation → automated interaction acceptance → zero-context candidate review → maintainer final visual walkthrough.

## Boundary

- This decision only adds an S4 pre-quality gate; it does not rework S0/S1/S2 nor open S4 early.
- After the three artifacts are formed, they must enter the feature canon and keep a reviewable version; they must not exist only in sessions or chat logs.
- Lightweight use-case diagrams serve understanding and acceptance and add no heavy UML maintenance burden.
- S3 may proceed in parallel within its own authorization and the separate opt-in boundary for the real model; real Kimi calls remain unauthorized.
