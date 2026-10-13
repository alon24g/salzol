"""Dev tool: describe real PromoFull files without assuming their schema.

    python -m pipeline.tests.inspect_promos raw/VICTORY_NEW_SOURCE/promo_full [--files 10]

Prints the element tree of one file, then for the repeating "promotion" element: how often each
field appears and its most common values across the sampled files.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from pathlib import Path

from pipeline.parse.xmlio import load_root


def tree(el, depth=0, max_depth=6, seen=None):
    kids = [c for c in el if isinstance(c.tag, str)]
    text = (el.text or "").strip()
    line = "  " * depth + f"<{el.tag}>"
    line += f" [{len(kids)} children]" if kids else f" {text[:50]!r}"
    print(line)
    if depth >= max_depth:
        return
    seen_here = set()
    for c in kids:
        if c.tag in seen_here:
            continue
        seen_here.add(c.tag)
        tree(c, depth + 1, max_depth)


def find_record_tag(root) -> str:
    """The repeating element with the most leaf children: the promotion record."""
    counts = Counter(e.tag for e in root.iter() if isinstance(e.tag, str))
    best, best_leaves = None, 0
    for tag, n in counts.items():
        if n < 2:
            continue
        el = root.find(f".//{tag}")
        leaves = sum(1 for c in el if isinstance(c.tag, str) and len(c) == 0)
        if leaves > best_leaves:
            best, best_leaves = tag, leaves
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path)
    ap.add_argument("--files", type=int, default=10)
    ap.add_argument("--values", type=int, default=8)
    ap.add_argument("--record", help="record tag to profile (default: auto-detect)")
    ap.add_argument("--no-tree", action="store_true")
    a = ap.parse_args()

    files = sorted(p for p in a.folder.iterdir() if p.is_file())[: a.files]
    first = load_root(files[0])
    print(f"### {files[0].name}")
    if not a.no_tree:
        tree(first)

    rec = a.record or find_record_tag(first)
    present = Counter()
    values: dict[str, Counter] = defaultdict(Counter)
    child_lists = Counter()
    n = 0
    for p in files:
        for el in load_root(p).iter(rec):
            n += 1
            for c in el:
                if not isinstance(c.tag, str):
                    continue
                present[c.tag] += 1
                if len(c) == 0:
                    values[c.tag][(c.text or "").strip()[:60]] += 1
                else:
                    child_lists[(c.tag, len(c))] += 1
    print(f"\n### record <{rec}>: {n} in {len(files)} files")
    for tag, cnt in present.most_common():
        vals = values.get(tag)
        if vals is None:
            sizes = sorted(k[1] for k in child_lists if k[0] == tag)
            print(f"  {tag:32} {cnt:6}  (container; child counts {sizes[:1]}..{sizes[-1:]})")
            continue
        distinct = len(vals)
        top = ", ".join(f"{v!r}×{c}" for v, c in vals.most_common(a.values))
        print(f"  {tag:32} {cnt:6}  {distinct:5} distinct: {top}")


if __name__ == "__main__":
    main()
