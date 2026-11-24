#!/usr/bin/env python3
"""Independent check of the model's uncatalogued candidates against the IAU gazetteer.

A candidate is "IAU-confirmed" when an officially named crater (types AA/SF) lies within
max(1.5 km, D/2) of it and the two diameters agree within a factor of 2. Chance level is
estimated by shifting every candidate 30–80 km in a random direction (same sizes, same
latitude band) and repeating the test.

    python3 scripts/iau_crosscheck.py [frontend/public/moonai/predictions/v1/craters.geojson]
"""

import csv
import json
import math
import random
import sys
from pathlib import Path

R = 1737.4
ROOT = Path(__file__).resolve().parents[1]
gj = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "frontend/public/moonai/predictions/v1/craters.geojson"
iau = [(float(r["lon"]), float(r["lat"]), float(r["diameter_km"])) for r in csv.DictReader(open(ROOT / "data/catalogs/iau.csv")) if r["type"] in ("AA", "SF")]
cand = [(f["geometry"]["coordinates"][0], f["geometry"]["coordinates"][1], f["properties"]["diameter_km"])
        for f in json.load(open(gj))["features"] if not f["properties"]["catalog_match"]]


def gc(a, b, c, d):
    p1, p2 = math.radians(b), math.radians(d)
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(c - a) / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(x)))


def confirmed(lon, lat, d):
    best = min(((gc(lon, lat, fl, fa), fd) for fl, fa, fd in iau if abs(fa - lat) <= 3), default=None)
    return bool(best) and best[0] <= max(1.5, d / 2) and best[1] > 0 and 0.5 < best[1] / d < 2


real = sum(confirmed(*c) for c in cand)
random.seed(0)
trials = []
for _ in range(5):
    hits = 0
    for lon, lat, d in cand:
        dist, az = random.uniform(30, 80), random.uniform(0, 2 * math.pi)
        dlat = math.degrees(dist / R * math.cos(az))
        dlon = math.degrees(dist / R * math.sin(az)) / max(0.2, math.cos(math.radians(lat)))
        hits += confirmed(lon + dlon, max(-89, min(89, lat + dlat)), d)
    trials.append(hits)
chance = sum(trials) / len(trials) / len(cand)
print(json.dumps({"candidates": len(cand), "iau_confirmed": real, "rate": round(real / len(cand), 3),
                  "chance_rate": round(chance, 3), "enrichment": round(real / len(cand) / chance, 1), "chance_trials": trials}, indent=2))
