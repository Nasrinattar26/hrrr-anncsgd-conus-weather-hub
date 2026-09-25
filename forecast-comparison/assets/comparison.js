/* Matched forecast comparison. Metadata and image requests are isolated by selection. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = new URL('../', document.baseURI);
  const run = $('compare-run'), period = $('compare-window'), product = $('compare-product');
  const status = $('comparison-status'), figure = $('comparison-figure'), img = $('comparison-image');
  let epoch = 0, data = null, rows = [], latest = '', controller = null;
  const query = new URL(location.href).searchParams;
  const text = (id,value) => { $(id).textContent = value; };
  const fmt = value => new Date(value).toISOString().slice(0,16).replace('T',' ');
  function initial(value) {
    if (!/^\d{10}$/.test(value)) throw Error('Invalid forecast initialization.');
    const iso = `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:00:00Z`;
    if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,19)+'Z' !== iso) throw Error('Invalid forecast date.');
    return Date.parse(iso);
  }
  function clear(message) {
    epoch++; figure.hidden = true; img.removeAttribute('src'); $('full-image').removeAttribute('href');
    status.textContent = message; status.dataset.error = 'false';
  }
  function options(select, values, selected) {
    select.replaceChildren(...values.map(([value,label]) => { const o = document.createElement('option'); o.value=value; o.textContent=label; return o; }));
    if (values.some(([value])=>value===selected)) select.value=selected;
    select.disabled = values.length===0;
  }
  async function json(path) {
    const response = await fetch(new URL(path,root), {cache:'no-store',signal:controller.signal});
    if (!response.ok) throw Error('Forecast comparison metadata is not available.');
    return response.json();
  }
  function validate(value,row) {
    const h = initial(row.init), g = initial(row.gefs_init);
    if (value.schema_version!==1 || value.hrrr_init!==row.init || value.gefs_init!==row.gefs_init || h-g!==43200000) throw Error('Forecast pair metadata is inconsistent.');
    if (value.status==='unavailable') return;
    if (value.status!=='ready' || value.duration_hours!==12 || !value.windows?.length || !value.products?.length) throw Error('Incomplete forecast comparison.');
    for (const w of value.windows) {
      if (w.hrrr_init!==row.init || w.gefs_init!==row.gefs_init || w.duration_hours!==12 || !Number.isInteger(w.hrrr_end_fhr) || !Number.isInteger(w.gefs_end_fhr) || w.hrrr_end_fhr<12 || w.hrrr_end_fhr>48 || w.gefs_end_fhr-w.hrrr_end_fhr!==12 ||
          Date.parse(w.valid_end)!==h+w.hrrr_end_fhr*3600000 || Date.parse(w.valid_end)!==g+w.gefs_end_fhr*3600000 || Date.parse(w.valid_end)-Date.parse(w.valid_start)!==43200000) throw Error('Forecast valid periods do not match.');
      for (const p of w.products) {
        if (!new RegExp(`^products/forecast-comparison/${row.init}/[a-zA-Z0-9_-]+\\.png$`).test(p.path) || !['inches','%'].includes(p.units) || !Number.isInteger(p.common_valid_cells) || p.common_valid_cells<=0) throw Error('Invalid forecast image metadata.');
      }
    }
  }
  function showImage() {
    clear('Loading matched forecast maps…');
    const ticket = epoch;
    const w = data?.windows.find(x=>x.id===period.value);
    const p = w?.products.find(x=>x.id===product.value);
    const index = data?.windows.indexOf(w) ?? -1;
    $('previous').disabled = index<=0; $('next').disabled = !data || index<0 || index>=data.windows.length-1;
    if (!p) { status.textContent='This product is unavailable for the selected period.'; return; }
    const source = new URL(p.path,root).href;
    const preload = new Image();
    const timer = setTimeout(()=>fail(),30000);
    const fail = () => { clearTimeout(timer); if(ticket!==epoch) return; status.textContent='The map could not be loaded. Try Refresh forecasts or choose another period.'; status.dataset.error='true'; };
    preload.onload = () => {
      clearTimeout(timer); if(ticket!==epoch) return;
      img.src=source; img.alt=`${p.label}: GEFS ${data.gefs_init} and HRRR ${data.hrrr_init}, valid ${fmt(w.valid_start)} to ${fmt(w.valid_end)} UTC.`;
      $('full-image').href=source; figure.hidden=false;
      status.textContent=`Valid ${fmt(w.valid_start)} → ${fmt(w.valid_end)} UTC · 12 hours · ${p.common_valid_cells.toLocaleString()} common land cells`;
      text('comparison-caption',`GEFS lead ${w.gefs_end_fhr-12}–${w.gefs_end_fhr} h · HRRR lead ${w.hrrr_end_fhr-12}–${w.hrrr_end_fhr} h · ${p.units==='inches'?'Amounts in inches':'Probabilities in percent'}`);
      const link = new URL(location.href); link.searchParams.set('init',run.value);link.searchParams.set('window',period.value);link.searchParams.set('product',product.value);history.replaceState(null,'',link);
    };
    preload.onerror=fail; preload.src=source;
  }
  async function loadRun() {
    controller?.abort(); controller = new AbortController();
    clear('Checking the selected forecast pair…'); const ticket=epoch; data=null;
    period.disabled=true; product.disabled=true; $('previous').disabled=true; $('next').disabled=true;
    const row=rows.find(x=>x.init===run.value); if(!row) return;
    try {
      if(row.manifest!==`data/forecast-comparison/runs/${row.init}.json`) throw Error('Invalid comparison catalog path.');
      const value=await json(row.manifest); if(ticket!==epoch) return; validate(value,row);
      if(value.status==='unavailable') {status.textContent=value.message || 'No validated comparison is available for this run.'; return;}
      data=value;
      options(period,data.windows.map(w=>[w.id,`${fmt(w.valid_start)} → ${fmt(w.valid_end)}`]),query.get('window'));
      options(product,data.products.map(p=>[p.id,p.label]),query.get('product') || 'prob_gt_1inch');
      showImage();
    } catch(error) {if(ticket===epoch && error.name!=='AbortError') {status.textContent=error.message;status.dataset.error='true';}}
  }
  async function refresh() {
    controller?.abort();controller=new AbortController();clear('Checking published forecast runs…');const ticket=epoch;
    run.disabled=true;period.disabled=true;product.disabled=true;$('previous').disabled=true;$('next').disabled=true;
    try {
      const [catalog,forecast]=await Promise.all([json('data/forecast-comparison/catalog.json'),json('data/forecast-runs/catalog.json')]);
      if(ticket!==epoch) return;
      if(catalog.schema_version!==1 || !Array.isArray(catalog.runs)) throw Error('Comparison catalog format is not supported.');
      latest=forecast.latest_initialization;initial(latest);
      const retained=new Set(forecast.runs.map(r=>r.init));
      rows=catalog.runs.filter(r=>retained.has(r.init));
      rows.forEach(r=>{initial(r.init);initial(r.gefs_init);});
      text('freshness',`Latest published HRRR: ${fmt(initial(latest))} UTC. GEFS comparisons use the same date’s 00 UTC run.`);
      if(!rows.length) throw Error('No comparison has been published for the retained forecast runs yet.');
      const selected=query.get('init') || run.value || latest;
      options(run,rows.map(r=>[r.init,`${fmt(initial(r.init)).slice(0,10)} · HRRR 12 / GEFS 00 UTC${r.status==='ready'?'':' · unavailable'}`]),selected);
      if(!query.get('init') && !rows.some(r=>r.init===latest)) {
        const o=document.createElement('option');o.value='';o.textContent='Latest comparison not yet available';run.prepend(o);run.value='';
        status.textContent='The newest HRRR comparison is not available yet. Choose an archived pair above or open either forecast dashboard.';return;
      }
      await loadRun();
    } catch(error) {if(ticket===epoch && error.name!=='AbortError') {status.textContent=error.message;status.dataset.error='true';}}
  }
  run.addEventListener('change',loadRun);period.addEventListener('change',showImage);product.addEventListener('change',showImage);
  $('refresh').addEventListener('click',refresh);
  for(const [id,step] of [['previous',-1],['next',1]]) $(id).addEventListener('click',()=>{
    if(!data) return;const index=data.windows.findIndex(w=>w.id===period.value)+step;
    if(index>=0 && index<data.windows.length) {period.value=data.windows[index].id;showImage();}
  });
  refresh();
})();
