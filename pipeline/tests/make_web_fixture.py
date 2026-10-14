"""Dev tool: cut a small, self-consistent snapshot of real built data (dist/data) for the web
e2e tests: the chosen products, every store, and only the promos those products reference
(re-indexed into fresh chunks).

    python -m pipeline.tests.make_web_fixture dist/data web/tests/e2e/fixtures/data BARCODE ...
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from pipeline.build import PROMO_CHUNK


def load(p: Path):
    return json.loads(p.read_text("utf-8"))


def dump(p: Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), "utf-8")


def main(src: Path, dst: Path, barcodes: list[str]) -> None:
    keep = set(barcodes)
    if dst.exists():
        shutil.rmtree(dst)
    for name in ("stores.json", "meta.json", "cities.json"):
        dump(dst / name, load(src / name))
    dump(dst / "search.json", [r for r in load(src / "search.json") if r[0] in keep])

    promo_cache: dict[tuple[str, int], list] = {}
    new_promos: dict[str, list] = {}
    remap: dict[tuple[str, int], int] = {}
    n_shards = load(src / "meta.json").get("price_shards", 256)  # the fixture keeps the source's count
    shards: dict[int, dict] = {i: {} for i in range(n_shards)}
    for bc in barcodes:
        shard = int(bc) % n_shards
        item = load(src / "prices" / f"{shard:03d}.json")[bc]
        for chain, idxs in item.get("pr", {}).items():
            out = []
            for i in idxs:
                if (chain, i) not in remap:
                    k = i // PROMO_CHUNK
                    if (chain, k) not in promo_cache:
                        promo_cache[chain, k] = load(src / "promos" / chain / f"{k}.json")
                    new_promos.setdefault(chain, []).append(promo_cache[chain, k][i % PROMO_CHUNK])
                    remap[chain, i] = len(new_promos[chain]) - 1
                out.append(remap[chain, i])
            item["pr"][chain] = out
        shards[shard][bc] = item
    for i, s in shards.items():
        dump(dst / "prices" / f"{i:03d}.json", s)
    for chain, plist in new_promos.items():
        for k in range(0, len(plist), PROMO_CHUNK):
            dump(dst / "promos" / chain / f"{k // PROMO_CHUNK}.json", plist[k:k + PROMO_CHUNK])
    size = sum(f.stat().st_size for f in dst.rglob("*") if f.is_file())
    print(f"{len(barcodes)} products, {sum(map(len, new_promos.values()))} promos, {size // 1024} KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:])
