(() => {
  "use strict";

  const D = window.SR_DATA;
  const NS = "http://www.w3.org/2000/svg";
  let COLORS = { accent: "#0096b4", compare: "#d97706", neutral: "#8b9dc3", grid: "#252f4a", surface: "#141b2d", up: "#00d084", down: "#ff4757" };
  function refreshChartColors() {
    const tokens = getComputedStyle(document.documentElement);
    COLORS = {
      accent: tokens.getPropertyValue("--chart-accent").trim(),
      compare: tokens.getPropertyValue("--chart-compare").trim(),
      neutral: tokens.getPropertyValue("--muted").trim(),
      grid: tokens.getPropertyValue("--chart-grid").trim(),
      surface: tokens.getPropertyValue("--panel").trim(),
      up: tokens.getPropertyValue("--good").trim(),
      down: tokens.getPropertyValue("--critical").trim()
    };
  }
  const dates = D.snapshot.sessions.map((session) => session.date);
  const state = { scene: "a", aView: "onboarding", market: "china", dialoguePath: "novice", dialogueStep: 0, baseline: false, evidenceOpen: false, cursor: 0, selectedSeq: 4, filter: "all", speed: 1, playing: false, timer: null, detail: "orders", working: "drafting" };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "—").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const shortDate = (date) => date.slice(5).replace("-", "/");
  const pct = (value) => `${(Number(value) * 100).toFixed(4)}%`;
  const money = (value) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let toastTimer;

  function svgElement(tag, attributes = {}, text) {
    const element = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function baseChart(container, width, height, label) {
    container.replaceChildren();
    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", tabindex: "0", "aria-label": label });
    container.append(svg);
    return svg;
  }

  function addText(svg, x, y, text, className = "axis-text", anchor = "start") {
    const node = svgElement("text", { x, y, class: className, "text-anchor": anchor }, text);
    svg.append(node);
    return node;
  }

  function renderLegend(container, items) {
    container.replaceChildren();
    items.forEach((item) => {
      const wrapper = document.createElement("span");
      wrapper.className = "legend-item";
      const mark = document.createElement("span");
      mark.className = `legend-${item.mark || "line"}${item.dashed ? " dashed" : ""}`;
      mark.style.setProperty("--series-color", item.color);
      const label = document.createElement("span");
      label.textContent = item.label;
      wrapper.append(mark, label);
      container.append(wrapper);
    });
  }

  function showTooltip(wrap, tooltip, date, rows, clientX) {
    tooltip.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "tooltip-date";
    heading.textContent = date;
    tooltip.append(heading);
    rows.forEach((row) => {
      const line = document.createElement("div");
      line.className = "tooltip-row";
      const key = document.createElement("span");
      key.className = "legend-line";
      key.style.setProperty("--series-color", row.color || COLORS.neutral);
      const label = document.createElement("span");
      label.textContent = row.label;
      const value = document.createElement("strong");
      value.textContent = row.value;
      line.append(key, label, value);
      tooltip.append(line);
    });
    tooltip.hidden = false;
    const bounds = wrap.getBoundingClientRect();
    const localX = clientX === undefined ? bounds.width / 2 : clientX - bounds.left;
    const tooltipWidth = tooltip.offsetWidth;
    tooltip.style.left = `${Math.max(4, Math.min(bounds.width - tooltipWidth - 4, localX + 12))}px`;
    tooltip.style.top = "12px";
  }

  function attachHover({ svg, wrap, tooltip, plot, count, rowsForIndex, onSelect }) {
    const hoverLine = svgElement("line", { x1: 0, x2: 0, y1: plot.top, y2: plot.bottom, class: "hover-line", visibility: "hidden" });
    svg.append(hoverLine);
    const hit = svgElement("rect", { x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top, class: "chart-hit" });
    svg.append(hit);
    let keyboardIndex = state.cursor;
    const xAt = (index) => plot.left + (plot.right - plot.left) * (count === 1 ? 0.5 : index / (count - 1));
    const show = (index, clientX) => {
      keyboardIndex = Math.max(0, Math.min(count - 1, index));
      hoverLine.setAttribute("x1", xAt(keyboardIndex));
      hoverLine.setAttribute("x2", xAt(keyboardIndex));
      hoverLine.setAttribute("visibility", "visible");
      const payload = rowsForIndex(keyboardIndex);
      showTooltip(wrap, tooltip, payload.date, payload.rows, clientX);
    };
    const hide = () => { hoverLine.setAttribute("visibility", "hidden"); tooltip.hidden = true; };
    hit.addEventListener("pointermove", (event) => {
      const rect = svg.getBoundingClientRect();
      const svgX = (event.clientX - rect.left) * (Number(svg.getAttribute("viewBox").split(" ")[2]) / rect.width);
      const ratio = (svgX - plot.left) / (plot.right - plot.left);
      show(Math.round(ratio * (count - 1)), event.clientX);
    });
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("click", () => { if (onSelect) onSelect(keyboardIndex); });
    svg.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        show(keyboardIndex + (event.key === "ArrowRight" ? 1 : -1));
      } else if (event.key === "Enter" && onSelect) {
        event.preventDefault();
        onSelect(keyboardIndex);
      } else if (event.key === "Escape") hide();
    });
    svg.addEventListener("focus", () => show(state.cursor));
    svg.addEventListener("blur", hide);
  }

  function renderPriceChart() {
    const width = Math.max(320, Math.round($("#price-chart").clientWidth || 780)), height = 176;
    const plot = { left: 48, right: width - 26, top: 12, bottom: height - 34 };
    const svg = baseChart($("#price-chart"), width, height, "六日原始 OHLC 价格图；方向键查看，回车同步 cursor");
    const sessions = D.snapshot.sessions;
    const x = (index) => plot.left + (plot.right - plot.left) * index / (sessions.length - 1);
    const y = (value) => plot.bottom - (Number(value) - 8.7) / (12.3 - 8.7) * (plot.bottom - plot.top);
    [9, 10, 11, 12].forEach((tick) => {
      svg.append(svgElement("line", { x1: plot.left, x2: plot.right, y1: y(tick), y2: y(tick), class: "grid-line" }));
      addText(svg, plot.left - 9, y(tick) + 3, tick.toFixed(2), "axis-text", "end");
    });
    sessions.forEach((session, index) => addText(svg, x(index), height - 11, shortDate(session.date), "axis-text", "middle"));
    svg.append(svgElement("line", { x1: x(state.cursor), x2: x(state.cursor), y1: plot.top, y2: plot.bottom, class: "cursor-line" }));
    sessions.forEach((session, index) => {
      const bar = session.bar;
      const color = Number(bar.close) > Number(bar.open) ? COLORS.up : Number(bar.close) < Number(bar.open) ? COLORS.down : COLORS.neutral;
      const center = x(index);
      svg.append(svgElement("line", { x1: center, x2: center, y1: y(bar.high), y2: y(bar.low), stroke: color, "stroke-width": 2 }));
      const top = Math.min(y(bar.open), y(bar.close));
      const bodyHeight = Math.max(2, Math.abs(y(bar.open) - y(bar.close)));
      svg.append(svgElement("rect", { x: center - 8, y: top, width: 16, height: bodyHeight, rx: 1, fill: color, stroke: COLORS.surface, "stroke-width": 2 }));
    });
    D.report.fills.forEach((fill) => {
      const index = dates.indexOf(fill.date);
      const isBuy = fill.side === "buy";
      const markerY = isBuy ? y(D.snapshot.sessions[index].bar.low) + 17 : y(D.snapshot.sessions[index].bar.high) - 17;
      const color = isBuy ? COLORS.up : COLORS.down;
      svg.append(svgElement("circle", { cx: x(index), cy: markerY, r: 8, fill: color, class: "marker-ring" }));
      addText(svg, x(index), markerY + 3, isBuy ? "B" : "S", "end-label", "middle").setAttribute("fill", "#ffffff");
    });
    attachHover({
      svg, wrap: $("#price-chart-wrap"), tooltip: $("#price-tooltip"), plot, count: sessions.length,
      rowsForIndex: (index) => {
        const bar = sessions[index].bar;
        return { date: sessions[index].date, rows: [
          { label: "开盘", value: bar.open, color: COLORS.neutral }, { label: "最高", value: bar.high, color: COLORS.neutral },
          { label: "最低", value: bar.low, color: COLORS.neutral }, { label: "收盘", value: bar.close, color: COLORS.accent },
          { label: "成交量 (share)", value: bar.volume, color: COLORS.neutral }
        ] };
      },
      onSelect: setCursor
    });
  }

  function renderEquityChart(containerSelector, wrapSelector, tooltipSelector, legendSelector, height = 158) {
    const width = Math.max(320, Math.round($(containerSelector).clientWidth || 780));
    const plot = { left: 55, right: width - 100, top: 14, bottom: height - 30 };
    const svg = baseChart($(containerSelector), width, height, "策略权益与买入持有期末点；方向键查看，回车同步 cursor");
    const daily = D.report.daily;
    const x = (index) => plot.left + (plot.right - plot.left) * index / (daily.length - 1);
    const y = (value) => plot.bottom - (Number(value) - 1870) / (2220 - 1870) * (plot.bottom - plot.top);
    [1900, 2000, 2100].forEach((tick) => {
      svg.append(svgElement("line", { x1: plot.left, x2: plot.right, y1: y(tick), y2: y(tick), class: "grid-line" }));
      addText(svg, plot.left - 9, y(tick) + 3, money(tick), "axis-text", "end");
    });
    daily.forEach((day, index) => addText(svg, x(index), height - 7, shortDate(day.date), "axis-text", "middle"));
    const points = daily.map((day, index) => [x(index), y(day.equity)]);
    const linePath = points.map((point, index) => `${index ? "L" : "M"}${point[0]},${point[1]}`).join(" ");
    const areaPath = `${linePath} L${points[points.length - 1][0]},${plot.bottom} L${points[0][0]},${plot.bottom} Z`;
    svg.append(svgElement("path", { d: areaPath, fill: COLORS.accent, opacity: .08 }));
    svg.append(svgElement("path", { d: linePath, class: "series-line", stroke: COLORS.accent }));
    points.forEach((point) => svg.append(svgElement("circle", { cx: point[0], cy: point[1], r: 4, fill: COLORS.accent, class: "marker-ring" })));
    const last = points[points.length - 1];
    const bhX = x(daily.length - 1), bhY = y(D.report.buyAndHold.finalEquity);
    svg.append(svgElement("circle", { cx: bhX, cy: bhY, r: 5, fill: COLORS.compare, class: "marker-ring" }));
    svg.append(svgElement("line", { x1: last[0] + 4, x2: last[0] + 12, y1: last[1], y2: last[1] + 15, stroke: COLORS.accent, "stroke-width": 1 }));
    addText(svg, last[0] + 15, last[1] + 19, money(D.report.finalEquity), "end-label");
    svg.append(svgElement("line", { x1: bhX + 4, x2: bhX + 12, y1: bhY, y2: bhY - 15, stroke: COLORS.compare, "stroke-width": 1 }));
    addText(svg, bhX + 15, bhY - 18, `BH ${money(D.report.buyAndHold.finalEquity)}`, "end-label");
    svg.append(svgElement("line", { x1: x(state.cursor), x2: x(state.cursor), y1: plot.top, y2: plot.bottom, class: "cursor-line" }));
    renderLegend($(legendSelector), [
      { label: "策略权益", color: COLORS.accent, mark: "line" },
      { label: "买入持有期末点（无日频序列）", color: COLORS.compare, mark: "dot" }
    ]);
    attachHover({
      svg, wrap: $(wrapSelector), tooltip: $(tooltipSelector), plot, count: daily.length,
      rowsForIndex: (index) => ({ date: daily[index].date, rows: [
        { label: "策略权益 CNY", value: money(daily[index].equity), color: COLORS.accent },
        { label: "买入持有期末点", value: index === daily.length - 1 ? money(D.report.buyAndHold.finalEquity) : "未提供日频值", color: COLORS.compare }
      ] }),
      onSelect: setCursor
    });
  }

  function renderDrawdownChart(containerSelector, wrapSelector, tooltipSelector, compact = true) {
    const width = Math.max(280, Math.round($(containerSelector).clientWidth || (compact ? 460 : 780))), height = compact ? 136 : 116;
    const plot = { left: 45, right: width - 18, top: 12, bottom: height - 27 };
    const svg = baseChart($(containerSelector), width, height, "六日回撤图；方向键查看，回车同步 cursor");
    const daily = D.report.daily;
    const x = (index) => plot.left + (plot.right - plot.left) * index / (daily.length - 1);
    const y = (value) => plot.top + Number(value) / .15 * (plot.bottom - plot.top);
    [0, .05, .1].forEach((tick) => {
      svg.append(svgElement("line", { x1: plot.left, x2: plot.right, y1: y(tick), y2: y(tick), class: "grid-line" }));
      addText(svg, plot.left - 7, y(tick) + 3, `${tick * 100}%`, "axis-text", "end");
    });
    daily.forEach((day, index) => addText(svg, x(index), height - 6, shortDate(day.date), "axis-text", "middle"));
    const points = daily.map((day, index) => [x(index), y(day.drawdown)]);
    const linePath = points.map((point, index) => `${index ? "L" : "M"}${point[0]},${point[1]}`).join(" ");
    const areaPath = `${linePath} L${points[points.length - 1][0]},${plot.top} L${points[0][0]},${plot.top} Z`;
    svg.append(svgElement("path", { d: areaPath, fill: COLORS.down, opacity: .08 }));
    svg.append(svgElement("path", { d: linePath, class: "series-line", stroke: COLORS.down }));
    const maxIndex = daily.findIndex((day) => day.drawdown === D.report.metrics.maxDrawdown);
    svg.append(svgElement("circle", { cx: x(maxIndex), cy: y(daily[maxIndex].drawdown), r: 4, fill: COLORS.down, class: "marker-ring" }));
    addText(svg, x(maxIndex) + 7, y(daily[maxIndex].drawdown) + 12, pct(D.report.metrics.maxDrawdown), "end-label");
    svg.append(svgElement("line", { x1: x(state.cursor), x2: x(state.cursor), y1: plot.top, y2: plot.bottom, class: "cursor-line" }));
    attachHover({
      svg, wrap: $(wrapSelector), tooltip: $(tooltipSelector), plot, count: daily.length,
      rowsForIndex: (index) => ({ date: daily[index].date, rows: [{ label: "回撤", value: pct(daily[index].drawdown), color: COLORS.down }] }),
      onSelect: setCursor
    });
  }

  function eventCategory(event) {
    if (event.type === "SignalEvaluated") return "signal";
    if (event.type === "OrderIntentCreated") return "intent";
    if (event.type === "OrderFilled") return "fill";
    if (event.type === "OrderRejected") return "reject";
    return "ledger";
  }

  function renderEventLanes() {
    const container = $("#event-lanes");
    container.replaceChildren();
    const corner = document.createElement("div");
    corner.className = "lane-corner";
    corner.textContent = "phase / date";
    container.append(corner);
    dates.forEach((date) => {
      const label = document.createElement("div");
      label.className = "lane-date";
      label.textContent = shortDate(date);
      container.append(label);
    });
    const lanes = [["signal", "信号"], ["intent", "意图"], ["fill", "成交"], ["reject", "拒单"], ["ledger", "账本"]];
    lanes.forEach(([category, label]) => {
      const labelNode = document.createElement("div");
      labelNode.className = "lane-label";
      labelNode.textContent = label;
      container.append(labelNode);
      dates.forEach((date, dateIndex) => {
        const cell = document.createElement("div");
        cell.className = `lane-cell${state.cursor === dateIndex ? " current" : ""}`;
        const events = D.events.filter((event) => event.tradingDate === date && eventCategory(event) === category && (state.filter === "all" || state.filter === category));
        events.forEach((event) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `event-mark ${category}${state.selectedSeq === event.seq ? " selected" : ""}`;
          button.textContent = `#${event.seq}`;
          button.title = `${event.type} · ${event.reasonCodes.join(", ") || "no reason code"}`;
          button.setAttribute("aria-label", `${date} seq ${event.seq} ${event.type}`);
          button.addEventListener("click", () => {
            state.evidenceOpen = true;
            syncEvidenceDrawer();
            setCursor(dateIndex, event.seq);
          });
          cell.append(button);
        });
        container.append(cell);
      });
    });
    $("#event-subset-label").textContent = `${D.events.length} 个关键事件 / 完整流 ${D.source.eventCount} 条`;
  }

  function renderEvidence() {
    const event = D.events.find((item) => item.seq === state.selectedSeq) || D.events[0];
    $("#event-evidence").innerHTML = `
      <div class="event-type-row"><div><span class="field-label">${esc(event.phase)}</span><h3>${esc(event.type)}</h3></div><span class="event-seq">#${event.seq}</span></div>
      <div class="evidence-fields">
        <div><span>tradingDate</span><strong>${esc(event.tradingDate)}</strong></div>
        <div><span>eventVersion</span><strong>${esc(event.eventVersion)}</strong></div>
      </div>
      <div class="evidence-section"><span>reasonCodes</span><div class="reason-list">${event.reasonCodes.length ? event.reasonCodes.map((code) => `<span class="reason-code">${esc(code)}</span>`).join("") : "<span class=\"microcopy\">无 reason code</span>"}</div></div>
      <div class="evidence-section"><span>inputRefs · intent / fill 引用保持原值</span><pre class="evidence-json">${esc(JSON.stringify(event.inputRefs, null, 2))}</pre></div>
      <div class="evidence-section"><span>payload</span><pre class="evidence-json">${esc(JSON.stringify(event.payload, null, 2))}</pre></div>
      <div class="evidence-section"><span>event hash chain</span><div class="hash-pair"><span>previousEventHash</span><code>${esc(event.previousEventHash)}</code></div><div class="hash-pair"><span>eventHash</span><code>${esc(event.eventHash)}</code></div></div>`;
    const index = D.events.findIndex((item) => item.seq === event.seq);
    $("#previous-event").disabled = index <= 0;
    $("#next-event").disabled = index === D.events.length - 1;
  }

  function renderCursorAccount() {
    const day = D.report.daily[state.cursor];
    $("#cursor-account").innerHTML = `<span class="account-date">${esc(day.date)}</span><span>现金 <strong>${money(day.cash.total)}</strong></span><span>可用 <strong>${money(day.cash.available)}</strong></span><span>持仓 <strong>${day.position.total} share</strong></span><span>权益 <strong>${money(day.equity)}</strong></span><span>回撤 <strong>${pct(day.drawdown)}</strong></span>`;
  }

  function renderTheatre() {
    refreshChartColors();
    syncEvidenceDrawer();
    $$('[data-story-cursor]').forEach((button) => button.classList.toggle("active", Number(button.dataset.storyCursor) === state.cursor));
    $("#timeline-range").value = state.cursor;
    $("#cursor-date").textContent = dates[state.cursor];
    $("#cursor-seq").textContent = `seq ${state.selectedSeq} / 33 · 34 events`;
    renderPriceChart();
    renderEquityChart("#equity-chart", "#equity-chart-wrap", "#equity-tooltip", "#equity-legend");
    renderDrawdownChart("#drawdown-chart", "#drawdown-chart-wrap", "#drawdown-tooltip");
    renderEventLanes();
    renderEvidence();
    renderCursorAccount();
  }

  function setCursor(index, selectedSeq) {
    state.cursor = Math.max(0, Math.min(dates.length - 1, index));
    if (selectedSeq !== undefined) {
      state.selectedSeq = selectedSeq;
    } else {
      const sameDate = D.events.filter((event) => event.tradingDate === dates[state.cursor]);
      state.selectedSeq = sameDate[sameDate.length - 1].seq;
    }
    renderTheatre();
  }

  function stopPlayback() {
    state.playing = false;
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null;
    $("#play-button").disabled = false;
    $("#pause-button").disabled = true;
  }

  function startPlayback() {
    if (state.cursor === dates.length - 1) setCursor(0);
    state.playing = true;
    $("#play-button").disabled = true;
    $("#pause-button").disabled = false;
    if (state.timer) window.clearInterval(state.timer);
    state.timer = window.setInterval(() => {
      if (state.cursor >= dates.length - 1) stopPlayback();
      else setCursor(state.cursor + 1);
    }, 900 / state.speed);
  }

  const dialogueScripts = {
    novice: {
      label: "新手对话",
      steps: [
        { speaker: "ai", text: "你想验证什么投资想法？随便说，不用术语。", stage: 0 },
        { speaker: "user", text: "低买高卖，能验证吗？", stage: 0 },
        { speaker: "ai", text: "可以。先把“低”说清楚：价格到多少，你才愿意买？我只帮你把规则说明白，不推荐买点。", stage: 0, level: "水平判断：白话目标 → 先问可计算的触发条件" },
        { speaker: "user", text: "收盘价跌到 9 元或更低就买。", stage: 1 },
        { speaker: "ai", text: "入场能计算了：close ≤ 9。那什么时候卖？", stage: 1 },
        { speaker: "user", text: "涨到 12 元就卖；等不到的话，20 天后也卖。", stage: 2 },
        { speaker: "ai", text: "出场也有了。每次用多少资金？已经持有时还要加仓吗？", stage: 2 },
        { speaker: "user", text: "每次用一半资金，不加仓。", stage: 3 },
        { speaker: "ai", text: "规则齐了。右边是从这份 AST 映射的回读预览；真实流程仍须校验、权威回读，再由你按 expectedDigest 确认。", stage: 4, level: "语言适配：保留“买入／卖出”，术语只作辅助解释" }
      ],
      strategy: {
        schemaVersion: "1.0.0", name: "低买高卖 · 对话演示", indicators: {},
        entry: { lte: [{ ref: "close" }, { const: "9" }] },
        exits: [{ any: [{ gte: [{ ref: "close" }, { const: "12" }] }, { gte: [{ ref: "position.barsHeld" }, { const: "20" }] }] }],
        position: { side: "long", allowAdd: false, entrySize: { cashFraction: "0.50" }, exitSize: { positionFraction: "1.00" } }
      },
      summary: "收盘价不高于 9 元时买入；收盘价不低于 12 元，或持有满 20 个 bar 时全部卖出。",
      clauses: [["入场", "close ≤ 9", "/entry"], ["出场", "close ≥ 12 或 barsHeld ≥ 20", "/exits/0"], ["仓位", "50% 资金 · 不加仓 · 全部退出", "/position"]]
    },
    expert: {
      label: "老手对话",
      steps: [
        { speaker: "ai", text: "你想验证什么投资想法？指标和参数都可以直接说。", stage: 0 },
        { speaker: "user", text: "MACD 三日内金叉，KDJ 过滤。", stage: 1 },
        { speaker: "ai", text: "你给了明确指标和时间窗。KDJ 过滤是 K>D 且 J<90 吗？MACD 用 12/26/9、KDJ 用 9/3/3？出场和仓位怎么定？", stage: 1, level: "水平判断：指标＋窗口明确 → 直接核对参数与缺口" },
        { speaker: "user", text: "对。死叉或持有 20 个 bar 退出；每次 50% 资金，不加仓。", stage: 3 },
        { speaker: "ai", text: "参数与入出场都齐了。右边是 AST 回读预览；真实流程仍须校验、权威回读和 expectedDigest 确认。", stage: 4, level: "语言适配：保留专业缩写，不重复解释已知概念" }
      ],
      strategy: {
        schemaVersion: "1.0.0", name: "MACD 三日内金叉，KDJ 过滤",
        indicators: { m: { use: "macd@1", params: { fast: 12, slow: 26, signal: 9 } }, k: { use: "kdj@1", params: { period: 9, kSmooth: 3, dSmooth: 3 } } },
        entry: { all: [{ within: { window: 3, condition: { crossAbove: [{ ref: "m.dif" }, { ref: "m.dea" }] } } }, { gt: [{ ref: "k.k" }, { ref: "k.d" }] }, { lt: [{ ref: "k.j" }, { const: "90" }] }] },
        exits: [{ any: [{ crossBelow: [{ ref: "m.dif" }, { ref: "m.dea" }] }, { gte: [{ ref: "position.barsHeld" }, { const: "20" }] }] }],
        position: { side: "long", allowAdd: false, entrySize: { cashFraction: "0.50" }, exitSize: { positionFraction: "1.00" } }
      },
      summary: "三日内 MACD 金叉，且 K>D、J<90 时入场；死叉或持有满 20 个 bar 时退出。",
      clauses: [["指标", "MACD 12/26/9 · KDJ 9/3/3", "/indicators"], ["入场", "within 3 · crossAbove · K>D · J<90", "/entry"], ["出场", "crossBelow 或 barsHeld ≥ 20", "/exits/0"], ["仓位", "50% 资金 · 不加仓 · 全部退出", "/position"]]
    }
  };

  function loadDialogue(path, step = 0) {
    state.dialoguePath = dialogueScripts[path] ? path : "novice";
    state.dialogueStep = Math.max(0, Math.min(step, dialogueScripts[state.dialoguePath].steps.length - 1));
    state.working = "drafting";
    state.baseline = false;
    updateWorkingState();
    renderDialogue();
  }

  function startDialogue(path, step = 0) {
    loadDialogue(path, step);
    showAView("workbench");
    toast("这是预写对话脚本，不是 Kimi 实时回复；只形成 AST 与回读预览，不生成新 Run。");
  }

  function renderDialogue() {
    const script = dialogueScripts[state.dialoguePath];
    const stage = script.steps[state.dialogueStep].stage;
    $$('[data-script-path]').forEach((button) => {
      const active = button.dataset.scriptPath === state.dialoguePath;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const stream = $("#dialogue-stream");
    stream.replaceChildren();
    script.steps.slice(0, state.dialogueStep + 1).forEach((step) => {
      const wrapper = document.createElement("div");
      wrapper.className = `dialogue-message ${step.speaker}`;
      const speaker = document.createElement("span");
      speaker.className = "dialogue-speaker";
      speaker.textContent = step.speaker === "ai" ? "衡一 · 演示" : "你 · 演示";
      const bubble = document.createElement("div");
      bubble.className = "dialogue-bubble";
      bubble.textContent = step.text;
      wrapper.append(speaker, bubble);
      if (step.level) {
        const level = document.createElement("span");
        level.className = "level-judgment";
        level.textContent = step.level;
        wrapper.append(level);
      }
      stream.append(wrapper);
    });
    stream.scrollTop = stream.scrollHeight;
    $("#dialogue-progress").textContent = `${state.dialogueStep + 1} / ${script.steps.length}`;
    $("#next-dialogue").disabled = state.dialogueStep === script.steps.length - 1;
    $("#next-dialogue").textContent = state.dialogueStep === script.steps.length - 1 ? "对话已收敛" : "下一句 →";
    renderRulesPreview(script, stage);
    renderReadbackPreview(script, stage);
    updateWorkingState();
  }

  function renderRulesPreview(script, stage) {
    const expert = state.dialoguePath === "expert";
    const entry = stage >= 1 ? (expert ? "三日内 MACD 金叉 + K>D + J<90" : "close ≤ 9") : "等你说清楚买入条件";
    const exit = stage >= 2 ? (expert ? "MACD 死叉或 barsHeld ≥ 20" : "close ≥ 12 或 barsHeld ≥ 20") : "继续追问：什么时候卖？";
    const position = stage >= 3;
    $("#rules-body").innerHTML = `
      <div class="rule-title-row"><div><span class="field-label">策略草稿 · 演示</span><strong>${stage >= 4 ? esc(script.strategy.name) : "规则还在对话中"}</strong></div><code>schema 1.0.0</code></div>
      ${expert && stage >= 1 ? `<div class="rule-section rule-formed"><div class="section-label">指标与参数</div><div class="indicator-parameters"><div><code>MACD</code><span>12 / 26 / 9</span></div><div><code>KDJ</code><span>9 / 3 / 3</span></div></div></div>` : ""}
      <div class="rule-section ${stage >= 1 ? "rule-formed" : ""}"><div class="section-label">入场 · <code>/entry</code></div>${stage >= 1 ? `<div class="condition-row"><code>${expert ? "all" : "lte"}</code><span>${esc(entry)}</span></div>` : `<div class="rule-placeholder">${esc(entry)}</div>`}</div>
      <div class="rule-section ${stage >= 2 ? "rule-formed" : ""}"><div class="section-label">出场 · <code>/exits/0</code></div>${stage >= 2 ? `<div class="condition-row"><code>any</code><span>${esc(exit)}</span></div>` : `<div class="rule-placeholder">${esc(exit)}</div>`}</div>
      <div class="rule-section ${position ? "rule-formed" : ""}"><div class="section-label">仓位 · <code>/position</code></div>${position ? `<div class="position-rules"><div><span>方向</span><strong>long only</strong></div><div><span>允许加仓</span><strong>false</strong></div><div><span>入场资金</span><strong>50%</strong></div><div><span>退出持仓</span><strong>100%</strong></div></div>` : `<div class="rule-placeholder">最后确认资金使用方式</div>`}</div>
      ${stage >= 4 ? `<details class="disclosure ast-disclosure"><summary>AST 示例 · 未执行实时校验</summary><pre>${esc(JSON.stringify(script.strategy, null, 2))}</pre></details>` : ""}`;
  }

  function renderReadbackPreview(script, stage) {
    const ready = stage >= 4;
    $("#readback-body").innerHTML = `
      <div class="readback-pipeline"><span class="${ready ? "ready" : ""}">AST</span>→<span>校验</span>→<span>权威回读</span>→<span>expectedDigest</span></div>
      <div class="validation-pending"><strong>${ready ? "对话已收敛到 AST" : "规则尚未完整"}</strong><span>${ready ? "演示未执行校验；不得跳过权威回读与确认" : "对话继续时，确认与运行保持阻断"}</span></div>
      <div class="digest-block"><span class="field-label">strategyDigest</span><code>待真实 canonicalization 与校验生成</code></div>
      ${ready ? `<div class="readback-summary"><span class="source-tag">READBACK PREVIEW · FROM SCRIPT AST</span><h3>${esc(script.summary)}</h3><p>这不是模型散文；真实权威回读只能由 canonical AST 与注册表模板生成。</p></div><div class="clause-list">${script.clauses.map(([label, text, path]) => `<div><span>${esc(label)}</span><p>${esc(text)}</p><code>${esc(path)}</code></div>`).join("")}</div>` : `<div class="rule-placeholder">入场、出场和仓位齐全后，这里显示回读预览。</div>`}
      <div class="model-explanation"><span>模型辅助解释</span><strong>预写脚本</strong><p>辅助解释永不替代权威回读。</p></div>`;
  }

  function syncEvidenceDrawer() {
    $("#evidence-drawer").hidden = !state.evidenceOpen;
    $(".theatre-grid").classList.toggle("evidence-collapsed", !state.evidenceOpen);
    $("#toggle-evidence").setAttribute("aria-expanded", String(state.evidenceOpen));
    $("#toggle-evidence").textContent = state.evidenceOpen ? "收起当时依据" : "问他当时依据";
  }

  function setEvidenceOpen(open) {
    state.evidenceOpen = Boolean(open);
    syncEvidenceDrawer();
    renderTheatre();
  }

  function syncAView() {
    const onboarding = state.aView === "onboarding";
    $("#onboarding-view").hidden = !onboarding;
    $("#workbench-view").hidden = onboarding;
    document.body.classList.toggle("onboarding-active", state.scene === "a" && onboarding);
  }

  function showAView(view) {
    state.aView = view === "workbench" ? "workbench" : "onboarding";
    syncAView();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function updateOnboardingGate() {
    const marketSupported = state.market === "china";
    const goldenRange = $("#onboarding-start").value === "2024-01-01" && $("#onboarding-end").value === "2024-01-06";
    const message = $("#support-message");
    let reason = "";
    if (!marketSupported) reason = "该市场仅作产品愿景展示，当前尚未开放，不能生成或运行。请切回中国 A 股查看合成示例。";
    else if (!goldenRange) reason = "当前原型只有 2024-01-01 至 2024-01-06 的 golden 数据。其他历史区间不会用合成曲线代替。";
    message.hidden = !reason;
    message.textContent = reason;
    $("#open-workbench").disabled = Boolean(reason);
    $$('[data-dialogue-path]').forEach((button) => { button.disabled = Boolean(reason); });
    $("#open-workbench").title = reason || "打开预写新手对话；只形成 AST 与回读预览";
  }

  function showScene(scene, updateHash = true) {
    if (!["a", "b", "c"].includes(scene)) scene = "a";
    state.scene = scene;
    syncAView();
    $$('[data-scene-panel]').forEach((panel) => {
      const active = panel.dataset.scenePanel === scene;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    $$(".scene-tab").forEach((tab) => {
      const active = tab.dataset.scene === scene;
      tab.classList.toggle("active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    if (updateHash) history.replaceState(null, "", `#${scene}`);
    if (scene === "b") renderTheatre();
    if (scene === "c") renderReportCharts();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function updateWorkingState() {
    const script = dialogueScripts[state.dialoguePath];
    const complete = script.steps[state.dialogueStep].stage >= 4;
    $("#working-revision").textContent = state.baseline ? "新草稿 · 基于 synthetic-basic v1" : `${script.label} · AST 演示`;
    $("#working-digest").textContent = "digest 待真实校验";
    $("#working-status").textContent = "SCRIPT DEMO";
    $("#working-status").className = "status-pill drafting";
    $("#a-status").textContent = complete ? "AST READY" : "DIALOGUING";
    $("#a-status").className = "status-pill drafting";
    $("#baseline-banner").hidden = !state.baseline;
    $("#run-button").disabled = true;
    $("#run-block-reason").textContent = "预写脚本未经过真实校验与 expectedDigest 确认；旧 golden Run 仍可从 B / C 只读查看";
    $("#confirm-label").textContent = complete ? "AST 示例 · 待真实校验与确认" : "对话尚未收敛";
    $("#confirm-button").textContent = "确认需真实流程";
    $("#confirm-button").disabled = true;
  }

  function adjustFromRun() {
    state.working = "drafting";
    state.aView = "workbench";
    state.baseline = true;
    updateWorkingState();
    showScene("a");
    toast("已带回 v1 基线；新草稿未确认，旧 Run 与报告保持只读。未生成新 digest。");
  }

  function toast(message) {
    const node = $("#toast");
    window.clearTimeout(toastTimer);
    node.textContent = message;
    node.hidden = false;
    toastTimer = window.setTimeout(() => { node.hidden = true; }, 4200);
  }

  function table(headers, rows) {
    return `<div class="table-scroll"><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td${index === 0 ? "" : ""}>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderDetail() {
    const report = D.report;
    const content = $("#detail-content");
    if (state.detail === "orders") {
      content.innerHTML = table(["date", "intentId", "side", "quantity", "status", "reason"], report.orders.map((order) => [order.date, order.intentId || "—", order.side, order.quantity, order.status, order.reason || "—"]));
    } else if (state.detail === "fills") {
      content.innerHTML = table(["date", "side", "price", "quantity", "amount", "fees", "cashDelta"], report.fills.map((fill) => [fill.date, fill.side, fill.price, fill.quantity, fill.amount, fill.fees, fill.cashDelta]));
    } else if (state.detail === "rejections") {
      content.innerHTML = table(["date", "side", "quantity", "status", "reason"], report.rejections.map((item) => [item.date, item.side, item.quantity, item.status, item.reason])) + `<p class="detail-note">拒单单独保留，不用信号数或意图数冒充实际成交。</p>`;
    } else if (state.detail === "fees") {
      content.innerHTML = `<div class="detail-cards"><div class="detail-card"><span>commission</span><strong>${report.fees.commission}</strong></div><div class="detail-card"><span>transferFee</span><strong>${report.fees.transferFee}</strong></div><div class="detail-card"><span>stampDuty</span><strong>${report.fees.stampDuty}</strong></div><div class="detail-card"><span>total CNY</span><strong>${report.fees.total}</strong></div></div>`;
    } else if (state.detail === "cash") {
      content.innerHTML = `<div class="detail-cards"><div class="detail-card"><span>available</span><strong>${report.cash.available}</strong></div><div class="detail-card"><span>reserved</span><strong>${report.cash.reserved}</strong></div><div class="detail-card"><span>unsettled</span><strong>${report.cash.unsettled}</strong></div><div class="detail-card"><span>receivable</span><strong>${report.cash.receivable}</strong></div></div><p class="detail-note">期末现金 ${report.cash.total} CNY · 期末持仓 ${report.position.total} share · 当前零持仓，但已有 2 笔成交与已平仓配对。</p>`;
    } else if (state.detail === "pairing") {
      content.innerHTML = `<div class="detail-cards"><div class="detail-card"><span>winRate</span><strong>${pct(report.metrics.winRate)}</strong></div><div class="detail-card"><span>realizedPnl CNY</span><strong>${report.final.realizedPnl}</strong></div><div class="detail-card"><span>closed position</span><strong>100 share</strong></div><div class="detail-card"><span>total fees CNY</span><strong>${report.fees.total}</strong></div></div><p class="detail-note">winRateReason = null：本样本存在已平仓批次，0% 是真实结果，不是空态替代。仅一轮已平仓配对，不构成统计结论。</p>`;
    } else {
      content.innerHTML = `<ul class="assumption-list">${report.assumptions.map((item) => `<li>${esc(item)}</li>`).join("")}</ul><p class="detail-note">warnings: [] · ${esc(D.snapshot.usageRestriction)} · raw adjustment · volumeUnit=share</p>`;
    }
  }

  function renderReportCharts() {
    refreshChartColors();
    renderEquityChart("#report-equity-chart", "#report-equity-chart-wrap", "#report-equity-tooltip", "#report-equity-legend", 184);
    const container = $("#report-drawdown");
    if (!$("#report-drawdown-chart")) {
      container.replaceChildren();
      const title = document.createElement("div");
      title.className = "small-chart-title";
      const label = document.createElement("span");
      label.textContent = "回撤曲线";
      const value = document.createElement("span");
      value.textContent = `最大 ${pct(D.report.metrics.maxDrawdown)} · 2024-01-04`;
      title.append(label, value);
      const wrap = document.createElement("div");
      wrap.className = "chart-wrap";
      wrap.id = "report-drawdown-chart-wrap";
      const chart = document.createElement("div");
      chart.id = "report-drawdown-chart";
      chart.className = "chart";
      const tooltip = document.createElement("div");
      tooltip.id = "report-drawdown-tooltip";
      tooltip.className = "chart-tooltip";
      tooltip.hidden = true;
      wrap.append(chart, tooltip);
      container.append(title, wrap);
    }
    renderDrawdownChart("#report-drawdown-chart", "#report-drawdown-chart-wrap", "#report-drawdown-tooltip", false);
  }

  function openDataDialog(kind) {
    const title = $("#data-dialog-title");
    const content = $("#data-dialog-content");
    if (kind === "price") {
      title.textContent = "原始 OHLCV · synthetic contract test";
      content.innerHTML = table(["date", "open", "high", "low", "close", "volume (share)", "status"], D.snapshot.sessions.map((session) => [session.date, session.bar.open, session.bar.high, session.bar.low, session.bar.close, session.bar.volume, session.status]));
    } else {
      title.textContent = "日频权益、回撤与账本 · CNY / share";
      content.innerHTML = table(["date", "equity", "drawdown", "cash.total", "available", "reserved", "unsettled", "position.total", "buyAndHold.finalEquity"], D.report.daily.map((day, index) => [day.date, day.equity, day.drawdown, day.cash.total, day.cash.available, day.cash.reserved, day.cash.unsettled, day.position.total, index === D.report.daily.length - 1 ? D.report.buyAndHold.finalEquity : "未提供日频值"]));
    }
    $("#data-dialog").showModal();
  }

  const previews = {
    unconfirmed: {
      title: "未确认：运行硬阻断", subtitle: "A / valid · 已有 canonical AST 与回读，但尚未确认 expectedDigest。", status: "VALID",
      html: `<div class="preview-panel warning"><h4>确认策略后才可运行</h4><p>回读与 digest 已可读。确认按钮携带当前 expectedDigest；任何语义修改都会使旧确认失效。</p><div class="preview-actions"><span>RunSpec 完整 · 数据可执行 · revision 未确认</span><button class="button primary" type="button" disabled>运行回测</button></div></div>`
    },
    "model-error": {
      title: "真实模型不可用", subtitle: "A / model-error · 保留意图和最后草稿，旧 Run 仍可独立查看。", status: "MODEL ERROR",
      html: `<div class="preview-panel error"><h4>MODEL_UNAVAILABLE</h4><p>真实模型请求未完成。界面保留脱敏 provenance 与重试入口，不自动切换 deterministic fake，不确认新草稿。</p><div class="preview-actions"><span>修复次数与请求来源在原位展示</span><button class="button secondary" type="button">重试真实模型</button></div></div>`
    },
    "data-error": {
      title: "数据阻断与失败 Run", subtitle: "A / data-error + B / failed · 不输出成功四指标或部分报告。", status: "FAILED",
      html: `<div class="preview-panel error"><h4>INSUFFICIENT_WARMUP</h4><p><code>path: /warmup</code><br>required / actual 由真实诊断逐项填入；任一分支不足即整体阻断。</p><div class="preview-actions"><span>B：仅失败事件与诊断 · C：无成功 Report</span><button class="button secondary" type="button">返回运行假设</button></div></div>`
    },
    "no-trades": {
      title: "无交易，但 Run 可完成", subtitle: "B / C · 没有入场信号时保留真实价格、指标与账本，不画买卖标记。", status: "0 FILLS",
      html: `<div class="preview-panel"><h4>未产生入场信号</h4><p>tradeCount=0 是真实计数，不是 null。买入持有是否存在按自身可用性判断。</p><div class="preview-metrics"><div><span>交易次数</span><strong>0</strong><small>真实计数</small></div><div><span>成交</span><strong>0</strong><small>fills = []</small></div><div><span>权益</span><strong>—</strong><small>按真实账本呈现</small></div></div></div>`
    },
    "all-rejected": {
      title: "全部拒单不等于无信号", subtitle: "B / C · 信号与意图保留，拒单原因默认可见，fills 为空。", status: "REJECTED",
      html: `<div class="preview-panel error"><h4>全部订单未成交</h4><p><code>INSUFFICIENT_CASH</code><br>拒单保留 seq、reasonCodes 与 inputRefs；不用平稳成功曲线掩盖失败订单。</p><div class="preview-metrics"><div><span>实际成交</span><strong>0</strong><small>tradeCount = 0</small></div><div><span>拒单</span><strong>!</strong><small>原因与证据可查</small></div><div><span>信号</span><strong>✓</strong><small>不计入成交次数</small></div></div></div>`
    },
    "null-reason": {
      title: "指标不适用：— 加原因", subtitle: "C / P0 原位反馈 · 其他可用指标继续保留，绝不填 0。", status: "NULL + REASON",
      html: `<div class="preview-panel warning"><h4>胜率与买入持有不可用</h4><div class="preview-metrics"><div><span>胜率</span><strong>—</strong><small>无已平仓批次</small></div><div><span>相对买入持有超额</span><strong>—</strong><small>buyAndHold.reason 原位显示</small></div><div><span>交易次数</span><strong>0</strong><small>真实计数仍可显示</small></div></div><p class="detail-note">对应曲线留空并解释，不把缺失基准当作超额 0。</p></div>`
    },
    misaligned: {
      title: "compare 条件不齐", subtitle: "C / 两个独立报告仍可查看 · 禁止计算版本差值与优劣结论。", status: "BLOCKED",
      html: `<div class="preview-panel error"><h4>对齐检查未通过</h4><p><code>snapshotDigest：不一致</code><br><code>engineVersion：不一致</code><br>资产、区间、资金、执行与 canonicalization 逐项列明；不符项不被折叠隐藏。</p><div class="preview-actions"><span>差值区禁用 · 两个 Run 可分别回 B / C</span><button class="button primary" type="button" disabled>计算版本差值</button></div></div>`
    }
  };

  function renderPreview(key) {
    const preview = previews[key] || previews.unconfirmed;
    $$("[data-preview-state]").forEach((button) => button.classList.toggle("active", button.dataset.previewState === key));
    $("#state-preview").innerHTML = `<div class="state-preview-header"><div><h3>${esc(preview.title)}</h3><p>${esc(preview.subtitle)}</p></div><span class="status-pill pending">${esc(preview.status)}</span></div>${preview.html}`;
  }

  function openStateLab() {
    renderPreview($("[data-preview-state].active")?.dataset.previewState || "unconfirmed");
    $("#state-lab").showModal();
  }

  async function copyValue(value) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      toast("完整 digest 已复制。");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      toast(copied ? "完整 digest 已复制。" : "浏览器未允许复制，请在证据链中选择完整值。");
    }
  }

  const reviewAnswers = {
    buy: "1 月 1 日收盘，入场条件成立，形成 intent-1；1 月 2 日开盘执行，以 10.01 买入 100 股，费用 5.01。这是前一日信号、次日执行，不是预知后来会涨。",
    drawdown: "1 月 4 日收盘价是 9.00，仍持有 100 股，权益从前一日 2,193.99 降到 1,893.99，少了 300.00。当天 exit=true，随后形成次日卖出意图；判断只用了当时及之前的信息。",
    sell: "1 月 4 日，barsHeld ≥ 2 的出场条件成立，形成 intent-2；1 月 5 日按这个意图以 9.99 卖出 100 股，费用 5.51。执行依据可以在事件抽屉里追溯。"
  };

  function applyTheme(theme, persist = false) {
    const light = theme === "light";
    document.documentElement.classList.toggle("light-theme", light);
    $("#theme-icon").textContent = light ? "☾" : "☀";
    $("#theme-label").textContent = light ? "Dark" : "Light";
    $("#theme-toggle").setAttribute("aria-label", light ? "切换到深色主题" : "切换到浅色主题");
    if (persist) {
      try { localStorage.setItem("stock-race-theme", light ? "light" : "dark"); } catch { /* file:// privacy modes may deny storage */ }
    }
    refreshChartColors();
    if (state.scene === "b") renderTheatre();
    if (state.scene === "c") renderReportCharts();
  }

  function goHome() {
    state.aView = "onboarding";
    showScene("a");
  }

  function bindEvents() {
    $$(".scene-tab").forEach((button) => button.addEventListener("click", () => showScene(button.dataset.scene)));
    $$('[data-scene-link]').forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); goHome(); }));
    $("#home-button").addEventListener("click", goHome);
    $("#theme-toggle").addEventListener("click", () => applyTheme(document.documentElement.classList.contains("light-theme") ? "dark" : "light", true));
    $$('[data-go]').forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.go === "a") state.aView = "workbench";
      showScene(button.dataset.go);
    }));
    $$('[data-adjust]').forEach((button) => button.addEventListener("click", adjustFromRun));
    $$('[data-dialogue-path]').forEach((button) => button.addEventListener("click", () => startDialogue(button.dataset.dialoguePath, 1)));
    $$('[data-script-path]').forEach((button) => button.addEventListener("click", () => loadDialogue(button.dataset.scriptPath, 0)));
    $("#next-dialogue").addEventListener("click", () => {
      const script = dialogueScripts[state.dialoguePath];
      if (state.dialogueStep < script.steps.length - 1) { state.dialogueStep += 1; renderDialogue(); }
    });
    $("#restart-dialogue").addEventListener("click", () => loadDialogue(state.dialoguePath, 0));
    $$('[data-market]').forEach((button) => button.addEventListener("click", () => {
      state.market = button.dataset.market;
      $$('[data-market]').forEach((item) => {
        const selected = item === button;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      updateOnboardingGate();
    }));
    $("#onboarding-start").addEventListener("change", updateOnboardingGate);
    $("#onboarding-end").addEventListener("change", updateOnboardingGate);
    $("#open-workbench").addEventListener("click", () => startDialogue("novice", 0));
    $("#back-onboarding").addEventListener("click", () => showAView("onboarding"));
    $("#onboarding-to-b").addEventListener("click", () => {
      showScene("b");
      toast("当前为固定 S2 golden 的只读历史推演，不代表首屏所选资产或区间的新运行。");
    });
    $("#run-button").addEventListener("click", () => { showScene("b"); toast("已打开 S2 同源完整 Run 的只读投影；未重新运行、未调用模型或网络。"); });
    $("#validate-button").addEventListener("click", () => toast("演示脚本未执行实时校验；真实流程必须完成 AST 校验、权威回读与 expectedDigest 确认。"));
    $("#toggle-evidence").addEventListener("click", () => setEvidenceOpen(!state.evidenceOpen));
    $$('[data-story-cursor]').forEach((button) => button.addEventListener("click", () => {
      state.evidenceOpen = false;
      syncEvidenceDrawer();
      setCursor(Number(button.dataset.storyCursor), Number(button.dataset.storySeq));
    }));
    $("#play-button").addEventListener("click", startPlayback);
    $("#pause-button").addEventListener("click", stopPlayback);
    $("#timeline-range").addEventListener("input", (event) => setCursor(Number(event.target.value)));
    $("#jump-result").addEventListener("click", () => { stopPlayback(); setCursor(dates.length - 1, 33); });
    $$('[data-speed]').forEach((button) => button.addEventListener("click", () => {
      state.speed = Number(button.dataset.speed);
      $$('[data-speed]').forEach((item) => item.classList.toggle("active", item === button));
      if (state.playing) startPlayback();
    }));
    $$('[data-event-filter]').forEach((button) => button.addEventListener("click", () => {
      state.filter = button.dataset.eventFilter;
      $$('[data-event-filter]').forEach((item) => item.classList.toggle("active", item === button));
      renderEventLanes();
    }));
    $("#previous-event").addEventListener("click", () => {
      const index = D.events.findIndex((event) => event.seq === state.selectedSeq);
      if (index > 0) { const event = D.events[index - 1]; setCursor(dates.indexOf(event.tradingDate), event.seq); }
    });
    $("#next-event").addEventListener("click", () => {
      const index = D.events.findIndex((event) => event.seq === state.selectedSeq);
      if (index < D.events.length - 1) { const event = D.events[index + 1]; setCursor(dates.indexOf(event.tradingDate), event.seq); }
    });
    $$('[data-detail-tab]').forEach((button) => button.addEventListener("click", () => {
      state.detail = button.dataset.detailTab;
      $$('[data-detail-tab]').forEach((tab) => { const active = tab === button; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); });
      renderDetail();
    }));
    $$('[data-table]').forEach((button) => button.addEventListener("click", () => openDataDialog(button.dataset.table)));
    $$('[data-review-question]').forEach((button) => button.addEventListener("click", () => {
      $$('[data-review-question]').forEach((item) => item.classList.toggle("active", item === button));
      const answer = $("#review-answer");
      answer.replaceChildren();
      const avatar = document.createElement("span");
      avatar.className = "chat-avatar";
      avatar.textContent = "衡";
      const text = document.createElement("p");
      text.textContent = reviewAnswers[button.dataset.reviewQuestion];
      answer.append(avatar, text);
    }));
    $("#open-state-lab").addEventListener("click", openStateLab);
    $("#footer-state-lab").addEventListener("click", openStateLab);
    $("#close-state-lab").addEventListener("click", () => $("#state-lab").close());
    $("#close-data-dialog").addEventListener("click", () => $("#data-dialog").close());
    $$('[data-preview-state]').forEach((button) => button.addEventListener("click", () => renderPreview(button.dataset.previewState)));
    $("#select-compare").addEventListener("click", () => toast("当前只有 v1 完成 Run；未生成 v2，未计算版本差值。"));
    $$('[data-copy]').forEach((button) => button.addEventListener("click", () => copyValue(button.dataset.copy)));
    [$("#state-lab"), $("#data-dialog")].forEach((dialog) => dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }));
    window.addEventListener("hashchange", () => showScene(location.hash.slice(1), false));
    let resizeTimer;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (state.scene === "b") renderTheatre();
        if (state.scene === "c") renderReportCharts();
      }, 120);
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopPlayback(); });
  }

  function init() {
    let savedTheme = "dark";
    try { savedTheme = localStorage.getItem("stock-race-theme") || "dark"; } catch { /* use dark default */ }
    applyTheme(savedTheme);
    renderLegend($("#price-legend"), [
      { label: "上涨", color: COLORS.up, mark: "swatch" }, { label: "下跌", color: COLORS.down, mark: "swatch" },
      { label: "平盘", color: COLORS.neutral, mark: "swatch" }, { label: "B 买入 / S 卖出（实际 fills）", color: COLORS.up, mark: "dot" }
    ]);
    $("#timeline-labels").innerHTML = dates.map((date) => `<span>${shortDate(date)}</span>`).join("");
    renderDetail();
    loadDialogue("novice", 0);
    bindEvents();
    updateOnboardingGate();
    showScene(location.hash.slice(1) || "a", false);
  }

  init();
})();
