#!/usr/bin/env python3
"""Package src/ into a byte-reproducible ZIP for the Chrome Web Store.

Why a script and not a one-line `zip` invocation: the artefact hash in
docs/deployment.md is only worth recording if the same sources always produce
the same bytes. A plain `zip` does not do that. It stores each file's mtime in
the archive, so a fresh git clone — where every file carries its checkout time —
yields a different hash for identical content. The property would look present
and be absent, which is worse than not claiming it.

Determinism here comes from pinning everything ZIP would otherwise inherit from
the filesystem: entry order, timestamp, permissions and compression. Python's
zipfile is in the standard library, so this adds no dependency to a project that
deliberately has none.

Usage:  python3 tools/package.py            # version read from src/manifest.json
        python3 tools/package.py --check    # pack twice, prove the hashes match
"""

import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BUILD = ROOT / "build"

# The ZIP epoch. Any fixed value works; this one is the format's own minimum and
# makes it obvious in a listing that the timestamp carries no information.
FIXED_TIME = (1980, 1, 1, 0, 0, 0)
# rw-r--r-- for a regular file. Whatever the checkout happens to carry must not
# reach the archive, or two clones with different umasks would disagree.
FIXED_MODE = 0o644 << 16


def build(destination: Path) -> str:
    """Writes the archive and returns its SHA-256. Overwrites without asking."""
    files = sorted(p for p in SRC.rglob("*") if p.is_file())
    if not files:
        sys.exit(f"nothing to package: {SRC} is empty")

    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            # arcname is relative to src/, so the manifest lands at the archive
            # root — the store rejects an extension nested inside a folder.
            info = zipfile.ZipInfo(str(path.relative_to(SRC)), date_time=FIXED_TIME)
            info.external_attr = FIXED_MODE
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())

    return hashlib.sha256(destination.read_bytes()).hexdigest()


def main() -> None:
    version = json.loads((SRC / "manifest.json").read_text())["version"]
    target = BUILD / f"ms-account-picker-{version}.zip"

    digest = build(target)

    if "--check" in sys.argv:
        # Pack a second time and compare. Reproducibility that has not been
        # demonstrated is a claim, not a property.
        control = BUILD / f".repro-check-{version}.zip"
        again = build(control)
        control.unlink()
        if digest != again:
            sys.exit(f"NOT reproducible:\n  {digest}\n  {again}")
        print("reproducible: two packs, identical bytes")

    print(f"{digest}  {target.relative_to(ROOT)}")
    print(f"{len(list(SRC.rglob('*')))} entries, {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
