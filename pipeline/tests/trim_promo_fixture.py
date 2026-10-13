"""Dev tool: cut a real PromoFull file down to the promotions whose description contains
one of the given substrings (first match each), keeping the header and the file name.

    python -m pipeline.tests.trim_promo_fixture SRC DEST_DIR "2ב15" "1+1עוגיות" ...
"""

from __future__ import annotations

import sys
from pathlib import Path

from lxml import etree

from pipeline.parse.xmlio import read_payload

MAX_ITEMS_PER_GROUP = 5


def trim(src: Path, dest_dir: Path, needles: list[str]) -> None:
    payload = read_payload(src)
    root = etree.fromstring(payload, etree.XMLParser(recover=True, huge_tree=True))
    promos = list(root.iter("Promotion"))
    keep, missing = set(), []
    for n in needles:
        hit = next((p for p in promos if n in (p.findtext("PromotionDescription") or "")), None)
        if hit is None:
            missing.append(n)
        else:
            keep.add(hit)
    for p in promos:
        if p not in keep:
            p.getparent().remove(p)
    for items in root.iter("PromotionItems"):  # e.g. "תו זהב" lists thousands of products
        for extra in list(items)[MAX_ITEMS_PER_GROUP:]:
            items.remove(extra)
    out = etree.tostring(root, encoding="utf-8", xml_declaration=b"encoding=" in payload[:200])
    if payload.startswith(b"\xef\xbb\xbf"):
        out = b"\xef\xbb\xbf" + out
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = src.name if src.name.lower().endswith(".xml") else src.name + ".xml"
    (dest_dir / name).write_bytes(out)
    print(f"{dest_dir / name}: {len(keep)} promotions, {len(out)} bytes; missing: {missing}")


if __name__ == "__main__":
    trim(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:])
