#!/usr/bin/env python3
"""Add the fixed 5-inch threshold to 6-, 12-, and 24-hour forecast guidance.

GEFS probabilities use the reviewed RT7a random stream. Reproduction of every
stored 0.5-, 1-, and 2-inch probability is required before accepting a new field.
No source forecast, model, or existing probability is changed.
"""
from __future__ import annotations

import argparse
import ast
from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import numpy as np

ROOT = Path('/data/Nasrin/Ann_csgd_project/hrrr_anncsgd_project')

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name('.' + path.name + '.part')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    os.replace(temporary, path)


def extend_gefs24(ds, source_path):
    """Return a loaded copy with P(sum > 127 mm); preserve the source file."""
    name = 'prob_gt_5inch_24h'
    if name in ds:
        var = ds[name]
        if var.attrs.get('units') != 'percent' or float(var.attrs.get('threshold_inch', 5)) != 5:
            raise ValueError('Conflicting 5-inch source metadata.')
        values = var.values
        p2 = ds['prob_gt_2inch_24h'].values
        if (set(var.dims) != {'window', 'lat', 'lon'} or
                not np.array_equal(np.isfinite(values), np.isfinite(p2)) or
                np.any(values < 0) or np.any(values > p2 + 1e-6)):
            raise ValueError('Invalid 5-inch probability field.')
        return ds

    source_path = Path(source_path)
    rt2 = source_path.parent / Path(ds.attrs['source_rt2_npz']).name
    if not rt2.is_file():
        rt2 = Path(ds.attrs['source_rt2_npz'])
    if not rt2.is_file():
        raise FileNotFoundError('The matching RT2 parameter file is required for 5 inches.')
    nsamples = int(ds.attrs['nsamples'])
    seed = int(ds.attrs.get('seed', 42))
    chunk = int(ds.attrs.get('chunk_points', 2000))
    if nsamples < 1 or chunk < 1:
        raise ValueError('Invalid Monte Carlo settings.')
    with np.load(rt2, allow_pickle=False) as z:
        leads = np.asarray(z['record_lead_hours'], dtype=int)
        times = np.asarray(z['record_valid_times']).astype('datetime64[s]')
        inits = np.asarray(z['record_init_times']).astype('datetime64[s]')
        rows, cols = z['land_row'].astype(int), z['land_col'].astype(int)
        land = z['land_mask'].astype(bool)
        nland = int(z['n_land'])
        params = {key: z[key].astype(np.float32).reshape(len(leads), nland)
                  for key in ('shift', 'shape', 'scale')}
    if (land.shape != (ds.sizes['lat'], ds.sizes['lon']) or
            not np.array_equal(land, ds.land_mask.values.astype(bool)) or
            len(rows) != nland or len(cols) != nland or
            len(set(zip(rows.tolist(), cols.tolist()))) != nland or
            int(land.sum()) != nland or not land[rows, cols].all()):
        raise ValueError('RT2 and RT7a land grids do not match.')
    if len(set(leads.tolist())) != len(leads):
        raise ValueError('Duplicate RT2 leads.')
    end_leads = np.asarray(ds.lead_end_hours.values, dtype=int)
    if np.any(np.diff(end_leads) <= 0):
        raise ValueError('RT7a windows must retain their original sampling order.')
    rng = np.random.default_rng(seed)
    result = np.full(ds['prob_gt_2inch_24h'].shape, np.nan, dtype=np.float32)
    checked = 0
    for iw, end_lead in enumerate(end_leads):
        indices = [np.flatnonzero(leads == h) for h in (end_lead - 12, end_lead)]
        if any(len(i) != 1 for i in indices):
            raise ValueError('A non-overlapping 12-hour source period is missing.')
        r1, r2 = (int(i[0]) for i in indices)
        valid_end = np.asarray(ds.valid_time.values[iw]).astype('datetime64[s]')
        init = np.asarray(ds.init_time.values[iw]).astype('datetime64[s]')
        if (times[r2] != valid_end or times[r1] != valid_end - np.timedelta64(12, 'h') or
                inits[r1] != init or inits[r2] != init):
            raise ValueError('RT2 and RT7a initialization or valid periods differ.')
        shift1, shape1, scale1 = (params[k][r1] for k in ('shift', 'shape', 'scale'))
        shift2, shape2, scale2 = (params[k][r2] for k in ('shift', 'shape', 'scale'))
        finite = np.isfinite(np.stack([shift1, shape1, scale1, shift2, shape2, scale2])).all(axis=0)
        finite &= (shape1 > 0) & (scale1 > 0) & (shape2 > 0) & (scale2 > 0)
        valid = np.flatnonzero(finite)
        reproduced = {tag: np.full(nland, np.nan, dtype=np.float32) for tag in ('0p5', '1', '2')}
        p5 = np.full(nland, np.nan, dtype=np.float32)
        for start in range(0, len(valid), chunk):
            idx = valid[start:start + chunk]
            g1 = rng.gamma(shape=shape1[idx][None, :], scale=scale1[idx][None, :],
                           size=(nsamples, len(idx))).astype(np.float32)
            g2 = rng.gamma(shape=shape2[idx][None, :], scale=scale2[idx][None, :],
                           size=(nsamples, len(idx))).astype(np.float32)
            total = (np.maximum(g1 + shift1[idx][None, :], 0.0) +
                     np.maximum(g2 + shift2[idx][None, :], 0.0)).astype(np.float32)
            for tag, inches in [('0p5', .5), ('1', 1), ('2', 2)]:
                reproduced[tag][idx] = 100.0 * np.mean(total > np.float32(inches * 25.4), axis=0)
            p5[idx] = 100.0 * np.mean(total > np.float32(127.0), axis=0)
        for tag, values in reproduced.items():
            stored = ds[f'prob_gt_{tag}inch_24h'].values[iw, rows, cols]
            if not np.array_equal(values, stored, equal_nan=True):
                raise ValueError(f'Random-stream replay differs at lead {end_lead}, threshold {tag}. '
                                 'Use the original seed/chunk settings; no 5-inch field was accepted.')
            checked += int(np.isfinite(stored).sum())
        if np.any(p5 > reproduced['2']) or np.any(p5 < 0) or np.any(p5 > 100):
            raise ValueError('The 5-inch probability violates threshold ordering.')
        result[iw, rows, cols] = p5
    out = ds.load().copy(deep=True)
    out[name] = (('window', 'lat', 'lon'), result)
    out[name].attrs.update(units='percent', threshold_inch=5.0, threshold_mm=127.0,
                          valid_min=0.0, valid_max=100.0, seed=seed, chunk_points=chunk,
                          nsamples=nsamples, source_rt2_sha256=digest(rt2),
                          reproduced_probability_values=checked)
    print(f'[PASS] Reproduced {checked:,} stored GEFS probabilities exactly; computed 5 inches.', flush=True)
    return out



