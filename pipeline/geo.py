"""Store locations: resolve each store's city to a CBS settlement with coordinates.

Chains publish City as a CBS settlement code (Shufersal, Rami Levy: "3000") or as a
Hebrew name (Victory: "גן יבנה"). Both resolve against data/settlements.json, which is
generated once from the CBS settlements file (bycode<year>.xlsx on data.gov.il):

    python -m pipeline.geo make-settlements bycode2023.xlsx   # needs openpyxl + pyproj
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

SETTLEMENTS_PATH = Path(__file__).resolve().parent.parent / "data" / "settlements.json"

_FINALS = str.maketrans("ךםןףץ", "כמנפצ")
_NOISE = re.compile(r"[\s\-\"'״׳()־.,]+")

# Chain spellings that differ from CBS names beyond punctuation/spacing.
NAME_ALIASES = {
    "תל אביב": "תל אביב -יפו",
    "תל אביב יפו": "תל אביב -יפו",
    "יפו": "תל אביב -יפו",
    "פתח תקוה": "פתח תקווה",
    "קרית אתא": "קריית אתא",
    "קרית גת": "קריית גת",
    "קרית מוצקין": "קריית מוצקין",
    "קרית ביאליק": "קריית ביאליק",
    "קרית ים": "קריית ים",
    "קרית שמונה": "קריית שמונה",
    "קרית אונו": "קריית אונו",
    "קרית מלאכי": "קריית מלאכי",
    "קרית ארבע": "קריית ארבע",
    "קרית טבעון": "קריית טבעון",
    "מודיעין": "מודיעין-מכבים-רעות",
    "מודיעין מכבים רעות": "מודיעין-מכבים-רעות",
    "נצרת עילית": "נוף הגליל",
    "הרצליה": "הרצלייה",
    "תל אבית יפה": "תל אביב -יפו",  # Victory typo
    "טירת הכרמל": "טירת כרמל",
    "טבעון": "קריית טבעון",
    "גבעת עדה": "בנימינה-גבעת עדה",
    "צור יגאל": "כוכב יאיר",  # merged municipality
    "צמח": "מפעלי צמח",
    "עמק חפר": "פארק תעשיות עמק חפר",
    # Rami Levy publishes City=0 for these; the store name is a regional landmark.
    "שער בנימין": "כוכב יעקב",
    "גוש עציון": "אלון שבות",
}


def norm_name(s: str) -> str:
    return _NOISE.sub("", s.strip().translate(_FINALS))


class Settlements:
    def __init__(self, rows: list[dict]):
        self.by_code = {r["code"]: r for r in rows}
        self.by_name: dict[str, dict] = {}
        # Larger settlements win name collisions.
        for r in sorted(rows, key=lambda r: r.get("pop") or 0):
            self.by_name[norm_name(r["name"])] = r
        for alias, target in NAME_ALIASES.items():
            if norm_name(target) in self.by_name:
                self.by_name.setdefault(norm_name(alias), self.by_name[norm_name(target)])

    @classmethod
    def load(cls, path: Path = SETTLEMENTS_PATH) -> "Settlements":
        return cls(json.loads(path.read_text("utf-8")))

    def resolve(self, city: str, *fallback_texts: str) -> dict | None:
        """Settlement for a store's City field; for 'unknown'/'0' try the address and
        store name (City Market Shops puts the city only in the store name)."""
        c = city.strip()
        if c.isdigit():
            hit = self.by_code.get(int(c))
            if hit:
                return hit
        elif c:
            hit = self.by_name.get(norm_name(c))
            if hit:
                return hit
        for text in fallback_texts:
            hit = self._find_in_text(text)
            if hit:
                return hit
        return None

    def _find_in_text(self, text: str) -> dict | None:
        # Longest settlement name that appears as a whole word sequence in the text.
        words = re.split(r"[\s,\-()]+", text.translate(_FINALS))
        best = None
        for i in range(len(words)):
            for j in range(min(len(words), i + 4), i, -1):
                hit = self.by_name.get(norm_name("".join(words[i:j])))
                if hit and len(norm_name(hit["name"])) >= 3:
                    if best is None or len(hit["name"]) > len(best["name"]):
                        best = hit
                    break
        return best


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def make_settlements(xlsx: Path, out: Path = SETTLEMENTS_PATH) -> None:
    """CBS bycode xlsx → data/settlements.json. Coordinates column is ITM (EPSG:2039)
    packed as 12 digits (6 easting + 6 northing, metres) or, for 132 regional-council
    rows, 10 digits (5 + 5, in units of 10 m)."""
    import openpyxl
    from pyproj import Transformer

    to_wgs = Transformer.from_crs("EPSG:2039", "EPSG:4326", always_xy=True)
    ws = openpyxl.load_workbook(xlsx, read_only=True).worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {h: i for i, h in enumerate(header)}
    out_rows = []
    for r in rows:
        code, name, coord = r[col["סמל יישוב"]], r[col["שם יישוב"]], r[col["קואורדינטות"]]
        if not code or not name or not coord:
            continue
        digits = str(int(coord))
        if len(digits) == 10:  # older 5+5 format in units of 10 m (regional-council areas)
            e, n = int(digits[:5]) * 10, int(digits[5:]) * 10
        else:
            digits = digits.zfill(12)
            e, n = int(digits[:6]), int(digits[6:])
        lon, lat = to_wgs.transform(e, n)
        if not (29.4 < lat < 33.4 and 34.2 < lon < 35.9):  # e.g. השומרון (1999) is bogus
            print(f"skipping {name} ({code}): coordinates outside Israel")
            continue
        out_rows.append(
            {
                "code": int(code),
                "name": str(name).strip(),
                "en": str(r[col["שם יישוב באנגלית"]] or "").strip(),
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "pop": int(r[col["סך הכל אוכלוסייה 2023 - ארעי"]] or 0),
            }
        )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(out_rows, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"{out}: {len(out_rows)} settlements")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "make-settlements":
        make_settlements(Path(sys.argv[2]))
    else:
        sys.exit(__doc__)
