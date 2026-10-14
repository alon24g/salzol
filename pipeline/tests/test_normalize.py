"""Barcode and unit-price normalization. Cases are taken from real rows."""

import pytest

from pipeline.normalize import canonical_barcode, gtin_check_ok, is_valid_price, unit_price


@pytest.mark.parametrize(
    "code,expected",
    [
        ("7290116936291", "7290116936291"),  # Tnuva milk, EAN-13
        ("07290116936291", "7290116936291"),  # zero-padded
        ("79", None),  # Victory "pickup fee" service code
        ("7290116936292", None),  # bad check digit
        ("12345", None),  # too short
        ("ABC123", None),
    ],
)
def test_canonical_barcode(code, expected):
    assert canonical_barcode(code) == expected


def test_check_digit_ignores_zero_padding():
    assert gtin_check_ok("7290116936291") == gtin_check_ok("07290116936291")


@pytest.mark.parametrize(
    "price,qty,uom,uqty,weighted,expected",
    [
        # Rami Levy: quantity in ml, UnitOfMeasure says "100 מיליליטר", UnitQty unknown.
        (49.9, "750.00", "100 מיליליטר", "לא ידוע", False, (6.65, '100 מ"ל')),
        # Rami Levy: liters.
        (45.9, "9.00", "ליטר", "לא ידוע", False, (0.51, '100 מ"ל')),
        # Victory: "גרם 100" display unit, quantity in grams.
        (15.9, "200", "גרם 100", "גרם", False, (7.95, "100 גרם")),
        # Victory: 1 kg package (not weighted) → per 100 g.
        (7.9, "1", "1 קילוגרם", "קילוגרם", False, (0.79, "100 גרם")),
        # Units.
        (9.9, "12", "יחידות 1", "יחידות", False, (0.83, "יחידה")),
        # Weighted: ItemPrice is already per kg.
        (59.9, "1", "1 קילוגרם", "קילוגרם", True, (59.9, 'ק"ג')),
    ],
)
def test_unit_price(price, qty, uom, uqty, weighted, expected):
    up = unit_price(price, qty, uom, uqty, weighted)
    assert up is not None
    assert (up[0], up[1]) == expected


@pytest.mark.parametrize(
    "qty,uom,uqty",
    [("", "", ""), ("", "100 גרם", ""), ("100.00", "לא ידוע", "לא ידוע"), ("0", "גרם", "גרם")],
)
def test_unit_price_unknown(qty, uom, uqty):
    assert unit_price(10.0, qty, uom, uqty, False) is None


def test_invalid_prices():
    assert not is_valid_price(None)
    assert not is_valid_price(0)
    assert not is_valid_price(-3)
    assert is_valid_price(0.1)


@pytest.mark.parametrize(
    "name,expected",
    [("תנובה", True), ("Coca-Cola", True), ("---", False), (".", False), ("", False), ("לא ידוע", False), ("כללי", False)],
)
def test_known_manufacturer(name, expected):
    from pipeline.build import known_manufacturer

    assert known_manufacturer(name) is expected


def test_alias_words_keeps_only_words_the_canonical_name_lacks():
    from pipeline.build import alias_words

    name = "חלב תנובה 3% שומן 2 ליטר"
    aliases = ["חלב תנובה 3% 2 ל", "חלב טרי 3% תנובה בקרטון", "חלב תנובה 3% שומן 2 ליטר"]
    assert alias_words(name, aliases) == ["ל טרי בקרטון"]
    assert alias_words("במבה", ["במבה"]) == []