def product_for(duration):
    return dict(id='prob_gt_5inch', label=f'Probability of exceeding 5 inches in {duration} hours',
                units='%', threshold_inch=5.0)


def direct_probability(threshold_mm, shift, shape, scale, *, gefs=False):
    from scipy.special import gammainc, gammaincc
    shift, shape, scale = (np.asarray(x, dtype=np.float32) for x in (shift, shape, scale))
    if not (shift.shape == shape.shape == scale.shape):
        raise ValueError('CSGD parameter shapes differ.')
    if np.any(shape <= 0) or np.any(scale <= 0) or np.any(shift > 0):
        raise ValueError('Invalid CSGD parameters.')
    z = np.maximum((np.float32(threshold_mm) - shift) / scale, np.float32(1e-8))
    # Preserve the reviewed exporters' respective arithmetic.
    p = 1.0 - np.asarray(gammainc(shape, z), dtype=np.float32) if gefs else gammaincc(shape, z)
    return (100.0 * np.clip(p, 0.0, 1.0).astype(np.float32)).astype(np.float32)


def checked_land(rows, cols, land):
    rows, cols = np.asarray(rows, dtype=int), np.asarray(cols, dtype=int)
    land = np.asarray(land, dtype=bool)
    if (rows.ndim != 1 or cols.shape != rows.shape or land.ndim != 2 or
            np.any(rows < 0) or np.any(cols < 0) or np.any(rows >= land.shape[0]) or
            np.any(cols >= land.shape[1]) or len(set(zip(rows.tolist(), cols.tolist()))) != len(rows) or
            int(land.sum()) != len(rows) or not land[rows, cols].all()):
        raise ValueError('Parameter land indices and grid mask disagree.')
    return rows, cols, land


