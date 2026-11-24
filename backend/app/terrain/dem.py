"""Point terrain analysis on the LOLA + Kaguya TC merged DEM (Barker et al. 2016).

The DEM is equirectangular on the 1737.4 km sphere (512 px/deg, ~59.2 m/px),
int16 with scale 0.5 → metres relative to the 1737.4 km reference radius.
Slope is computed from a 3×3 window with Horn's method, using the true
east-west pixel spacing at the sampled latitude (dx = res · cos φ).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import rasterio
from rasterio.windows import Window

from app.config import settings
from app.lunar.crs import MOON_RADIUS_M

GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_TIMEOUT": "30",
}
DEM_LAT_LIMIT = 60.0


@dataclass
class TerrainSample:
    lon: float
    lat: float
    elevation_m: float
    slope_deg: float
    pixel_size_m: float
    source: str


def horn_slope_deg(win: np.ndarray, dx: float, dy: float) -> float:
    """Horn (1981) slope of the centre cell of a 3×3 elevation window (metres)."""
    z = win.astype(float)
    dzdx = ((z[0, 2] + 2 * z[1, 2] + z[2, 2]) - (z[0, 0] + 2 * z[1, 0] + z[2, 0])) / (8 * dx)
    dzdy = ((z[2, 0] + 2 * z[2, 1] + z[2, 2]) - (z[0, 0] + 2 * z[0, 1] + z[0, 2])) / (8 * dy)
    return math.degrees(math.atan(math.hypot(dzdx, dzdy)))


@lru_cache(maxsize=1)
def _open():
    env = rasterio.Env(**GDAL_ENV)
    env.__enter__()
    return rasterio.open(settings.dem_url)


def sample(lon: float, lat: float) -> TerrainSample:
    if abs(lat) > DEM_LAT_LIMIT - 0.01:
        raise ValueError("The LOLA-Kaguya DEM only covers latitudes within ±60°.")
    ds = _open()
    x = math.radians(lon) * MOON_RADIUS_M
    y = math.radians(lat) * MOON_RADIUS_M
    row, col = ds.index(x, y)
    win = ds.read(1, window=Window(col - 1, row - 1, 3, 3)).astype(float)
    if ds.nodata is not None and (win == ds.nodata).any():
        raise ValueError("No DEM data at this location.")
    win = win * (ds.scales[0] or 1.0) + (ds.offsets[0] or 0.0)
    res = abs(ds.transform.a)
    dx = res * math.cos(math.radians(lat))
    return TerrainSample(
        lon=lon,
        lat=lat,
        elevation_m=float(win[1, 1]),
        slope_deg=horn_slope_deg(win, dx, res),
        pixel_size_m=res,
        source="LRO LOLA + SELENE Kaguya TC merged DEM 512ppd (Barker et al. 2016), USGS Astrogeology",
    )
