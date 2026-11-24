# MoonAI — Lunar Intelligence Platform

**An interactive, scientifically grounded lunar exploration platform: a "Google Earth for the Moon" built on real NASA/USGS data, with a deep-learning crater detector on the way.**

Developed for the **Space Tech Bootcamp 2026 (FTL Brazil)**.

![MoonAI — Tycho crater with LOLA + Kaguya color hillshade, Head 2010 crater rims and live DEM readout](docs/assets/moonai-tycho.jpg)

> **Status (Phase 2 of 7).** The lunar map, real data layers, crater catalogs, terrain readout and science panel are **operational**. The deep-learning detector is **not trained yet**, and the UI says so explicitly: no simulated detections or metrics are ever shown as real.

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
| U-Net crater detection, model metrics, confidence | DeepMoon dataset | ⏳ Phase 4 |

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
4. ⏳ U-Net training and scientific evaluation (local / Apple Silicon MPS / Colab)
5. ⏳ Inference integration: ONNX Runtime Web in a Web Worker, versioned models via `latest.json`
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
