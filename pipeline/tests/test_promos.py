"""Promo parsing on trimmed real PromoFull files (trim_promo_fixture.py). Each case is a
promotion whose meaning was verified against the store's regular price (sample_promos.py)."""

from pathlib import Path

import pytest

from pipeline.manual_deals import ManualDealError, load_manual_deals
from pipeline.promos import parse_promo_file

FX = Path(__file__).parent / "fixtures" / "promos"


def promos(folder: str, chain: str):
    store_id, ps = parse_promo_file(next((FX / folder).iterdir()), chain)
    return store_id, ps


def find(ps, text):
    hits = [p for p in ps if text in p.description]
    assert hits, f"no promo matching {text!r}"
    return hits[0]


# --- Victory (laibcatalog) -------------------------------------------------------------


def test_victory_n_for_price():
    p = find(promos("victory", "victory")[1], "2ב15שוופס")  # regular 8.90
    assert (p.kind, p.value, p.min_qty) == ("n_for_price", 15.0, 2)
    assert p.applicable and not p.club_only


def test_victory_fixed_price():
    p = find(promos("victory", "victory")[1], "משחת שיניים פרונמל")  # regular 15.90
    assert (p.kind, p.value, p.min_qty) == ("fixed_price", 10.9, 1)


def test_victory_one_plus_one_ignores_reward_group():
    ps = [p for p in promos("victory", "victory")[1] if "אוראו" in p.description]
    assert len(ps) == 1  # group 2 (the free item at 100% off) is not a separate promo
    assert (ps[0].kind, ps[0].min_qty, ps[0].get_qty) == ("buy_x_get_y", 1, 1)


def test_victory_max_club_is_club_only():
    p = find(promos("victory", "victory")[1], "טופו")
    assert p.club_only and p.club_name == "מקס ויקטורי" and p.applicable
    assert p.limit == 2


def test_victory_min_purchase_and_max_qty():
    p = find(promos("victory", "victory")[1], "תירס ארוז מעל 50")
    assert p.min_purchase == 50 and p.max_qty == 3


def test_victory_personal_coupon_is_never_applied():
    p = find(promos("victory", "victory")[1], "קופון אישי")
    assert p.is_coupon and not p.applicable


def test_victory_weekday_deal():
    p = find(promos("victory_weekday", "victory")[1], "חטיף חלבון טבעוני")
    # PromotionDays="2,3" with 1 = Sunday → Monday, Tuesday (0 = Sunday in our model)
    assert p.weekdays == [1, 2]
    assert (p.kind, p.value, p.min_qty) == ("n_for_price", 22.0, 2)
    assert p.end == "2027-12-31T23:59"  # "2027-12-31T00:00" is inclusive of that day


# --- Rami Levy (Cerberus) --------------------------------------------------------------


def test_rami_levy_header_and_kinds():
    store_id, ps = promos("rami_levy", "rami_levy")
    assert store_id == "001"
    assert find(ps, "אטריות ביצים").kind == "n_for_price"


def test_rami_levy_weighted_any_amount_is_per_kg():
    p = find(promos("rami_levy", "rami_levy")[1], "קשתית בקר")  # MinQty 0.010
    assert (p.kind, p.value, p.min_qty) == ("fixed_price", 69.9, 0)


def test_rami_levy_club_expression():
    p = find(promos("rami_levy", "rami_levy")[1], "מוע")
    assert p.club_only and p.club_name == "מועדון שיווק השקמה"


def test_rami_levy_buy_two_get_one():
    p = find(promos("rami_levy", "rami_levy")[1], "2+1 הזול")
    assert (p.kind, p.min_qty, p.get_qty) == ("buy_x_get_y", 2, 1)


def test_rami_levy_second_at_half_is_unknown_not_a_fixed_price():
    ps = [p for p in promos("rami_levy", "rami_levy")[1] if "השני בחצי" in p.description]
    # group 2 lists the half-price item as a "fixed price"; it must not leak out
    assert [p.kind for p in ps] == ["unknown"]
    assert not ps[0].applicable


def test_rami_levy_coupon():
    assert find(promos("rami_levy", "rami_levy")[1], "קופון").is_coupon


# --- Shufersal ---------------------------------------------------------------------------


def test_shufersal_grams_for_price_is_per_kg():
    p = find(promos("shufersal", "shufersal")[1], "200ב30")  # 200 g for ₪30
    assert (p.kind, p.value, p.min_qty) == ("fixed_price", 150.0, 0)


def test_shufersal_weighted_ambiguous_left_for_build():
    p = find(promos("shufersal_weighted", "shufersal")[1], "חצילים")  # MinQty 0.10, ₪3.90
    assert (p.kind, p.value, p.min_qty) == ("fixed_price_kg_ambiguous", 3.9, 0.1)


