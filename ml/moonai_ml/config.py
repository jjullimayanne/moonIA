"""Central configuration: YAML profiles (configs/*.yaml) validated with pydantic."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = REPO_ROOT / "configs"


class Paths(BaseModel):
    raw: Path = REPO_ROOT / "data" / "raw"
    processed: Path = REPO_ROOT / "data" / "processed"
    artifacts: Path = REPO_ROOT / "artifacts"
    mlruns: Path = REPO_ROOT / "experiments" / "mlruns"
    frontend_public: Path = REPO_ROOT / "frontend" / "public"


class DataCfg(BaseModel):
    n_train: int = Field(gt=0)
    n_val: int = Field(gt=0)
    n_test: int = Field(ge=0)
    fixed_val_samples: int = 4


class ModelCfg(BaseModel):
    filters: int = 112
    dropout: float = 0.15


class TrainCfg(BaseModel):
    epochs: int = 4
    batch_size: int | Literal["auto"] = "auto"
    lr: float = 1e-4
    weight_decay: float = 1e-6
    early_stopping_patience: int = 3
    # weight of rim pixels in the BCE loss (rims are ~1.45 % of pixels); 1.0 = unweighted, as in DeepMoon
    pos_weight: float = 1.0
    activation_epochs: list[int] = []
    eval_tiles_per_epoch: int = 64  # crater metrics per epoch on a fixed val subset (template matching is slow)
    progress_every_steps: int = 20


class EvalCfg(BaseModel):
    template_thresh: float = 0.5
    target_thresh: float = 0.1
    min_radius_px: int = 5
    max_radius_px: int = 40
    longlat_thresh2: float = 1.8
    rad_thresh: float = 1.0


class GateCfg(BaseModel):
    min_val_f1: float = 0.3
    allow_publish: bool = True
    max_onnx_mb: float = 60.0
    onnx_atol: float = 1e-3


class PublishCfg(BaseModel):
    keep_versions: int = 5
    max_upload_mb: float = 60.0


class Config(BaseModel):
    profile: Literal["smoke", "development", "production"]
    seed: int = 42
    data: DataCfg
    model: ModelCfg = ModelCfg()
    train: TrainCfg = TrainCfg()
    evaluation: EvalCfg = EvalCfg()
    gate: GateCfg = GateCfg()
    publish: PublishCfg = PublishCfg()
    paths: Paths = Paths()


def load_config(profile: str) -> Config:
    path = Path(profile) if profile.endswith(".yaml") else CONFIG_DIR / f"{profile}.yaml"
    cfg = Config.model_validate(yaml.safe_load(path.read_text()))
    # manual overrides from the environment (documented in README)
    if bs := os.environ.get("MOONAI_BATCH_SIZE"):
        cfg.train.batch_size = int(bs)
    if ep := os.environ.get("MOONAI_EPOCHS"):
        cfg.train.epochs = int(ep)
    # storage overrides, e.g. Google Drive on Colab so data and checkpoints survive disconnects
    if root := os.environ.get("MOONAI_DATA_ROOT"):
        cfg.paths.raw, cfg.paths.processed = Path(root) / "raw", Path(root) / "processed"
    if art := os.environ.get("MOONAI_ARTIFACTS"):
        cfg.paths.artifacts, cfg.paths.mlruns = Path(art), Path(art) / "mlruns"
    if mlr := os.environ.get("MOONAI_MLRUNS"):  # e.g. local disk on Colab (SQLite dislikes network filesystems)
        cfg.paths.mlruns = Path(mlr)
    return cfg
