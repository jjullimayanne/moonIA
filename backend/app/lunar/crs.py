"""Lunar coordinate reference system utilities.

Convention used across MoonAI (see docs/scientific/02-lunar-crs.md):

* Body: Moon, IAU/IAG reference sphere, R = 1 737 400 m
  (ESRI "GCS_Moon_2000", IAU 2015 code IAU:30100). All products used in the MVP
  (LOLA, LOLA-Kaguya DEM, LROC WAC, DeepMoon catalogs, IAU gazetteer) are
  referenced to this sphere in the Mean Earth / Polar Axis (ME) frame.
* Latitude: planetocentric, degrees, north positive, [-90, 90].
* Longitude: east positive, degrees, normalized to [-180, 180).
"""

from __future__ import annotations

import math

import numpy as np

MOON_RADIUS_M = 1_737_400.0
MOON_RADIUS_KM = MOON_RADIUS_M / 1000.0
CRS_NAME = "GCS_Moon_2000 (IAU:30100) — sphere R=1737.4 km, planetocentric, east-positive"


def normalize_lon(lon):
    """Map east-positive longitudes (e.g. 0–360) to [-180, 180)."""
    return (np.asarray(lon, dtype=float) + 180.0) % 360.0 - 180.0


def great_circle_km(lon1, lat1, lon2, lat2):
    """Haversine distance on the lunar sphere, in km."""
    lon1, lat1, lon2, lat2 = map(np.radians, (lon1, lat1, lon2, lat2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * MOON_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def bbox_area_km2(west: float, south: float, east: float, north: float) -> float:
    """Area of a lon/lat rectangle on the lunar sphere (handles antimeridian crossing)."""
    width = (east - west) % 360.0 or (360.0 if east != west else 0.0)
    return (
        MOON_RADIUS_KM**2
        * math.radians(width)
        * abs(math.sin(math.radians(north)) - math.sin(math.radians(south)))
    )


def in_bbox(lon, lat, west: float, south: float, east: float, north: float):
    """Boolean mask of points inside a lon/lat box; supports boxes crossing ±180°."""
    lon = np.asarray(lon)
    lat = np.asarray(lat)
    lat_ok = (lat >= south) & (lat <= north)
    if west <= east:
        return lat_ok & (lon >= west) & (lon <= east)
    return lat_ok & ((lon >= west) | (lon <= east))


def metres_per_degree_lat() -> float:
    return math.pi * MOON_RADIUS_M / 180.0
