import json

import numpy as np
import pytest
import torch

from moonai_ml.config import load_config
from moonai_ml.evaluation.craters import extract_craters, match, pixel_iou, pixels_to_lonlat_km, ring_template, summarize
from moonai_ml.hardware import Hardware, suggest_batch_size
from moonai_ml.models.unet import UNet
from moonai_ml.preprocessing.dataset import assert_disjoint_longitudes
from moonai_ml.publishing.publish import publish_local, rollback


def draw_ring(img, x, y, r, w=3):
    yy, xx = np.mgrid[: img.shape[0], : img.shape[1]]
    d = np.hypot(xx - x, yy - y)
    img[(d >= r - w / 2) & (d <= r + w / 2)] = 1


def test_profiles_load():
    for p in ("smoke", "development", "production"):
        assert load_config(p).profile == p
    assert load_config("production").model.filters == 112  # DeepMoon width


def test_unet_shapes_and_params():
    m = UNet(filters=8)
    assert m(torch.zeros(2, 1, 256, 256)).shape == (2, 1, 256, 256)
    # DeepMoon width gives ~10M parameters
    assert 9e6 < sum(p.numel() for p in UNet(112).parameters()) < 12e6


def test_template_matching_recovers_synthetic_rings():
    img = np.zeros((256, 256), np.float32)
    truth = np.array([[60, 70, 12], [170, 150, 25], [200, 60, 8]], float)
    for x, y, r in truth:
        draw_ring(img, x, y, r)
    det = extract_craters(img)
    s = summarize([match(det, truth)])
    assert s["recall"] == 1.0 and s["precision"] == 1.0
    assert s["loc_err_median"] < 0.15 and s["diam_err_median"] < 0.15


def test_matching_is_one_to_one():
    truth = np.array([[50, 50, 10]], float)
    pred = np.array([[50, 50, 10, 0.9], [51, 50, 10, 0.8]])
    r = match(pred, truth)
    assert r.n_match == 1 and r.n_pred == 2


def test_ring_template_and_iou():
    assert ring_template(10).sum() > 0
    a = np.zeros((4, 4))
    a[0, 0] = 1
    assert pixel_iou(a, a) == 1.0


def test_pixel_to_lonlat_center_and_scale():
    llbd = np.array([-10.0, 10.0, -10.0, 10.0])
    lon, lat, dkm = pixels_to_lonlat_km(np.array([[128, 128, 10]]), llbd, 1.0)[0]
    assert abs(lon) < 1e-9 and abs(lat) < 1e-9
    assert dkm == pytest.approx(2 * 10 * 20 * np.pi / 180 * 1737.4 / 256)


def test_spatial_leakage_guard():
    tr = np.array([[-180, -100, 0, 1], [-120, -61, 0, 1]], float)
    va = np.array([[-59, 0, 0, 1]], float)
    assert_disjoint_longitudes(tr, va)
    with pytest.raises(RuntimeError):
        assert_disjoint_longitudes(tr, np.array([[-70, -50, 0, 1]], float))


def test_batch_size_is_power_of_two_and_bounded():
    hw = Hardware("cpu", "cpu", "x", 8, 16, 4, 100, "t")
    bs = suggest_batch_size(hw, 112)
    assert 1 <= bs <= 32 and bs & (bs - 1) == 0


def test_publish_versioning_and_rollback(tmp_path):
    site = tmp_path / "moonai"
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    (pkg / "experiment.json").write_text("{}")
    onnx = tmp_path / "m.onnx"
    gj = tmp_path / "c.geojson"
    gj.write_text("{}")
    from moonai_ml.export.onnx_export import sha256

    for i in (1, 2):
        onnx.write_bytes(b"model%d" % i)
        meta = {"experiment_id": f"e{i}", "trained_at": "t", "dataset_version": "d", "input": {}, "normalization": {}}
        model = {"onnx_path": onnx, "onnx_size_mb": 0.0, "sha256": sha256(onnx), "predictions_path": gj, "metadata": meta}
        publish_local(site, pkg, {"id": f"e{i}", "created_at": f"2026-01-0{i}", "metrics": {"val_f1": i / 10}}, model, 5, 10)
    latest = json.loads((site / "manifests/latest.json").read_text())
    assert latest["version"] == "v2"
    assert rollback(site, "v1")["version"] == "v1"
    idx = json.loads((site / "experiments/index.json").read_text())
    assert [e["id"] for e in idx["experiments"]] == ["e2", "e1"]


def test_global_dedupe_merges_overlapping_tile_detections():
    from moonai_ml.evaluation.craters import dedupe_global

    lon = np.array([10.0, 10.01, 20.0])
    lat = np.array([5.0, 5.0, 5.0])
    d = np.array([20.0, 21.0, 20.0])
    conf = np.array([0.6, 0.9, 0.7])
    assert list(dedupe_global(lon, lat, d, conf)) == [1, 2]  # keeps the more confident duplicate
