/* Duration-aware forecast comparison, with explicit construction and missing-data labels. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = new URL('../', document.baseURI);
  const run=$('compare-run'), duration=$('compare-duration'), period=$('compare-window'), product=$('compare-product');
  const status=$('comparison-status'), figure=$('comparison-figure'), img=$('comparison-image');
  let epoch=0, data=null, rows=[], controller=null;
  const fmt=value=>new Date(value).toISOString().slice(0,16).replace('T',' ');
  const query=()=>new URL(location.href).searchParams;
  const label=value=>String(value||'').replace(/^Chance of more than /,'Probability of exceeding ');
  const active=()=>data?.durations?.[duration.value];
  const displayable=group=>['ready','hrrr_only'].includes(group?.status);
  function initial(value) {
    if(!/^\d{10}$/.test(value)) throw Error('Invalid forecast initialization.');
    const iso=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:00:00Z`;
    if(!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,19)+'Z'!==iso) throw Error('Invalid forecast date.');
    return Date.parse(iso);
  }
  function clear(message) {
    epoch++;figure.hidden=true;img.removeAttribute('src');$('full-image').removeAttribute('href');
    status.textContent=message;status.dataset.error='false';$('comparison-caption').textContent='';
  }
  function options(select,values,selected) {
    select.replaceChildren(...values.map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));
    if(values.some(([value])=>value===selected)) select.value=selected;
    select.disabled=values.length===0;
  }
  function remember() {
    const url=new URL(location.href);
    for(const [name,value] of [['init',run.value],['duration',duration.value],['window',period.value],['product',product.value]]) {
      if(value) url.searchParams.set(name,value);else url.searchParams.delete(name);
    }
    history.replaceState(null,'',url);
  }
  async function json(path) {
    const response=await fetch(new URL(path,root),{cache:'no-store',signal:controller.signal});
    if(!response.ok) throw Error('Forecast comparison metadata is not available.');
    return response.json();
  }
  function missing(hours,message) {return {duration_hours:hours,status:'unavailable',message,windows:[],products:[]};}
  function normalize(value,row) {
    const h=initial(row.init),g=initial(row.gefs_init);
    const exact=value.schema_version===3;
    if(![1,2,3].includes(value.schema_version) || value.hrrr_init!==row.init || value.gefs_init!==row.gefs_init) throw Error('Forecast pair metadata is inconsistent.');
    if(exact) {
      if(h!==g || value.matching_policy!=='same_initialization' || value.initialization_offset_hours!==0 || row.matching_policy!=='same_initialization') throw Error('The comparison does not have matching initializations.');
    } else if(![0,21600000,43200000,64800000].includes(h-g) || row.gefs_init!==row.init.slice(0,8)+'00') throw Error('Archived forecast pair metadata is inconsistent.');
    if(!['ready','waiting','unavailable'].includes(value.status)) throw Error('Invalid forecast comparison status.');
    const defaults={
      '6h':missing(6,'A 6-hour GEFS-based ANN-CSGD product is not available in the reviewed daily workflow. Use the HRRR dashboard for 6-hour guidance.'),
      '12h':missing(12,'No validated 12-hour comparison is available for this run.'),
      '24h':missing(24,'No validated 24-hour comparison has been published for this run.')
    };
    if(value.status!=='ready') {
      defaults['12h'].message=defaults['24h'].message=value.message||'No validated comparison is available for this run.';
      defaults['12h'].status=defaults['24h'].status=value.status;
      return {...value,durations:defaults};
    }
    if(value.schema_version===1) {
      if(value.duration_hours!==12) throw Error('Unsupported archived duration.');
      value={...value,durations:{'12h':{...value,method_note:'Both panels use directly predicted 12-hour CSGD distributions.'}}};
    }
    if(!value.durations || typeof value.durations!=='object') throw Error('Missing accumulation durations.');
    const groups={...defaults,...value.durations};
    for(const [key,group] of Object.entries(groups)) {
      const hours=Number(key.replace('h',''));
      if(![6,12,24].includes(hours) || group.duration_hours!==hours) throw Error('Invalid accumulation duration.');
      if(['waiting','unavailable'].includes(group.status)) continue;
      if(hours===6 && group.status==='hrrr_only') {
        if(group.comparison_available!==false || group.products?.length!==1 || group.products[0].id!=='prob_gt_5inch' || group.windows?.length!==8) throw Error('Invalid HRRR-only forecast metadata.');
        const seen=new Set();
        for(const w of group.windows) {
          const end=w.hrrr_end_fhr;
          if(seen.has(w.id) || !Number.isInteger(end) || end<6 || end>48 || end%6 || w.id!==`f${String(end-6).padStart(2,'0')}_f${String(end).padStart(2,'0')}` || w.hrrr_init!==row.init || w.duration_hours!==6 || Date.parse(w.valid_end)!==h+end*3600000 || Date.parse(w.valid_end)-Date.parse(w.valid_start)!==6*3600000) throw Error('Invalid HRRR 6-hour forecast period.');
          seen.add(w.id);
          const p=w.products?.[0];
          if(w.products?.length!==1 || p?.id!=='prob_gt_5inch' || p.threshold_inch!==5 || p.units!=='%' || !Number.isInteger(p.valid_cells) || p.valid_cells<=0 || !new RegExp(`^products/forecast-comparison/${row.init}/6h_[a-zA-Z0-9_-]+\\.png$`).test(p.path)) throw Error('Invalid HRRR 6-hour forecast image.');
        }
        continue;
      }
      if(hours===6 || group.status!=='ready' || !group.windows?.length || !group.products?.length) throw Error('Incomplete forecast comparison.');
      if(hours===24 && (!Number.isInteger(group.gefs_nsamples) || group.gefs_nsamples<1 || !group.method_note)) throw Error('Missing 24-hour construction metadata.');
      const names=new Set(group.products.map(p=>p.id));
      const required=['expected_precip','prob_gt_0p5inch','prob_gt_1inch','prob_gt_2inch'];
      const allowed=new Set([...required,'prob_gt_5inch']);
      if(names.size!==group.products.length || !required.every(id=>names.has(id)) || [...names].some(id=>!allowed.has(id))) throw Error('Invalid comparison products.');
      const windows=new Set();
      for(const w of group.windows) {
        if(windows.has(w.id)) throw Error('Duplicate forecast periods.');windows.add(w.id);
        if(w.id!==`f${String(w.hrrr_end_fhr-hours).padStart(2,'0')}_f${String(w.hrrr_end_fhr).padStart(2,'0')}` ||
          w.hrrr_init!==row.init || w.gefs_init!==row.gefs_init || w.duration_hours!==hours || !Number.isInteger(w.hrrr_end_fhr) || !Number.isInteger(w.gefs_end_fhr) || w.hrrr_end_fhr<hours || w.hrrr_end_fhr>48 || w.gefs_end_fhr-w.hrrr_end_fhr!==(h-g)/3600000 ||
          Date.parse(w.valid_end)!==h+w.hrrr_end_fhr*3600000 || Date.parse(w.valid_end)!==g+w.gefs_end_fhr*3600000 || Date.parse(w.valid_end)-Date.parse(w.valid_start)!==hours*3600000) throw Error('Forecast valid periods do not match.');
        if(!Array.isArray(w.products) || w.products.length!==names.size || new Set(w.products.map(p=>p.id)).size!==names.size) throw Error('Missing forecast products.');
        for(const p of w.products) {
          const expected=p.id==='expected_precip'?null:Number(p.id.replace('prob_gt_','').replace('inch','').replace('p','.'));
          if(!names.has(p.id) || p.threshold_inch!==expected || p.units!==(expected===null?'inches':'%') || !new RegExp(`^products/forecast-comparison/${row.init}/[a-zA-Z0-9_-]+\\.png$`).test(p.path) || !Number.isInteger(p.common_valid_cells) || p.common_valid_cells<=0) throw Error('Invalid forecast image metadata.');
        }
      }
    }
    return {...value,durations:groups};
  }
  function showImage() {
    clear('Loading matched forecast maps…');const ticket=epoch;
    const group=active(), w=group?.windows.find(x=>x.id===period.value), p=w?.products.find(x=>x.id===product.value);
    const index=group?.windows.indexOf(w)??-1;
    $('previous').disabled=index<=0;$('next').disabled=!group || index<0 || index>=group.windows.length-1;
    remember();
    if(!p) {status.textContent='This product is unavailable for the selected period.';return;}
    const source=new URL(p.path,root).href, preload=new Image();
    let timer;
    const fail=()=>{clearTimeout(timer);if(ticket!==epoch)return;status.textContent='The map could not be loaded. Try Refresh forecasts or choose another period.';status.dataset.error='true';};
    timer=setTimeout(fail,30000);
    preload.onload=()=>{
      clearTimeout(timer);if(ticket!==epoch)return;
      const single=group.status==='hrrr_only';
      img.src=source;img.alt=`${label(p.label)}: ${single?'HRRR '+data.hrrr_init:'GEFS '+data.gefs_init+' and HRRR '+data.hrrr_init}, valid ${fmt(w.valid_start)} to ${fmt(w.valid_end)} UTC.`;
      $('full-image').href=source;figure.hidden=false;
      status.textContent=`Valid ${fmt(w.valid_start)} → ${fmt(w.valid_end)} UTC · ${group.duration_hours} hours · ${(single?p.valid_cells:p.common_valid_cells).toLocaleString()} ${single?'HRRR':'common'} land cells`;
      const timing=data.schema_version===3?'Same initialization':data.gefs_init===data.hrrr_init?'Archived pair · same initialization':'Archived pair · different initializations';
      $('comparison-caption').textContent=single?`HRRR only · GEFS 6-hour forecast unavailable · HRRR lead ${w.hrrr_end_fhr-6}–${w.hrrr_end_fhr} h · Probabilities in percent`:`${timing} · GEFS lead ${w.gefs_end_fhr-group.duration_hours}–${w.gefs_end_fhr} h · HRRR lead ${w.hrrr_end_fhr-group.duration_hours}–${w.hrrr_end_fhr} h · ${p.units==='inches'?'Amounts in inches':'Probabilities in percent'}`;
    };
    preload.onerror=fail;preload.src=source;
  }
  function showDuration() {
    clear('Checking the selected accumulation duration…');
    const group=active(), selected=query();
    $('previous').disabled=true;$('next').disabled=true;
    $('comparison-method').textContent=displayable(group)?(group.method_note||''):'';
    $('hrrr-duration-help').hidden=displayable(group);
    const link=new URL('index.html',root);link.searchParams.set('init',run.value);link.searchParams.set('duration',duration.value);link.hash='forecast-workspace';
    $('hrrr-duration-link').href=link.href;
    $('hrrr-duration-link').textContent=`View HRRR ${group?.duration_hours||''}-hour forecasts ↗`;
    if(!displayable(group)) {
      options(period,[],null);options(product,[],null);status.textContent=group?.message||'This duration is unavailable.';remember();return;
    }
    options(period,group.windows.map(w=>[w.id,`${fmt(w.valid_start)} → ${fmt(w.valid_end)}`]),selected.get('window'));
    const products=group.products.map(p=>[p.id,label(p.label)]);
    if(!group.products.some(p=>p.id==='prob_gt_5inch')) {
      products.push(['prob_gt_5inch',`Probability of exceeding 5 inches in ${group.duration_hours} hours · not yet published`]);
    }
    options(product,products,selected.get('product')||'prob_gt_1inch');
    showImage();
  }
  async function loadRun() {
    controller?.abort();controller=new AbortController();clear('Checking the selected forecast pair…');const ticket=epoch;data=null;
    duration.disabled=true;period.disabled=true;product.disabled=true;$('previous').disabled=true;$('next').disabled=true;
    $('comparison-method').textContent='';$('hrrr-duration-help').hidden=true;
    const row=rows.find(x=>x.init===run.value);if(!row)return;
    try {
      if(row.manifest!==`data/forecast-comparison/runs/${row.init}.json`) throw Error('Invalid comparison catalog path.');
      const value=await json(row.manifest);if(ticket!==epoch)return;data=normalize(value,row);
      options(duration,['6h','12h','24h'].map(key=>[key,`${data.durations[key].duration_hours}-hour${data.durations[key].status==='ready'?'':data.durations[key].status==='hrrr_only'?' · HRRR only':data.durations[key].status==='waiting'?' · waiting for matching cycle':' · comparison unavailable'}`]),query().get('duration')||'12h');
      showDuration();
    }catch(error){if(ticket===epoch && error.name!=='AbortError'){status.textContent=error.message;status.dataset.error='true';}}
  }
  async function refresh() {
    controller?.abort();controller=new AbortController();clear('Checking published forecast runs…');const ticket=epoch;data=null;
    for(const el of [run,duration,period,product,$('previous'),$('next')]) el.disabled=true;
    $('comparison-method').textContent='';$('hrrr-duration-help').hidden=true;
    try {
      const [catalog,forecast]=await Promise.all([json('data/forecast-comparison/catalog.json'),json('data/forecast-runs/catalog.json')]);
      if(ticket!==epoch)return;
      if(![1,2].includes(catalog.schema_version) || !Array.isArray(catalog.runs)) throw Error('Comparison catalog format is not supported.');
      const latest=forecast.latest_initialization;initial(latest);
      const retained=new Set(forecast.runs.map(r=>r.init));rows=catalog.runs.filter(r=>retained.has(r.init));
      rows.forEach(r=>{initial(r.init);initial(r.gefs_init);});
      const exactRows=rows.filter(r=>r.status==='ready' && r.matching_policy==='same_initialization' && r.gefs_init===r.init).sort((a,b)=>b.init.localeCompare(a.init));
      const latestReady=exactRows[0]?.init;
      if(catalog.latest_ready_initialization!=null && catalog.latest_ready_initialization!==latestReady) throw Error('Latest ready comparison metadata is inconsistent.');
      $('freshness').textContent=`Latest published HRRR: ${fmt(initial(latest))} UTC. ${latestReady?`Latest ready same-initialization pair: ${fmt(initial(latestReady))} UTC.${latestReady!==latest?' The newer pair will appear when both systems are ready.':''}`:'Waiting for the first same-initialization pair. Archived comparisons remain selectable.'}`;
      if(!rows.length) throw Error('No comparison has been published for the retained forecast runs yet.');
      const requested=query().get('init'), chosen=requested||latestReady;
      options(run,rows.map(r=>[r.init,`${fmt(initial(r.init)).slice(0,10)} · HRRR ${r.init.slice(-2)} / GEFS ${r.gefs_init.slice(-2)} UTC${r.matching_policy==='same_initialization'?'':' · archived'}${r.gefs_init!==r.init?' · different initializations':''}${r.status==='ready'?'':r.status==='waiting'?' · waiting':' · unavailable'}`]),chosen);
      if(!chosen || !rows.some(r=>r.init===chosen)) {
        const o=document.createElement('option');o.value='';o.textContent=requested?'Requested pair is not available':'Waiting for a same-initialization pair';run.prepend(o);run.value='';
        status.textContent=requested?'The requested comparison is not in the retained archive. Choose another pair above.':'A same-initialization pair is not ready yet. Choose an archived pair above or open either forecast dashboard.';return;
      }
      await loadRun();
    }catch(error){if(ticket===epoch && error.name!=='AbortError'){status.textContent=error.message;status.dataset.error='true';}}
  }
  run.addEventListener('change',loadRun);duration.addEventListener('change',showDuration);
  period.addEventListener('change',showImage);product.addEventListener('change',showImage);$('refresh').addEventListener('click',refresh);
  for(const [id,step] of [['previous',-1],['next',1]]) $(id).addEventListener('click',()=>{
    const group=active();if(!displayable(group))return;
    const index=group.windows.findIndex(w=>w.id===period.value)+step;
    if(index>=0 && index<group.windows.length){period.value=group.windows[index].id;showImage();}
  });
  refresh();
})();
