"""End-to-end pipeline: python -m moonai_ml pipeline --profile development [--sync local] [--publish]

Stages are idempotent and recorded in artifacts/runs/<id>/state.json; `--resume`
continues the latest unfinished run of the profile without repeating finished stages.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path

import h5py
import numpy as np
import torch
import yaml

from moonai_ml import hardware
from moonai_ml.config import Config, load_config
from moonai_ml.evaluation.craters import dedupe_global, extract_craters, match, pixels_to_lonlat_km, recall_by_radius, summarize
from moonai_ml.export.onnx_export import export, quantize
from moonai_ml.ingestion import subset, zenodo
from moonai_ml.log import get_logger, info
from moonai_ml.models.unet import UNet
from moonai_ml.preprocessing.dataset import TileDataset, assert_disjoint_longitudes, load_crater_tables
from moonai_ml.publishing import publish
from moonai_ml.run import Run, git_commit

log = get_logger()


def _local_site(cfg: Config) -> Path:
    return cfg.paths.frontend_public / "moonai"


def stage_download(cfg: Config, run: Run) -> dict:
    files = zenodo.list_files()
    need = ["dev_craters.hdf5"] + (["test_craters.hdf5"] if cfg.data.n_test else [])
    got = {k: str(zenodo.download(files[k], cfg.paths.raw / "deepmoon")) for k in need}
    return {"files": got}


def stage_preprocess(cfg: Config, run: Run) -> dict:
    out = cfg.paths.processed
    paths = {"train": subset.extract("train", cfg.data.n_train, out), "val": subset.extract("val", cfg.data.n_val, out)}
    if cfg.data.n_test:
        paths["test"] = subset.extract("test", cfg.data.n_test, out)
    llbd = {k: h5py.File(p, "r")["longlat_bounds"][()] for k, p in paths.items()}
    bands = assert_disjoint_longitudes(llbd["train"], llbd["val"], ("train", "val"))
    if "test" in llbd:
        bands |= assert_disjoint_longitudes(llbd["train"], llbd["test"], ("train", "test"))
        assert_disjoint_longitudes(llbd["val"], llbd["test"], ("val", "test"))
    meta = {k: json.loads(Path(p).with_suffix(".json").read_text()) for k, p in paths.items()}
    run.write_json("dataset_metadata.json", {
        "source": zenodo.RECORD_API, "doi": zenodo.DOI, "license": zenodo.LICENSE, "citation": zenodo.CITATION,
        "dataset_version": f"deepmoon-zenodo-{zenodo.RECORD_ID}", "splits": meta, "longitude_bands": bands,
        "leakage_check": "passed: train/val/test longitude bands are disjoint",
    })
    return {k: str(v) for k, v in paths.items()}


def _predict_tiles(model, ds: TileDataset, device, bs=8) -> np.ndarray:
    out = []
    model.eval()
    with torch.no_grad():
        for i in range(0, len(ds), bs):
            x = torch.stack([ds[j][0] for j in range(i, min(i + bs, len(ds)))]).to(device)
            out.append(torch.sigmoid(model(x)).cpu().numpy()[:, 0])
    return np.concatenate(out)


def _load_best(cfg: Config, run: Run, device):
    st = torch.load(run.dir / "checkpoints" / "best.pt", map_location=device, weights_only=False)
    m = UNet(cfg.model.filters, cfg.model.dropout).to(device)
    m.load_state_dict(st["model"])
    return m, st["epoch"]


def _crater_eval(cfg: Config, probs, gts, ds: TileDataset):
    e = cfg.evaluation
    t0 = time.perf_counter()
    dets = [extract_craters(p, e.min_radius_px, e.max_radius_px, e.template_thresh, e.target_thresh, e.longlat_thresh2, e.rad_thresh) for p in probs]
    post_ms = (time.perf_counter() - t0) * 1000 / len(probs)
    res = [match(d, g, e.longlat_thresh2, e.rad_thresh) for d, g in zip(dets, gts)]
    # effective resolution of each tile (km/px) — the 'resolution' axis of the research question
    kmpx = np.array([(ds.llbd[i, 3] - ds.llbd[i, 2]) * np.pi / 180 * 1737.4 / (256 * ds.distortion[i]) for i in range(len(ds))])
    by_res = []
    for lo, hi in [(0, 0.25), (0.25, 0.5), (0.5, 1.0), (1.0, 2.0), (2.0, 4.0)]:
        sel = [r for r, k in zip(res, kmpx) if lo <= k < hi]
        if sel:
            s = summarize(sel)
            by_res.append({"km_per_px": [lo, hi], "tiles": len(sel), "precision": s["precision"], "recall": s["recall"], "f1": s["f1"]})
    return dets, {**summarize(res), "by_radius_px": recall_by_radius(res), "by_resolution": by_res, "postprocess_ms_per_tile": round(post_ms, 1)}


def stage_evaluate(cfg: Config, run: Run, split: str = "val") -> dict:
    device = torch.device(hardware.detect().device)
    model, best_epoch = _load_best(cfg, run, device)
    ds = TileDataset(cfg.paths.processed / f"deepmoon_{split}_{getattr(cfg.data, 'n_' + split)}.h5")
    t0 = time.perf_counter()
    probs = _predict_tiles(model, ds, device)
    infer_ms = (time.perf_counter() - t0) * 1000 / len(ds)
    gt_file = {"val": "dev_craters.hdf5", "test": "test_craters.hdf5"}[split]
    gts = load_crater_tables(cfg.paths.raw / "deepmoon" / gt_file, len(ds), cfg.evaluation.min_radius_px, cfg.evaluation.max_radius_px)
    dets, metrics = _crater_eval(cfg, probs, gts, ds)
    from moonai_ml.evaluation.craters import pixel_iou

    ious = [v for i, p in enumerate(probs) if (v := pixel_iou(p, ds.masks[i], cfg.evaluation.target_thresh)) is not None]
    metrics["iou"] = float(np.mean(ious))
    metrics["inference_ms_per_tile"] = round(infer_ms, 2)
    metrics["device"] = str(device)
    metrics["best_epoch"] = best_epoch
    metrics["tiles"] = len(ds)
    np.save(run.dir / f"probs_{split}.npy", probs.astype(np.float16))
    run.write_json(f"dets_{split}.json", [d.tolist() for d in dets])
    return metrics


def stage_predict(cfg: Config, run: Run, splits: list[str]) -> Path:
    """Detections → lunar lon/lat/diameter GeoJSON (IAU Moon sphere, not WGS84)."""
    feats = []
    for split in splits:
        ds = TileDataset(cfg.paths.processed / f"deepmoon_{split}_{getattr(cfg.data, 'n_' + split)}.h5")
        dets = json.loads((run.dir / f"dets_{split}.json").read_text())
        gt_file = {"val": "dev_craters.hdf5", "test": "test_craters.hdf5"}[split]
        gts = load_crater_tables(cfg.paths.raw / "deepmoon" / gt_file, len(ds), cfg.evaluation.min_radius_px, cfg.evaluation.max_radius_px)
        for i, d in enumerate(dets):
            if not d:
                continue
            d = np.array(d)
            geo = pixels_to_lonlat_km(d[:, :3], ds.llbd[i], ds.distortion[i])
            matched = set()
            for k, p in enumerate(d):  # flag catalogue matches; unmatched = candidate new craters
                if match(p[None], gts[i]).n_match:
                    matched.add(k)
            for k, (lon, lat, dkm) in enumerate(geo):
                if not (-90 <= lat <= 90 and np.isfinite(lon) and dkm > 0):
                    raise ValueError(f"invalid geospatial detection {lon},{lat},{dkm}")
                feats.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [round(float((lon + 180) % 360 - 180), 5), round(float(lat), 5)]},
                    "properties": {"diameter_km": round(float(dkm), 3), "confidence": round(float(d[k, 3]), 3), "tile": f"{split}_{i:05d}",
                                   "split": split, "catalog_match": k in matched},
                })
    # overlapping tiles see the same crater several times → keep one (most confident)
    if feats:
        lon = np.array([f["geometry"]["coordinates"][0] for f in feats])
        lat = np.array([f["geometry"]["coordinates"][1] for f in feats])
        dkm = np.array([f["properties"]["diameter_km"] for f in feats])
        conf = np.array([f["properties"]["confidence"] for f in feats])
        n_raw = len(feats)
        feats = [feats[i] for i in dedupe_global(lon, lat, dkm, conf, cfg.evaluation.longlat_thresh2, cfg.evaluation.rad_thresh)]
        info(log, f"global dedupe: {n_raw} tile detections → {len(feats)} unique craters")
    gj = {"type": "FeatureCollection", "moonai:crs": "GCS_Moon_2000 · IAU:30100 · R = 1737.4 km (not WGS84)",
          "moonai:experiment": run.id, "features": feats}
    p = run.dir / "predictions" / "craters.geojson"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(gj))
    return p


def _published_f1(site: Path) -> float | None:
    p = site / "manifests" / "latest.json"
    return json.loads(p.read_text())["metrics"].get("val_f1") if p.exists() else None


def gate(cfg: Config, val: dict, onnx_info: dict, site: Path) -> tuple[bool, list[str]]:
    reasons = []
    if not cfg.gate.allow_publish:
        reasons.append(f"profile '{cfg.profile}' is never published as a model")
    if onnx_info["max_abs_diff_vs_torch"] > cfg.gate.onnx_atol:
        reasons.append(f"ONNX differs from PyTorch by {onnx_info['max_abs_diff_vs_torch']:.2e} > {cfg.gate.onnx_atol}")
    if onnx_info["size_mb"] > cfg.gate.max_onnx_mb:
        reasons.append(f"ONNX {onnx_info['size_mb']} MB > {cfg.gate.max_onnx_mb} MB")
    if val["f1"] < cfg.gate.min_val_f1:
        reasons.append(f"val F1 {val['f1']:.3f} < minimum {cfg.gate.min_val_f1}")
    prev = _published_f1(site)
    if prev is not None and val["f1"] <= prev:
        reasons.append(f"val F1 {val['f1']:.3f} does not beat published model ({prev:.3f})")
    return not reasons, reasons


def run_pipeline(profile: str, sync: str | None, publish_s3: bool, resume: bool, dry_run: bool) -> int:
    cfg = load_config(profile)
    site = _local_site(cfg)
    sync_dirs = [site] if sync == "local" else []
    run = (Run.latest_incomplete(cfg, sync_dirs) if resume else None) or Run.create(cfg, sync_dirs)
    get_logger(jsonl=run.dir / "log.jsonl")
    info(log, f"run {run.id} · profile={cfg.profile} · sync={sync or 'off'} · publish_s3={publish_s3}")
    hw = hardware.detect(str(cfg.paths.artifacts.parent))
    info(log, f"hardware: {hw.as_dict()}")
    if dry_run:
        info(log, f"dry-run: stages {['download', 'preprocess', 'train', 'evaluate', 'export', 'gate', 'predict', 'package', 'publish']}, "
                  f"tiles train={cfg.data.n_train} val={cfg.data.n_val} test={cfg.data.n_test}, est. download "
                  f"{(cfg.data.n_train + cfg.data.n_val + cfg.data.n_test) * 0.33:.0f} MB")
        shutil.rmtree(run.dir)
        return 0
    if hw.disk_free_gb < 2:
        raise RuntimeError(f"only {hw.disk_free_gb} GB free disk (need ≥ 2 GB)")
    (run.dir / "configuration.yaml").write_text(yaml.safe_dump(cfg.model_dump(mode="json", exclude={"paths"}), sort_keys=False))

    def step(name, fn):
        if run.done(name):
            info(log, f"✓ {name} (already done)")
            return run.state["stages"][name].get("result")
        info(log, f"▶ {name}")
        run.mark(name, "running")
        try:
            result = fn()
        except Exception as e:
            run.mark(name, "failed", error=str(e))
            run.progress("failed", 0, cfg.train.epochs, 0, 0, {}, force=True)
            raise
        run.mark(name, "done", result=result)
        return result

    step("download", lambda: stage_download(cfg, run))
    paths = step("preprocess", lambda: stage_preprocess(cfg, run))
    val_gt = load_crater_tables(cfg.paths.raw / "deepmoon" / "dev_craters.hdf5", min(cfg.train.eval_tiles_per_epoch, cfg.data.n_val),
                                cfg.evaluation.min_radius_px, cfg.evaluation.max_radius_px)

    def _train():
        import mlflow

        from moonai_ml.training.train import train

        cfg.paths.mlruns.mkdir(parents=True, exist_ok=True)
        mlflow.set_tracking_uri(f"sqlite:///{cfg.paths.mlruns / 'mlflow.db'}")  # local, no server
        mlflow.set_experiment(f"moonai-{cfg.profile}")
        with mlflow.start_run(run_name=run.id):
            mlflow.log_params({"profile": cfg.profile, "seed": cfg.seed, "filters": cfg.model.filters, "dropout": cfg.model.dropout,
                               "lr": cfg.train.lr, "epochs": cfg.train.epochs, "n_train": cfg.data.n_train, "n_val": cfg.data.n_val})
            r = train(cfg, run, Path(paths["train"]), Path(paths["val"]), val_gt, mlflow)
        run.write_json("architecture.json", r["architecture"])
        run.write_json("experiment.json", {
            "id": run.id, "profile": cfg.profile, "created_at": run.state["created_at"], "git_commit": git_commit(), "seed": cfg.seed,
            "config": cfg.model_dump(mode="json", exclude={"paths"}), "hardware": r["hardware"], "architecture": r["architecture"],
            "dataset": json.loads((run.dir / "dataset_metadata.json").read_text()), "batch_size": r["batch_size"],
        })
        return {"epochs": len(r["history"])}

    step("train", _train)
    val = step("evaluate", lambda: stage_evaluate(cfg, run, "val"))
    sample = TileDataset(Path(paths["val"]))[0][0][0].numpy()
    onnx_info = step("export", lambda: {**export(run.dir / "checkpoints" / "best.pt", run.dir / "model" / "model.onnx", cfg.model.filters, sample),
                                        "int8": quantize(run.dir / "model" / "model.onnx", sample)})
    ok, reasons = gate(cfg, val, onnx_info, site)
    run.mark("gate", "done", result={"approved": ok, "reasons": reasons})
    info(log, f"quality gate: {'APPROVED' if ok else 'not approved'} {reasons}")

    test = None
    if ok and cfg.data.n_test:  # test set used once, only for the approved model
        test = step("evaluate_test", lambda: stage_evaluate(cfg, run, "test"))
    gj = step("predict", lambda: str(stage_predict(cfg, run, ["val"] + (["test"] if test else []))))

    metrics = {f"val_{k}": v for k, v in {"loss": None, "iou": val["iou"], "precision": val["precision"], "recall": val["recall"], "f1": val["f1"],
                                          "loc_err": val["loc_err_median"], "diam_err": val["diam_err_median"]}.items() if v is not None}
    if test:
        metrics |= {f"test_{k}": test[k] for k in ("precision", "recall", "f1", "iou")}
    run.write_json("evaluation_metrics.json", {"validation": val, "test": test, "onnx": onnx_info, "gate": {"approved": ok, "reasons": reasons},
                                                "notes": "Precision is a lower bound: unmatched detections may be real uncatalogued craters."})

    summary = {"id": run.id, "profile": cfg.profile, "created_at": run.state["created_at"], "status": "completed", "metrics": metrics}
    pkg = publish.package(run.dir, run.dir / "package")
    model = None
    if ok:
        model = {"onnx_path": onnx_info["path"], "onnx_size_mb": onnx_info["size_mb"], "sha256": onnx_info["sha256"], "predictions_path": gj,
                 "metadata": {"experiment_id": run.id, "trained_at": run.state["created_at"], "dataset_version": f"deepmoon-zenodo-{zenodo.RECORD_ID}",
                              "input": {"shape": [1, 1, 256, 256], "dtype": "float32", "layout": "NCHW", "name": "dem"},
                              "normalization": {"method": "scale", "params": {"divide_by": 255.0}},
                              "output": "logits → sigmoid = rim probability", "opset": onnx_info["opset"]}}
    else:  # unapproved runs still publish their (labelled) experiment package for the lab views
        shutil.copy(gj, pkg / "craters.geojson")

    if sync == "local":
        entry = publish.publish_local(site, pkg, summary, model, cfg.publish.keep_versions, cfg.publish.max_upload_mb)
        info(log, f"published locally → {site} ({entry.get('model_version') or 'experiment only'})")
    if publish_s3:
        from moonai_ml.publishing.s3 import publish_s3 as push

        if os.environ.get("PUBLISH") != "true":
            raise RuntimeError("S3 publishing requires PUBLISH=true explicitly")
        push(site, cfg)
    run.progress("completed", len(json.loads((run.dir / "training_history.json").read_text())["epochs"]), cfg.train.epochs, 1, 1, metrics, force=True)
    run.mark("publish", "done", finished=True)
    info(log, f"done: {run.dir}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="moonai_ml")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pipeline")
    p.add_argument("--profile", default="development")
    p.add_argument("--sync", choices=["local", "off"], default="off")
    p.add_argument("--publish", action="store_true")
    p.add_argument("--resume", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    r = sub.add_parser("rollback")
    r.add_argument("version")
    sub.add_parser("status")
    a = ap.parse_args(argv)
    if a.cmd == "pipeline":
        return run_pipeline(a.profile, None if a.sync == "off" else a.sync, a.publish, a.resume, a.dry_run)
    if a.cmd == "rollback":
        print(json.dumps(publish.rollback(_local_site(load_config("development")), a.version), indent=2))
        return 0
    if a.cmd == "status":
        cfg = load_config("development")
        site = _local_site(cfg)
        runs = sorted((cfg.paths.artifacts / "runs").glob("*"), reverse=True)[:5] if (cfg.paths.artifacts / "runs").exists() else []
        latest = site / "manifests" / "latest.json"
        print(json.dumps({"active_model": json.loads(latest.read_text()) if latest.exists() else None,
                          "recent_runs": [json.loads((d / "state.json").read_text()) for d in runs]}, indent=2, default=str))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
