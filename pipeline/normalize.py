"""Item identity (barcodes) and unit-price normalization."""

from __future__ import annotations

import re

# --- Barcodes ----------------------------------------------------------------


def gtin_check_ok(digits: str) -> bool:
    """GS1 mod-10 check digit. Invariant to left zero-padding, so UPC-A (12),
    EAN-8 and EAN-13 all validate the same way."""
    body, check = digits[:-1], int(digits[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def canonical_barcode(item_code: str) -> str | None:
    """GTIN-13 string if item_code looks like a manufacturer barcode, else None.

    ItemType alone is unreliable (King Store marks internal codes as type 1, Victory
    marks some barcoded items type 0), so we require 8-14 significant digits and a
    valid check digit. Chain-internal codes that happen to pass (~1 in 10 of 8+ digit
    codes) still slip through; they only matter if another chain uses the same code.
    """
    code = item_code.strip()
    if not code.isdigit():
        return None
    stripped = code.lstrip("0")
    if not 8 <= len(stripped) <= 14 or not gtin_check_ok(stripped):
        return None
    return stripped.zfill(13)


# --- Units -------------------------------------------------------------------

# Unit text → (dimension, multiplier to base unit). Base units: g, ml, unit, m.
# Values seen in real files (Rami Levy, Shufersal, Victory). Quantity is expressed in
# the unit named by UnitOfMeasure, ignoring any "100" prefix (that prefix describes
# how the chain *displays* its unit price, not the quantity's unit).
_UNIT_WORDS: list[tuple[re.Pattern, tuple[str, float]]] = [
    (re.compile(r"קילו|ק\"ג|קג\b|kg", re.I), ("g", 1000.0)),
    (re.compile(r"מיליליטר|מ\"ל|מל\b|ml", re.I), ("ml", 1.0)),
    (re.compile(r"ליטר|ל'|^ל$|\bl\b|liter", re.I), ("ml", 1000.0)),
    (re.compile(r"גרם|גר'|גר\b|^ג$|\bg\b|gram", re.I), ("g", 1.0)),
    (re.compile(r"ס\"מ|סמ\b|cm", re.I), ("m", 0.01)),
    (re.compile(r"מטר|^מ'$|\bm\b", re.I), ("m", 1.0)),
    (re.compile(r"יחיד|יח'|^יח$|unit|מארז|זוג", re.I), ("unit", 1.0)),
]

# How each dimension is presented to users (Israeli shelf-label convention).
DISPLAY_PER = {"g": (100.0, "100 גרם"), "ml": (100.0, "100 מ\"ל"), "unit": (1.0, "יחידה"), "m": (1.0, "מטר")}


def parse_unit(text: str) -> tuple[str, float] | None:
    t = text.strip()
    if not t or t in ("לא ידוע", "0"):
        return None
    for pat, val in _UNIT_WORDS:
        if pat.search(t):
            return val
    return None


def _num(s: str) -> float | None:
    try:
        v = float(s.replace(",", ""))
    except ValueError:
        return None
    return v if v > 0 else None


def unit_price(
    price: float | None,
    quantity: str,
    unit_of_measure: str,
    unit_qty: str,
    is_weighted: bool,
) -> tuple[float, str, float, str] | None:
    """Return (unit_price, display_unit, size_in_base, base_unit) or None.

    Weighted items: ItemPrice is per kg, so the unit price is per kg of the item.
    """
    if not price or price <= 0:
        return None
    if is_weighted:
        return (round(price, 2), "ק\"ג", 1000.0, "g")
    unit = parse_unit(unit_of_measure) or parse_unit(unit_qty)
    qty = _num(quantity)
    if unit is None or qty is None:
        return None
    dim, mult = unit
    size = qty * mult
    per, label = DISPLAY_PER[dim]
    return (round(price / size * per, 2), label, size, dim)


def is_valid_price(price: float | None) -> bool:
    """Reject obviously broken prices; cross-chain outliers are checked in build.py."""
    return price is not None and 0 < price < 20_000
