"""PromoFull → typed promotions (spec §6).

Semantics were derived from real files by joining promos with the same store's regular prices
(pipeline/tests/sample_promos.py), not from field names, several of which are misleading:

Nested format (Victory / laibcatalog, Rami Levy / Cerberus):
  Promotion → Groups → Group(MinPurchaseAmount) → PromotionItems → PromotionItem
  item RewardType:
    1, 10  "N for ₪X": MinQty items for DiscountedPrice in total      ("3ב16.90", MinQty=3)
    3      fixed unit price DiscountedPrice                            ("10.90 משחת שיניים")
    0      "X+Y", cheapest free: X = MinQty, Y = IsGiftItem             ("2+1 הזול מבניהם")
    2      gift / personal coupon (DiscountedPrice 0 or a coupon %)     ("קופון … מתנה")
  IsGiftItem is a quantity, not a flag. MinNoOfItemOffered is always 10 (meaningless).
  ClubID: "0" = everyone. Victory: "2" = מקס ויקטורי, "1" = Wolt-channel / personal coupons.
  Rami Levy: free-text club expressions, e.g. "(1=מועדון שיווק השקמה|1=מועדון לקוחות אשראי)".
  Shufersal (same layout): "0 - כלל הלקוחות" = everyone, "3 - מועדון לקוחות & …" = credit card
  club. RewardType 0 is mostly basket coupons ("קופון 100ש"ח מתנה", MinPurchaseAmount), 12 =
  credit-card deals, 2 = "תו זהב 5%" / gift coupons. Weighted items carry the per-kg promo price
  in DiscountedPricePerMida.
  PromotionDays: comma-separated day numbers, 1 = Sunday (assumption, confirm with user).
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from .normalize import canonical_barcode
from .parse.xmlio import leaf_dict, load_root

KINDS = ("fixed_price", "percent_off", "amount_off", "n_for_price", "buy_x_get_y", "unknown")


@dataclass
class Promo:
    id: str
    chain: str
    description: str
    start: str  # ISO date-time, Israel local
    end: str
    kind: str
    value: float | None  # fixed_price/n_for_price: price; percent_off: %; amount_off: ₪
    min_qty: float = 1
    get_qty: float | None = None  # buy_x_get_y: Y free when buying X
    max_qty: float | None = None  # MaxQty: promo applies to at most this many units
    limit: float | None = None  # RedemptionLimit: times the deal can be used per purchase
    weekdays: list[int] | None = None  # 0 = Sunday … 6 = Saturday
    club_only: bool = False
    club_name: str | None = None
    min_purchase: float | None = None  # basket-level threshold (₪)
    is_coupon: bool = False  # gift / personal coupon: shown, never applied
    conditional: bool = False  # channel-specific (e.g. Wolt) or otherwise not user-selectable
    items: list[str] = field(default_factory=list)  # canonical barcodes
    store_ids: list[str] = field(default_factory=list)  # empty = all stores of the chain
    source: str = "feed"  # "feed" | "manual" (data/manual_deals.yaml)
    verified_on: str | None = None  # manual deals: when the terms were last checked
    source_url: str | None = None

    @property
    def applicable(self) -> bool:
        """Can the price engine apply this promo (given the right date/qty/club)?"""
        return self.kind != "unknown" and not self.is_coupon and not self.conditional


def _f(s: str | None) -> float | None:
    try:
        v = float((s or "").replace(",", ""))
    except ValueError:
        return None
    return v


def _iso(s: str) -> str:
    """'2026-10-31T23:59:00.000' / '2026-10-31 23:59' → '2026-10-31T23:59'"""
    s = s.strip().replace(" ", "T")
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%dT%H:%M")
        except ValueError:
            continue
    return ""


def _end_of_day(iso: str) -> str:
    """Normalize end times for day-level checks:
    - "2026-10-31T00:00" (Victory, Rami Levy) means the whole of Oct 31;
    - "2026-10-19T02:59" (Shufersal) is the night after Oct 18: the deal ends on the 18th."""
    if len(iso) < 16:
        return iso
    if iso.endswith("T00:00"):
        return iso[:10] + "T23:59"
    if iso[11:16] < "03:00":
        prev = datetime.strptime(iso[:10], "%Y-%m-%d") - timedelta(days=1)
        return prev.strftime("%Y-%m-%d") + "T23:59"
    return iso


def _weekdays(s: str) -> list[int] | None:
    days = sorted({int(d) - 1 for d in re.findall(r"\d", s or "") if 1 <= int(d) <= 7})
    return days or None


_X_PLUS_Y = re.compile(r"(?<![\d.])(\d)\s*\+\s*(\d)(?![\d.%])")  # "1+1", "2+1"; not "10+5%"
_GRAMS_FOR_PRICE = re.compile(r"(?<![\d.])(\d{2,4})\s*ב\s*(\d+(?:\.\d+)?)")  # "200ב30" = 200 g for ₪30

# Victory ClubID codes, identified from descriptions ("… - מקס ויקטורי", "וולט …").
VICTORY_CLUBS = {"2": "מקס ויקטורי"}
VICTORY_CONDITIONAL_CLUBS = {"1"}


def _club(chain: str, raw: str) -> tuple[bool, str | None, bool]:
    """(club_only, club_name, conditional) from a ClubID value."""
    raw = (raw or "").strip()
    # Shufersal: "0 - כלל הלקוחות" / "3 - מועדון לקוחות & …"; others: "0", "2", expressions.
    if raw in ("", "0") or re.match(r"^0\s*-", raw):
        return False, None, False
    if chain == "victory":
        if raw in VICTORY_CONDITIONAL_CLUBS:
            return True, None, True
        return True, VICTORY_CLUBS.get(raw, "מועדון"), False
    m = re.match(r"^\d+\s*-\s*([^&]+)", raw)  # Shufersal: first named club
    if m:
        return True, re.sub(r"\s+", " ", m[1]).strip(), False
    # Rami Levy: free-text expression; keep the first club name as the label.
    names = re.findall(r"=\s*([^|&()]+)", raw)
    name = re.sub(r"\s+", " ", names[0]).strip() if names else "מועדון"
    return True, name, False


def _item_kind(d: dict) -> tuple[str, float | None, float, float | None]:
    """(kind, value, min_qty, get_qty) for one PromotionItem merged with its Promotion."""
    rt = d.get("rewardtype", "")
    min_qty = _f(d.get("minqty")) or 1
    price = _f(d.get("discountedprice"))
    m = _X_PLUS_Y.search(d.get("promotiondescription", ""))
    if m and rt in ("1", "10") and int(m[1]) == int(min_qty) and (price or 0) >= 0:
        # Shufersal also encodes "1+1" as RewardType 1/10 with DiscountedPrice = regular price.
        return "buy_x_get_y", None, min_qty, float(m[2])
    if rt in ("1", "3", "10") and 0 < min_qty < 1 and price and price > 0:
        # Weighted items: MinQty is a weight in kg.
        #   Rami Levy  MinQty 0.010, price 69.90 → "any amount", ₪69.90/kg
        #   Shufersal  "200ב30" MinQty 0.20, price 30 → ₪150/kg
        #   Victory    MinQty 0.25, price 22 → ₪88/kg (its DiscountedPricePerMida says 22,
        #              so that field is not a reliable per-kg price)
        #   Shufersal  "קטיף 3.90 חצילים" MinQty 0.10, price 3.90 → ₪3.90/kg (!)
        # The last two look identical in the data, so: grams in the description win; otherwise
        # both readings are kept and build.py picks the one below the regular per-kg price.
        g = _GRAMS_FOR_PRICE.search(d.get("promotiondescription", ""))
        if g and abs(float(g[2]) - price) < 0.01:
            return "fixed_price", round(price / (int(g[1]) / 1000), 2), 0, None
        if min_qty <= 0.05:
            return "fixed_price", price, 0, None
        return "fixed_price_kg_ambiguous", price, min_qty, None
    if rt in ("1", "10"):
        if price and price > 0 and min_qty >= 1:
            if min_qty == 1:
                return "fixed_price", price, 1, None
            return "n_for_price", price, min_qty, None
    elif rt == "3":
        if price and price > 0 and min_qty >= 1:
            return "fixed_price", price, min_qty, None
    elif rt == "0":
        # "X+Y": X must equal MinQty; Y comes from IsGiftItem when the chain fills it
        # (Victory, Rami Levy) and must then agree with the description (Shufersal leaves it empty).
        m = _X_PLUS_Y.search(d.get("promotiondescription", ""))
        get = _f(d.get("isgiftitem"))
        if m and int(m[1]) == int(min_qty) and (get is None or int(m[2]) == int(get)):
            return "buy_x_get_y", None, min_qty, float(m[2])
    return "unknown", None, min_qty, None


def parse_promo_file(path: Path, chain: str) -> tuple[str, list[Promo]]:
    """Returns (store_id, promos). Items without a valid barcode are dropped (they can't
    be matched to the cross-chain catalog)."""
    root = load_root(path)
    header = leaf_dict(root)
    store_id = header.get("storeid", "")
    out: list[Promo] = []
    for pel in root.iter("Promotion", "promotion"):
        pd = leaf_dict(pel)
        # Flat layout (City Market): coupon flag and club are nested one level down.
        for sub in pel.iterchildren("AdditionalRestrictions", "Clubs"):
            pd = {**leaf_dict(sub), **pd}
        for f in ("start", "end"):
            # "PromotionStartDateTime" vs. "PromotionStartDate" + "PromotionStartHour"
            if not pd.get(f"promotion{f}datetime") and pd.get(f"promotion{f}date"):
                pd[f"promotion{f}datetime"] = f"{pd[f'promotion{f}date']} {pd.get(f'promotion{f}hour', '')}".strip()
        club_only, club_name, conditional = _club(chain, pd.get("clubid", ""))
        is_coupon = pd.get("additionaliscoupon") == "1"
        # One promo per (promotion, kind): items of a promotion normally share a kind.
        by_kind: dict[tuple, Promo] = {}
        # Grouped layout: Promotion/Groups/Group/PromotionItems/PromotionItem, deal fields per item.
        # Flat layout (City Market): deal fields on the Promotion, Promotion/PromotionItems/Item.
        groups = list(pel.iter("Group", "group")) or [pel]
        for gel in groups:
            gd = leaf_dict(gel) if gel is not pel else {"minpurchaseamount": pd.get("minpurchaseamount", "")}
            min_purchase = _f(gd.get("minpurchaseamount")) or None
            for iel in gel.iter("PromotionItem", "promotionitem", "Item", "item"):
                d = {**pd, **leaf_dict(iel)}
                bc = canonical_barcode(d.get("itemcode", ""))
                if not bc:
                    continue
                kind, value, min_qty, get_qty = _item_kind(d)
                if gd.get("groupid", "1").lstrip("0") not in ("", "1"):  # Bina pads: "001"
                    # Later groups are the reward side of a multi-group promo: the free item of
                    # "1+1", the half-price item of "השני בחצי" (Rami Levy prices it as a
                    # fixed price!), the item you get after spending ₪100 (Shufersal SBOX).
                    # Applying them on their own would be wrong; group 1 describes the deal.
                    continue
                coupon =is_coupon or d.get("rewardtype") == "2" or "קופון" in pd.get("promotiondescription", "")
                key = (kind, value, min_qty, get_qty, min_purchase)
                promo = by_kind.get(key)
                if promo is None:
                    promo = Promo(
                        id=f"{chain}:{pd.get('promotionid', '')}:{len(by_kind)}",
                        chain=chain,
                        description=pd.get("promotiondescription", "").strip(),
                        start=_iso(pd.get("promotionstartdatetime", "")),
                        end=_end_of_day(_iso(pd.get("promotionenddatetime", ""))),
                        kind=kind,
                        value=value,
                        min_qty=min_qty,
                        get_qty=get_qty,
                        max_qty=_f(d.get("maxqty")) or None,
                        limit=_f(pd.get("redemptionlimit")) or None,  # Shufersal uses 0 = none
                        weekdays=_weekdays(pd.get("promotiondays", "")),
                        club_only=club_only,
                        club_name=club_name,
                        min_purchase=min_purchase,
                        is_coupon=coupon,
                        conditional=conditional,
                    )
                    by_kind[key] = promo
                promo.items.append(bc)
        for promo in by_kind.values():
            promo.items = sorted(set(promo.items))
            promo.store_ids = [store_id]
            out.append(promo)
    return store_id, out


def to_json(p: Promo) -> dict:
    """Compact dict: drops None/False/empty fields, but keeps 0 (min_qty=0 = any weight;
    note `0 in (False,)` is True in Python, hence the identity checks)."""
    return {k: v for k, v in asdict(p).items() if v is not None and v is not False and v != [] and v != ""}