def extend_gefs12(ds, source_path):
    source_path = Path(source_path)
    rt2 = source_path.parent / Path(ds.attrs['source_rt2_npz']).name
    if not rt2.is_file():
        rt2 = Path(ds.attrs['source_rt2_npz'])
    with np.load(rt2, allow_pickle=False) as z:
        rows, cols, land = checked_land(z['land_row'], z['land_col'], z['land_mask'])
        leads = np.asarray(z['record_lead_hours'], dtype=int)
        times = np.asarray(z['record_valid_times']).astype('datetime64[s]')
        inits = np.asarray(z['record_init_times']).astype('datetime64[s]')
        params = [np.asarray(z[k], dtype=np.float32).reshape(len(leads), len(rows))
                  for k in ('shift', 'shape', 'scale')]
    if (not np.array_equal(land, ds.land_mask.values.astype(bool)) or
            not np.array_equal(leads, ds.lead_hours.values) or
            not np.array_equal(times, ds.valid_time.values.astype('datetime64[s]')) or
            not np.array_equal(inits, ds.init_time.values.astype('datetime64[s]'))):
        raise ValueError('RT2 and GEFS 12-hour grids, initialization, or windows differ.')
    checked = 0
    for tag, inches in [('0p5', .5), ('1', 1), ('2', 2)]:
        p = direct_probability(inches * 25.4, *params, gefs=True)
        v = ds[f'prob_gt_{tag}inch_percent']
        actual = v.transpose('record', 'lat', 'lon').values[:, rows, cols]
        if v.attrs.get('units') != 'percent' or not np.allclose(p, actual, atol=2e-5, rtol=0, equal_nan=True):
            raise ValueError('GEFS 12-hour parameter replay failed at ' + tag + ' inches.')
        checked += int(np.isfinite(actual).sum())
    p5 = direct_probability(127.0, *params, gefs=True)
    p2 = ds.prob_gt_2inch_percent.transpose('record', 'lat', 'lon').values[:, rows, cols]
    if not np.array_equal(np.isfinite(p5), np.isfinite(p2)) or np.any(p5 > p2 + 2e-5):
        raise ValueError('GEFS 12-hour 5-inch probabilities violate threshold ordering.')
    result = np.full((len(leads), *land.shape), np.nan, dtype=np.float32)
    result[:, rows, cols] = p5
    if 'prob_gt_5inch_percent' in ds and not np.allclose(
            ds.prob_gt_5inch_percent.transpose('record', 'lat', 'lon').values,
            result, atol=2e-5, rtol=0, equal_nan=True):
        raise ValueError('Stored GEFS 5-inch field conflicts with its parameters.')
    out = ds.load().copy(deep=True)
    out['prob_gt_5inch_percent'] = (('record', 'lat', 'lon'), result)
    out.prob_gt_5inch_percent.attrs.update(units='percent', threshold_inch=5.0, threshold_mm=127.0,
        source_rt2_sha256=digest(rt2), reproduced_probability_values=checked)
    print(f'[PASS] Reproduced {checked:,} GEFS 12-hour probabilities; computed 5 inches.', flush=True)
    return out


def extend_hrrr(data):
    from collections import ChainMap
    rows, cols, land = checked_land(data['land_row'], data['land_col'], data['land_mask'])
    params = [np.asarray(data[k], dtype=np.float32) for k in ('shift_land', 'shape_land', 'scale_land')]
    if any(x.shape != rows.shape or not np.isfinite(x).all() for x in params):
        raise ValueError('Invalid HRRR parameter dimensions or missing land parameters.')
    for tag, inches in [('0p5', .5), ('1', 1), ('2', 2)]:
        stored = np.asarray(data[f'prob_gt_{tag}inch_percent'])
        p = direct_probability(inches * 25.4, *params)
        if stored.shape != land.shape or not np.allclose(p, stored[rows, cols], atol=2e-5, rtol=0):
            raise ValueError('HRRR parameter replay failed at ' + tag + ' inches.')
    p5 = direct_probability(127.0, *params)
    if np.any(p5 > np.asarray(data['prob_gt_2inch_percent'])[rows, cols] + 2e-5):
        raise ValueError('HRRR 5-inch probabilities violate threshold ordering.')
    grid = np.full(land.shape, np.nan, dtype=np.float32)
    grid[rows, cols] = p5
    if 'prob_gt_5inch_percent' in data and not np.allclose(
            grid, data['prob_gt_5inch_percent'], atol=2e-5, rtol=0, equal_nan=True):
        raise ValueError('Stored HRRR 5-inch field conflicts with its parameters.')
    return ChainMap({'prob_gt_5inch_percent': grid}, data)


