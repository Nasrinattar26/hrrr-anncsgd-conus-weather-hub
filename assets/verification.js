"use strict";

const MAP_TOP_CATALOG_URL =
  "data/verification/maps/map_catalog.json";

const METRIC_CATALOG_URL =
  "data/verification/verification_catalog.json";

const verificationState = {
  topCatalog: null,
  runCatalog: null,
  metricCatalog: null,
  products: [],
  metadata: null,
};

const verificationElements = {
  initialization: document.getElementById(
    "verification-page-initialization"
  ),
  runState: document.getElementById(
    "verification-page-run-state"
  ),
  windowCount: document.getElementById(
    "verification-page-window-count"
  ),
  latestValid: document.getElementById(
    "verification-page-latest-valid"
  ),
  catalogStatus: document.getElementById(
    "verification-page-catalog-status"
  ),
  run: document.getElementById(
    "verification-page-run"
  ),
  duration: document.getElementById(
    "verification-page-duration"
  ),
  window: document.getElementById(
    "verification-page-window"
  ),
  domain: document.getElementById(
    "verification-page-domain"
  ),
  family: document.getElementById(
    "verification-page-family"
  ),
  thresholdControl: document.getElementById(
    "verification-page-threshold-control"
  ),
  threshold: document.getElementById(
    "verification-page-threshold"
  ),
  selectionSummary: document.getElementById(
    "verification-page-selection-summary"
  ),
  mapTitle: document.getElementById(
    "verification-page-map-title"
  ),
  mapSubtitle: document.getElementById(
    "verification-page-map-subtitle"
  ),
  mapStatus: document.getElementById(
    "verification-page-map-status"
  ),
  mapImage: document.getElementById(
    "verification-page-map-image"
  ),
  fullImage: document.getElementById(
    "verification-page-full-image"
  ),
  metadataLink: document.getElementById(
    "verification-page-metadata-link"
  ),
  metricLabels: [
    document.getElementById(
      "verification-page-metric-1-label"
    ),
    document.getElementById(
      "verification-page-metric-2-label"
    ),
    document.getElementById(
      "verification-page-metric-3-label"
    ),
    document.getElementById(
      "verification-page-metric-4-label"
    ),
  ],
  metricValues: [
    document.getElementById(
      "verification-page-metric-1-value"
    ),
    document.getElementById(
      "verification-page-metric-2-value"
    ),
    document.getElementById(
      "verification-page-metric-3-value"
    ),
    document.getElementById(
      "verification-page-metric-4-value"
    ),
  ],
  metricNote: document.getElementById(
    "verification-page-metric-note"
  ),
  productDetails: document.getElementById(
    "verification-page-product-details"
  ),
};

