"""Raw chain files → compact static data for the frontend (dist/data).

Usage:
    python -m pipeline.build --raw raw --out dist/data
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import shutil
import statistics
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .fetch import file_key_and_stamp
from .geo import Settlements
from .manual_deals import load_manual_deals
from .promos import Promo, parse_promo_file, to_json
from .normalize import canonical_barcode, is_valid_price, unit_price
from .parse import parse_price_file, parse_stores_file

# Eilat is VAT-exempt, so its stores would always be "cheapest"; excluded by product decision.
EXCLUDED_SETTLEMENTS = {2600}  # CBS settlement codes

# StoreType in Stores files: 1 = physical, 2 = online only, 3 = both (seen in all 3 chains:
# "שופרסל ONLINE", "מרלוג אינטרנט", Victory "אינטרנט"). Online-only stores are excluded.
ONLINE_STORE_TYPE = "2"

# ManufacturerName values meaning "unknown": these two words and punctuation-only fillers ("---", ".").
UNKNOWN_MANUFACTURERS = {"לא ידוע", "כללי"}


def known_manufacturer(name: str) -> bool:
    return bool(name) and name not in UNKNOWN_MANUFACTURERS and any(c.isalnum() for c in name)


# ScraperFactory name → public chain slug + Hebrew display name. Every chain the scraper
# supports except WOLT (online-only dark stores) and MESHMAT_YOSEF_1 (Mishnat Yosef's web
# shop; its physical stores are MESHMAT_YOSEF_2). Slugs are public: they are stored in users'
# club settings, so never rename one.
CHAINS = {
    "SHUFERSAL": ("shufersal", "שופרסל"),
    "RAMI_LEVY": ("rami_levy", "רמי לוי"),
    "VICTORY_NEW_SOURCE": ("victory", "ויקטורי"),
    "YAYNO_BITAN_AND_CARREFOUR": ("carrefour", "קרפור"),
    "YOHANANOF": ("yohananof", "יוחננוף"),
    "OSHER_AD": ("osher_ad", "אושר עד"),
    "TIV_TAAM": ("tiv_taam", "טיב טעם"),
    "HAZI_HINAM": ("hazi_hinam", "חצי חינם"),
    "MAHSANI_ASHUK_NEW_SOURCE": ("mahsanei_hashuk", "מחסני השוק"),
    "HET_COHEN_NEW_SOURCE": ("het_cohen", "ח. כהן"),
    "STOP_MARKET": ("stop_market", "סטופ מרקט"),
    "POLIZER": ("polizer", "פוליצר"),
    "SALACH_DABACH": ("salach_dabach", "סאלח דבאח"),
    "FRESH_MARKET_AND_SUPER_DOSH": ("fresh_market", "פרש מרקט"),
    "SUPER_YUDA": ("super_yuda", "סופר יודה"),
    "KESHET": ("keshet", "קשת טעמים"),
    "KING_STORE": ("king_store", "קינג סטור"),
    "BAREKET": ("bareket", "סופר ברקת"),
    "MAAYAN_2000": ("maayan_2000", "מעיין 2000"),
    "MESHMAT_YOSEF_2": ("mishnat_yosef", "משנת יוסף"),
    "SHEFA_BARCART_ASHEM": ("shefa_birkat_hashem", "שפע ברכת השם"),
    "SHUK_AHIR": ("shuk_hair", "שוק העיר"),
    "SUPER_SAPIR": ("super_sapir", "סופר ספיר"),
    "ZOL_VEBEGADOL": ("zol_vebegadol", "זול ובגדול"),
    "CITY_MARKET_SHOPS": ("city_market", "סיטי מרקט"),
    "CITY_MARKET_KIRYATGAT": ("city_market_kiryat_gat", "סיטי מרקט קריית גת"),
    "NETIV_HASED": ("netiv_hased", "נתיב החסד"),
    "DOR_ALON": ("dor_alon", "דור אלון (AM:PM)"),
    "YELLOW": ("yellow", "יילו"),
    "SUPER_PHARM": ("super_pharm", "סופר-פארם"),
    "GOOD_PHARM": ("good_pharm", "גוד פארם"),
}

STALE_AFTER = timedelta(hours=48)  # spec §9
PROMO_LOOKAHEAD = timedelta(days=14)  # furthest shopping date the UI offers
PROMO_CHUNK = 500  # promos per file in promos/<chain>/
# barcode → prices/<int(barcode) % PRICE_SHARDS>.json. Written to meta.json (the web app reads it
# there). 1024 keeps a shard ~110 KB (~20 KB gzipped) with all chains.
PRICE_SHARDS = 1024
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


_NAME_STORE = re.compile(r"^(?:price|promo)(?:full)?\d+-(?:\d+-)?(\d+)-\d{8}", re.I)


_WORD = re.compile(r"\w+")


def alias_words(name: str, aliases: list[str]) -> list[str]:
    """Other chains' names for an item, reduced to the words the canonical name lacks.

    The web app only uses aliases to match search terms (never shows them), and with 30
    chains most aliases repeat the canonical name: keeping only new words halves search.json.
    Returns [] or a single space-joined string, in first-seen order."""
    seen = set(_WORD.findall(name.lower()))
    new: list[str] = []
    for a in aliases:
        for w in _WORD.findall(a.lower()):
            if w not in seen:
                seen.add(w)
                new.append(w)
    return [" ".join(new)] if new else []


def file_store_key(file_name: str, in_file_id: str, known: dict) -> str:
    """Store key for a price/promo file. Normally the StoreId inside the file; some chains
    (Carrefour: file -400-, StoreId 103) disagree with their own Stores file, in which case
    the store number in the file name is the one the Stores file knows."""
    k = store_key(in_file_id)
    if k in known:
        return k
    m = _NAME_STORE.match(file_name)
    return store_key(m[1]) if m and store_key(m[1]) in known else k


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


def israel_today() -> date:
    # Israel is UTC+2/+3; promo windows are in Israel local time. +3 is close enough to pick
    # the calendar day for a build that runs in the morning/afternoon.
    return (datetime.now(timezone.utc) + timedelta(hours=3)).date()


def collect_promos(folder: Path, slug: str, idx_of: dict[str, int | None], info: dict) -> list[tuple[Promo, set[int]]]:
    """Newest PromoFull per store → promos merged across stores: [(promo, store indexes)].

    Keeps promos active today or starting within PROMO_LOOKAHEAD (the user can pick a future
    shopping date). The same promo in different stores is stored once: definitions are merged
    ignoring the item list, and items/stores are unioned. Each store lists only the items it
    stocks (Shufersal: one promotion → 631 single-store variants), and a store that doesn't
    stock an item has no price for it, so the union never applies a promo where it shouldn't.
    Coupons (gift / personal / card coupons) are never applied and are only counted."""
    if not folder.is_dir():
        info["promo_error"] = "no promo files"
        return []
    files, stale = latest_files(folder)
    today = israel_today()
    first_day, last_day = today.isoformat(), (today + PROMO_LOOKAHEAD).isoformat()
    merged: dict[tuple, tuple[Promo, set[int]]] = {}
    seen = expired = coupons = 0
    for p in files:
        try:
            store_id, promos = parse_promo_file(p, slug)
        except Exception as e:  # noqa: BLE001
            info.setdefault("promo_file_errors", []).append(f"{p.name}: {e}")
            continue
        sidx = idx_of.get(file_store_key(p.name, store_id, idx_of))
        if sidx is None:  # unknown or excluded (Eilat) store
            continue
        for pr in promos:
            seen += 1
            if (pr.end and pr.end[:10] < first_day) or (pr.start and pr.start[:10] > last_day):
                expired += 1
                continue
            if pr.is_coupon:
                coupons += 1
                continue
            key = (
                pr.id.split(":")[1], pr.kind, pr.value, pr.min_qty, pr.get_qty, pr.max_qty, pr.limit,
                tuple(pr.weekdays or ()), pr.club_only, pr.club_name, pr.min_purchase,
                pr.conditional, pr.start, pr.end, pr.description,
            )
            if key in merged:
                first, stores = merged[key]
                stores.add(sidx)
                if pr.items != first.items:
                    first.items = sorted(set(first.items) | set(pr.items))
            else:
                merged[key] = (pr, {sidx})
    info.update(promo_files=len(files), promo_stale_files=len(stale), promos_seen=seen,
                promos_out_of_window=expired, promo_coupons_skipped=coupons, promos=len(merged))
    return list(merged.values())


def resolve_weighted_price(price: float, min_qty_kg: float, regular_per_kg: float) -> float | None:
    """A weighted promo's DiscountedPrice is either per kg or per MinQty kg (promos.py).
    Pick the larger reading that still beats the regular per-kg price, else None."""
    candidates = sorted({price, round(price / min_qty_kg, 2)}, reverse=True)
    return next((c for c in candidates if c < regular_per_kg), None)


def promo_unit_price(pr: Promo) -> float | None:
    """Price per unit when the promo applies, for sanity checks (None if not comparable)."""
    if pr.kind == "fixed_price":
        return pr.value
    if pr.kind == "n_for_price" and pr.min_qty:
        return pr.value / pr.min_qty
    return None


def build(raw: Path, out: Path) -> dict:
    t0 = time.monotonic()
    items: dict[str, ItemAgg] = defaultdict(ItemAgg)
    local_items: dict[str, dict] = {}  # "chain:code" → info, not comparable across chains
    stores_out: dict[str, list[dict]] = {}
    meta_chains: dict[str, dict] = {}
    invalid = Counter()

    settlements = Settlements.load()
    chain_promos: dict[str, list[tuple[Promo, set[int]]]] = {}
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
        excluded = unlocated = online = 0
        for s in store_rows:
            k = store_key(s.store_id)
            if k in idx_of:
                continue
            if s.store_type.strip() == ONLINE_STORE_TYPE:
                idx_of[k] = None  # online-only: not a store you can walk into
                online += 1
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
        info.update(stores=len(stores_out[slug]), excluded_stores=excluded, online_stores_excluded=online,
                    unlocated_stores=unlocated)

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
            k = file_store_key(p.name, pf.store_id, idx_of)
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
                if known_manufacturer(r.manufacturer):
                    agg.manufacturers[r.manufacturer] += 1
                agg.weighted[r.is_weighted] += 1
                if up:
                    agg.unit[(round(up[2], 3), up[3], up[1])] += 1
                agg.prices[slug][r.price].append(sidx)
        dt = stamp_to_dt(newest_stamp)
        info["updated"] = dt.strftime("%Y-%m-%dT%H:%M") if dt else ""  # Israel local time
        info["ok"] = info["rows"] > 0

        # --- promotions
        chain_promos[slug] = collect_promos(cdir / "promo_full", slug, idx_of, info)

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

    # --- manual deals (data/manual_deals.yaml) apply to every store of their chain
    chain_item_names: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for bc, agg in items.items():
        for n, chains in agg.names.items():
            for c in chains:
                chain_item_names[c][bc].add(n)
    for pr in load_manual_deals(chain_item_names):
        if pr.chain in chain_promos:
            chain_promos[pr.chain].append((pr, set(range(len(stores_out[pr.chain])))))

    # --- promos: per-chain definitions + item → promo index; sanity-check against prices
    promo_index: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    promos_out: dict[str, list[dict]] = {}
    promo_checks = Counter()
    for slug, plist in chain_promos.items():
        n_stores = len(stores_out[slug])
        promos_out[slug] = []
        for pr, sidxs in plist:
            pr.items = [bc for bc in pr.items if slug in items.get(bc, ItemAgg()).prices]
            if not pr.items:
                promo_checks["no_priced_items"] += 1
                continue
            if pr.kind == "fixed_price_kg_ambiguous":
                # Weighted promo: DiscountedPrice is either per kg or per MinQty kg (see
                # promos.py). Pick the larger reading that is still below the regular per-kg
                # price; if neither is, the promo can't be trusted.
                regular = max(
                    statistics.median(p for p, st in items[bc].prices[slug].items() for _ in st) for bc in pr.items
                )
                chosen = resolve_weighted_price(pr.value, pr.min_qty, regular)
                promo_checks["weighted_resolved" if chosen else "weighted_unresolved"] += 1
                pr.kind, pr.value, pr.min_qty = ("fixed_price", chosen, 0) if chosen else ("unknown", None, 1)
            unit = promo_unit_price(pr)
            if pr.applicable and unit is not None and pr.min_qty >= 1:
                # A real promo should beat the chain's typical regular price for its items.
                meds = [statistics.median(p for p, st in items[bc].prices[slug].items() for _ in st) for bc in pr.items]
                promo_checks["cheaper" if unit < max(meds) else "not_cheaper"] += 1
            d = to_json(pr)
            d.pop("chain", None)
            d.pop("store_ids", None)
            if len(sidxs) < n_stores:
                d["s"] = sorted(sidxs)  # omitted = every store of the chain
            idx = len(promos_out[slug])
            for bc in d.pop("items"):
                promo_index[bc][slug].append(idx)
            promos_out[slug].append(d)

    # --- write
    if out.exists():
        shutil.rmtree(out)
    (out / "prices").mkdir(parents=True)
    (out / "promos").mkdir()

    search = []
    shards: dict[int, dict] = defaultdict(dict)
    for bc, agg in items.items():
        if not agg.prices:
            continue
        # Canonical name: used by the most chains (not stores: Rami Levy truncates names to
        # 20 chars and would win a per-store vote); ties → longest, i.e. least truncated.
        name = max(agg.names.items(), key=lambda kv: (len(kv[1]), len(kv[0])))[0] if agg.names else bc
        aliases = alias_words(name, [n for n in agg.names if n != name])
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
            "n": name,  # so a product page deep link doesn't need search.json
            "b": brand,
            "w": agg.weighted.most_common(1)[0][0],
            "size": list(size) if size else None,
            "c": per_chain,
        }
        if bc in promo_index:
            # chain → indexes into promos/<chain>.json
            shards[int(bc) % PRICE_SHARDS][bc]["pr"] = {c: v for c, v in promo_index[bc].items() if c in per_chain}

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
    # Promos are chunked so a product page loads only the chunks its items reference:
    # promo index i lives in promos/<chain>/<i // PROMO_CHUNK>.json.
    promo_sizes = {}
    for slug, plist in promos_out.items():
        (out / "promos" / slug).mkdir()
        promo_sizes[slug] = sum(
            dump(out / "promos" / slug / f"{k}.json", plist[k * PROMO_CHUNK:(k + 1) * PROMO_CHUNK])
            for k in range((len(plist) + PROMO_CHUNK - 1) // PROMO_CHUNK)
        )

    meta = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "chains": meta_chains,
        "counts": {
            "barcoded_items": len(search),
            "in_2plus_chains": sum(1 for e in search if e[3] >= 2),
            "in_3_chains": sum(1 for e in search if e[3] >= 3),
            "chain_local_items": len(local_items),
            "invalid": dict(invalid),
            "promos": {slug: len(p) for slug, p in promos_out.items()},
            "promo_kinds": dict(Counter(d["kind"] for p in promos_out.values() for d in p)),
            "promo_checks": dict(promo_checks),
        },
        "price_shards": PRICE_SHARDS,
        "promo_date_window": [israel_today().isoformat(), (israel_today() + PROMO_LOOKAHEAD).isoformat()],
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
        "promos": promo_sizes,
        "promos_gz": {slug: sum(gz(f) for f in (out / "promos" / slug).iterdir()) for slug in promo_sizes},
        "promo_chunk_max": max((f.stat().st_size for f in (out / "promos").rglob("*.json")), default=0),
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
