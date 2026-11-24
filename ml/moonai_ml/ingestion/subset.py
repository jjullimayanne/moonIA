"""Reduced-download mode: stream only the first N tiles of a DeepMoon image file.

`input_images` (uint8, N×256×256) and `target_masks` (float32, N×256×256) are stored
*contiguous and uncompressed* in the Zenodo HDF5 files (verified with h5py), so the
first N tiles are a single byte range each. We read the layout once through h5py over
HTTP, then fetch exactly those bytes with resumable Range requests. Per-tile
georeferencing (longlat_bounds, distortion coefficient, cll_xy) is read for the same N
indices only.

Output: data/processed/deepmoon_<split>_<N>.h5  (+ .json provenance)
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import fsspec
import h5py
import numpy as np
from tqdm import tqdm

from moonai_ml.ingestion.zenodo import SPLITS, list_files, session

TILE = 256


def _range(s, url: str, start: int, length: int, out: Path, desc: str) -> None:
    """Fetch bytes [start, start+length) into `out`, resuming a partial file."""
    have = out.stat().st_size if out.exists() else 0
    if have >= length:
        return
    with s.get(url, headers={"Range": f"bytes={start + have}-{start + length - 1}"}, stream=True, timeout=60) as r:
        if r.status_code != 206:
            raise RuntimeError(f"server did not honour Range for {url} (status {r.status_code})")
        with out.open("ab") as f, tqdm(total=length, initial=have, unit="B", unit_scale=True, desc=desc, leave=False) as bar:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                bar.update(len(chunk))
    if out.stat().st_size != length:
        raise RuntimeError(f"{desc}: incomplete range ({out.stat().st_size} / {length} bytes)")


def extract(split: str, n: int, out_dir: Path) -> Path:
    """Idempotent: returns the existing file if it was already extracted and verified."""
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"deepmoon_{split}_{n}.h5"
    meta_path = out.with_suffix(".json")
    if out.exists() and meta_path.exists() and json.loads(meta_path.read_text()).get("complete"):
        return out

    key = f"{SPLITS[split]}_images.hdf5"
    rf = list_files()[key]
    fs = fsspec.filesystem("http", headers={"User-Agent": "MoonAI/0.1"})
    with fs.open(rf.url, block_size=8 << 20, cache_type="blockcache") as f, h5py.File(f, "r") as h:
        layout = {}
        for name in ("input_images", "target_masks"):
            ds = h[name]
            if ds.chunks is not None or ds.compression is not None:
                raise RuntimeError(f"{name} is not contiguous; range streaming impossible")
            assert ds.shape[0] >= n, f"{split} has only {ds.shape[0]} tiles"
            layout[name] = (ds.id.get_offset(), ds.dtype, n * TILE * TILE * ds.dtype.itemsize)
        ids = [f"img_{i:05d}" for i in range(n)]
        llbd = np.stack([h["longlat_bounds"][k][()] for k in tqdm(ids, desc=f"{split} geo", leave=False)]).astype("f8")
        dist = np.array([float(np.ravel(h["pix_distortion_coefficient"][k][()])[0]) for k in ids])
        cll = np.stack([h["cll_xy"][k][()] for k in ids]).astype("f8")

    s = session()
    tmp = {}
    for name, (offset, dtype, nbytes) in layout.items():
        part = out_dir / f".{out.stem}.{name}.part"
        _range(s, rf.url, offset, nbytes, part, f"{split}/{name}")
        tmp[name] = np.frombuffer(part.read_bytes(), dtype=dtype).reshape(n, TILE, TILE)

    images = tmp["input_images"].copy()
    masks = (tmp["target_masks"] > 0.5).astype(np.uint8)  # binary rings (stored as 0/1 float32)
    with h5py.File(out, "w") as o:
        o.create_dataset("images", data=images, compression="lzf")
        o.create_dataset("masks", data=masks, compression="lzf")
        o.create_dataset("longlat_bounds", data=llbd)  # [lon_min, lon_max, lat_min, lat_max] (deg)
        o.create_dataset("distortion", data=dist)
        o.create_dataset("cll_xy", data=cll)
        o.create_dataset("source_index", data=np.arange(n))
        o.attrs["split"] = split
        o.attrs["source"] = f"{rf.url} (first {n} tiles)"
    for name in layout:
        (out_dir / f".{out.stem}.{name}.part").unlink(missing_ok=True)

    meta = {
        "complete": True,
        "split": split,
        "n": n,
        "source_file": key,
        "source_md5": rf.md5,
        "source_url": rf.url,
        "extracted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
        "lon_range": [float(llbd[:, 0].min()), float(llbd[:, 1].max())],
        "lat_range": [float(llbd[:, 2].min()), float(llbd[:, 3].max())],
        "crs": "Moon sphere R=1737.4 km; tiles are orthographic crops of the 118 m/px LOLA-Kaguya DEM",
        "normalization": "uint8 elevation; model input = x / 255",
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    return out
