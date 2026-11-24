# MoonAI — Lunar Intelligence Platform

**An interactive, scientifically grounded lunar exploration platform: a "Google Earth for the Moon" built on real NASA/USGS data, with a deep-learning crater detector on the way.**

Developed for the **Space Tech Bootcamp 2026 (FTL Brazil)**.

![MoonAI — Tycho crater with LOLA + Kaguya color hillshade, Head 2010 crater rims and live DEM readout](docs/assets/moonai-tycho.jpg)

> **Status.** Lunar map, real data layers, catalogs, terrain readout, local training pipeline and the first trained model (**v1**, a reduced DeepMoon reproduction; see Results) are operational. All metrics shown come from real runs. Smoke runs are labelled as such, and nothing is simulated.

---

## What it does today

| Feature | Data | Status |
|---|---|---|
| 3D globe and 2D map of the Moon on a **true lunar ellipsoid** (IAU sphere, R = 1737.4 km — not WGS84) | — | ✅ |
| Surface imagery: LROC WAC global mosaic (~100 m/px) | NASA Moon Trek | ✅ real |
| Elevation: LOLA color shaded relief (global), LOLA + Kaguya color hillshade / hillshade (59 m/px, ±60°) | NASA Moon Trek | ✅ real |
| Slope: LOLA + Kaguya (59 m/px) and LOLA global (poles) | NASA Moon Trek | ✅ real |
| Catalogued craters drawn as true geodesic rims: Head et al. 2010 (5 185, ≥ 20 km) and Povilaitis et al. 2018 (19 335, 5–20 km) | DeepMoon repo | ✅ real |
| IAU nomenclature labels + search by name or coordinates (`9.62, -20.08`, `9.62N 20.08W`, 0–360° E) | USGS Gazetteer | ✅ real |
| Click a point → exact **elevation** and **slope (Horn 3×3)** from the 22.6 GB LOLA–Kaguya DEM, read remotely by HTTP range requests | USGS Astrogeology | ✅ real (needs API) |
| Region of interest: spherical area, crater counts, density, **GeoJSON/CSV export** (lunar CRS declared) | — | ✅ |
| Science panel: √2-binned diameter histogram, cumulative size-frequency distribution, table view | — | ✅ |
| ⓘ hover explanations for every layer, panel and chart | — | ✅ |
| U-Net crater detection: model v1 trained locally, AI detections layer, Training Studio, AI Playground (browser inference), experiment registry | DeepMoon dataset | ✅ real (reduced reproduction) |

## Tech stack

**Frontend** (`frontend/`)
* **React 19 + TypeScript + Vite 8**
* **CesiumJS 1.147**: globe and 2D map; `Ellipsoid.MOON` + `GeographicTilingScheme` aligned with Trek's EPSG:104903 tiles. No Cesium ion token or commercial map APIs.
* **Tailwind CSS 4**: dark "mission control" design system (glass panels, cyan signal accents, Space Grotesk + JetBrains Mono)
* **Zustand** (UI/map state), **TanStack Query** (data fetching and caching), **Recharts** (science charts), **Lucide** (icons)
* **Vitest** unit tests for lunar geodesy and crater statistics

**Backend** (`backend/`)
* **Python 3.12 + FastAPI**, managed with **uv** (like the bootcamp setup)
* **Rasterio / GDAL `/vsicurl/`** for windowed DEM reads, **NumPy** for geodesy
* **Mangum** adapter so the same app runs on **AWS Lambda**
* Ingestion (pandas, pyshp, httpx) lives in a separate dependency group, outside the Lambda bundle
* **pytest** + **ruff**

**Infrastructure** (`infrastructure/`, `.github/`)
* **Terraform**: S3 + CloudFront (OAC) + Lambda (arm64) + API Gateway HTTP API + AWS Budgets + GitHub OIDC, **designed for < US$ 5/month** ([cost estimate](docs/architecture/02-aws-cost-estimate.md))
* **Docker / Docker Compose** for a one-command local stack
* **GitHub Actions**: CI (tests, typecheck, build, `terraform validate`), GitHub Pages preview, and a manual-only AWS deploy via OIDC

## Quick start

```bash
# 1. Backend (Python ≥ 3.12, uv)
cd backend
uv sync
uv run python -m app.ingestion.catalogs     # downloads + normalizes the real catalogs
uv run uvicorn app.api.main:app --port 8000

# 2. Frontend (Node ≥ 22)
cd ../frontend
npm install
npm run dev                                 # http://localhost:5173
```

