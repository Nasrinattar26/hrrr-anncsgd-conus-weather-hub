"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    run: document.getElementById("verification-page-run"),
    duration: document.getElementById("verification-page-duration"),
    window: document.getElementById("verification-page-window"),
    domain: document.getElementById("verification-page-domain"),
    family: document.getElementById("verification-page-family"),
    thresholdControl: document.getElementById(
      "verification-page-threshold-control"
    ),
    summary: document.getElementById(
      "verification-page-selection-summary"
    ),
    gallery: document.getElementById(
      "verification-product-gallery"
    ),
    status: document.getElementById(
      "verification-gallery-status"
    ),
    count: document.getElementById(
      "verification-gallery-count"
    ),
  };

  if (
    !elements.run
    || !elements.duration
    || !elements.window
    || !elements.domain
    || !elements.gallery
    || !elements.status
    || !elements.count
  ) {
    return;
  }

  elements.family
    ?.closest("label")
    ?.classList.add("v2-js-contract-control");

  elements.thresholdControl
    ?.classList.add("v2-js-contract-control");

  const cache = new Map();
  let activeRequest = 0;
  let timer = null;
  let retries = 0;

  const escapeHtml = (value) => String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character]
  );

  const number = (
    value,
    digits = 3
  ) => {
    if (
      value === null
      || value === undefined
      || value === ""
      || !Number.isFinite(Number(value))
    ) {
      return "—";
    }

    return Number(value).toFixed(digits);
  };

  const count = (value) => {
    if (!Number.isFinite(Number(value))) {
      return "—";
    }

    return Math.round(
      Number(value)
    ).toLocaleString("en-US");
  };

  const time = (value) => {
    if (!value) {
      return "Unavailable";
    }

    return String(value)
      .replace("T", " ")
      .replace(/:00Z$/, " UTC")
      .replace(/Z$/, " UTC");
  };

  const domainLabel = (value) => {
    const normalized = String(value).toLowerCase();

    if (normalized === "conus") {
      return "CONUS";
    }

    if (normalized === "texas") {
      return "Texas";
    }

    return String(value);
  };

  const title = (product, metadata) => {
    const label = (
      metadata?.threshold_label
      || product.threshold_label
      || product.threshold_key
      || "Threshold"
    );

    const isAri = (
      metadata?.threshold_type === "ari"
      || product.threshold_type === "ari"
      || String(label).toLowerCase().includes("ari")
    );

    if (isAri) {
      return `${label} exceedance`;
    }

    return String(label).replace(
      /^([0-9.]+)\s*inch$/i,
      "$1-inch exceedance"
    );
  };

  const rank = (product) => {
    const key = String(
      product.threshold_key || ""
    ).toLowerCase();

    const order = {
      "0p25inch": 10,
      "0p5inch": 20,
      "1inch": 30,
      "2inch": 40,
      "3inch": 50,
      "5inch": 60,
    };

    if (key in order) {
      return order[key];
    }

    if (key.includes("2yr")) {
      return 100;
    }

    if (key.includes("5yr")) {
      return 110;
    }

    return 999;
  };

  const chip = (
    label,
    value
  ) => `
    <span class="v2-metric-chip">
      <span class="v2-metric-chip__label">
        ${escapeHtml(label)}
      </span>
      <strong class="v2-metric-chip__value">
        ${escapeHtml(value)}
      </strong>
    </span>
  `;

  const metricRow = (
    model,
    modifier,
    values
  ) => `
    <div class="v2-gallery-metric-row ${modifier}">
      <strong class="v2-gallery-metric-model">
        ${escapeHtml(model)}
      </strong>

      <div class="v2-gallery-metric-values">
        ${values.map(
          ([label, value]) => chip(label, value)
        ).join("")}
      </div>
    </div>
  `;

  const card = (
    product,
    metadata
  ) => {
    const metrics = metadata?.validated_metrics || {};
    const events = metadata?.event_counts || {};
    const brier = metadata?.brier_comparison || {};

    const cardTitle = title(
      product,
      metadata
    );

    const validStart = (
      metadata?.valid_start_utc || ""
    );

    const validEnd = (
      metadata?.valid_end_utc
      || product.valid_time
      || ""
    );

    const subtitle = [
      `Init ${product.initialization}`,
      `${product.duration_hours}-hour ${product.window}`,
      domainLabel(product.domain),
      `${time(validStart)} to ${time(validEnd)}`,
    ].join(" · ");

    const cacheToken = String(
      product.webp_sha256 || ""
    ).slice(0, 12);

    const imageUrl = (
      product.image_url
      + (
        cacheToken
          ? `?v=${encodeURIComponent(cacheToken)}`
          : ""
      )
    );

    const productType = (
      metadata?.threshold_type === "ari"
        ? "ARI probability product"
        : "Fixed-threshold probability product"
    );

    const rawMetrics = (
      metadata?.raw_hrrr_metrics || {}
    );

    const annMetrics = (
      metadata?.ann_csgd_metrics
      || metadata?.validated_metrics
      || {}
    );

    const observedEvents = (
      metadata?.event_counts?.observed_events
      ?? rawMetrics.observed_events
      ?? annMetrics.observed_events
    );

    const rawRow = metricRow(
      "Raw HRRR",
      "v2-gallery-metric-row--raw",
      [
        [
          "Obs events",
          count(observedEvents),
        ],
        [
          "BSS",
          number(
            rawMetrics.brier_skill_score,
            3
          ),
        ],
        [
          "POD",
          number(rawMetrics.POD, 3),
        ],
        [
          "FAR",
          number(rawMetrics.FAR, 3),
        ],
        [
          "CSI",
          number(rawMetrics.CSI, 3),
        ],
          [
            "FSS 3×3",
            number(
              rawMetrics.FSS
              ?? rawMetrics.fractions_skill_score?.["3x3"],
              3
            ),
          ],
      ]
    );

    const annRow = metricRow(
      "ANN-CSGD",
      "v2-gallery-metric-row--ann",
      [
        [
          "Obs events",
          count(observedEvents),
        ],
        [
          "BSS",
          number(
            annMetrics.brier_skill_score,
            3
          ),
        ],
        [
          "POD",
          number(annMetrics.POD, 3),
        ],
        [
          "FAR",
          number(annMetrics.FAR, 3),
        ],
        [
          "CSI",
          number(annMetrics.CSI, 3),
        ],
          [
            "FSS 3×3",
            number(
              annMetrics.FSS
              ?? annMetrics.fractions_skill_score?.["3x3"],
              3
            ),
          ],
      ]
    );

    return `
      <article class="v2-gallery-card">
        <header class="v2-gallery-card__header">
          <h3>${escapeHtml(cardTitle)}</h3>

          <p class="v2-gallery-card__subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </header>

        <div class="v2-gallery-card__image">
          <img
            src="${escapeHtml(imageUrl)}"
            alt="${escapeHtml(cardTitle)} verification map"
            loading="lazy"
            decoding="async"
          >
        </div>

        <footer class="v2-gallery-card__footer">
          <span class="v2-gallery-card__type">
            ${escapeHtml(productType)}
          </span>

          <div class="v2-gallery-card__actions">
            <a
              class="v2-button v2-button--blue"
              href="${escapeHtml(product.image_url)}"
              target="_blank"
              rel="noopener"
            >
              Open full image
            </a>

            <a
              class="v2-button v2-button--outline"
              href="${escapeHtml(product.metadata_url)}"
              target="_blank"
              rel="noopener"
            >
              Open metadata
            </a>
          </div>
        </footer>

        <section class="v2-gallery-card__metrics">
          <h4>Metrics for this map</h4>

          ${rawRow}
          ${annRow}

          <p class="v2-gallery-card__metric-note">
            Observed event: MRMS precipitation ≥ the selected
              threshold. POD, FAR, CSI, and FSS use each
              model's single-valued precipitation forecast. FSS
              uses land-aware 3×3 neighborhood event fractions.
              BSS uses exceedance probabilities relative to
              historical MRMS climatology.
          </p>
        </section>
      </article>
    `;
  };

  const loadCatalog = async (run) => {
    if (cache.has(run)) {
      return cache.get(run);
    }

    const url = (
      "data/verification/maps/runs/"
      + `${encodeURIComponent(run)}`
      + "/map_catalog.json"
    );

    const response = await fetch(
      url,
      {cache: "no-store"}
    );

    if (!response.ok) {
      throw new Error(
        `Catalog request failed: ${response.status}`
      );
    }

    const catalog = await response.json();
    cache.set(run, catalog);
    return catalog;
  };

  const selection = () => ({
    run: String(elements.run.value || ""),
    duration: Number.parseInt(
      String(elements.duration.value || ""),
      10
    ),
    window: String(elements.window.value || ""),
    domain: String(elements.domain.value || ""),
  });

  const ready = (value) => (
    /^\d{10}$/.test(value.run)
    && Number.isFinite(value.duration)
    && value.window
    && value.domain
    && !value.window.toLowerCase().includes("loading")
    && !value.domain.toLowerCase().includes("loading")
  );

  const render = async () => {
    const request = ++activeRequest;
    const selected = selection();

    if (!ready(selected)) {
      retries += 1;

      elements.status.dataset.state = "loading";
      elements.status.textContent = (
        "Waiting for verification controls…"
      );

      if (retries <= 30) {
        window.setTimeout(render, 300);
      }

      return;
    }

    retries = 0;
    elements.gallery.replaceChildren();
    elements.gallery.setAttribute(
      "aria-busy",
      "true"
    );

    elements.status.hidden = false;
    elements.status.dataset.state = "loading";
    elements.status.textContent = (
      "Loading threshold and ARI products…"
    );

    try {
      const catalog = await loadCatalog(
        selected.run
      );

      if (request !== activeRequest) {
        return;
      }

      const products = (
        catalog.products || []
      )
        .filter((product) => (
          Number(product.duration_hours)
            === selected.duration
          && String(product.window)
            === selected.window
          && String(product.domain)
            === selected.domain
          && String(product.product_family)
            === "threshold_verification"
        ))
        .sort(
          (first, second) => (
            rank(first) - rank(second)
          )
        );

      if (!products.length) {
        elements.count.textContent = "0 products";
        elements.status.dataset.state = "error";
        elements.status.textContent = (
          "No threshold or ARI products are "
          + "available for this selection."
        );

        elements.gallery.setAttribute(
          "aria-busy",
          "false"
        );

        return;
      }

      const loaded = await Promise.all(
        products.map(async (product) => {
          try {
            const response = await fetch(
              product.metadata_url,
              {cache: "no-store"}
            );

            if (!response.ok) {
              throw new Error(
                `Metadata request failed: `
                + `${response.status}`
              );
            }

            return {
              product,
              metadata: await response.json(),
            };
          } catch (error) {
            return {
              product,
              metadata: null,
            };
          }
        })
      );

      if (request !== activeRequest) {
        return;
      }

      elements.gallery.innerHTML = loaded
        .map(({product, metadata}) => (
          card(product, metadata)
        ))
        .join("");

      elements.gallery.setAttribute(
        "aria-busy",
        "false"
      );

      elements.count.textContent = (
        `${products.length} products`
      );

      elements.status.dataset.state = "ready";
      elements.status.textContent = (
        `${products.length} fixed-threshold and `
        + "ARI verification products loaded."
      );

      if (elements.summary) {
        elements.summary.textContent = (
          `Showing all ${products.length} threshold `
          + `and ARI products for `
          + `${selected.duration}-hour `
          + `${selected.window}, `
          + `${domainLabel(selected.domain)}.`
        );
      }
    } catch (error) {
      if (request !== activeRequest) {
        return;
      }

      elements.gallery.setAttribute(
        "aria-busy",
        "false"
      );

      elements.count.textContent = "Unavailable";
      elements.status.dataset.state = "error";
      elements.status.textContent = (
        "Unable to load the gallery: "
        + error.message
      );
    }
  };

  const schedule = (delay = 200) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(
      render,
      delay
    );
  };

  [
    elements.run,
    elements.duration,
    elements.window,
    elements.domain,
  ].forEach((control) => {
    control.addEventListener(
      "change",
      () => schedule(260)
    );

    new MutationObserver(
      () => schedule(260)
    ).observe(
      control,
      {
        childList: true,
        subtree: true,
      }
    );
  });

  schedule(350);
});
