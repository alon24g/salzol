"""Parsers against trimmed real files (see trim_fixture.py) from 7 chains / 5 portals."""

from pathlib import Path

import pytest

from pipeline.parse import parse_price_file, parse_stores_file

FX = Path(__file__).parent / "fixtures"

PRICE_FIXTURES = {
    "rami_levy": FX / "rami_levy_pricefull.xml",  # Cerberus, UTF-8 BOM
    "victory": FX / "victory_pricefull.xml",  # laibcatalog, undeclared UTF-8
    "shufersal": FX / "shufersal_pricefull.xml",  # own portal
    "king_store": FX / "king_store_pricefull.xml.gz",  # Bina, gzip saved without .xml
    "wolt": FX / "wolt_pricefull.xml",  # "blsWeighted" typo
    "keshet": FX / "keshet_pricefull.xml",  # PriceUpdateDate, ManufacturerName
}
STORE_FIXTURES = {
    "rami_levy": FX / "rami_levy_stores.xml",
    "victory": FX / "victory_stores.xml",  # ZipCode / SubChainId casing
    "shufersal": FX / "shufersal_stores.xml",  # root <Chain>, 10 sub-chains
    "king_store": FX / "king_store_stores.xml.gz",
    "wolt": FX / "wolt_stores.xml",
    "keshet": FX / "keshet_stores.xml",
}


@pytest.mark.parametrize("chain", PRICE_FIXTURES)
def test_price_file_header_and_rows(chain):
    pf = parse_price_file(PRICE_FIXTURES[chain])
    assert len(pf.chain_id) == 13 and pf.chain_id.startswith("729")
    assert pf.store_id
    assert pf.rows
    for r in pf.rows:
        assert r.item_code
        assert r.name
        assert r.price is None or r.price > 0
        assert r.updated


@pytest.mark.parametrize("chain", ["rami_levy", "victory", "shufersal", "wolt"])
def test_weighted_flag_is_read(chain):
    # Each of these fixtures was trimmed to include the chain's first weighted item.
    assert any(r.is_weighted for r in parse_price_file(PRICE_FIXTURES[chain]).rows)


def test_field_aliases_keshet():
    rows = parse_price_file(PRICE_FIXTURES["keshet"]).rows
    assert any(r.manufacturer for r in rows)  # from <ManufacturerName>


def test_empty_header_falls_back_to_file_name():
    pf = parse_price_file(FX / "city_market_shops" / "PriceFull7290000000003-066-202610131130.xml")
    assert pf.chain_id == "7290000000003"
    assert pf.store_id == "066"
    assert pf.rows[0].name.startswith("זוג מטליות")  # <ItemNm>
    assert pf.rows[0].price is None  # real file has an empty <ItemPrice/>


@pytest.mark.parametrize("chain", STORE_FIXTURES)
def test_stores_file(chain):
    rows = parse_stores_file(STORE_FIXTURES[chain])
    assert rows
    for s in rows:
        assert s.store_id and s.name
        assert s.chain_id.startswith("729")


def test_stores_nested_wrapper_city_market():
    path = next((FX / "city_market_shops").glob("StoresFull*"))
    rows = parse_stores_file(path)
    assert rows and all(s.store_id for s in rows)


def test_city_is_code_or_name():
    # Real-data quirk: some chains publish CBS settlement codes, others Hebrew names.
    assert parse_stores_file(STORE_FIXTURES["shufersal"])[0].city.isdigit()
    assert not parse_stores_file(STORE_FIXTURES["victory"])[0].city.isdigit()