Or with Docker: `docker compose up --build`, then open http://localhost:8080.

Tests:

```bash
cd backend && uv run pytest && uv run ruff check .
cd frontend && npm test && npm run typecheck
```


## Deep-learning pipeline (local training)

All training and inference run **on your own machine** (Apple Silicon MPS, NVIDIA CUDA or CPU, detected automatically). AWS only ever stores published, approved artifacts.

```bash
make pipeline PROFILE=development      # download → preprocess → train → evaluate → ONNX → gate → publish to the local site
make pipeline PROFILE=production PUBLISH=true   # also uploads approved artifacts to S3 (explicit opt-in)
make resume | status | dry-run | dashboard | rollback VERSION=v1 | cost-check
```

| Profile | Train / val / test tiles | U-Net width | Epochs | Purpose |
|---|---|---|---|---|
| `smoke` | 64 / 32 / 0 | 16 | 3 | checks the whole pipeline in ~30 s; **never published as a model** |
| `development` | 2 000 / 400 / 400 | 32 | 10 | real reduced experiment, sized for a 16 GB Mac |
| `production` | 30 000 / 5 000 / 5 000 | 112 | 4 | DeepMoon reproduction (needs ~12 GB free disk) |

### The data as it comes (DeepMoon, Zenodo 10.5281/zenodo.1133969)

Measured on the downloaded tiles, not copied from the paper:

| | Raw format |
|---|---|
| **Input** `input_images` | `uint8`, 256 × 256 px, one channel. Each tile is an **orthographic re-projection** of a square crop of the LRO LOLA + SELENE Kaguya merged DEM (downsampled to 118 m/px), resized to 256 px. Pixel values are **relative elevation** in 0–255 (observed 0–177, mean 100.3, σ 42.4). About **14 % of pixels are 0**, which is padding at the tile edges left by the projection. |
| **Target** `target_masks` | `float32` {0, 1}: **1-pixel-wide rings** drawn at every catalogued crater rim (Head 2010 ≥ 20 km + Povilaitis 2018 5–20 km). Rims cover only **1.45 % of pixels**, a strong class imbalance. |
| **Georeferencing** | per tile: `longlat_bounds` (lon/lat extent), `pix_distortion_coefficient`, `cll_xy`. Tiles span 2–25° of latitude, so the scale ranges from **0.26 to 2.97 km/px** (median 0.67). |
| **Crater tables** `*_craters.hdf5` | per tile: lon, lat, diameter (km) and pixel x, y, diameter. A median of 11 craters per tile (0–189). |
| **Split** | by **longitude band**: train −180°…−60°, validation −60°…60°, test 60°…180°. The pipeline *verifies* the bands are disjoint and refuses to train otherwise. |

Only the tiles a profile needs are downloaded. The image arrays are stored contiguously in the HDF5 files, so the first *N* tiles are fetched with HTTP range requests (≈0.33 MB per tile instead of 9.9 GB per file), with every file MD5-checked against Zenodo.

### Normalization and augmentation

* **Input:** `x / 255 → [0, 1]`, the exact convention of the published data. Padding stays at 0. The same rule is stored in the model metadata (`normalization: divide_by 255`) so browser inference reproduces it.
* **Target:** binarized (`> 0.5`) and stored as `uint8`.
* **Augmentation (training only):** random 90° rotations and horizontal flips. These are the only transforms that keep circular rims circular and avoid interpolating elevation values. No shear, scaling or color jitter.

### Network architecture: U-Net (after DeepMoon, Silburt et al. 2019)

```
input 1×256×256 (DEM, [0,1])
 ├─ enc1: [conv3×3 → ReLU] ×2 → F      ──────────────────────────────┐ skip
 │  maxpool 2×2 → 128²                                                │
 ├─ enc2: [conv3×3 → ReLU] ×2 → 2F     ────────────────────┐ skip      │
 │  maxpool → 64²                                          │           │
 ├─ enc3: [conv3×3 → ReLU] ×2 → 4F     ─────────┐ skip      │           │
 │  maxpool → 32²                               │           │           │
 ├─ bottleneck: [conv3×3 → ReLU] ×2 → 4F         │           │           │
 ├─ up ×2 (nearest) ⊕ enc3 → dropout → [conv → ReLU]×2 → 2F  │           │
 ├─ up ×2 ⊕ enc2 → dropout → [conv → ReLU]×2 → F             │           │
 ├─ up ×2 ⊕ enc1 → dropout → [conv → ReLU]×2 → F                         │
 └─ conv1×1 → 1×256×256 logits → sigmoid = probability that a pixel is a crater rim
```