def hrrr_field(path, window, renderer):
    duration = window['duration_hours']
    with np.load(path, allow_pickle=False) as raw:
        for key, expected in [('initialization_time', window['hrrr_init']), ('duration_hours', duration),
                              ('start_forecast_hour', window['hrrr_end_fhr'] - duration),
                              ('end_forecast_hour', window['hrrr_end_fhr'])]:
            if str(np.asarray(raw[key]).item()) != str(expected):
                raise ValueError('HRRR window metadata differs: ' + key)
        if np.datetime64(str(np.asarray(raw['valid_time']).item())) != np.datetime64(window['valid_end'].rstrip('Z')):
            raise ValueError('HRRR valid time differs.')
        grid = renderer.canonical_grid(raw['target_lat'], raw['target_lon'])
        data = extend_hrrr(raw)
        return grid, renderer.reorder(data['prob_gt_5inch_percent'], grid), renderer.land_mask(raw['land_mask'], grid)


def hrrr_path(root, init, duration, identifier):
    return Path(root) / 'data/realtime_products' / init / f'{duration}h' / identifier / f'hrrr_{init}_{identifier}_anncsgd_{duration}h.npz'


def render_hrrr6(path, field, grid, window):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap, BoundaryNorm
    import cartopy.crs as ccrs
    import cartopy.feature as cf
    levels = [0.1,1,2,3,5,10,20,30,40,50,60,70,80,90,95,100]
    colors = ['#d9d9d9','#c4b5fd','#8b7cf6','#3157e5','#1675ff','#00a6d6','#00c79a','#32c31d',
              '#87d500','#d4e600','#ffe600','#ffb000','#ff6a00','#f00000','#980000']
    palette = ListedColormap(colors); palette.set_under('#ffffff'); palette.set_bad('#edf2f5')
    fig = plt.figure(figsize=(12, 7.1), facecolor='white')
    try:
        ax = fig.add_axes([.08,.24,.84,.60], projection=ccrs.LambertConformal(
            central_longitude=-96, central_latitude=38, standard_parallels=(33,45)))
        ax.set_extent([-126.5,-66,23,51.5], crs=ccrs.PlateCarree())
        mesh = ax.pcolormesh(grid[1], grid[0], field, transform=ccrs.PlateCarree(),
            cmap=palette, norm=BoundaryNorm(levels,palette.N), shading='auto', rasterized=True)
        for feature, width in [(cf.COASTLINE,.55),(cf.BORDERS,.5),(cf.STATES,.35)]:
            ax.add_feature(feature, edgecolor='#4b5563', linewidth=width)
        ax.set_title(f'HRRR-based ANN-CSGD · lead {window["hrrr_end_fhr"]-6}–{window["hrrr_end_fhr"]} h')
        bar = fig.colorbar(mesh, cax=fig.add_axes([.2,.16,.6,.022]), orientation='horizontal', ticks=levels)
        bar.ax.tick_params(labelsize=8); bar.set_label('Probability (%) · white: less than 0.1%')
        fig.suptitle('Probability of exceeding 5 inches in 6 hours', fontsize=18, fontweight='bold', y=.98)
        fig.text(.5,.91,f'Valid {window["valid_start"][:16].replace("T"," ")} → {window["valid_end"][:16].replace("T"," ")} UTC', ha='center')
        fig.text(.5,.075,'HRRR forecast only · a matching 6-hour GEFS-based ANN-CSGD product is unavailable.', ha='center', fontsize=10)
        fig.text(.5,.035,'Initialization '+window['hrrr_init']+' UTC · 0.25° grid · finite land cells', ha='center', fontsize=9)
        fig.savefig(path, dpi=130, facecolor='white')
    finally:
        plt.close(fig)


