# M1 — Pipeline for 3 chains (2026-10-13)

Chains: **Shufersal** (own portal), **Rami Levy** (Cerberus / publishedprices), **Victory** (laibcatalog).
All numbers below are from a real fetch + build on 2026-10-13, run locally in Israel.

## What runs end to end

```
python -m pipeline.fetch --out raw --chains SHUFERSAL,RAMI_LEVY,VICTORY_NEW_SOURCE
python -m pipeline.build --raw raw --out dist/data
python -m pytest pipeline/tests        # 45 tests, also in CI (GitHub-hosted runners only)
```

| Step | Result |
|---|---|
| Fetch | 424 + 99 + 70 store PriceFull files, 0 failures. Shufersal 17.5 min, Victory 37 s (3 concurrent downloads) |
| Parse | 3.95 M price rows (Shufersal 2.34 M, Rami Levy 1.01 M, Victory 0.60 M) |
| Stale files dropped | 7 Shufersal stores whose newest file is 1–3 months old (stores that stopped publishing) |
| Normalize | 59,189 barcoded products; 14,501 in ≥2 chains, 6,176 in all 3; 2,461 chain-only items |
| Invalid | 3 cross-chain price outliers (>5× from cross-chain median) dropped |
| Build time | 102 s for all 3 chains (warm disk cache; see "Performance") |

## Output sizes (dist/data)

| File | Raw | gzip |
|---|---|---|
| `search.json` (barcode, name, brand, #chains, aliases) | 6.1 MB | **1.36 MB** |
| `stores.json` (586 stores) | 70 KB | 12 KB |
| `prices/000…255.json` total | 22.9 MB | 3.4 MB |
| one price shard (median / max) | 89 KB / 118 KB | ~14 KB / ~18 KB |
| `meta.json` | 1.4 KB | — |

Price de-duplication works well: e.g. Tnuva 3% milk 2L appears in 176 stores but is stored as 7
price groups (Shufersal 2, Rami Levy 4, Victory 1).

## Storage format proposal → **sharded JSON** (not SQLite + sql.js-httpvfs)

- Real sizes are small: a product page needs one ~14 KB (gz) shard; a 30-item basket ≤ 30 shards.
- Plain JSON caches naturally in the service worker for the PWA/offline requirement (§7); httpvfs
  range requests over a single SQLite file are awkward to cache offline and add a WASM dependency.
- Extrapolation to all ~32 chains (M5): roughly 100k products and ~10× the price data →
  - price shards: go from 256 → 1024 shards (~25–40 KB gz each); total ~30 MB gz — fine for Pages.
  - `search.json` would be ~2.5 MB gz → over the 2 MB initial-load budget. Plan: don't load it on
    page load; fetch it on first focus of the search box, split into `search-core.json`
    (barcode + canonical name) and `search-aliases.json` (lazy).

## Data quirks found and handled (all from real files)

- **Unit prices:** `UnitOfMeasurePrice` is unreliable (Rami Levy labels "per 100 ml" but the value is per
  1 ml). We compute it from `Quantity` + unit text; the two chains use the fields differently
  (Rami Levy: `UnitQty=לא ידוע`, unit in `UnitOfMeasure`; Victory: unit in `UnitQty`, display unit in
  `UnitOfMeasure="גרם 100"`). ~1% of rows have no size data → no unit price shown.
- **Barcodes:** ItemType is unreliable in both directions (Victory: 1,820 type-0 items with valid GS1
  barcodes; 14 type-1 items without). We use GS1 check digit + 8–14 digits.
- **Names:** Rami Levy truncates names to 20 chars. Canonical name = name used by the most chains,
  ties → longest; the others are kept as search aliases.
- **Store ids:** price headers use `001`, Stores files `1` → normalized.
- **Many intraday versions:** portals list every version (Rami Levy 2–3 PriceFull per store per day).
  `fetch` now downloads only the newest file per store.
- **Eilat** stores are consistently cheapest (VAT-exempt). The UI should label this, or "cheapest"
  will always be Eilat for users who haven't set a city.
- **City** is a CBS settlement code at Shufersal/Rami Levy and a Hebrew name at Victory — needs the
  CBS settlement table (data.gov.il) before city filtering (M4/M6).

## Performance

The first full build took 46 min with very low CPU use, while files read from a warm cache parse in
0.13–0.24 s each. Likely cause: first reads of ~5 GB of freshly downloaded, uncompressed XML
(probably including antivirus scanning of new files). Fixed / mitigated:
- the parser now lets lxml filter `Item` elements (was visiting every field element in Python);
- `fetch` now keeps files gzip-compressed on disk (~10× fewer bytes to write, scan and read).
The 102 s figure was measured on a warm cache; the next cold run (M2 pipeline) will confirm.

## Not done yet (by design, later milestones)

Promotions (M3), city normalization (M4/M6), Stores file for chains with nested layouts beyond what's
tested, the scheduled workflow + self-hosted runner + Pages deploy (M2).
