"""Parse PriceFull / Price files."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .xmlio import leaf_dict, load_root, pick

# Field aliases seen in real files (lower-cased). See docs/m0-reachability.md.
NAME = ("itemname", "itemnm")
MANUFACTURER = ("manufacturename", "manufacturername")
WEIGHTED = ("bisweighted", "blsweighted")  # "blsWeighted" (lower-case L) is Wolt's typo
UPDATED = ("priceupdatetime", "priceupdatedate")

_NAME_IDS = re.compile(r"^price(?:full)?(?P<chain>\d{13})-(?:(?P<sub>\d{3})-)?(?P<store>\d{3})-\d{8}", re.I)


@dataclass(slots=True)
class PriceRow:
    item_code: str
    item_type: str
    name: str
    manufacturer: str
    quantity: str  # raw text; normalize.py interprets it together with the unit fields
    unit_qty: str
    unit_of_measure: str
    is_weighted: bool
    qty_in_package: str
    price: float | None
    unit_of_measure_price: float | None
    allow_discount: bool
    updated: str


@dataclass(slots=True)
class PriceFile:
    chain_id: str
    sub_chain_id: str
    store_id: str
    source: str
    rows: list[PriceRow] = field(default_factory=list)


def _float(s: str) -> float | None:
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def parse_price_file(path: Path) -> PriceFile:
    root = load_root(path)
    # Header fields are leaves of the root in every chain seen so far; fall back to a
    # document-wide search in case a chain nests them.
    header = leaf_dict(root)
    if "storeid" not in header:
        for el in root.iter():
            if isinstance(el.tag, str) and el.tag.lower() == "storeid":
                header["storeid"] = (el.text or "").strip()
                break
    pf = PriceFile(
        chain_id=header.get("chainid", ""),
        sub_chain_id=header.get("subchainid", ""),
        store_id=header.get("storeid", ""),
        source=path.name,
    )
    # City Market Shops publishes files with an empty header; the file name still
    # carries the ids: PriceFull<chain>-[<sub>-]<store>-<timestamp>.
    m = _NAME_IDS.match(path.name)
    if m:
        pf.chain_id = pf.chain_id or m["chain"]
        pf.sub_chain_id = pf.sub_chain_id or (m["sub"] or "")
        pf.store_id = pf.store_id or m["store"]
    for el in root.iter():
        if not (isinstance(el.tag, str) and el.tag.lower() == "item"):
            continue
        d = leaf_dict(el)
        code = d.get("itemcode", "")
        if not code:
            continue
        pf.rows.append(
            PriceRow(
                item_code=code,
                item_type=d.get("itemtype", ""),
                name=pick(d, *NAME),
                manufacturer=pick(d, *MANUFACTURER),
                quantity=d.get("quantity", ""),
                unit_qty=d.get("unitqty", ""),
                unit_of_measure=d.get("unitofmeasure", ""),
                is_weighted=pick(d, *WEIGHTED) == "1",
                qty_in_package=d.get("qtyinpackage", ""),
                price=_float(d.get("itemprice", "")),
                unit_of_measure_price=_float(d.get("unitofmeasureprice", "")),
                allow_discount=d.get("allowdiscount", "") == "1",
                updated=pick(d, *UPDATED),
            )
        )
    return pf
