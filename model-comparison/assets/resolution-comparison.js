(() => {
  "use strict";

  const data = window.RESOLUTION_COMPARISON_DATA;
  const root = document.getElementById("resolution-comparison");

  if (!root) return;

  if (!data || data.status !== "PASS") {
    root.innerHTML = '<p class="resolution-error">Resolution-comparison data could not be loaded.</p>';
    return;
  }

  const order = ["025", "0125", "3km"];
  const colors = {"025": "#1767d5", "0125": "#08a6a6", "3km": "#ef8a17", raw: "#667085"};
  const labels = Object.fromEntries(data.resolutions.map(item => [item.id, item.label]));
  const groupLabels = {overall: "Overall", dry: "Dry case", typical: "Typical case", heavy: "Heavy case", extreme: "Extreme case"};

  const groupSelect = document.getElementById("resolution-group");
  const durationSelect = document.getElementById("resolution-duration");
  const thresholdSelect = document.getElementById("resolution-threshold");

  const state = {group: "overall", duration: 24, threshold: "0.5in"};

  const finite = value => typeof value === "number" && Number.isFinite(value);
  const format = (value, digits = 3) => finite(value) ? value.toFixed(digits) : "NA";
  const percent = value => finite(value) ? `${(100 * value).toFixed(1)}%` : "NA";

  const option = (value, text) => {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = text;
    return node;
  };

  data.evaluation.available_groups.forEach(group => groupSelect.appendChild(option(group, groupLabels[group] || group)));
  data.evaluation.durations_hours.forEach(duration => durationSelect.appendChild(option(String(duration), `${duration} hours`)));
  groupSelect.value = state.group;
  durationSelect.value = String(state.duration);

  function setThresholdOptions() {
    const available = data.thresholds_by_duration[String(state.duration)] || [];
    thresholdSelect.replaceChildren();
    available.forEach(item => thresholdSelect.appendChild(option(item.label, `${item.label} (${format(item.millimeters, 1)} mm)`)));
    if (!available.some(item => item.label === state.threshold)) state.threshold = available[0]?.label || "";
    thresholdSelect.value = state.threshold;
  }

  function selected(records) {
    return records.filter(row => row.group === state.group && row.duration_hours === state.duration);
  }

  function byResolution(records) {
    return Object.fromEntries(records.map(row => [row.resolution_id, row]));
  }

  function renderBars(targetId, rows, metric, settings = {}) {
    const target = document.getElementById(targetId);
    const valid = rows.filter(item => finite(item.value));
    const maximum = settings.maximum || Math.max(...valid.map(item => item.value), 0.000001);
    const minimum = settings.minimum || 0;
    const range = Math.max(maximum - minimum, 0.000001);
    target.replaceChildren();

    valid.forEach(item => {
      const row = document.createElement("div");
      row.className = "resolution-bar-row";
      const label = document.createElement("span");
      label.className = "resolution-bar-label";
      label.textContent = item.label;
      const track = document.createElement("div");
      track.className = "resolution-bar-track";
      const bar = document.createElement("div");
      bar.className = "resolution-bar";
      bar.style.width = `${Math.max(1.5, Math.min(100, 100 * (item.value - minimum) / range))}%`;
      bar.style.background = item.color;
      const value = document.createElement("strong");
      value.textContent = settings.formatter ? settings.formatter(item.value) : format(item.value);
      value.title = `${item.label}: ${metric} = ${value.textContent}`;
      track.append(bar);
      row.append(label, track, value);
      target.append(row);
    });
  }

  function renderMethods() {
    const target = document.getElementById("resolution-methods");
    target.replaceChildren();
    data.resolutions.forEach(item => {
      const card = document.createElement("article");
      card.className = `resolution-method-card${item.exploratory ? " resolution-method-card--exploratory" : ""}`;
      card.innerHTML = `
        <div class="resolution-method-card__title"><span style="background:${colors[item.id]}"></span><strong>${item.label}</strong>${item.exploratory ? '<em>Exploratory</em>' : ''}</div>
        <dl>
          <div><dt>ANN neighborhood</dt><dd>${item.neighborhood_size} × ${item.neighborhood_size}</dd></div>
          <div><dt>Sampling</dt><dd>${item.sampling_method.replaceAll("_", " ")}</dd></div>
          <div><dt>Training</dt><dd>${item.training_scope}</dd></div>
        </dl>`;
      target.append(card);
    });
  }

  function renderReliability(rows) {
    const target = document.getElementById("resolution-reliability-chart");
    const filtered = rows.filter(row => row.threshold_label === state.threshold && row.n_samples > 0 && finite(row.mean_forecast_probability) && finite(row.observed_frequency));
    const grouped = new Map(order.map(id => [id, []]));
    filtered.forEach(row => grouped.get(row.resolution_id)?.push(row));

    const width = 720, height = 430, left = 62, right = 24, top = 28, bottom = 58;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const x = value => left + value * plotWidth;
    const y = value => top + (1 - value) * plotHeight;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Reliability diagram for ${state.threshold}, ${state.duration}-hour duration, ${groupLabels[state.group]}`);

    for (let tick = 0; tick <= 5; tick += 1) {
      const value = tick / 5;
      [[x(value), top, x(value), top + plotHeight], [left, y(value), left + plotWidth, y(value)]].forEach(coords => {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", coords[0]); line.setAttribute("y1", coords[1]); line.setAttribute("x2", coords[2]); line.setAttribute("y2", coords[3]);
        line.setAttribute("class", "resolution-grid-line"); svg.append(line);
      });
      const xt = document.createElementNS(ns, "text"); xt.setAttribute("x", x(value)); xt.setAttribute("y", height - 28); xt.setAttribute("class", "resolution-axis-tick"); xt.textContent = value.toFixed(1); svg.append(xt);
      const yt = document.createElementNS(ns, "text"); yt.setAttribute("x", left - 14); yt.setAttribute("y", y(value) + 4); yt.setAttribute("class", "resolution-axis-tick resolution-axis-tick--y"); yt.textContent = value.toFixed(1); svg.append(yt);
    }

    const diagonal = document.createElementNS(ns, "line");
    diagonal.setAttribute("x1", x(0)); diagonal.setAttribute("y1", y(0)); diagonal.setAttribute("x2", x(1)); diagonal.setAttribute("y2", y(1)); diagonal.setAttribute("class", "resolution-diagonal"); svg.append(diagonal);

    order.forEach(id => {
      const points = grouped.get(id).sort((a, b) => a.mean_forecast_probability - b.mean_forecast_probability);
      if (!points.length) return;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", points.map((point, index) => `${index ? "L" : "M"}${x(point.mean_forecast_probability)},${y(point.observed_frequency)}`).join(" "));
      path.setAttribute("fill", "none"); path.setAttribute("stroke", colors[id]); path.setAttribute("stroke-width", "4"); path.setAttribute("stroke-linejoin", "round"); svg.append(path);
      points.forEach(point => {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", x(point.mean_forecast_probability)); circle.setAttribute("cy", y(point.observed_frequency)); circle.setAttribute("r", "4.5"); circle.setAttribute("fill", colors[id]);
        const title = document.createElementNS(ns, "title"); title.textContent = `${labels[id]}: forecast ${format(point.mean_forecast_probability)}, observed ${format(point.observed_frequency)}, n=${point.n_samples}`; circle.append(title); svg.append(circle);
      });
    });

    const xlabel = document.createElementNS(ns, "text"); xlabel.setAttribute("x", left + plotWidth / 2); xlabel.setAttribute("y", height - 4); xlabel.setAttribute("class", "resolution-axis-label"); xlabel.textContent = "Mean forecast probability"; svg.append(xlabel);
    const ylabel = document.createElementNS(ns, "text"); ylabel.setAttribute("transform", `translate(17 ${top + plotHeight / 2}) rotate(-90)`); ylabel.setAttribute("class", "resolution-axis-label"); ylabel.textContent = "Observed frequency"; svg.append(ylabel);
    target.replaceChildren(svg);
  }

  function render() {
    const crpsRows = byResolution(selected(data.crps));
    const probabilityRows = byResolution(selected(data.probabilistic).filter(row => row.threshold_label === state.threshold));
    const categoryRows = byResolution(selected(data.categorical).filter(row => row.threshold_label === state.threshold));

    const rawCrps = crpsRows["025"]?.mean_crps_raw_deterministic;
    renderBars("resolution-crps-chart", [
      ...order.map(id => ({label: labels[id], value: crpsRows[id]?.mean_crps_anncsgd, color: colors[id]})),
      {label: "Raw HRRR baseline", value: rawCrps, color: colors.raw},
    ], "CRPS", {maximum: Math.max(rawCrps || 0, ...order.map(id => crpsRows[id]?.mean_crps_anncsgd || 0)) * 1.08});

    renderBars("resolution-crpss-chart", order.map(id => ({label: labels[id], value: crpsRows[id]?.crpss_anncsgd_vs_raw, color: colors[id]})), "CRPSS", {maximum: 0.5, formatter: percent});
    renderBars("resolution-bss-chart", [
      ...order.map(id => ({label: labels[id], value: probabilityRows[id]?.bss_anncsgd, color: colors[id]})),
      {label: "Raw HRRR baseline", value: probabilityRows["025"]?.bss_raw_hrrr, color: colors.raw},
    ], "BSS", {minimum: Math.min(0, probabilityRows["025"]?.bss_raw_hrrr || 0), maximum: 0.5});
    renderBars("resolution-auc-chart", order.map(id => ({label: labels[id], value: probabilityRows[id]?.roc_auc_anncsgd_hist, color: colors[id]})), "ROC AUC", {minimum: 0.4, maximum: 1});

    const table = document.getElementById("resolution-score-table");
    table.replaceChildren();
    order.forEach(id => {
      const c = crpsRows[id] || {}, p = probabilityRows[id] || {}, k = categoryRows[id] || {};
      const row = document.createElement("tr");
      row.innerHTML = `<th scope="row"><span class="resolution-swatch" style="background:${colors[id]}"></span>${labels[id]}${id === "3km" ? ' <small>exploratory</small>' : ''}</th><td>${format(c.mean_crps_anncsgd)}</td><td>${format(c.crpss_anncsgd_vs_raw)}</td><td>${format(p.bss_anncsgd)}</td><td>${format(p.roc_auc_anncsgd_hist)}</td><td>${format(k.ann_csi)}</td><td>${format(k.ann_pod)}</td><td>${format(k.ann_far)}</td><td>${p.n_events ?? "NA"}</td>`;
      table.append(row);
    });

    const p025 = crpsRows["025"]?.mean_crps_anncsgd;
    const p0125 = crpsRows["0125"]?.mean_crps_anncsgd;
    const difference = finite(p025) && finite(p0125) ? 100 * (p025 - p0125) / p025 : null;
    const summary = document.getElementById("resolution-interpretation");
    const relation = finite(difference) && Math.abs(difference) < 1 ? `are essentially equivalent (${Math.abs(difference).toFixed(2)}% CRPS difference)` : `${difference >= 0 ? "favor 0.125°" : "favor 0.25°"} by ${Math.abs(difference).toFixed(2)}% in CRPS`;
    summary.textContent = `For ${groupLabels[state.group].toLowerCase()} verification at ${state.duration} hours, the 0.25° and 0.125° systems ${relation}. The native-HRRR result remains exploratory because resolution and training-sample design differ simultaneously.`;

    const eventCount = probabilityRows["025"]?.n_events;
    const warning = document.getElementById("resolution-event-warning");
    warning.hidden = !(Number.isInteger(eventCount) && eventCount < 50);
    warning.textContent = warning.hidden ? "" : `Rare-event warning: only ${eventCount} observed ${state.threshold} events are available for this selection. Avoid strong rankings from threshold scores.`;

    document.getElementById("resolution-selection-summary").textContent = `${groupLabels[state.group]} · ${state.duration}-hour accumulation · ${state.threshold} threshold · ${probabilityRows["025"]?.n_samples?.toLocaleString() || "NA"} common point-cases`;
    renderReliability(selected(data.reliability));
  }

  groupSelect.addEventListener("change", () => {state.group = groupSelect.value; render();});
  durationSelect.addEventListener("change", () => {state.duration = Number(durationSelect.value); setThresholdOptions(); render();});
  thresholdSelect.addEventListener("change", () => {state.threshold = thresholdSelect.value; render();});

  renderMethods();
  setThresholdOptions();
  render();
})();
