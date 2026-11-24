#!/usr/bin/env python3
"""Overall progress bar for a running pipeline (stdlib only).

    python3 scripts/progress.py            # one snapshot
    python3 scripts/progress.py --watch    # live, refreshes every 2 s (Ctrl+C to quit)

Stage weights (share of the total wall time, measured on a 16 GB M-series Mac):
data download/extraction 15 %, training 80 %, evaluation + export + publish 5 %.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "artifacts" / "development-train.log"
RUNS = ROOT / "artifacts" / "runs"
W_DATA, W_TRAIN, W_POST = 0.15, 0.80, 0.05
# extraction parts in order, with their byte sizes (development profile)
PARTS = [("train/input_images", 131), ("train/target_masks", 524), ("val/input_images", 26), ("val/target_masks", 105),
         ("test/input_images", 26), ("test/target_masks", 105)]
TOTAL_MB = sum(mb for _, mb in PARTS)


def latest_run() -> Path | None:
    runs = sorted(RUNS.glob("development-*"), reverse=True) if RUNS.exists() else []
    return runs[0] if runs else None


def data_fraction(text: str) -> float:
    done = 0.0
    for name, mb in PARTS:
        hits = re.findall(re.escape(name) + r":\s+(\d+)%", text)
        if not hits:
            break
        pct = int(hits[-1])
        done += mb * pct / 100
        if pct < 100:
            break
    return done / TOTAL_MB


def snapshot() -> tuple[float, str]:
    text = LOG.read_bytes().decode("utf-8", "ignore").replace("\r", "\n") if LOG.exists() else ""
    run = latest_run()
    state = json.loads((run / "state.json").read_text()) if run and (run / "state.json").exists() else {}
    stages = state.get("stages", {})
    live = json.loads((run / "live" / "progress.json").read_text()) if run and (run / "live" / "progress.json").exists() else None

    if state.get("finished"):
        return 1.0, "done ✓"
    if stages.get("train", {}).get("status") == "done":
        post = ["evaluate", "export", "evaluate_test", "predict"]
        k = sum(stages.get(s, {}).get("status") == "done" for s in post)
        return W_DATA + W_TRAIN + W_POST * k / len(post), f"evaluation / export ({k}/{len(post)})"
    if stages.get("train", {}).get("status") == "running" and live and live.get("total_steps"):
        e, E = live["epoch"], live["total_epochs"]
        frac = ((e - 1) + live["step"] / live["total_steps"]) / E
        loss = live.get("metrics", {}).get("train_loss")
        return W_DATA + W_TRAIN * frac, f"training · epoch {e}/{E} · step {live['step']}/{live['total_steps']}" + (f" · loss {loss:.4f}" if loss else "")
    if stages.get("preprocess", {}).get("status") == "running":
        f = data_fraction(text)
        return W_DATA * (0.1 + 0.9 * f), f"extracting tiles · {f * TOTAL_MB:.0f}/{TOTAL_MB} MB"
    if stages.get("download", {}).get("status") == "running":
        return W_DATA * 0.05, "downloading crater catalogs"
    return 0.0, "waiting to start"


def render(frac: float, label: str, started: float, start_frac: float) -> str:
    width = 40
    fill = int(frac * width)
    bar = "█" * fill + "░" * (width - fill)
    eta = ""
    elapsed = time.time() - started
    if frac > start_frac + 0.005 and elapsed > 20:
        rate = (frac - start_frac) / elapsed
        eta = f" · ETA {int((1 - frac) / rate // 60)} min"
    return f"\r  MoonAI [{bar}] {frac * 100:5.1f}% · {label}{eta}\033[K"


def main() -> None:
    watch = "--watch" in sys.argv
    started = time.time()
    frac0, _ = snapshot()
    while True:
        frac, label = snapshot()
        sys.stdout.write(render(frac, label, started, frac0))
        sys.stdout.flush()
        if not watch or frac >= 1.0:
            print()
            return
        time.sleep(2)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
