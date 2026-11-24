"""Structured logging: human-readable console + JSON lines file per run."""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

_SECRET_KEYS = ("secret", "token", "password", "credential", "aws_access", "session")


class JsonLines(logging.Handler):
    def __init__(self, path: Path):
        super().__init__()
        path.parent.mkdir(parents=True, exist_ok=True)
        self.f = path.open("a", buffering=1)

    def emit(self, record: logging.LogRecord) -> None:
        extra = {k: v for k, v in getattr(record, "fields", {}).items() if not any(s in k.lower() for s in _SECRET_KEYS)}
        self.f.write(json.dumps({"t": time.time(), "level": record.levelname, "msg": record.getMessage(), **extra}) + "\n")


def get_logger(name: str = "moonai", jsonl: Path | None = None) -> logging.Logger:
    log = logging.getLogger(name)
    if not log.handlers:
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter("%(asctime)s │ %(levelname)-5s │ %(message)s", "%H:%M:%S"))
        log.addHandler(h)
        log.setLevel(logging.INFO)
        log.propagate = False  # avoid duplicate lines via the root logger
    if jsonl and not any(isinstance(h, JsonLines) for h in log.handlers):
        log.addHandler(JsonLines(jsonl))
    return log


def info(log: logging.Logger, msg: str, **fields) -> None:
    log.info(msg, extra={"fields": fields})
