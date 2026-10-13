"""Dev tool: trim a real chain file into a small test fixture, preserving its quirks
(compression, BOM, encoding declaration, tag casing).

    python -m pipeline.tests.trim_fixture SRC DEST [--keep 6]

Keeps the first N records plus the first weighted item and the first item whose
code isn't a valid barcode, so each fixture exercises those paths.
"""

from __future__ import annotations

import argparse
import gzip
from pathlib import Path

from lxml import etree

from pipeline.normalize import canonical_barcode
from pipeline.parse.xmlio import read_payload


def trim(src: Path, dest: Path, keep: int) -> None:
    raw_file = src.read_bytes()
    payload = read_payload(src)
    bom = payload.startswith(b"\xef\xbb\xbf")
    root = etree.fromstring(payload, etree.XMLParser(recover=True, huge_tree=True))

    records = [e for e in root.iter() if isinstance(e.tag, str) and e.tag.lower() in ("item", "store", "subchainstorexmlobject")]
    chosen = set(records[:keep])
    for want in ("weighted", "internal"):
        for e in records:
            d = {c.tag.lower(): (c.text or "").strip() for c in e if isinstance(c.tag, str)}
            if want == "weighted" and d.get("bisweighted", d.get("blsweighted")) == "1":
                chosen.add(e)
                break
            if want == "internal" and "itemcode" in d and canonical_barcode(d["itemcode"]) is None:
                chosen.add(e)
                break
    for e in records:
        if e not in chosen:
            e.getparent().remove(e)

    declared = b"encoding=" in payload[:200]
    out = etree.tostring(root, encoding="utf-8", xml_declaration=declared)
    if bom:
        out = b"\xef\xbb\xbf" + out
    if raw_file[:2] == b"\x1f\x8b":
        out = gzip.compress(out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(out)
    print(f"{dest}: {len(chosen)} records, {len(out)} bytes")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("dest", type=Path)
    ap.add_argument("--keep", type=int, default=6)
    a = ap.parse_args()
    trim(a.src, a.dest, a.keep)
