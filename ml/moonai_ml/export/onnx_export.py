"""ONNX export + PyTorch↔ONNX equivalence + optional dynamic int8 quantization."""

from __future__ import annotations

import hashlib
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from moonai_ml.models.unet import UNet

OPSET = 17  # supported by ONNX Runtime Web (wasm/webgpu)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export(best_ckpt: Path, out: Path, filters: int, sample: np.ndarray) -> dict:
    st = torch.load(best_ckpt, map_location="cpu", weights_only=False)
    model = UNet(filters, 0.0)
    model.load_state_dict(st["model"])
    model.eval()
    x = torch.from_numpy(sample[None, None].astype(np.float32))
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(model, x, out, input_names=["dem"], output_names=["logits"], opset_version=OPSET,
                      dynamic_axes={"dem": {0: "batch"}, "logits": {0: "batch"}}, dynamo=False)
    with torch.no_grad():
        ref = torch.sigmoid(model(x)).numpy()
    sess = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    t = time.perf_counter()
    got = 1 / (1 + np.exp(-sess.run(None, {"dem": x.numpy()})[0]))
    ms = (time.perf_counter() - t) * 1000
    return {
        "path": str(out),
        "opset": OPSET,
        "size_mb": round(out.stat().st_size / 2**20, 2),
        "sha256": sha256(out),
        "max_abs_diff_vs_torch": float(np.abs(ref - got).max()),
        "cpu_inference_ms_per_tile": round(ms, 1),
        "best_epoch": st["epoch"],
    }


def quantize(fp32: Path, sample: np.ndarray) -> dict | None:
    """Dynamic int8 quantization; reported only — the fp32 model stays the reference."""
    try:
        from onnxruntime.quantization import QuantType, quantize_dynamic
    except ImportError:
        return None
    q = fp32.with_name(fp32.stem + ".int8.onnx")
    quantize_dynamic(str(fp32), str(q), weight_type=QuantType.QInt8)
    x = sample[None, None].astype(np.float32)
    a = ort.InferenceSession(str(fp32), providers=["CPUExecutionProvider"]).run(None, {"dem": x})[0]
    b = ort.InferenceSession(str(q), providers=["CPUExecutionProvider"]).run(None, {"dem": x})[0]
    sig = lambda v: 1 / (1 + np.exp(-v))
    return {"path": str(q), "size_mb": round(q.stat().st_size / 2**20, 2), "max_abs_prob_diff_vs_fp32": float(np.abs(sig(a) - sig(b)).max())}
