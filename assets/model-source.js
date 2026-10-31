/* Source-aware dashboard configuration. Existing HRRR endpoints remain default. */
(() => {
  'use strict';
  const params = new URL(location.href).searchParams;
  const gefs = params.get('model') === 'gefs';
  window.ANN_MODEL_CONFIG = gefs
    ? {source: 'gefs', summaryURL: './data/gefs/site_summary.json', catalogURL: './data/gefs/forecast-runs/catalog.json'}
    : {source: 'hrrr', summaryURL: './data/site_summary.json', catalogURL: './data/forecast-runs/catalog.json'};

  const host = document.querySelector('.run-picker');
  if (host) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin:0 0 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    const label = document.createElement('label');
    label.htmlFor = 'forecast-source'; label.textContent = 'Forecast model';
    const select = document.createElement('select'); select.id = 'forecast-source';
    select.style.cssText = 'padding:10px;min-width:230px;background:white;color:black;border:1px solid #bcc8d0;border-radius:6px';
    for (const [value, text] of [['hrrr','HRRR ANN-CSGD model'],['gefs','GEFS ANN-CSGD model']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = text;
      option.selected = value === (gefs ? 'gefs' : 'hrrr'); select.append(option);
    }
    select.addEventListener('change', () => {
      const url = new URL(location.href); url.searchParams.set('model', select.value);
      url.hash = 'forecast-workspace'; location.assign(url.href);
    });
    wrapper.append(label, select); host.prepend(wrapper);
  }
  if (!gefs) {
    const link = document.querySelector('a[href="https://nasrinattar26.github.io/ann-csgd-worldcup-weather-hub/"]');
    if (link) { link.href = 'index.html?model=gefs'; link.textContent = 'Open GEFS ANN-CSGD model'; }
    return;
  }

  document.title = 'GEFS ANN-CSGD model · 192-hour CONUS forecasts';
  document.querySelector('meta[name="description"]')?.setAttribute('content',
    'Independent GEFS ANN-CSGD 6-, 12- and 24-hour precipitation distributions through 192 hours, with maps, animations and GRIB2 downloads.');
  const text = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = value; };
  text('.hero h1', 'GEFS ANN-CSGD model');
  for (const link of document.querySelectorAll('a[href="index.html#forecast-workspace"],a[href="index.html#grib2-downloads"]')) {
    const url = new URL(link.getAttribute('href'), location.href); url.searchParams.set('model','gefs'); link.href = url.href;
  }
  text('.hero-description', 'Three separately trained models provide direct 6-, 12- and 24-hour rainfall distributions through 192 hours (8 days), on a common 0.25° CONUS grid.');
  text('.hero-run-card .small-note', 'Latest complete GEFS ANN-CSGD forecast: 6-hourly windows through 192 hours.');
  text('.current-run-card strong', 'GEFS guidance through 8 days');
  text('.current-run-card p', 'One independently trained ANN-CSGD network handles each accumulation duration: 6, 12 and 24 hours. Each uses GEFS ensemble-mean precipitation predictors. All displayed durations are predicted directly.');
  const list = document.querySelector('.control-guide .check-list');
  if (list) {
    list.replaceChildren(...['673 forecast maps per complete run','22 duration-specific animations',
      '92 GRIB2 window files and one download package','Fixed and duration-specific local ARI thresholds',
      '192-hour horizon; 6-hour window stride'].map(value => {const li=document.createElement('li');li.textContent=value;return li;}));
  }
  for (const link of document.querySelectorAll('a[href="verification.html"],a[href="methods.html"],a[href^="methods.html#"]')) {
    link.href = 'gefs-methods.html';
    if (/verification/i.test(link.textContent)) link.textContent = 'GEFS methods and validation';
  }
  const oldGEFS = document.querySelector('a[href="https://nasrinattar26.github.io/ann-csgd-worldcup-weather-hub/"]');
  if (oldGEFS) oldGEFS.textContent = 'World Cup forecast hub';
  text('.compact-dashboard-guide h2', 'GEFS inputs, ANN-CSGD probabilities');
  text('.compact-dashboard-guide p:not(.eyebrow)', 'Each GEFS initialization supplies ensemble-mean precipitation predictors. A duration-specific saved neural network predicts a CSGD distribution at each land-grid location.');
  text('.compact-dashboard-guide__note', 'Direct duration-specific models handle 6-, 12- and 24-hour totals. Forecast windows advance every 6 hours through day 8.');
  document.querySelector('#forecast-map')?.setAttribute('alt','Selected GEFS ANN-CSGD CONUS forecast map');
})();
