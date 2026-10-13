"""Choosing the newest file per store from real portal file names."""

import pytest

from pipeline.build import latest_files, store_key
from pipeline.fetch import file_key_and_stamp


@pytest.mark.parametrize(
    "name,key,stamp",
    [
        ("PriceFull7290058140886-001-001-20261013-121501.xml", "pricefull7290058140886-001-001", "20261013121501"),
        ("pricefull7290058140886-039-202607150513.xml", "pricefull7290058140886-039", "20260715051300"),
        ("Stores7290696200003-000-20261013060100-060100", "stores7290696200003-000", "20261013060100"),
        ("Stores7290027600007-000-20261013-020", "stores7290027600007-000", "20261013020000"),
        ("PriceFull7290058108879-000-340-20261013-045044.GZ", "pricefull7290058108879-000-340", "20261013045044"),
    ],
)
def test_file_key_and_stamp(name, key, stamp):
    assert file_key_and_stamp(name) == (key, stamp)


def test_latest_files_keeps_newest_and_drops_stale(tmp_path):
    names = [
        "PriceFull7290058140886-001-001-20261013-001006.xml",
        "PriceFull7290058140886-001-001-20261013-121501.xml",  # newer, same store
        "PriceFull7290058140886-001-002-20261013-001000.xml",
        "pricefull7290058140886-039-202608290523.xml",  # store stopped publishing (real case)
    ]
    for n in names:
        (tmp_path / n).write_text("<Root/>")
    keep, stale = latest_files(tmp_path)
    assert sorted(p.name for p in keep) == sorted([names[1], names[2]])
    assert len(stale) == 1 and "039" in stale[0]


def test_store_key_unpads():
    assert store_key("001") == store_key("1") == "1"
    assert store_key("A12") == "A12"
