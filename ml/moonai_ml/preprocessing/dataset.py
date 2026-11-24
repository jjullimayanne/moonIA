"""Local tile dataset + spatial-leakage guard + geometry-preserving augmentation."""

from __future__ import annotations

from pathlib import Path

import h5py
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset


class TileDataset(Dataset):
    """DEM tiles (x/255 → [0,1]) and binary rim masks from an extracted subset file."""

    def __init__(self, path: Path, augment: bool = False, seed: int = 0):
        with h5py.File(path, "r") as h:
            self.images = h["images"][()]
            self.masks = h["masks"][()]
            self.llbd = h["longlat_bounds"][()]
            self.distortion = h["distortion"][()]
        self.augment = augment
        self.rng = np.random.default_rng(seed)

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, i: int):
        x = self.images[i].astype(np.float32) / 255.0
        y = self.masks[i].astype(np.float32)
        if self.augment:
            # Only rotations by 90° and flips: they keep circular rims circular and
            # keep the pixel grid aligned (no interpolation of elevation values).
            k = int(self.rng.integers(4))
            x, y = np.rot90(x, k), np.rot90(y, k)
            if self.rng.random() < 0.5:
                x, y = np.fliplr(x), np.fliplr(y)
        return torch.from_numpy(x.copy())[None], torch.from_numpy(y.copy())[None]


def assert_disjoint_longitudes(a: np.ndarray, b: np.ndarray, names=("train", "val")) -> dict:
    """Raise if any tile of `a` overlaps any tile of `b` in longitude (spatial leakage)."""
    a_lo, a_hi = a[:, 0].min(), a[:, 1].max()
    b_lo, b_hi = b[:, 0].min(), b[:, 1].max()
    if a_lo < b_hi and b_lo < a_hi:
        raise RuntimeError(f"Spatial leakage: {names[0]} lon [{a_lo:.2f},{a_hi:.2f}] overlaps {names[1]} lon [{b_lo:.2f},{b_hi:.2f}]")
    return {names[0]: [float(a_lo), float(a_hi)], names[1]: [float(b_lo), float(b_hi)]}


def load_crater_tables(craters_h5: Path, n: int, min_r: float, max_r: float) -> list[np.ndarray]:
    """Per-tile ground truth (x, y, r) in pixels from DeepMoon's *_craters.hdf5.

    Same filter as DeepMoon's evaluation: keep craters whose pixel diameter lies in
    (2·min_r, 2·max_r) — the range the template matcher can detect.
    """
    out = []
    with pd.HDFStore(craters_h5, "r") as st:
        for i in range(n):
            df = st[f"img_{i:05d}"]
            d = df["Diameter (pix)"].to_numpy()
            keep = (d > 2 * min_r) & (d < 2 * max_r)
            out.append(np.column_stack([df["x"].to_numpy()[keep], df["y"].to_numpy()[keep], d[keep] / 2]))
    return out
