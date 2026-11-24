"""MoonAI HTTP API."""

from __future__ import annotations

import csv
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from app.catalog.sources import CATALOGS
from app.config import settings
from app.lunar.crs import CRS_NAME, in_bbox
from app.terrain import dem

app = FastAPI(title="MoonAI API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET"], allow_headers=["*"]
)


@lru_cache(maxsize=8)
def load_catalog(cid: str) -> dict[str, np.ndarray]:
    """Normalized catalog as numpy columns (lon, lat, diameter_km). pandas is kept out of the Lambda bundle."""
    path = settings.data_dir / "catalogs" / f"{cid}.csv"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing — run `python -m app.ingestion.catalogs`")
    with path.open(newline="") as f:
        rows = list(csv.DictReader(f))
    return {k: np.array([float(r[k]) for r in rows]) for k in ("lon", "lat", "diameter_km")}


@app.get("/api/health")
def health(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {
        "status": "ok",
        "version": app.version,
        "crs": CRS_NAME,
        # No trained model is shipped yet (Phase 4). Never report a fake one.
        "model": {"status": "not_trained", "name": None},
    }


@app.get("/api/catalogs")
def list_catalogs():
    return [
        {"id": s.id, "name": s.name, "license": s.license, "citation": s.citation, "url": s.url}
        for s in CATALOGS.values()
    ]


@app.get("/api/catalogs/{cid}/craters")
def craters(
    response: Response,
    cid: str,
    west: float = Query(-180, ge=-180, le=180),
    south: float = Query(-90, ge=-90, le=90),
    east: float = Query(180, ge=-180, le=180),
    north: float = Query(90, ge=-90, le=90),
    dmin: float = Query(0, ge=0),
    dmax: float = Query(1e9, ge=0),
    limit: int = Query(50_000, ge=1, le=200_000),
):
    response.headers["Cache-Control"] = "public, max-age=86400"
    if cid not in CATALOGS:
        raise HTTPException(404, f"Unknown catalog '{cid}'")
    try:
        df = load_catalog(cid)
    except FileNotFoundError as e:
        raise HTTPException(503, str(e)) from e
    d = df["diameter_km"]
    mask = in_bbox(df["lon"], df["lat"], west, south, east, north) & (d >= dmin) & (d <= dmax)
    idx = np.flatnonzero(mask)[:limit]
    craters = [{k: float(df[k][i]) for k in ("lon", "lat", "diameter_km")} for i in idx]
    return {"catalog": cid, "crs": CRS_NAME, "count": int(mask.sum()), "craters": craters}


@app.get("/api/terrain/point")
def terrain_point(
    response: Response, lon: float = Query(..., ge=-180, le=180), lat: float = Query(..., ge=-90, le=90)
):
    try:
        sample = dem.sample(lon, lat).__dict__
        # The DEM is a fixed published product: a sample never changes → cache at the edge.
        response.headers["Cache-Control"] = "public, max-age=2592000, immutable"
        return sample
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
