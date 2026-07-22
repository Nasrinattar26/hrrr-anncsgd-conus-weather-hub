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

  cards.innerHTML = "";

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

  try {
    await loadOperationalVerification();
  } catch (error) {
    setVerificationError(error);
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


/* BEGIN OPERATIONAL VERIFICATION INTERFACE */

let verificationCatalog = null;
let verificationSummary = null;
let verificationControlsAttached = false;

const verificationState = {
  initialization: "",
  duration: "all",
  windowKey: "all"
};

function verificationElement(elementId) {
  const element = document.getElementById(elementId);

  if (!element) {
    throw new Error(
      `Missing verification interface element #${elementId}`
    );
  }

  return element;
}

function formatVerificationInitialization(value) {
  const text = String(value || "");

  if (!/^\d{10}$/.test(text)) {
    return text || "—";
  }

  return (
    `${text.slice(0, 4)}-${text.slice(4, 6)}-` +
    `${text.slice(6, 8)} ${text.slice(8, 10)}:00 UTC`
  );
}

function formatVerificationTime(value) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replace("T", " ")
    .replace("Z", " UTC");
}

function formatVerificationMetric(value, digits = 3) {
  if (
    value === null
    || value === undefined
    || !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return Number(value).toFixed(digits);
}

function verificationWindowKey(record) {
  return `${record.duration_hours}|${record.window}`;
}

function appendVerificationCell(
  row,
  value,
  className = ""
) {
  const cell = document.createElement("td");
  cell.textContent = value;

  if (className) {
    cell.className = className;
  }

  row.appendChild(cell);
  return cell;
}

function setVerificationCatalogStatus(
  message,
  state = ""
) {
  const status = verificationElement(
    "verification-catalog-status"
  );

  status.className =
    state
      ? `catalog-status ${state}`
      : "catalog-status";

  status.textContent = message;
}

function setVerificationError(error) {
  console.error(
    "Operational verification initialization failed:",
    error
  );

  setVerificationCatalogStatus(
    "Operational verification data could not be loaded.",
    "error"
  );

  const badge = verificationElement(
    "verification-state-badge"
  );

  badge.className =
    "pill verification-state error";

  badge.textContent = "Unavailable";

  const table = verificationElement(
    "verification-table"
  );

  table.replaceChildren();

  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = 9;
  cell.className = "verification-empty";
  cell.textContent =
    "The verification metrics are currently unavailable.";

  row.appendChild(cell);
  table.appendChild(row);

  verificationElement(
    "verification-selection-summary"
  ).textContent =
    "No verification metrics are available.";
}

function currentVerificationRun() {
  if (!verificationCatalog) {
    return null;
  }

  return verificationCatalog.runs.find(
    (run) =>
      run.initialization
      === verificationState.initialization
  ) || null;
}

function populateVerificationRunSelector() {
  const selector = verificationElement(
    "verification-run"
  );

  selector.replaceChildren();

  for (const run of verificationCatalog.runs) {
    const option = document.createElement("option");

    option.value = run.initialization;
    option.textContent =
      `INIT ${formatVerificationInitialization(run.initialization)} · ` +
      `${run.verification_state} · ` +
      `${run.completed_window_count}/${run.forecast_window_count} windows`;

    selector.appendChild(option);
  }

  selector.value = verificationState.initialization;
}

function populateVerificationDurationSelector() {
  const selector = verificationElement(
    "verification-duration"
  );

  const durations = Array.from(
    new Set(
      verificationSummary.windows.map(
        (windowRecord) =>
          Number(windowRecord.duration_hours)
      )
    )
  ).sort(
    (left, right) => left - right
  );

  selector.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All durations";
  selector.appendChild(allOption);

  for (const duration of durations) {
    const option = document.createElement("option");

    option.value = String(duration);
    option.textContent = `${duration}-hour accumulation`;

    selector.appendChild(option);
  }

  if (
    verificationState.duration !== "all"
    && !durations.includes(
      Number(verificationState.duration)
    )
  ) {
    verificationState.duration = "all";
  }

  selector.value = verificationState.duration;
}

function availableVerificationWindows() {
  const seen = new Set();
  const results = [];

  for (const windowRecord of verificationSummary.windows) {
    if (
      verificationState.duration !== "all"
      && Number(windowRecord.duration_hours)
        !== Number(verificationState.duration)
    ) {
      continue;
    }

    const key = verificationWindowKey(windowRecord);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(windowRecord);
  }

  return results;
}

function populateVerificationWindowSelector() {
  const selector = verificationElement(
    "verification-window"
  );

  const windows = availableVerificationWindows();
  const validKeys = new Set(
    windows.map(verificationWindowKey)
  );

  if (
    verificationState.windowKey !== "all"
    && !validKeys.has(
      verificationState.windowKey
    )
  ) {
    verificationState.windowKey = "all";
  }

  selector.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All verified windows";
  selector.appendChild(allOption);

  for (const windowRecord of windows) {
    const option = document.createElement("option");

    option.value = verificationWindowKey(
      windowRecord
    );

    option.textContent =
      `${windowRecord.duration_hours} h · ` +
      `${windowRecord.window} · valid ` +
      `${formatVerificationTime(windowRecord.valid_time)}`;

    selector.appendChild(option);
  }

  selector.value = verificationState.windowKey;
}

function updateVerificationSummaryCards() {
  const run = currentVerificationRun();

  if (!run) {
    throw new Error(
      "Selected verification run is missing from the catalog."
    );
  }

  const stateText = run.verification_state;
  const stateClass = stateText.toLowerCase();

  const badge = verificationElement(
    "verification-state-badge"
  );

  badge.className =
    `pill verification-state ${stateClass}`;

  badge.textContent = stateText;

  verificationElement(
    "verification-run-state"
  ).textContent =
    `${stateText} operational run`;

  verificationElement(
    "verification-window-progress"
  ).textContent =
    `${run.completed_window_count} / ${run.forecast_window_count}`;

  verificationElement(
    "verification-pending-count"
  ).textContent =
    String(run.pending_window_count);

  verificationElement(
    "verification-latest-valid"
  ).textContent =
    formatVerificationTime(
      run.latest_valid_time
    );

  const download = verificationElement(
    "verification-csv-download"
  );

  download.href =
    `./data/verification/${run.csv_url}`;

  download.download =
    `hrrr_anncsgd_verification_${run.initialization}.csv`;
}

function renderVerificationMetrics() {
  const table = verificationElement(
    "verification-table"
  );

  const selectedRows = verificationSummary.metrics.filter(
    (metric) => {
      if (
        verificationState.duration !== "all"
        && Number(metric.duration_hours)
          !== Number(verificationState.duration)
      ) {
        return false;
      }

      if (
        verificationState.windowKey !== "all"
        && verificationWindowKey(metric)
          !== verificationState.windowKey
      ) {
        return false;
      }

      return true;
    }
  );

  table.replaceChildren();

  if (!selectedRows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 9;
    cell.className = "verification-empty";
    cell.textContent =
      "No metric rows match the selected filters.";

    row.appendChild(cell);
    table.appendChild(row);
  } else {
    for (const metric of selectedRows) {
      const row = document.createElement("tr");

      appendVerificationCell(
        row,
        formatVerificationTime(metric.valid_time)
      );

      appendVerificationCell(
        row,
        `${metric.duration_hours} h`
      );

      appendVerificationCell(
        row,
        metric.window
      );

      appendVerificationCell(
        row,
        metric.display_label
      );

      appendVerificationCell(
        row,
        Number(metric.n_events).toLocaleString()
      );

      appendVerificationCell(
        row,
        formatVerificationMetric(metric.POD)
      );

      appendVerificationCell(
        row,
        formatVerificationMetric(metric.FAR)
      );

      appendVerificationCell(
        row,
        formatVerificationMetric(metric.CSI)
      );

      const bssCell = appendVerificationCell(
        row,
        formatVerificationMetric(
          metric.brier_skill_score
        )
      );

      if (
        metric.brier_skill_score !== null
        && Number(metric.brier_skill_score) < 0
      ) {
        bssCell.classList.add(
          "verification-metric-negative"
        );
      } else if (
        metric.brier_skill_score !== null
      ) {
        bssCell.classList.add(
          "verification-metric-positive"
        );
      }

      table.appendChild(row);
    }
  }

  verificationElement(
    "verification-selection-summary"
  ).textContent =
    `${selectedRows.length} threshold rows shown · ` +
    `INIT ${formatVerificationInitialization(
      verificationState.initialization
    )}`;
}

async function selectVerificationRun(
  initialization
) {
  const run = verificationCatalog.runs.find(
    (candidate) =>
      candidate.initialization === initialization
  );

  if (!run) {
    throw new Error(
      `Unknown verification initialization: ${initialization}`
    );
  }

  verificationState.initialization =
    initialization;

  verificationState.duration = "all";
  verificationState.windowKey = "all";

  verificationElement(
    "verification-run"
  ).value = initialization;

  setVerificationCatalogStatus(
    `Loading verification run ${initialization}…`
  );

  verificationSummary = await fetchJsonCatalog(
    `./data/verification/${run.summary_url}`
  );

  if (
    verificationSummary.initialization
    !== initialization
  ) {
    throw new Error(
      "Verification summary initialization does not match "
      + "the selected catalog run."
    );
  }

  if (
    !Array.isArray(verificationSummary.windows)
    || !Array.isArray(verificationSummary.metrics)
  ) {
    throw new Error(
      "Verification summary is missing windows or metrics."
    );
  }

  populateVerificationDurationSelector();
  populateVerificationWindowSelector();
  updateVerificationSummaryCards();
  renderVerificationMetrics();

  setVerificationCatalogStatus(
    `${run.verification_state} verification · ` +
    `${run.completed_window_count} of ` +
    `${run.forecast_window_count} windows verified · ` +
    `${run.pending_window_count} pending`,
    "ready"
  );
}

function attachVerificationListeners() {
  if (verificationControlsAttached) {
    return;
  }

  verificationElement(
    "verification-run"
  ).addEventListener(
    "change",
    (event) => {
      selectVerificationRun(
        event.target.value
      ).catch(setVerificationError);
    }
  );

  verificationElement(
    "verification-duration"
  ).addEventListener(
    "change",
    (event) => {
      verificationState.duration =
        event.target.value;

      verificationState.windowKey = "all";

      populateVerificationWindowSelector();
      renderVerificationMetrics();
    }
  );

  verificationElement(
    "verification-window"
  ).addEventListener(
    "change",
    (event) => {
      verificationState.windowKey =
        event.target.value;

      renderVerificationMetrics();
    }
  );

  verificationControlsAttached = true;
}

async function loadOperationalVerification() {
  const requiredIds = [
    "verification-state-badge",
    "verification-catalog-status",
    "verification-run-state",
    "verification-window-progress",
    "verification-pending-count",
    "verification-latest-valid",
    "verification-run",
    "verification-duration",
    "verification-window",
    "verification-selection-summary",
    "verification-csv-download",
    "verification-table"
  ];

  requiredIds.forEach(verificationElement);

  setVerificationCatalogStatus(
    "Loading the operational verification catalog…"
  );

  verificationCatalog = await fetchJsonCatalog(
    "./data/verification/verification_catalog.json"
  );

  if (
    verificationCatalog.status !== "SUCCESS"
    || !Array.isArray(verificationCatalog.runs)
    || !verificationCatalog.runs.length
  ) {
    throw new Error(
      "Verification catalog contains no successful runs."
    );
  }

  if (verificationCatalog.runs.length > 7) {
    throw new Error(
      "Verification catalog exceeds seven retained runs."
    );
  }

  verificationState.initialization =
    verificationCatalog.latest_initialization
    || verificationCatalog.runs[0].initialization;

  populateVerificationRunSelector();
  attachVerificationListeners();

  await selectVerificationRun(
    verificationState.initialization
  );
}

/* END OPERATIONAL VERIFICATION INTERFACE */


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
