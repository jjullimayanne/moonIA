# 01 · Data sources (verified)

All endpoints below were **checked on 2026‑11‑24** with HTTP requests (status, size, CORS, range support) or the provider's API. Nothing here is assumed. Re-run the checks with `make validate-sources` (ML pipeline) before relying on them.

## 1. Training data: DeepMoon supplemental materials

| Field | Value |
|---|---|
| Record | Zenodo [10.5281/zenodo.1133969](https://zenodo.org/records/1133969) (API: `https://zenodo.org/api/records/1133969`) |
| License | **CC-BY-SA-4.0** (derived artifacts we publish must keep attribution + share-alike) |
| Paper | Silburt et al. 2019, *Icarus* 317, 27–38, doi:10.1016/j.icarus.2018.06.022 (arXiv:1803.02192) |

| File | Size | Content |
|---|---|---|
| `train_images.hdf5` | 9 878.7 MB | 30 000 DEM crops, 256×256, + crater rings target masks |
| `dev_images.hdf5` | 9 878.7 MB | 30 000 validation crops |
| `test_images.hdf5` | 9 878.7 MB | 30 000 test crops |
| `train/dev/test_craters.hdf5` | 262 / 181 / 265 MB | per-image crater tables (pixel + lon/lat) |
| `LunarLROLrocKaguya_118mperpix.png` | 274.4 MB | the source DEM, 8-bit, 118 m/px, ±60° lat |
| `model_keras2.h5` | 123.4 MB | published DeepMoon weights (Keras 2) |
| `post-processed_test_craters.npy` | 0.4 MB | DeepMoon's final global test-set crater list |

Zenodo exposes an **MD5 checksum per file** via its API, which the downloader verifies. Download URLs follow `https://zenodo.org/api/records/1133969/files/<name>/content`.

**Reduced mode.** The full image set is ~30 GB. The pipeline's `smoke`/`development` profiles stream only the first *N* samples from the HDF5 files over HTTP range requests, so early experiments don't need the full download (see `ml/ingestion`).

## 2. Crater catalogs (ground truth)

| Catalog | URL | Records | Range | Coverage | License |
|---|---|---|---|---|---|
| Head et al. 2010 | `raw.githubusercontent.com/silburt/DeepMoon/master/catalogues/HeadCraters.csv` | 5 185 | D ≥ 20 km (max 2 050) | global | MIT (repo), cite Head 2010 |
| Povilaitis et al. 2018 | `…/catalogues/LROCCraters.csv` | 19 335 | 5–20 km | ±60° lat | MIT (repo), cite Povilaitis 2018 |
| IAU Gazetteer (Moon) | `planetarynames.wr.usgs.gov/shapefiles/MOON_nomenclature_center_pts.zip` (23.8 MB) | 9 087 adopted names | — | global | Public domain |
| DeepCraters (Yang et al. 2020) | figshare [10.6084/m9.figshare.12768539](https://doi.org/10.6084/m9.figshare.12768539.v1) | ~110k new craters | — | mid/low latitudes | **CC BY 4.0** |

Notes:
* The two DeepMoon CSVs use classic-Mac `\r` line endings, which the parser handles.
* IAU longitudes are 0–360° E and are normalized to [−180, 180).
* DeepCraters (`Lunar_Crater_Database_DeepCraters_2020.csv`, 5.9 MB) is a candidate **independent** reference for Phase 4, from a different instrument (Chang'E) and a different method.
* **Not yet verified:** Robbins 2018 (≈2M craters ≥1–2 km). It is the modern gold standard; we have not confirmed a stable download URL yet, so it isn't used.

## 3. Topography (DEM)

| Product | URL | Size | Grid | CRS |
|---|---|---|---|---|
| LOLA + SELENE TC merged DEM, 512 ppd (Barker et al. 2016) | `planetarymaps.usgs.gov/mosaic/LolaKaguya_Topo/Lunar_LRO_LOLAKaguya_DEMmerge_60N60S_512ppd.tif` | **22.65 GB** | 184 320 × 61 440 px, int16, scale 0.5 m, nodata −32768, **59.225 m/px** | Equirectangular on sphere R = 1 737 400 m |

* HTTP **range requests supported** (`Accept-Ranges: bytes`), so the backend reads 3×3 windows through GDAL `/vsicurl/` without downloading the file.
* Storage is **striped (one row per strip, uncompressed)**, not tiled, so a point read transfers ~1 MB (3 rows × 368 KB). That's acceptable for point queries but too slow for bulk processing; Phase 3 will convert a regional subset to a tiled COG.
* Typical vertical accuracy is ~3–4 m (Trek product metadata).
* It is the same DEM DeepMoon downsampled to 118 m/px.

## 4. Visualization tiles: NASA Moon Trek WMTS

Base: `https://trek.nasa.gov/tiles/Moon/EQ/<LAYER>/1.0.0/default/default028mm/{z}/{row}/{col}.{ext}`. All layers return `Access-Control-Allow-Origin: *` (browser-loadable) and are tiled in **EPSG:104903** (`GCS_Moon_2000`, sphere 1 737 400 m), 256 px tiles, **2×1 tiles at level 0**, top-left (−180°, 90°).

| Layer id | Use | Format | Max level | Coverage |
|---|---|---|---|---|
| `LRO_WAC_Mosaic_Global_303ppd_v02` | surface imagery | jpg | 8 | global |
| `LRO_LOLA_ClrShade_Global_128ppd_v04` | color shaded relief | png | 5 | global |
| `LRO_LOLAKaguya_ClrHillshade_60N60S_512ppd` | color hillshade | png | 10 | ±60° |
| `LRO_LOLAKaguya_Hillshade_60N60S_512ppd` | hillshade | png | 10 | ±60° |
| `LRO_LOLAKaguya_ClrSlope_60N60S_512ppd` | slope (color) | png | 10 | ±60° |
| `LRO_LOLA_ClrSlope_Global_16ppd` | slope incl. poles | png | 2 | global |

Trek does **not** publish the numeric scale of its color ramps, so the UI legends are explicitly qualitative. Exact values come from the DEM via the backend. Layer metadata comes from Trek's index service (`/moon/TrekServices/ws/index/eq/searchItems`).

## 5. Other sources reviewed

* **NASA PDS / LRO / LOLA archives** (`pds-geosciences.wustl.edu`) are the original instrument archives. The USGS and Trek derivatives above are what the MVP uses, because they are pre-mosaicked and cloud-friendly. PDS is the provenance chain.
* **Chang'E data (CLEP, `moon.bao.ac.cn`)** requires registration, so it's out of scope for the MVP.

## 6. Minimum data for the MVP

| Purpose | Data | Size |
|---|---|---|
| Map | Trek tiles (streamed by browser) | 0 stored |
| Catalog layers | Head + Povilaitis + IAU, normalized to compact JSON | ~1 MB |
| Terrain readout | USGS DEM via range requests | 0 stored |
| First training experiments | DeepMoon HDF5, first N samples streamed | ~0.1–2 GB |
