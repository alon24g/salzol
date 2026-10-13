"""Dev tool: show real promotions next to the item's regular price, grouped by a field value,
to work out promo semantics from data rather than field names.

    python -m pipeline.tests.sample_promos CHAIN_DIR STORE_PATTERN [--by RewardType] [--n 6]
"""

from __future__ import annotations

import argparse
import random
from collections import defaultdict
from pathlib import Path

from pipeline.parse import parse_price_file
from pipeline.parse.xmlio import leaf_dict, load_root


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("chain_dir", type=Path)
    ap.add_argument("store", help="substring of the file name selecting one store, e.g. -001-001-")
    ap.add_argument("--by", default="RewardType", help="field (promo, group or item level) to group by")
    ap.add_argument("--n", type=int, default=6)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()

    pick = lambda kind: max(p for p in (a.chain_dir / kind).iterdir() if a.store in p.name)  # noqa: E731
    prices = {r.item_code: r.price for r in parse_price_file(pick("price_full")).rows}
    root = load_root(pick("promo_full"))
    by = a.by.lower()

    groups = defaultdict(list)
    for promo in root.iter():
        if not (isinstance(promo.tag, str) and promo.tag.lower() in ("promotion", "sale")):
            continue
        pd = leaf_dict(promo)
        # Item rows may be nested (Groups/Group/PromotionItems/PromotionItem) or flat.
        items = [e for e in promo.iter() if isinstance(e.tag, str) and e.tag.lower() in ("promotionitem", "item")]
        parents = {}
        for g in promo.iter():
            if isinstance(g.tag, str) and g.tag.lower() == "group":
                for it in g.iter():
                    parents[it] = leaf_dict(g)
        for it in items:
            d = {**pd, **parents.get(it, {}), **leaf_dict(it)}
            groups[d.get(by, "<missing>")].append(d)

    random.seed(a.seed)
    for key in sorted(groups, key=lambda k: -len(groups[k])):
        rows = groups[key]
        print(f"\n===== {a.by}={key!r}: {len(rows)} item rows")
        for d in random.sample(rows, min(a.n, len(rows))):
            code = d.get("itemcode", "")
            print(
                f"  {d.get('promotiondescription', '')[:46]:46} | reg={prices.get(code)} "
                + " ".join(
                    f"{k}={d[k]}"
                    for k in (
                        "minqty", "maxqty", "discountedprice", "discountrate", "discountedpricepermida",
                        "discounttype", "rewardtype", "isgiftitem", "clubid", "minpurchaseamount",
                        "promotiondays", "redemptionlimit", "allowmultiplediscounts",
                    )
                    if d.get(k) and k != by
                )
            )


if __name__ == "__main__":
    main()
