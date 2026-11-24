"""Crater extraction and scientific matching — ported from DeepMoon
(utils/template_match_target.py and get_unique_craters.estimate_longlatdiamkm).

Differences from the original, documented in docs/scientific/03-methodology.md:
* matching is one-to-one (a catalog crater can be matched once), so duplicates are
  counted as false positives instead of being reported separately;
* location/diameter errors are normalised by the catalog radius.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass

import numpy as np
from skimage.draw import circle_perimeter
from skimage.feature import match_template

MOON_RADIUS_KM = 1737.4


def ring_template(r: int, width: int = 2) -> np.ndarray:
    n = 2 * (r + width + 1) + 1
    t = np.zeros((n, n), dtype=np.float32)
    c = r + width + 1
    for w in range(width):
        rr, cc = circle_perimeter(c, c, r + w - width // 2, shape=t.shape)
        t[rr, cc] = 1
    return t


def extract_craters(pred: np.ndarray, min_r=5, max_r=40, template_thresh=0.5, target_thresh=0.1,
                    longlat_thresh2=1.8, rad_thresh=1.0) -> np.ndarray:
    """Template-match rings in a predicted rim map. Returns (x, y, r, corr) in pixels."""
    target = (pred >= target_thresh).astype(np.float32)
    if target.sum() == 0:
        return np.zeros((0, 4))
    found = []
    for r in range(min_r, max_r + 1):
        res = match_template(target, ring_template(r), pad_input=True)
        ys, xs = np.where(res > template_thresh)
        found.extend((x, y, r, res[y, x]) for x, y in zip(xs, ys))
    if not found:
        return np.zeros((0, 4))
    c = np.array(found, dtype=float)
    c = c[np.argsort(-c[:, 3])]  # strongest first
    keep: list[np.ndarray] = []
    for cand in c:  # non-maximum suppression with DeepMoon's duplicate criteria
        dup = False
        for k in keep:
            minr = min(cand[2], k[2])
            if ((cand[0] - k[0]) ** 2 + (cand[1] - k[1]) ** 2) / minr**2 < longlat_thresh2 and abs(cand[2] - k[2]) / minr < rad_thresh:
                dup = True
                break
        if not dup:
            keep.append(cand)
    return np.array(keep)


@dataclass
class MatchResult:
    n_match: int
    n_true: int
    n_pred: int
    loc_err: list[float]   # |Δposition| / r_true
    diam_err: list[float]  # |Δr| / r_true
    matched_true_r: list[float]
    unmatched_true_r: list[float]


def match(pred: np.ndarray, true: np.ndarray, longlat_thresh2=1.8, rad_thresh=1.0) -> MatchResult:
    """One-to-one greedy matching of detections (x,y,r[,corr]) to catalog craters (x,y,r)."""
    used = np.zeros(len(true), dtype=bool)
    loc, diam, mr = [], [], []
    n_match = 0
    for p in pred:
        if len(true) == 0:
            break
        minr = np.minimum(p[2], true[:, 2])
        d2 = ((true[:, 0] - p[0]) ** 2 + (true[:, 1] - p[1]) ** 2) / minr**2
        dr = np.abs(true[:, 2] - p[2]) / minr
        ok = (d2 < longlat_thresh2) & (dr < rad_thresh) & ~used
        if ok.any():
            j = np.flatnonzero(ok)[np.argmin(d2[ok])]
            used[j] = True
            n_match += 1
            loc.append(float(np.hypot(true[j, 0] - p[0], true[j, 1] - p[1]) / true[j, 2]))
            diam.append(float(abs(true[j, 2] - p[2]) / true[j, 2]))
            mr.append(float(true[j, 2]))
    return MatchResult(n_match, len(true), len(pred), loc, diam, mr, [float(r) for r in true[~used, 2]])


def summarize(results: list[MatchResult]) -> dict:
    m = sum(r.n_match for r in results)
    t = sum(r.n_true for r in results)
    p = sum(r.n_pred for r in results)
    prec = m / p if p else 0.0
    rec = m / t if t else 0.0
    loc = [e for r in results for e in r.loc_err]
    dia = [e for r in results for e in r.diam_err]
    return {
        "precision": prec,
        "recall": rec,
        "f1": 2 * prec * rec / (prec + rec) if prec + rec else 0.0,
        "n_match": m,
        "n_true": t,
        "n_pred": p,
        "loc_err_median": float(np.median(loc)) if loc else None,
        "diam_err_median": float(np.median(dia)) if dia else None,
    }


def recall_by_radius(results: list[MatchResult], edges=(5, 7, 10, 14, 20, 28, 40)) -> list[dict]:
    """Recall per pixel-radius bin — the 'capacity vs crater size' axis of the research question."""
    hit = np.array([r for res in results for r in res.matched_true_r])
    miss = np.array([r for res in results for r in res.unmatched_true_r])
    out = []
    for lo, hi in itertools.pairwise(edges):
        h = int(((hit >= lo) & (hit < hi)).sum())
        n = h + int(((miss >= lo) & (miss < hi)).sum())
        out.append({"r_px": [lo, hi], "n_true": n, "recall": h / n if n else None})
    return out


def pixel_iou(prob: np.ndarray, mask: np.ndarray, thresh: float = 0.1) -> float | None:
    """Rim-pixel IoU after DeepMoon's binarization (target_thresh = 0.1).

    Returns None when both maps are empty, so crater-free tiles do not count as a
    perfect 1.0 (that inflated the mean in early runs).
    """
    p = prob >= thresh
    t = mask > 0.5
    union = (p | t).sum()
    return float((p & t).sum() / union) if union else None


def pixels_to_lonlat_km(coords: np.ndarray, llbd: np.ndarray, distortion: float, dim: int = 256) -> np.ndarray:
    """DeepMoon's first-order inverse of the orthographic tile transform → (lon°, lat°, diameter_km)."""
    x, y, r = coords[:, 0], coords[:, 1], coords[:, 2]
    km_per_pix = 1.0 / ((180.0 / np.pi) * dim * distortion / (llbd[3] - llbd[2]) / MOON_RADIUS_KM)
    deg_per_pix = km_per_pix * 180.0 / (np.pi * MOON_RADIUS_KM)
    lon_c, lat_c = 0.5 * (llbd[0] + llbd[1]), 0.5 * (llbd[2] + llbd[3])
    latdiff = np.maximum(np.abs(deg_per_pix * (y - dim / 2.0)), 1e-7)
    lat = lat_c - deg_per_pix * (y - dim / 2.0) * (np.pi * latdiff / 180.0) / np.sin(np.pi * latdiff / 180.0)
    lon = lon_c + deg_per_pix * (x - dim / 2.0) / np.cos(np.pi * lat / 180.0)
    return np.column_stack([lon, lat, 2 * r * km_per_pix])


