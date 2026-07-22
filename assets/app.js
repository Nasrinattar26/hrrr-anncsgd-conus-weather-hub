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

let gifCatalog = null;
let gribCatalog = null;

const gifState = {
  durationHours: 12,
  productVariable: "expected_precip_mm"
};

function formatBytes(bytes) {
  const numericBytes = mediaFiniteNumber(bytes);

  if (numericBytes === null || numericBytes < 0) {
    return "Size unavailable";
  }

  if (numericBytes === 0) {
    return "0 bytes";
  }

  const units = ["bytes", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(numericBytes) / Math.log(1024)),
    units.length - 1
  );

  const value = numericBytes / (1024 ** unitIndex);
  const precision = (
    unitIndex === 0 || value >= 100
      ? 0
      : value >= 10
        ? 1
        : 2
  );

  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function mediaFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function mediaFirstDefined(object, keys) {
  if (!object || typeof object !== "object") {
    return null;
  }

  for (const key of keys) {
    const value = object[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function mediaEntryPath(entry) {
  if (typeof entry === "string") {
    return entry;
  }

  return mediaFirstDefined(entry, [
    "path",
    "relative_path",
    "repo_path",
    "file_path",
    "gif_path",
    "grib2_path",
    "package_path",
    "download_path",
    "href",
    "url",
    "file",
    "filename",
    "name"
  ]);
}

function mediaPathHasExtension(candidate, extensions) {
  if (typeof candidate !== "string") {
    return false;
  }

  const cleanPath = candidate
    .split("?")[0]
    .split("#")[0]
    .toLowerCase();

  return extensions.some(
    (extension) => cleanPath.endsWith(extension)
  );
}

function mediaCollectEntries(root, extensions) {
  const results = [];
  const seenPaths = new Set();

  function addEntry(entry, trail) {
    const candidatePath = mediaEntryPath(entry);

    if (
      typeof candidatePath !== "string"
      || !mediaPathHasExtension(candidatePath, extensions)
      || seenPaths.has(candidatePath)
    ) {
      return;
    }

    seenPaths.add(candidatePath);

    if (typeof entry === "string") {
      results.push({
        path: entry,
        __manifestTrail: trail.join("/")
      });
    } else {
      results.push(
        Object.assign({}, entry, {
          __manifestTrail: trail.join("/")
        })
      );
    }
  }

  function visit(value, trail) {
    if (typeof value === "string") {
      addEntry(value, trail);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, trail.concat(String(index)));
      });
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    addEntry(value, trail);

    Object.entries(value).forEach(([key, child]) => {
      if (child && typeof child === "object") {
        visit(child, trail.concat(key));
      } else if (typeof child === "string") {
        visit(child, trail.concat(key));
      }
    });
  }

  visit(root, []);
  return results;
}

function mediaExtractInitialization(source) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const directValue = mediaFirstDefined(source, [
    "initialization",
    "initialization_time",
    "initialization_cycle",
    "init",
    "run",
    "run_id",
    "latest_initialization",
    "current_initialization"
  ]);

  if (
    typeof directValue === "string"
    || typeof directValue === "number"
  ) {
    const match = String(directValue).match(/\b20\d{8}\b/);

    if (match) {
      return match[0];
    }
  }

  const nestedCandidates = [
    source.latest_run,
    source.current_run,
    source.run_metadata,
    source.metadata,
    source.summary
  ];

  for (const candidate of nestedCandidates) {
    const nestedValue = mediaExtractInitialization(candidate);

    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

function mediaResolveInitialization(sources) {
  for (const source of sources) {
    const explicitValue = mediaExtractInitialization(source);

    if (explicitValue) {
      return explicitValue;
    }
  }

  const serialized = JSON.stringify(sources);
  const matches = serialized.match(/\b20\d{8}\b/g) || [];

  if (matches.length === 0) {
    return null;
  }

  return Array.from(new Set(matches)).sort().reverse()[0];
}

function mediaAttachCatalogContext(
  catalog,
  initialization,
  productType
) {
  if (!catalog || typeof catalog !== "object") {
    return catalog;
  }

  Object.defineProperties(catalog, {
    __initialization: {
      value: initialization,
      enumerable: false,
      configurable: true
    },
    __productType: {
      value: productType,
      enumerable: false,
      configurable: true
    }
  });

  return catalog;
}

function mediaResolveProductPath(
  candidate,
  productType,
  catalog
) {
  if (typeof candidate !== "string" || candidate.trim() === "") {
    return "#";
  }

  let cleanPath = candidate.trim().replace(/\\/g, "/");

  if (
    cleanPath.startsWith("http://")
    || cleanPath.startsWith("https://")
    || cleanPath.startsWith("/")
    || cleanPath.startsWith("data:")
  ) {
    const repositoryMarker =
      "/hrrr-anncsgd-conus-weather-hub/";

    if (cleanPath.includes(repositoryMarker)) {
      cleanPath = cleanPath.split(repositoryMarker, 2)[1];
      return `./${cleanPath}`;
    }

    return cleanPath;
  }

  cleanPath = cleanPath.replace(/^\.?\//, "");

  if (cleanPath.startsWith("products/")) {
    return `./${cleanPath}`;
  }

  const initialization = (
    catalog
    && catalog.__initialization
      ? catalog.__initialization
      : mediaResolveInitialization([catalog])
  );

  if (!initialization) {
    return `./${cleanPath}`;
  }

  if (cleanPath.startsWith(`${initialization}/`)) {
    return `./products/${productType}/${cleanPath}`;
  }

  return (
    `./products/${productType}/`
    + `${initialization}/${cleanPath}`
  );
}

function mediaBasename(pathValue) {
  if (typeof pathValue !== "string") {
    return "Download";
  }

  return (
    pathValue.replace(/\\/g, "/").split("/").pop()
    || "Download"
  );
}

function mediaProductLabel(variableName) {
  const labels = {
    expected_precip_mm: "Expected precipitation",
    raw_hrrr_precip_mm: "Raw HRRR precipitation",
    prob_gt_0p5in_percent: "Probability above 0.5 inch",
    prob_gt_1in_percent: "Probability above 1 inch",
    prob_gt_2in_percent: "Probability above 2 inches",
    prob_gt_2yr6h_ari_percent:
      "Probability above 2-year 6-hour ARI",
    prob_gt_5yr6h_ari_percent:
      "Probability above 5-year 6-hour ARI",
    prob_gt_2yr12h_ari_percent:
      "Probability above 2-year 12-hour ARI",
    prob_gt_5yr12h_ari_percent:
      "Probability above 5-year 12-hour ARI",
    prob_gt_2yr24h_ari_percent:
      "Probability above 2-year 24-hour ARI",
    prob_gt_5yr24h_ari_percent:
      "Probability above 5-year 24-hour ARI"
  };

  if (labels[variableName]) {
    return labels[variableName];
  }

  return String(variableName || "Forecast product")
    .replace(/\.(gif|grib2|json)$/i, "")
    .replace(/_/g, " ")
    .replace(/\bmm\b/gi, "mm")
    .replace(/\bari\b/gi, "ARI")
    .replace(/\b\w/g, (character) => {
      return character.toUpperCase();
    });
}

function mediaEntryDuration(entry) {
  const directValue = mediaFirstDefined(entry, [
    "duration_hours",
    "duration",
    "accumulation_hours",
    "accumulation_duration_hours",
    "accumulation_duration",
    "window_hours"
  ]);

  if (directValue !== null) {
    const directMatch = String(directValue).match(/\b(6|12|24)\b/);

    if (directMatch) {
      return Number(directMatch[1]);
    }
  }

  const searchableText = [
    mediaEntryPath(entry),
    entry.__manifestTrail,
    entry.title,
    entry.product,
    entry.variable,
    entry.description
  ].filter(Boolean).join(" ");

  const patterns = [
    /(?:duration|accumulation)[_-]?(6|12|24)(?:h|hr|hour)?/i,
    /(?:^|[/_-])0*(6|12|24)(?:h|hr|hour)(?:[/_.-]|$)/i,
    /\b(6|12|24)[ -]?hour\b/i
  ];

  for (const pattern of patterns) {
    const match = searchableText.match(pattern);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function mediaEntryVariable(entry) {
  const directValue = mediaFirstDefined(entry, [
    "product_variable",
    "variable",
    "variable_name",
    "field",
    "product",
    "product_id",
    "product_key",
    "parameter",
    "short_name"
  ]);

  if (
    typeof directValue === "string"
    && directValue.trim() !== ""
  ) {
    return directValue.trim();
  }

  const searchableText = [
    mediaEntryPath(entry),
    entry.__manifestTrail,
    entry.title,
    entry.description
  ].filter(Boolean).join(" ").toLowerCase();

  const knownVariables = [
    "expected_precip_mm",
    "raw_hrrr_precip_mm",
    "prob_gt_0p5in_percent",
    "prob_gt_1in_percent",
    "prob_gt_2in_percent",
    "prob_gt_2yr6h_ari_percent",
    "prob_gt_5yr6h_ari_percent",
    "prob_gt_2yr12h_ari_percent",
    "prob_gt_5yr12h_ari_percent",
    "prob_gt_2yr24h_ari_percent",
    "prob_gt_5yr24h_ari_percent"
  ];

  for (const variableName of knownVariables) {
    if (searchableText.includes(variableName.toLowerCase())) {
      return variableName;
    }
  }

  return mediaBasename(mediaEntryPath(entry) || "")
    .replace(/\.gif$/i, "")
    .replace(
      /^hrrr_anncsgd_\d{10}_/i,
      ""
    );
}

function gifEntries() {
  return mediaCollectEntries(gifCatalog, [".gif"]);
}

function gifsForDuration(
  durationHours = gifState.durationHours
) {
  const requestedDuration = Number(durationHours);
  const entries = gifEntries();

  return entries.filter((entry) => {
    return mediaEntryDuration(entry) === requestedDuration;
  });
}

function currentGif() {
  const entries = gifsForDuration();

  return (
    entries.find((entry) => {
      return (
        mediaEntryVariable(entry)
        === gifState.productVariable
      );
    })
    || entries[0]
    || null
  );
}

function populateGifDurationSelector() {
  const selector = document.getElementById("gif-duration");

  if (!selector) {
    return;
  }

  const durations = Array.from(
    new Set(
      gifEntries()
        .map((entry) => mediaEntryDuration(entry))
        .filter((duration) => {
          return Number.isFinite(duration);
        })
    )
  ).sort((left, right) => left - right);

  selector.replaceChildren();

  durations.forEach((duration) => {
    const option = document.createElement("option");
    option.value = String(duration);
    option.textContent = `${duration}-hour`;
    selector.append(option);
  });

  if (durations.length === 0) {
    selector.disabled = true;
    return;
  }

  selector.disabled = false;

  if (!durations.includes(Number(gifState.durationHours))) {
    gifState.durationHours = (
      durations.includes(12) ? 12 : durations[0]
    );
  }

  selector.value = String(gifState.durationHours);
}

function populateGifProductSelector() {
  const selector = document.getElementById("gif-product");

  if (!selector) {
    return;
  }

  const variables = Array.from(
    new Set(
      gifsForDuration()
        .map((entry) => mediaEntryVariable(entry))
        .filter(Boolean)
    )
  );

  selector.replaceChildren();

  variables.forEach((variableName) => {
    const option = document.createElement("option");
    option.value = variableName;
    option.textContent = mediaProductLabel(variableName);
    selector.append(option);
  });

  if (variables.length === 0) {
    selector.disabled = true;
    return;
  }

  selector.disabled = false;

  if (!variables.includes(gifState.productVariable)) {
    gifState.productVariable = (
      variables.includes("expected_precip_mm")
        ? "expected_precip_mm"
        : variables[0]
    );
  }

  selector.value = gifState.productVariable;
}

function renderForecastGif() {
  const image = document.getElementById("forecast-gif");
  const loading = document.getElementById(
    "forecast-gif-loading"
  );
  const title = document.getElementById("forecast-gif-title");
  const summary = document.getElementById(
    "forecast-gif-summary"
  );
  const fullLink = document.getElementById(
    "forecast-gif-full"
  );

  if (!image || !loading || !title || !summary || !fullLink) {
    return;
  }

  const entry = currentGif();

  if (!entry) {
    image.hidden = true;
    image.removeAttribute("src");
    loading.hidden = false;
    loading.textContent =
      "No GIF is available for this selection.";
    title.textContent = "Forecast animation";
    summary.textContent =
      "No matching animation was found.";
    fullLink.href = "#";
    fullLink.setAttribute("aria-disabled", "true");
    return;
  }

  const sourcePath = mediaEntryPath(entry);
  const resolvedPath = mediaResolveProductPath(
    sourcePath,
    "gifs",
    gifCatalog
  );

  const duration = (
    mediaEntryDuration(entry)
    || gifState.durationHours
  );

  const variableName = mediaEntryVariable(entry);

  const frameCount = mediaFiniteNumber(
    mediaFirstDefined(entry, [
      "frame_count",
      "frames",
      "number_of_frames",
      "n_frames"
    ])
  );

  image.hidden = true;
  loading.hidden = false;
  loading.textContent = "Loading forecast animation…";

  title.textContent = (
    `${duration}-hour ${mediaProductLabel(variableName)}`
  );

  summary.textContent = (
    frameCount !== null
      ? `${frameCount} forecast frames.`
      : "Animated forecast sequence."
  );

  fullLink.href = resolvedPath;
  fullLink.removeAttribute("aria-disabled");

  image.onload = () => {
    loading.hidden = true;
    image.hidden = false;
  };

  image.onerror = () => {
    image.hidden = true;
    loading.hidden = false;
    loading.textContent =
      "The selected animation could not be loaded.";
  };

  image.alt = (
    `${duration}-hour `
    + `${mediaProductLabel(variableName)} animation`
  );

  image.src = resolvedPath;
}

function attachGifListeners() {
  const durationSelector = document.getElementById(
    "gif-duration"
  );

  const productSelector = document.getElementById(
    "gif-product"
  );

  if (
    durationSelector
    && durationSelector.dataset.listenerAttached !== "true"
  ) {
    durationSelector.addEventListener("change", (event) => {
      gifState.durationHours = Number(event.target.value);
      populateGifProductSelector();
      renderForecastGif();
    });

    durationSelector.dataset.listenerAttached = "true";
  }

  if (
    productSelector
    && productSelector.dataset.listenerAttached !== "true"
  ) {
    productSelector.addEventListener("change", (event) => {
      gifState.productVariable = event.target.value;
      renderForecastGif();
    });

    productSelector.dataset.listenerAttached = "true";
  }
}

function initializeGifExplorer(catalog) {
  gifCatalog = catalog;

  const entries = gifEntries();
  const catalogStatus = document.getElementById(
    "gif-catalog-status"
  );

  populateGifDurationSelector();
  populateGifProductSelector();
  attachGifListeners();
  renderForecastGif();

  if (catalogStatus) {
    catalogStatus.textContent = (
      `${entries.length} forecast animations are available `
      + `for ${
        gifCatalog.__initialization
        || "the latest initialization"
      }.`
    );
  }
}

function createDownloadLink(
  href,
  label,
  className = "download-file-link"
) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  link.className = className;
  link.setAttribute("download", "");
  return link;
}

function gribSidecarPath(entry) {
  const explicitPath = mediaFirstDefined(entry, [
    "sidecar_path",
    "metadata_path",
    "metadata_json",
    "json_path",
    "sidecar",
    "metadata_file",
    "json_file"
  ]);

  if (
    typeof explicitPath === "string"
    && explicitPath.trim() !== ""
  ) {
    return explicitPath;
  }

  const gribPath = mediaEntryPath(entry);

  if (typeof gribPath !== "string") {
    return null;
  }

  return gribPath.replace(/\.grib2$/i, ".json");
}

function renderGribDownloads(catalog) {
  gribCatalog = catalog;

  const catalogStatus = document.getElementById(
    "grib-catalog-status"
  );

  const packageLink = document.getElementById(
    "grib-package-download"
  );

  const packageSummary = document.getElementById(
    "grib-package-summary"
  );

  const downloadList = document.getElementById(
    "grib-download-list"
  );

  if (
    !catalogStatus
    || !packageLink
    || !packageSummary
    || !downloadList
  ) {
    return;
  }

  const gribEntries = mediaCollectEntries(
    gribCatalog,
    [".grib2"]
  );

  const packageEntries = mediaCollectEntries(
    gribCatalog,
    [".tar.gz", ".tgz", ".zip"]
  );

  const packageEntry = packageEntries[0] || null;

  const reportedMessageCount = mediaFiniteNumber(
    mediaFirstDefined(gribCatalog, [
      "grib2_message_count",
      "message_count",
      "total_messages",
      "number_of_messages"
    ])
  );

  const calculatedMessageCount = gribEntries.reduce(
    (total, entry) => {
      const entryCount = mediaFiniteNumber(
        mediaFirstDefined(entry, [
          "message_count",
          "messages",
          "number_of_messages",
          "n_messages"
        ])
      );

      return total + (entryCount === null ? 0 : entryCount);
    },
    0
  );

  const messageCount = (
    reportedMessageCount === null
      ? calculatedMessageCount
      : reportedMessageCount
  );

  catalogStatus.textContent = (
    `${gribEntries.length} GRIB2 forecast files`
    + (
      messageCount > 0
        ? ` containing ${messageCount} messages`
        : ""
    )
    + ` are available for ${
      gribCatalog.__initialization
      || "the latest initialization"
    }.`
  );

  if (packageEntry) {
    const rawPackagePath = mediaEntryPath(packageEntry);

    const packagePath = mediaResolveProductPath(
      rawPackagePath,
      "grib2",
      gribCatalog
    );

    const packageBytes = mediaFiniteNumber(
      mediaFirstDefined(packageEntry, [
        "size_bytes",
        "bytes",
        "file_size_bytes",
        "package_size_bytes"
      ])
    );

    packageLink.href = packagePath;
    packageLink.removeAttribute("aria-disabled");
    packageLink.setAttribute("download", "");

    packageSummary.textContent = (
      packageBytes === null
        ? mediaBasename(rawPackagePath)
        : (
          `${mediaBasename(rawPackagePath)} — `
          + `${formatBytes(packageBytes)}`
        )
    );
  } else {
    packageLink.href = "#";
    packageLink.setAttribute("aria-disabled", "true");

    packageSummary.textContent =
      "The complete package was not listed in the manifest.";
  }

  downloadList.replaceChildren();

  [6, 12, 24].forEach((duration) => {
    const durationEntries = gribEntries
      .filter((entry) => {
        return mediaEntryDuration(entry) === duration;
      })
      .sort((left, right) => {
        return String(mediaEntryPath(left)).localeCompare(
          String(mediaEntryPath(right))
        );
      });

    const card = document.createElement("article");
    card.className = "download-card";

    const heading = document.createElement("h3");
    heading.className = "download-card-heading";
    heading.textContent = `${duration}-hour forecast files`;
    card.append(heading);

    if (durationEntries.length === 0) {
      const emptyMessage = document.createElement("p");

      emptyMessage.textContent =
        "No files were listed for this duration.";

      card.append(emptyMessage);
      downloadList.append(card);
      return;
    }

    durationEntries.forEach((entry) => {
      const rawGribPath = mediaEntryPath(entry);

      const resolvedGribPath = mediaResolveProductPath(
        rawGribPath,
        "grib2",
        gribCatalog
      );

      const rawSidecarPath = gribSidecarPath(entry);

      const resolvedSidecarPath = (
        rawSidecarPath
          ? mediaResolveProductPath(
              rawSidecarPath,
              "grib2",
              gribCatalog
            )
          : null
      );

      const row = document.createElement("div");
      row.className = "download-row";

      const details = document.createElement("div");
      details.className = "download-details";

      const filenameElement = document.createElement("strong");
      filenameElement.textContent = mediaBasename(rawGribPath);
      details.append(filenameElement);

      const fileBytes = mediaFiniteNumber(
        mediaFirstDefined(entry, [
          "size_bytes",
          "bytes",
          "file_size_bytes"
        ])
      );

      const entryMessageCount = mediaFiniteNumber(
        mediaFirstDefined(entry, [
          "message_count",
          "messages",
          "number_of_messages",
          "n_messages"
        ])
      );

      const detailParts = [];

      if (entryMessageCount !== null) {
        detailParts.push(`${entryMessageCount} messages`);
      }

      if (fileBytes !== null) {
        detailParts.push(formatBytes(fileBytes));
      }

      if (detailParts.length > 0) {
        const metadata = document.createElement("small");
        metadata.textContent = detailParts.join(" · ");
        details.append(metadata);
      }

      const links = document.createElement("div");
      links.className = "download-links";

      links.append(
        createDownloadLink(resolvedGribPath, "GRIB2")
      );

      if (resolvedSidecarPath) {
        links.append(
          createDownloadLink(
            resolvedSidecarPath,
            "Metadata JSON"
          )
        );
      }

      row.append(details, links);
      card.append(row);
    });

    downloadList.append(card);
  });
}

function setGifCatalogError(error) {
  const status = document.getElementById(
    "gif-catalog-status"
  );

  const loading = document.getElementById(
    "forecast-gif-loading"
  );

  const image = document.getElementById("forecast-gif");

  const summary = document.getElementById(
    "forecast-gif-summary"
  );

  const fullLink = document.getElementById(
    "forecast-gif-full"
  );

  if (status) {
    status.textContent =
      `GIF catalog unavailable: ${error.message}`;
  }

  if (loading) {
    loading.hidden = false;
    loading.textContent =
      "Forecast animations are currently unavailable.";
  }

  if (image) {
    image.hidden = true;
    image.removeAttribute("src");
  }

  if (summary) {
    summary.textContent =
      "The animation manifest could not be loaded.";
  }

  if (fullLink) {
    fullLink.href = "#";
    fullLink.setAttribute("aria-disabled", "true");
  }
}

function setGribCatalogError(error) {
  const status = document.getElementById(
    "grib-catalog-status"
  );

  const packageLink = document.getElementById(
    "grib-package-download"
  );

  const packageSummary = document.getElementById(
    "grib-package-summary"
  );

  const downloadList = document.getElementById(
    "grib-download-list"
  );

  if (status) {
    status.textContent =
      `GRIB2 catalog unavailable: ${error.message}`;
  }

  if (packageLink) {
    packageLink.href = "#";
    packageLink.setAttribute("aria-disabled", "true");
  }

  if (packageSummary) {
    packageSummary.textContent =
      "The GRIB2 manifest could not be loaded.";
  }

  if (downloadList) {
    downloadList.replaceChildren();

    const message = document.createElement("p");
    message.textContent =
      "Individual GRIB2 downloads are currently unavailable.";

    downloadList.append(message);
  }
}

async function fetchJsonCatalog(url) {
  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function loadSite() {
  try {
    await loadCoreSite();
  } catch (error) {
    console.error(
      "Core dashboard initialization failed:",
      error
    );
  }

  let summary;
  let catalog;

  try {
    [summary, catalog] = await Promise.all([
      fetchJsonCatalog("./data/site_summary.json"),
      fetchJsonCatalog("./data/map_catalog.json")
    ]);
  } catch (error) {
    console.error(
      "Could not determine the operational initialization:",
      error
    );

    setGifCatalogError(error);
    setGribCatalogError(error);
    return;
  }

  const initialization = mediaResolveInitialization([
    summary,
    catalog
  ]);

  if (!initialization) {
    const error = new Error(
      "No YYYYMMDDHH initialization was found "
      + "in the site metadata."
    );

    console.error(error);
    setGifCatalogError(error);
    setGribCatalogError(error);
    return;
  }

  const gifManifestUrl =
    `./products/gifs/${initialization}/manifest.json`;

  const gribManifestUrl =
    `./products/grib2/${initialization}/manifest.json`;

  const results = await Promise.allSettled([
    fetchJsonCatalog(gifManifestUrl),
    fetchJsonCatalog(gribManifestUrl)
  ]);

  const gifResult = results[0];
  const gribResult = results[1];

  if (gifResult.status === "fulfilled") {
    const gifs = mediaAttachCatalogContext(
      gifResult.value,
      initialization,
      "gifs"
    );

    initializeGifExplorer(gifs);
  } else {
    console.error(
      "GIF manifest load failed:",
      gifResult.reason
    );

    setGifCatalogError(gifResult.reason);
  }

  if (gribResult.status === "fulfilled") {
    const grib = mediaAttachCatalogContext(
      gribResult.value,
      initialization,
      "grib2"
    );

    renderGribDownloads(grib);
  } else {
    console.error(
      "GRIB2 manifest load failed:",
      gribResult.reason
    );

    setGribCatalogError(gribResult.reason);
  }
}

async function loadCoreSite() {
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