| | DeepMoon (paper/code) | MoonAI |
|---|---|---|
| Filters F | 112 | 112 (production) · 32 (development) · 16 (smoke) |
| Parameters | — | ≈10.3 M at F = 112 · ≈0.84 M at F = 32 |
| Dropout | 0.15 | 0.15 (`Dropout2d`, decoder) |
| Init | He-normal | He-normal (Kaiming) |
| Loss | binary cross-entropy on sigmoid | `BCEWithLogitsLoss` (same objective, numerically stabler) |
| Optimizer | Adam, lr 1e-4, L2 1e-6 | Adam, lr 1e-4, weight decay 1e-6, ReduceLROnPlateau ×0.5 |
| Batch / epochs | 8 / 4 | automatic from free memory (halved on OOM) / per profile, early stopping |
| Framework | Keras | PyTorch 2.15 (MPS / CUDA / CPU) → ONNX opset 17 |

### From pixels to craters (evaluation)

1. Threshold the predicted probability at **0.1** and run **ring template matching** for radii 5–40 px, keeping correlation > **0.5**. Near-duplicates are merged with DeepMoon's criteria: Δpos²/r² < 1.8 and Δr/r < 1.0.
2. Match detections **one-to-one** to the catalog craters of each tile under the same criteria, which gives precision, recall, F1, and location and diameter errors. The pixel IoU of the rim map is reported too.
3. Convert pixels to lunar **lon/lat/diameter** with DeepMoon's inverse orthographic transform (verified against the catalog: median error 0.01° lon, 0.002° lat, 0 % diameter).
4. **Quality gate** (validation set only): ONNX ≡ PyTorch (max |Δp| ≤ 1e-3), size limit, minimum F1, and it must beat the currently published model. The **test set** is evaluated once, only for an approved model.

### Results: model v1 (development profile, trained locally on Apple Silicon)

Run `development-20261124-115919-0b5ebde`: 2 000 training / 400 validation / 400 test tiles, U-Net F = 32 (0.84 M parameters), 10 epochs × ~82 s on MPS (batch 4), about 14 min of training. Passed the quality gate and published as **v1**.

| Metric | Validation (−60°…60° lon) | **Test (60°…180° lon, evaluated once)** |
|---|---|---|
| Precision (vs. catalog, lower bound) | 0.669 | **0.705** |
| Recall | 0.244 | **0.156** |
| F1 | 0.358 | **0.256** |
| Median location error (Δpos / r) | 0.117 | 0.116 |
| Median diameter error (Δr / r) | 0.063 | 0.055 |
| Rim-pixel IoU (threshold 0.1) | 0.114 | 0.129 |
| Inference | 8.4 ms/tile (MPS) · 48 ms/tile (ONNX CPU) · ~320 ms/tile (browser, wasm 1 thread) | |

**Recall vs. crater size** (validation, radius in pixels): 5–7 px **0.30** · 7–10 px 0.29 · 10–14 px 0.22 · 14–20 px 0.13 · 20–28 px 0.09 · 28–40 px **0.05**.
**F1 vs. resolution** (km/px): < 0.25: 0.48 · 0.25–0.5: 0.47 · 0.5–1: **0.55** · 1–2: 0.36 · 2–4: **0.20**.

