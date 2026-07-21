function number(value, digits = 4) {
  return Number(value).toFixed(digits);
}

function cacheUrl(path, version) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(version)}`;
}

async function fetchJson(path, version = Date.now()) {
  const response = await fetch(
    cacheUrl(path, version),
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(
      `Could not load ${path}: HTTP ${response.status}`
    );
  }

  return response.json();
}

let siteSummary = null;
let mapCatalog = null;

const mapState = {
  durationKey: "12h",
  windowIndex: 0,
  productVariable: "expected_precip_mm"
};

function loadOverview(data) {
  const badge = document.getElementById("status-badge");

  badge.className =
    data.production_status === "PASS"
      ? "status pass"
      : "status loading";

  badge.textContent =
    `Production audit ${data.production_status.toLowerCase()} · ` +
    `${data.passed_products}/${data.expected_products} products`;

  document.getElementById("latest-init").textContent =
    data.latest_initialization_display;

  document.getElementById("product-count").textContent =
    `${data.passed_products} / ${data.expected_products}`;

  document.getElementById("land-count").textContent =
    data.grid.land_cells.toLocaleString();

  const cards = document.getElementById("duration-cards");
  const table = document.getElementById("verification-table");

  cards.innerHTML = "";
  table.innerHTML = "";

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

function currentDuration() {
  return mapCatalog.durations[mapState.durationKey];
}

function currentWindow() {
  return currentDuration().windows[mapState.windowIndex];
}

function currentProduct() {
  const window = currentWindow();

  return window.products.find(
    product => product.variable === mapState.productVariable
  ) || window.products[0];
}

function populateDurationSelector() {
  const select = document.getElementById("map-duration");
  select.innerHTML = "";

  const durationKeys = Object.keys(mapCatalog.durations).sort(
    (left, right) =>
      mapCatalog.durations[left].duration_hours -
      mapCatalog.durations[right].duration_hours
  );

  for (const key of durationKeys) {
    const duration = mapCatalog.durations[key];
    const option = document.createElement("option");

    option.value = key;
    option.textContent = `${duration.duration_hours}-hour forecasts`;
    option.selected = key === mapState.durationKey;

    select.appendChild(option);
  }
}

function populateWindowSelector() {
  const select = document.getElementById("map-window");
  const windows = currentDuration().windows;

  select.innerHTML = "";

  windows.forEach((window, index) => {
    const option = document.createElement("option");

    option.value = String(index);
    option.textContent =
      `${window.label} · ending f${String(window.end_fhr).padStart(2, "0")}`;

    option.selected = index === mapState.windowIndex;
    select.appendChild(option);
  });
}

function populateProductSelector() {
  const select = document.getElementById("map-product");
  const products = currentDuration().products;

  select.innerHTML = "";

  if (
    !products.some(
      product => product.variable === mapState.productVariable
    )
  ) {
    mapState.productVariable = products[0].variable;
  }

  for (const product of products) {
    const option = document.createElement("option");

    option.value = product.variable;
    option.textContent = product.label;
    option.selected =
      product.variable === mapState.productVariable;

    select.appendChild(option);
  }
}

function renderForecastMap() {
  const duration = currentDuration();
  const window = currentWindow();
  const product = currentProduct();

  mapState.productVariable = product.variable;

  const image = document.getElementById("forecast-map");
  const loading = document.getElementById("forecast-map-loading");
  const fullLink = document.getElementById("forecast-map-full");

  const imagePath = `./${product.path}`;
  const version = `${mapCatalog.init}_${product.size_bytes}`;
  const versionedPath = cacheUrl(imagePath, version);

  loading.hidden = false;
  loading.textContent = "Loading forecast map…";

  image.classList.remove("loaded");
  image.alt =
    `${product.label}, ${duration.duration_hours}-hour ` +
    `forecast window ${window.label}`;

  image.onload = () => {
    loading.hidden = true;
    image.classList.add("loaded");
  };

  image.onerror = () => {
    loading.hidden = false;
    loading.textContent = "The forecast map could not be loaded.";
  };

  image.src = versionedPath;
  fullLink.href = versionedPath;

  document.getElementById("forecast-map-title").textContent =
    `${product.label} · ${duration.duration_hours}-hour product`;

  document.getElementById("forecast-map-validity").textContent =
    `Window ${window.label} · initialization ${mapCatalog.init}`;

  document.getElementById("map-selection-summary").textContent =
    `${duration.duration_hours} h · ${window.label} · ${product.label}`;

  document.getElementById("previous-window").disabled =
    mapState.windowIndex === 0;

  document.getElementById("next-window").disabled =
    mapState.windowIndex === duration.windows.length - 1;
}

function changeDuration(durationKey) {
  mapState.durationKey = durationKey;
  mapState.windowIndex = 0;

  populateWindowSelector();
  populateProductSelector();
  renderForecastMap();
}

function attachMapListeners() {
  document
    .getElementById("map-duration")
    .addEventListener("change", event => {
      changeDuration(event.target.value);
    });

  document
    .getElementById("map-window")
    .addEventListener("change", event => {
      mapState.windowIndex = Number(event.target.value);
      renderForecastMap();
    });

  document
    .getElementById("map-product")
    .addEventListener("change", event => {
      mapState.productVariable = event.target.value;
      renderForecastMap();
    });

  document
    .getElementById("previous-window")
    .addEventListener("click", () => {
      if (mapState.windowIndex > 0) {
        mapState.windowIndex -= 1;
        document.getElementById("map-window").value =
          String(mapState.windowIndex);
        renderForecastMap();
      }
    });

  document
    .getElementById("next-window")
    .addEventListener("click", () => {
      const windows = currentDuration().windows;

      if (mapState.windowIndex < windows.length - 1) {
        mapState.windowIndex += 1;
        document.getElementById("map-window").value =
          String(mapState.windowIndex);
        renderForecastMap();
      }
    });
}

function initializeMapExplorer(catalog) {
  mapCatalog = catalog;

  const catalogBadge =
    document.getElementById("map-catalog-status");

  catalogBadge.textContent =
    `${catalog.n_files} maps · INIT ${catalog.init}`;

  catalogBadge.classList.add("ready");

  if (!catalog.durations[mapState.durationKey]) {
    mapState.durationKey = Object.keys(catalog.durations)[0];
  }

  const initialDuration = currentDuration();

  const preferredWindowIndex =
    initialDuration.windows.findIndex(
      window => window.id === "f00_f12"
    );

  mapState.windowIndex =
    preferredWindowIndex >= 0
      ? preferredWindowIndex
      : 0;

  populateDurationSelector();
  populateWindowSelector();
  populateProductSelector();
  attachMapListeners();
  renderForecastMap();
}

async function loadSite() {
  siteSummary = await fetchJson(
    "./data/site_summary.json",
    "site_summary_v2"
  );

  loadOverview(siteSummary);

  const catalog = await fetchJson(
    "./data/map_catalog.json",
    `${siteSummary.latest_initialization}_maps`
  );

  initializeMapExplorer(catalog);
}

loadSite().catch(error => {
  console.error(error);

  const badge = document.getElementById("status-badge");

  if (badge) {
    badge.className = "status loading";
    badge.textContent =
      "Production summary could not be loaded.";
  }

  const catalogBadge =
    document.getElementById("map-catalog-status");

  if (catalogBadge) {
    catalogBadge.textContent =
      "Map catalog could not be loaded.";
  }

  const loading =
    document.getElementById("forecast-map-loading");

  if (loading) {
    loading.hidden = false;
    loading.textContent =
      "Forecast maps could not be loaded.";
  }
});
