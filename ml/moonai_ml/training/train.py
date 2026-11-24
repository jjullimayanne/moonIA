"""Training loop with everything the Training Studio and the quality gate need.

Per epoch: train/val loss, pixel IoU, crater precision/recall/F1 (template matching on a
fixed validation subset), learning rate, wall time; predictions for a fixed set of
validation tiles (PNG) and, at selected epochs, mean activations of a few layers.
Robustness: seeded, checkpoint every epoch + best, resumable, early stopping,
ReduceLROnPlateau, automatic batch-size halving on out-of-memory.
"""

from __future__ import annotations

import copy
import random
import time
from pathlib import Path

import numpy as np
import torch
from matplotlib import colormaps
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader

from moonai_ml import hardware
from moonai_ml.config import Config
from moonai_ml.evaluation.craters import extract_craters, match, pixel_iou, summarize
from moonai_ml.log import get_logger, info
from moonai_ml.models.unet import ACTIVATION_LAYERS, UNet, describe
from moonai_ml.preprocessing.dataset import TileDataset
from moonai_ml.run import Run

log = get_logger()


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def _png(arr: np.ndarray, path: Path, cmap: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    a = np.clip(arr, 0, 1)
    img = (colormaps[cmap](a)[..., :3] * 255).astype(np.uint8) if cmap else (a * 255).astype(np.uint8)
    Image.fromarray(img).save(path, optimize=True)


def _rims_png(mask: np.ndarray, path: Path) -> None:
    rgb = np.zeros((*mask.shape, 3), dtype=np.uint8)
    rgb[mask > 0.5] = (63, 214, 245)  # same cyan as the map rims
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb).save(path, optimize=True)


@torch.no_grad()
def evaluate(model, loader, device, crater_gt, cfg: Config, n_crater_tiles: int):
    model.eval()
    bce = nn.BCEWithLogitsLoss(reduction="sum")
    loss_sum, n_px, ious, probs = 0.0, 0, [], []
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        logits = model(x)
        loss_sum += bce(logits, y).item()
        n_px += y.numel()
        p = torch.sigmoid(logits).cpu().numpy()[:, 0]
        for pi, yi in zip(p, y.cpu().numpy()[:, 0]):
            ious.append(pixel_iou(pi, yi, cfg.evaluation.target_thresh))
            if len(probs) < n_crater_tiles:
                probs.append(pi)
    valid = [v for v in ious if v is not None]
    out = {"val_loss": loss_sum / n_px, "iou": float(np.mean(valid)) if valid else None}
    if crater_gt is not None:
        e = cfg.evaluation
        res = [
            match(extract_craters(p, e.min_radius_px, e.max_radius_px, e.template_thresh, e.target_thresh, e.longlat_thresh2, e.rad_thresh), crater_gt[i], e.longlat_thresh2, e.rad_thresh)
            for i, p in enumerate(probs)
        ]
        s = summarize(res)
        out.update(precision=s["precision"], recall=s["recall"], f1=s["f1"], loc_err=s["loc_err_median"], diam_err=s["diam_err_median"])
    else:
        out.update(precision=None, recall=None, f1=None, loc_err=None, diam_err=None)
    return out


