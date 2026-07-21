# HRRR ANN-CSGD CONUS Weather Hub

A public research website for duration-specific probabilistic
precipitation postprocessing of HRRR forecasts.

## Models

- ANN-CSGD-6h
- ANN-CSGD-12h
- ANN-CSGD-24h

Each model generates expected precipitation and threshold-exceedance
probabilities over a 0.25-degree CONUS grid.

## Verification

Models were selected using 2024 validation data and independently
evaluated against MRMS observations from held-out 2025 data.

## Repository contents

- `index.html`: GitHub Pages landing page
- `assets/`: site styling and JavaScript
- `data/`: lightweight verification and production-audit summaries

Large model files, training datasets, and full operational NPZ products
are not stored directly in this repository.