def test_shufersal_end_time_after_midnight_is_previous_day():
    p = find(promos("shufersal_weighted", "shufersal")[1], "חצילים")  # file says 10-19T02:59
    assert p.end == "2026-10-18T23:59"


def test_shufersal_one_plus_one_without_gift_qty():
    p = find(promos("shufersal", "shufersal")[1], "1+1 חומוס")  # IsGiftItem is empty
    assert (p.kind, p.min_qty, p.get_qty) == ("buy_x_get_y", 1, 1)


def test_shufersal_all_customers_club_text():
    p = find(promos("shufersal", "shufersal")[1], "3ב50 מגבוני")  # ClubID "0 - כלל הלקוחות"
    assert not p.club_only and (p.kind, p.value, p.min_qty) == ("n_for_price", 50.0, 3)


def test_shufersal_credit_card_deal():
    p = find(promos("shufersal", "shufersal")[1], "SBOX")
    assert p.club_only and p.club_name == "מועדון לקוחות"
    assert p.kind == "unknown" and p.min_purchase == 100


@pytest.mark.parametrize("text", ["תו זהב", "קופון 100"])
def test_shufersal_coupons(text):
    assert find(promos("shufersal", "shufersal")[1], text).is_coupon


# --- manual deals --------------------------------------------------------------------------


def test_manual_deal_keyword_and_barcode(tmp_path):
    f = tmp_path / "deals.yaml"
    f.write_text(
        """
- chain: victory
  title: "יום שני ללא בשר"
  weekdays: [1]
  kind: percent_off
  value: 10
  applies_to: { category_keywords: ["טבעוני"], barcodes: ["07290116936291"] }
  verified_on: "2026-10-13"
""",
        "utf-8",
    )
    names = {"victory": {"7290116936291": {"חלב"}, "7290000000002": {"חטיף חלבון טבעוני"}}}
    [p] = load_manual_deals(names, f)
    assert p.source == "manual" and p.weekdays == [1] and p.kind == "percent_off"
    assert p.items == ["7290000000002", "7290116936291"]  # zero-padded barcode canonicalized


def test_manual_deal_validation(tmp_path):
    f = tmp_path / "deals.yaml"
    f.write_text('- chain: victory\n  title: x\n  kind: half_off\n  value: 1\n  applies_to: {}\n  verified_on: "x"\n', "utf-8")
    with pytest.raises(ManualDealError):
        load_manual_deals({}, f)


def test_committed_manual_deals_file_is_valid():
    load_manual_deals({})  # data/manual_deals.yaml must always parse


# --- build-time resolution of ambiguous weighted promos -----------------------------------


@pytest.mark.parametrize(
    "price,min_qty,regular,expected",
    [
        (22.0, 0.25, 99.0, 88.0),  # Victory pastrami: ₪22 per 250 g → ₪88/kg (regular ₪99)
        (3.9, 0.10, 8.9, 3.9),  # Shufersal eggplant: ₪3.90/kg (₪39 would exceed regular)
        (50.0, 0.5, 40.0, None),  # neither reading beats the regular price → not trusted
    ],
)
def test_resolve_weighted_price(price, min_qty, regular, expected):
    from pipeline.build import resolve_weighted_price

    assert resolve_weighted_price(price, min_qty, regular) == expected


def test_to_json_keeps_zero_min_qty():
    from pipeline.promos import to_json

    p = find(promos("rami_levy", "rami_levy")[1], "קשתית בקר")
    d = to_json(p)
    assert d["min_qty"] == 0 and "club_only" not in d and "get_qty" not in d


# --- Bina portal (Bareket, King Store, Maayan 2000, …): group ids are zero-padded --------


def test_bina_padded_group_id_is_the_deal_group():
    store, ps = promos("bareket", "bareket")
    p = find(ps, "מעדן דנונה ביו סויה-5ב20")  # regular 5.90 each
    assert store == "009"
    assert (p.kind, p.value, p.min_qty) == ("n_for_price", 20.0, 5)
    assert p.applicable and not p.club_only
    assert "7290119371822" in p.items


# --- City Market: flat layout (deal fields on the Promotion, items as <Item>) ------------


def test_flat_layout_n_for_price():
    store, ps = promos("city_market", "city_market")
    p = find(ps, "סבבה4ב-10")  # regular 2.90 each
    assert store == "013"
    assert (p.kind, p.value, p.min_qty) == ("n_for_price", 10.0, 4)
    assert {"7290010117970", "7290106653504"} <= set(p.items)


def test_flat_layout_dates_and_fixed_price():
    p = find(promos("city_market", "city_market")[1], "בדין מרכך 960")  # regular 18.90
    assert (p.kind, p.value) == ("fixed_price", 14.9)
    # PromotionStartDate + PromotionStartHour, PromotionEndDate + PromotionEndHour
    assert (p.start, p.end) == ("2026-10-05T00:00", "2026-11-03T23:59")
    assert not p.is_coupon and not p.club_only
