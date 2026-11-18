/* Stock-Race V3 S4 slice — hand-rolled SVG charts (zero dependencies).
   Palette follows the approved prototype: dark categorical series
   #0096b4 / #d97706, green up / red down, gold benchmark accents. */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const COLORS = {
    grid: "rgba(148, 160, 184, 0.14)",
    axis: "rgba(148, 160, 184, 0.45)",
    text: "#94a0b8",
    series1: "#0096b4",
    series2: "#d97706",
    cursor: "rgba(0, 212, 255, 0.55)",
    drawdown: "#ff4757",
    buy: "#00d084",
    sell: "#ffd700",
    intent: "#00d4ff",
    reject: "#ff4757",
    stop: "#ff4757",
    signal: "#66718c",
  };

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (parent) parent.appendChild(node);
    return node;
  }

  function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
    if (domainMax === domainMin) return () => (rangeMin + rangeMax) / 2;
    return (value) => rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
  }

  function niceTicks(min, max, count) {
    if (min === max) return [min];
    const span = max - min;
    const step = Math.pow(10, Math.floor(Math.log10(span / count)));
    const candidates = [1, 2, 2.5, 5, 10].map((m) => m * step);
    const best = candidates.find((c) => span / c <= count + 0.5) ?? candidates[candidates.length - 1];
    const ticks = [];
    for (let v = Math.ceil(min / best) * best; v <= max + 1e-9; v += best) ticks.push(v);
    return ticks.length > 0 ? ticks : [min, max];
  }

  /**
   * Multi-series line chart with grid, sparse axis labels, hover crosshair and
   * an externally steerable cursor line.
   * options: { labels, series: [{name,color,values,dashed?}], yFormat, cursorIndex, onCursor, area? }
   */
  function lineChart(container, tooltip, options) {
    const { labels, series } = options;
    const yFormat = options.yFormat ?? ((v) => String(v));
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 240;
    const pad = { top: 14, right: 18, bottom: 26, left: 64 };
    container.textContent = "";
    const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img" }, container);

    const allValues = series.flatMap((s) => s.values.filter((v) => v !== null && v !== undefined));
    let min = Math.min(...allValues);
    let max = Math.max(...allValues);
    if (min === max) { min -= 1; max += 1; }
    const padY = (max - min) * 0.06;
    min -= padY; max += padY;
    const x = (index) => pad.left + (labels.length <= 1 ? 0.5 : index / (labels.length - 1)) * (width - pad.left - pad.right);
    const y = scaleLinear(min, max, height - pad.bottom, pad.top);

    for (const tick of niceTicks(min, max, 4)) {
      el("line", { x1: pad.left, x2: width - pad.right, y1: y(tick), y2: y(tick), stroke: COLORS.grid, "stroke-width": 1 }, svg);
      const label = el("text", { x: pad.left - 8, y: y(tick) + 4, "text-anchor": "end", fill: COLORS.text, "font-size": 10.5, "font-family": "Consolas, monospace" }, svg);
      label.textContent = yFormat(tick);
    }
    const step = Math.max(1, Math.ceil(labels.length / 8));
    labels.forEach((label, index) => {
      if (index % step !== 0 && index !== labels.length - 1) return;
      const text = el("text", { x: x(index), y: height - 8, "text-anchor": "middle", fill: COLORS.text, "font-size": 10.5, "font-family": "Consolas, monospace" }, svg);
      text.textContent = label.slice(5); // MM-DD
    });

    for (const s of series) {
      const points = s.values.map((v, i) => (v === null || v === undefined ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`));
      const path = points.filter(Boolean).join(" ");
      if (options.area) {
        const floor = y(Math.max(min, 0));
        const areaPath = `M ${x(0).toFixed(1)},${floor.toFixed(1)} L ${points.filter(Boolean).join(" L ")} L ${x(labels.length - 1).toFixed(1)},${floor.toFixed(1)} Z`;
        el("path", { d: areaPath, fill: s.color, opacity: 0.16, stroke: "none" }, svg);
      }
      el("polyline", {
        points: path, fill: "none", stroke: s.color, "stroke-width": 2,
        "stroke-dasharray": s.dashed ? "5 4" : "none", "stroke-linejoin": "round", "stroke-linecap": "round",
      }, svg);
      if (s.pointsOfInterest) {
        for (const poi of s.pointsOfInterest) {
          el("circle", { cx: x(poi.index), cy: y(poi.value), r: 4.5, fill: s.color, stroke: "#0a0e1a", "stroke-width": 1.5 }, svg);
        }
      }
    }

    const cursorLine = el("line", { y1: pad.top, y2: height - pad.bottom, stroke: COLORS.cursor, "stroke-width": 1.2, "stroke-dasharray": "4 3", visibility: "hidden" }, svg);
    const cursorDot = el("circle", { r: 4, fill: COLORS.cursor, visibility: "hidden" }, svg);

    function setCursor(index) {
      if (index === null || index === undefined || index < 0 || index >= labels.length) {
        cursorLine.setAttribute("visibility", "hidden");
        cursorDot.setAttribute("visibility", "hidden");
        return;
      }
      cursorLine.setAttribute("x1", x(index));
      cursorLine.setAttribute("x2", x(index));
      cursorLine.setAttribute("visibility", "visible");
      const primary = series[0];
      const value = primary && primary.values[index];
      if (value !== null && value !== undefined) {
        cursorDot.setAttribute("cx", x(index));
        cursorDot.setAttribute("cy", y(value));
        cursorDot.setAttribute("visibility", "visible");
      } else {
        cursorDot.setAttribute("visibility", "hidden");
      }
    }
    setCursor(options.cursorIndex);

    if (options.onCursor) {
      const hit = el("rect", { x: pad.left, y: pad.top, width: width - pad.left - pad.right, height: height - pad.top - pad.bottom, fill: "transparent" }, svg);
      hit.addEventListener("mousemove", (event) => {
        const rect = svg.getBoundingClientRect();
        const ratio = (event.clientX - rect.left - pad.left) / (width - pad.left - pad.right);
        const index = Math.round(ratio * (labels.length - 1));
        const clamped = Math.max(0, Math.min(labels.length - 1, index));
        options.onCursor(clamped, { move: true });
        if (tooltip) {
          const lines = [labels[clamped]];
          for (const s of series) {
            const v = s.values[clamped];
            if (v !== null && v !== undefined) lines.push(`${s.name}: ${yFormat(v)}`);
          }
          tooltip.textContent = lines.join("\n");
          tooltip.hidden = false;
          const wrapRect = container.parentElement.getBoundingClientRect();
          tooltip.style.left = `${event.clientX - wrapRect.left + 14}px`;
          tooltip.style.top = `${event.clientY - wrapRect.top - 10}px`;
        }
      });
      hit.addEventListener("mouseleave", () => {
        if (tooltip) tooltip.hidden = true;
      });
    }
    return { setCursor };
  }

  const LANE_MARK = {
    signal: { color: COLORS.signal, glyph: "circle", r: 2.6 },
    intent: { color: COLORS.intent, glyph: "diamond", r: 4 },
    "fill-buy": { color: COLORS.buy, glyph: "circle", r: 5 },
    "fill-sell": { color: COLORS.sell, glyph: "circle", r: 5 },
    reject: { color: COLORS.reject, glyph: "cross", r: 4.5 },
    stop: { color: COLORS.stop, glyph: "triangle", r: 6 },
  };

  /**
   * One asset lane: mini close-price line plus event markers on the shared
   * date axis. markers: [{index, kind, title, event}]. onSelect(marker).
   */
  function laneChart(container, options) {
    const { labels, price, markers } = options;
    const width = container.clientWidth || 900;
    const height = container.clientHeight || 84;
    const pad = { top: 10, right: 14, bottom: 16, left: 14 };
    container.textContent = "";
    const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "lane-canvas" }, container);
    const x = (index) => pad.left + (labels.length <= 1 ? 0.5 : index / (labels.length - 1)) * (width - pad.left - pad.right);

    if (price && price.length > 0) {
      const min = Math.min(...price);
      const max = Math.max(...price);
      const y = scaleLinear(min === max ? min - 1 : min, max === min ? max + 1 : max, height - pad.bottom, pad.top);
      el("polyline", {
        points: price.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "),
        fill: "none", stroke: "rgba(148, 160, 184, 0.55)", "stroke-width": 1.2,
      }, svg);
      const lo = el("text", { x: pad.left, y: height - 3, fill: COLORS.text, "font-size": 9, "font-family": "Consolas, monospace" }, svg);
      lo.textContent = min.toFixed(2);
      const hi = el("text", { x: width - pad.right, y: pad.top + 4, "text-anchor": "end", fill: COLORS.text, "font-size": 9, "font-family": "Consolas, monospace" }, svg);
      hi.textContent = max.toFixed(2);
    }

    const baseline = height - pad.bottom;
    el("line", { x1: pad.left, x2: width - pad.right, y1: baseline, y2: baseline, stroke: COLORS.grid }, svg);

    for (const marker of markers) {
      const spec = LANE_MARK[marker.kind] ?? LANE_MARK.signal;
      const cx = x(marker.index);
      const cy = baseline - 8;
      const group = el("g", { cursor: "pointer" }, svg);
      if (spec.glyph === "circle") {
        el("circle", { cx, cy, r: spec.r, fill: spec.color, stroke: "#0a0e1a", "stroke-width": 1.4 }, group);
      } else if (spec.glyph === "diamond") {
        el("path", { d: `M ${cx} ${cy - spec.r} L ${cx + spec.r} ${cy} L ${cx} ${cy + spec.r} L ${cx - spec.r} ${cy} Z`, fill: spec.color, stroke: "#0a0e1a", "stroke-width": 1 }, group);
      } else if (spec.glyph === "cross") {
        el("path", { d: `M ${cx - spec.r} ${cy - spec.r} L ${cx + spec.r} ${cy + spec.r} M ${cx + spec.r} ${cy - spec.r} L ${cx - spec.r} ${cy + spec.r}`, stroke: spec.color, "stroke-width": 2.2, "stroke-linecap": "round" }, group);
      } else if (spec.glyph === "triangle") {
        el("path", { d: `M ${cx} ${cy - spec.r} L ${cx + spec.r} ${cy + spec.r * 0.85} L ${cx - spec.r} ${cy + spec.r * 0.85} Z`, fill: spec.color, stroke: "#0a0e1a", "stroke-width": 1.2 }, group);
      }
      const title = el("title", {}, group);
      title.textContent = marker.title;
      if (options.onSelect) {
        group.addEventListener("click", () => options.onSelect(marker));
      }
    }

    const cursorLine = el("line", { y1: pad.top, y2: height - 4, stroke: COLORS.cursor, "stroke-width": 1.2, "stroke-dasharray": "4 3", visibility: "hidden" }, svg);
    function setCursor(index) {
      if (index === null || index === undefined) {
        cursorLine.setAttribute("visibility", "hidden");
        return;
      }
      cursorLine.setAttribute("x1", x(index));
      cursorLine.setAttribute("x2", x(index));
      cursorLine.setAttribute("visibility", "visible");
    }
    setCursor(options.cursorIndex);
    return { setCursor };
  }

  window.ChartKit = { lineChart, laneChart, COLORS };
})();
