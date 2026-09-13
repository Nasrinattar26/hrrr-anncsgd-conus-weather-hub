'use strict';
(()=>{
 const cases=window.ANN_MAP_CASES||[], $=id=>document.getElementById(id);
 if(!cases.length)return;
 let d=cases[0];
 let view='amounts', rows=[], selectedThreshold=50.8;
 const fmt=(v,n=3)=>v===null||v===undefined?'Undefined':Number(v).toFixed(n);
 const imageSource=f=>window.ANN_MAP_IMAGES?.[f]||f;
 const definitions={
  amounts:['Rainfall accumulation','MRMS, raw HRRR and predictive means share one rainfall scale. Compare location and intensity separately; the mean forecast is an expectation, not a prediction of the storm maximum.'],
  probabilities:['Probability of exceeding the threshold','Color shows the selected model probability. The black outline encloses tiles containing MRMS-observed exceedances at the same time. Raw HRRR is shown as a binary event forecast.'],
  brier:['Where did the model improve the Brier error?','Blue / positive values favor the model over deterministic raw HRRR. Red / negative values favor raw HRRR. Spatial errors remain visible even when the regional average improves.'],
  mean_error:['Error in predictive-mean rainfall','Forecast mean minus MRMS rainfall, in millimetres. Negative values indicate underprediction; positive values indicate overprediction.'],
  reliability:['Probability behavior within this storm','Observed frequency versus mean predicted probability, with bin counts alongside. Points above the diagonal indicate underprediction within this selected case. These dependent samples do not establish general calibration.'],
  survival:['The distribution at the observed-maximum point','The vertical line marks the largest observed MRMS amount among the common regional points. Curves show the forecast probability of exceeding each amount. This point was selected using observations.']};
 const option=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;};
 function rnow(){return rows[Number($('window').value)];}
 function tnow(){return rnow().thresholds[Number($('threshold').value)];}
 function changeDuration(){
  rows=d.records.filter(r=>r.duration_hours===Number($('duration').value));
  $('window').replaceChildren();rows.forEach((r,i)=>$('window').append(option(i,`Init ${r.init_utc.replace('T',' ').replace(':00:00Z','Z')} · ${r.valid_start_utc.replace('T',' ').replace(':00:00Z','Z')} → ${r.valid_end_utc.replace('T',' ').replace(':00:00Z','Z')}${r.focus?' · focus':''}`)));
  $('window').value=String(Math.max(0,rows.findIndex(r=>r.focus)));changeWindow();
 }
 function changeWindow(){
  const old=selectedThreshold; $('threshold').replaceChildren();
  const oldModel=$('model').value; $('model').replaceChildren(option('raw_hrrr','Raw HRRR (deterministic)'));
  rnow().models.forEach(m=>$('model').append(option(m.id,m.label)));
  $('model').value=rnow().models.some(m=>m.id===oldModel)||oldModel==='raw_hrrr'?oldModel:(rnow().models.some(m=>m.id==='gnn_csgd')?'gnn_csgd':rnow().models[0].id);
  rnow().thresholds.forEach((t,i)=>$('threshold').append(option(i,`${t.threshold_mm/25.4} in · ${t.threshold_mm} mm`)));
  const k=rnow().thresholds.findIndex(t=>t.threshold_mm===(old||50.8));$('threshold').value=String(Math.max(0,k));render();
 }
 function picture(file,label){const img=document.createElement('img');img.src=imageSource(file);img.alt=label;img.loading='lazy';return img;}
 function render(){
  const r=rnow(),t=tnow();if(!r||!t)return;selectedThreshold=t.threshold_mm;
  $('timing').textContent=`Initialized ${r.init_utc} · Valid ${r.valid_start_utc} → ${r.valid_end_utc} · Lead to accumulation start: ${r.lead_to_window_start_hours} h`;
  $('support').textContent=`${r.n_locations} common regional points · ${t.n_events} observed exceedances of ${t.threshold_mm} mm · ${[...new Set(r.models.map(m=>m.forecast_mode))].join('; ')}.`;
  const choices={...r.figures,...t.figures};
  if(!choices[view]&&choices.amounts)view='amounts';
  document.querySelectorAll('[data-view]').forEach(b=>{b.disabled=!choices[b.dataset.view];b.setAttribute('aria-pressed',String(b.dataset.view===view));});
  const description=definitions[view];$('figure-title').textContent=description[0];$('figure-caption').textContent=description[1];
  $('figure-area').replaceChildren();$('no-image').hidden=Boolean(choices[view]);$('full-image').hidden=!choices[view];
  if(choices[view]){const file=choices[view];$('figure-area').append(picture(file,description[0]));$('full-image').href=imageSource(file);}
  else $('no-image').textContent='This window has exact scores, but this figure has not been rendered. Select the focus window or generate maps for all windows with the supplied map script.';
  const selectedPanels=view==='amounts'?r.figures.amount_comparisons:
    (view==='probabilities'?t.figures.probability_panels:null);
  const pair=!selectedPanels&&view==='amounts'&&r.figures.amount_panels;
  $('amount-choice').hidden=!(selectedPanels||pair);$('side-by-side').hidden=!pair;
  $('figure-area').classList.toggle('single-map', Boolean(selectedPanels&&view==='probabilities'&&$('model').value!=='raw_hrrr'));
  if(selectedPanels){
   const file=selectedPanels[$('model').value];
   $('figure-area').replaceChildren(picture(file,description[0]+' · '+$('model').selectedOptions[0].textContent));
   $('full-image').textContent='Open all model panels ↗';
  }else{
   $('full-image').textContent='Open full-resolution figure ↗';
   if(pair){$('figure-area').replaceChildren();$('side-by-side').replaceChildren(picture(pair.observation,'MRMS observed rainfall'),picture(pair[$('model').value],'Selected forecast rainfall'));}
  }
  const rendered=Boolean(r.figures.amount_comparisons);
  $('display-note').textContent=rendered?
    (d.map_update.display_style==='contours'?
     'Display: filled contours between common 0.25° samples. They do not add fine-scale rainfall information. Scores use the original samples; grey areas have no supported shading.':
     'Display: filled tiles carrying the original common 0.25° sample values, without interpolation. Tiles are display footprints, not area-average rainfall.'):
    'Source figures from the completed case evaluation. Select a focus window for the forecast-style maps.';
  if(view==='brier'||view==='mean_error')$('display-note').textContent='Local errors are shown as filled tiles with the original sample values. They are not smoothed.';
  $('display-note').hidden=view==='reliability'||view==='survival';
  $('scores').replaceChildren();
  function row(values){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('scores').append(tr);}
  r.models.forEach(m=>{const p=t.models.find(x=>x.id===m.id);row([m.label,fmt(m.mean_forecast_mm,2),fmt(m.mean_crps_mm),fmt(p.brier_score,6),fmt(p.roc_auc)]);});
  row(['Raw HRRR (deterministic)',fmt(r.raw_mean_mm,2),fmt(r.models[0].mean_raw_crps_mm),fmt(t.raw_brier_score,6),fmt(t.raw_roc_auc)]);
  $('observed').textContent=`MRMS observed mean: ${fmt(r.observed_mean_mm,2)} mm · Maximum at a verification point: ${fmt(r.observed_max_mm,2)} mm. These are ${r.duration_hours}-hour amounts, not the multi-day storm total.`;
  const m=r.models.find(x=>x.id===$('model').value)||r.models[0],p=t.models.find(x=>x.id===m.id);
  const pct=m.crpss_vs_raw==null?null:100*m.crpss_vs_raw;
  const scoreSentence=pct==null?'':`Its CRPS is ${fmt(Math.abs(pct),1)}% ${pct>=0?'lower':'higher'} than raw HRRR for this window. `;
  $('finding').textContent=`${m.label} predictive mean averages ${fmt(m.mean_forecast_mm,2)} mm across the region, compared with ${fmt(r.observed_mean_mm,2)} mm observed. ${scoreSentence}At the ${t.threshold_mm/25.4}-inch threshold, its Brier score is ${fmt(p.brier_score,6)} versus ${fmt(t.raw_brier_score,6)} for raw HRRR. Inspect the maps for the local misses and false alarms behind these averages.`;
  if($('model').value==='raw_hrrr')$('finding').textContent=`Raw HRRR averages ${fmt(r.raw_mean_mm,2)} mm across the region, compared with ${fmt(r.observed_mean_mm,2)} mm observed. Its deterministic CRPS is ${fmt(r.models[0].mean_raw_crps_mm)} mm. At the ${t.threshold_mm/25.4}-inch threshold, its binary event forecast has Brier score ${fmt(t.raw_brier_score,6)}. Use the score table to compare the probabilistic models.`;
 }
 function changeEvent(){
  d=cases.find(e=>e.event_id===$('event').value);view='amounts';
  $('event-title').textContent=d.title;
  $('event-source').href=d.event.source_url||'#';
  $('event-source').hidden=!/^https?:\/\//.test(d.event.source_url||'');
  const pending=d.status!=='SCORED';$('pending').hidden=!pending;$('scored-content').hidden=pending;
  $('pending-message').textContent=d.scope||'';
  $('event-badges').replaceChildren();
  const badges=pending?['Selected · awaiting aligned arrays']:[`${d.records.length} scored windows`,`${[...new Set(d.records.map(r=>r.n_locations))].join(' / ')} regional points`];
  badges.forEach(text=>{const span=document.createElement('span');span.textContent=text;$('event-badges').append(span);});
  if(pending)return;
  $('comparison-design').textContent=d.comparison_design;
  $('scoring-revision').textContent=d.method.scoring_revision;
  { const f=d.downloads['crps_scoring_correction.csv']; $('correction').href=window.ANN_MAP_DOWNLOADS?.[f]||f; }
  $('case-scope').textContent=d.scope;
  $('case-selection').textContent=d.focus_selection||d.event.focus_selection||(d.event_id==='hill_country_2025'?'The focus window was selected by observed 24-hour coverage above 50.8 mm, with ties broken by maximum and record order. This is a diagnostic selection using observations.':'Focus selection follows the event export receipt.');
  $('verification-support').textContent=d.records[0].verification_support;
  $('map-status').textContent=d.map_update?.display_style==='contours'?'Filled forecast contours · common 0.25° samples':'Source evaluation figures · common verification locations';
  $('geo-note').hidden=!d.map_update;
  ['csv','json'].forEach((id,i)=>{const key=i?'case_results.json':'case_scores.csv'; const f=d.downloads[key];$(id).href=window.ANN_MAP_DOWNLOADS?.[f]||f;});
  $('csv').textContent=`All ${d.records.length} windows · CSV`;
  $('duration').replaceChildren();
  const durations=[...new Set(d.records.map(r=>r.duration_hours))].sort((a,b)=>a-b);
  durations.forEach(h=>$('duration').append(option(h,`${h} hours`)));
  $('duration').value=String(durations.includes(24)?24:durations[0]);changeDuration();
 }
 cases.forEach(e=>$('event').append(option(e.event_id,e.title+(e.status==='SCORED'?'':' · pending'))));
 $('event').value=(cases.find(e=>e.status==='SCORED')||cases[0]).event_id;
 $('event').addEventListener('change',changeEvent);
 $('duration').addEventListener('change',changeDuration);$('window').addEventListener('change',changeWindow);$('threshold').addEventListener('change',render);$('model').addEventListener('change',render);
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;render();}));
 changeEvent();
})();
