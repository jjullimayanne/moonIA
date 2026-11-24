import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api import main
from app.ingestion.catalogs import parse_head
from app.lunar.crs import MOON_RADIUS_KM, bbox_area_km2, great_circle_km, in_bbox, normalize_lon
from app.terrain.dem import horn_slope_deg


def test_normalize_lon():
    assert np.allclose(normalize_lon([0, 180, 270, 359.5, -190]), [0, -180, -90, -0.5, 170])


def test_great_circle_quarter_meridian():
    assert great_circle_km(0, 0, 0, 90) == pytest.approx(math.pi * MOON_RADIUS_KM / 2)


def test_bbox_area_whole_sphere_and_antimeridian():
    assert bbox_area_km2(-180, -90, 180, 90) == pytest.approx(4 * math.pi * MOON_RADIUS_KM**2)
    assert bbox_area_km2(170, -10, -170, 10) == pytest.approx(bbox_area_km2(-10, -10, 10, 10))


def test_in_bbox_antimeridian():
    assert list(in_bbox([175, -175, 0], [0, 0, 0], 170, -5, -170, 5)) == [True, True, False]


def test_horn_slope_plane():
    dx = dy = 10.0
    # plane rising 1 m per 10 m eastward → atan(0.1)
    win = np.array([[0, 1, 2]] * 3, dtype=float)
    assert horn_slope_deg(win, dx, dy) == pytest.approx(math.degrees(math.atan(0.1)))


def test_parse_head_handles_cr_line_endings():
    raw = b"Lon,Lat,Diam_km\r10,20,30\r200,-5,25\r"
    df = parse_head(raw)
    assert list(df.lon) == [10, -160] and list(df.diameter_km) == [30, 25]


def test_api_health_and_craters(monkeypatch):
    fake = {k: np.array(v, dtype=float) for k, v in {"lon": [0, 50, 179], "lat": [0, 10, 0], "diameter_km": [25, 40, 100]}.items()}
    monkeypatch.setattr(main, "load_catalog", lambda cid: fake)
    client = TestClient(main.app)
    h = client.get("/api/health").json()
    assert h["model"]["status"] == "not_trained"
    r = client.get("/api/catalogs/head2010/craters", params={"west": -10, "east": 60, "dmin": 30}).json()
    assert r["count"] == 1 and r["craters"][0]["lon"] == 50
    assert client.get("/api/catalogs/nope/craters").status_code == 404
