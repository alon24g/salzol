"""Load chain XML files regardless of compression or encoding."""

from __future__ import annotations

import gzip
import io
import zipfile
from pathlib import Path

from lxml import etree

_PARSER = etree.XMLParser(recover=True, huge_tree=True, resolve_entities=False, no_network=True)


def read_payload(path: Path) -> bytes:
    """Return the XML bytes, unwrapping gzip/zip by magic bytes (not by extension:
    Bina serves upper-case ".GZ" that the scraper saves still compressed)."""
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":
        return gzip.decompress(raw)
    if raw[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            return zf.read(zf.namelist()[0])
    return raw


def load_root(path: Path) -> etree._Element:
    """Parse to an element tree. lxml honours BOMs and encoding declarations; files
    with neither that aren't valid UTF-8 are retried as Windows-1255."""
    raw = read_payload(path)
    try:
        raw.decode("utf-8") if not raw.startswith((b"\xff\xfe", b"\xfe\xff")) else None
    except UnicodeDecodeError:
        if b"encoding=" not in raw[:200]:
            raw = raw.decode("cp1255", errors="replace").encode("utf-8")
    root = etree.fromstring(raw, parser=_PARSER)
    if root is None:
        raise ValueError(f"{path.name}: empty or unparseable XML")
    return root


def leaf_dict(el: etree._Element) -> dict[str, str]:
    """Child leaf elements as {lower-cased tag: stripped text}."""
    return {
        c.tag.lower(): (c.text or "").strip()
        for c in el
        if isinstance(c.tag, str) and len(c) == 0
    }


def pick(d: dict[str, str], *aliases: str) -> str:
    """First non-empty value among alias field names (already lower-cased)."""
    for a in aliases:
        v = d.get(a)
        if v:
            return v
    return ""
