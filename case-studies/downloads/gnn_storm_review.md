# GNN-CSGD storm case review

The supplied results pass the independent numerical and file-integrity checks. GNN's modest Hill Country improvement does not carry over to Edouard.

All available windows, mean corrected CRPS in mm (lower is better):

| Storm | Duration | Windows | ANN | GNN | GNN change vs ANN |
| --- | --- | --- | --- | --- | --- |
| Hill Country · July 2025 | 6 h | 16 | 3.619395 | 3.593291 | 0.72% lower |
| Hill Country · July 2025 | 12 h | 16 | 6.461240 | 6.382343 | 1.22% lower |
| Hill Country · July 2025 | 24 h | 16 | 10.895971 | 10.721107 | 1.60% lower |
| Edouard · September 2026 | 6 h | 14 | 1.592799 | 1.621648 | 1.81% higher |
| Edouard · September 2026 | 12 h | 11 | 2.782934 | 2.827655 | 1.61% higher |
| Edouard · September 2026 | 24 h | 7 | 5.473644 | 5.655377 | 3.32% higher |

For Hill Country, GNN has lower average Brier score in 8 of 13 duration–threshold comparisons and higher in 5. ANN has lower average Brier score in all 13 Edouard comparisons. These are descriptive point estimates, not significance tests or a claim of universal model superiority.

The Hill Country ANN reference is the controlled 0.25° model; Edouard uses the operational 0.25° ANN. GNN uses a 0.25° graph. Hill Country ANN and GNN were trained on different historical record sets, so this does not isolate architecture alone. Mean scores include every available window within each storm and duration, with equal window weights. Overlapping windows and nearby locations are dependent. Counts are point-window occurrences, not independent storms or unique rainfall events.

## What the maps show

The six focus windows retain their observation-based selection. In the 24-hour Hill Country focus window, the MRMS regional mean is 35.55 mm; the ANN reference predicts a distribution mean of 13.94 mm and GNN 14.70 mm. In Edouard's 24-hour focus window, the observed regional mean is 11.55 mm versus ANN 6.74 mm and GNN 6.63 mm. Both forecasts underpredict the realized regional rainfall in these particular windows. A predictive mean is not a forecast of the storm maximum.

Amount and probability maps use filled contours between the common 0.25° verification samples. Contours add no native-resolution rainfall information. County and city labels provide geographic context. Exceedance footprints and local error maps retain the original sample values.

## Scoring and verification

All frozen distributions use the corrected CSGD CRPS, including the shift times the squared probability mass at zero. Earlier case CRPS values are superseded. No checkpoint was retrained for this case update; the supplied training objectives omit that term. Consequently these results do not establish performance after retraining with the corrected loss, and they do not independently revalidate earlier annual CRPS rankings. Probability and Brier definitions remain unchanged.

Independent checks on the received handoff:

- 80 exported windows: 48 Hill Country and 32 Edouard.
- 264 original website asset hashes and all 254 PNG files verified.
- All regional array hashes verified; every model/window CRPS and every threshold Brier score reproduced.
- Maximum reproduced mean-CRPS difference: 1.78e-15 mm.
- Numerical CRPS integration checks on real focus-window distributions: maximum difference 2.56e-9 mm.
- Four actual focus maps visually inspected; no title or panel overlap seen. A full browser interaction test is not included in these checks.

The event CSV and JSON downloads preserve the exact scores and model provenance. These two case studies support keeping both ANN and GNN available for comparison; they are insufficient grounds to replace the operational ANN using GNN alone.
