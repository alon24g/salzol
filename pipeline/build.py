"""Raw chain files → compact static data for the frontend (dist/data).

Usage:
    python -m pipeline.build --raw raw --out dist/data
"""

from __future__ import annotations

import argparse
import gzip
import json
import shutil
import statistics
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .fetch import file_key_and_stamp
from .geo import Settlements
from .normalize import canonical_barcode, is_valid_price, unit_price
from .parse import parse_price_file, parse_stores_file

# Eilat is VAT-exempt, so its stores would always be "cheapest"; excluded by product decision.
EXCLUDED_SETTLEMENTS = {2600}  # CBS settlement codes

# ScraperFactory name → public chain slug + Hebrew display name.
CHAINS = {
    "SHUFERSAL": ("shufersal", "שופרסל"),
    "RAMI_LEVY": ("rami_levy", "רמי לוי"),
    "VICTORY_NEW_SOURCE": ("victory", "ויקטורי"),
}

STALE_AFTER = timedelta(hours=48)  # spec §9
PRICE_SHARDS = 256  # barcode → shard by int(barcode) % PRICE_SHARDS
OUTLIER_FACTOR = 5.0  # a chain's price this far from the cross-chain median is invalid


@dataclass
class ItemAgg:
    names: dict[str, set] = field(default_factory=lambda: defaultdict(set))  # name → chains using it
    manufacturers: Counter = field(default_factory=Counter)
    unit: Counter = field(default_factory=Counter)  # (size, base_unit, display) votes
    weighted: Counter = field(default_factory=Counter)
    # chain → price → [store index]
    prices: dict[str, dict[float, list[int]]] = field(default_factory=lambda: defaultdict(lambda: defaultdict(list)))


def store_key(sid: str) -> str:
    """'001' and '1' are the same store (price headers pad, Stores files often don't)."""
    s = sid.strip()
    return str(int(s)) if s.isdigit() else s


def stamp_to_dt(stamp: str) -> datetime | None:
    try:
        # Portal timestamps are Israel local time; treat as naive for relative comparisons.
        return datetime.strptime(stamp[:12], "%Y%m%d%H%M")
    except ValueError:
        return None


def latest_files(folder: Path) -> tuple[list[Path], list[str]]:
    """Newest file per store key, dropping stores whose newest file is > STALE_AFTER
    older than the chain's newest file. Returns (files, stale descriptions)."""
    newest: dict[str, tuple[str, Path]] = {}
    for p in folder.iterdir():
        if not p.is_file():
            continue
        key, stamp = file_key_and_stamp(p.name)
        if key not in newest or stamp > newest[key][0]:
            newest[key] = (stamp, p)
    stamps = [stamp_to_dt(s) for s, _ in newest.values()]
    chain_newest = max((d for d in stamps if d), default=None)
    keep, stale = [], []
    for (stamp, p), dt in zip(newest.values(), stamps):
        if chain_newest and dt and chain_newest - dt > STALE_AFTER:
            stale.append(f"{p.name} ({dt:%Y-%m-%d})")
        else:
            keep.append(p)
    return keep, stale


