
(() => {
  "use strict";

  const data = window.MODEL_COMPARISON_DATA;

  if (!data) {
    document.body.innerHTML =
      "<p>Comparison data could not be loaded.</p>";
    return;
  }

  const HRRR = "HRRR ANN-CSGD";
  const GEFS = "GEFS ANN-CSGD";
  const RAW_HRRR = "Raw HRRR";
  const RAW_GEFS = "Raw GEFS";
  const models = [HRRR, GEFS];
  const colors = {
    [HRRR]: "#1767d5",
    [GEFS]: "#d97721",
    observed: "#27364d",
  };

  const finite = value =>
    typeof value === "number" && Number.isFinite(value);

  const number = (value, digits = 3) =>
    finite(value) ? value.toFixed(digits) : "—";

  const signed = (value, digits = 3) => {
    if (!finite(value)) return "—";
    return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
  };

  const escapeHtml = value => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const modelClass = model => model === HRRR ? "hrrr" : "gefs";

  const shortThreshold = label => label
    .replace("local 2-year 12-hour ARI", "2-y ARI")
    .replace("local 5-year 12-hour ARI", "5-y ARI")
    .replace(" inches", " in")
    .replace(" inch", " in");

  const shortWindow = value => value.replaceAll("_", "–");

  const amount = model =>
    data.amount_summary.find(row => row.model === model);

  const thresholdRow = (threshold, model) =>
    data.threshold_summary.find(row =>
      row.threshold === threshold && row.model === model
    );

  const thresholdNames = [...new Set(
    data.threshold_summary
      .filter(row => models.includes(row.model))
      .map(row => row.threshold)
  )];

  const windowNames = [...new Set(
    data.amount_by_window
      .filter(row => models.includes(row.model))
      .map(row => row.window)
  )];

  const legend = items => `
    <div class="legend">
      ${items.map(item => `
        <span class="${item.className}">
          <i></i>${escapeHtml(item.label)}
        </span>
      `).join("")}
    </div>
  `;

  const lineChart = ({
    title,
    description,
    series,
    labels,
    minimum,
    maximum,
    reference = null,
    digits = 2,
  }) => {
    const width = 620;
    const height = 330;
    const left = 56;
    const right = 18;
    const top = 22;
    const bottom = 66;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = index => left + (
      labels.length === 1
        ? plotWidth / 2
        : index * plotWidth / (labels.length - 1)
    );
    const y = value =>
      top + (maximum - value) * plotHeight / (maximum - minimum);
    const ticks = Array.from(
      { length: 6 },
      (_, index) => minimum + index * (maximum - minimum) / 5
    );
    const grid = ticks.map(value => `
      <line class="grid-line" x1="${left}" x2="${width - right}"
        y1="${y(value)}" y2="${y(value)}"></line>
      <text class="tick-label" x="${left - 8}" y="${y(value) + 4}"
        text-anchor="end">${value.toFixed(digits)}</text>
    `).join("");
    const xLabels = labels.map((label, index) => `
      <text class="tick-label" x="${x(index)}" y="${height - 29}"
        text-anchor="middle">${escapeHtml(label)}</text>
    `).join("");
    const paths = series.map(item => {
      const valid = item.values
        .map((value, index) => ({ value, index }))
        .filter(point => finite(point.value));
      const points = valid.map(point =>
        `${x(point.index)},${y(point.value)}`
      );
      return `
        <polyline class="series-line series-line--${item.className}"
          points="${points.join(" ")}"></polyline>
        ${valid.map(point => `
          <circle class="series-dot--${item.className}"
            cx="${x(point.index)}" cy="${y(point.value)}" r="4.2"></circle>
        `).join("")}
      `;
    }).join("");
    const referenceLine = finite(reference) ? `
      <line class="reference-line" x1="${left}" x2="${width - right}"
        y1="${y(reference)}" y2="${y(reference)}"></line>
    ` : "";

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img"
        aria-labelledby="${title}-title ${title}-desc">
        <title id="${title}-title">${escapeHtml(title)}</title>
        <desc id="${title}-desc">${escapeHtml(description)}</desc>
        ${grid}
        <line class="axis-line" x1="${left}" x2="${left}"
          y1="${top}" y2="${height - bottom}"></line>
        <line class="axis-line" x1="${left}" x2="${width - right}"
          y1="${height - bottom}" y2="${height - bottom}"></line>
        ${referenceLine}${paths}${xLabels}
      </svg>
      ${legend(series.map(item => ({
        className: item.className,
        label: item.label,
      })))}
    `;
  };

  const reliabilityChart = threshold => {
    const width = 760;
    const height = 390;
    const left = 60;
    const right = 20;
    const top = 22;
    const bottom = 62;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = value => left + value * plotWidth;
    const y = value => top + (1 - value) * plotHeight;
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const grid = ticks.map(value => `
      <line class="grid-line" x1="${x(value)}" x2="${x(value)}"
        y1="${top}" y2="${height - bottom}"></line>
      <line class="grid-line" x1="${left}" x2="${width - right}"
        y1="${y(value)}" y2="${y(value)}"></line>
      <text class="tick-label" x="${x(value)}" y="${height - 31}"
        text-anchor="middle">${value.toFixed(2)}</text>
      <text class="tick-label" x="${left - 9}" y="${y(value) + 4}"
        text-anchor="end">${value.toFixed(2)}</text>
    `).join("");
    const paths = models.map(model => {
      const rows = data.reliability_bins
        .filter(row =>
          row.threshold === threshold
          && row.model === model
          && row.count > 0
          && finite(row.mean_probability)
          && finite(row.observed_frequency)
        )
        .sort((a, b) => a.bin - b.bin);
      const points = rows.map(row =>
        `${x(row.mean_probability)},${y(row.observed_frequency)}`
      );
      return `
        <polyline class="series-line series-line--${modelClass(model)}"
          points="${points.join(" ")}"></polyline>
        ${rows.map(row => `
          <circle class="series-dot--${modelClass(model)}"
            cx="${x(row.mean_probability)}"
            cy="${y(row.observed_frequency)}"
            r="${Math.max(3.5, Math.min(7, Math.log10(row.count + 1)))}">
          </circle>
        `).join("")}
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img"
        aria-labelledby="reliability-title-svg reliability-desc-svg">
        <title id="reliability-title-svg">Reliability for ${escapeHtml(threshold)}</title>
        <desc id="reliability-desc-svg">
          Forecast probability compared with observed frequency for both ANN-CSGD systems.
        </desc>
        ${grid}
        <line class="reference-line" x1="${x(0)}" y1="${y(0)}"
          x2="${x(1)}" y2="${y(1)}"></line>
        ${paths}
        <text class="axis-label" x="${left + plotWidth / 2}" y="${height - 5}"
          text-anchor="middle">Forecast probability</text>
        <text class="axis-label" x="15" y="${top + plotHeight / 2}"
          transform="rotate(-90 15 ${top + plotHeight / 2})"
          text-anchor="middle">Observed frequency</text>
      </svg>
      ${legend([
        { className: "hrrr", label: HRRR },
        { className: "gefs", label: GEFS },
      ])}
    `;
  };

  const scoreColor = value => {
    if (!finite(value)) return null;
    const clamped = Math.max(0, Math.min(1, value));
    const stops = [
      [238, 244, 255],
      [153, 194, 255],
      [23, 103, 213],
      [8, 45, 113],
    ];
    const scaled = clamped * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const fraction = scaled - index;
    return stops[index].map((channel, position) =>
      Math.round(
        channel + fraction * (stops[index + 1][position] - channel)
      )
    );
  };

  const heatmaps = () => {
    const metrics = [
      ["Precision", "precision"],
      ["Recall", "recall"],
      ["F1", "F1"],
    ];
    const rows = data.categorical_by_window;

    return metrics.map(([label, key]) => `
      <article class="heatmap-metric">
        <h3>${label}</h3>
        ${models.map(model => `
          <div class="heatmap-model">
            <strong class="model-${modelClass(model)}">${model}</strong>
            <div class="heatmap-table">
              <div class="heatmap-row">
                <span class="heatmap-cell heatmap-cell--header"></span>
                ${windowNames.map(window => `
                  <span class="heatmap-cell heatmap-cell--header">
                    ${shortWindow(window)}
                  </span>
                `).join("")}
              </div>
              ${thresholdNames.map(threshold => `
                <div class="heatmap-row">
                  <span class="heatmap-cell heatmap-cell--label">
                    ${escapeHtml(shortThreshold(threshold))}
                  </span>
                  ${windowNames.map(window => {
                    const row = rows.find(item =>
                      item.threshold === threshold
                      && item.window === window
                      && item.model === model
                    );
                    const value = row ? row[key] : null;
                    const rgb = scoreColor(value);
                    const dark = finite(value) && value >= 0.55;
                    const style = rgb
                      ? `background:rgb(${rgb.join(",")})`
                      : "";
                    const valueClass = finite(value)
                      ? `heatmap-cell--value ${dark ? "heatmap-cell--dark" : ""}`
                      : "heatmap-cell--undefined";
                    return `
                      <span class="heatmap-cell ${valueClass}" style="${style}"
                        aria-label="${escapeHtml(
                          `${model}, ${threshold}, ${window}, ${label}: `
                          + (finite(value) ? value.toFixed(3) : "undefined")
                        )}">
                        ${finite(value) ? value.toFixed(2) : "—"}
                      </span>
                    `;
                  }).join("")}
                </div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </article>
    `).join("");
  };

  const logChart = ({
    title,
    description,
    xValues,
    series,
    xMinimum,
    xMaximum,
    yMinimum,
    yMaximum,
    yLog = false,
    yLabel,
  }) => {
    const width = 700;
    const height = 400;
    const left = 68;
    const right = 20;
    const top = 22;
    const bottom = 66;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const logXMin = Math.log10(xMinimum);
    const logXMax = Math.log10(xMaximum);
    const x = value => left + (
      (Math.log10(value) - logXMin) / (logXMax - logXMin)
    ) * plotWidth;
    const transformY = value =>
      yLog ? Math.log10(Math.max(yMinimum, value)) : value;
    const transformedMin = transformY(yMinimum);
    const transformedMax = transformY(yMaximum);
    const y = value => top + (
      (transformedMax - transformY(value))
      / (transformedMax - transformedMin)
    ) * plotHeight;
    const xTicks = [0.1, 1, 10, 100]
      .filter(value => value >= xMinimum && value <= xMaximum);
    const yTicks = yLog
      ? [0.0001, 0.001, 0.01, 0.1, 1]
        .filter(value => value >= yMinimum && value <= yMaximum)
      : Array.from(
        { length: 5 },
        (_, index) => yMinimum + index * (yMaximum - yMinimum) / 4
      );
    const grids = [
      ...xTicks.map(value => `
        <line class="grid-line" x1="${x(value)}" x2="${x(value)}"
          y1="${top}" y2="${height - bottom}"></line>
        <text class="tick-label" x="${x(value)}" y="${height - 31}"
          text-anchor="middle">${value}</text>
      `),
      ...yTicks.map(value => `
        <line class="grid-line" x1="${left}" x2="${width - right}"
          y1="${y(value)}" y2="${y(value)}"></line>
        <text class="tick-label" x="${left - 9}" y="${y(value) + 4}"
          text-anchor="end">${value < 0.01 ? value.toExponential(0) : value.toFixed(2)}</text>
      `),
    ].join("");
    const paths = series.map(item => {
      const points = xValues
        .map((xValue, index) => ({
          xValue,
          yValue: item.values[index],
        }))
        .filter(point =>
          point.xValue >= xMinimum
          && point.xValue <= xMaximum
          && finite(point.yValue)
          && point.yValue >= yMinimum
        )
        .map(point => `${x(point.xValue)},${y(point.yValue)}`);
      return `
        <polyline class="series-line series-line--${item.className}"
          points="${points.join(" ")}"></polyline>
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img"
        aria-labelledby="${title}-title ${title}-desc">
        <title id="${title}-title">${escapeHtml(title)}</title>
        <desc id="${title}-desc">${escapeHtml(description)}</desc>
        ${grids}${paths}
        <line class="axis-line" x1="${left}" x2="${left}"
          y1="${top}" y2="${height - bottom}"></line>
        <line class="axis-line" x1="${left}" x2="${width - right}"
          y1="${height - bottom}" y2="${height - bottom}"></line>
        <text class="axis-label" x="${left + plotWidth / 2}" y="${height - 5}"
          text-anchor="middle">Precipitation (mm, logarithmic)</text>
        <text class="axis-label" x="16" y="${top + plotHeight / 2}"
          transform="rotate(-90 16 ${top + plotHeight / 2})"
          text-anchor="middle">${escapeHtml(yLabel)}</text>
      </svg>
      ${legend(series.map(item => ({
        className: item.className,
        label: item.label,
      })))}
    `;
  };

  const pitChart = group => {
    const width = 900;
    const height = 350;
    const left = 55;
    const right = 20;
    const top = 22;
    const bottom = 62;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const bins = group.models[HRRR].pit.fraction.length;
    const groupWidth = plotWidth / bins;
    const barWidth = groupWidth * 0.31;
    const maximum = Math.max(
      0.16,
      ...models.flatMap(model => group.models[model].pit.fraction)
    ) * 1.08;
    const y = value => top + (maximum - value) * plotHeight / maximum;
    const ticks = Array.from(
      { length: 5 },
      (_, index) => index * maximum / 4
    );
    const grid = ticks.map(value => `
      <line class="grid-line" x1="${left}" x2="${width - right}"
        y1="${y(value)}" y2="${y(value)}"></line>
      <text class="tick-label" x="${left - 8}" y="${y(value) + 4}"
        text-anchor="end">${value.toFixed(2)}</text>
    `).join("");
    const bars = models.map((model, modelIndex) =>
      group.models[model].pit.fraction.map((value, index) => {
        const x = left + index * groupWidth
          + groupWidth * 0.17 + modelIndex * barWidth;
        return `
          <rect x="${x}" y="${y(value)}" width="${barWidth - 2}"
            height="${height - bottom - y(value)}"
            fill="${colors[model]}"></rect>
        `;
      }).join("")
    ).join("");
    const labels = Array.from({ length: bins }, (_, index) => {
      const lower = group.models[HRRR].pit.bin_lower[index];
      const upper = group.models[HRRR].pit.bin_upper[index];
      const x = left + (index + 0.5) * groupWidth;
      return `
        <text class="tick-label" x="${x}" y="${height - 30}"
          text-anchor="middle">${lower.toFixed(1)}–${upper.toFixed(1)}</text>
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img"
        aria-labelledby="pit-title-svg pit-desc-svg">
        <title id="pit-title-svg">Randomized PIT histogram</title>
        <desc id="pit-desc-svg">
          Ten-bin randomized probability integral transform histogram for both models.
        </desc>
        ${grid}${bars}${labels}
        <line class="reference-line" x1="${left}" x2="${width - right}"
          y1="${y(0.1)}" y2="${y(0.1)}"></line>
        <line class="axis-line" x1="${left}" x2="${left}"
          y1="${top}" y2="${height - bottom}"></line>
        <line class="axis-line" x1="${left}" x2="${width - right}"
          y1="${height - bottom}" y2="${height - bottom}"></line>
        <text class="axis-label" x="${left + plotWidth / 2}" y="${height - 5}"
          text-anchor="middle">PIT bin</text>
        <text class="axis-label" x="15" y="${top + plotHeight / 2}"
          transform="rotate(-90 15 ${top + plotHeight / 2})"
          text-anchor="middle">Sample fraction</text>
      </svg>
      ${legend([
        { className: "hrrr", label: HRRR },
        { className: "gefs", label: GEFS },
      ])}
    `;
  };

  const renderDistribution = () => {
    const selector = document.getElementById("distribution-group");
    const group = data.distribution_diagnostics.groups[
      Number(selector.value)
    ];
    const observed = group.observed_zero_fraction;
    const hrrrZero = group.models[HRRR].mean_zero_probability;
    const gefsZero = group.models[GEFS].mean_zero_probability;

    document.getElementById("distribution-summary").innerHTML = `
      <article class="distribution-stat">
        <span>Observed zero fraction</span>
        <strong>${number(observed, 3)}</strong>
        <small>${group.sample_count.toLocaleString()} MRMS land samples</small>
      </article>
      <article class="distribution-stat distribution-stat--hrrr">
        <span>HRRR mean zero probability</span>
        <strong>${number(hrrrZero, 3)}</strong>
        <small>Absolute difference: ${number(Math.abs(hrrrZero - observed), 3)}</small>
      </article>
      <article class="distribution-stat distribution-stat--gefs">
        <span>GEFS mean zero probability</span>
        <strong>${number(gefsZero, 3)}</strong>
        <small>Absolute difference: ${number(Math.abs(gefsZero - observed), 3)}</small>
      </article>
    `;

    const pdfX = group.pdf.precipitation_mm;
    const pdfSeries = [
      {
        className: "observed",
        label: "MRMS observed",
        values: group.pdf.observed_positive_density,
      },
      {
        className: "hrrr",
        label: HRRR,
        values: group.models[HRRR].positive_density,
      },
      {
        className: "gefs",
        label: GEFS,
        values: group.models[GEFS].positive_density,
      },
    ];
    const positivePdfValues = pdfSeries.flatMap(item =>
      item.values.filter(value => finite(value) && value > 0)
    );
    const pdfMaximum = Math.max(...positivePdfValues) * 1.05;

    document.getElementById("pdf-chart").innerHTML = logChart({
      title: "positive-pdf",
      description: "Conditional positive precipitation density for MRMS and both CSGD systems.",
      xValues: pdfX,
      series: pdfSeries,
      xMinimum: 0.05,
      xMaximum: 200,
      yMinimum: 0,
      yMaximum: pdfMaximum,
      yLabel: "Conditional density",
    });

    const survivalX = group.survival.threshold_mm.map(value =>
      value === 0 ? 0.01 : value
    );
    document.getElementById("survival-chart").innerHTML = logChart({
      title: "exceedance-curve",
      description: "Observed and predicted precipitation exceedance probabilities.",
      xValues: survivalX,
      series: [
        {
          className: "observed",
          label: "MRMS observed",
          values: group.survival.observed_exceedance_frequency,
        },
        {
          className: "hrrr",
          label: HRRR,
          values: group.models[HRRR].survival_probability,
        },
        {
          className: "gefs",
          label: GEFS,
          values: group.models[GEFS].survival_probability,
        },
      ],
      xMinimum: 0.1,
      xMaximum: 200,
      yMinimum: 0.0001,
      yMaximum: 1,
      yLog: true,
      yLabel: "Exceedance probability",
    });

    document.getElementById("pit-chart").innerHTML = pitChart(group);
    document.getElementById("distribution-warning").textContent =
      data.distribution_diagnostics.interpretation_warning
      + " Randomized-PIT L1 deviation from uniform: HRRR "
      + number(group.models[HRRR].pit.l1_uniform_deviation, 3)
      + ", GEFS "
      + number(group.models[GEFS].pit.l1_uniform_deviation, 3)
      + ".";
  };

  const hrrr = amount(HRRR);
  const gefs = amount(GEFS);
  const crpsDifference = 100 * (
    gefs.mean_crps_mm - hrrr.mean_crps_mm
  ) / gefs.mean_crps_mm;

  document.getElementById("run-init").textContent =
    `${data.initialization.slice(0, 8)} ${data.initialization.slice(8)} UTC`;
  document.getElementById("run-summary").textContent =
    `${data.common_window_count} matched 12-hour windows · `
    + `${data.total_amount_samples.toLocaleString()} common land samples`;

  document.getElementById("summary-cards").innerHTML = [
    {
      model: "hrrr",
      label: "Lowest CRPS",
      value: `${number(hrrr.mean_crps_mm)} mm`,
      note: `HRRR · ${number(crpsDifference, 1)}% below GEFS`,
    },
    {
      model: "hrrr",
      label: "Highest CRPSS/raw",
      value: number(hrrr.crpss_vs_own_raw),
      note: "HRRR ANN-CSGD relative to raw HRRR",
    },
    {
      model: "gefs",
      label: "Lowest MAE",
      value: `${number(gefs.mae_mm)} mm`,
      note: "GEFS ANN-CSGD",
    },
    {
      model: "gefs",
      label: "Smallest bias",
      value: `${signed(gefs.bias_mm)} mm`,
      note: "GEFS ANN-CSGD",
    },
  ].map(card => `
    <article class="summary-card summary-card--${card.model}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <p>${card.note}</p>
    </article>
  `).join("");

  document.getElementById("pilot-caution").textContent =
    "Pilot interpretation: HRRR ANN-CSGD leads the primary probabilistic "
    + "scores for these four windows, while GEFS ANN-CSGD has lower MAE "
    + "and near-zero aggregate bias. A retained multi-day sample is "
    + "required before declaring an overall winner.";

  const amountMetrics = [
    ["CRPS", "mean_crps_mm"],
    ["MAE", "mae_mm"],
    ["RMSE", "rmse_mm"],
  ];
  document.getElementById("amount-bars").innerHTML = `
    <div class="metric-bars">
      ${amountMetrics.map(([label, key]) => {
        const maximum = Math.max(hrrr[key], gefs[key]) * 1.08;
        return `
          <div class="metric-group">
            <div class="metric-group__title">${label}</div>
            ${models.map(model => {
              const row = amount(model);
              return `
                <div class="metric-bar">
                  <span>${model.replace(" ANN-CSGD", "")}</span>
                  <div class="metric-track">
                    <div class="metric-fill metric-fill--${modelClass(model)}"
                      style="width:${100 * row[key] / maximum}%"></div>
                  </div>
                  <strong>${number(row[key])}</strong>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }).join("")}
    </div>
  `;

  document.getElementById("amount-table").innerHTML =
    data.amount_summary.map(row => {
      const modelName = row.model.includes("HRRR") ? "hrrr" : "gefs";
      return `
        <tr>
          <td class="model-${modelName}">${escapeHtml(row.model)}</td>
          <td>${number(row.mean_crps_mm)}</td>
          <td>${number(row.mae_mm)}</td>
          <td>${number(row.rmse_mm)}</td>
          <td>${signed(row.bias_mm)}</td>
          <td>${number(row.correlation)}</td>
          <td>${number(row.crpss_vs_own_raw)}</td>
        </tr>
      `;
    }).join("");

  const windowSeries = models.map(model => ({
    className: modelClass(model),
    label: model,
    values: windowNames.map(window =>
      data.amount_by_window.find(row =>
        row.window === window && row.model === model
      ).mean_crps_mm
    ),
  }));
  document.getElementById("window-crps-chart").innerHTML = lineChart({
    title: "window-crps",
    description: "CRPS by matched forecast window for both ANN-CSGD systems.",
    series: windowSeries,
    labels: windowNames.map(shortWindow),
    minimum: 0,
    maximum: Math.max(...windowSeries.flatMap(item => item.values)) * 1.12,
  });

  const metricSeries = key => models.map(model => ({
    className: modelClass(model),
    label: model,
    values: thresholdNames.map(threshold => thresholdRow(threshold, model)[key]),
  }));

  const bssValues = metricSeries("brier_skill_score");
  document.getElementById("bss-chart").innerHTML = lineChart({
    title: "brier-skill-score",
    description: "Brier Skill Score across six precipitation thresholds.",
    series: bssValues,
    labels: thresholdNames.map(shortThreshold),
    minimum: Math.min(0, ...bssValues.flatMap(item => item.values)) - 0.02,
    maximum: Math.max(...bssValues.flatMap(item => item.values)) * 1.15,
    reference: 0,
  });

  document.getElementById("roc-chart").innerHTML = lineChart({
    title: "roc-auc",
    description: "ROC area under the curve across six thresholds.",
    series: metricSeries("roc_auc"),
    labels: thresholdNames.map(shortThreshold),
    minimum: 0.5,
    maximum: 1,
  });

  document.getElementById("pr-chart").innerHTML = lineChart({
    title: "pr-auc",
    description: "Precision recall area under the curve across six thresholds.",
    series: metricSeries("pr_auc"),
    labels: thresholdNames.map(shortThreshold),
    minimum: 0,
    maximum: Math.max(
      ...metricSeries("pr_auc").flatMap(item => item.values)
    ) * 1.15,
  });

  const reliabilitySelector =
    document.getElementById("reliability-threshold");
  reliabilitySelector.innerHTML = thresholdNames.map((threshold, index) => `
    <option value="${index}">${escapeHtml(threshold)}</option>
  `).join("");
  const updateReliability = () => {
    const threshold = thresholdNames[Number(reliabilitySelector.value)];
    document.getElementById("reliability-chart").innerHTML =
      reliabilityChart(threshold);
  };
  reliabilitySelector.addEventListener("change", updateReliability);
  updateReliability();

  document.getElementById("classification-heatmaps").innerHTML = heatmaps();

  [
    ["1x1", "fss-1x1"],
    ["3x3", "fss-3x3"],
    ["5x5", "fss-5x5"],
  ].forEach(([scale, id]) => {
    document.getElementById(id).innerHTML = lineChart({
      title: `fss-${scale}`,
      description: `Fractions Skill Score at the ${scale} neighborhood.`,
      series: metricSeries(`FSS_${scale}`),
      labels: thresholdNames.map(shortThreshold),
      minimum: 0,
      maximum: 1,
    });
  });

  const groupSelector = document.getElementById("distribution-group");
  groupSelector.innerHTML =
    data.distribution_diagnostics.groups.map((group, index) => `
      <option value="${index}">${escapeHtml(group.label)}</option>
    `).join("");
  groupSelector.addEventListener("change", renderDistribution);
  renderDistribution();

  document.getElementById("threshold-table").innerHTML =
    thresholdNames.map(threshold =>
      models.map(model => {
        const row = thresholdRow(threshold, model);
        return `
          <tr>
            <td>${escapeHtml(threshold)}</td>
            <td class="model-${modelClass(model)}">${escapeHtml(model)}</td>
            <td>${number(row.brier_skill_score)}</td>
            <td>${number(row.roc_auc)}</td>
            <td>${number(row.pr_auc)}</td>
            <td>${number(row.expected_calibration_error)}</td>
            <td>${number(row.CSI)}</td>
            <td>${number(row.ETS)}</td>
            <td>${number(row.FSS_1x1)}</td>
            <td>${number(row.FSS_3x3)}</td>
            <td>${number(row.FSS_5x5)}</td>
          </tr>
        `;
      }).join("")
    ).join("");
})();
