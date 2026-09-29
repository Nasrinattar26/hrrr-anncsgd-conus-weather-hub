#!/usr/bin/env python3
"""Add the fixed 5-inch threshold to matched 24-hour ANN-CSGD comparisons.

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

PRODUCT = dict(id='prob_gt_5inch', label='Probability of exceeding 5 inches in 24 hours',
               units='%', threshold_inch=5.0)
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


def read_hrrr_grib(path, window, renderer):
    """Read the published HRRR export, confirming its local parameter table."""
    import eccodes as ec
    path = Path(path)
    sidecar = json.loads(path.with_suffix(path.suffix + '.json').read_text())
    for key, expected in [('initialization_time', window['hrrr_init']), ('duration_hours', 24),
                          ('start_forecast_hour', window['hrrr_end_fhr'] - 24),
                          ('end_forecast_hour', window['hrrr_end_fhr'])]:
        if sidecar[key] != expected:
            raise ValueError('HRRR export metadata mismatch: ' + key)
    if np.datetime64(sidecar['valid_time']) != np.datetime64(window['valid_end'].removesuffix('Z')):
        raise ValueError('HRRR export valid time mismatch.')
    records = {r['parameter_number']: r for r in sidecar['records']}
    record = records[198]
    if record['variable'] != 'prob_gt_5inch_percent' or record['units'] != 'percent':
        raise ValueError('HRRR local parameter 198 is not confirmed as 5 inches.')
    found = {}
    with path.open('rb') as stream:
        while (gid := ec.codes_grib_new_from_file(stream)) is not None:
            try:
                number = ec.codes_get(gid, 'parameterNumber')
                if number not in (194, 198):
                    continue
                checks = {'discipline': 0, 'parameterCategory': 1, 'Ni': 253, 'Nj': 117,
                          'dataDate': int(window['hrrr_init'][:8]),
                          'dataTime': int(window['hrrr_init'][8:]) * 100,
                          'startStep': window['hrrr_end_fhr'] - 24, 'endStep': window['hrrr_end_fhr']}
                if any(ec.codes_get(gid, k) != v for k, v in checks.items()) or number in found:
                    raise ValueError('HRRR GRIB metadata differs from the selected period.')
                lats = ec.codes_get_array(gid, 'latitudes').reshape(117, 253)
                lons = ec.codes_get_array(gid, 'longitudes').reshape(117, 253)
                if not np.allclose(lats, lats[:, :1]) or not np.allclose(lons, lons[:1, :]):
                    raise ValueError('HRRR GRIB is not the expected regular grid.')
                grid = renderer.canonical_grid(lats[:, 0], lons[0])
                values = ec.codes_get_values(gid).reshape(117, 253)
                if ec.codes_get(gid, 'bitmapPresent'):
                    values[ec.codes_get_array(gid, 'bitmap').reshape(117, 253) == 0] = np.nan
                found[number] = renderer.reorder(values, grid)
            finally:
                ec.codes_release(gid)
    p5 = found[198]
    if (int(np.isfinite(p5).sum()) != record['finite_cells'] or
            not np.isclose(np.nanmax(p5), record['maximum'], rtol=0, atol=1e-5) or
            not np.array_equal(np.isfinite(p5), np.isfinite(found[194])) or
            np.any(p5 > found[194] + 1e-5) or np.any(p5 < 0)):
        raise ValueError('HRRR 5-inch values failed export/threshold validation.')
    return grid, p5, np.isfinite(p5)


def build(args):
    import xarray as xr
    repo = args.repo.resolve()
    manifest_path = repo / 'data/forecast-comparison/runs' / (args.init + '.json')
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if (manifest['status'] != 'ready' or manifest['schema_version'] != 3 or
            manifest['hrrr_init'] != args.init or manifest['gefs_init'] != args.init or
            manifest['matching_policy'] != 'same_initialization'):
        raise ValueError('A ready same-initialization comparison is required.')
    group = manifest['durations']['24h']
    source = args.source_dir / f'ANN12_v4_MRMS_VALIDONLY_24h_sampling_{args.init}.nc'
    if digest(source) != group['gefs_source_sha256']:
        raise ValueError('GEFS source differs from the published comparison.')
    spec = importlib.util.spec_from_file_location('existing_renderer', args.renderer)
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    with xr.open_dataset(source, decode_timedelta=False) as ds:
        extended = extend_gefs24(ds, source)
    grid = renderer.canonical_grid(extended.lat.values, extended.lon.values)
    gefs_land = renderer.land_mask(extended.land_mask.values, grid)
    product = {**PRODUCT, 'gefs': 'prob_gt_5inch_24h', 'hrrr': 'prob_gt_5inch_percent'}
    receipt = {'initialization': args.init, 'gefs_source_sha256': digest(source),
               'threshold_mm': 127.0, 'nsamples': int(extended.attrs['nsamples']),
               'reproduced_probability_values': int(extended[product['gefs']].attrs['reproduced_probability_values']),
               'windows': []}
    with tempfile.TemporaryDirectory(prefix='comparison-5inch-') as temp:
        pending = []
        for window in group['windows']:
            indices = np.flatnonzero(extended.lead_end_hours.values == window['gefs_end_fhr'])
            if len(indices) != 1:
                raise ValueError('Missing GEFS 24-hour window.')
            i = int(indices[0])
            if np.datetime64(window['valid_end'].removesuffix('Z')) != extended.valid_time.values[i]:
                raise ValueError('GEFS valid time differs from the comparison.')
            grib = repo / 'products/grib2' / args.init / '24h' / window['id'] / f'hrrr_{args.init}_{window["id"]}_anncsgd_24h.grib2'
            # Isolate ecCodes from netCDF/HDF5 native libraries in this process.
            decoded = Path(temp) / (window['id'] + '.npz')
            reader = '''
import importlib.util, json, numpy as np, sys
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
helper = load('fiveinch', sys.argv[1])
renderer = load('renderer', sys.argv[2])
grid, values, mask = helper.read_hrrr_grib(sys.argv[3], json.loads(sys.argv[4]), renderer)
np.savez(sys.argv[5], lat=grid[0], lon=grid[1], values=values, mask=mask)
'''
            subprocess.run([sys.executable, '-c', reader, str(Path(__file__).resolve()),
                            str(args.renderer.resolve()), str(grib), json.dumps(window),
                            str(decoded)], check=True)
            with np.load(decoded, allow_pickle=False) as fields:
                hgrid = renderer.canonical_grid(fields['lat'], fields['lon'])
                hrrr, hland = fields['values'], fields['mask']
            if not np.array_equal(hgrid[0], grid[0]) or not np.array_equal(hgrid[1], grid[1]):
                raise ValueError('GEFS and HRRR grids differ.')
            gefs = renderer.reorder(extended[product['gefs']].values[i], grid)
            gefs, hrrr, count = renderer.display_fields(gefs, hrrr, gefs_land & hland, product)
            fingerprint = hashlib.sha256((digest(source) + digest(grib) + digest(__file__)).encode()).hexdigest()[:12]
            relative = Path('products/forecast-comparison') / args.init / f'24h_{window["id"]}_prob_gt_5inch_{fingerprint}.png'
            staged = Path(temp) / relative.name
            renderer.render_pair(staged, gefs, hrrr, grid, product, window)
            item = {**PRODUCT, 'common_valid_cells': count, 'path': relative.as_posix(),
                    'sha256': digest(staged), 'size_bytes': staged.stat().st_size,
                    'gefs_source_sha256': digest(source), 'hrrr_grib_sha256': digest(grib)}
            window['products'] = [p for p in window['products'] if p['id'] != PRODUCT['id']] + [item]
            pending.append((staged, repo / relative))
            receipt['windows'].append({'id': window['id'], 'common_valid_cells': count,
                                       'gefs_max_percent': float(np.nanmax(gefs)),
                                       'hrrr_max_percent': float(np.nanmax(hrrr)), 'path': str(relative)})
        group['products'] = [p for p in group['products'] if p['id'] != PRODUCT['id']] + [PRODUCT]
        group['five_inch_provenance'] = {'method': 'Same RT7a random stream; all stored fixed-threshold probabilities reproduced exactly.',
                                       'threshold_mm': 127.0, 'hrrr_source': 'Published 24-bit GRIB2 export, local parameter 198',
                                       'reproduced_probability_values': receipt['reproduced_probability_values']}
        if manifest_path.read_bytes() != manifest_bytes:
            raise RuntimeError('Comparison changed while maps were being built. Rerun against the new manifest.')
        for staged, target in pending:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(staged, target)
        write_json(manifest_path, manifest)
    write_json(repo / 'data/forecast-comparison' / f'five-inch-{args.init}.json', receipt)
    print(json.dumps(receipt, indent=2))


def patched_generator(text):
    if 'from forecast_comparison_5inch import extend_gefs24' in text:
        return text
    tree = ast.parse(text)
    functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
    lines = text.splitlines(keepends=True)
    changes = []
    node = functions['products_for']
    block = ''.join(lines[node.lineno - 1:node.end_lineno])
    old = "for tag,value in [('0p5',0.5),('1',1.0),('2',2.0)]]"
    new = "for tag,value in ([('0p5',0.5),('1',1.0),('2',2.0)] + ([('5',5.0)] if duration == 24 else []))]"
    if block.count(old) != 1:
        raise ValueError('Unrecognized products_for function. No server files were changed.')
    changes.append((node.lineno - 1, node.end_lineno, block.replace(old, new)))
    node = functions['read_gefs24']
    block = ''.join(lines[node.lineno - 1:node.end_lineno])
    old = '    with xr.open_dataset(path, decode_timedelta=False) as ds:\n'
    new = ('    from forecast_comparison_5inch import extend_gefs24\n' + old +
           '        ds = extend_gefs24(ds, path)\n')
    if block.count(old) != 1:
        raise ValueError('Unrecognized read_gefs24 function. No server files were changed.')
    changes.append((node.lineno - 1, node.end_lineno, block.replace(old, new)))
    for start, end, replacement in sorted(changes, reverse=True):
        lines[start:end] = [replacement]
    result = ''.join(lines)
    compile(result, '99_generate_forecast_comparison.py', 'exec')
    return result


def install(args):
    """Install into the existing generator, preserving its current matching policy."""
    import fcntl
    root = args.project_root.resolve()
    generator = root / 'scripts/99_generate_forecast_comparison.py'
    module = generator.with_name('forecast_comparison_5inch.py')
    contract_path = root / 'scripts/103_six_hour_source_contract.json'
    with ExitStack() as stack:
        for lock_path in [root / 'state/six_hour_refresh_v1/dispatch.lock',
                          root / 'state/daily_website_workflow.lock']:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock = stack.enter_context(lock_path.open('a'))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = generator.read_text()
        after = patched_generator(before)
        contract = json.loads(contract_path.read_text()) if contract_path.exists() else None
        key = 'scripts/99_generate_forecast_comparison.py'
        if contract is not None and contract.get(key) != digest(generator):
            raise ValueError('Existing generator differs from its source contract. Review the drift before installation.')
        if module.exists() and digest(module) != digest(__file__):
            raise ValueError('A different 5-inch helper is already installed. Review it before replacing.')
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = root / 'state/forecast_comparison_5inch/backups' / stamp
        backup.mkdir(parents=True)
        shutil.copy2(generator, backup / generator.name)
        if contract is not None:
            shutil.copy2(contract_path, backup / contract_path.name)
        shutil.copy2(__file__, module)
        temporary = generator.with_name('.' + generator.name + '.part')
        temporary.write_text(after)
        temporary.chmod(generator.stat().st_mode)
        os.replace(temporary, generator)
        if contract is not None:
            contract[key] = digest(generator)
            contract['scripts/forecast_comparison_5inch.py'] = digest(module)
            write_json(contract_path, contract)
        print('[PASS] 24-hour 5-inch comparison enabled for subsequent runs.')
        print('Backup:', backup)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('build', help='Add maps to a published same-cycle run using matching local GEFS source files and HRRR GRIB2.')
    p.add_argument('--repo', type=Path, required=True)
    p.add_argument('--source-dir', type=Path, required=True)
    p.add_argument('--renderer', type=Path, required=True)
    p.add_argument('--init', required=True)
    p.set_defaults(action=build)
    p = commands.add_parser('install', help='Enable the threshold in the existing forecast-server generator.')
    p.add_argument('--project-root', type=Path, default=ROOT)
    p.set_defaults(action=install)
    args = parser.parse_args()
    args.action(args)


if __name__ == '__main__':
    main()
