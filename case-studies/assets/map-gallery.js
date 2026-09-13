'use strict';
(() => {
  const cases = window.ANN_MAP_CASES || [];
  const $ = id => document.getElementById(id);
  if (!cases.length) return;
  const labels = {
    '025': 'ANN-CSGD 0.25°', '0125': 'ANN-CSGD 0.125°', '3km': 'ANN-CSGD ~3 km',
    gnn_csgd: 'GNN-CSGD 0.25°', ann_operational: 'ANN-CSGD 0.25°', raw_hrrr: 'Raw HRRR'
  };
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const clock = s => s.slice(11, 16);
  const shortTime = s => `${day.format(new Date(s))} ${clock(s)}`;
  const fmt = (v, n = 3) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(n);
  const inches = mm => number.format(mm / 25.4);
  const thresholdLabel = mm => `${inches(mm)} in · ${number.format(mm)} mm`;
  const label = m => labels[m.id] || m.label;
  const imageSource = f => window.ANN_MAP_IMAGES?.[f] || f;
  let event = cases[0], rows = [], selectedThreshold = 50.8;
  const current = () => rows[Number($('window').value)];
  const threshold = () => current().thresholds[Number($('threshold').value)];
  function option(value, text) {
    const o = document.createElement('option'); o.value = value; o.textContent = text; return o;
  }
  function changeDuration() {
    rows = event.records.filter(r => r.duration_hours === Number($('duration').value));
    $('window').replaceChildren(...rows.map((r, i) => option(i,
      `${shortTime(r.valid_start_utc)} → ${shortTime(r.valid_end_utc)}${r.focus ? ' · Maps' : ' · Scores'}`)));
    $('window').value = String(Math.max(0, rows.findIndex(r => r.focus)));
    changeWindow();
  }
  function changeWindow() {
    const r = current(), oldModel = $('model').value;
    $('model').replaceChildren(...r.models.map(m => option(m.id, label(m))), option('raw_hrrr', 'Raw HRRR'));
    $('model').value = r.models.some(m => m.id === oldModel) || oldModel === 'raw_hrrr' ? oldModel :
      (r.models.some(m => m.id === 'gnn_csgd') ? 'gnn_csgd' : r.models[0].id);
    $('threshold').replaceChildren(...r.thresholds.map((t, i) => option(i, thresholdLabel(t.threshold_mm))));
    $('threshold').value = String(Math.max(0, r.thresholds.findIndex(t => t.threshold_mm === selectedThreshold)));
    render();
  }
  function render() {
    const r = current(), t = threshold();
    if (!r || !t) return;
    selectedThreshold = t.threshold_mm;
    const choices = { ...r.figures, ...t.figures };
    for (const o of $('view').options) o.disabled = !choices[o.value];
    if (!choices[$('view').value]) $('view').value = 'amounts';
    const view = $('view').value || 'amounts';
    $('view').disabled = !Object.values(choices).some(v => typeof v === 'string' && v);
    const panels = view === 'amounts' ? r.figures.amount_comparisons :
      (view === 'probabilities' ? t.figures.probability_panels : null);
    const model = $('model').value;
    const file = panels?.[model] || choices[view];
    $('model-choice').hidden = !panels;
    $('timing').textContent = `Initialized ${date.format(new Date(r.init_utc))}, ${clock(r.init_utc)} UTC · Forecast hours ${r.lead_to_window_start_hours}–${Number(r.lead_to_window_start_hours) + r.duration_hours}`;
    const captions = {
      amounts: 'MRMS and forecast rainfall share one scale in mm. Shading interpolates between common 0.25° samples.',
      probabilities: `${model === 'raw_hrrr' ? 'Raw HRRR exceedance' : 'Probability of rainfall'} > ${inches(t.threshold_mm)} in (${number.format(t.threshold_mm)} mm). Black outline: MRMS exceedance.`,
      brier: 'Blue: lower Brier error than raw HRRR. Red: higher error. Values use original samples.',
      mean_error: 'Forecast mean minus MRMS (mm). Negative: too little rain; positive: too much.',
      reliability: 'Observed frequency versus forecast probability; the diagonal indicates agreement.',
      survival: 'Forecast probabilities at the largest MRMS rainfall observation; the vertical line marks the observed amount.'
    };
    $('figure-area').replaceChildren();
    $('figure-area').classList.toggle('single-map', Boolean(panels && view === 'probabilities' && model !== 'raw_hrrr'));
    $('no-image').hidden = Boolean(file);
    $('full-image').hidden = !file;
    $('figure-caption').hidden = !file;
    $('figure-caption').textContent = captions[view];
    if (file) {
      const img = document.createElement('img');
      img.src = imageSource(file);
      img.alt = `${event.title} · ${r.duration_hours} h · ${$('view').selectedOptions[0].textContent}${panels ? ' · ' + $('model').selectedOptions[0].textContent : ''}`;
      img.decoding = 'async';
      $('figure-area').append(img);
      $('full-image').href = imageSource(file);
      $('full-image').textContent = view === 'amounts' || view === 'probabilities' || view === 'brier' || view === 'mean_error' ? 'Open map ↗' : 'Open figure ↗';
    } else $('full-image').removeAttribute('href');
    const modelScores = r.models.map(m => {
      const p = t.models.find(x => x.id === m.id);
      return { id: m.id, name: label(m), mean: m.mean_forecast_mm, crps: m.mean_crps_mm, bs: p?.brier_score, auc: p?.roc_auc };
    });
    modelScores.push({ id: 'raw_hrrr', name: 'Raw HRRR', mean: r.raw_mean_mm,
      crps: r.models[0].mean_raw_crps_mm, bs: t.raw_brier_score, auc: t.raw_roc_auc });
    $('scores').replaceChildren(...modelScores.map(m => {
      const tr = document.createElement('tr'), name = document.createElement('th');
      name.scope = 'row'; name.textContent = m.name;
      if (panels && m.id === model) {
        tr.className = 'selected';
        const mark = document.createElement('span'); mark.className = 'marker'; mark.textContent = 'shown'; name.append(mark);
      }
      tr.append(name);
      for (const v of [fmt(m.mean, 2), fmt(m.crps), fmt(m.bs, 6), fmt(m.auc)]) {
        const td = document.createElement('td'); td.textContent = v; tr.append(td);
      }
      return tr;
    }));
    $('observed').textContent = `MRMS: mean ${fmt(r.observed_mean_mm, 2)} mm · maximum ${fmt(r.observed_max_mm, 2)} mm · ${number.format(t.n_events)} of ${number.format(r.n_locations)} locations > ${inches(t.threshold_mm)} in`;
    function lowest(key) {
      const valid = modelScores.filter(m => m[key] != null && Number.isFinite(m[key]));
      if (!valid.length) return 'unavailable';
      const min = Math.min(...valid.map(m => m[key]));
      return valid.filter(m => m[key] === min).map(m => m.name).join(' / ');
    }
    $('finding').textContent = `Lowest CRPS: ${lowest('crps')} · Lowest Brier score: ${lowest('bs')}`;
  }
  function changeEvent() {
    event = cases.find(e => e.event_id === $('event').value);
    $('view').value = 'amounts';
    const pending = event.status !== 'SCORED';
    $('pending').hidden = !pending; $('scored-content').hidden = pending;
    $('duration').disabled = pending; $('window').disabled = pending;
    if (pending) { $('pending-message').textContent = event.scope || 'Matched observations and forecasts are not available yet.'; return; }
    $('comparison-scope').textContent = event.event_id === 'hill_country_2025' ?
      'Hill Country: three ANN predictor resolutions and a 0.25° GNN, using frozen models. ANN and GNN training archives differ; this comparison does not isolate architecture.' :
      'Edouard: operational 0.25° ANN and retrospective 0.25° GNN inference from frozen weights. Other ANN resolutions are not available for this storm.';
    for (const [id, key] of [['csv','case_scores.csv'], ['json','case_results.json'], ['correction','crps_scoring_correction.csv']]) {
      const f = event.downloads[key]; $(id).href = window.ANN_MAP_DOWNLOADS?.[f] || f;
    }
    $('csv').textContent = `All ${event.records.length} windows · CSV`;
    $('event-source').hidden = !/^https?:\/\//.test(event.event.source_url || '');
    $('event-source').href = event.event.source_url || '#';
    const durations = [...new Set(event.records.map(r => r.duration_hours))].sort((a,b) => a-b);
    $('duration').replaceChildren(...durations.map(h => option(h, `${h} hours`)));
    $('duration').value = String(durations.includes(24) ? 24 : durations[0]);
    changeDuration();
  }
  $('event').replaceChildren(...cases.map(e => option(e.event_id, e.title)));
  $('event').value = (cases.find(e => e.status === 'SCORED') || cases[0]).event_id;
  $('event').addEventListener('change', changeEvent);
  $('duration').addEventListener('change', changeDuration);
  $('window').addEventListener('change', changeWindow);
  for (const id of ['view', 'model', 'threshold']) $(id).addEventListener('change', render);
  $('show-mapped').addEventListener('click', () => {
    $('window').value = String(Math.max(0, rows.findIndex(r => r.focus))); changeWindow();
  });
  changeEvent();
})();
