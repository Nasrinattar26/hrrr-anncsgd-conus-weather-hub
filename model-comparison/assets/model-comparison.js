
(() => {
  "use strict";

  const data = window.MODEL_COMPARISON_DATA;

  if (!data) {
    document.body.innerHTML =
      "<p>Comparison data could not be loaded.</p>";
    return;
  }


  const catalog = window.MODEL_COMPARISON_CATALOG;
  const initializationSelector = document.getElementById(
    "comparison-initialization"
  );

  const formatInitialization = initialization => {
    const value = String(initialization || "");

    if (!/^\d{10}$/.test(value)) return value;

    return `${value.slice(0, 4)}-${value.slice(4, 6)}-`
      + `${value.slice(6, 8)} ${value.slice(8, 10)} UTC`;
  };

  if (initializationSelector) {
    const availableRuns = (
      catalog
      && Array.isArray(catalog.runs)
      && catalog.runs.length
    )
      ? catalog.runs
      : [{ initialization: data.initialization }];

    initializationSelector.replaceChildren();

    availableRuns.forEach(run => {
      const option = document.createElement("option");
      option.value = run.initialization;
      option.textContent = formatInitialization(
        run.initialization
      );
      initializationSelector.appendChild(option);
    });

    initializationSelector.value = data.initialization;

    initializationSelector.addEventListener("change", event => {
      const url = new URL(window.location.href);
      url.searchParams.set("init", event.target.value);
      window.location.assign(url.toString());
    });
  }

  const HRRR = "HRRR ANN-CSGD";
  const GEFS = "GEFS ANN-CSGD";
  const RAW_HRRR = "Raw HRRR";
  const RAW_GEFS = "GEFS ensemble-mean QPF";
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
      label: "Largest own-baseline CRPSS",
      value: number(hrrr.crpss_vs_own_raw),
      note: "HRRR relative to its own raw baseline",
    },
    {
      model: "gefs",
      label: "Lowest ANN-CSGD MAE",
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
    "Pilot interpretation: Four-window spatial-block intervals favor HRRR "
    + "for CRPS and RMSE, and HRRR has the lower WIS. They favor GEFS for "
    + "MAE and generally sharper intervals. Absolute-bias superiority "
    + "is inconclusive. Multi-day retention is required before an "
    + "overall ranking.";

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


(() => {
  "use strict";

  const data = window.MODEL_COMPARISON_DATA;
  if (!data || data.page_contract_version < 4) return;

  const HRRR = "HRRR ANN-CSGD";
  const GEFS = "GEFS ANN-CSGD";
  const models = [HRRR, GEFS];
  const colors = {
    [HRRR]: "#1767d5",
    [GEFS]: "#d97721",
  };

  const finite = value =>
    typeof value === "number" && Number.isFinite(value);

  const number = (value, digits = 3) =>
    finite(value) ? value.toFixed(digits) : "—";

  const signed = (value, digits = 3) =>
    finite(value)
      ? `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`
      : "—";

  const escapeHtml = value => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const modelClass = model => model === HRRR ? "hrrr" : "gefs";

  const shortThreshold = threshold => ({
    "0.5 inch": "0.5 in",
    "1 inch": "1 in",
    "2 inches": "2 in",
    "3 inches": "3 in",
    "local 2-year 12-hour ARI": "2-y ARI",
    "local 5-year 12-hour ARI": "5-y ARI",
  })[threshold] || threshold;

  const forestChart = ({
    rows,
    value,
    lower,
    upper,
    label,
    support = () => "",
    axisLabel,
    digits = 3,
  }) => {
    const width = 920;
    const rowHeight = 58;
    const top = 34;
    const bottom = 54;
    const left = 205;
    const right = 130;
    const height = top + bottom + rowHeight * rows.length;
    const values = rows.flatMap(row => [
      lower(row),
      upper(row),
      value(row),
    ]).filter(finite);
    const largest = Math.max(
      1e-9,
      ...values.map(item => Math.abs(item))
    ) * 1.18;
    const minimum = -largest;
    const maximum = largest;
    const plotWidth = width - left - right;
    const x = item =>
      left + (item - minimum) * plotWidth / (maximum - minimum);
    const ticks = [-largest, -largest / 2, 0, largest / 2, largest];
    const grid = ticks.map(item => `
      <line class="${item === 0 ? "v2-zero-line" : "grid-line"}"
        x1="${x(item)}" x2="${x(item)}"
        y1="${top - 12}" y2="${height - bottom + 5}"></line>
      <text class="v2-axis-label" x="${x(item)}" y="${height - 25}"
        text-anchor="middle">${signed(item, digits)}</text>
    `).join("");
    const marks = rows.map((row, index) => {
      const y = top + index * rowHeight + rowHeight / 2;
      const estimate = value(row);
      const lo = lower(row);
      const hi = upper(row);
      const conclusive = lo > 0 || hi < 0;
      const favored = conclusive
        ? (estimate < 0 ? "hrrr" : "gefs")
        : "neutral";
      return `
        <text class="v2-row-label" x="${left - 14}" y="${y - 4}"
          text-anchor="end">${escapeHtml(label(row))}</text>
        <text class="v2-support-label" x="${left - 14}" y="${y + 15}"
          text-anchor="end">${escapeHtml(support(row))}</text>
        <line class="v2-ci-line" x1="${x(lo)}" x2="${x(hi)}"
          y1="${y}" y2="${y}"></line>
        <line class="v2-ci-line" x1="${x(lo)}" x2="${x(lo)}"
          y1="${y - 7}" y2="${y + 7}"></line>
        <line class="v2-ci-line" x1="${x(hi)}" x2="${x(hi)}"
          y1="${y - 7}" y2="${y + 7}"></line>
        <circle class="v2-ci-dot--${favored}" cx="${x(estimate)}"
          cy="${y}" r="6"></circle>
        <text class="v2-value-label" x="${width - right + 12}" y="${y + 4}">
          ${signed(estimate, digits)}
        </text>
      `;
    }).join("");
    return `
      <div class="v2-forest">
        <svg viewBox="0 0 ${width} ${height}" role="img"
          aria-label="${escapeHtml(axisLabel)} with paired 95 percent confidence intervals">
          ${grid}${marks}
          <text class="v2-axis-label" x="${left + plotWidth / 2}"
            y="${height - 5}" text-anchor="middle">${escapeHtml(axisLabel)}</text>
        </svg>
      </div>
    `;
  };

  const pairedRows = data.paired_amount_differences;
  document.getElementById("paired-amount-chart").innerHTML = forestChart({
    rows: pairedRows,
    value: row => row.hrrr_minus_gefs,
    lower: row => row.ci_lower_95,
    upper: row => row.ci_upper_95,
    label: row => row.metric,
    support: row => `${row.bootstrap_replicates.toLocaleString()} bootstrap replicates`,
    axisLabel: "HRRR minus GEFS (mm); negative favors HRRR",
    digits: 3,
  });

  const conclusive = pairedRows.filter(row =>
    row.ci_upper_95 < 0 || row.ci_lower_95 > 0
  );
  const hrrrWins = conclusive
    .filter(row => row.hrrr_minus_gefs < 0)
    .map(row => row.metric);
  const gefsWins = conclusive
    .filter(row => row.hrrr_minus_gefs > 0)
    .map(row => row.metric);
  document.getElementById("paired-amount-interpretation").textContent =
    `For this four-window pilot, HRRR has conclusive advantages in `
    + `${hrrrWins.join(" and ")}; GEFS has a conclusive advantage in `
    + `${gefsWins.join(" and ")}. Aggregate absolute-bias superiority `
    + `is inconclusive because its 95% interval crosses zero.`;

  const coverageRows = data.amount_intervals;
  const width = 700;
  const height = 360;
  const left = 65;
  const right = 25;
  const top = 20;
  const bottom = 65;
  const xMin = 0.48;
  const xMax = 0.97;
  const yMin = 0.48;
  const yMax = 1.0;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = value => left + (value - xMin) * plotWidth / (xMax - xMin);
  const y = value => top + (yMax - value) * plotHeight / (yMax - yMin);
  const ticks = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const coverageGrid = ticks.map(value => `
    <line class="grid-line" x1="${x(Math.min(value, xMax))}"
      x2="${x(Math.min(value, xMax))}" y1="${top}"
      y2="${height - bottom}"></line>
    <line class="grid-line" x1="${left}" x2="${width - right}"
      y1="${y(value)}" y2="${y(value)}"></line>
    <text class="tick-label" x="${x(Math.min(value, xMax))}"
      y="${height - 34}" text-anchor="middle">${value.toFixed(1)}</text>
    <text class="tick-label" x="${left - 10}" y="${y(value) + 4}"
      text-anchor="end">${value.toFixed(1)}</text>
  `).join("");
  const coverageSeries = models.map(model => {
    const rows = coverageRows
      .filter(row => row.model === model)
      .sort((a, b) => a.nominal_coverage - b.nominal_coverage);
    const points = rows.map(row =>
      `${x(row.nominal_coverage)},${y(row.empirical_coverage)}`
    ).join(" ");
    return `
      <polyline class="v2-coverage-line--${modelClass(model)}"
        points="${points}"></polyline>
      ${rows.map(row => `
        <circle class="v2-coverage-dot--${modelClass(model)}"
          cx="${x(row.nominal_coverage)}" cy="${y(row.empirical_coverage)}"
          r="5"></circle>
      `).join("")}
    `;
  }).join("");
  document.getElementById("interval-coverage-chart").innerHTML = `
    <div class="v2-calibration">
      <svg viewBox="0 0 ${width} ${height}" role="img"
        aria-label="Nominal versus empirical predictive interval coverage">
        ${coverageGrid}
        <line class="v2-coverage-reference"
          x1="${x(0.5)}" y1="${y(0.5)}"
          x2="${x(0.95)}" y2="${y(0.95)}"></line>
        ${coverageSeries}
        <text class="axis-label" x="${left + plotWidth / 2}" y="${height - 5}"
          text-anchor="middle">Nominal coverage</text>
        <text class="axis-label" x="16" y="${top + plotHeight / 2}"
          transform="rotate(-90 16 ${top + plotHeight / 2})"
          text-anchor="middle">Empirical coverage</text>
      </svg>
      <div class="legend">
        <span class="hrrr"><i></i>${HRRR}</span>
        <span class="gefs"><i></i>${GEFS}</span>
      </div>
    </div>
  `;

  const wisRows = data.wis_summary;
  const wisMaximum = Math.max(...wisRows.map(row => row.mean_wis_mm)) * 1.08;
  const wisWinner = [...wisRows].sort(
    (a, b) => a.mean_wis_mm - b.mean_wis_mm
  )[0];
  const wisLoser = [...wisRows].sort(
    (a, b) => b.mean_wis_mm - a.mean_wis_mm
  )[0];
  const wisImprovement = 100 * (
    wisLoser.mean_wis_mm - wisWinner.mean_wis_mm
  ) / wisLoser.mean_wis_mm;
  document.getElementById("wis-summary").innerHTML = `
    <div class="v2-wis">
      ${wisRows.map(row => `
        <div class="v2-wis-row">
          <span>${escapeHtml(row.model)}</span>
          <div class="v2-wis-track">
            <div class="v2-wis-fill v2-wis-fill--${modelClass(row.model)}"
              style="width:${100 * row.mean_wis_mm / wisMaximum}%"></div>
          </div>
          <strong>${number(row.mean_wis_mm)}</strong>
        </div>
      `).join("")}
    </div>
    <p class="v2-wis-note">
      ${escapeHtml(wisWinner.model)} has the lower WIS by
      ${number(wisImprovement, 1)}%.
    </p>
  `;

  document.getElementById("interval-table").innerHTML =
    coverageRows.map(row => `
      <tr>
        <td class="model-${modelClass(row.model)}">${escapeHtml(row.model)}</td>
        <td>${number(row.nominal_coverage, 2)}</td>
        <td>${number(row.empirical_coverage, 3)}</td>
        <td>${signed(row.coverage_error, 3)}</td>
        <td>${number(row.mean_width_mm, 3)} mm</td>
        <td>${number(row.median_width_mm, 3)} mm</td>
      </tr>
    `).join("");

  const brierRows = data.paired_threshold_differences;
  const brierReduction = row =>
    -100 * row.hrrr_minus_gefs / row.gefs_value;
  const brierLower = row =>
    -100 * row.ci_upper_95 / row.gefs_value;
  const brierUpper = row =>
    -100 * row.ci_lower_95 / row.gefs_value;
  document.getElementById("paired-brier-chart").innerHTML = forestChart({
    rows: brierRows,
    value: brierReduction,
    lower: brierLower,
    upper: brierUpper,
    label: row => shortThreshold(row.threshold),
    support: row => `${row.observed_events.toLocaleString()} observed events`,
    axisLabel: "HRRR Brier-score reduction relative to GEFS (%)",
    digits: 2,
  });

  const normalizedDecompositionChart = (field, higherIsBetter) => {
    const rows = data.brier_decomposition;
    const thresholds = [...new Set(rows.map(row => row.threshold))];
    const series = models.map(model => ({
      model,
      values: thresholds.map(threshold => {
        const row = rows.find(item =>
          item.threshold === threshold && item.model === model
        );
        return row[field] / row.uncertainty;
      }),
    }));
    const width = 650;
    const height = 340;
    const chartLeft = 62;
    const chartRight = 20;
    const chartTop = 22;
    const chartBottom = 72;
    const chartWidth = width - chartLeft - chartRight;
    const chartHeight = height - chartTop - chartBottom;
    const maximum = Math.max(
      0.01,
      ...series.flatMap(item => item.values)
    ) * 1.15;
    const px = index => chartLeft + (
      thresholds.length === 1
        ? chartWidth / 2
        : index * chartWidth / (thresholds.length - 1)
    );
    const py = value =>
      chartTop + (maximum - value) * chartHeight / maximum;
    const ticks = [0, maximum / 4, maximum / 2, 3 * maximum / 4, maximum];
    const grid = ticks.map(value => `
      <line class="grid-line" x1="${chartLeft}" x2="${width - chartRight}"
        y1="${py(value)}" y2="${py(value)}"></line>
      <text class="tick-label" x="${chartLeft - 8}" y="${py(value) + 4}"
        text-anchor="end">${value.toFixed(2)}</text>
    `).join("");
    const marks = series.map(item => {
      const points = item.values.map(
        (value, index) => `${px(index)},${py(value)}`
      ).join(" ");
      return `
        <polyline class="series-line series-line--${modelClass(item.model)}"
          points="${points}"></polyline>
        ${item.values.map((value, index) => `
          <circle class="series-dot--${modelClass(item.model)}"
            cx="${px(index)}" cy="${py(value)}" r="4.5"></circle>
        `).join("")}
      `;
    }).join("");
    const labels = thresholds.map((threshold, index) => `
      <text class="tick-label" x="${px(index)}" y="${height - 37}"
        text-anchor="middle">${escapeHtml(shortThreshold(threshold))}</text>
    `).join("");
    return `
      <svg viewBox="0 0 ${width} ${height}" role="img"
        aria-label="Normalized Brier ${escapeHtml(field)} comparison">
        ${grid}${marks}${labels}
        <text class="axis-label" x="16" y="${chartTop + chartHeight / 2}"
          transform="rotate(-90 16 ${chartTop + chartHeight / 2})"
          text-anchor="middle">Fraction of event uncertainty</text>
      </svg>
      <div class="legend">
        <span class="hrrr"><i></i>${HRRR}</span>
        <span class="gefs"><i></i>${GEFS}</span>
      </div>
      <p class="v2-science-note">
        ${higherIsBetter ? "Higher" : "Lower"} is better. Values for the
        rarest thresholds are exploratory because probability-bin support is sparse.
      </p>
    `;
  };
  document.getElementById("brier-resolution-chart").innerHTML =
    normalizedDecompositionChart("resolution", true);
  document.getElementById("brier-reliability-chart").innerHTML =
    normalizedDecompositionChart("reliability", false);

  const reliabilityV2 = threshold => {
    const width = 760;
    const height = 410;
    const left = 62;
    const right = 22;
    const top = 24;
    const bottom = 66;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const scaleX = value => left + value * plotWidth;
    const scaleY = value => top + (1 - value) * plotHeight;
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const groups = Object.fromEntries(models.map(model => [
      model,
      data.reliability_bins
        .filter(row =>
          row.threshold === threshold
          && row.model === model
          && row.count > 0
          && row.sufficient_sample
          && finite(row.mean_probability)
          && finite(row.observed_frequency)
        )
        .sort((a, b) => a.bin - b.bin),
    ]));
    const sufficient = models.every(model => groups[model].length >= 2);
    if (!sufficient) {
      const counts = models.map(model =>
        `${model}: ${groups[model].length} supported probability bin`
        + `${groups[model].length === 1 ? "" : "s"}`
      ).join("; ");
      return `
        <div class="v2-reliability-warning">
          <strong>Insufficient probability-bin support for a reliable curve.</strong>
          <p>${escapeHtml(counts)}. Exact Brier scores, paired uncertainty,
          event counts, ROC AUC, and PR AUC remain available.</p>
        </div>
      `;
    }
    const grid = ticks.map(value => `
      <line class="grid-line" x1="${scaleX(value)}" x2="${scaleX(value)}"
        y1="${top}" y2="${height - bottom}"></line>
      <line class="grid-line" x1="${left}" x2="${width - right}"
        y1="${scaleY(value)}" y2="${scaleY(value)}"></line>
      <text class="tick-label" x="${scaleX(value)}" y="${height - 34}"
        text-anchor="middle">${value.toFixed(2)}</text>
      <text class="tick-label" x="${left - 10}" y="${scaleY(value) + 4}"
        text-anchor="end">${value.toFixed(2)}</text>
    `).join("");
    const marks = models.map(model => {
      const rows = groups[model];
      const points = rows.map(row =>
        `${scaleX(row.mean_probability)},${scaleY(row.observed_frequency)}`
      ).join(" ");
      return `
        <polyline class="series-line series-line--${modelClass(model)}"
          points="${points}"></polyline>
        ${rows.map(row => {
          const lower = row.observed_frequency_lower_95;
          const upper = row.observed_frequency_upper_95;
          const px = scaleX(row.mean_probability);
          return `
            <line class="v2-reliability-error v2-reliability-error--${modelClass(model)}"
              x1="${px}" x2="${px}" y1="${scaleY(upper)}"
              y2="${scaleY(lower)}"></line>
            <line class="v2-reliability-error v2-reliability-error--${modelClass(model)}"
              x1="${px - 4}" x2="${px + 4}" y1="${scaleY(upper)}"
              y2="${scaleY(upper)}"></line>
            <line class="v2-reliability-error v2-reliability-error--${modelClass(model)}"
              x1="${px - 4}" x2="${px + 4}" y1="${scaleY(lower)}"
              y2="${scaleY(lower)}"></line>
            <circle class="series-dot--${modelClass(model)}"
              cx="${px}" cy="${scaleY(row.observed_frequency)}"
              r="${Math.max(3.5, Math.min(7, Math.log10(row.count + 1)))}">
            </circle>
          `;
        }).join("")}
      `;
    }).join("");
    const support = models.map(model => {
      const samples = groups[model].reduce((sum, row) => sum + row.count, 0);
      return `${model}: ${groups[model].length} supported bins, `
        + `${samples.toLocaleString()} samples in those bins`;
    }).join(" · ");
    return `
      <svg viewBox="0 0 ${width} ${height}" role="img"
        aria-label="Reliability diagram with Wilson 95 percent intervals">
        ${grid}
        <line class="reference-line" x1="${scaleX(0)}" y1="${scaleY(0)}"
          x2="${scaleX(1)}" y2="${scaleY(1)}"></line>
        ${marks}
        <text class="axis-label" x="${left + plotWidth / 2}" y="${height - 5}"
          text-anchor="middle">Mean forecast probability</text>
        <text class="axis-label" x="16" y="${top + plotHeight / 2}"
          transform="rotate(-90 16 ${top + plotHeight / 2})"
          text-anchor="middle">Observed frequency</text>
      </svg>
      <div class="legend">
        <span class="hrrr"><i></i>${HRRR}</span>
        <span class="gefs"><i></i>${GEFS}</span>
      </div>
      <p class="v2-reliability-note">${escapeHtml(support)}. Error bars are
      Wilson 95% binomial reference intervals and do not account for spatial
      dependence; bins with fewer than 50 samples are omitted.</p>
    `;
  };

  const reliabilitySelector =
    document.getElementById("reliability-threshold");
  const updateReliabilityV2 = () => {
    const index = Number(reliabilitySelector.value);
    const thresholds = [...new Set(
      data.threshold_summary.map(row => row.threshold)
    )];
    document.getElementById("reliability-chart").innerHTML =
      reliabilityV2(thresholds[index]);
  };
  reliabilitySelector.addEventListener("change", updateReliabilityV2);
  updateReliabilityV2();

  const pitV2 = group => {
    const width = 900;
    const height = 370;
    const left = 58;
    const right = 22;
    const top = 24;
    const bottom = 66;
    const fractions = models.flatMap(
      model => group.models[model].pit.fraction
    );
    const bins = group.models[HRRR].pit.fraction.length;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const groupWidth = plotWidth / bins;
    const barWidth = groupWidth * 0.31;
    const standardError = Math.sqrt(0.1 * 0.9 / group.sample_count);
    const lowerBand = Math.max(0, 0.1 - 1.96 * standardError);
    const upperBand = 0.1 + 1.96 * standardError;
    const maximum = Math.max(0.16, upperBand, ...fractions) * 1.10;
    const py = value => top + (maximum - value) * plotHeight / maximum;
    const ticks = Array.from(
      { length: 5 },
      (_, index) => index * maximum / 4
    );
    const grid = ticks.map(value => `
      <line class="grid-line" x1="${left}" x2="${width - right}"
        y1="${py(value)}" y2="${py(value)}"></line>
      <text class="tick-label" x="${left - 9}" y="${py(value) + 4}"
        text-anchor="end">${value.toFixed(2)}</text>
    `).join("");
    const bars = models.map((model, modelIndex) =>
      group.models[model].pit.fraction.map((value, index) => {
        const px = left + index * groupWidth
          + groupWidth * 0.17 + modelIndex * barWidth;
        return `
          <rect x="${px}" y="${py(value)}" width="${barWidth - 2}"
            height="${height - bottom - py(value)}"
            fill="${colors[model]}"></rect>
        `;
      }).join("")
    ).join("");
    const labels = Array.from({ length: bins }, (_, index) => {
      const lower = group.models[HRRR].pit.bin_lower[index];
      const upper = group.models[HRRR].pit.bin_upper[index];
      const px = left + (index + 0.5) * groupWidth;
      return `
        <text class="tick-label" x="${px}" y="${height - 35}"
          text-anchor="middle">${lower.toFixed(1)}–${upper.toFixed(1)}</text>
      `;
    }).join("");
    return `
      <svg viewBox="0 0 ${width} ${height}" role="img"
        aria-label="Randomized PIT histogram with binomial reference band">
        ${grid}
        <rect class="v2-pit-band" x="${left}" width="${plotWidth}"
          y="${py(upperBand)}" height="${py(lowerBand) - py(upperBand)}"></rect>
        ${bars}${labels}
        <line class="reference-line" x1="${left}" x2="${width - right}"
          y1="${py(0.1)}" y2="${py(0.1)}"></line>
        <text class="v2-pit-band-label" x="${width - right - 3}"
          y="${py(upperBand) - 5}" text-anchor="end">
          95% binomial reference
        </text>
        <line class="axis-line" x1="${left}" x2="${left}"
          y1="${top}" y2="${height - bottom}"></line>
        <line class="axis-line" x1="${left}" x2="${width - right}"
          y1="${height - bottom}" y2="${height - bottom}"></line>
        <text class="axis-label" x="${left + plotWidth / 2}" y="${height - 5}"
          text-anchor="middle">PIT bin</text>
        <text class="axis-label" x="16" y="${top + plotHeight / 2}"
          transform="rotate(-90 16 ${top + plotHeight / 2})"
          text-anchor="middle">Sample fraction</text>
      </svg>
      <div class="legend">
        <span class="hrrr"><i></i>${HRRR}</span>
        <span class="gefs"><i></i>${GEFS}</span>
      </div>
    `;
  };
  const distributionSelector = document.getElementById("distribution-group");
  const updatePitV2 = () => {
    const group = data.distribution_diagnostics.groups[
      Number(distributionSelector.value)
    ];
    document.getElementById("pit-chart").innerHTML = pitV2(group);
  };
  distributionSelector.addEventListener("change", updatePitV2);
  updatePitV2();
})();
