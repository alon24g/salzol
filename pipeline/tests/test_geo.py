"""City → settlement resolution, with City values seen in real Stores files."""

import pytest

from pipeline.geo import Settlements, haversine_km


@pytest.fixture(scope="module")
def st():
    return Settlements.load()


@pytest.mark.parametrize(
    "city,fallbacks,expected",
    [
        ("3000", (), "ירושלים"),  # CBS code (Shufersal, Rami Levy)
        ("גן-יבנה", (), "גן יבנה"),  # punctuation differs
        ("תל אבית יפה", (), "תל אביב -יפו"),  # Victory typo
        ("הרצליה", (), "הרצלייה"),  # CBS spelling
        ("טבעון", (), "קריית טבעון"),
        ("0", ("", "גוש עציון"), "אלון שבות"),  # Rami Levy City=0 → store name
        ("50", ("", "אקספרס גבעת עדה"), "בנימינה-גבעת עדה"),  # unknown code → name
        ("unknown", ("unknown", 'סיטי מרקט אגמים בע"מ , עמק האלה 47 אשקלון'), "אשקלון"),
    ],
)
def test_resolve(st, city, fallbacks, expected):
    hit = st.resolve(city, *fallbacks)
    assert hit is not None and hit["name"] == expected


def test_online_store_has_no_location(st):
    assert st.resolve("", "", "אינטרנט") is None


def test_coordinates_are_sane(st):
    ta, jlm = st.by_code[5000], st.by_code[3000]
    assert 50 < haversine_km(ta["lat"], ta["lon"], jlm["lat"], jlm["lon"]) < 55
    for r in st.by_code.values():
        assert 29.4 < r["lat"] < 33.4 and 34.2 < r["lon"] < 35.9


@pytest.mark.parametrize(
    "name,expected",
    [
        ('ת"א - כיכר רבין', "תל אביב -יפו"),  # Good Pharm
        ('סיטי מרקט פ.פ.ת בע"מ, פינסקר 21 פ"ת', "פתח תקווה"),  # City Market
        ("נטו חיסכון בת ים* ת.", "בת ים"),  # Super Sapir
        ("חוצות המפרץ", "חיפה"),  # Yohananof
    ],
)
def test_city_from_store_name_with_abbreviations_and_landmarks(name, expected):
    hit = Settlements.load().resolve("0", "unknown", name)
    assert hit and hit["name"] == expected