def make_hrrr6(args, initialization, catalog, renderer):
    group = dict(duration_hours=6, status='hrrr_only', comparison_available=False,
        method_note='HRRR 6-hour forecast only. A matching GEFS-based ANN-CSGD 6-hour forecast is unavailable.',
        products=[product_for(6)], windows=[])
    for w in catalog['durations']['6h']['windows']:
        start, end = w['start_fhr'], w['end_fhr']
        if not isinstance(start,int) or not isinstance(end,int) or end-start!=6 or start<0 or end>48 or w['id']!=f'f{start:02d}_f{end:02d}':
            raise ValueError('Invalid HRRR 6-hour window.')
        window = dict(id=w['id'], hrrr_init=initialization, duration_hours=6, hrrr_end_fhr=end,
            valid_start=renderer.iso(renderer.init_time(initialization)+np.timedelta64(start,'h')),
            valid_end=renderer.iso(renderer.init_time(initialization)+np.timedelta64(end,'h')))
        source = hrrr_path(args.project_root, initialization, 6, w['id']); before=digest(source)
        grid, field, land = hrrr_field(source, window, renderer); field[~land]=np.nan
        key = hashlib.sha256((before+digest(__file__)).encode()).hexdigest()[:12]
        relative = f'products/forecast-comparison/{initialization}/6h_{w["id"]}_prob_gt_5inch_{key}.png'
        target = args.repo / relative; target.parent.mkdir(parents=True,exist_ok=True)
        if not target.is_file():
            temporary=target.with_name(target.stem+'.part.png');render_hrrr6(temporary,field,grid,window)
            if digest(source)!=before: raise RuntimeError('HRRR source changed during rendering.')
            os.replace(temporary,target)
        window['products']=[dict(**product_for(6),path=relative,sha256=digest(target),size_bytes=target.stat().st_size,
            valid_cells=int(np.isfinite(field).sum()),hrrr_source_sha256=before)]
        group['windows'].append(window)
    if len(group['windows'])!=8 or len({w['id'] for w in group['windows']})!=8:
        raise ValueError('Expected all eight distinct HRRR 6-hour windows.')
    return group


def add_to_run(args):
    import xarray as xr
    manifest_path=args.repo/'data/forecast-comparison/runs'/f'{args.init}.json'
    before=manifest_path.read_bytes();manifest=json.loads(before)
    if (manifest['schema_version']!=3 or manifest['status']!='ready' or manifest['hrrr_init']!=args.init or
            manifest['gefs_init']!=args.init or manifest['matching_policy']!='same_initialization'):
        raise ValueError('The requested run needs a ready same-initialization comparison.')
    spec=importlib.util.spec_from_file_location('existing_renderer',args.renderer)
    renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
    for duration in (12,24):
        group=manifest['durations'][f'{duration}h']
        if group['status']!='ready': raise ValueError(f'{duration}-hour comparison is not ready.')
        name=(f'ANN12_v4_MRMS_VALIDONLY_12h_products_{args.init}_with_2yr5yrARI.nc' if duration==12 else
              f'ANN12_v4_MRMS_VALIDONLY_24h_sampling_{args.init}.nc')
        source=args.source_dir/name;source_hash=digest(source)
        if source_hash!=group['gefs_source_sha256']:raise ValueError('GEFS source differs from published comparison.')
        with xr.open_dataset(source,decode_timedelta=False) as ds:
            extended=(extend_gefs12 if duration==12 else extend_gefs24)(ds,source)
        grid=renderer.canonical_grid(extended.lat.values,extended.lon.values)
        land=renderer.land_mask(extended.land_mask.values,grid)
        variable='prob_gt_5inch_percent' if duration==12 else 'prob_gt_5inch_24h'
        leads=extended.lead_hours.values if duration==12 else extended.lead_end_hours.values
        product=product_for(duration)
        for window in group['windows']:
            if window['duration_hours']!=duration:raise ValueError('Accumulation duration differs.')
            pos=np.flatnonzero(leads==window['gefs_end_fhr'])
            if len(pos)!=1:raise ValueError('Missing or ambiguous GEFS window.')
            pos=int(pos[0]);end=np.datetime64(window['valid_end'].rstrip('Z'))
            if (extended.valid_time.values[pos]!=end or
                extended.init_time.values[pos]!=renderer.init_time(args.init) or
                end-np.datetime64(window['valid_start'].rstrip('Z'))!=np.timedelta64(duration,'h')):
                raise ValueError('GEFS valid interval differs from comparison.')
            hsource=hrrr_path(args.project_root,args.init,duration,window['id']);hhash=digest(hsource)
            if window.get('hrrr_source_sha256')!=hhash:raise ValueError('HRRR source differs from published comparison.')
            hgrid,hrrr,hland=hrrr_field(hsource,window,renderer)
            if not np.array_equal(hgrid[0],grid[0]) or not np.array_equal(hgrid[1],grid[1]):raise ValueError('Forecast grids differ.')
            g,h,count=renderer.display_fields(renderer.reorder(extended[variable].values[pos],grid),hrrr,land&hland,product)
            key=hashlib.sha256((source_hash+hhash+digest(__file__)).encode()).hexdigest()[:12]
            relative=f'products/forecast-comparison/{args.init}/{duration}h_{window["id"]}_prob_gt_5inch_{key}.png'
            target=args.repo/relative;target.parent.mkdir(parents=True,exist_ok=True)
            print(f'[MAP] {duration}h {window["id"]} 5 inches',flush=True)
            renderer.render_pair(target,g,h,grid,product,window)
            if digest(hsource)!=hhash or digest(source)!=source_hash:raise RuntimeError('Forecast source changed during rendering.')
            item=dict(**product,path=relative,common_valid_cells=count,sha256=digest(target),size_bytes=target.stat().st_size)
            window['products']=[p for p in window['products'] if p['id']!='prob_gt_5inch']+[item]
        group['products']=[p for p in group['products'] if p['id']!='prob_gt_5inch']+[product]
        group['five_inch_provenance']=dict(threshold_mm=127.0,source_rt2_sha256=extended[variable].attrs['source_rt2_sha256'],
            reproduced_probability_values=int(extended[variable].attrs['reproduced_probability_values']))
    catalog=json.loads((args.repo/'data/forecast-runs'/args.init/'map_catalog.json').read_text())
    manifest['durations']['6h']=make_hrrr6(args,args.init,catalog,renderer)
    if manifest_path.read_bytes()!=before:raise RuntimeError('Comparison manifest changed during rendering.')
    write_json(manifest_path,manifest)
    print('[PASS] 5 inches: seven 12-hour pairs, five 24-hour pairs, and eight HRRR-only 6-hour maps.',flush=True)


