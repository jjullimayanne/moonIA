"""A pipeline run: its directory, stage state (for idempotent resume) and live progress."""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path

from moonai_ml.config import REPO_ROOT, Config

STAGES = ["download", "preprocess", "train", "evaluate", "export", "gate", "predict", "package", "publish"]


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def git_commit() -> str | None:
    try:
        return subprocess.check_output(["git", "-C", str(REPO_ROOT), "rev-parse", "--short", "HEAD"], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


class Run:
    def __init__(self, path: Path, sync_dirs: list[Path] | None = None):
        self.dir = path
        self.dir.mkdir(parents=True, exist_ok=True)
        self.sync_dirs = sync_dirs or []
        self._last_sync = 0.0

    @classmethod
    def create(cls, cfg: Config, sync_dirs=None) -> Run:
        rid = f"{cfg.profile}-{time.strftime('%Y%m%d-%H%M%S')}-{git_commit() or 'nogit'}"
        run = cls(cfg.paths.artifacts / "runs" / rid, sync_dirs)
        run.write_json("state.json", {"id": rid, "profile": cfg.profile, "created_at": now_iso(), "stages": {}})
        return run

    @classmethod
    def latest_incomplete(cls, cfg: Config, sync_dirs=None) -> Run | None:
        root = cfg.paths.artifacts / "runs"
        for d in sorted(root.glob(f"{cfg.profile}-*"), reverse=True) if root.exists() else []:
            st = json.loads((d / "state.json").read_text())
            if not st.get("finished"):
                return cls(d, sync_dirs)
        return None

    @property
    def id(self) -> str:
        return self.dir.name

    @property
    def state(self) -> dict:
        return json.loads((self.dir / "state.json").read_text())

    def write_json(self, rel: str, data) -> Path:
        p = self.dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, default=str))
        tmp.replace(p)  # atomic: readers never see a half-written file
        return p

    def done(self, stage: str) -> bool:
        return self.state["stages"].get(stage, {}).get("status") == "done"

    def mark(self, stage: str, status: str, **info) -> None:
        st = self.state
        st["stages"][stage] = {"status": status, "at": now_iso(), **info}
        if stage == STAGES[-1] or info.get("finished"):
            st["finished"] = True
        self.write_json("state.json", st)

    def finish(self) -> None:
        st = self.state
        st["finished"] = True
        self.write_json("state.json", st)

    def progress(self, status: str, epoch: int, total_epochs: int, step: int, total_steps: int, metrics: dict, force=False) -> None:
        """Lightweight live JSON; mirrored to sync targets at most every 30 s."""
        data = {
            "experiment_id": self.id, "status": status, "epoch": epoch, "total_epochs": total_epochs,
            "step": step, "total_steps": total_steps, "metrics": metrics, "updated_at": now_iso(),
        }
        p = self.write_json("live/progress.json", data)
        if self.sync_dirs and (force or time.time() - self._last_sync > 30 or step == total_steps):
            for d in self.sync_dirs:
                (d / "live").mkdir(parents=True, exist_ok=True)
                shutil.copy(p, d / "live" / "progress.json")
            self._last_sync = time.time()
