# 02 · Lunar coordinate reference system

**Decision.** Every MoonAI component uses one lunar CRS:

| Element | Choice |
|---|---|
| Body model | IAU/IAG Moon **sphere**, R = 1 737 400 m |
| Codes | ESRI `GCS_Moon_2000` = EPSG-style `104903` (Trek); IAU 2015 `IAU:30100` |
| Body-fixed frame | Mean Earth / Polar Axis (ME), used by LOLA and LROC products |
| Latitude | planetocentric, degrees, north positive |
| Longitude | **east positive**, degrees, normalized to [−180°, 180°) |
| Heights | metres relative to the 1 737.4 km reference sphere |

## Why it matters

* **Not WGS84.** Earth's ellipsoid has a semi-major axis of 6 378 137 m and a flattening of 1/298. Putting lunar textures on it inflates every distance by a factor of 3.67 and distorts areas, slopes and crater sizes. The frontend sets `Ellipsoid.default = Ellipsoid.MOON` (Cesium ≥ 1.146: `@cesium/core`, radii 1 737 400 m on all three axes) and builds the globe, the 2D `GeographicProjection` and the tiling scheme on it.
* **0–360° vs ±180°.** IAU and PDS products often use 0–360° E, while DeepMoon catalogs use ±180°. Everything is normalized on ingestion (`normalize_lon`), and the search box accepts both conventions.
* **GeoJSON.** RFC 7946 mandates WGS84, so our exports carry `"moonai:crs"` and `"moonai:meta"` foreign members. **Never load them into a terrestrial GIS layer without assigning the lunar CRS** (in QGIS, use `GCS_Moon_2000` / `IAU:30100`).
* **PostGIS.** `geography` types assume WGS84 by default. When a database is added, use `geometry` with a custom `spatial_ref_sys` entry for IAU:30100 and compute distances/areas with spherical formulas on R = 1 737.4 km (or `ST_DistanceSphere` with an explicit spheroid). Don't use `geography`. Until there is a concrete need, files are used instead (see architecture ADR-3).

## Geodesy used in code (backend `app/lunar/crs.py`, frontend `src/lib/lunar.ts`)

* Distance: haversine on R = 1 737.4 km.
* Crater rim polygon: the direct geodesic problem on the sphere (exact). The unit test asserts that every vertex lies at D/2 from the center.
* Rectangle area: `R² · Δλ · |sin φ₂ − sin φ₁|`, which handles antimeridian crossing.
* Slope: Horn (1981) 3×3 with the true east–west spacing `dx = res · cos φ` for equirectangular rasters.

## Raster ↔ geographic mapping

The USGS DEM is equirectangular in metres (`x = R·λ`, `y = R·φ`, standard parallel 0°). The backend maps (λ, φ) → (x, y) → (row, col) with the file's affine transform. The DeepMoon crops are **orthographic reprojections** around each crop center, so pixel→lon/lat uses the per-image `longlat_bounds` stored in the HDF5 files (handled in `ml/preprocessing`).
