/* Matched study and operational verification. No external libraries. */
(function (root) {
  "use strict";
  const SOURCES = ["gefs", "hrrr"];
  const LABELS = { gefs: "GEFS ANN-CSGD", hrrr: "HRRR ANN-CSGD" };
  const EXPECTED = { "6": 8, "12": 7, "24": 5 };
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const divide = (a, b) => finite(a) && finite(b) && b > 0 ? a / b : null;
  const fmt = (value, digits = 4) => finite(value) ? value.toFixed(digits) : "—";
  const countFmt = value => finite(value) ? Math.round(value).toLocaleString("en-US") : "—";
  const percent = value => finite(value) ? (100 * value).toFixed(2) + "%" : "—";
  const reduction = (g, h) => divide(100 * (g - h), g);
  const thresholdRow = (row, threshold) => (row?.thresholds || []).find(q => finite(q.threshold_mm) && Math.abs(q.threshold_mm - threshold) < 1e-6) || null;
  const durationData = (data, duration) => data?.durations?.[String(duration)] || data?.durations?.[String(duration) + "h"] || null;
  const selectedRow = (duration, source, lead) => lead === "pooled" ? duration?.models?.[source]?.pooled : duration?.models?.[source]?.by_ending_lead?.[String(lead)];

  function extras(q) {
    if (!q) return {};
    const h = q.hits, m = q.misses, f = q.false_alarms, c = q.correct_negatives;
    const n = [h, m, f, c].every(finite) ? h + m + f + c : null;
    const random = finite(n) ? divide((h + m) * (h + f), n) : null;
    const result = {
      precision: finite(n) ? divide(h, h + f) : null,
      recall_pod: finite(n) ? divide(h, h + m) : null,
      false_alarm_ratio: finite(n) ? divide(f, h + f) : null,
      f1: finite(n) ? divide(2 * h, 2 * h + m + f) : null,
      equitable_threat_score: finite(random) ? divide(h - random, h + m + f - random) : null,
      ece_10bin: null,
      brier_reliability_10bin: null,
      brier_resolution_10bin: null,
      brier_uncertainty: null,
      brier_decomposition_residual: null
    };
    const bins = (q.reliability || []).filter(b => finite(b.count) && b.count > 0);
    const total = bins.reduce((v, b) => v + b.count, 0);
    if (total > 0 && bins.every(b => finite(b.mean_probability) && finite(b.observed_frequency))) {
      const freq = bins.reduce((v, b) => v + b.count * b.observed_frequency, 0) / total;
      let ece = 0, rel = 0, res = 0;
      bins.forEach(b => {
        const weight = b.count / total;
        ece += weight * Math.abs(b.mean_probability - b.observed_frequency);
        rel += weight * (b.mean_probability - b.observed_frequency) ** 2;
        res += weight * (b.observed_frequency - freq) ** 2;
      });
      result.ece_10bin = ece;
      result.brier_reliability_10bin = rel;
      result.brier_resolution_10bin = res;
      result.brier_uncertainty = freq * (1 - freq);
      result.brier_decomposition_residual = finite(q.brier_score) ? q.brier_score - (rel - res + result.brier_uncertainty) : null;
    }
    // Recorded values take precedence, including deliberately undefined nulls.
    Object.keys(result).forEach(k => { if (Object.prototype.hasOwnProperty.call(q, k)) result[k] = q[k]; });
    return result;
  }

  function validateDataset(data) {
    if (!data || typeof data !== "object" || !data.durations) throw new Error("Missing duration data");
    let usable = 0;
    ["6", "12", "24"].forEach(d => {
      const score = durationData(data, d);
      if (!score) return;
      if (Number(score.duration_hours) !== Number(d)) throw new Error("Duration mismatch");
      const leads = score.ending_leads || [];
      if (!Array.isArray(leads) || leads.some(v => !finite(v) || v < Number(d) || v > 48 || v % 6)) throw new Error("Invalid forecast leads");
      if (new Set(leads).size !== leads.length || leads.some((v, i) => i && v <= leads[i - 1])) throw new Error("Duplicate or unordered forecast leads");
      if (!leads.length || !score.models?.gefs?.pooled || !score.models?.hrrr?.pooled) return;
      usable++;
      ["pooled", ...leads.map(String)].forEach(lead => {
        const rows = SOURCES.map(source => selectedRow(score, source, lead));
        if (rows.some(row => !row)) throw new Error("Missing matched model row");
        if (rows[0].sample_count !== rows[1].sample_count || !finite(rows[0].sample_count) || rows[0].sample_count <= 0) throw new Error("Unmatched sample counts");
        if (rows.some(row => !finite(row.mean_crps_mm) || row.mean_crps_mm < 0)) throw new Error("Invalid CRPS");
        const first = rows[0].thresholds || [], second = rows[1].thresholds || [];
        if (first.length !== second.length) throw new Error("Unmatched thresholds");
        first.forEach(q => {
          const other = thresholdRow(rows[1], q.threshold_mm);
          if (!other || q.events !== other.events || q.non_events !== other.non_events) throw new Error("Unmatched observed events");
          if (finite(q.reference_brier_score) !== finite(other.reference_brier_score) || (finite(q.reference_brier_score) && Math.abs(q.reference_brier_score - other.reference_brier_score) > 1e-12)) throw new Error("Unmatched Brier reference");
          [q, other].forEach(item => {
            if (!finite(item.events) || item.events < 0 || !finite(item.non_events) || item.non_events < 0 || item.events + item.non_events !== rows[0].sample_count) throw new Error("Invalid observed-event totals");
            if (!Array.isArray(item.reliability)) throw new Error("Missing reliability bins");
            if (item.reliability.reduce((s, b) => s + b.count, 0) !== rows[0].sample_count) throw new Error("Unmatched probability bins");
          });
        });
      });
    });
    if (!usable) throw new Error("No verified durations available");
    return data;
  }

  const API = { extras, reduction, validateDataset, selectedRow, durationData, thresholdRow };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof document === "undefined") return;

  const $ = id => document.getElementById(id);
  const initial = new URLSearchParams(root.location.search);
  const state = { catalog: null, data: null, mode: initial.get("mode") === "operational" ? "operational" : "research", init: initial.get("init"), duration: initial.get("duration")?.replace("h", "") || "12", lead: initial.get("lead") || "pooled", threshold: Number(initial.get("threshold")) || 25.4, serial: 0 };
  const catalogURL = new URL("data/verification-v2/catalog.json", root.location.href);
  function el(name, text, cls) { const node = document.createElement(name); if (text !== undefined) node.textContent = String(text); if (cls) node.className = cls; return node; }
  function text(id, value) { $(id).textContent = value || ""; }
  function clear(id) { $(id).replaceChildren(); }
  function status(message, error = false) { text("dataset-status", message); $("dataset-status").classList.toggle("error", error); }
  function initializationLabel(value) { const s = String(value || ""); return /^\d{10}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:00 UTC` : s; }
  function validTimeLabel(value) { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toISOString().replace("T", " ").replace(".000Z", " UTC") : String(value || ""); }
  function safePath(path) {
    if (typeof path !== "string" || !path || /(^\/|\.\.|:|\\)/.test(path)) throw new Error("Invalid dataset path");
    return new URL(path, catalogURL);
  }
  async function fetchJSON(url) { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw new Error(`Verification resource unavailable (${r.status})`); return r.json(); }
  function putOptions(id, options, selected) {
    const select = $(id); select.replaceChildren();
    options.forEach(([value, label]) => { const option = el("option", label); option.value = String(value); select.append(option); });
    if (options.some(([v]) => String(v) === String(selected))) select.value = String(selected);
    return select.value;
  }
  function setURL() {
    const u = new URL(root.location.href);
    u.searchParams.set("mode", state.mode); u.searchParams.set("duration", state.duration + "h"); u.searchParams.set("lead", state.lead); u.searchParams.set("threshold", state.threshold);
    if (state.mode === "operational" && state.init) u.searchParams.set("init", state.init); else u.searchParams.delete("init");
    root.history.replaceState(null, "", u);
  }

  function overview() {
    clear("overview-cards");
    ["6", "12", "24"].forEach(d => {
      const score = durationData(state.data, d), card = el("article", undefined, "overview-card");
      card.append(el("h3", d + "-hour accumulation"));
      const g = score?.models?.gefs?.pooled, h = score?.models?.hrrr?.pooled;
      if (!g || !h) { card.classList.add("empty"); card.append(el("p", "Waiting for matched observations.")); $("overview-cards").append(card); return; }
      card.append(el("p", `BSS threshold: ${(state.threshold / 25.4).toFixed(state.threshold === 12.7 ? 1 : 0)} inch${state.threshold === 25.4 ? "" : "es"}`, "subtle"));
      const dl = el("dl");
      [["GEFS CRPS", fmt(g.mean_crps_mm) + " mm"], ["HRRR CRPS", fmt(h.mean_crps_mm) + " mm"]].forEach(([label, val]) => { dl.append(el("dt", label), el("dd", val)); });
      const qg = thresholdRow(g, state.threshold), qh = thresholdRow(h, state.threshold);
      [["GEFS BSS", fmt(qg?.brier_skill_score)], ["HRRR BSS", fmt(qh?.brier_skill_score)]].forEach(([label, val]) => { dl.append(el("dt", label), el("dd", val)); });
      card.append(dl);
      const gain = reduction(g.mean_crps_mm, h.mean_crps_mm);
      card.append(el("p", finite(gain) ? (gain >= 0 ? "HRRR CRPS reduction: " : "HRRR CRPS increase: ") + Math.abs(gain).toFixed(2) + "%" : "CRPS reduction is undefined.", "improvement"));
      card.append(el("p", countFmt(score.window_count) + " matched windows · " + countFmt(score.valid_point_pairs || g.sample_count) + " point pairs", "counts"));
      $("overview-cards").append(card);
    });
  }

  function renderRows(id, rows) {
    clear(id); rows.forEach(cells => { const tr = el("tr"); cells.forEach((value, i) => { const td = el(i === 0 ? "th" : "td", value); if (!i) td.scope = "row"; tr.append(td); }); $(id).append(tr); });
  }
  function renderControls() {
    const durations = ["6", "12", "24"].filter(d => durationData(state.data, d)?.models?.gefs?.pooled);
    state.duration = putOptions("duration-select", durations.map(d => [d, d + "-hour"]), state.duration);
    const score = durationData(state.data, state.duration);
    state.lead = putOptions("lead-select", [["pooled", "All retained windows"], ...score.ending_leads.map(v => [String(v), "f" + String(v).padStart(2, "0") + " · " + (v - Number(state.duration)) + "–" + v + " h"])], state.lead);
    const row = selectedRow(score, "gefs", state.lead);
    const thresholds = row.thresholds.map(q => q.threshold_mm);
    state.threshold = Number(putOptions("threshold-select", thresholds.map(q => [String(q), (q / 25.4).toFixed(q === 12.7 ? 1 : 0) + " inch" + (q === 25.4 ? "" : "es") + " (" + q.toFixed(1) + " mm)"]), String(state.threshold)));
  }
  function renderDetail() {
    const score = durationData(state.data, state.duration), rows = SOURCES.map(source => selectedRow(score, source, state.lead));
    const qs = rows.map(row => thresholdRow(row, state.threshold));
    const windows = state.lead === "pooled" ? score.window_count : null;
    let period = state.lead === "pooled" ? "All retained ending leads" : "Forecast hours " + (Number(state.lead) - Number(state.duration)) + "–" + state.lead;
    if (state.mode === "operational" && state.lead !== "pooled") {
      const window = (score.windows || []).find(w => Number(w.end_fhr) === Number(state.lead));
      if (window?.valid_start && window?.valid_end) period += ` · Valid ${validTimeLabel(window.valid_start)} → ${validTimeLabel(window.valid_end)}`;
    }
    text("selected-sample", `${state.duration}-hour accumulation · ${period} · ${countFmt(rows[0].sample_count)} common point pairs` + (finite(windows) ? ` · ${countFmt(windows)} matched windows` : "") + ` · Threshold ${state.threshold.toFixed(1)} mm`);
    renderRows("continuous-table", SOURCES.map((source, i) => [LABELS[source], fmt(rows[i].mean_crps_mm), fmt(rows[i].mae_mm), fmt(rows[i].rmse_mm), fmt(rows[i].mean_bias_mm), fmt(rows[i].correlation)]));
    renderRows("threshold-table", SOURCES.map((source, i) => [LABELS[source], fmt(qs[i]?.brier_score, 6), fmt(qs[i]?.brier_skill_score), fmt(qs[i]?.roc_auc), percent(qs[i]?.mean_probability), percent(qs[i]?.observed_frequency), countFmt(qs[i]?.events)]));
    renderRows("event-table", SOURCES.map((source, i) => { const q = qs[i], e = extras(q); return [LABELS[source], fmt(q?.csi), fmt(e.precision), fmt(e.recall_pod), fmt(e.false_alarm_ratio), fmt(e.f1), fmt(e.equitable_threat_score), fmt(e.ece_10bin, 6)]; }));
    renderRows("brier-components", SOURCES.map((source, i) => { const e = extras(qs[i]); return [LABELS[source], fmt(e.brier_reliability_10bin, 7), fmt(e.brier_resolution_10bin, 7), fmt(divide(e.brier_reliability_10bin, e.brier_uncertainty)), fmt(divide(e.brier_resolution_10bin, e.brier_uncertainty)), fmt(e.brier_uncertainty, 7), fmt(e.brier_decomposition_residual, 7)]; }));
    const gain = reduction(rows[0].mean_crps_mm, rows[1].mean_crps_mm);
    text("comparison-interpretation", finite(gain) ? `For this selection, HRRR CRPS is ${Math.abs(gain).toFixed(2)}% ${gain >= 0 ? "lower" : "higher"} than GEFS CRPS. This score difference does not establish statistical significance.` : "A relative CRPS difference is undefined for this selection.");
    overview(); renderCharts(score, qs); setURL();
  }

  const NS = "http://www.w3.org/2000/svg";
  function svgEl(name, attrs = {}, value) { const n = document.createElementNS(NS, name); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v))); if (value !== undefined) n.textContent = String(value); return n; }
  function svgBase(id, title, description, height = 315) {
    clear(id); const svg = svgEl("svg", { viewBox: `0 0 440 ${height}`, role: "img", "aria-label": title });
    svg.append(svgEl("title", {}, title), svgEl("desc", {}, description)); $(id).append(svg); return svg;
  }
  function chartText(svg, value, x, y, extra = {}) { svg.append(svgEl("text", { x, y, fill: "#000", "font-family": "Times New Roman, Times, serif", "font-size": 14, ...extra }, value)); }
  function marker(svg, x, y, source, size = 3.8) { if (source === "gefs") svg.append(svgEl("circle", { cx: x, cy: y, r: size, fill: "#fff", stroke: "#000", "stroke-width": 1.5 })); else svg.append(svgEl("rect", { x: x - size, y: y - size, width: 2 * size, height: 2 * size, fill: "#000" })); }
  function axes(svg, opts) {
    const { width = 440, height = 315, xmin = 0, xmax = 48, ymin, ymax, xticks, yticks, xlabel, ylabel, yformat = v => fmt(v, 2) } = opts;
    const margin = { left: 62, right: 20, top: 18, bottom: 56 };
    const x = v => margin.left + (v - xmin) / (xmax - xmin) * (width - margin.left - margin.right);
    const y = v => height - margin.bottom - (v - ymin) / (ymax - ymin) * (height - margin.top - margin.bottom);
    yticks.forEach(v => { svg.append(svgEl("line", { x1: x(xmin), y1: y(v), x2: x(xmax), y2: y(v), stroke: "#d8d8d8", "stroke-width": .7 })); chartText(svg, yformat(v), x(xmin) - 8, y(v) + 5, { "text-anchor": "end" }); });
    xticks.forEach(v => { svg.append(svgEl("line", { x1: x(v), y1: y(ymin), x2: x(v), y2: y(ymin) + 5, stroke: "#000" })); chartText(svg, v, x(v), y(ymin) + 23, { "text-anchor": "middle" }); });
    svg.append(svgEl("path", { d: `M${x(xmin)},${y(ymax)}V${y(ymin)}H${x(xmax)}`, fill: "none", stroke: "#000", "stroke-width": 1.1 }));
    chartText(svg, xlabel, (x(xmin) + x(xmax)) / 2, height - 9, { "text-anchor": "middle" });
    chartText(svg, ylabel, 16, (y(ymin) + y(ymax)) / 2, { transform: `rotate(-90 16 ${(y(ymin) + y(ymax)) / 2})`, "text-anchor": "middle" });
    return { x, y };
  }
  function extent(values, kind) {
    const valid = values.filter(finite); if (!valid.length) return [0, 1];
    let low = Math.min(...valid), high = Math.max(...valid);
    if (kind === "crps") return [0, Math.max(.05, high * 1.15)];
    if (kind === "auc") return [low >= .55 ? Math.max(.5, Math.floor((low - .025) * 20) / 20) : 0, 1];
    low = Math.min(low, 0); high = Math.max(high, .05); const pad = Math.max(.02, (high - low) * .13);
    return [low - pad, high + pad];
  }
  function lineChart(id, series, title, kind) {
    const numbers = series.flatMap(s => s.points.map(p => p[1])).filter(finite);
    if (!numbers.length) { clear(id); $(id).append(el("p", "This diagnostic is unavailable for the selection.", "empty-note")); return; }
    const [ymin, ymax] = extent(numbers, kind);
    const ticks = Array.from({ length: 5 }, (_, i) => ymin + i * (ymax - ymin) / 4);
    const svg = svgBase(id, title, `Ending lead in hours against ${title}. GEFS is dashed with open circles. HRRR is solid with filled squares. No confidence intervals are shown.`);
    const { x, y } = axes(svg, { ymin, ymax, xticks: [0, 12, 24, 36, 48], yticks: ticks, xlabel: "Ending forecast lead h", ylabel: title });
    if (ymin < 0 && ymax > 0) svg.append(svgEl("line", { x1: x(0), x2: x(48), y1: y(0), y2: y(0), stroke: "#555", "stroke-dasharray": "2 3" }));
    series.forEach(s => {
      let path = "", open = false;
      s.points.forEach(([xx, yy]) => { if (!finite(yy)) { open = false; return; } path += `${open ? "L" : "M"}${x(xx)},${y(yy)}`; open = true; });
      svg.append(svgEl("path", { d: path, fill: "none", stroke: "#000", "stroke-width": 1.8, ...(s.source === "gefs" ? { "stroke-dasharray": "6 4" } : {}) }));
      s.points.filter(p => finite(p[1])).forEach(([xx, yy]) => marker(svg, x(xx), y(yy), s.source));
    });
  }
  function reliability(qs) {
    const svg = svgBase("reliability-chart", "Reliability diagram", "All nonempty probability bins are shown. Dotted diagonal indicates perfect reliability. GEFS is dashed with open circles; HRRR is solid with filled squares.");
    const { x, y } = axes(svg, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, xticks: [0, .2, .4, .6, .8, 1], yticks: [0, .2, .4, .6, .8, 1], xlabel: "Mean forecast probability", ylabel: "Observed event frequency", yformat: v => v.toFixed(1) });
    svg.append(svgEl("line", { x1: x(0), y1: y(0), x2: x(1), y2: y(1), stroke: "#666", "stroke-dasharray": "2 4" }));
    SOURCES.forEach((source, i) => {
      const bins = (qs[i]?.reliability || []).filter(b => b.count > 0 && finite(b.mean_probability) && finite(b.observed_frequency));
      const path = bins.map((b, j) => `${j ? "L" : "M"}${x(b.mean_probability)},${y(b.observed_frequency)}`).join("");
      svg.append(svgEl("path", { d: path, fill: "none", stroke: "#000", "stroke-width": 1.7, ...(source === "gefs" ? { "stroke-dasharray": "6 4" } : {}) }));
      bins.forEach(b => marker(svg, x(b.mean_probability), y(b.observed_frequency), source));
    });
  }
  function binCounts(qs) {
    const svg = svgBase("count-chart", "Forecast probability bin counts", "Logarithmic forecast counts by probability bin. GEFS has hatched white bars, HRRR solid black bars. Zero-count bins are omitted.");
    const all = qs.flatMap(q => q?.reliability || []), max = Math.max(1, ...all.map(b => b.count));
    const top = Math.max(1, Math.ceil(Math.log10(max)));
    const { x, y } = axes(svg, { xmin: 0, xmax: 1, ymin: 0, ymax: top, xticks: [0, .2, .4, .6, .8, 1], yticks: Array.from({ length: top + 1 }, (_, i) => i), xlabel: "Forecast probability bin", ylabel: "Forecast count log scale", yformat: v => v === 0 ? "1" : "10" + ({1:"¹",2:"²",3:"³",4:"⁴",5:"⁵",6:"⁶",7:"⁷",8:"⁸",9:"⁹"}[v] || "^" + v) });
    const defs = svgEl("defs"), pattern = svgEl("pattern", { id: "gefs-count-hatch", width: 5, height: 5, patternUnits: "userSpaceOnUse" });
    pattern.append(svgEl("rect", { width: 5, height: 5, fill: "#fff" }), svgEl("path", { d: "M-1,1L1,-1M0,5L5,0M4,6L6,4", stroke: "#555", "stroke-width": .7 })); defs.append(pattern); svg.append(defs);
    SOURCES.forEach((source, i) => (qs[i]?.reliability || []).forEach(b => {
      if (!(b.count > 0)) return;
      const center = (b.lower_probability + b.upper_probability) / 2 + (i ? .019 : -.019);
      svg.append(svgEl("rect", { x: x(center - .017), y: y(Math.log10(b.count)), width: x(.034) - x(0), height: Math.max(.8, y(0) - y(Math.log10(b.count))), fill: source === "gefs" ? "url(#gefs-count-hatch)" : "#000", stroke: "#000", "stroke-width": .6 }));
    }));
    chartText(svg, "GEFS hatched · HRRR filled", 438, 12, { "text-anchor": "end", "font-size": 12 });
  }
  function renderCharts(score, qs) {
    const series = getter => SOURCES.map(source => ({ source, points: score.ending_leads.map(lead => [lead, getter(selectedRow(score, source, String(lead)))]) }));
    lineChart("crps-chart", series(r => r?.mean_crps_mm), "CRPS mm", "crps");
    lineChart("bss-chart", series(r => thresholdRow(r, state.threshold)?.brier_skill_score), "Brier skill score", "bss");
    lineChart("auc-chart", series(r => thresholdRow(r, state.threshold)?.roc_auc), "ROC AUC", "auc");
    reliability(qs); binCounts(qs);
  }

  function metadata() {
    const m = state.data.metadata || {};
    text("dataset-kind", state.mode === "research" ? "Frozen study checkpoints · held-out testing" : "Issued forecasts · observation-based verification");
    text("dataset-title", m.title || (state.mode === "research" ? "Full-year 2025 research evaluation" : "Operational run " + initializationLabel(state.init)));
    text("checkpoint-note", m.checkpoint_note || (state.mode === "research" ? "Frozen GEFS and corrected HRRR research checkpoints. These results are separate from the issued operational checkpoint set." : "Issued operational model versions are recorded with this verification run."));
    text("training-note", m.training_note || "");
    $("training-note").hidden = !m.training_note;
    text("reference-note", m.reference_note || "Both systems use the same frozen monthly MRMS event-frequency reference from available 2021–2023 observations.");
    text("observation-note", m.observation_note || "");
    $("observation-note").hidden = !m.observation_note;
    text("sample-note", m.sample_note || "Paired scores use identical observations and retained grid-point–window examples. Point pairs are spatially and temporally dependent.");
    const pending = Array.isArray(m.pending_diagnostics) ? m.pending_diagnostics.join(", ") : (typeof m.pending_diagnostics === "string" ? m.pending_diagnostics : "");
    text("pending-diagnostics", pending ? "Additional diagnostics pending: " + pending + "." : "");
    $("pending-diagnostics").hidden = !pending;
    $("operational-controls").hidden = state.mode !== "operational";
    if (state.mode === "operational") {
      const counts = ["6", "12", "24"].map(d => `${d} h: ${durationData(state.data, d)?.window_count || 0}/${EXPECTED[d]}`);
      const canonical = ["6", "12", "24"].every(d => durationData(state.data, d)?.window_count === EXPECTED[d]);
      const complete = canonical && (!m.status || m.status === "COMPLETE");
      text("operational-availability", "Verified windows · " + counts.join(" · ") + (complete ? ". All common 48-hour windows are available." : ". Remaining windows are waiting for matching forecasts or observations."));
    }
    text("updated-time", state.catalog.generated_utc ? "Catalog updated: " + state.catalog.generated_utc.replace("T", " ").replace("+00:00", " UTC").replace(/Z$/, " UTC") : "");
  }
  function updateTabs() {
    ["research", "operational"].forEach(mode => { const active = state.mode === mode; $(mode + "-tab").classList.toggle("active", active); $(mode + "-tab").setAttribute("aria-pressed", String(active)); });
  }
  async function load(mode, refreshCatalog = false) {
    const request = ++state.serial; state.mode = mode; updateTabs();
    $("data-panel").hidden = true; status("Loading matched " + (mode === "research" ? "2025 research" : "operational") + " verification…");
    try {
      if (!state.catalog || refreshCatalog) state.catalog = await fetchJSON(catalogURL);
      if (request !== state.serial) return;
      let entry;
      if (mode === "research") entry = state.catalog.research;
      else {
        const runs = state.catalog.operational?.runs || [];
        const requested = runs.find(r => r.init === state.init);
        const latest = runs.find(r => r.init === state.catalog.operational?.latest_complete_init) || runs.find(r => r.status === "COMPLETE") || runs[0];
        entry = requested || latest;
        if (entry) {
          state.init = entry.init;
          putOptions("run-select", runs.map(r => [r.init, initializationLabel(r.init) + (r.status === "COMPLETE" ? " · complete" : " · partial")]), state.init);
        }
      }
      if (!entry?.path) {
        status(mode === "research" ? "The 2025 research summary is not currently available." : "No matched operational verification is available yet. Forecasts can be viewed in the forecast-map comparison while observations are pending.");
        return;
      }
      const data = validateDataset(await fetchJSON(safePath(entry.path)));
      if (request !== state.serial) return;
      if (mode === "operational" && data.metadata?.init && data.metadata.init !== state.init) throw new Error("Operational initialization mismatch");
      state.data = data; metadata(); renderControls(); renderDetail(); $("data-panel").hidden = false;
      status(mode === "research" ? "Annual matched results loaded. Select a duration, ending lead and threshold below." : "Matched operational results loaded. Recent verification becomes available after the valid periods have ended and observations pass checks.");
    } catch (error) {
      if (request !== state.serial) return;
      console.error("Matched verification data:", error);
      status("The selected verification dataset could not be loaded or validated. Refresh the results or choose the other view.", true);
    }
  }
  $("research-tab").addEventListener("click", () => load("research"));
  $("operational-tab").addEventListener("click", () => load("operational"));
  $("refresh-data").addEventListener("click", () => load(state.mode, true));
  $("run-select").addEventListener("change", event => { state.init = event.target.value; load("operational"); });
  $("duration-select").addEventListener("change", event => { state.duration = event.target.value; renderControls(); renderDetail(); });
  $("lead-select").addEventListener("change", event => { state.lead = event.target.value; renderControls(); renderDetail(); });
  $("threshold-select").addEventListener("change", event => { state.threshold = Number(event.target.value); renderDetail(); });
  root.ANNVerificationV2 = API;
  load(state.mode);
})(typeof window !== "undefined" ? window : globalThis);
