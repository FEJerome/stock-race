# ashare-ingest

Real A-share snapshot importer for the stock-race v3 backtest engine.

Pipeline (the language boundary sits at "prepared JSON -> materialize"):

1. `fetch` (online, opt-in, serial, conservative pacing): Baostock primary source
   plus AKShare/Eastmoney cross-check source. Every call is archived verbatim
   (raw CSV/JSON + per-call manifest with hashes).
2. `build` (offline): trading-calendar alignment, session state machine
   (trading/suspended/missing), corporate-action mapping, point-in-time
   adjustment (`adjustment-formula@1`, computed from frozen raw only), full
   per-day dual-source reconciliation. Any blocking issue stops the stock —
   there is deliberately no `--single-source` / `--force-blocked` switch.
3. TS materialization: `v3/hosts/cli/import-snapshot.ts` validates the prepared
   JSON, computes the canonical digest (single source of truth, TypeScript
   only) and freezes `snapshots/<digest>/{snapshot.json,import-manifest.json}`.

Real data lives only in the main repository `.local/v3-data/` (gitignored).
Never `git add` real data; the committed fixtures under `tests/fixtures/` are
hand-authored miniatures.

## Usage

```bash
# 0) isolated venv with pinned sources (reuses the PR-0 probe venv on this machine)
VENV=/path/to/venv   # e.g. <repo>/.local/data-research/venv

# 1) fetch (online, opt-in; one importRunId per invocation)
"$VENV/bin/python" -m ashare_ingest.cli fetch \
  --codes 600519,601318,000858,600036 \
  --start 2023-01-01 --end 2024-12-31 \
  --data-root <repo>/.local/v3-data

# 2) build (offline; writes prepared JSON + import manifest + reconcile report)
"$VENV/bin/python" -m ashare_ingest.cli build \
  --raw-dir <repo>/.local/v3-data/raw/<importRunId> \
  --data-root <repo>/.local/v3-data \
  --start 2023-01-01 --end 2024-12-31

# 3) materialize (TypeScript, computes the digest)
node <v3-bundle> --prepared <prepared.json> --manifest <import-manifest.json> \
  --snapshots-root <repo>/.local/v3-data/snapshots

# 4) opt-in offline verification of the raw -> manifest -> snapshot chain
"$VENV/bin/python" -m ashare_ingest.cli verify-real --data-root <repo>/.local/v3-data
```

## Boundaries

- Pinned source versions: `baostock==0.9.4`, `akshare==1.20.65`.
- AKShare data is academic-research-only; Baostock data licensing is
  unconfirmed. Snapshots must not be redistributed publicly.
- CI runs the pytest suite only; it never touches the network.
- The repository copy of `s4-data-cleaning-plan.md` (main repo `.local/`) is the
  normative plan for this tool.
