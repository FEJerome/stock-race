# 2026-10-27 · V3 Demo Naming and Branch Generations

*Translated from the Chinese original on 2026-11-15.*

## Status

Confirmed. This decision only unifies product generation naming and branch usage; it does not mean V3 features have been implemented.

## Background

The repository already has two historical phases: the four-service simulation project on old main once formed `v1.0.0`, and develop subsequently carried the v2 redesign, the Local implementation, and the MVP/Full planning. Calling the current AI strategy lab "V1" again would confuse it with the historical versions.

## Decision

1. The current product generation is officially named **Stock-Race V3 Demo**.
   - V1: the four-service stock simulation project on old main.
   - V2: the redesign, Local implementation, and MVP/Full planning on develop.
   - V3: the current AI strategy lab oriented around a declarative strategy language, a deterministic simulation kernel, model-generated rules, and three-scene visuals.
2. V3 is a product generation name, not a new branch name; it is not called `v3.0.0` before a formal release exists.
3. The current local main is the sole construction and integration canon going forward. develop remains an independent historical asset line: not deleted, not merged wholesale, and not developed on further.
4. Code and designs in historical main/develop are researched, ported, and verified in a capability-directed manner; their relative age must not by itself decide what is kept or discarded.
5. Historical documents are kept in their original language; current documents and subsequent technical contracts use V3 Demo. Existing task numbers are unaffected by the naming change.

## Impact scope

The technical boundary confirmed in `2026-10-27-v1-demo-boundary.md` remains in effect, with the current demo's "V1" wording uniformly adjusted to "V3" by this decision. Subsequent directories, interfaces, tests, and acceptance documents should use V3 Demo and avoid creating yet another generation naming scheme.
