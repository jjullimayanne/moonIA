"""Download and normalize the real crater catalogs.

Outputs
-------
data/catalogs/<id>.csv
    Normalized table: lon, lat (degrees, planetocentric, east-positive [-180,180)),
    diameter_km (+ name/type for IAU).
frontend/public/data/catalogs/<id>.json
    Compact column-oriented JSON consumed by the static frontend.

Usage: ``uv run python -m app.ingestion.catalogs``
"""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pandas as pd
import shapefile

from app.catalog.sources import CATALOGS, CatalogSource
from app.config import settings
from app.lunar.crs import CRS_NAME, normalize_lon


def _download(url: str) -> bytes:
    with httpx.Client(follow_redirects=True, timeout=120) as client:
        r = client.get(url)
        r.raise_for_status()
        return r.content


def parse_head(raw: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")))
    return pd.DataFrame(
        {"lon": normalize_lon(df["Lon"]), "lat": df["Lat"], "diameter_km": df["Diam_km"]}
    )


def parse_povilaitis(raw: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")))
    return pd.DataFrame(
        {
            "lon": normalize_lon(df["Long"]),
            "lat": df["Lat"],
            "diameter_km": df["Diameter (km)"],
        }
    )


def parse_iau(raw: bytes) -> pd.DataFrame:
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        stem = next(n[:-4] for n in zf.namelist() if n.endswith(".shp"))
        reader = shapefile.Reader(
            shp=io.BytesIO(zf.read(stem + ".shp")),
            shx=io.BytesIO(zf.read(stem + ".shx")),
            dbf=io.BytesIO(zf.read(stem + ".dbf")),
        )
        rows = [r.as_dict() for r in reader.records()]
    df = pd.DataFrame(rows)
    df = df[df["approval"].str.startswith("Adopted")]
    return pd.DataFrame(
        {
            "lon": normalize_lon(df["center_lon"]),
            "lat": df["center_lat"],
            "diameter_km": df["diameter"],
            "name": df["clean_name"],
            "type": df["code"],
        }
    ).reset_index(drop=True)


PARSERS = {"head2010": parse_head, "povilaitis2018": parse_povilaitis, "iau": parse_iau}


def validate(df: pd.DataFrame, src: CatalogSource) -> None:
    assert df["lon"].between(-180, 180).all(), f"{src.id}: longitude out of range"
    assert df["lat"].between(-90, 90).all(), f"{src.id}: latitude out of range"
    assert (df["diameter_km"] >= 0).all(), f"{src.id}: negative diameter"
    lo, hi = src.lat_coverage
    assert df["lat"].between(lo - 1e-6, hi + 1e-6).all(), f"{src.id}: outside declared coverage"


def to_compact_json(df: pd.DataFrame, src: CatalogSource) -> dict:
    cols = [c for c in ("lon", "lat", "diameter_km", "name", "type") if c in df.columns]
    out = df[cols].copy()
    out[["lon", "lat"]] = out[["lon", "lat"]].round(4)
    out["diameter_km"] = out["diameter_km"].round(3)
    return {
        "meta": {
            "id": src.id,
            "name": src.name,
            "source_url": src.url,
            "license": src.license,
            "citation": src.citation,
            "description": src.description,
            "crs": CRS_NAME,
            "count": len(out),
            "data_kind": "real",
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        },
        "columns": cols,
        "rows": out.values.tolist(),
    }


def run(catalog_dir: Path | None = None, frontend_dir: Path | None = None) -> None:
    catalog_dir = catalog_dir or settings.data_dir / "catalogs"
    frontend_dir = frontend_dir or settings.frontend_data_dir / "catalogs"
    catalog_dir.mkdir(parents=True, exist_ok=True)
    frontend_dir.mkdir(parents=True, exist_ok=True)
    for cid, src in CATALOGS.items():
        print(f"→ {cid}: {src.url}")
        df = PARSERS[cid](_download(src.url))
        validate(df, src)
        df.to_csv(catalog_dir / f"{cid}.csv", index=False)
        (frontend_dir / f"{cid}.json").write_text(
            json.dumps(to_compact_json(df, src), ensure_ascii=False, separators=(",", ":"))
        )
        print(f"  {len(df)} records written")


if __name__ == "__main__":
    run()