Interpretation, honestly stated:
* This is a **reduced reproduction**. It used 7 % of DeepMoon's training tiles, a 3.5× narrower network, and 10 short epochs, so it is far from DeepMoon's 92 % recall. Detections are **precise** (≈70 % match a catalogued crater, and the rest may be real uncatalogued craters) but **recall is low**, especially for large craters. With 3 levels of pooling, the receptive field is smaller than big rims.
* Test recall is lower than validation recall. The test band (60°–180° E) is dominated by far-side highlands, with more numerous and overlapping craters (8 670 catalogued vs 3 883 in the same number of validation tiles). A plausible explanation, **not yet tested**, is a terrain shift. The stratified terrain analysis (mare vs highland) is the planned check.
* **Next experiment:** the production profile (30 k tiles, F = 112), plus a class-balanced loss for the 1.45 % rim pixels.
* ONNX matches PyTorch to 2·10⁻⁶. The int8-quantized model is 0.83 MB (vs 3.21 MB) but shifts probabilities by up to 0.098, so the **fp32 model is the one published**.
* Global deduplication merged 3 336 tile-level detections into **2 214 unique craters**. **657** of them match no catalogued crater and are shown as *candidates* in the Explorer ("Only uncatalogued"). They are **not confirmed discoveries**.
* *Correction log:* the first computation of pixel IoU used a 0.5 threshold, above every probability this model outputs (max 0.52), and reported 0.100. It was recomputed at DeepMoon's 0.1 binarization threshold, excluding crater-free tiles, from the saved predictions.

**Post-processing ceiling.** Run on the *ground-truth* rings themselves, the matcher reaches precision 0.88 / recall 0.86 when rims are ~3 px wide (typical CNN output), but only recall 0.42 on the perfect 1-px rings. A 2-px template correlates weakly with 1-px lines. This is a property of DeepMoon's post-processing and is kept unchanged for comparability.

## Scientific foundations

**Research question.** *How well can deep-learning models identify lunar craters from topographic data, and how does that ability vary with crater size, spatial resolution and terrain characteristics?*

* **Reference methodology: DeepMoon** (Silburt et al. 2019, *Icarus*). A U-Net segments crater rims in DEM crops, then template matching extracts (lon, lat, radius). We reproduce it first, with parameters verified from the original source code, before proposing improvements.
* **Improvement direction: Yang et al. 2020** (*Nature Communications*). Transfer learning with Chang'E DOM + DEM data identified 109,956 new craters.
* **No spatial leakage.** Train/validation/test sets come from disjoint longitude bands, asserted by the pipeline. The test set is never used for model selection.
* **Responsible use.** Regions are only flagged as *areas of interest for further investigation*. Slope and crater counts at these resolutions don't establish landing safety.

Docs:
* [Data sources (verified URLs, licenses, sizes, formats)](docs/scientific/01-data-sources.md)
* [Lunar coordinate reference system](docs/scientific/02-lunar-crs.md)
* [Methodology & experiment design](docs/scientific/03-methodology.md)
* [Architecture & decisions](docs/architecture/01-architecture.md)
* [AWS cost estimate (validated prices)](docs/architecture/02-aws-cost-estimate.md)
* [Bibliography](docs/references/bibliography.md)

## Data & licenses

| Data | Provider | License |
|---|---|---|
| LROC WAC, LOLA, LOLA–Kaguya tiles | NASA Moon Trek (LRO / JAXA SELENE) | NASA open data |
| LOLA + Kaguya merged DEM (Barker et al. 2016) | USGS Astrogeology | Public domain |
| DeepMoon dataset | Zenodo 10.5281/zenodo.1133969 | CC-BY-SA-4.0 |
| Head 2010 / Povilaitis 2018 catalogs | via DeepMoon repo | MIT (repo); cite original papers |
| IAU lunar nomenclature | USGS Gazetteer of Planetary Nomenclature | Public domain |

## Roadmap

1. ✅ Scientific validation and real-data access
2. ✅ Frontend with lunar map and real geospatial layers
3. ⏳ Data-processing pipeline (DeepMoon HDF5 streaming, DEM tiling)
4. 🟡 U-Net training and scientific evaluation: v1 (development) done; production reproduction pending
5. ✅ Inference integration: ONNX Runtime Web in a Web Worker, versioned models via `latest.json`
6. ⏳ Topographic analysis and stratified scientific results
7. ⏳ Documentation and presentation

## Repository layout

```
moonai/
  frontend/          React + CesiumJS app
  backend/           FastAPI app (lunar CRS, catalogs, terrain, API, Lambda handler)
  ml/                deep-learning pipeline (in progress)
  data/catalogs/     normalized real crater catalogs (CSV, small, versioned)
  infrastructure/    Terraform (AWS, ≤ US$ 5/month)
  docs/              scientific & architecture documentation
  .github/workflows/ CI, Pages preview, manual AWS deploy
```

---

Imagery and topography courtesy of NASA/GSFC/Arizona State University (LROC), NASA/GSFC (LOLA), JAXA/SELENE (Kaguya TC), NASA Moon Trek and USGS Astrogeology Science Center.
