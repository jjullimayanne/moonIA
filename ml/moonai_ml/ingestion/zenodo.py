"""DeepMoon dataset on Zenodo (record 1133969, CC-BY-SA-4.0).

* File list, sizes and MD5 checksums come from the Zenodo API at run time and are
  compared with the values pinned below (verified 2026-11-24): a mismatch means the
  record changed and the run stops instead of silently training on different data.
* Downloads are resumable (HTTP Range) and verified by MD5; verified files are never
  downloaded twice. Every file gets a provenance entry in data/raw/deepmoon/PROVENANCE.json.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path

import requests
from tqdm import tqdm

RECORD_ID = "1133969"
RECORD_API = f"https://zenodo.org/api/records/{RECORD_ID}"
DOI = "10.5281/zenodo.1133969"
LICENSE = "CC-BY-SA-4.0"
CITATION = "Silburt et al. (2019), Lunar crater identification via deep learning, Icarus 317, 27-38"
USER_AGENT = "MoonAI/0.1 (+https://github.com/jjullimayanne/moonIA; research use)"

PINNED_MD5 = {
    "train_images.hdf5": "83c1f8b4c7c0c9a9a9c7674ff489ef0a",
    "dev_images.hdf5": "dbd05ba31eac639c3e6f4efaaa946ae9",
    "test_images.hdf5": "9045f7f91a0a10175a6e384a8bbabf63",
    "train_craters.hdf5": "e8acede7db01409b1bec51cea7816e03",
    "dev_craters.hdf5": "d569dd772b9185800347cd1ace7ee0c4",
    "test_craters.hdf5": "f5bf4de056b1151e76c8239532dca350",
}

# DeepMoon split name → file prefix
SPLITS = {"train": "train", "val": "dev", "test": "test"}


@dataclass
class RemoteFile:
    key: str
    size: int
    md5: str
    url: str


def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def list_files(s: requests.Session | None = None) -> dict[str, RemoteFile]:
    s = s or session()
    r = s.get(RECORD_API, timeout=30)
    r.raise_for_status()
    files = {}
    for f in r.json()["files"]:
        algo, digest = f["checksum"].split(":", 1)
        assert algo == "md5", f"unexpected checksum algorithm {algo}"
        files[f["key"]] = RemoteFile(f["key"], f["size"], digest, f["links"]["self"])
    for key, pinned in PINNED_MD5.items():
        if files.get(key) and files[key].md5 != pinned:
            raise RuntimeError(f"Zenodo checksum for {key} changed ({files[key].md5} ≠ pinned {pinned}); dataset version changed.")
    return files


def md5sum(path: Path, chunk: int = 8 << 20) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def _provenance(dest_dir: Path) -> Path:
    return dest_dir / "PROVENANCE.json"


def record_provenance(dest_dir: Path, key: str, entry: dict) -> None:
    p = _provenance(dest_dir)
    data = json.loads(p.read_text()) if p.exists() else {"source": RECORD_API, "doi": DOI, "license": LICENSE, "citation": CITATION, "files": {}}
    data["files"][key] = entry
    p.write_text(json.dumps(data, indent=2))


def download(rf: RemoteFile, dest_dir: Path, s: requests.Session | None = None, retries: int = 5) -> Path:
    """Resumable, checksum-verified download. Idempotent: a verified file is skipped."""
    s = s or session()
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / rf.key
    marker = dest.with_suffix(dest.suffix + ".md5ok")
    if dest.exists() and marker.exists() and marker.read_text().strip() == rf.md5:
        return dest
    if dest.exists() and dest.stat().st_size == rf.size and md5sum(dest) == rf.md5:
        marker.write_text(rf.md5)
        return dest

    part = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, retries + 1):
        have = part.stat().st_size if part.exists() else 0
        if have > rf.size:  # corrupted partial
            part.unlink()
            have = 0
        headers = {"Range": f"bytes={have}-"} if have else {}
        try:
            with s.get(rf.url, headers=headers, stream=True, timeout=60) as r:
                if have and r.status_code != 206:  # server ignored Range → restart
                    have = 0
                    part.unlink(missing_ok=True)
                r.raise_for_status()
                with part.open("ab" if have else "wb") as f, tqdm(
                    total=rf.size, initial=have, unit="B", unit_scale=True, desc=rf.key, leave=False
                ) as bar:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                        bar.update(len(chunk))
            break
        except (requests.RequestException, OSError):
            if attempt == retries:
                raise
            time.sleep(2**attempt)

    got = md5sum(part)
    if got != rf.md5:
        part.unlink()
        raise RuntimeError(f"{rf.key}: MD5 mismatch ({got} ≠ {rf.md5}); corrupted download removed.")
    part.rename(dest)
    marker.write_text(rf.md5)
    record_provenance(dest_dir, rf.key, {"url": rf.url, "md5": rf.md5, "size": rf.size, "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    return dest
