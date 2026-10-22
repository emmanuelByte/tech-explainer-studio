#!/usr/bin/env python3
"""Side-by-side review sheet: our frames (top row) vs reference frames (bottom row).

Usage:
  python3 side_by_side.py --ours <dir> --ref <dir> --out sheet.webp [--n 6] [--height 640]

Picks n evenly spaced images (png/jpg/webp) from each folder, ignoring files whose
name contains "contact". Needs Pillow (pip install pillow).
"""
import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw

EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def natural(p: Path) -> list:
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", p.name)]


def pick(folder: Path, n: int) -> list[Path]:
    files = sorted((p for p in folder.iterdir() if p.suffix.lower() in EXTS and "contact" not in p.name), key=natural)
    if not files:
        raise SystemExit(f"no images in {folder}")
    if len(files) <= n:
        return files
    step = (len(files) - 1) / (n - 1)
    return [files[round(i * step)] for i in range(n)]


def row(paths: list[Path], height: int, label: str) -> Image.Image:
    ims = []
    for p in paths:
        im = Image.open(p).convert("RGB")
        ims.append(im.resize((round(im.width * height / im.height), height)))
    gap = 12
    width = sum(i.width for i in ims) + gap * (len(ims) - 1)
    out = Image.new("RGB", (width, height + 40), (12, 18, 32))
    x = 0
    for im in ims:
        out.paste(im, (x, 40))
        x += im.width + gap
    ImageDraw.Draw(out).text((8, 12), label, fill=(220, 228, 240))
    return out


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--ours", required=True, type=Path)
    a.add_argument("--ref", required=True, type=Path)
    a.add_argument("--out", required=True, type=Path)
    a.add_argument("--n", type=int, default=6)
    a.add_argument("--height", type=int, default=640)
    args = a.parse_args()

    top = row(pick(args.ours, args.n), args.height, f"OURS  {args.ours}")
    bottom = row(pick(args.ref, args.n), args.height, f"REFERENCE  {args.ref}  (comparison only)")
    sheet = Image.new("RGB", (max(top.width, bottom.width), top.height + bottom.height + 20), (6, 13, 31))
    sheet.paste(top, (0, 0))
    sheet.paste(bottom, (0, top.height + 20))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out, quality=85)
    print(args.out)


if __name__ == "__main__":
    main()
