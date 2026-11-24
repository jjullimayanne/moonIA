"""Hardware detection: CUDA → MPS (Apple Silicon) → CPU, memory, disk, batch size."""

from __future__ import annotations

import os
import platform
import shutil
from dataclasses import asdict, dataclass

import psutil
import torch


@dataclass
class Hardware:
    device: str
    device_name: str
    platform: str
    cpu_count: int
    ram_total_gb: float
    ram_available_gb: float
    disk_free_gb: float
    torch_version: str

    def as_dict(self) -> dict:
        return asdict(self)


def detect(path_for_disk: str = ".") -> Hardware:
    forced = os.environ.get("MOONAI_DEVICE")
    if forced:
        device = forced
    elif torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    name = torch.cuda.get_device_name(0) if device == "cuda" else ("Apple Silicon GPU (MPS)" if device == "mps" else platform.processor() or "CPU")
    vm = psutil.virtual_memory()
    return Hardware(
        device=device,
        device_name=name,
        platform=f"{platform.system()} {platform.machine()}",
        cpu_count=os.cpu_count() or 1,
        ram_total_gb=round(vm.total / 2**30, 1),
        ram_available_gb=round(vm.available / 2**30, 1),
        disk_free_gb=round(shutil.disk_usage(path_for_disk).free / 2**30, 1),
        torch_version=torch.__version__,
    )


def suggest_batch_size(hw: Hardware, filters: int, tile: int = 256) -> int:
    """Conservative estimate from activation memory of a 3-level U-Net.

    Peak activations ≈ tile² · filters · ~14 maps · 4 bytes · 3 (fwd+bwd+optimizer slack) per sample.
    MPS shares unified memory with the OS, so only half of the available RAM is budgeted.
    """
    per_sample = tile * tile * filters * 14 * 4 * 3
    if hw.device == "cuda":
        budget = torch.cuda.get_device_properties(0).total_memory * 0.7
    else:
        budget = hw.ram_available_gb * 2**30 * 0.5
    bs = int(budget // per_sample)
    return max(1, min(32, 2 ** max(0, bs.bit_length() - 1)))


def is_oom(err: BaseException) -> bool:
    msg = str(err).lower()
    return "out of memory" in msg or "mps backend out of memory" in msg


def empty_cache(device: str) -> None:
    if device == "cuda":
        torch.cuda.empty_cache()
    elif device == "mps":
        torch.mps.empty_cache()