def patched_generator(text):
    marker='# FIVE_INCH_ALL_DURATIONS_V2'
    if marker in text:return text
    tree=ast.parse(text);functions={n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
    lines=text.splitlines(keepends=True);changes=[]
    def edit(name,old,new):
        node=functions[name];block=''.join(lines[node.lineno-1:node.end_lineno])
        if block.count(old)!=1:raise ValueError('Unrecognized '+name+' function; source was not changed.')
        changes.append((node.lineno-1,node.end_lineno,block.replace(old,new)))
    base="for tag,value in [('0p5',0.5),('1',1.0),('2',2.0)]]"
    prior="for tag,value in ([('0p5',0.5),('1',1.0),('2',2.0)] + ([('5',5.0)] if duration == 24 else []))]"
    edit('products_for',prior if prior in text else base,"for tag,value in [('0p5',0.5),('1',1.0),('2',2.0),('5',5.0)]]")
    opening='    with xr.open_dataset(path, decode_timedelta=False) as ds:\n'
    edit('read_gefs',opening,'    from forecast_comparison_5inch import extend_gefs12\n'+opening+'        ds = extend_gefs12(ds, path)\n')
    if 'from forecast_comparison_5inch import extend_gefs24' not in text:
        edit('read_gefs24',opening,'    from forecast_comparison_5inch import extend_gefs24\n'+opening+'        ds = extend_gefs24(ds, path)\n')
    edit('read_hrrr','    with np.load(path, allow_pickle=False) as data:\n',
         '    from forecast_comparison_5inch import extend_hrrr\n    with np.load(path, allow_pickle=False) as data:\n        data = extend_hrrr(data)\n')
    node=functions['make_duration'];block=''.join(lines[node.lineno-1:node.end_lineno])
    block=block.replace('len(pairs)*4','len(pairs)*len(products)').replace('len(matched)*4','len(matched)*len(products)')
    old="'renderer':sha(__file__)"
    if block.count(old)!=1:raise ValueError('Unrecognized rendering fingerprint.')
    block=block.replace(old,old+",'five_inch_helper':sha(Path(__file__).with_name('forecast_comparison_5inch.py'))")
    changes.append((node.lineno-1,node.end_lineno,block))
    edit('build',"    result = {'schema_version':",
        "    import sys\n    from forecast_comparison_5inch import make_hrrr6\n    durations['6h'] = make_hrrr6(args,initialization,catalog,sys.modules[__name__])\n    result = {'schema_version':")
    for start,end,replacement in sorted(changes,reverse=True):lines[start:end]=[replacement]
    result=''.join(lines)+'\n'+marker+'\n';compile(result,'99_generate_forecast_comparison.py','exec');return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',type=Path,required=True)
    p.add_argument('--project-root',type=Path,default=ROOT)
    p.add_argument('--source-dir',type=Path,required=True)
    p.add_argument('--renderer',type=Path,required=True)
    p.add_argument('--init',required=True)
    add_to_run(p.parse_args())

if __name__=='__main__':main()
