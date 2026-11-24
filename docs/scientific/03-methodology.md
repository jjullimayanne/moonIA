# 03 · Methodology and experiment design

## Research question

> How well can deep-learning models identify lunar craters from topographic data, and how does that ability vary with **crater size**, **spatial resolution** and **terrain characteristics**?

## Reference methodology (reproduce first)

### DeepMoon (Silburt et al. 2019), the baseline we reproduce

Parameters were verified against the source code at `github.com/silburt/DeepMoon` (`run_input_data_gen.py`, `model_train.py`, `run_model_train.py`, `utils/template_match_target.py`):

| Stage | DeepMoon setting |
|---|---|
| Input | LOLA–Kaguya DEM downsampled to 118 m/px, ±60° lat |
| Crops | random squares of 500–6 500 px (log-uniform), orthographically reprojected, resized to **256×256** |
| Target | binary **rings** (rim width 1 px) drawn from Head (≥20 km) + Povilaitis (5–20 km); min radius 1 px |
| Network | U-Net, 3 down/up levels, **112** filters (×1, ×2, ×4), 3×3 conv, ReLU, dropout **0.15**, sigmoid output, He-normal init, L2 **1e‑6** |
| Training | Adam lr **1e‑4**, batch **8**, **4 epochs**, binary cross-entropy, 30 000 training images |
| Post-processing | threshold target at **0.1**; template-match rings for radii **5–40 px**, keep matches with correlation > **0.5**; merge duplicates when Δpos²/min(r)² < **1.8** and Δr/min(r) < **1.0** |
| Reported result | recall **92 %** of human-catalogued test craters; median fractional lon/lat/radius errors **≤ 11 %**; ~2× more detections than the catalog, estimated **11 %** false-positive rate among new craters (manual check of 361) |

Split: the paper separates train/validation/test into **distinct longitude bands**, which avoids spatial leakage. Our ingestion step reads the `longlat_bounds` of every sample and **asserts** that the three sets don't overlap in longitude. It reports the observed bands rather than trusting this description.

### Yang et al. 2020 (Nature Communications), the improvement direction

They used Chang'E-1/2 DOM + DEM with **transfer learning** in two stages: a detector initialized on 7 895 recognized craters, then progressively retrained. They identified 109 956 new craters and estimated the formation system of 18 996 craters > 8 km. Two lessons apply to MoonAI: (1) **combining optical imagery with DEM** improves small-crater detection, and (2) **iterative self-training** with human verification expands catalogs. Both are planned for after the baseline is reproduced. Their database (CC BY 4.0) is an independent reference set.

## Matching criteria (detection ↔ catalog)

A detection *d* matches catalog crater *c* when both hold (DeepMoon criteria, kept for comparability):

1. **Position:** `((λ_d−λ_c)² cos²φ + (φ_d−φ_c)²) / r_min² < 1.8`, with distances converted to km on R = 1 737.4 km and `r_min = min(r_d, r_c)`
2. **Size:** `|r_d − r_c| / r_min < 1.0`

Matching is one-to-one and greedy by ascending normalized distance. From it:

* **Precision** = matched / detections, **Recall** = matched / catalog (within the catalog's completeness range), **F1**
* **Location error** = great-circle offset / r_c; **diameter error** = |D_d − D_c| / D_c (median + IQR)
* **IoU**: pixel IoU between predicted and target ring masks (segmentation quality, before post-processing)
* **Inference time** per 256² tile and per km², with hardware recorded

Unmatched detections are **not automatically false positives**. Catalogs are incomplete below their size limits (DeepMoon found ~2× more craters). We report precision against the catalog *and* flag that it is a lower bound.

## Stratified analysis (the research question)

| Axis | Strata |
|---|---|
| Crater size | √2 diameter bins, 5–>100 km (pixel radius depends on crop scale, which is also reported) |
| Resolution | effective m/px of each crop (500–6 500 px source → 256 px), binned; plus a controlled experiment re-sampling the same regions to 59 / 118 / 236 / 472 m/px |
| Terrain | mare vs highland (from the USGS unified geologic map), mean slope, local crater density |

## Leakage controls

* Train/validation/test from **disjoint longitude bands** (asserted, not assumed).
* The **quality gate uses validation only**. The test set is evaluated once per approved model and never used for model selection.
* Augmentations: 90° rotations and flips only. They preserve circular rims; no shear or anisotropic scaling, which would turn craters into ellipses.

## Responsible interpretation

MoonAI flags regions only as **areas of interest for further investigation**. Slope at 59 m/px and catalogued crater counts can't establish landing safety: boulders, sub-pixel slopes and illumination are not resolved at these scales.

## Reproducibility

Each run records the config YAML, git commit, seed, dataset checksums and versions, hardware, and library versions (in MLflow, locally). Published models carry a SHA-256 and a `metadata.json` with input format and normalization.
