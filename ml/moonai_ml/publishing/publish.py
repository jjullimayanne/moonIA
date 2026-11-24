"""Versioned publishing of experiment packages and approved models.

Layout (identical locally and on S3, under the `moonai/` prefix):
  moonai/experiments/index.json
  moonai/experiments/<run-id>/{experiment,training_history,evaluation_metrics}.json, samples/, activations/
  moonai/models/vN/{model.onnx, metadata.json, metrics.json, checksum.sha256}
  moonai/predictions/vN/craters.geojson
  moonai/manifests/latest.json          ← written LAST, only after everything else is in place

Targets: a local directory (frontend/public → GitHub Pages / dev server) or S3 (only
with MOONAI_PUBLISH_BUCKET set and PUBLISH=true; uses your AWS profile/SSO, never keys).
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from moonai_ml.run import now_iso

SCHEMA = "1.0"


def _dir_size_mb(p: Path) -> float:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) / 2**20


def package(run_dir: Path, pkg: Path) -> Path:
    """Copy only what the web lab needs (no checkpoints, no datasets)."""
    if pkg.exists():
        shutil.rmtree(pkg)
    pkg.mkdir(parents=True)
    for name in ["experiment.json", "training_history.json", "evaluation_metrics.json", "dataset_metadata.json", "architecture.json", "configuration.yaml"]:
        if (run_dir / name).exists():
            shutil.copy(run_dir / name, pkg / name)
    for sub in ["samples", "activations", "report"]:
        if (run_dir / sub).exists():
            shutil.copytree(run_dir / sub, pkg / sub)
    return pkg


def next_version(root: Path) -> str:
    vs = [int(p.name[1:]) for p in (root / "models").glob("v*") if p.name[1:].isdigit()]
    return f"v{max(vs, default=0) + 1}"


def publish_local(root: Path, pkg: Path, summary: dict, model: dict | None, keep_versions: int, max_mb: float) -> dict:
    """root = <frontend>/public/moonai. Returns the updated index entry."""
    size = _dir_size_mb(pkg) + (model["onnx_size_mb"] if model else 0)
    if size > max_mb:
        raise RuntimeError(f"package is {size:.1f} MB > limit {max_mb} MB; not published")

    exp_dst = root / "experiments" / summary["id"]
    if exp_dst.exists():
        shutil.rmtree(exp_dst)
    shutil.copytree(pkg, exp_dst)

    version = None
    if model:
        version = next_version(root)
        mdir = root / "models" / version
        mdir.mkdir(parents=True)
        shutil.copy(model["onnx_path"], mdir / "model.onnx")
        (mdir / "checksum.sha256").write_text(f"{model['sha256']}  model.onnx\n")
        (mdir / "metadata.json").write_text(json.dumps(model["metadata"], indent=2))
        (mdir / "metrics.json").write_text(json.dumps(summary["metrics"], indent=2))
        pdir = root / "predictions" / version
        pdir.mkdir(parents=True)
        shutil.copy(model["predictions_path"], pdir / "craters.geojson")
        # verify what was written before switching the active version
        from moonai_ml.export.onnx_export import sha256

        if sha256(mdir / "model.onnx") != model["sha256"]:
            shutil.rmtree(mdir)
            raise RuntimeError("checksum mismatch after copy; previous version kept active")
        latest = {
            "schema_version": SCHEMA,
            "version": version,
            "experiment_id": summary["id"],
            "trained_at": summary["created_at"],
            "published_at": now_iso(),
            "dataset_version": model["metadata"]["dataset_version"],
            "model_url": f"moonai/models/{version}/model.onnx",
            "predictions_url": f"moonai/predictions/{version}/craters.geojson",
            "sha256": model["sha256"],
            "input": model["metadata"]["input"],
            "normalization": model["metadata"]["normalization"],
            "metrics": summary["metrics"],
        }
        (root / "manifests").mkdir(parents=True, exist_ok=True)
        tmp = root / "manifests" / "latest.json.tmp"
        tmp.write_text(json.dumps(latest, indent=2))
        tmp.replace(root / "manifests" / "latest.json")  # atomic switch, last step
        _prune(root, keep_versions)

    idx_path = root / "experiments" / "index.json"
    idx = json.loads(idx_path.read_text()) if idx_path.exists() else {"schema_version": SCHEMA, "experiments": []}
    entry = {**summary, "model_version": version, "approved": model is not None}
    idx["experiments"] = [e for e in idx["experiments"] if e["id"] != summary["id"]] + [entry]
    idx["experiments"].sort(key=lambda e: e["created_at"], reverse=True)
    idx["updated_at"] = now_iso()
    idx_path.parent.mkdir(parents=True, exist_ok=True)
    idx_path.write_text(json.dumps(idx, indent=2))
    return entry


def _prune(root: Path, keep: int) -> None:
    vs = sorted((p for p in (root / "models").glob("v*") if p.name[1:].isdigit()), key=lambda p: int(p.name[1:]))
    for old in vs[:-keep]:
        shutil.rmtree(old)
        shutil.rmtree(root / "predictions" / old.name, ignore_errors=True)


def rollback(root: Path, version: str) -> dict:
    """Point latest.json back to an existing published version."""
    mdir = root / "models" / version
    if not (mdir / "model.onnx").exists():
        raise FileNotFoundError(f"{version} is not published")
    latest_path = root / "manifests" / "latest.json"
    latest = json.loads(latest_path.read_text())
    meta = json.loads((mdir / "metadata.json").read_text())
    latest.update(
        version=version,
        experiment_id=meta["experiment_id"],
        trained_at=meta["trained_at"],
        model_url=f"moonai/models/{version}/model.onnx",
        predictions_url=f"moonai/predictions/{version}/craters.geojson",
        sha256=(mdir / "checksum.sha256").read_text().split()[0],
        metrics=json.loads((mdir / "metrics.json").read_text()),
        published_at=now_iso(),
    )
    latest_path.write_text(json.dumps(latest, indent=2))
    return latest
