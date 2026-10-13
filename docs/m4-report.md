# M4 — Shopping lists & basket comparison (2026-10-14)

## Data change
- **Online-only stores excluded.** All three chains mark them `StoreType=2` in their Stores files
  ("שופרסל ONLINE", Rami Levy "מרלוג אינטרנט", Victory "אינטרנט"); type 3 (physical + online, e.g.
  Victory Lod) stays. One store per chain removed.

## Lists (`web/src/lib/lists.ts`)
- Several named lists in `localStorage` (create / rename / delete / switch), shared across pages.
- Add from search results ("+ לרשימה") or from a product page with the chosen quantity (units or kg).
  Adding an item already on the list adds up the quantity.
- **Share link**: name + `[barcode, qty]` pairs, lz-string compressed into the URL hash
  (`#/share/…`, ~25 characters per item). Opening it shows a preview and "save as my list";
  product names are looked up again from the data.
- **Export / import** as a JSON file (`format: "salzol-list"`), validated on import.

## Basket comparison (`web/src/lib/basket.ts`)
For every store within 20 km (or nationwide) that sells at least one list item:
- each line priced at that store's regular price;
- promos applied at **basket level**: mixed-item deals pool units across products ("N for ₪X" groups
  the most expensive units; "X+Y" frees the cheapest of each set); deals never stack on a line —
  the biggest savings win greedily; basket thresholds ("מעל ₪50") apply only if the basket total
  after other deals reaches them; clubs / dates / weekdays / store sets as in M3;
- **missing items** listed per store, never dropped.

Views: per chain (its best store) or per store. Modes: "only stores with everything" (default) or
"all stores", ranked by fewest missing items, then total. Ranking by total alone was tried first:
on real data a Shufersal BE drugstore stocking 1 of 5 items "won" with ₪12.
"₪X less than the most expensive" is only shown between complete baskets.
Breakdown per store: product, quantity, regular, paid, promo used.

Example (real data, Herzliya, 5 items): only Victory שבעת הכוכבים has all five (₪108.40, −₪9.80
in deals); 203 incomplete stores in range are hidden in "complete" mode; in "all stores" mode
Rami Levy Ra'anana (missing 1) and Shufersal (missing 2) follow.

## Tests
- Vitest 48: basket engine (mixed n-for and x+y, non-stacking, thresholds, clubs, dates, store
  sets, ranking modes), lists (share round-trip, URL length, import validation), M3 engine.
- Playwright 30 (all pass twice in a row): list add/qty/remove, persistence, multiple lists, basket
  totals & ordering, breakdown with promo, club changes total, complete vs all stores, share URL
  → new browser context → same list, broken link, export → import in another context.
