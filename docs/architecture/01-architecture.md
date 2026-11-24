# 01 · Architecture

```
                        ┌──────────────── browser ─────────────────┐
  NASA Moon Trek WMTS ─▶│ React + CesiumJS (Moon ellipsoid)        │
  (tiles, direct)       │  · catalogs (static JSON)                │
                        │  · ONNX Runtime Web worker (model, Ph.5) │
                        └───────┬───────────────┬──────────────────┘
                                │ HTTPS         │
                     ┌──────────▼───────────────▼─────────┐
                     │ CloudFront (*.cloudfront.net, free) │
                     └───┬──────────────┬──────────────┬──┘
                   /*    │   /moonai/*  │       /api/* │
                ┌────────▼───┐   ┌──────▼──────┐  ┌────▼──────────────┐
                │ S3 site    │   │ S3 data     │  │ HTTP API (throttle)│
                │ (OAC)      │   │ models/     │  │  → Lambda arm64    │
                └────────────┘   │ predictions/│  │  FastAPI + Mangum  │
                                 │ manifests/  │  └────┬───────────────┘
                                 └──────▲──────┘       │ range reads
                                        │              ▼
                         make publish   │     USGS LOLA–Kaguya DEM (22.6 GB)
                  ┌─────────────────────┴──────┐
                  │ Local ML pipeline (macOS    │  ◀── Zenodo DeepMoon, catalogs
                  │ MPS / CUDA / CPU), MLflow   │
                  └─────────────────────────────┘
```

## Components

| Layer | Tech | Responsibility |
|---|---|---|
| `frontend/` | React 19, TypeScript, Vite 8, Tailwind 4, CesiumJS 1.147, Zustand, TanStack Query, Recharts, Lucide | Lunar globe/map, layers, catalogs, selection, ROI analysis, charts, export |
| `backend/app/lunar` | NumPy | CRS constants, geodesy |
| `backend/app/catalog`, `ingestion` | pandas, pyshp, httpx (ingest group only) | Download, normalize and validate catalogs → CSV + compact JSON |
| `backend/app/terrain` | Rasterio/GDAL `/vsicurl/` | DEM point sampling, Horn slope |
| `backend/app/api` | FastAPI (+ Mangum on Lambda) | `/api/health`, `/api/catalogs/*`, `/api/terrain/point` |
| `ml/` | PyTorch, h5py, MLflow (local) | Dataset manager, preprocessing, U-Net, training, evaluation, ONNX export, publishing |
| `infrastructure/terraform` | Terraform (AWS provider 6) | S3, CloudFront, Lambda, HTTP API, Budgets, OIDC |

## Architecture decisions (ADR log)

**ADR-1: CesiumJS with a lunar ellipsoid, without Resium.** Cesium ≥1.116 supports `Ellipsoid.default`, and `Ellipsoid.MOON` is the IAU sphere. Trek's tile matrix (EPSG:104903, 2×1 at L0) is exactly `GeographicTilingScheme` on that ellipsoid, so tiles align without reprojection. The viewer is driven imperatively from one React component and a Zustand store; Resium would add a wrapper layer with no gain here. No Cesium ion token is needed, and no commercial map APIs are used.

**ADR-2: The static frontend works on its own.** Catalogs are preprocessed into static JSON (~1 MB), imagery comes straight from NASA, and the API is optional (`VITE_API_URL=off` on GitHub Pages). This makes hosting nearly free and the demo resilient.

**ADR-3: No database yet.** About 25k crater records fit in memory and in static files. PostGIS is deferred until there's a concrete need, such as millions of detections or multi-user editing. When that happens, it must use a lunar `spatial_ref_sys` entry (see `docs/scientific/02-lunar-crs.md`).

**ADR-4: Remote DEM reads instead of storing 22.6 GB.** A range-request read costs ~1 MB per point. It avoids S3 storage cost and the 20 GB storage cap.

**ADR-5: HTTP API instead of a Lambda Function URL.** Function URLs are free but can't be rate-limited. The HTTP API costs $1/M requests and adds stage throttling (5 rps, burst 10). Reserved concurrency (2) caps Lambda cost.

**ADR-6: Training stays local.** No AWS GPUs or SageMaker. The browser runs inference via ONNX Runtime Web, and AWS only stores versioned, approved artifacts.

**ADR-7: Ingestion dependencies stay out of the Lambda bundle.** Moving pandas/pyshp/httpx to an `ingest` dependency group cut the bundle from 217 → 177 MB unzipped (Lambda limit 250 MB) and lowers cold-start time.

## Runtime modes

| Mode | Frontend | API | Use |
|---|---|---|---|
| Local dev | `npm run dev` :5173 | `uvicorn` :8000 | development |
| Docker Compose | nginx :8080 | :8000 | demo on any machine |
| GitHub Pages | static, `VITE_API_URL=off` | none | free public preview |
| AWS | S3 + CloudFront | Lambda via `/api/*` (same origin) | production (only with explicit authorization) |
