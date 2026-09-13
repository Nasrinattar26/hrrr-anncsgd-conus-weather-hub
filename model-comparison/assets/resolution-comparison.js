(() => {
  "use strict";

  const data = window.RESOLUTION_COMPARISON_DATA;
  const root = document.getElementById("resolution-comparison");

  if (!root) return;

  if (!data || data.status !== "PASS" || data.contract_version !== 2) {
    root.innerHTML = '<p class="resolution-error">The controlled resolution-comparison data could not be loaded.</p>';
    return;
  }

  const order = ["025", "0125", "3km"];
  const colors = {"025": "#1767d5", "0125": "#08a6a6", "3km": "#ef8a17", raw: "#667085"};
  const labels = Object.fromEntries(data.resolutions.map(item => [item.id, item.label]));
  const groupLabels = {
    overall: "Overall held-out year",
    dry: "Dry subset",
    typical: "Typical subset",
    heavy: "Heavy subset",
    extreme: "Extreme subset",
  };

  const groupSelect = document.getElementById("resolution-group");
  const durationSelect = document.getElementById("resolution-duration");
  const thresholdSelect = document.getElementById("resolution-threshold");
  const state = {group: "overall", duration: 24, threshold: "0.5in"};

  const finite = value => typeof value === "number" && Number.isFinite(value);
  const format = (value, digits = 3) => finite(value) ? value.toFixed(digits) : "NA";
  const percent = value => finite(value) ? `${(100 * value).toFixed(1)}%` : "NA";
  const integer = value => Number.isInteger(value) ? value.toLocaleString() : "NA";
  const exactDifference = value => {
    if (!finite(value)) return "NA";
    const magnitude = Math.abs(value);
    if (magnitude > 0 && magnitude < 0.000001) return value.toExponential(3);
    return value.toFixed(9);
  };

  const option = (value, text) => {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = text;
    return node;
  };

  data.evaluation.available_groups.forEach(group => {
    groupSelect.appendChild(option(group, groupLabels[group] || group));
  });
  data.evaluation.durations_hours.forEach(duration => {
    durationSelect.appendChild(option(String(duration), `${duration} hours`));
  });
  groupSelect.value = state.group;
  durationSelect.value = String(state.duration);

  function setThresholdOptions() {
    const available = data.thresholds_by_duration[String(state.duration)] || [];
    thresholdSelect.replaceChildren();
    available.forEach(item => {
      thresholdSelect.appendChild(option(item.label, `${item.label} (${format(item.millimeters, 2)} mm)`));
    });
    if (!available.some(item => item.label === state.threshold)) {
      state.threshold = available[0]?.label || "";
    }
    thresholdSelect.value = state.threshold;
  }

  function selected(records) {
    return records.filter(row => row.group === state.group && row.duration_hours === state.duration);
  }

  function byResolution(records) {
    return Object.fromEntries(records.map(row => [row.resolution_id, row]));
  }

  function ranked(records, metric, lowerIsBetter = true) {
    return order
      .filter(id => records[id] && finite(records[id][metric]))
      .sort((first, second) => {
        const difference = records[first][metric] - records[second][metric];
        return lowerIsBetter ? difference : -difference;
      });
  }

  function pairedComparison(metric, best, runnerUp) {
    const original = data.bootstrap.pairwise.find(row =>
      row.duration_hours === state.duration &&
      row.metric === metric &&
      new Set([row.first_resolution, row.second_resolution]).size === 2 &&
      [row.first_resolution, row.second_resolution].includes(best) &&
      [row.first_resolution, row.second_resolution].includes(runnerUp)
    );
    if (!original) return null;

    if (original.first_resolution === best) {
      return {
        difference: original.difference_first_minus_second,
        lower: original.ci95_lower,
        upper: original.ci95_upper,
        probabilityBestLower: original.probability_first_lower,
        resolved: original.statistically_resolved_95,
      };
    }
    return {
      difference: -original.difference_first_minus_second,
      lower: -original.ci95_upper,
      upper: -original.ci95_lower,
      probabilityBestLower: 1 - original.probability_first_lower,
      resolved: original.statistically_resolved_95,
    };
  }

  function inferenceSentence(metricLabel, best, runnerUp, comparison) {
    if (!comparison) return `${metricLabel}: paired uncertainty result unavailable.`;
    const resolution = comparison.resolved
      ? "resolved at the 95% level"
      : "not resolved at the 95% level";
    return `${metricLabel}: ${labels[best]} has the lower point estimate than ${labels[runnerUp]}; the difference is ${resolution} (best − runner-up = ${exactDifference(comparison.difference)}, 95% CI ${exactDifference(comparison.lower)} to ${exactDifference(comparison.upper)}).`;
  }

  function renderBars(targetId, rows, metric, settings = {}) {
    const target = document.getElementById(targetId);
    const valid = rows.filter(item => finite(item.value));
    target.replaceChildren();
    if (!valid.length) return;

    const suppliedMin = finite(settings.minimum) ? settings.minimum : Math.min(0, ...valid.map(item => item.value));
    const suppliedMax = finite(settings.maximum) ? settings.maximum : Math.max(...valid.map(item => item.value), 0.000001);
    const minimum = Math.min(suppliedMin, suppliedMax - 0.000001);
    const maximum = Math.max(suppliedMax, minimum + 0.000001);
    const range = maximum - minimum;

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
      if (settings.diverging) {
        const zeroPosition = Math.max(0, Math.min(1, (0 - minimum) / range));
        const valuePosition = Math.max(0, Math.min(1, (item.value - minimum) / range));
        bar.style.left = `${100 * Math.min(zeroPosition, valuePosition)}%`;
        bar.style.width = `${Math.max(1.5, 100 * Math.abs(valuePosition - zeroPosition))}%`;
        if (minimum < 0 && maximum > 0) {
          const zero = document.createElement("span");
          zero.className = "resolution-bar-zero";
          zero.style.left = `${100 * zeroPosition}%`;
          track.append(zero);
        }
      } else {
        bar.style.left = "0";
        bar.style.width = `${Math.max(1.5, Math.min(100, 100 * (item.value - minimum) / range))}%`;
      }
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
      card.className = "resolution-method-card";
      card.innerHTML = `
        <div class="resolution-method-card__title">
          <span style="background:${colors[item.id]}"></span>
          <strong>${item.label}</strong>
          <em>Matched design</em>
        </div>
        <dl>
          <div><dt>ANN neighborhood</dt><dd>${item.neighborhood_size} × ${item.neighborhood_size} cells</dd></div>
          <div><dt>Sampling</dt><dd>${item.sampling_method}</dd></div>
          <div><dt>Training</dt><dd>${item.training_scope}</dd></div>
        </dl>`;
      target.append(card);
    });
  }

  function renderReliability(rows) {
    const target = document.getElementById("resolution-reliability-chart");
    const filtered = rows.filter(row =>
      row.threshold_label === state.threshold &&
      row.n_samples > 0 &&
      finite(row.mean_forecast_probability) &&
      finite(row.observed_frequency)
    );
    const grouped = new Map(order.map(id => [id, []]));
    filtered.forEach(row => grouped.get(row.resolution_id)?.push(row));

    const width = 720;
    const height = 430;
    const left = 62;
    const right = 24;
    const top = 28;
    const bottom = 58;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = value => left + value * plotWidth;
    const y = value => top + (1 - value) * plotHeight;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Reliability diagram for ${state.threshold}, ${state.duration}-hour duration, ${groupLabels[state.group]}`);

    for (let tick = 0; tick <= 5; tick += 1) {
      const value = tick / 5;
      const lines = [
        [x(value), top, x(value), top + plotHeight],
        [left, y(value), left + plotWidth, y(value)],
      ];
      lines.forEach(coordinates => {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", coordinates[0]);
        line.setAttribute("y1", coordinates[1]);
        line.setAttribute("x2", coordinates[2]);
        line.setAttribute("y2", coordinates[3]);
        line.setAttribute("class", "resolution-grid-line");
        svg.append(line);
      });

      const xTick = document.createElementNS(ns, "text");
      xTick.setAttribute("x", x(value));
      xTick.setAttribute("y", height - 28);
      xTick.setAttribute("class", "resolution-axis-tick");
      xTick.textContent = value.toFixed(1);
      svg.append(xTick);

      const yTick = document.createElementNS(ns, "text");
      yTick.setAttribute("x", left - 14);
      yTick.setAttribute("y", y(value) + 4);
      yTick.setAttribute("class", "resolution-axis-tick resolution-axis-tick--y");
      yTick.textContent = value.toFixed(1);
      svg.append(yTick);
    }

    const diagonal = document.createElementNS(ns, "line");
    diagonal.setAttribute("x1", x(0));
    diagonal.setAttribute("y1", y(0));
    diagonal.setAttribute("x2", x(1));
    diagonal.setAttribute("y2", y(1));
    diagonal.setAttribute("class", "resolution-diagonal");
    svg.append(diagonal);

    order.forEach(id => {
      const points = grouped.get(id).sort((first, second) => first.mean_forecast_probability - second.mean_forecast_probability);
      if (!points.length) return;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", points.map((point, index) => `${index ? "L" : "M"}${x(point.mean_forecast_probability)},${y(point.observed_frequency)}`).join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colors[id]);
      path.setAttribute("stroke-width", "4");
      path.setAttribute("stroke-linejoin", "round");
      svg.append(path);

      points.forEach(point => {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", x(point.mean_forecast_probability));
        circle.setAttribute("cy", y(point.observed_frequency));
        circle.setAttribute("r", "4.5");
        circle.setAttribute("fill", colors[id]);
        const title = document.createElementNS(ns, "title");
        title.textContent = `${labels[id]}: forecast ${format(point.mean_forecast_probability)}, observed ${format(point.observed_frequency)}, n=${integer(point.n_samples)}`;
        circle.append(title);
        svg.append(circle);
      });
    });

    const xLabel = document.createElementNS(ns, "text");
    xLabel.setAttribute("x", left + plotWidth / 2);
    xLabel.setAttribute("y", height - 4);
    xLabel.setAttribute("class", "resolution-axis-label");
    xLabel.textContent = "Mean forecast probability";
    svg.append(xLabel);

    const yLabel = document.createElementNS(ns, "text");
    yLabel.setAttribute("transform", `translate(17 ${top + plotHeight / 2}) rotate(-90)`);
    yLabel.setAttribute("class", "resolution-axis-label");
    yLabel.textContent = "Observed frequency";
    svg.append(yLabel);
    target.replaceChildren(svg);
  }

  function renderInterpretation(crpsRows, probabilityRows) {
    const crpsRanking = ranked(crpsRows, "mean_crps_anncsgd", true);
    const brierRanking = ranked(probabilityRows, "bs_anncsgd", true);
    const target = document.getElementById("resolution-interpretation");
    target.replaceChildren();

    if (crpsRanking.length < 2 || brierRanking.length < 2) {
      target.textContent = "Insufficient data for this selection.";
      return;
    }

    const headline = document.createElement("strong");
    headline.className = "resolution-interpretation__headline";
    headline.textContent = `${labels[crpsRanking[0]]} has the lowest CRPS; ${labels[brierRanking[0]]} has the lowest ${state.threshold} Brier score.`;
    target.append(headline);

    const detail = document.createElement("span");
    detail.className = "resolution-interpretation__detail";
    if (state.group === "overall") {
      const crpsComparison = pairedComparison("crps", crpsRanking[0], crpsRanking[1]);
      const brierComparison = pairedComparison(`brier_${state.threshold}`, brierRanking[0], brierRanking[1]);
      detail.textContent = `${inferenceSentence("CRPS", crpsRanking[0], crpsRanking[1], crpsComparison)} ${inferenceSentence(`${state.threshold} Brier score`, brierRanking[0], brierRanking[1], brierComparison)}`;
    } else {
      detail.textContent = "Subset scores are descriptive diagnostics. The paired 95% bootstrap intervals shown by this site apply to the overall 2025 held-out sample, not to individual severity subsets.";
    }
    target.append(detail);

    const status = document.createElement("span");
    status.className = "resolution-interpretation__ci";
    status.textContent = "All three models use identical record partitions, targets, architecture, training schedule, and random seed. Native HRRR (~3 km) is therefore part of the controlled comparison.";
    target.append(status);
  }

  function render() {
    const crpsRows = byResolution(selected(data.crps));
    const probabilityRows = byResolution(
      selected(data.probabilistic).filter(row => row.threshold_label === state.threshold)
    );
    const categoryRows = byResolution(
      selected(data.categorical).filter(row => row.threshold_label === state.threshold)
    );

    const rawCrps = crpsRows["025"]?.mean_crps_raw_deterministic;
    const crpsValues = order.map(id => crpsRows[id]?.mean_crps_anncsgd).filter(finite);
    renderBars("resolution-crps-chart", [
      ...order.map(id => ({label: labels[id], value: crpsRows[id]?.mean_crps_anncsgd, color: colors[id]})),
      {label: "Raw HRRR baseline", value: rawCrps, color: colors.raw},
    ], "CRPS", {maximum: Math.max(rawCrps || 0, ...crpsValues) * 1.08});

    renderBars(
      "resolution-crpss-chart",
      order.map(id => ({label: labels[id], value: crpsRows[id]?.crpss_anncsgd_vs_raw, color: colors[id]})),
      "CRPSS",
      {maximum: 0.55, formatter: percent}
    );

    const bssValues = [
      ...order.map(id => probabilityRows[id]?.bss_anncsgd),
      probabilityRows["025"]?.bss_raw_hrrr,
    ].filter(finite);
    renderBars("resolution-bss-chart", [
      ...order.map(id => ({label: labels[id], value: probabilityRows[id]?.bss_anncsgd, color: colors[id]})),
      {label: "Raw HRRR baseline", value: probabilityRows["025"]?.bss_raw_hrrr, color: colors.raw},
    ], "BSS", {
      minimum: Math.min(0, ...bssValues),
      maximum: Math.max(0.05, ...bssValues) * 1.08,
      diverging: true,
    });

    renderBars(
      "resolution-auc-chart",
      order.map(id => ({label: labels[id], value: probabilityRows[id]?.roc_auc_anncsgd_hist, color: colors[id]})),
      "ROC AUC",
      {minimum: 0.4, maximum: 1}
    );

    const brierRanking = ranked(probabilityRows, "bs_anncsgd", true);
    const table = document.getElementById("resolution-score-table");
    table.replaceChildren();
    order.forEach(id => {
      const continuous = crpsRows[id] || {};
      const probability = probabilityRows[id] || {};
      const category = categoryRows[id] || {};
      const row = document.createElement("tr");
      if (id === brierRanking[0]) row.className = "resolution-row--best";
      const badge = id === data.operational_recommendation.default_resolution_id
        ? " <small>recommended default</small>"
        : "";
      row.innerHTML = `<th scope="row"><span class="resolution-swatch" style="background:${colors[id]}"></span>${labels[id]}${badge}</th><td>${format(continuous.mean_crps_anncsgd)}</td><td>${format(continuous.crpss_anncsgd_vs_raw)}</td><td>${format(probability.bss_anncsgd)}</td><td>${format(probability.roc_auc_anncsgd_hist)}</td><td>${format(category.ann_csi)}</td><td>${format(category.ann_pod)}</td><td>${format(category.ann_far)}</td><td>${integer(probability.n_events)}</td>`;
      table.append(row);
    });

    renderInterpretation(crpsRows, probabilityRows);

    const eventCount = probabilityRows["025"]?.n_events;
    const warning = document.getElementById("resolution-event-warning");
    warning.hidden = !(Number.isInteger(eventCount) && eventCount < 1000);
    warning.textContent = warning.hidden
      ? ""
      : `Limited-event warning: this selection contains ${integer(eventCount)} observed ${state.threshold} events. Use the confidence interval and avoid ranking systems from the point estimate alone.`;

    const sampleCount = probabilityRows["025"]?.n_samples;
    document.getElementById("resolution-selection-summary").textContent = `${groupLabels[state.group]} · ${state.duration}-hour accumulation · ${state.threshold} threshold · ${integer(sampleCount)} common point samples · held-out 2025`;
    renderReliability(selected(data.reliability));
  }

  groupSelect.addEventListener("change", () => {
    state.group = groupSelect.value;
    render();
  });
  durationSelect.addEventListener("change", () => {
    state.duration = Number(durationSelect.value);
    setThresholdOptions();
    render();
  });
  thresholdSelect.addEventListener("change", () => {
    state.threshold = thresholdSelect.value;
    render();
  });

  renderMethods();
  setThresholdOptions();
  render();
})();