def dedupe_global(lon: np.ndarray, lat: np.ndarray, d_km: np.ndarray, conf: np.ndarray,
                  longlat_thresh2: float = 1.8, rad_thresh: float = 1.0) -> np.ndarray:
    """Merge detections of the same crater found in overlapping tiles (DeepMoon get_unique_craters).

    Uses the same criteria as tile-level matching, in km on the lunar sphere:
    Δpos²/r_min² < longlat_thresh2 and |Δr|/r_min < rad_thresh. Keeps the most confident.
    Returns indices of the unique detections.
    """
    order = np.argsort(-conf)
    r = d_km / 2
    keep: list[int] = []
    cell: dict[tuple[int, int], list[int]] = {}
    for i in order:
        ci = (int(lat[i] // 1), int(lon[i] // 1))
        dup = False
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for j in cell.get((ci[0] + dy, ci[1] + dx), []):
                    dlat = np.radians(lat[i] - lat[j])
                    dlon = np.radians(lon[i] - lon[j]) * np.cos(np.radians(0.5 * (lat[i] + lat[j])))
                    dist = MOON_RADIUS_KM * np.hypot(dlat, dlon)
                    rmin = min(r[i], r[j])
                    if (dist / rmin) ** 2 < longlat_thresh2 and abs(r[i] - r[j]) / rmin < rad_thresh:
                        dup = True
                        break
                if dup:
                    break
            if dup:
                break
        if not dup:
            keep.append(int(i))
            cell.setdefault(ci, []).append(int(i))
    return np.array(sorted(keep), dtype=int)