def train(cfg: Config, run: Run, train_h5: Path, val_h5: Path, crater_gt, mlflow=None, on_epoch=None) -> dict:
    seed_everything(cfg.seed)
    hw = hardware.detect(str(cfg.paths.artifacts.parent))
    device = torch.device(hw.device)
    bs = cfg.train.batch_size if cfg.train.batch_size != "auto" else hardware.suggest_batch_size(hw, cfg.model.filters)
    info(log, f"device={hw.device} ({hw.device_name}) · RAM avail {hw.ram_available_gb} GB · batch={bs}", device=hw.device, batch=bs)

    train_ds = TileDataset(train_h5, augment=True, seed=cfg.seed)
    val_ds = TileDataset(val_h5)
    val_loader = DataLoader(val_ds, batch_size=max(1, bs), shuffle=False)

    model = UNet(cfg.model.filters, cfg.model.dropout).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=cfg.train.lr, weight_decay=cfg.train.weight_decay)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, factor=0.5, patience=1)
    # class-balanced training loss; validation loss stays unweighted so runs remain comparable
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([cfg.train.pos_weight], device=device))
    # NVIDIA GPUs: fp16 mixed precision (≈2× faster on a Colab T4). MPS/CPU stay in fp32.
    amp = device.type == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=amp)
    workers = 2 if device.type == "cuda" else 0

    history: list[dict] = []
    start_epoch, best, bad_epochs = 1, float("inf"), 0
    ckpt = run.dir / "checkpoints" / "last.pt"
    if ckpt.exists():  # resume after interruption
        st = torch.load(ckpt, map_location=device, weights_only=False)
        model.load_state_dict(st["model"])
        opt.load_state_dict(st["opt"])
        sched.load_state_dict(st["sched"])
        history, best, bad_epochs, bs = st["history"], st["best"], st["bad_epochs"], st["batch_size"]
        torch.set_rng_state(st["rng_torch"])
        np.random.set_state(st["rng_np"])
        start_epoch = st["epoch"] + 1
        info(log, f"resuming from epoch {st['epoch']}", epoch=st["epoch"])

    # fixed validation tiles for the visual replay
    fixed = list(range(min(cfg.data.fixed_val_samples, len(val_ds))))
    samples_dir = run.dir / "samples"
    for i in fixed:
        x, y = val_ds[i]
        _png(x[0].numpy(), samples_dir / f"val_{i:03d}_input.png")
        _rims_png(y[0].numpy(), samples_dir / f"val_{i:03d}_target.png")

    acts: dict[str, torch.Tensor] = {}
    hooks = [getattr(model, n).register_forward_hook(lambda m, i, o, n=n: acts.__setitem__(n, o.detach())) for n in ACTIVATION_LAYERS]

    def write_samples_index() -> None:
        """Which fixed tiles / epochs / activation maps exist — rewritten every epoch for live viewing."""
        last = history[-1]["epoch"] if history else 0
        run.write_json(
            "samples/index.json",
            {
                "samples": [
                    {"id": f"val_{i:03d}", "split": "val", "lon_range": val_ds.llbd[i, :2].tolist(), "lat_range": val_ds.llbd[i, 2:].tolist()}
                    for i in fixed
                ],
                "epochs": [r["epoch"] for r in history],
                "activation_layers": list(ACTIVATION_LAYERS),
                "activation_epochs": sorted(int(p.name.split("_")[1]) for p in (run.dir / "activations").glob("epoch_*")) if last else [],
            },
        )

    steps_per_epoch = max(1, len(train_ds) // bs)
    for epoch in range(start_epoch, cfg.train.epochs + 1):
        t0 = time.time()
        snapshot = (copy.deepcopy(model.state_dict()), copy.deepcopy(opt.state_dict()))
        while True:
            try:
                model.train()
                loader = DataLoader(train_ds, batch_size=bs, shuffle=True, drop_last=len(train_ds) > bs, num_workers=workers, pin_memory=amp)
                steps_per_epoch = len(loader)
                tl, n = 0.0, 0
                for step, (x, y) in enumerate(loader, 1):
                    x, y = x.to(device), y.to(device)
                    opt.zero_grad(set_to_none=True)
                    with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=amp):
                        loss = loss_fn(model(x), y)
                    if not torch.isfinite(loss):
                        raise FloatingPointError(f"non-finite loss at epoch {epoch} step {step}")
                    scaler.scale(loss).backward()
                    scaler.step(opt)
                    scaler.update()
                    tl += loss.item() * len(x)
                    n += len(x)
                    if step % cfg.train.progress_every_steps == 0 or step == steps_per_epoch:
                        run.progress("running", epoch, cfg.train.epochs, step, steps_per_epoch, {"train_loss": tl / n})
                break
            except RuntimeError as err:
                if not hardware.is_oom(err) or bs == 1:
                    raise
                hardware.empty_cache(hw.device)
                model.load_state_dict(snapshot[0])
                opt.load_state_dict(snapshot[1])
                bs //= 2
                info(log, f"out of memory → retrying epoch {epoch} with batch {bs}", batch=bs)

        metrics = evaluate(model, val_loader, device, crater_gt, cfg, cfg.train.eval_tiles_per_epoch)
        rec = {"epoch": epoch, "train_loss": tl / n, **metrics, "lr": opt.param_groups[0]["lr"], "seconds": round(time.time() - t0, 2), "batch_size": bs}
        history.append(rec)
        sched.step(metrics["val_loss"])
        info(log, "epoch " + " · ".join(f"{k}={v:.4f}" if isinstance(v, float) else f"{k}={v}" for k, v in rec.items()), **rec)
        if mlflow:
            mlflow.log_metrics({k: v for k, v in rec.items() if isinstance(v, (int, float)) and k != "epoch"}, step=epoch)

        # visual replay: predictions on the fixed tiles; activations at selected epochs
        model.eval()
        with torch.no_grad():
            xs = torch.stack([val_ds[i][0] for i in fixed]).to(device)
            probs = torch.sigmoid(model(xs)).cpu().numpy()[:, 0]
        for i, p in zip(fixed, probs):
            _png(p, samples_dir / f"epoch_{epoch:03d}" / f"val_{i:03d}_pred.png", cmap="inferno")
        if epoch in cfg.train.activation_epochs or epoch == cfg.train.epochs:
            for name, a in acts.items():  # last forward pass = fixed tiles; first tile only
                m = a[0].mean(0).cpu().numpy()
                m = (m - m.min()) / (np.ptp(m) + 1e-8)
                _png(m, run.dir / "activations" / f"epoch_{epoch:03d}" / f"{name}.png", cmap="viridis")

        improved = metrics["val_loss"] < best - 1e-6
        if improved:
            best, bad_epochs = metrics["val_loss"], 0
        else:
            bad_epochs += 1
        state = {
            "model": model.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(), "epoch": epoch,
            "history": history, "best": best, "bad_epochs": bad_epochs, "batch_size": bs,
            "rng_torch": torch.get_rng_state(), "rng_np": np.random.get_state(),
        }
        ckpt.parent.mkdir(parents=True, exist_ok=True)
        torch.save(state, ckpt)
        if improved:
            torch.save({"model": model.state_dict(), "epoch": epoch, "cfg": cfg.model.model_dump()}, ckpt.parent / "best.pt")
        run.write_json("training_history.json", {"epochs": history})
        write_samples_index()
        if on_epoch:
            on_epoch(epoch, rec)
        if bad_epochs >= cfg.train.early_stopping_patience:
            info(log, f"early stopping at epoch {epoch}")
            break

    for h in hooks:
        h.remove()
    write_samples_index()
    return {"history": history, "hardware": hw.as_dict(), "architecture": describe(model, cfg.model.filters), "batch_size": bs}
