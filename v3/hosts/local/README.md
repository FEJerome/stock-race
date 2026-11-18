# Local Web Slice (S4 playable host)

The playable S4 vertical slice: hire A YI (阿一), run the four-cell interview,
sign the authoritative readback, dispatch him into a frozen 2024 market, watch
the portfolio run, and review the report with the sensitivity gate.

## Start

```bash
cd v3
npm ci
npm run start:local
# → http://127.0.0.1:4173
```

Open the printed URL in a desktop browser (1280px+ wide).

Default mode is the **deterministic fake interview driver**: scripted questions
and one scripted strategy card, clearly badged in the header. No real model is
called and no network is used. The slice pool is three hand-authored synthetic
stocks (alpha / beta / gamma, 48 sessions, 2024-01-02..2024-03-07) — labelled
`hand-authored-synthetic` on every surface. This is simulation-only: never
live trading, never real market data.

Options (append after `--`, e.g. `npm run start:local -- --port 5000`):

- `--port <n>` (default 4173)
- `--data-root <dir>` (default `<repo>/v3-data`; confirmations, runs and
  sensitivity reports persist here)
- `--real` — opt into the real model adapter (env `V3_MODEL_API_KEY`,
  `V3_MODEL_BASE_URL`, `V3_MODEL_ID`). Only inside a maintainer-authorized
  window; never the default.

## Shortest maintainer path

1. Landing → **开始面试 · 谨慎梳理**.
2. Answer A YI five times (any text — the fake is scripted). Watch the four
   cells on the right fill up.
3. **查看策略卡** → read the 7 readback clauses and the digest →
   **确认策略并签字**.
4. **去派遣** → the two signed assets are read-only; keep the defaults →
   **送阿一出发**.
5. Watch the theatre: equity curve, per-asset lanes (beta's stop-loss is the
   red triangle), click any marker for the evidence drawer.
6. **查看穿越成绩单** → human summary, four headline metrics, per-asset
   ledger, then **运行敏感性分析** (perturbs each numeric parameter and
   re-runs; any flipped verdict marks the strategy untrustworthy).

## CLI parity

`hosts/cli/run-portfolio-cli.ts` runs the same portfolio engine entry as this
host; identical inputs yield the identical runDigest (guarded by the contract
test `s4-web-host.test.ts`).

```bash
node run-portfolio-cli.cjs --strategy draft.json --run-spec runspec.json \
  --snapshots snapshot-a.json snapshot-b.json
```