def build(raw: Path, out: Path) -> dict:
    t0 = time.monotonic()
    items: dict[str, ItemAgg] = defaultdict(ItemAgg)
    local_items: dict[str, dict] = {}  # "chain:code" → info, not comparable across chains
    stores_out: dict[str, list[dict]] = {}
    meta_chains: dict[str, dict] = {}
    invalid = Counter()

    settlements = Settlements.load()
    for scraper_name, (slug, display_name) in CHAINS.items():
        cdir = raw / scraper_name
        info: dict = {"slug": slug, "ok": False}
        meta_chains[slug] = info
        if not (cdir / "price_full").is_dir():
            info["error"] = "no raw price files"
            continue

        # --- stores
        store_files, _ = latest_files(cdir / "stores")
        store_rows = parse_stores_file(max(store_files, key=lambda p: file_key_and_stamp(p.name)[1])) if store_files else []
        info["name"] = display_name
        info["file_chain_name"] = store_rows[0].chain_name if store_rows else ""
        idx_of: dict[str, int | None] = {}  # store key → index in stores_out, None = excluded
        stores_out[slug] = []
        excluded = unlocated = 0
        for s in store_rows:
            k = store_key(s.store_id)
            if k in idx_of:
                continue
            place = settlements.resolve(s.city, s.address, s.name)
            if place and place["code"] in EXCLUDED_SETTLEMENTS:
                idx_of[k] = None
                excluded += 1
                continue
            unlocated += place is None
            idx_of[k] = len(stores_out[slug])
            stores_out[slug].append(
                {
                    "id": k,
                    "name": s.name,
                    "city": place["name"] if place else "",
                    "address": s.address,
                    "lat": place["lat"] if place else None,
                    "lon": place["lon"] if place else None,
                }
            )
        info.update(stores=len(stores_out[slug]), excluded_stores=excluded, unlocated_stores=unlocated)

        # --- prices
        files, stale = latest_files(cdir / "price_full")
        info.update(stale_files=stale, price_files=len(files), rows=0, barcoded_rows=0)
        newest_stamp = ""
        for p in files:
            try:
                pf = parse_price_file(p)
            except Exception as e:  # noqa: BLE001 - one bad file must not kill the chain
                info.setdefault("file_errors", []).append(f"{p.name}: {e}")
                continue
            newest_stamp = max(newest_stamp, file_key_and_stamp(p.name)[1])
            k = store_key(pf.store_id)
            if k not in idx_of:  # price file for a store missing from the Stores file
                idx_of[k] = len(stores_out[slug])
                stores_out[slug].append({"id": k, "name": "", "city": "", "address": "", "lat": None, "lon": None})
            sidx = idx_of[k]
            if sidx is None:  # excluded location (Eilat)
                continue
            for r in pf.rows:
                info["rows"] += 1
                if not is_valid_price(r.price):
                    invalid["bad_price"] += 1
                    continue
                up = unit_price(r.price, r.quantity, r.unit_of_measure, r.unit_qty, r.is_weighted)
                bc = canonical_barcode(r.item_code)
                if bc is None:
                    lk = f"{slug}:{r.item_code}"
                    li = local_items.setdefault(lk, {"name": r.name, "prices": defaultdict(list)})
                    li["prices"][r.price].append(sidx)
                    continue
                info["barcoded_rows"] += 1
                agg = items[bc]
                if r.name:
                    agg.names[r.name].add(slug)
                if r.manufacturer and r.manufacturer not in ("לא ידוע", "כללי"):
                    agg.manufacturers[r.manufacturer] += 1
                agg.weighted[r.is_weighted] += 1
                if up:
                    agg.unit[(round(up[2], 3), up[3], up[1])] += 1
                agg.prices[slug][r.price].append(sidx)
        dt = stamp_to_dt(newest_stamp)
        info["updated"] = dt.strftime("%Y-%m-%dT%H:%M") if dt else ""  # Israel local time
        info["ok"] = info["rows"] > 0

    # --- cross-chain outliers: compare each chain's median to the median of chains
    for bc, agg in items.items():
        if len(agg.prices) < 2:
            continue
        med = {c: statistics.median(p for p, st in pr.items() for _ in st) for c, pr in agg.prices.items()}
        overall = statistics.median(med.values())
        for c, m in list(med.items()):
            if m > overall * OUTLIER_FACTOR or m < overall / OUTLIER_FACTOR:
                invalid["cross_chain_outlier"] += 1
                del agg.prices[c]

    # --- write
    if out.exists():
        shutil.rmtree(out)
    (out / "prices").mkdir(parents=True)

    search = []
    shards: dict[int, dict] = defaultdict(dict)
    for bc, agg in items.items():
        if not agg.prices:
            continue
        # Canonical name: used by the most chains (not stores: Rami Levy truncates names to
        # 20 chars and would win a per-store vote); ties → longest, i.e. least truncated.
        name = max(agg.names.items(), key=lambda kv: (len(kv[1]), len(kv[0])))[0] if agg.names else bc
        aliases = [n for n in agg.names if n != name]
        size = agg.unit.most_common(1)[0][0] if agg.unit else None
        brand = agg.manufacturers.most_common(1)[0][0] if agg.manufacturers else ""
        entry = [bc, name, brand, len(agg.prices)]
        if aliases:
            entry.append(aliases)
        search.append(entry)
        per_chain = {}
        for c, pr in agg.prices.items():
            flat = sorted(p for p, st in pr.items() for _ in st)
            per_chain[c] = {
                "min": flat[0],
                "max": flat[-1],
                "med": statistics.median(flat),
                # dedup: price → store indexes (index into stores.json[chain])
                "p": [[p, sorted(st)] for p, st in sorted(pr.items())],
            }
        shards[int(bc) % PRICE_SHARDS][bc] = {
            "w": agg.weighted.most_common(1)[0][0],
            "size": list(size) if size else None,
            "c": per_chain,
        }

    def dump(path: Path, obj) -> int:
        data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        path.write_bytes(data)
        return len(data)

    sizes = {"search.json": dump(out / "search.json", search)}
    sizes["stores.json"] = dump(out / "stores.json", stores_out)
    # Cities that have at least one store, for the manual "my location" picker.
    cities = {
        s["city"]: (s["lat"], s["lon"])
        for ss in stores_out.values()
        for s in ss
        if s["city"] and s["lat"] is not None
    }
    dump(out / "cities.json", sorted([n, la, lo] for n, (la, lo) in cities.items()))
    shard_sizes = [dump(out / "prices" / f"{i:03d}.json", shards[i]) for i in range(PRICE_SHARDS)]

    meta = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "chains": meta_chains,
        "counts": {
            "barcoded_items": len(search),
            "in_2plus_chains": sum(1 for e in search if e[3] >= 2),
            "in_3_chains": sum(1 for e in search if e[3] >= 3),
            "chain_local_items": len(local_items),
            "invalid": dict(invalid),
        },
        "build_seconds": round(time.monotonic() - t0, 1),
    }
    sizes["meta.json"] = dump(out / "meta.json", meta)

    def gz(path: Path) -> int:
        return len(gzip.compress(path.read_bytes(), 9))

    meta["sizes"] = {
        "search_json": sizes["search.json"],
        "search_json_gz": gz(out / "search.json"),
        "stores_json": sizes["stores.json"],
        "stores_json_gz": gz(out / "stores.json"),
        "price_shards_total": sum(shard_sizes),
        "price_shards_total_gz": sum(gz(out / "prices" / f"{i:03d}.json") for i in range(PRICE_SHARDS)),
        "price_shard_max": max(shard_sizes),
        "price_shard_median": int(statistics.median(shard_sizes)),
    }
    dump(out / "meta.json", meta)
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="raw")
    ap.add_argument("--out", default="dist/data")
    args = ap.parse_args()
    meta = build(Path(args.raw), Path(args.out))
    print(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
