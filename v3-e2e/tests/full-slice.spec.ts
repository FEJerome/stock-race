import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { digestJson } from "../../v3/core/strategy/canonical/digest.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.join(here, "..", "evidence");

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: false });
}

/**
 * Full playable slice in a real browser: landing → four-cell interview →
 * strategy card → authoritative readback signature → dispatch → portfolio
 * backtest → theatre → review + sensitivity, with a three-way reconciliation
 * (screen values ⇔ run API ⇔ independently recomputed digests).
 * Everything runs on the deterministic fake + in-repo synthetic pool: zero
 * network, zero real model calls.
 */
test("S4 playable slice: interview → confirm → run → report, reconciled against the engine ledger", async ({ page }) => {
  // ── 0. landing ──────────────────────────────────────────
  await page.goto("/");
  await expect(page.locator("#landing-title")).toContainText("老板，你的基金公司");
  await expect(page.locator(".manager-name")).toHaveText("阿一");
  await expect(page.locator("#driver-badge")).toContainText("deterministic-fake");
  await expect(page.locator(".prototype-reality")).toContainText("非真实行情");
  await shot(page, "01-landing");

  // ── 1. interview: four cells fill one by one ────────────
  await page.click("#start-novice");
  await expect(page.locator("#scene-interview")).toBeVisible();
  await expect(page.locator("#slots-pill")).toHaveText("0 / 4");
  await expect(page.locator("#to-confirm")).toBeDisabled();
  await expect(page.locator("#slots-missing")).toContainText("还缺：① ② ③ ④");
  await shot(page, "02-interview-start");

  const answers = ["我想低买高卖", "跌到低价位就买", "单票亏 8% 认输，组合回撤 15% 收手", "先到先得，单票最多 40%"];
  for (let turn = 0; turn < 5; turn += 1) {
    await page.fill("#dialogue-input", answers[turn] ?? "就按这个来");
    await page.click("#dialogue-send");
    if (turn < 4) {
      // Each answer is followed by exactly one scripted question.
      await expect(page.locator(".bubble.ayi").nth(turn + 1)).toBeVisible();
    }
  }
  // After the fifth turn the card is ready: all four cells filled.
  await expect(page.locator("#slots-pill")).toHaveText("4 / 4");
  await expect(page.locator("#to-confirm")).toBeEnabled();
  await expect(page.locator('.slot[data-slot="universe"] .slot-state')).toHaveText("已记录");
  await expect(page.locator('.slot[data-slot="rules"] .slot-state')).toHaveText("已记录");
  await expect(page.locator('.slot[data-slot="risk"] .slot-state')).toHaveText("已记录");
  await expect(page.locator('.slot[data-slot="allocation"] .slot-state')).toHaveText("已记录");
  await expect(page.locator('.slot[data-slot="universe"]')).toContainText("synthetic.alpha");
  await expect(page.locator('.slot[data-slot="risk"]')).toContainText("8.00%");
  await expect(page.locator('.slot[data-slot="risk"]')).toContainText("15.00%");
  await expect(page.locator('.slot[data-slot="allocation"]')).toContainText("先到先得");
  await shot(page, "03-interview-four-cells");

  // ── 2. confirm: authoritative readback + signature ──────
  await page.click("#to-confirm");
  await expect(page.locator("#scene-confirm")).toBeVisible();
  const clauseTexts = await page.locator("#readback-clauses li").allTextContents();
  expect(clauseTexts.length).toBe(7);
  expect(clauseTexts.join(" ")).toContain("管理范围");
  expect(clauseTexts.join(" ")).toContain("个股止损");
  expect(clauseTexts.join(" ")).toContain("组合止损");
  expect(clauseTexts.join(" ")).toContain("先到先得");
  const digestText = (await page.locator("#confirm-digest").textContent()) ?? "";
  expect(digestText).toMatch(/^sha256:[0-9a-f]{64}$/);
  await shot(page, "04-confirm-readback");

  await page.click("#confirm-button");
  await expect(page.locator("#confirmed-banner")).toBeVisible();
  await expect(page.locator("#confirmed-ref")).toContainText("strategy-");
  await expect(page.locator("#confirmed-ref")).toContainText("revision 1");
  await shot(page, "05-confirmed");

  // ── 3. dispatch ─────────────────────────────────────────
  await page.click("#to-dispatch");
  await expect(page.locator("#scene-dispatch")).toBeVisible();
  await expect(page.locator("#dispatch-assets .asset-item")).toHaveCount(2);
  await expect(page.locator("#dispatch-assets")).toContainText("synthetic.alpha");
  await expect(page.locator("#dispatch-assets")).toContainText("synthetic.beta");
  await expect(page.locator("#dispatch-assets")).toContainText("hand-authored-synthetic");
  await expect(page.locator("#dispatch-start")).toHaveValue("2024-01-02");
  await expect(page.locator("#dispatch-end")).toHaveValue("2024-03-07");
  await shot(page, "06-dispatch");

  await page.click("#dispatch-run");
  await expect(page.locator("#scene-watch")).toBeVisible({ timeout: 30_000 });

  // ── 4. watch: theatre, lanes, evidence drawer ───────────
  await expect(page.locator("#equity-chart svg polyline").first()).toBeVisible();
  await expect(page.locator("#event-lanes .lane")).toHaveCount(2);
  await expect(page.locator(".point-in-time-banner")).toContainText("他只知道那天及之前的事");
  // beta hits the position stop-loss exactly once in the slice pool.
  await expect(page.locator("#event-lanes")).toContainText("个股止损 1 次");
  await shot(page, "07-watch-theatre");

  // Open the evidence drawer on a real fill event.
  await page.click("#toggle-evidence");
  await expect(page.locator("#evidence-drawer")).toBeVisible();
  await expect(page.locator("#event-evidence")).toContainText("OrderFilled");
  await expect(page.locator("#event-evidence")).toContainText("eventHash");
  await expect(page.locator("#event-evidence")).toContainText("previousEventHash");
  await shot(page, "08-watch-evidence");

  // Cursor playback is read-only theatre: jumping to the result shows the final day.
  await page.click("#jump-result");
  await expect(page.locator("#cursor-date")).toHaveText("2024-03-07");
  await expect(page.locator("#cursor-account")).toContainText("权益");

  // ── 5. review: human layer, metrics, sensitivity, chain ─
  await page.click("#to-review");
  await expect(page.locator("#scene-review")).toBeVisible();
  await expect(page.locator("#human-insights article")).toHaveCount(4);
  await expect(page.locator("#metrics-row .metric-tile")).toHaveCount(4);
  await shot(page, "09-review");

  await page.click("#run-sensitivity");
  await expect(page.locator("#sensitivity-verdict")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#sensitivity-verdict")).toContainText("通过");
  await expect(page.locator("#sensitivity-table tbody tr").first()).toBeVisible();
  await shot(page, "10-sensitivity");

  // ── 6. reconciliation: screen ⇔ API ⇔ independent digest recompute ──
  const runDigestText = await page.locator("#evidence-chain code").first().textContent();
  expect(runDigestText).toMatch(/^sha256:[0-9a-f]{64}$/);
  const runResponse = await page.request.get(`/runs/portfolio/${encodeURIComponent(runDigestText!)}`);
  expect(runResponse.ok()).toBe(true);
  const stored = (await runResponse.json()) as { runSpec: any; result: any };
  const result = stored.result;
  expect(result.ok).toBe(true);
  const report = result.report;

  // eventDigest / reportDigest recomputed independently from the canonical digest path.
  const eventDigest = digestJson(result.events);
  expect(eventDigest).toBe(report.eventDigest);
  const { reportDigest: _dropped, ...reportContent } = report;
  expect(digestJson({ ...reportContent, eventDigest })).toBe(report.reportDigest);
  const chainText = (await page.locator("#evidence-chain").textContent()) ?? "";
  expect(chainText).toContain(report.eventDigest.replace(/^sha256:/, ""));
  expect(chainText).toContain(report.reportDigest.replace(/^sha256:/, ""));
  expect(chainText).toContain(report.strategyDigest.replace(/^sha256:/, ""));

  // Headline metrics on screen ⇔ report metrics.
  const metricTiles = await page.locator("#metrics-row .metric-tile").allTextContents();
  const pct4 = (value: string) => `${(Number(value) * 100).toFixed(4)}%`;
  expect(metricTiles[0]).toContain(pct4(report.metrics.cumulativeReturn));
  expect(metricTiles[1]).toContain(pct4(report.metrics.maxDrawdown));
  expect(metricTiles[2]).toContain(String(report.metrics.tradeCount));
  expect(metricTiles[3]).toContain(pct4(report.metrics.excessReturn));

  // Trade table: every fill and rejection from the ledger appears exactly once.
  const tradeRows = await page.locator("#trades-table tbody tr").allTextContents();
  expect(tradeRows.length).toBe(report.fills.length + report.rejections.length);
  for (const fill of report.fills) {
    const row = tradeRows.find((text) => text.includes(fill.date) && text.includes(fill.quantity.replace(/0+$/, "").replace(/\.$/, "")) && text.includes(fill.side === "buy" ? "买入" : "卖出"));
    expect(row, `ledger fill must appear on screen: ${JSON.stringify(fill)}`).toBeTruthy();
  }
  // No phantom trades: the screen shows no trade absent from the ledger.
  const ledgerTradeCount = report.fills.length + report.rejections.length;
  expect(tradeRows.length).toBe(ledgerTradeCount);

  // Per-asset summary ⇔ report.assets (incl. the beta stop-loss).
  const assetRows = await page.locator("#assets-table tbody tr").allTextContents();
  expect(assetRows.length).toBe(report.assets.length);
  const beta = report.assets.find((entry: any) => entry.assetId === "stock:synthetic.beta");
  const betaRow = assetRows.find((text) => text.includes("synthetic.beta"));
  expect(betaRow).toContain(String(beta.fillCount));
  expect(betaRow).toContain(String(beta.positionStopLossTriggers));

  // Equity sample point: the theatre cursor readout matches the ledger daily record.
  const lastDay = report.daily[report.daily.length - 1];
  const cursorText = (await page.locator("#cursor-account").textContent()) ?? "";
  const formatted = Number(lastDay.equity).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  expect(cursorText).toContain(formatted);

  // Sensitivity verdict ⇔ artifact, and the artifact was persisted by the route.
  const sensitivityResponse = await page.request.get(`/runs/portfolio/${encodeURIComponent(runDigestText!)}/sensitivity`);
  expect(sensitivityResponse.ok()).toBe(true);
  const sensitivity = (await sensitivityResponse.json()) as any;
  expect(sensitivity.report.baseRunDigest).toBe(runDigestText);
  const verdictText = (await page.locator("#sensitivity-verdict").textContent()) ?? "";
  if (sensitivity.report.verdict.trustworthy) {
    expect(verdictText).toContain("通过");
  } else {
    expect(verdictText).toContain("策略不可信");
  }
  const variantRows = await page.locator("#sensitivity-table tbody tr").count();
  expect(variantRows).toBe(sensitivity.report.variants.length);
});
