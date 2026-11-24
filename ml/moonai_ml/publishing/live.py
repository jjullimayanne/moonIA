"""Live sync of a running experiment to the static site.

Every epoch the run's lightweight artifacts (training history, fixed-tile predictions,
activations, live progress) are copied into `frontend/public/moonai/` and, in `git` mode,
committed and pushed — GitHub Pages redeploys in ~1 min, so the Training Studio follows the
run almost in real time. Mid-epoch progress is pushed at most every `min_interval_s`.

Pushing needs a token with `contents: write` on the repository, read from the
GITHUB_TOKEN environment variable (Colab: the Secrets panel). It is never logged.
Failures are reported and skipped: a sync problem must never stop a training run.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from moonai_ml.log import get_logger, info
from moonai_ml.run import Run, now_iso

log = get_logger()


class LiveSync:
    def __init__(self, run: Run, site: Path, repo: Path, summary: dict, git: bool, min_interval_s: int = 600):
        self.run, self.site, self.repo, self.summary, self.git = run, site, repo, summary, git
        self.min_interval_s = min_interval_s
        self._last_push = 0.0

    # ---- local mirror -------------------------------------------------------
    def mirror(self, status: str = "running") -> None:
        dst = self.site / "experiments" / self.run.id
        dst.mkdir(parents=True, exist_ok=True)
        for name in ("experiment.json", "training_history.json", "architecture.json", "dataset_metadata.json", "configuration.yaml"):
            src = self.run.dir / name
            if src.exists():
                shutil.copy(src, dst / name)
        for sub in ("samples", "activations"):
            if (self.run.dir / sub).exists():
                shutil.copytree(self.run.dir / sub, dst / sub, dirs_exist_ok=True)
        live = self.run.dir / "live" / "progress.json"
        if live.exists():
            (self.site / "live").mkdir(parents=True, exist_ok=True)
            shutil.copy(live, self.site / "live" / "progress.json")
        hist = json.loads((self.run.dir / "training_history.json").read_text())["epochs"] if (self.run.dir / "training_history.json").exists() else []
        metrics = {f"val_{k}": v for k, v in (hist[-1] if hist else {}).items() if k in ("iou", "precision", "recall", "f1") and v is not None}
        idx_path = self.site / "experiments" / "index.json"
        idx = json.loads(idx_path.read_text()) if idx_path.exists() else {"schema_version": "1.0", "experiments": []}
        entry = {**self.summary, "status": status, "approved": False, "model_version": None, "metrics": metrics}
        idx["experiments"] = [e for e in idx["experiments"] if e["id"] != self.run.id] + [entry]
        idx["experiments"].sort(key=lambda e: e["created_at"], reverse=True)
        idx["updated_at"] = now_iso()
        idx_path.write_text(json.dumps(idx, indent=2))

    # ---- git push -------------------------------------------------------------
    def _git(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(["git", "-C", str(self.repo), *args], capture_output=True, text=True, check=check)

    def push(self, message: str, force: bool = False) -> None:
        if not self.git:
            return
        if not force and time.time() - self._last_push < self.min_interval_s:
            return
        try:
            self._git("add", str(self.site.relative_to(self.repo)))
            if not self._git("diff", "--cached", "--quiet", check=False).returncode:
                return  # nothing changed
            self._git("commit", "-q", "-m", message)
            err = ""
            for attempt in range(3):
                r = self._git("push", "-q", check=False)
                if r.returncode == 0:
                    self._last_push = time.time()
                    info(log, f"live sync pushed: {message}")
                    return
                err = r.stderr
                self._git("pull", "-q", "--rebase", "-X", "theirs", check=False)  # someone else pushed meanwhile
                time.sleep(2 * (attempt + 1))
            self._last_push = time.time()  # back off: mid-epoch retries wait min_interval_s, never stalling training
            info(log, f"live sync: push failed 3×, will retry at the next epoch · {_redact(err)}")
        except subprocess.CalledProcessError as e:  # never break training because of sync
            info(log, f"live sync skipped: {e.stderr.strip()[:200] if e.stderr else e}")

    # ---- hooks used by the pipeline ------------------------------------------
    def on_epoch(self, epoch: int, rec: dict) -> None:
        self.mirror("running")
        f1 = rec.get("f1")
        self.push(f"live: {self.run.id} epoch {epoch} · val_loss {rec['val_loss']:.4f}" + (f" · F1 {f1:.3f}" if f1 is not None else ""), force=True)

    def on_progress(self) -> None:
        """Called on mid-epoch progress updates; pushes only the progress file, rate-limited."""
        if not self.git or time.time() - self._last_push < self.min_interval_s:
            return
        self.mirror("running")
        self.push(f"live: {self.run.id} progress", force=False)

    def on_finish(self, status: str) -> None:
        self.mirror(status)


def _redact(text: str) -> str:
    """Last line of a git error, with the token removed (git may echo the remote URL)."""
    token = os.environ.get("GITHUB_TOKEN")
    line = (text or "").strip().splitlines()[-1:] or [""]
    return (line[0].replace(token, "***") if token else line[0])[:200]


def git_mode_ready(repo: Path) -> bool:
    """True when the repository can push (token configured by the notebook)."""
    if not os.environ.get("GITHUB_TOKEN"):
        return False
    r = subprocess.run(["git", "-C", str(repo), "remote", "get-url", "origin"], capture_output=True, text=True, check=False)
    return r.returncode == 0
