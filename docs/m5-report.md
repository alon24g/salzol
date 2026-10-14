# M5 — All chains (2026-10-14)

Every chain `il-supermarket-scraper==1.0.8` supports is in `CHAINS` (pipeline/build.py), except
WOLT (online-only dark stores) and MESHMAT_YOSEF_1 (Mishnat Yosef's web shop, an empty price file;
its physical stores are MESHMAT_YOSEF_2). 31 chains; 30 with data. NETIV_HASED's portal returns
HTTP 500 (as in M0) and shows as "no data" on the About page.

## Where each chain is fetched

- GitHub-hosted, `pipeline.yml` job `fetch`, 5 parallel matrix groups by portal (shufersal,
  cerberus-a, cerberus-b, bina, other). Each uploads `raw-cloud-<group>`; `build` merges them and
  runs even if a group failed.
- Home runner, `fetch-israel.yml`: Victory, Hazi Hinam, H. Cohen, Mahsanei HaShuk, Super-Pharm
  (geo-blocked). `pipeline.yml` now takes **each chain** from the newest artifact (≤ 48 h) that has
  price files for it, and `--require-prices` only fails when every chain is empty.

## Fixes found on real files

1. **Scraper status file (Windows):** upstream rewrites `status/<chain>.json` once per listed file
   (O(n²)); for Carrefour (thousands of files) this failed with `[Errno 22] Invalid argument` and
   aborted the chain. `fetch.py` now passes an in-memory status DB. Fetching also got much faster.
2. **Bina promos:** `GroupID` is zero-padded (`001`), so every group was treated as a reward
   group and dropped → 0 promos for 10 chains.
3. **Flat promo layout (City Market):** deal fields on `<Promotion>`, items as `<Item>`, coupon and
   club nested in `AdditionalRestrictions` / `Clubs`, dates split into `…Date` + `…Hour`.
4. **Carrefour store ids:** 54 price files carry a StoreId (e.g. 103) that differs from the file
   name and the Stores file (400). `file_store_key` falls back to the file-name number.
5. **Store locations:** abbreviations (ת"א, פ"ת, ראשל"צ…), spelling variants (נהריה, יוקנעם,
   סכנין) and neighborhoods (יד אליהו, חוצות המפרץ…) → unlocated stores 106 → 30 of 2,174.

## Sizes (local build on 2026-10-13/14 files)

| | M4 (3 chains) | M5 (30 chains) |
|---|---|---|
| Products with a barcode | 55,774 | 213,978 |
| …sold by 2+ chains | 14,325 | 72,110 |
| Stores | ~575 | 2,174 |
| `search.json` gz | 1.2 MB | 5.3 MB (aliases reduced to the words they add; was 7.0) |
| Price shards | 256, ~19 KB gz | 1,024, ~24 KB gz each (count in `meta.json`) |
| Promos gz (all chains) | 0.6 MB | 2.6 MB |
| Whole `data/` | — | 163 MB |
| Build time / peak RAM (home PC) | ~3 min | ~14 min / ~1.5 GB |

First search on real data: ~3 s on a desktop (download + indexing 214k products); later searches
~20 ms. On a phone over 4G expect several seconds; sharding the index is an M6 candidate.

## Web

- Product page shows the 5 cheapest chains, "show all N chains", up to 3 "nearest branch is X km"
  notes, and one line for chains only beyond 20 km.
- Basket comparison by chain shows 10, then "show all".
- About page (`#/about`) with a per-chain health report (fresh / > 48 h / no data, stores, last
  update); the footer links to it and names chains without data.
