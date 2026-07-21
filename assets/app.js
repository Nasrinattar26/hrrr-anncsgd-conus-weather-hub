function number(value, digits = 4) {
  return Number(value).toFixed(digits);
}

async function loadSite() {
  const response = await fetch("./data/site_summary.json");

  if (!response.ok) {
    throw new Error(`Could not load site data: ${response.status}`);
  }

  const data = await response.json();

  const badge = document.getElementById("status-badge");
  badge.className = "status pass";
  badge.textContent =
    `Production audit passed · ${data.passed_products}/${data.expected_products} products`;

  document.getElementById("latest-init").textContent =
    data.latest_initialization_display;

  document.getElementById("product-count").textContent =
    `${data.passed_products} / ${data.expected_products}`;

  document.getElementById("land-count").textContent =
    data.grid.land_cells.toLocaleString();

  const cards = document.getElementById("duration-cards");
  const table = document.getElementById("verification-table");

  for (const [key, duration] of Object.entries(data.durations)) {
    const card = document.createElement("article");
    card.className = "duration-card";

    card.innerHTML = `
      <h3>${key} model</h3>
      <strong>CRPSS ${number(duration.crpss_anncsgd_vs_raw)}</strong>
      <p>
        ANN-CSGD CRPS: ${number(duration.mean_crps_anncsgd, 3)} mm<br>
        Raw HRRR CRPS: ${number(duration.mean_crps_raw_hrrr, 3)} mm<br>
        ${duration.threshold_count} verified thresholds
      </p>
    `;

    cards.appendChild(card);

    for (const threshold of duration.thresholds) {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${duration.duration_hours} h</td>
        <td>${threshold.label}</td>
        <td>${threshold.events_2025.toLocaleString()}</td>
        <td>${number(threshold.bss_anncsgd)}</td>
        <td>${number(threshold.bss_raw_hrrr)}</td>
        <td>${number(threshold.auc_anncsgd)}</td>
        <td>${number(threshold.auc_raw_hrrr)}</td>
      `;

      table.appendChild(row);
    }
  }
}

loadSite().catch((error) => {
  console.error(error);

  const badge = document.getElementById("status-badge");
  badge.className = "status loading";
  badge.textContent = "Production summary could not be loaded.";
});
