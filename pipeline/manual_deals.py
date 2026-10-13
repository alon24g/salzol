"""Hand-curated deals that the official promo files don't carry (spec §6, data/manual_deals.yaml).

Each entry becomes a Promo with source="manual". Items are explicit barcodes and/or every
product of that chain whose name contains one of `category_keywords`.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from .normalize import canonical_barcode
from .promos import KINDS, Promo

MANUAL_DEALS_PATH = Path(__file__).resolve().parent.parent / "data" / "manual_deals.yaml"

REQUIRED = ("chain", "title", "kind", "value", "applies_to", "verified_on")


class ManualDealError(ValueError):
    pass


def load_manual_deals(
    chain_item_names: dict[str, dict[str, set[str]]],
    path: Path = MANUAL_DEALS_PATH,
) -> list[Promo]:
    """chain_item_names: chain slug → barcode → names that chain uses for the item."""
    if not path.exists():
        return []
    entries = yaml.safe_load(path.read_text("utf-8")) or []
    if not isinstance(entries, list):
        raise ManualDealError(f"{path.name}: top level must be a list")
    out = []
    for i, e in enumerate(entries):
        where = f"{path.name} entry {i + 1}"
        missing = [k for k in REQUIRED if k not in e]
        if missing:
            raise ManualDealError(f"{where}: missing {missing}")
        if e["kind"] not in KINDS or e["kind"] == "unknown":
            raise ManualDealError(f"{where}: kind must be one of {KINDS[:-1]}")
        weekdays = e.get("weekdays")
        if weekdays is not None and not all(isinstance(d, int) and 0 <= d <= 6 for d in weekdays):
            raise ManualDealError(f"{where}: weekdays are 0 (Sunday) … 6 (Saturday)")

        chain = e["chain"]
        names = chain_item_names.get(chain, {})
        applies = e["applies_to"] or {}
        items = {bc for b in applies.get("barcodes", []) if (bc := canonical_barcode(str(b)))}
        keywords = [k for k in applies.get("category_keywords", []) if k]
        if keywords:
            items |= {bc for bc, ns in names.items() if any(k in n for n in ns for k in keywords)}
        if not items:
            raise ManualDealError(f"{where}: applies_to matched no products of chain {chain!r}")

        out.append(
            Promo(
                id=f"{chain}:manual:{i + 1}",
                chain=chain,
                description=e["title"],
                start=str(e.get("start", "2000-01-01")) + "T00:00",
                end=str(e.get("end", "2100-01-01")) + "T23:59",
                kind=e["kind"],
                value=float(e["value"]),
                min_qty=float(e.get("min_qty", 1)),
                get_qty=float(e["get_qty"]) if e.get("get_qty") else None,
                weekdays=weekdays,
                club_only=bool(e.get("club_only", False)),
                club_name=e.get("club_name"),
                items=sorted(items),
                source="manual",
                verified_on=str(e["verified_on"]),
                source_url=e.get("source_url"),
            )
        )
    return out