function requireVerificationElements() {
  const missing = [];

  for (const [key, value] of Object.entries(
    verificationElements
  )) {
    if (Array.isArray(value)) {
      if (value.some((item) => !item)) {
        missing.push(key);
      }
    } else if (!value) {
      missing.push(key);
    }
  }

  if (missing.length) {
    throw new Error(
      `Verification page is missing DOM elements: ${
        missing.join(", ")
      }`
    );
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} while loading ${url}`
    );
  }

  return response.json();
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function formatInitialization(initialization) {
  const value = String(initialization || "");

  if (!/^\d{10}$/.test(value)) {
    return value || "—";
  }

  return (
    `${value.slice(0, 4)}-${value.slice(4, 6)}-` +
    `${value.slice(6, 8)} ${value.slice(8, 10)} UTC`
  );
}

function parseUtcDate(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).endsWith("Z")
    ? String(value)
    : `${String(value)}Z`;

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatUtc(value) {
  const parsed = parseUtcDate(value);

  if (!parsed) {
    return value || "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(parsed);
}

function formatMetric(value, digits = 3) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return Number(value).toFixed(digits);
}

function formatSignedMetric(value, digits = 3) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  const numeric = Number(value);
  const prefix = numeric > 0 ? "+" : "";

  return `${prefix}${numeric.toFixed(digits)}`;
}

function formatBytes(value) {
  const bytes = Number(value);

  if (!Number.isFinite(bytes)) {
    return "—";
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  }

  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function durationLabel(value) {
  return `${Number(value)}-hour`;
}

function domainLabel(value) {
  return value === "texas"
    ? "Texas regional view"
    : "CONUS";
}

function familyLabel(value) {
  return value === "amount_verification"
    ? "Amount verification"
    : "Threshold verification";
}

function setSelectOptions(
  select,
  options,
  preferredValue = null
) {
  const previous = preferredValue ?? select.value;

  select.replaceChildren();

  for (const option of options) {
    const element = document.createElement("option");

    element.value = String(option.value);
    element.textContent = option.label;

    select.appendChild(element);
  }

  const availableValues = options.map(
    (option) => String(option.value)
  );

  if (availableValues.includes(String(previous))) {
    select.value = String(previous);
  }
}

function matchingProducts(filters = {}) {
  return verificationState.products.filter((product) => {
    for (const [key, value] of Object.entries(filters)) {
      if (
        value !== null &&
        value !== undefined &&
        value !== "" &&
        String(product[key]) !== String(value)
      ) {
        return false;
      }
    }

    return true;
  });
}

function selectedFilters() {
  return {
    duration_hours: verificationElements.duration.value,
    window: verificationElements.window.value,
    domain: verificationElements.domain.value,
    product_family: verificationElements.family.value,
    threshold_key:
      verificationElements.family.value ===
      "threshold_verification"
        ? verificationElements.threshold.value
        : "",
  };
}

function populateDurationOptions() {
  const durations = uniqueValues(
    verificationState.products.map(
      (product) => Number(product.duration_hours)
    )
  ).sort((a, b) => a - b);

  const preferred = durations.includes(24)
    ? 24
    : durations[0];

  setSelectOptions(
    verificationElements.duration,
    durations.map((duration) => ({
      value: duration,
      label: durationLabel(duration),
    })),
    verificationElements.duration.value || preferred
  );
}

function populateWindowOptions() {
  const duration =
    verificationElements.duration.value;

  const products = matchingProducts({
    duration_hours: duration,
  });

  const windows = uniqueValues(
    products.map((product) => product.window)
  );

  windows.sort((first, second) => {
    const firstProduct = products.find(
      (product) => product.window === first
    );

    const secondProduct = products.find(
      (product) => product.window === second
    );

    return (
      Number(firstProduct?.lead_start_hour || 0) -
      Number(secondProduct?.lead_start_hour || 0)
    );
  });

  setSelectOptions(
    verificationElements.window,
    windows.map((window) => {
      const product = products.find(
        (item) => item.window === window
      );

      return {
        value: window,
        label:
          `${window} · valid ${formatUtc(
            product?.valid_time
          )}`,
      };
    })
  );
}

function populateDomainOptions() {
  const filters = {
    duration_hours:
      verificationElements.duration.value,
    window: verificationElements.window.value,
  };

  const domains = uniqueValues(
    matchingProducts(filters).map(
      (product) => product.domain
    )
  );

  domains.sort((first, second) => {
    if (first === "conus") {
      return -1;
    }

    if (second === "conus") {
      return 1;
    }

    return first.localeCompare(second);
  });

  setSelectOptions(
    verificationElements.domain,
    domains.map((domain) => ({
      value: domain,
      label: domainLabel(domain),
    })),
    verificationElements.domain.value || "conus"
  );
}

function populateFamilyOptions() {
  const filters = {
    duration_hours:
      verificationElements.duration.value,
    window: verificationElements.window.value,
    domain: verificationElements.domain.value,
  };

  const families = uniqueValues(
    matchingProducts(filters).map(
      (product) => product.product_family
    )
  );

  const ordered = [
    "threshold_verification",
    "amount_verification",
  ].filter((family) => families.includes(family));

  setSelectOptions(
    verificationElements.family,
    ordered.map((family) => ({
      value: family,
      label: familyLabel(family),
    })),
    verificationElements.family.value ||
      (
        ordered.includes("threshold_verification")
          ? "threshold_verification"
          : ordered[0]
      )
  );
}

function populateThresholdOptions() {
  const isThreshold =
    verificationElements.family.value ===
    "threshold_verification";

  verificationElements.thresholdControl.hidden =
    !isThreshold;

  verificationElements.threshold.disabled =
    !isThreshold;

  if (!isThreshold) {
    setSelectOptions(
      verificationElements.threshold,
      [
        {
          value: "",
          label: "Not applicable",
        },
      ],
      ""
    );

    return;
  }

  const filters = {
    duration_hours:
      verificationElements.duration.value,
    window: verificationElements.window.value,
    domain: verificationElements.domain.value,
    product_family: "threshold_verification",
  };

  const products = matchingProducts(filters);

  products.sort((first, second) => {
    const firstType =
      first.threshold_type === "fixed" ? 0 : 1;

    const secondType =
      second.threshold_type === "fixed" ? 0 : 1;

    if (firstType !== secondType) {
      return firstType - secondType;
    }

    return String(first.threshold_label).localeCompare(
      String(second.threshold_label),
      undefined,
      {
        numeric: true,
      }
    );
  });

  const options = products.map((product) => ({
    value: product.threshold_key,
    label: product.threshold_label,
  }));

  const preferred =
    options.some((option) => option.value === "1inch")
      ? "1inch"
      : options[0]?.value;

  setSelectOptions(
    verificationElements.threshold,
    options,
    verificationElements.threshold.value || preferred
  );
}

function refreshDependentControls() {
  populateWindowOptions();
  populateDomainOptions();
  populateFamilyOptions();
  populateThresholdOptions();
}

function selectedProduct() {
  const filters = selectedFilters();

  const matches = matchingProducts(filters);

  if (matches.length !== 1) {
    throw new Error(
      `Expected one selected map product; found ${
        matches.length
      }.`
    );
  }

  return matches[0];
}

function setLinkState(element, url) {
  if (url) {
    element.href = url;
    element.removeAttribute("aria-disabled");
    element.classList.remove(
      "verification-page-button--disabled"
    );
  } else {
    element.href = "#";
    element.setAttribute("aria-disabled", "true");
    element.classList.add(
      "verification-page-button--disabled"
    );
  }
}

function setMetricCards(labels, values) {
  labels.forEach((label, index) => {
    verificationElements.metricLabels[
      index
    ].textContent = label;

    verificationElements.metricValues[
      index
    ].textContent = values[index];
  });
}

function detailRow(term, value) {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");

  dt.textContent = term;
  dd.textContent = value ?? "—";

  wrapper.append(dt, dd);

  return wrapper;
}

function renderProductDetails(product, metadata) {
  const details = verificationElements.productDetails;

  details.replaceChildren();

  const rows = [
    [
      "Initialization",
      formatInitialization(product.initialization),
    ],
    [
      "Duration",
      durationLabel(product.duration_hours),
    ],
    [
      "Forecast window",
      product.window,
    ],
    [
      "Valid time",
      formatUtc(product.valid_time),
    ],
    [
      "Domain",
      domainLabel(product.domain),
    ],
    [
      "Product family",
      familyLabel(product.product_family),
    ],
    [
      "Threshold",
      product.threshold_label || "Not applicable",
    ],
    [
      "Image dimensions",
      (
        `${metadata.webp_width || product.webp_width} × ` +
        `${metadata.webp_height || product.webp_height}`
      ),
    ],
    [
      "Image size",
      formatBytes(
        metadata.webp_bytes || product.webp_bytes
      ),
    ],
  ];

  if (
    metadata.threshold_type === "ari" &&
    metadata.threshold_field_statistics
  ) {
    rows.push([
      "ARI threshold range",
      (
        `${formatMetric(
          metadata.threshold_field_statistics.minimum,
          2
        )}–${formatMetric(
          metadata.threshold_field_statistics.maximum,
          2
        )} mm`
      ),
    ]);
  }

  for (const [term, value] of rows) {
    details.appendChild(
      detailRow(term, value)
    );
  }
}

function renderMetricCards(product, metadata) {
  if (
    product.product_family ===
    "threshold_verification"
  ) {
    const metrics =
      metadata.validated_metrics || {};

    setMetricCards(
      ["BSS", "POD", "FAR", "CSI"],
      [
        formatMetric(metrics.brier_skill_score),
        formatMetric(metrics.POD),
        formatMetric(metrics.FAR),
        formatMetric(metrics.CSI),
      ]
    );

    verificationElements.metricNote.textContent =
      (
        "BSS uses monthly historical MRMS event-frequency " +
        "climatology. POD, FAR, and CSI use ANN-CSGD " +
        "expected precipitation ≥ threshold; no probability " +
        "cutoff is used."
      );

    return;
  }

  const metrics =
    metadata.summary_metrics || {};

  setMetricCards(
    [
      "Raw HRRR MAE",
      "ANN-CSGD MAE",
      "MAE improvement",
      "Improvement",
    ],
    [
      (
        `${formatMetric(
          metrics.raw_hrrr_mae_mm
        )} mm`
      ),
      (
        `${formatMetric(
          metrics.ann_csgd_mae_mm
        )} mm`
      ),
      (
        `${formatSignedMetric(
          metrics.mae_improvement_mm
        )} mm`
      ),
      (
        `${formatSignedMetric(
          metrics.mae_improvement_percent,
          1
        )}%`
      ),
    ]
  );

  verificationElements.metricNote.textContent =
    (
      metadata.performance_label ||
      "Positive MAE improvement means ANN-CSGD was closer to MRMS."
    );
}

function updateSelectionSummary(product) {
  const thresholdText =
    product.product_family ===
    "threshold_verification"
      ? ` · ${product.threshold_label}`
      : "";

  verificationElements.selectionSummary.textContent =
    (
      `${formatInitialization(product.initialization)} · ` +
      `${durationLabel(product.duration_hours)} · ` +
      `${product.window} · ` +
      `${domainLabel(product.domain)} · ` +
      `${familyLabel(product.product_family)}` +
      thresholdText
    );
}

async function renderSelectedProduct() {
  let product;

  try {
    product = selectedProduct();
  } catch (error) {
    verificationElements.mapStatus.textContent =
      error.message;

    verificationElements.mapStatus.dataset.state =
      "error";

    verificationElements.mapImage.hidden = true;

    return;
  }

  updateSelectionSummary(product);

  verificationElements.mapTitle.textContent =
    (
      product.product_family ===
      "amount_verification"
        ? (
            `${durationLabel(
              product.duration_hours
            )} Amount Verification`
          )
        : (
            `${durationLabel(
              product.duration_hours
            )} ${product.threshold_label}`
          )
    );

  verificationElements.mapSubtitle.textContent =
    (
      `Initialization ${formatInitialization(
        product.initialization
      )} · ${product.window} · ` +
      `valid ${formatUtc(product.valid_time)} · ` +
      `${domainLabel(product.domain)}`
    );

  verificationElements.mapStatus.textContent =
    "Loading selected verification map…";

  verificationElements.mapStatus.dataset.state =
    "loading";

  verificationElements.mapImage.hidden = true;

  setLinkState(
    verificationElements.fullImage,
    product.image_url
  );

  setLinkState(
    verificationElements.metadataLink,
    product.metadata_url
  );

  try {
    const metadata = await fetchJson(
      product.metadata_url
    );

    verificationState.metadata = metadata;

    renderMetricCards(product, metadata);
    renderProductDetails(product, metadata);

    verificationElements.mapImage.onload = () => {
      verificationElements.mapStatus.textContent =
        "Verification map loaded.";

      verificationElements.mapStatus.dataset.state =
        "success";

      verificationElements.mapImage.hidden = false;
    };

    verificationElements.mapImage.onerror = () => {
      verificationElements.mapStatus.textContent =
        "The selected verification image could not be loaded.";

      verificationElements.mapStatus.dataset.state =
        "error";

      verificationElements.mapImage.hidden = true;
    };

    verificationElements.mapImage.alt =
      (
        `${familyLabel(product.product_family)} for ` +
        `${durationLabel(product.duration_hours)}, ` +
        `${product.window}, ${domainLabel(product.domain)}` +
        (
          product.threshold_label
            ? `, ${product.threshold_label}`
            : ""
        )
      );

    verificationElements.mapImage.src =
      product.image_url;
  } catch (error) {
    verificationElements.mapStatus.textContent =
      `Could not load selected metadata: ${error.message}`;

    verificationElements.mapStatus.dataset.state =
      "error";

    verificationElements.mapImage.hidden = true;
  }
}

function updateRunStatus(initialization) {
  const metricRun =
    verificationState.metricCatalog?.runs?.find(
      (run) =>
        String(run.initialization) ===
        String(initialization)
    );

  verificationElements.initialization.textContent =
    formatInitialization(initialization);

  if (!metricRun) {
    verificationElements.runState.textContent =
      "Map products available";

    verificationElements.windowCount.textContent =
      "—";

    verificationElements.latestValid.textContent =
      "—";

    return;
  }

  verificationElements.runState.textContent =
    metricRun.verification_state || "—";

  verificationElements.windowCount.textContent =
    (
      `${metricRun.completed_window_count ?? "—"} / ` +
      `${
        (
          Number(metricRun.completed_window_count || 0) +
          Number(metricRun.pending_window_count || 0)
        ) || "—"
      }`
    );

  verificationElements.latestValid.textContent =
    formatUtc(metricRun.latest_valid_time);
}

async function loadSelectedRunCatalog() {
  const initialization =
    verificationElements.run.value;

  const runRecord =
    verificationState.topCatalog.runs.find(
      (run) =>
        String(run.initialization) ===
        String(initialization)
    );

  if (!runRecord) {
    throw new Error(
      `No map catalog is registered for ${initialization}.`
    );
  }

  verificationElements.catalogStatus.textContent =
    "Loading selected run…";

  verificationElements.catalogStatus.dataset.state =
    "loading";

  verificationState.runCatalog = await fetchJson(
    runRecord.catalog_url
  );

  if (
    verificationState.runCatalog.status !==
    "SUCCESS"
  ) {
    throw new Error(
      "The selected run catalog is not marked SUCCESS."
    );
  }

  verificationState.products =
    verificationState.runCatalog.products || [];

  if (!verificationState.products.length) {
    throw new Error(
      "The selected run catalog contains no map products."
    );
  }

  populateDurationOptions();
  refreshDependentControls();
  updateRunStatus(initialization);

  verificationElements.catalogStatus.textContent =
    (
      `${verificationState.products.length} maps available`
    );

  verificationElements.catalogStatus.dataset.state =
    "success";

  await renderSelectedProduct();
}

async function initializeVerificationPage() {
  requireVerificationElements();

  verificationElements.catalogStatus.textContent =
    "Loading verification catalogs…";

  verificationElements.catalogStatus.dataset.state =
    "loading";

  try {
    const [
      topCatalog,
      metricCatalog,
    ] = await Promise.all([
      fetchJson(MAP_TOP_CATALOG_URL),
      fetchJson(METRIC_CATALOG_URL),
    ]);

    verificationState.topCatalog = topCatalog;
    verificationState.metricCatalog = metricCatalog;

    if (topCatalog.status !== "SUCCESS") {
      throw new Error(
        "The map catalog is not marked SUCCESS."
      );
    }

    const runs = topCatalog.runs || [];

    if (!runs.length) {
      throw new Error(
        "The map catalog contains no retained runs."
      );
    }

    setSelectOptions(
      verificationElements.run,
      runs.map((run) => ({
        value: run.initialization,
        label: formatInitialization(
          run.initialization
        ),
      })),
      topCatalog.latest_initialization
    );

    await loadSelectedRunCatalog();
  } catch (error) {
    verificationElements.catalogStatus.textContent =
      "Verification catalog unavailable";

    verificationElements.catalogStatus.dataset.state =
      "error";

    verificationElements.mapStatus.textContent =
      error.message;

    verificationElements.mapStatus.dataset.state =
      "error";

    verificationElements.selectionSummary.textContent =
      "Verification products could not be loaded.";

    console.error(error);
  }
}

verificationElements.run?.addEventListener(
  "change",
  async () => {
    await loadSelectedRunCatalog();
  }
);

verificationElements.duration?.addEventListener(
  "change",
  async () => {
    refreshDependentControls();
    await renderSelectedProduct();
  }
);

verificationElements.window?.addEventListener(
  "change",
  async () => {
    populateDomainOptions();
    populateFamilyOptions();
    populateThresholdOptions();
    await renderSelectedProduct();
  }
);

verificationElements.domain?.addEventListener(
  "change",
  async () => {
    populateFamilyOptions();
    populateThresholdOptions();
    await renderSelectedProduct();
  }
);

verificationElements.family?.addEventListener(
  "change",
  async () => {
    populateThresholdOptions();
    await renderSelectedProduct();
  }
);

verificationElements.threshold?.addEventListener(
  "change",
  renderSelectedProduct
);

document.addEventListener(
  "DOMContentLoaded",
  initializeVerificationPage
);
