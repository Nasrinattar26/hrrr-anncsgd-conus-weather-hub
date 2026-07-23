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


  document.getElementById("land-count").textContent =
    data.grid.land_cells.toLocaleString();


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
  const products = [
    ...currentDuration().products
  ].sort((left, right) => {
    const orderDifference = (
      forecastProductOrder(
        left.variable,
        left.label
      )
      - forecastProductOrder(
        right.variable,
        right.label
      )
    );

    if (orderDifference !== 0) {
      return orderDifference;
    }

    return forecastProductLabel(
      left.variable,
      left.label
    ).localeCompare(
      forecastProductLabel(
        right.variable,
        right.label
      )
    );
  });

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
    option.textContent = forecastProductLabel(
      product.variable,
      product.label
    );
    option.selected =
      product.variable === mapState.productVariable;

    select.appendChild(option);
  }
}

function renderForecastMap() {
  const duration = currentDuration();
  const window = currentWindow();
  const product = currentProduct();
  const productLabel = forecastProductLabel(
    product.variable,
    product.label
  );

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
    `${productLabel}, ${duration.duration_hours}-hour ` +
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
    `${productLabel} · ${duration.duration_hours}-hour product`;

  document.getElementById("forecast-map-validity").textContent =
    `Window ${window.label} · initialization ${mapCatalog.init}`;

  document.getElementById("map-selection-summary").textContent =
    `${duration.duration_hours} h · ${window.label} · ${productLabel}`;

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

function forecastProductLabel(
  variableName,
  fallbackLabel = ""
) {
  const normalized = String(
    variableName || ""
  ).trim().toLowerCase();

  const labels = {
    expected_precip_mm:
      "Expected precipitation",

    prob_gt_0p25in_percent:
      "Probability > 0.25 inch",
    prob_gt_0p25inch_percent:
      "Probability > 0.25 inch",

    prob_gt_0p5in_percent:
      "Probability > 0.5 inch",
    prob_gt_0p5inch_percent:
      "Probability > 0.5 inch",

    prob_gt_1in_percent:
      "Probability > 1 inch",
    prob_gt_1inch_percent:
      "Probability > 1 inch",

    prob_gt_2in_percent:
      "Probability > 2 inches",
    prob_gt_2inch_percent:
      "Probability > 2 inches",

    prob_gt_3in_percent:
      "Probability > 3 inches",
    prob_gt_3inch_percent:
      "Probability > 3 inches",

    prob_gt_5in_percent:
      "Probability > 5 inches",
    prob_gt_5inch_percent:
      "Probability > 5 inches",

    prob_gt_2yr6h_ari_percent:
      "Probability > local 2-year ARI",
    prob_gt_2yr12h_ari_percent:
      "Probability > local 2-year ARI",
    prob_gt_2yr24h_ari_percent:
      "Probability > local 2-year ARI",

    prob_gt_5yr6h_ari_percent:
      "Probability > local 5-year ARI",
    prob_gt_5yr12h_ari_percent:
      "Probability > local 5-year ARI",
    prob_gt_5yr24h_ari_percent:
      "Probability > local 5-year ARI",

    anncsgd_wpc_ero_comparison:
      "ANN-CSGD / WPC ERO Comparison",
    wpc_ero_comparison:
      "ANN-CSGD / WPC ERO Comparison"
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  if (
    typeof fallbackLabel === "string"
    && fallbackLabel.trim() !== ""
  ) {
    return fallbackLabel.trim();
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

function mediaProductLabel(variableName) {
  return forecastProductLabel(variableName);
}

function forecastProductOrder(
  variableName,
  fallbackLabel = ""
) {
  const label = forecastProductLabel(
    variableName,
    fallbackLabel
  );

  const preferredOrder = [
    "Expected precipitation",
    "Probability > 0.25 inch",
    "Probability > 0.5 inch",
    "Probability > 1 inch",
    "Probability > 2 inches",
    "Probability > 3 inches",
    "Probability > 5 inches",
    "Probability > local 2-year ARI",
    "Probability > local 5-year ARI",
    "ANN-CSGD / WPC ERO Comparison"
  ];

  const index = preferredOrder.indexOf(label);

  return index >= 0
    ? index
    : preferredOrder.length;
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
  ).sort((left, right) => {
    const orderDifference = (
      forecastProductOrder(left)
      - forecastProductOrder(right)
    );

    if (orderDifference !== 0) {
      return orderDifference;
    }

    return mediaProductLabel(left).localeCompare(
      mediaProductLabel(right)
    );
  });

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
  // BEGIN COMPACT GRIB2 DOWNLOADER
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
      const count = mediaFiniteNumber(
        mediaFirstDefined(entry, [
          "message_count",
          "messages",
          "number_of_messages",
          "n_messages"
        ])
      );

      return total + (count === null ? 0 : count);
    },
    0
  );

  const messageCount = (
    reportedMessageCount === null
      ? calculatedMessageCount
      : reportedMessageCount
  );

  catalogStatus.textContent = (
    `${gribEntries.length} GRIB2 files`
    + (
      messageCount > 0
        ? ` containing ${messageCount} forecast fields`
        : ""
    )
    + ` are available for ${
      gribCatalog.__initialization
      || gribCatalog.init
      || "the latest initialization"
    }.`
  );

  if (packageEntry) {
    const rawPackagePath = mediaEntryPath(packageEntry);

    const resolvedPackagePath = mediaResolveProductPath(
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

    packageLink.href = resolvedPackagePath;
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
    packageLink.setAttribute(
      "aria-disabled",
      "true"
    );

    packageSummary.textContent =
      "The complete package was not listed in the manifest.";
  }

  downloadList.replaceChildren();
  downloadList.classList.add(
    "grib-compact-downloader"
  );

  if (gribEntries.length === 0) {
    const emptyMessage = document.createElement("p");

    emptyMessage.className =
      "grib-compact-empty";

    emptyMessage.textContent =
      "No individual GRIB2 files are available.";

    downloadList.append(emptyMessage);
    return;
  }

  function entryWindow(entry) {
    const directWindow = mediaFirstDefined(
      entry,
      [
        "window",
        "forecast_window",
        "lead_window"
      ]
    );

    if (directWindow !== undefined && directWindow !== null) {
      return String(directWindow);
    }

    const pathMatch = String(
      mediaEntryPath(entry)
    ).match(/f\d+_f\d+/i);

    return pathMatch ? pathMatch[0] : "unknown";
  }

  function entryStartHour(entry) {
    const value = mediaFiniteNumber(
      mediaFirstDefined(entry, [
        "start_fhr",
        "lead_start_hour",
        "start_hour"
      ])
    );

    return value === null
      ? Number.MAX_SAFE_INTEGER
      : value;
  }

  const sortedEntries = [...gribEntries].sort(
    (left, right) => {
      const durationDifference = (
        mediaEntryDuration(left)
        - mediaEntryDuration(right)
      );

      if (durationDifference !== 0) {
        return durationDifference;
      }

      return (
        entryStartHour(left)
        - entryStartHour(right)
      );
    }
  );

  const durations = [
    ...new Set(
      sortedEntries
        .map((entry) => mediaEntryDuration(entry))
        .filter((duration) => Number.isFinite(duration))
    )
  ].sort((left, right) => left - right);

  const controls = document.createElement("div");
  controls.className = "grib-compact-controls";

  const durationLabel = document.createElement("label");
  durationLabel.className = "grib-compact-control";

  const durationText = document.createElement("span");
  durationText.textContent = "Accumulation duration";

  const durationSelect = document.createElement("select");
  durationSelect.id = "grib-duration-select";
  durationSelect.setAttribute(
    "aria-label",
    "GRIB2 accumulation duration"
  );

  durationLabel.append(
    durationText,
    durationSelect
  );

  const windowLabel = document.createElement("label");
  windowLabel.className = "grib-compact-control";

  const windowText = document.createElement("span");
  windowText.textContent = "Forecast window";

  const windowSelect = document.createElement("select");
  windowSelect.id = "grib-window-select";
  windowSelect.setAttribute(
    "aria-label",
    "GRIB2 forecast window"
  );

  windowLabel.append(
    windowText,
    windowSelect
  );

  controls.append(
    durationLabel,
    windowLabel
  );

  const selectedFile = document.createElement("article");
  selectedFile.className = "grib-selected-file";

  const selectedHeading = document.createElement("p");
  selectedHeading.className =
    "small-label grib-selected-file__label";
  selectedHeading.textContent = "Selected forecast file";

  const selectedName = document.createElement("strong");
  selectedName.className = "grib-selected-file__name";

  const selectedDetails = document.createElement("p");
  selectedDetails.className =
    "grib-selected-file__details";

  const selectedFields = document.createElement("p");
  selectedFields.className =
    "grib-selected-file__fields";

  const actions = document.createElement("div");
  actions.className = "grib-selected-file__actions";

  const gribLink = document.createElement("a");
  gribLink.className =
    "grib-compact-button grib-compact-button--primary";
  gribLink.textContent = "Download GRIB2";
  gribLink.setAttribute("download", "");

  const metadataLink = document.createElement("a");
  metadataLink.className =
    "grib-compact-button grib-compact-button--secondary";
  metadataLink.textContent = "Open metadata";
  metadataLink.target = "_blank";
  metadataLink.rel = "noopener";

  actions.append(
    gribLink,
    metadataLink
  );

  selectedFile.append(
    selectedHeading,
    selectedName,
    selectedDetails,
    selectedFields,
    actions
  );

  downloadList.append(
    controls,
    selectedFile
  );

  durations.forEach((duration) => {
    const option = document.createElement("option");

    option.value = String(duration);
    option.textContent = `${duration}-hour`;

    durationSelect.append(option);
  });

  durationSelect.value = String(durations[0]);

  function updateSelectedFile() {
    const duration = Number(durationSelect.value);
    const windowValue = windowSelect.value;

    const selectedEntry = sortedEntries.find((entry) => {
      return (
        mediaEntryDuration(entry) === duration
        && entryWindow(entry) === windowValue
      );
    });

    if (!selectedEntry) {
      selectedName.textContent =
        "No matching GRIB2 file";

      selectedDetails.textContent = "";
      selectedFields.textContent = "";

      gribLink.href = "#";
      metadataLink.href = "#";

      gribLink.setAttribute(
        "aria-disabled",
        "true"
      );

      metadataLink.setAttribute(
        "aria-disabled",
        "true"
      );

      return;
    }

    const rawGribPath = mediaEntryPath(selectedEntry);

    const resolvedGribPath = mediaResolveProductPath(
      rawGribPath,
      "grib2",
      gribCatalog
    );

    const rawSidecarPath = gribSidecarPath(
      selectedEntry
    );

    const resolvedSidecarPath = rawSidecarPath
      ? mediaResolveProductPath(
          rawSidecarPath,
          "grib2",
          gribCatalog
        )
      : null;

    const fileBytes = mediaFiniteNumber(
      mediaFirstDefined(selectedEntry, [
        "size_bytes",
        "bytes",
        "file_size_bytes"
      ])
    );

    const entryMessageCount = mediaFiniteNumber(
      mediaFirstDefined(selectedEntry, [
        "message_count",
        "messages",
        "number_of_messages",
        "n_messages"
      ])
    );

    const variables = Array.isArray(
      selectedEntry.variables
    )
      ? selectedEntry.variables
      : [];

    selectedName.textContent =
      mediaBasename(rawGribPath);

    selectedDetails.textContent = [
      `${duration}-hour accumulation`,
      windowValue,
      (
        entryMessageCount === null
          ? null
          : `${entryMessageCount} messages`
      ),
      (
        fileBytes === null
          ? null
          : formatBytes(fileBytes)
      )
    ].filter(Boolean).join(" · ");

    selectedFields.textContent = (
      variables.length > 0
        ? `${variables.length} forecast fields included`
        : "Forecast-field details are available in the metadata."
    );

    gribLink.href = resolvedGribPath;
    gribLink.removeAttribute("aria-disabled");

    if (resolvedSidecarPath) {
      metadataLink.href = resolvedSidecarPath;
      metadataLink.removeAttribute("aria-disabled");
    } else {
      metadataLink.href = "#";
      metadataLink.setAttribute(
        "aria-disabled",
        "true"
      );
    }
  }

  function updateWindows() {
    const duration = Number(durationSelect.value);

    const durationEntries = sortedEntries.filter(
      (entry) => {
        return mediaEntryDuration(entry) === duration;
      }
    );

    windowSelect.replaceChildren();

    durationEntries.forEach((entry) => {
      const option = document.createElement("option");
      const windowValue = entryWindow(entry);

      option.value = windowValue;
      option.textContent = windowValue;

      windowSelect.append(option);
    });

    if (windowSelect.options.length > 0) {
      windowSelect.selectedIndex = 0;
    }

    updateSelectedFile();
  }

  durationSelect.addEventListener(
    "change",
    updateWindows
  );

  windowSelect.addEventListener(
    "change",
    updateSelectedFile
  );

  updateWindows();
  // END COMPACT GRIB2 DOWNLOADER
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

/* BEGIN ACTIVE DASHBOARD NAVIGATION */

function initializeDashboardNavigation() {
  const navigationItems = Array.from(
    document.querySelectorAll(
      '.product-list .product-button[href^="#"]'
    )
  )
    .map((link) => {
      const sectionId = (
        link.getAttribute("href") || ""
      ).replace(/^#/, "");

      return {
        link,
        sectionId,
        section: document.getElementById(sectionId)
      };
    })
    .filter((item) => item.section);

  if (!navigationItems.length) {
    return;
  }

  let selectedSectionId = "";
  let selectionLockUntil = 0;
  let updateScheduled = false;

  function setActiveNavigation(sectionId) {
    selectedSectionId = sectionId;

    navigationItems.forEach((item) => {
      const active = item.sectionId === sectionId;

      item.link.classList.toggle("active", active);

      if (active) {
        item.link.setAttribute(
          "aria-current",
          "location"
        );
      } else {
        item.link.removeAttribute("aria-current");
      }
    });
  }

  function findSectionFromScroll() {
    const activationLine = Math.max(
      130,
      Math.min(window.innerHeight * 0.30, 230)
    );

    let selected = navigationItems[0];

    for (const item of navigationItems) {
      const bounds = item.section.getBoundingClientRect();

      if (bounds.top <= activationLine) {
        selected = item;
      } else {
        break;
      }
    }

    const bottomReached = (
      window.scrollY + window.innerHeight
      >= document.documentElement.scrollHeight - 10
    );

    if (bottomReached) {
      selected = navigationItems[
        navigationItems.length - 1
      ];
    }

    return selected;
  }

  function updateNavigationFromScroll() {
    if (
      selectedSectionId
      && Date.now() < selectionLockUntil
    ) {
      setActiveNavigation(selectedSectionId);
      return;
    }

    const selected = findSectionFromScroll();
    setActiveNavigation(selected.sectionId);
  }

  function scheduleNavigationUpdate() {
    if (updateScheduled) {
      return;
    }

    updateScheduled = true;

    window.requestAnimationFrame(() => {
      updateScheduled = false;
      updateNavigationFromScroll();
    });
  }

  navigationItems.forEach((item) => {
    item.link.addEventListener("click", (event) => {
      event.preventDefault();

      selectionLockUntil = Date.now() + 1400;
      setActiveNavigation(item.sectionId);

      window.history.replaceState(
        null,
        "",
        `#${item.sectionId}`
      );

      item.section.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      window.setTimeout(() => {
        selectionLockUntil = 0;
        updateNavigationFromScroll();
      }, 1450);
    });
  });

  window.addEventListener(
    "scroll",
    scheduleNavigationUpdate,
    { passive: true }
  );

  window.addEventListener(
    "resize",
    scheduleNavigationUpdate
  );

  window.addEventListener("hashchange", () => {
    const sectionId = window.location.hash.slice(1);

    const matchingItem = navigationItems.find(
      (item) => item.sectionId === sectionId
    );

    if (matchingItem) {
      setActiveNavigation(sectionId);
    } else {
      updateNavigationFromScroll();
    }
  });

  const initialSectionId = window.location.hash.slice(1);

  const initialItem = navigationItems.find(
    (item) => item.sectionId === initialSectionId
  );

  if (initialItem) {
    setActiveNavigation(initialItem.sectionId);
  } else {
    updateNavigationFromScroll();
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeDashboardNavigation,
    { once: true }
  );
} else {
  initializeDashboardNavigation();
}

/* END ACTIVE DASHBOARD NAVIGATION */
