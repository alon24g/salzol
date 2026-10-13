"""Download raw chain files via il-supermarket-scraper, behind our own interface.

Everything chain-portal specific (upstream bugs, politeness limits, platform
shims) is patched here so the rest of the pipeline never imports the scraper.

Usage:
    python -m pipeline.fetch --out raw --chains SHUFERSAL,RAMI_LEVY,VICTORY_NEW_SOURCE
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
import types
from datetime import datetime, timezone
from pathlib import Path

if sys.platform == "win32":
    # The scraper imports fcntl (Unix-only) just for flock() around its file cache.
    # We fetch chains sequentially in one process, so a no-op lock is safe.
    _fcntl = types.ModuleType("fcntl")
    _fcntl.LOCK_EX, _fcntl.LOCK_UN = 2, 8
    _fcntl.flock = lambda *_a, **_k: None
    sys.modules["fcntl"] = _fcntl

from il_supermarket_scarper import FileTypesFilters, ScraperFactory  # noqa: E402
from il_supermarket_scarper.engines import Bina  # noqa: E402
from il_supermarket_scarper.utils.file_output import DiskFileOutput  # noqa: E402

# Concurrent downloads per chain. Upstream default is 10; be polite (spec §10).
MAX_CONCURRENT_DOWNLOADS = 3
CHAIN_TIMEOUT_S = 60 * 45

FILE_TYPES = {
    "stores": FileTypesFilters.STORE_FILE.name,
    "price_full": FileTypesFilters.PRICE_FULL_FILE.name,
    "promo_full": FileTypesFilters.PROMO_FULL_FILE.name,
}


_NAME_TS = re.compile(r"^(?P<key>.+?)-(?P<date>\d{8})(?P<time>\d{4,6})?(?:-(?P<time2>\d{2,6}))?$")


def file_key_and_stamp(name: str) -> tuple[str, str]:
    """Split a portal file name into (per-store key, sortable timestamp).

    Seen in real listings:
      PriceFull7290058140886-001-001-20261013-001006   (Cerberus, Bina, laibcatalog)
      pricefull7290058140886-039-202607150513          (date+time fused)
    """
    stem = name.rsplit("/", 1)[-1].split(".", 1)[0]
    m = _NAME_TS.match(stem)
    if not m:
        return stem.lower(), ""
    return m["key"].lower(), m["date"] + (m["time"] or m["time2"] or "").ljust(6, "0")


def _latest_per_store(original_unique):
    """Wrap Engine.unique so only the newest listed file per store is downloaded.
    Portals list every intraday version (e.g. Rami Levy: 2-3 PriceFull per store per
    day); we only ever use the newest, so skip the rest (spec §10: be polite)."""

    async def unique(state, iterable, by_function=lambda x: x):
        newest: dict[str, tuple[str, object]] = {}
        async for f in original_unique(state, iterable, by_function=by_function):
            key, stamp = file_key_and_stamp(by_function(f))
            if key not in newest or stamp > newest[key][0]:
                newest[key] = (stamp, f)
        for _, f in newest.values():
            yield f

    return unique


def make_scraper(chain: str, out_dir: Path):
    scraper = ScraperFactory[chain].value(file_output=DiskFileOutput(storage_path=str(out_dir)))
    scraper.max_threads = MAX_CONCURRENT_DOWNLOADS
    scraper.unique = _latest_per_store(scraper.unique)
    if isinstance(scraper, Bina) and scraper.url.startswith("http://"):
        # binaprojects.com now 302-redirects http→https and the scraper's listing
        # call doesn't follow it, so every Bina chain silently lists 0 files (v1.0.8).
        scraper.url = "https://" + scraper.url[len("http://"):]
    return scraper


async def fetch_chain(chain: str, kinds: list[str], out_root: Path) -> dict:
    """Download every listed file of the given kinds. Returns a status dict."""
    status: dict = {"chain": chain, "started_at": datetime.now(timezone.utc).isoformat()}
    for kind in kinds:
        target = out_root / chain / kind
        target.mkdir(parents=True, exist_ok=True)
        scraper = make_scraper(chain, target)
        started = time.monotonic()
        ok = failed = 0
        errors: list[str] = []

        async def run():
            nonlocal ok, failed
            async for r in scraper.scrape(files_types=[FILE_TYPES[kind]]):
                if r.extract_succefully:
                    ok += 1
                else:
                    failed += 1
                    if r.error and len(errors) < 5:
                        errors.append(f"{r.file_name}: {r.error}")

        try:
            await asyncio.wait_for(run(), timeout=CHAIN_TIMEOUT_S)
        except asyncio.TimeoutError:
            errors.append(f"timeout after {CHAIN_TIMEOUT_S}s")
        except Exception as e:  # noqa: BLE001 - one chain must never kill the run
            errors.append(f"{type(e).__name__}: {e}")
        status[kind] = {
            "downloaded": ok,
            "failed": failed,
            "files_on_disk": sum(1 for p in target.iterdir() if p.is_file()),
            "seconds": round(time.monotonic() - started, 1),
            "errors": errors,
        }
        print(f"  {chain}/{kind}: {status[kind]}", flush=True)
    return status


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="raw")
    ap.add_argument("--chains", required=True, help="comma-separated ScraperFactory names")
    ap.add_argument("--kinds", default="stores,price_full", help=f"subset of {list(FILE_TYPES)}")
    args = ap.parse_args()

    out_root = Path(args.out)
    kinds = [k.strip() for k in args.kinds.split(",")]
    results = []
    for chain in (c.strip() for c in args.chains.split(",")):
        print(f"=== {chain}", flush=True)
        results.append(asyncio.run(fetch_chain(chain, kinds, out_root)))
    (out_root / "fetch_status.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), "utf-8"
    )


if __name__ == "__main__":
    main()
