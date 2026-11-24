"""MoonAI local pipeline dashboard — `make dashboard` (Streamlit, runs only on your machine)."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / "artifacts" / "runs"
SITE = ROOT / "frontend" / "public" / "moonai"

st.set_page_config(page_title="MoonAI · pipeline", page_icon="🌙", layout="wide")
st.title("🌙 MoonAI — local pipeline")


def load(p: Path):
    try:
        return json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return None


runs = sorted(RUNS.glob("*"), reverse=True) if RUNS.exists() else []
latest = load(SITE / "manifests" / "latest.json")

c1, c2, c3 = st.columns(3)
c1.metric("Runs", len(runs))
c2.metric("Active model", latest["version"] if latest else "none")
c3.metric("Published", latest["published_at"] if latest else "—")

if not runs:
    st.info("No runs yet. Start one with `make pipeline PROFILE=development`.")
    st.stop()

rid = st.selectbox("Run", [r.name for r in runs])
run = RUNS / rid
state = load(run / "state.json") or {}
live = load(run / "live" / "progress.json")
exp = load(run / "experiment.json") or {}

st.subheader("Status")
cols = st.columns(4)
cols[0].write(f"**Profile** {state.get('profile')}")
cols[1].write(f"**Device** {exp.get('hardware', {}).get('device_name', '—')}")
if live:
    age = time.time() - time.mktime(time.strptime(live["updated_at"], "%Y-%m-%dT%H:%M:%SZ")) + time.timezone * -1
    cols[2].write(f"**Epoch** {live['epoch']}/{live['total_epochs']} · step {live['step']}/{live['total_steps']}")
    cols[3].write(f"**Live status** {live['status']} (updated {live['updated_at']})")
    if live["total_steps"]:
        st.progress(min(1.0, live["step"] / live["total_steps"]))

st.write(pd.DataFrame([{"stage": k, **v} for k, v in state.get("stages", {}).items()]).drop(columns=["result"], errors="ignore"))

hist = load(run / "training_history.json")
if hist and hist["epochs"]:
    df = pd.DataFrame(hist["epochs"]).set_index("epoch")
    a, b = st.columns(2)
    a.subheader("Loss")
    a.line_chart(df[["train_loss", "val_loss"]])
    b.subheader("Validation metrics")
    b.line_chart(df[[c for c in ("iou", "precision", "recall", "f1") if c in df]])
    st.dataframe(df, use_container_width=True)

ev = load(run / "evaluation_metrics.json")
if ev:
    st.subheader("Evaluation & quality gate")
    st.json({"gate": ev["gate"], "validation": {k: v for k, v in ev["validation"].items() if not isinstance(v, list)}, "test": ev["test"]})

samples = sorted((run / "samples").glob("epoch_*"))
if samples:
    st.subheader("Fixed validation tiles")
    ep = st.select_slider("Epoch", options=[s.name for s in samples], value=samples[-1].name)
    for inp in sorted((run / "samples").glob("val_*_input.png")):
        sid = inp.name.replace("_input.png", "")
        i1, i2, i3 = st.columns(3)
        i1.image(str(inp), caption=f"{sid} · DEM")
        i2.image(str(run / "samples" / f"{sid}_target.png"), caption="ground-truth rims")
        i3.image(str(run / "samples" / ep / f"{sid}_pred.png"), caption=f"prediction · {ep}")

log = run / "log.jsonl"
if log.exists():
    with st.expander("Structured log"):
        st.code("\n".join(log.read_text().splitlines()[-40:]))
