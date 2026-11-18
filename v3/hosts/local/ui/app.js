/* Stock-Race V3 S4 slice — playable local web host UI.
   Every number on screen comes from the real application APIs; the interview
   is driven by the deterministic fake (badge shown at all times), never by a
   real model in this slice. */
(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  // ── API client ─────────────────────────────────────────
  async function request(method, path, body) {
    const response = await fetch(path, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status, json };
  }
  const api = {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
  };

  // ── formatting helpers ─────────────────────────────────
  function trimDecimal(value) {
    if (typeof value !== "string" || !value.includes(".")) return String(value);
    return value.replace(/0+$/, "").replace(/\.$/, "");
  }
  function pct(value) {
    if (value === null || value === undefined) return "—";
    return `${(Number(value) * 100).toFixed(2)}%`;
  }
  function pct4(value) {
    if (value === null || value === undefined) return "—";
    return `${(Number(value) * 100).toFixed(4)}%`;
  }
  function money(value) {
    return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function shortDigest(digest) {
    if (!digest) return "—";
    const hex = digest.replace(/^sha256:/, "");
    return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
  }
  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      node.hidden = true;
    }, 2200);
  }
  function assetShortName(assetId) {
    return assetId.replace(/^stock:/, "");
  }

  // ── global state ───────────────────────────────────────
  const state = {
    style: "novice",
    sessionId: null,
    assetPool: [],
    adapterInfo: null,
    slots: null,
    card: null, // { canonicalAst, strategyDigest, readback }
    confirmation: null, // ConfirmedRevision
    adjustStrategyId: null,
    baseCanonicalAst: null,
    run: null, // { ok, runDigest, events, report }
    snapshots: {}, // assetId -> DataSnapshot
    sensitivity: null,
    cursorIndex: 0,
    eventFilter: "all",
    playing: false,
    speed: 1,
    charts: { equity: null, drawdown: null, lanes: [], reviewEquity: null },
  };

  function poolEntry(assetId) {
    return state.assetPool.find((entry) => entry.assetId === assetId) ?? null;
  }

  // ── scene manager ──────────────────────────────────────
  const SCENES = {
    landing: "#scene-landing",
    interview: "#scene-interview",
    confirm: "#scene-confirm",
    dispatch: "#scene-dispatch",
    watch: "#scene-watch",
    review: "#scene-review",
  };
  const STAGE_ORDER = ["interview", "confirm", "dispatch", "watch", "review"];

  function refreshStageNav() {
    $$("#stage-nav .stage-tab").forEach((tab) => {
      const stage = tab.dataset.stage;
      const reachable = stageReachable(stage);
      tab.disabled = !reachable;
      tab.classList.toggle("active", SCENES[stage] === `#scene-${currentScene}`);
      const stageIndex = STAGE_ORDER.indexOf(stage);
      const currentIndex = STAGE_ORDER.indexOf(currentScene);
      tab.classList.toggle("done", stageIndex >= 0 && stageIndex < currentIndex);
    });
  }

  function stageReachable(stage) {
    switch (stage) {
      case "interview":
        return state.sessionId !== null;
      case "confirm":
        return state.card !== null;
      case "dispatch":
        return state.confirmation !== null;
      case "watch":
      case "review":
        return state.run !== null;
      default:
        return false;
    }
  }

  let currentScene = "landing";
  function show(sceneName) {
    currentScene = sceneName;
    Object.entries(SCENES).forEach(([name, selector]) => {
      const node = $(selector);
      const active = name === sceneName;
      node.hidden = !active;
      node.classList.toggle("active", active);
    });
    refreshStageNav();
    $("#scene-root").focus({ preventScroll: true });
  }

  $$("#stage-nav .stage-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.disabled) return;
      show(tab.dataset.stage);
      // Render lazily on first entry: charts need a visible container to measure.
      if (tab.dataset.stage === "watch" && state.run && !state.charts.equity) renderWatch();
      if (tab.dataset.stage === "review" && state.run) renderReview();
    });
  });
  $("#brand-home").addEventListener("click", (event) => {
    event.preventDefault();
    show("landing");
  });

  function updateContextRow() {
    const row = $("#context-row");
    row.hidden = state.card === null && state.confirmation === null;
    $("#context-strategy").textContent = state.confirmation
      ? `${state.confirmation.strategyId} · r${state.confirmation.revision}`
      : state.card
        ? `${state.draft.name} · 未确认`
        : "—";
    $("#context-digest").textContent = state.card ? shortDigest(state.card.strategyDigest) : "—";
    const status = $("#context-status");
    if (state.confirmation) {
      status.textContent = "CONFIRMED";
      status.className = "status-pill confirmed";
    } else if (state.card) {
      status.textContent = "DRAFT";
      status.className = "status-pill drafting";
    } else {
      status.textContent = "INTERVIEW";
      status.className = "status-pill drafting";
    }
    $("#context-run").textContent = state.run ? "portfolio-run" : "—";
    $("#context-run-digest").textContent = state.run ? shortDigest(state.run.runDigest) : "—";
  }

  // ── interview ──────────────────────────────────────────
  const CELL_META = {
    universe: { label: "①", missing: "①" },
    rules: { label: "②", missing: "②" },
    risk: { label: "③", missing: "③" },
    allocation: { label: "④", missing: "④" },
  };

  function addBubble(kind, who, text) {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${kind}`;
    if (who) {
      const whoNode = document.createElement("span");
      whoNode.className = "bubble-who";
      whoNode.textContent = who;
      bubble.appendChild(whoNode);
    }
    const body = document.createElement("span");
    body.textContent = text;
    bubble.appendChild(body);
    const stream = $("#dialogue-stream");
    stream.appendChild(bubble);
    stream.scrollTop = stream.scrollHeight;
    return bubble;
  }

  async function startInterview(style, baseCanonicalAst) {
    state.style = style;
    state.sessionId = null;
    state.card = null;
    state.run = null;
    state.sensitivity = null;
    if (!baseCanonicalAst) {
      state.confirmation = null;
      state.adjustStrategyId = null;
      state.baseCanonicalAst = null;
    }
    $("#dialogue-stream").textContent = "";
    $("#model-error").hidden = true;
    $("#baseline-banner").hidden = !baseCanonicalAst;
    if (baseCanonicalAst) {
      $("#baseline-digest").textContent = `base ${shortDigest(state.baseDigest ?? "")}`;
    }
    addBubble(
      "ayi",
      "阿一",
      "老板好。这趟面试我只问四件事：管哪些股票、什么时候买和卖、亏多少必须收手、钱怎么分。你想验证什么投资想法？随便说，不用术语。",
    );
    setComposerEnabled(false);
    const body = { style };
    if (baseCanonicalAst) body.baseCanonicalAst = baseCanonicalAst;
    const { status, json } = await api.post("/interview/start", body);
    setComposerEnabled(true);
    if (status !== 200) {
      addBubble("system", null, `面试启动失败（${status}）：${json?.message ?? "未知错误"}`);
      return;
    }
    state.sessionId = json.sessionId;
    state.assetPool = json.assetPool ?? [];
    state.adapterInfo = json.adapterInfo;
    state.slots = json.slots;
    $("#driver-badge").textContent =
      json.adapterInfo?.provider === "test-override"
        ? "deterministic-fake · 模拟驱动"
        : `${json.adapterInfo?.provider ?? "?"} · ${json.adapterInfo?.modelId ?? ""}`;
    $("#interview-driver").textContent =
      json.adapterInfo?.provider === "test-override" ? "deterministic-fake · 模拟面试驱动" : "真实模型 · 已授权窗口";
    updateSlots(json.slots);
    updateTurnCounter(0);
    show("interview");
    $("#dialogue-input").focus();
  }

  function setComposerEnabled(enabled) {
    $("#dialogue-input").disabled = !enabled;
    $("#dialogue-send").disabled = !enabled;
  }

  function updateTurnCounter(turnCount) {
    $("#turn-counter").textContent = `第 ${turnCount} / 12 轮`;
  }

  function updateSlots(slots) {
    state.slots = slots;
    const missing = [];
    for (const key of ["universe", "rules", "risk", "allocation"]) {
      const slotNode = $(`.slot[data-slot="${key}"]`);
      const slot = slots[key];
      const filled = slot.status === "filled";
      slotNode.classList.toggle("filled", filled);
      slotNode.querySelector(".slot-state").textContent = filled ? "已记录" : "待明确";
      const body = slotNode.querySelector(".slot-body");
      body.textContent = "";
      if (filled) {
        body.appendChild(renderSlotContent(key, slot.canonicalValue));
      } else {
        const empty = document.createElement("p");
        empty.className = "slot-empty";
        empty.textContent = {
          universe: "阿一会带你从池子里挑 2 ~ 5 只。",
          rules: "什么条件算低、到什么价格愿意买、什么时候卖。",
          risk: "单票认输出场线 + 组合全部收手线，只能你定。",
          allocation: "先到先得，还是均匀分仓？参数也由你拍板。",
        }[key];
        body.appendChild(empty);
        missing.push(key);
      }
    }
    const filledCount = 4 - missing.length;
    $("#slots-pill").textContent = `${filledCount} / 4`;
    $("#slots-missing").textContent = missing.length > 0 ? `还缺：${missing.map((key) => CELL_META[key].missing).join(" ")}` : "四格齐了，可以查看策略卡";
    $("#to-confirm").disabled = missing.length > 0;
    $("#interview-status-note").textContent = missing.length > 0 ? "四格齐了才能生成策略卡" : "策略卡已成形";
  }

  function renderSlotContent(key, canonicalValue) {
    const wrap = document.createElement("div");
    let value = null;
    try {
      value = JSON.parse(canonicalValue);
    } catch {
      value = null;
    }
    if (value === null) {
      const p = document.createElement("p");
      p.textContent = "已记录。";
      wrap.appendChild(p);
      return wrap;
    }
    if (key === "universe") {
      const ul = document.createElement("ul");
      for (const assetId of value.assets) {
        const li = document.createElement("li");
        const entry = poolEntry(assetId);
        li.textContent = `${assetShortName(assetId)}${entry ? ` · ${entry.description}` : ""}`;
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
    } else if (key === "risk") {
      const ul = document.createElement("ul");
      const li1 = document.createElement("li");
      li1.innerHTML = `<span class="slot-key">个股止损</span> 成本价跌 ${pct(value.positionStopLossFraction)} 认输出场`;
      const li2 = document.createElement("li");
      li2.innerHTML = `<span class="slot-key">组合止损</span> 权益峰值回撤 ${pct(value.portfolioStopFraction)} 全部收手`;
      ul.appendChild(li1);
      ul.appendChild(li2);
      wrap.appendChild(ul);
    } else if (key === "allocation") {
      const ul = document.createElement("ul");
      const li = document.createElement("li");
      if (value.template === "first-come-first-served@1") {
        li.innerHTML = `<span class="slot-key">先到先得</span> 单票最多占资金池 ${pct(value.params.maxPerAssetCashFraction)}`;
      } else {
        li.innerHTML = `<span class="slot-key">均匀分仓</span> 最多同时持有 ${value.params.maxPositions} 只`;
      }
      ul.appendChild(li);
      wrap.appendChild(ul);
    } else {
      // rules: use the readback clauses when the card is available.
      const clauses = state.card?.readback?.clauses ?? [];
      const relevant = clauses.filter((clause) => clause.astPath === "/entry" || clause.astPath.startsWith("/exits"));
      const ul = document.createElement("ul");
      if (relevant.length > 0) {
        for (const clause of relevant) {
          const li = document.createElement("li");
          li.textContent = clause.text;
          ul.appendChild(li);
        }
      } else {
        const li = document.createElement("li");
        li.textContent = "入场与出场规则已记录。";
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
    }
    return wrap;
  }

  async function sendInterviewTurn(text, isRetry) {
    setComposerEnabled(false);
    $("#model-error").hidden = true;
    if (!isRetry) addBubble("boss", "老板", text);
    const { status, json } = await api.post("/interview/turn", { sessionId: state.sessionId, text });
    setComposerEnabled(true);
    $("#dialogue-input").focus();
    if (status === 502 || (json && json.kind === "model-error")) {
      $("#model-error-detail").textContent = `${json?.errorCode ?? status}：${json?.message ?? "模型不可达"}`;
      $("#model-error").hidden = false;
      $("#model-error-retry").onclick = () => sendInterviewTurn(text, true);
      return;
    }
    if (status !== 200 || !json) {
      addBubble("system", null, `这一回合失败了（${status}）：${json?.message ?? "未知错误"}`);
      return;
    }
    updateSlots(json.state.slots);
    updateTurnCounter(json.state.turnCount);
    if (json.kind === "question") {
      addBubble("ayi", "阿一", json.text);
    } else if (json.kind === "draft") {
      state.card = json.card;
      state.draft = JSON.parse(json.card.canonicalAst);
      updateSlots(json.state.slots);
      addBubble("ayi", "阿一", "四格都齐了。老板，去确认页逐条核对我听懂的内容，没问题就签字。");
      updateContextRow();
    } else if (json.kind === "invalid") {
      const lines = (json.issues ?? []).map((issue) => `${issue.path || "/"}：${issue.message}`).join("；");
      addBubble("ayi", "阿一", `这张卡还没过校验，问题在：${lines}。我们改掉它。`);
    } else if (json.kind === "not-converged") {
      addBubble("system", null, json.message ?? "面试 12 轮内未能集齐四格，请重新开始。");
      setComposerEnabled(false);
    } else if (json.kind === "closed") {
      addBubble("system", null, json.message ?? "面试已关闭。");
      setComposerEnabled(false);
    }
  }

  $("#dialogue-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#dialogue-input");
    const text = input.value.trim();
    if (!text || !state.sessionId) return;
    input.value = "";
    void sendInterviewTurn(text, false);
  });
  $("#restart-interview").addEventListener("click", () => {
    void startInterview(state.style, state.baseCanonicalAst);
  });
  $("#interview-home").addEventListener("click", () => show("landing"));
  $("#start-novice").addEventListener("click", () => void startInterview("novice", null));
  $("#start-expert").addEventListener("click", () => void startInterview("expert", null));

  // ── confirm ────────────────────────────────────────────
  $("#to-confirm").addEventListener("click", () => {
    renderConfirm();
    show("confirm");
  });
  $("#confirm-back").addEventListener("click", () => show("interview"));

  function renderConfirm() {
    $("#confirm-error").hidden = true;
    $("#confirmed-banner").hidden = true;
    $("#confirm-button").disabled = false;
    const cells = $("#confirm-cells");
    cells.textContent = "";
    const draft = state.draft;
    const cellDefs = [
      ["① 管理股票范围", () => {
        const p = document.createElement("p");
        p.innerHTML = `<span class="cell-value">${draft.universe.assets.length} 只</span> · ${draft.universe.assets
          .map((id) => assetShortName(id))
          .join("、")}`;
        return [p];
      }],
      ["② 买卖规则", () => {
        return state.card.readback.clauses
          .filter((clause) => clause.astPath === "/entry" || clause.astPath.startsWith("/exits") || clause.astPath.startsWith("/indicators"))
          .map((clause) => {
            const p = document.createElement("p");
            p.textContent = clause.text;
            return p;
          });
      }],
      ["③ 亏损额度", () => {
        const p1 = document.createElement("p");
        p1.innerHTML = `个股止损：<span class="cell-value">成本价跌 ${pct(draft.risk.positionStopLossFraction)}</span> 次日开盘强平该票`;
        const p2 = document.createElement("p");
        p2.innerHTML = `组合止损：<span class="cell-value">权益峰值回撤 ${pct(draft.risk.portfolioStopFraction)}</span> 全部清仓并不再开仓`;
        return [p1, p2];
      }],
      ["④ 资金调度", () => {
        const p = document.createElement("p");
        if (draft.allocation.template === "first-come-first-served@1") {
          p.innerHTML = `<span class="cell-value">先到先得</span> · 单票最多占资金池 ${pct(draft.allocation.params.maxPerAssetCashFraction)}`;
        } else {
          p.innerHTML = `<span class="cell-value">均匀分仓</span> · 最多同时持有 ${draft.allocation.params.maxPositions} 只`;
        }
        const p2 = document.createElement("p");
        p2.textContent = `仅做多 · 禁止加仓 · 出场卖出持仓 ${pct(draft.position.exitSize.positionFraction)}`;
        return [p, p2];
      }],
    ];
    for (const [title, render] of cellDefs) {
      const cell = document.createElement("div");
      cell.className = "card-cell";
      const h = document.createElement("h3");
      h.textContent = title;
      cell.appendChild(h);
      for (const node of render()) cell.appendChild(node);
      cells.appendChild(cell);
    }
    const clauses = $("#readback-clauses");
    clauses.textContent = "";
    for (const clause of state.card.readback.clauses) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = clause.text;
      li.appendChild(text);
      const path = document.createElement("code");
      path.textContent = clause.astPath;
      li.appendChild(document.createElement("br"));
      li.appendChild(path);
      clauses.appendChild(li);
    }
    $("#confirm-digest").textContent = state.card.strategyDigest;
    $("#confirm-ast").textContent = JSON.stringify(state.draft, null, 2);
  }

  $("#confirm-button").addEventListener("click", async () => {
    $("#confirm-error").hidden = true;
    $("#confirm-button").disabled = true;
    const body = {
      currentDraft: state.draft,
      expectedDigest: state.card.strategyDigest,
    };
    if (state.adjustStrategyId) body.strategyId = state.adjustStrategyId;
    const { status, json } = await api.post("/strategies/confirm-2", body);
    if (status === 200 && json?.ok) {
      state.confirmation = json.confirmation;
      state.run = null;
      state.sensitivity = null;
      $("#confirmed-ref").textContent = `${json.confirmation.strategyId} · revision ${json.confirmation.revision} · ${shortDigest(json.confirmation.digest)}`;
      $("#confirmed-banner").hidden = false;
      $("#confirm-note").textContent = "已落盘 · 可复现";
      updateContextRow();
      refreshStageNav();
      return;
    }
    $("#confirm-button").disabled = false;
    const errorBox = $("#confirm-error");
    if (status === 409 && json?.code === "CONFIRM_DIGEST_MISMATCH") {
      errorBox.textContent = `确认失败：草稿在确认期间已变化（digest 不符，实际 ${shortDigest(json.actualDigest)}）。请重新阅读回读再签——这不是演习。`;
    } else if (json?.code === "CONFIRM_INVALID_DRAFT") {
      const issues = (json.issues ?? []).map((issue) => `${issue.path || "/"}：${issue.message}`).join("；");
      errorBox.textContent = `确认失败：策略卡未通过校验。${issues || json.message}`;
    } else {
      errorBox.textContent = `确认失败（${status}）：${json?.message ?? "未知错误"}`;
    }
    errorBox.hidden = false;
  });

  $("#to-dispatch").addEventListener("click", () => {
    renderDispatch();
    show("dispatch");
  });

  // ── dispatch ───────────────────────────────────────────
  function renderDispatch() {
    $("#dispatch-message").hidden = true;
    const list = $("#dispatch-assets");
    list.textContent = "";
    const startValues = [];
    const endValues = [];
    for (const assetId of state.draft.universe.assets) {
      const entry = poolEntry(assetId);
      const item = document.createElement("div");
      item.className = "asset-item";
      const idNode = document.createElement("div");
      idNode.className = "asset-id";
      idNode.textContent = assetId;
      const desc = document.createElement("div");
      desc.className = "asset-desc";
      desc.textContent = entry?.description ?? "";
      const meta = document.createElement("div");
      meta.className = "asset-meta";
      meta.innerHTML = `<span class="synthetic-chip">hand-authored-synthetic</span><span>${entry?.range.start ?? "?"} → ${entry?.range.end ?? "?"}</span><span>${shortDigest(entry?.snapshotDigest)}</span>`;
      item.appendChild(idNode);
      item.appendChild(desc);
      item.appendChild(meta);
      list.appendChild(item);
      if (entry) {
        startValues.push(entry.range.start);
        endValues.push(entry.range.end);
      }
    }
    $("#dispatch-start").value = startValues.sort()[0] ?? "2024-01-02";
    $("#dispatch-end").value = endValues.sort().slice(-1)[0] ?? "2024-03-07";
    $("#dispatch-order").textContent = `“阿一，你去 ${$("#dispatch-start").value.slice(0, 7)} 的 A 股，按我们聊好的策略操作。”`;
  }

  function dispatchValidate() {
    const message = $("#dispatch-message");
    message.className = "support-message error";
    const start = $("#dispatch-start").value;
    const end = $("#dispatch-end").value;
    const cash = $("#dispatch-cash").value.trim();
    const ranges = state.draft.universe.assets.map((id) => poolEntry(id)?.range).filter(Boolean);
    const minStart = ranges.map((r) => r.start).sort()[0];
    const maxEnd = ranges.map((r) => r.end).sort().slice(-1)[0];
    if (!start || !end || start > end) {
      message.textContent = "历史区间不合法：开始日期必须不晚于结束日期。";
      message.hidden = false;
      return false;
    }
    if (minStart && start < minStart) {
      message.textContent = `开始日期早于快照起点 ${minStart}——池快照只覆盖 ${minStart} 之后，不能伪造更早的数据。`;
      message.hidden = false;
      return false;
    }
    if (maxEnd && end > maxEnd) {
      message.textContent = `结束日期晚于快照终点 ${maxEnd}——池快照只覆盖到 ${maxEnd}，不能伪造更远的数据。`;
      message.hidden = false;
      return false;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(cash) || Number(cash) <= 0) {
      message.textContent = "初始资金必须是正数（最多两位小数）。";
      message.hidden = false;
      return false;
    }
    message.hidden = true;
    return true;
  }

  function buildRunSpec() {
    const ids = state.draft.universe.assets;
    return {
      runSpecVersion: "2.0.0",
      strategy: {
        id: state.confirmation.strategyId,
        revision: state.confirmation.revision,
        digest: state.confirmation.digest,
      },
      assets: ids.map((assetId) => ({ assetId, assetType: "stock", executionProfile: "cn-stock@1" })),
      data: {
        snapshots: ids.map((assetId) => ({ assetId, snapshotDigest: poolEntry(assetId).snapshotDigest })),
        start: $("#dispatch-start").value,
        end: $("#dispatch-end").value,
      },
      warmup: { extraObservations: 0 },
      account: { initialCash: $("#dispatch-cash").value.trim(), currency: "CNY" },
      execution: {
        feeProfileVersion: "cn-stock-demo-fee@1",
        slippageProfileVersion: "cn-stock-one-tick@1",
        visibilityRuleVersion: "asset-default@1",
        settlementProfileVersion: "cn-stock-settlement@1",
        reportProfileVersion: "cn-stock-report@1",
      },
      engine: {
        engineVersion: "2.0.0",
        registryVersion: "1.0.0",
        canonicalizationVersion: "canonicalization@1",
        decimalProfileVersion: "decimal@1",
        roundingProfileVersion: "rounding@1",
        indicatorArithmeticProfileVersion: "indicator-arithmetic@1",
      },
    };
  }

  $("#dispatch-run").addEventListener("click", async () => {
    if (!dispatchValidate()) return;
    const button = $("#dispatch-run");
    button.disabled = true;
    button.textContent = "穿越中 · 完整结果计算中……";
    const { status, json } = await api.post("/runs/portfolio", { runSpec: buildRunSpec() });
    button.disabled = false;
    button.innerHTML = '送阿一出发 <span aria-hidden="true">→</span>';
    if (status === 200 && json?.ok) {
      state.run = json;
      state.sensitivity = null;
      await ensureSnapshotsLoaded();
      updateContextRow();
      refreshStageNav();
      // Charts measure their containers: render only after the scene is visible
      // (a hidden scene reports clientWidth/Height 0 and the SVG would overflow).
      show("watch");
      renderWatch();
      return;
    }
    const message = $("#dispatch-message");
    message.className = "support-message error";
    if (status === 409) {
      message.textContent = `运行被拒绝：${json?.message ?? "确认门禁未通过"}（${json?.code ?? "409"}）`;
    } else if (json?.error) {
      message.textContent = `回测失败（${json.error.code}）：${json.error.message}`;
    } else {
      message.textContent = `运行失败（${status}）：${json?.message ?? "未知错误"}`;
    }
    message.hidden = false;
  });

  async function ensureSnapshotsLoaded() {
    for (const assetId of state.draft.universe.assets) {
      if (state.snapshots[assetId]) continue;
      const { status, json } = await api.get(`/snapshots/${encodeURIComponent(assetId)}`);
      if (status === 200) state.snapshots[assetId] = json;
    }
  }

  // ── watch (theatre) ────────────────────────────────────
  function watchDates() {
    return state.run.report.daily.map((day) => day.date);
  }

  function eventMarkers(assetId, filter) {
    const dates = watchDates();
    const indexByDate = new Map(dates.map((date, index) => [date, index]));
    const markers = [];
    for (const event of state.run.events) {
      if (event.inputRefs?.asset !== assetId) continue;
      const index = indexByDate.get(event.tradingDate);
      if (index === undefined) continue;
      const reason = event.reasonCodes.join("/");
      if (event.type === "SignalEvaluated" && (event.reasonCodes.includes("ENTRY_TRUE") || event.reasonCodes.includes("EXIT_TRUE"))) {
        if (filter !== "all" && filter !== "signal") continue;
        markers.push({ index, kind: "signal", title: `${event.tradingDate} 信号 ${reason}`, event });
      } else if (event.type === "OrderIntentCreated") {
        const stop = event.reasonCodes.some((code) => code.includes("STOP_LOSS"));
        const kind = stop ? "stop" : "intent";
        if (filter !== "all" && filter !== kind) continue;
        const p = event.payload;
        markers.push({
          index,
          kind,
          title: `${event.tradingDate} ${stop ? "止损意图" : "意图"} ${p.side === "buy" ? "买入" : "卖出"} ${p.quantity} 股 @ ~${trimDecimal(p.estimatedPrice)}（${reason}）`,
          event,
        });
      } else if (event.type === "OrderFilled") {
        const p = event.payload;
        const kind = p.side === "buy" ? "fill-buy" : "fill-sell";
        if (filter !== "all" && filter !== "fill") continue;
        markers.push({
          index,
          kind,
          title: `${event.tradingDate} 成交 ${p.side === "buy" ? "买入" : "卖出"} ${p.quantity} 股 @ ${p.price}（费用 ${p.fees}）`,
          event,
        });
      } else if (event.type === "OrderRejected") {
        if (filter !== "all" && filter !== "reject") continue;
        const p = event.payload;
        markers.push({
          index,
          kind: "reject",
          title: `${event.tradingDate} 拒单 ${p.side === "buy" ? "买入" : "卖出"} ${p.quantity} 股（${p.reason ?? reason}）`,
          event,
        });
      }
    }
    return markers;
  }

  function renderWatch() {
    const report = state.run.report;
    $("#watch-facts").innerHTML = "";
    const facts = [
      state.draft.universe.assets.map(assetShortName).join(" · "),
      `${report.range.start} → ${report.range.end}`,
      `${state.confirmation.strategyId} r${state.confirmation.revision}`,
      `Run ${shortDigest(state.run.runDigest)}`,
    ];
    for (const fact of facts) {
      const span = document.createElement("span");
      span.textContent = fact;
      $("#watch-facts").appendChild(span);
    }

    const dates = watchDates();
    const equity = report.daily.map((day) => Number(day.equity));
    const buyHoldPoi = report.buyAndHold.finalEquity !== null
      ? [{ index: dates.length - 1, value: Number(report.buyAndHold.finalEquity) }]
      : [];
    $("#equity-legend").innerHTML = "";
    const legend1 = document.createElement("span");
    legend1.innerHTML = `<span class="legend-key" style="background:#0096b4"></span>组合权益`;
    const legend2 = document.createElement("span");
    legend2.innerHTML = `<span class="legend-key" style="background:#d97706"></span>买入持有（期末点${buyHoldPoi.length === 0 ? " · 不适用" : ""}）`;
    $("#equity-legend").appendChild(legend1);
    $("#equity-legend").appendChild(legend2);
    state.charts.equity = ChartKit.lineChart($("#equity-chart"), $("#equity-tooltip"), {
      labels: dates,
      series: [
        { name: "组合权益", color: "#0096b4", values: equity, pointsOfInterest: buyHoldPoi.length ? undefined : undefined },
        ...(buyHoldPoi.length ? [{ name: "买入持有期末", color: "#d97706", values: dates.map(() => null), pointsOfInterest: buyHoldPoi }] : []),
      ],
      yFormat: (v) => money(v),
      cursorIndex: state.cursorIndex,
      onCursor: (index) => setCursor(index),
    });
    state.charts.drawdown = ChartKit.lineChart($("#drawdown-chart"), $("#drawdown-tooltip"), {
      labels: dates,
      series: [{ name: "回撤", color: "#ff4757", values: report.daily.map((day) => -Number(day.drawdown)) }],
      yFormat: (v) => pct(v),
      area: true,
      cursorIndex: state.cursorIndex,
      onCursor: (index) => setCursor(index),
    });
    renderLanes();
    renderTimeline(dates);
    setCursor(state.cursorIndex);
  }

  function renderLanes() {
    const dates = watchDates();
    const wrap = $("#event-lanes");
    wrap.textContent = "";
    state.charts.lanes = [];
    for (const assetId of state.draft.universe.assets) {
      const lane = document.createElement("div");
      lane.className = "lane";
      const head = document.createElement("div");
      head.className = "lane-head";
      const assetSummary = state.run.report.assets.find((entry) => entry.assetId === assetId);
      head.innerHTML = `<span class="asset-id">${assetId}</span><span class="lane-stats">成交 ${assetSummary?.fillCount ?? 0} · 个股止损 ${assetSummary?.positionStopLossTriggers ?? 0} 次</span>`;
      const canvas = document.createElement("div");
      const caption = document.createElement("div");
      caption.className = "lane-caption";
      caption.innerHTML =
        '<span><i style="background:#00d084"></i>买入</span><span><i style="background:#ffd700"></i>卖出</span><span><i style="background:#00d4ff"></i>意图</span><span><i style="background:#ff4757"></i>拒单/止损</span><span><i style="background:#66718c"></i>信号</span>';
      lane.appendChild(head);
      lane.appendChild(canvas);
      lane.appendChild(caption);
      wrap.appendChild(lane);
      const snapshot = state.snapshots[assetId];
      const closeByDate = new Map((snapshot?.sessions ?? []).map((session) => [session.date, session.bar ? Number(session.bar.close) : null]));
      const price = dates.map((date) => closeByDate.get(date) ?? null);
      const chart = ChartKit.laneChart(canvas, {
        labels: dates,
        price,
        markers: eventMarkers(assetId, state.eventFilter),
        cursorIndex: state.cursorIndex,
        onSelect: (marker) => openEvidence(marker.event),
      });
      state.charts.lanes.push(chart);
    }
  }

  function renderTimeline(dates) {
    const range = $("#timeline-range");
    range.min = 0;
    range.max = Math.max(0, dates.length - 1);
    range.value = state.cursorIndex;
    const labels = $("#timeline-labels");
    labels.textContent = "";
    for (const date of [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]]) {
      const span = document.createElement("span");
      span.textContent = date;
      labels.appendChild(span);
    }
  }

  function setCursor(index) {
    state.cursorIndex = index;
    const dates = watchDates();
    $("#timeline-range").value = index;
    $("#cursor-date").textContent = dates[index] ?? "—";
    const eventsUpTo = state.run.events.filter((event) => event.tradingDate <= dates[index]).length;
    $("#cursor-seq").textContent = `至该日共 ${eventsUpTo} / ${state.run.events.length} 事件`;
    state.charts.equity?.setCursor(index);
    state.charts.drawdown?.setCursor(index);
    for (const lane of state.charts.lanes) lane.setCursor(index);
    const day = state.run.report.daily[index];
    if (day) {
      const positions = day.positions
        .filter((position) => Number(position.total) > 0)
        .map((position) => `${assetShortName(position.assetId)} ${position.total} 股`)
        .join(" · ");
      $("#cursor-account").textContent = `${day.date} · 权益 ${money(day.equity)} · 现金合计 ${money(day.cash.total)}${positions ? ` · 持仓 ${positions}` : " · 空仓"}`;
    }
  }

  $("#timeline-range").addEventListener("input", (event) => {
    stopPlaying();
    setCursor(Number(event.target.value));
  });
  $("#jump-result").addEventListener("click", () => {
    stopPlaying();
    setCursor(watchDates().length - 1);
  });
  $("#play-button").addEventListener("click", () => {
    if (state.playing) return;
    state.playing = true;
    $("#pause-button").disabled = false;
    const stepMs = 1400 / state.speed;
    state.playTimer = setInterval(() => {
      const dates = watchDates();
      if (state.cursorIndex >= dates.length - 1) {
        stopPlaying();
        return;
      }
      setCursor(state.cursorIndex + 1);
    }, stepMs);
  });
  function stopPlaying() {
    state.playing = false;
    $("#pause-button").disabled = true;
    clearInterval(state.playTimer);
  }
  $("#pause-button").addEventListener("click", stopPlaying);
  $$(".speed-control button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".speed-control button").forEach((b) => b.classList.toggle("active", b === button));
      state.speed = Number(button.dataset.speed);
      if (state.playing) {
        stopPlaying();
        $("#play-button").click();
      }
    });
  });

  $("#event-filters").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    state.eventFilter = button.dataset.filter;
    $$("#event-filters .filter-chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    renderLanes();
    for (const lane of state.charts.lanes) lane.setCursor(state.cursorIndex);
  });

  function openEvidence(event) {
    $("#toggle-evidence").setAttribute("aria-expanded", "true");
    $("#theatre-grid").classList.add("with-evidence");
    $("#evidence-drawer").hidden = false;
    const box = $("#event-evidence");
    box.textContent = "";
    const title = document.createElement("h3");
    title.textContent = `${event.tradingDate} · ${event.type} · seq ${event.seq}`;
    box.appendChild(title);
    const rows = [
      ["phase", event.phase],
      ["reasonCodes", event.reasonCodes.join(", ") || "—"],
      ["inputRefs", JSON.stringify(event.inputRefs)],
      ["previousEventHash", event.previousEventHash],
      ["eventHash", event.eventHash],
    ];
    for (const [key, value] of rows) {
      const row = document.createElement("div");
      row.className = "evidence-row";
      row.innerHTML = `<span class="evidence-key">${key}</span><span class="evidence-val"></span>`;
      row.querySelector(".evidence-val").textContent = value;
      box.appendChild(row);
    }
    const pre = document.createElement("pre");
    pre.textContent = `payload\n${JSON.stringify(event.payload, null, 2)}`;
    box.appendChild(pre);
  }
  $("#toggle-evidence").addEventListener("click", () => {
    const drawer = $("#evidence-drawer");
    const showDrawer = drawer.hidden;
    drawer.hidden = !showDrawer;
    $("#theatre-grid").classList.toggle("with-evidence", showDrawer);
    $("#toggle-evidence").setAttribute("aria-expanded", String(showDrawer));
    if (showDrawer && state.run) {
      const firstFill = state.run.events.find((event) => event.type === "OrderFilled") ?? state.run.events[0];
      if (firstFill) openEvidence(firstFill);
    }
  });
  $("#to-review").addEventListener("click", () => {
    show("review");
    renderReview();
  });
  $("#back-to-watch").addEventListener("click", () => show("watch"));

  // ── review ─────────────────────────────────────────────
  function renderReview() {
    const report = state.run.report;
    $("#review-digests").innerHTML = "";
    for (const [label, digest] of [
      [`${state.confirmation.strategyId} r${state.confirmation.revision}`, state.confirmation.digest],
      ["Run", state.run.runDigest],
    ]) {
      const span = document.createElement("span");
      span.innerHTML = `${label} <code>${shortDigest(digest)}</code>`;
      $("#review-digests").appendChild(span);
    }

    // human layer — derived only from the real run ledger.
    const insights = [];
    const cum = Number(report.metrics.cumulativeReturn);
    const pnl = (Number(report.finalEquity) - Number(report.initialCash)).toFixed(2);
    insights.push({
      title: cum >= 0 ? `这趟穿越赚了 ${money(Math.abs(Number(pnl)))} CNY` : `这趟穿越亏了 ${money(Math.abs(Number(pnl)))} CNY`,
      body: `初始资金 ${money(report.initialCash)}，期末权益 ${money(report.finalEquity)}，累计收益 ${pct4(report.metrics.cumulativeReturn)}；实际成交 ${report.metrics.tradeCount} 笔${report.rejections.length > 0 ? `，另有 ${report.rejections.length} 次拒单` : ""}。`,
    });
    const maxDdDay = report.daily.reduce((worst, day) => (Number(day.drawdown) > Number(worst.drawdown) ? day : worst), report.daily[0]);
    insights.push({
      title: Number(maxDdDay.drawdown) > 0 ? `最难受的是 ${maxDdDay.date}` : "全程没有水下时刻",
      body:
        Number(maxDdDay.drawdown) > 0
          ? `当天回撤达到 ${pct4(report.metrics.maxDrawdown)}——从峰值权益回落最多的一天。这就是这份样本的最大回撤。`
          : "权益从未跌破历史峰值。",
    });
    if (report.buyAndHold.finalEquity !== null) {
      const excess = Number(report.metrics.excessReturn);
      insights.push({
        title: excess >= 0 ? "跑赢了同期买入持有" : "没跑赢同期买入持有",
        body: `买入持有期末 ${money(report.buyAndHold.finalEquity)}（${pct4(report.buyAndHold.cumulativeReturn)}），策略超额 ${pct4(report.metrics.excessReturn)}。样本只有 ${report.daily.length} 个交易日，不能证明策略今后有效或无效。`,
      });
    } else {
      insights.push({ title: "买入持有基准不适用", body: report.buyAndHold.reason ?? "本样本没有可比基准；缺失基准不等于超额为零。" });
    }
    const totalStops = report.assets.reduce((sum, entry) => sum + entry.positionStopLossTriggers, 0);
    if (totalStops > 0) {
      const stopAssets = report.assets.filter((entry) => entry.positionStopLossTriggers > 0).map((entry) => assetShortName(entry.assetId));
      insights.push({
        title: `止损纪律执行了 ${totalStops} 次`,
        body: `${stopAssets.join("、")} 触发了个股止损线——阿一按你签的纪律认输出场，没有扛单。`,
      });
    }
    const insightWrap = $("#human-insights");
    insightWrap.textContent = "";
    insights.forEach((insight, index) => {
      const article = document.createElement("article");
      const num = document.createElement("span");
      num.textContent = String(index + 1).padStart(2, "0");
      const div = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = insight.title;
      const p = document.createElement("p");
      p.textContent = insight.body;
      div.appendChild(strong);
      div.appendChild(p);
      article.appendChild(num);
      article.appendChild(div);
      insightWrap.appendChild(article);
    });

    // headline metrics, contract order
    const metricDefs = [
      { label: "累计收益", index: "01", value: pct4(report.metrics.cumulativeReturn), sub: `初始资金 ${money(report.initialCash)} CNY`, code: report.metrics.cumulativeReturn, cls: cum > 0 ? "up" : cum < 0 ? "down" : "flat" },
      { label: "最大回撤", index: "02", value: pct4(report.metrics.maxDrawdown), sub: Number(maxDdDay.drawdown) > 0 ? `最深日 ${maxDdDay.date}` : "全程无回撤", code: report.metrics.maxDrawdown, cls: Number(report.metrics.maxDrawdown) > 0 ? "down" : "flat" },
      { label: "交易次数", index: "实际成交订单", value: String(report.metrics.tradeCount), sub: `${report.fills.length} fills · 另有 ${report.rejections.length} 次拒单`, code: `tradeCount = ${report.metrics.tradeCount}`, cls: "flat" },
      {
        label: "相对买入持有超额",
        index: "04",
        value: report.metrics.excessReturn !== null ? pct4(report.metrics.excessReturn) : "—",
        sub: report.metrics.excessReturn !== null ? `基准累计收益 ${pct4(report.buyAndHold.cumulativeReturn)}` : (report.metrics.excessReturnReason ?? "基准不适用"),
        code: report.metrics.excessReturn ?? "null",
        cls: report.metrics.excessReturn === null ? "flat" : Number(report.metrics.excessReturn) > 0 ? "up" : "down",
      },
    ];
    const metricsRow = $("#metrics-row");
    metricsRow.textContent = "";
    for (const def of metricDefs) {
      const tile = document.createElement("article");
      tile.className = "metric-tile";
      tile.innerHTML = `<div class="metric-label">${def.label} <span>${def.index}</span></div><strong class="${def.cls}">${def.value}</strong><p>${def.sub}</p><code>${def.code}</code>`;
      metricsRow.appendChild(tile);
    }

    // review equity chart
    const dates = watchDates();
    $("#review-equity-legend").innerHTML = "";
    const rlegend = document.createElement("span");
    rlegend.innerHTML = `<span class="legend-key" style="background:#0096b4"></span>组合权益`;
    $("#review-equity-legend").appendChild(rlegend);
    const buyHoldPoi = report.buyAndHold.finalEquity !== null ? [{ index: dates.length - 1, value: Number(report.buyAndHold.finalEquity) }] : [];
    state.charts.reviewEquity = ChartKit.lineChart($("#review-equity-chart"), $("#review-equity-tooltip"), {
      labels: dates,
      series: [
        { name: "组合权益", color: "#0096b4", values: report.daily.map((day) => Number(day.equity)) },
        ...(buyHoldPoi.length ? [{ name: "买入持有期末", color: "#d97706", values: dates.map(() => null), pointsOfInterest: buyHoldPoi }] : []),
      ],
      yFormat: (v) => money(v),
      onCursor: () => {},
    });

    // per-asset table
    const assetRows = report.assets.map((entry) => [
      assetIdCell(entry.assetId),
      String(entry.fillCount),
      trimDecimal(entry.fees.total),
      trimDecimal(entry.endingPosition.total),
      String(entry.positionStopLossTriggers),
    ]);
    $("#assets-table").innerHTML = "";
    $("#assets-table").appendChild(
      buildTable(["资产", "成交笔数", "费用合计", "期末持仓(股)", "个股止损"], assetRows),
    );

    // fills + rejections table
    const tradeRows = [];
    for (const fill of report.fills) {
      tradeRows.push([
        fill.date,
        assetShortName(fill.assetId),
        fill.side === "buy" ? "买入" : "卖出",
        trimDecimal(fill.price),
        trimDecimal(fill.quantity),
        trimDecimal(fill.amount),
        trimDecimal(fill.fees),
        "成交",
      ]);
    }
    for (const rejection of report.rejections) {
      tradeRows.push([
        rejection.date,
        assetShortName(rejection.assetId),
        rejection.side === "buy" ? "买入" : "卖出",
        "—",
        trimDecimal(rejection.quantity),
        "—",
        "—",
        `拒单 · ${rejection.reason ?? "?"}`,
      ]);
    }
    tradeRows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    $("#trades-table").innerHTML = "";
    $("#trades-table").appendChild(
      buildTable(["日期", "资产", "方向", "价格", "数量", "金额", "费用", "状态"], tradeRows, [3, 4, 5, 6]),
    );

    // sensitivity reset
    state.sensitivity = null;
    $("#sensitivity-verdict").hidden = true;
    $("#sensitivity-table").hidden = true;
    $("#sensitivity-empty").hidden = false;
    $("#run-sensitivity").disabled = false;

    // evidence chain
    const chain = $("#evidence-chain");
    chain.textContent = "";
    const chainEntries = [
      ["runDigest", state.run.runDigest],
      ["eventDigest", report.eventDigest],
      ["reportDigest", report.reportDigest],
      ["strategyDigest", report.strategyDigest],
      ...report.snapshots.map((binding) => [`snapshot · ${assetShortName(binding.assetId)}`, binding.snapshotDigest]),
    ];
    for (const [label, value] of chainEntries) {
      const row = document.createElement("div");
      const labelNode = document.createElement("span");
      labelNode.textContent = label;
      const code = document.createElement("code");
      code.textContent = value;
      const copy = document.createElement("button");
      copy.className = "text-button copy-button";
      copy.type = "button";
      copy.textContent = "复制";
      copy.addEventListener("click", () => void copyText(value));
      row.appendChild(labelNode);
      row.appendChild(code);
      row.appendChild(copy);
      chain.appendChild(row);
    }
    $("#version-evidence").innerHTML =
      "<span>engine <code>2.0.0</code></span><span>registry <code>1.0.0</code></span><span>canonicalization <code>canonicalization@1</code></span><span>decimal <code>decimal@1</code></span><span>rounding <code>rounding@1</code></span><span>indicator arithmetic <code>indicator-arithmetic@1</code></span><span>快照来源 <code>hand-authored-synthetic</code></span>";
  }

  function assetIdCell(assetId) {
    return assetShortName(assetId);
  }

  function buildTable(headers, rows, numericColumns = []) {
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const header of headers) {
      const th = document.createElement("th");
      th.textContent = header;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const row of rows) {
      const tr = document.createElement("tr");
      row.forEach((cell, index) => {
        const td = document.createElement("td");
        td.textContent = cell;
        if (numericColumns.includes(index)) td.className = "num";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制");
    } catch {
      toast("复制失败（浏览器限制）");
    }
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy-target]");
    if (!button) return;
    const target = document.getElementById(button.dataset.copyTarget);
    if (target) void copyText(target.textContent);
  });

  // ── sensitivity ────────────────────────────────────────
  $("#run-sensitivity").addEventListener("click", async () => {
    const button = $("#run-sensitivity");
    button.disabled = true;
    button.textContent = "逐参数微动重跑中……";
    const { status, json } = await api.post(`/runs/portfolio/${encodeURIComponent(state.run.runDigest)}/sensitivity`, {});
    button.disabled = false;
    button.textContent = "运行敏感性分析";
    if (status !== 200) {
      $("#sensitivity-empty").textContent = `敏感性分析失败（${status}）：${json?.message ?? "未知错误"}`;
      return;
    }
    state.sensitivity = json;
    const report = json.report;
    const verdict = $("#sensitivity-verdict");
    verdict.hidden = false;
    if (report.verdict.trustworthy) {
      verdict.className = "sensitivity-verdict trustworthy";
      verdict.textContent = `通过：${report.variants.length} 个参数微动变体都没有改变结论方向。`;
    } else {
      verdict.className = "sensitivity-verdict flipped";
      verdict.textContent = `策略不可信：参数微动结果翻天（${report.verdict.flippedVariantCount} 个变体翻天，${report.verdict.reasons.join(" / ")}）。`;
    }
    const rows = report.variants.map((variant) => {
      const flip = variant.flip.cumulativeReturnSignChanged || variant.flip.excessReturnReversed;
      return [
        variant.paramPath,
        `${variant.direction === "down" ? "−" : "+"}步进`,
        String(variant.baseValue),
        String(variant.perturbedValue),
        pct4(variant.metrics.cumulativeReturn),
        pct4(variant.metrics.maxDrawdown),
        String(variant.metrics.tradeCount),
        variant.metrics.excessReturn !== null ? pct4(variant.metrics.excessReturn) : "—",
        flip ? "⚠ 翻天" : "—",
        flip,
      ];
    });
    const wrap = $("#sensitivity-table");
    wrap.textContent = "";
    const table = buildTable(["参数", "方向", "原值", "微动值", "累计收益", "最大回撤", "成交", "超额", "判定"], rows, [4, 5, 6, 7]);
    rows.forEach((row, index) => {
      if (row[9]) table.tBodies[0].rows[index].cells[8].className = "flip-flag";
    });
    wrap.appendChild(table);
    if (json.omitted && json.omitted.length > 0) {
      const note = document.createElement("p");
      note.style.cssText = "color:var(--text-faint);font-size:12px;margin:8px 0 0";
      note.textContent = `省略的变体：${json.omitted.map((entry) => `${entry.paramPath}:${entry.direction}（${entry.reason}）`).join("；")}`;
      wrap.appendChild(note);
    }
    wrap.hidden = false;
    $("#sensitivity-empty").hidden = true;
  });

  // ── adjust (v2 flow) ───────────────────────────────────
  $("#adjust-again").addEventListener("click", async () => {
    state.baseCanonicalAst = state.card.canonicalAst;
    state.baseDigest = state.card.strategyDigest;
    state.adjustStrategyId = state.confirmation.strategyId;
    await startInterview(state.style, state.baseCanonicalAst);
  });

  // ── boot ───────────────────────────────────────────────
  show("landing");
})();
