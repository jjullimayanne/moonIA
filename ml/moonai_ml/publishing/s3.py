"""S3 publishing (manual, explicit): mirrors the local `moonai/` tree to the private bucket.

Requires PUBLISH=true, MOONAI_PUBLISH_BUCKET and an AWS profile/SSO session. Immutable
paths get a 1-year cache; manifests and indexes 1 h. latest.json is uploaded last.
"""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path

from moonai_ml.config import Config

MUTABLE = ("manifests/latest.json", "experiments/index.json", "live/progress.json")


def publish_s3(site: Path, cfg: Config) -> None:
    import boto3

    bucket = os.environ["MOONAI_PUBLISH_BUCKET"]
    s3 = boto3.client("s3")
    files = [p for p in site.rglob("*") if p.is_file()]
    total_mb = sum(p.stat().st_size for p in files) / 2**20
    if total_mb > 20 * 1024:
        raise RuntimeError(f"{total_mb:.0f} MB exceeds the 20 GB storage cap")
    existing = {o["Key"]: o["ETag"].strip('"') for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix="moonai/") for o in page.get("Contents", [])}
    import hashlib

    ordered = sorted(files, key=lambda p: str(p.relative_to(site)) == "manifests/latest.json")  # latest.json last
    for p in ordered:
        rel = str(p.relative_to(site))
        key = f"moonai/{rel}"
        if existing.get(key) == hashlib.md5(p.read_bytes()).hexdigest():
            continue  # avoid duplicate transfers
        cache = "public, max-age=3600" if rel in MUTABLE else ("public, max-age=60" if rel.startswith("live/") else "public, max-age=31536000, immutable")
        s3.upload_file(str(p), bucket, key, ExtraArgs={"ContentType": mimetypes.guess_type(p.name)[0] or "application/octet-stream", "CacheControl": cache})
