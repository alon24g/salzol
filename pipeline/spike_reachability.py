"""Milestone 0 spike: can we reach every chain's portal from this machine?

For every scraper in il-supermarket-scraper, try to download the latest
Stores file and one PriceFull file, then inspect what actually landed on disk
(size, encoding, root tag, item count, field names).

Usage:
    python pipeline/spike_reachability.py --out spike_out [--chains SHUFERSAL,RAMI_LEVY]

Writes <out>/report.json and <out>/report.md.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import socket
import sys
import time
import traceback
import types
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from lxml import etree

if sys.platform == "win32":
    # The scraper imports fcntl (Unix-only) just for flock() around its file cache.
    # This spike runs sequentially in one process, so a no-op lock is safe locally.
    _fcntl = types.ModuleType("fcntl")
    _fcntl.LOCK_EX, _fcntl.LOCK_UN = 2, 8
    _fcntl.flock = lambda *_a, **_k: None
    sys.modules["fcntl"] = _fcntl

from il_supermarket_scarper import FileTypesFilters, ScraperFactory
from il_supermarket_scarper.utils.file_output import DiskFileOutput

PER_FILE_TYPE_TIMEOUT_S = 240
ITEM_TAGS = {"item", "product", "store", "branch"}


def sniff_encoding(raw: bytes) -> str:
    if raw.startswith(b"\xef\xbb\xbf"):
        return "utf-8-sig"
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return "utf-16"
    head = raw[:200].decode("ascii", errors="ignore").lower()
    if 'encoding="' in head:
        return "declared:" + head.split('encoding="', 1)[1].split('"', 1)[0]
    try:
        raw[:100_000].decode("utf-8")
        return "utf-8 (undeclared)"
    except UnicodeDecodeError:
        return "unknown (not utf-8)"


def inspect_xml(path: Path) -> dict:
    """Describe a downloaded file without assuming its schema."""
    raw = path.read_bytes()
    info: dict = {
        "file": path.name,
        "bytes": len(raw),
        "encoding": sniff_encoding(raw),
    }
    try:
        root = etree.fromstring(raw, parser=etree.XMLParser(recover=True, huge_tree=True))
    except Exception as e:  # noqa: BLE001 - spike: record anything
        info["parse_error"] = repr(e)
        return info
    if root is None:
        info["parse_error"] = "empty document"
        return info

    info["root_tag"] = root.tag
    tag_counts = Counter(el.tag for el in root.iter() if isinstance(el.tag, str))
    # The repeating record element: the most frequent tag whose children are leaves.
    record_tag, record_count = None, 0
    for tag, count in tag_counts.most_common():
        if tag.lower() in ITEM_TAGS or (count > 1 and record_tag is None):
            sample = root.find(f".//{tag}")
            if sample is not None and len(sample) > 2:
                record_tag, record_count = tag, count
                if tag.lower() in ITEM_TAGS:
                    break
    info["record_tag"] = record_tag
    info["record_count"] = record_count
    if record_tag:
        sample = root.find(f".//{record_tag}")
        info["record_fields"] = [c.tag for c in sample if isinstance(c.tag, str)]
    # Header-level fields (direct leaf children of root)
    info["header_fields"] = [c.tag for c in root if isinstance(c.tag, str) and len(c) == 0]
    return info


async def fetch_one(scraper_enum: ScraperFactory, file_type: str, out_dir: Path) -> dict:
    target = out_dir / scraper_enum.name / file_type
    target.mkdir(parents=True, exist_ok=True)
    scraper_cls = scraper_enum.value
    scraper = scraper_cls(file_output=DiskFileOutput(storage_path=str(target)))

    started = time.monotonic()
    results = []

    async def run():
        async for r in scraper.scrape(limit=1, files_types=[file_type]):
            results.append(r)

    error = None
    try:
        await asyncio.wait_for(run(), timeout=PER_FILE_TYPE_TIMEOUT_S)
    except asyncio.TimeoutError:
        error = f"timeout after {PER_FILE_TYPE_TIMEOUT_S}s"
    except Exception as e:  # noqa: BLE001
        error = f"{type(e).__name__}: {e}"
        traceback.print_exc()

    files = [p for p in target.iterdir() if p.is_file() and p.suffix.lower() == ".xml"]
    entry: dict = {
        "seconds": round(time.monotonic() - started, 1),
        "results": [
            {"file": r.file_name, "ok": bool(r.extract_succefully), "error": r.error}
            for r in results
        ],
        "error": error,
        "ok": bool(files),
    }
    if not files and not error:
        errs = [r.error for r in results if r.error]
        entry["error"] = errs[0] if errs else "no file downloaded (none listed or all failed)"
    if files:
        entry["inspect"] = inspect_xml(max(files, key=lambda p: p.stat().st_size))
    return entry


async def main_async(chains: list[ScraperFactory], out_dir: Path) -> dict:
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "host": socket.gethostname(),
        "runner": "github-actions" if os.environ.get("GITHUB_ACTIONS") else "local",
        "platform": platform.platform(),
        "chains": {},
    }
    # Sequential on purpose: be polite to portals (spec §10).
    for chain in chains:
        print(f"=== {chain.name}", flush=True)
        report["chains"][chain.name] = {
            ft: await fetch_one(chain, ft, out_dir)
            for ft in (FileTypesFilters.STORE_FILE.name, FileTypesFilters.PRICE_FULL_FILE.name)
        }
        summary = {k: v["ok"] for k, v in report["chains"][chain.name].items()}
        print(f"    {summary}", flush=True)
    return report


def fmt_size(n: int | None) -> str:
    if not n:
        return "-"
    return f"{n / 1024 / 1024:.1f} MB" if n > 1024 * 1024 else f"{n / 1024:.0f} KB"


def to_markdown(report: dict) -> str:
    lines = [
        f"# Reachability — {report['runner']} ({report['host']}) — {report['generated_at']}",
        "",
        "| Chain | Stores | PriceFull | PriceFull size | Items | Encoding | Error |",
        "|---|---|---|---|---|---|---|",
    ]
    for name, r in report["chains"].items():
        s, p = r["STORE_FILE"], r["PRICE_FULL_FILE"]
        pi = p.get("inspect", {})
        err = s.get("error") or p.get("error") or ""
        lines.append(
            f"| {name} | {'✅' if s['ok'] else '❌'} | {'✅' if p['ok'] else '❌'} | "
            f"{fmt_size(pi.get('bytes'))} | {pi.get('record_count', '-')} | "
            f"{pi.get('encoding', '-')} | {str(err)[:80].replace('|', '/')} |"
        )
    lines += ["", "## Field names (PriceFull record / Stores record)", ""]
    for name, r in report["chains"].items():
        pi = r["PRICE_FULL_FILE"].get("inspect", {})
        si = r["STORE_FILE"].get("inspect", {})
        lines.append(f"- **{name}**: price `{pi.get('record_tag')}` → {pi.get('record_fields')}")
        lines.append(f"  stores `{si.get('record_tag')}` → {si.get('record_fields')}")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="spike_out")
    ap.add_argument("--chains", default="", help="comma-separated ScraperFactory names")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    chains = (
        [ScraperFactory[c.strip()] for c in args.chains.split(",") if c.strip()]
        if args.chains
        else list(ScraperFactory)
    )
    report = asyncio.run(main_async(chains, out_dir))
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
    (out_dir / "report.md").write_text(to_markdown(report), "utf-8")
    print(to_markdown(report))


if __name__ == "__main__":
    main()
