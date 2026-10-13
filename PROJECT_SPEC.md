# Project Spec — Israeli Supermarket Price Comparison ("SalZol" / סל זול)

> **For Claude Code:** This file is the full brief for a new project. Read it end to end before writing code.
> Work milestone by milestone (section 11). At the end of each milestone, stop, summarize what works,
> what doesn't, and what you verified against *real* data — then wait for my go-ahead.
> Never invent XML field names, URLs, or promo semantics: inspect real downloaded files first and
> base parsers on what you actually see.

---

## 1. Goal

A free web app, hosted entirely from my GitHub account, that:

1. Lets a user search any supermarket product in Israel (by name in Hebrew or by barcode).
2. Shows the price of that product in every chain/store, sorted cheapest first, **including active
   promotions** (e.g. "2 for ₪10", "30% off", club-member deals, day-specific deals).
3. Lets the user build a **shopping list** and compares the **total basket price** per chain and per
   store, so they can see where the whole list is cheapest.

**The app is in Hebrew.** Every user-facing text is Hebrew and the whole layout is RTL (see §7.0).
Only code, code comments and developer docs (README) are in English.

---

## 2. Background — where the data comes from

Under Israel's Food Sector Competition Law (חוק קידום התחרות בענף המזון, "price transparency"),
every large food chain must publish machine-readable files of its prices several times a day.
The official list of chains and their publishing URLs is on gov.il:
https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations

Each chain publishes (usually gzipped XML, sometimes zipped) files of these types:

| File type            | Content                                                        |
|----------------------|----------------------------------------------------------------|
| `Stores`             | List of branches: StoreId, name, address, city, etc.           |
| `PriceFull`          | Full price list for one store (all items)                      |
| `Price`              | Incremental price changes since last full file                 |
| `PromoFull`          | All active promotions for one store                            |
| `Promo`              | Incremental promotion changes                                  |

**Known quirks (verify against real files, don't trust this list blindly):**
- Field names differ in casing/spelling between chains (`ItemCode` vs `itemcode`, `Promotions` vs
  `Sales`, etc.). Build a normalization layer, one adapter per chain family if needed.
- Encodings vary (UTF-8, UTF-16, Windows-1255 occasionally). Detect, don't assume.
- Several chains share hosting portals (e.g. publishedprices.co.il / Cerberus, Nibit/laibcatalog).
- **Some portals block non-Israeli IP addresses.** This matters a lot for GitHub Actions (see §4).

### Use the existing open-source scraper — don't write 30 scrapers from scratch
Use **`il-supermarket-scraper`** (PyPI) from the OpenIsraeliSupermarkets project:
- https://pypi.org/project/il-supermarket-scraper/
- https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers

It covers all chains on the gov.il list. Pin an exact version in `requirements.txt`. Read its README
for current usage (the API has changed between versions — e.g. `MainScrapperRunner` in older versions,
`ScarpingTask` in newer ones) and for its env-var options such as alternative sources for Victory and
Mahsanei HaShuk. Wrap it behind our own `fetch` module so it can be swapped or patched per chain.

---

## 3. Architecture (static site + scheduled data pipeline)

GitHub Pages only serves static files, so all heavy work happens in a scheduled pipeline that
produces compact, pre-computed data files the browser can load.

```
┌─────────────────────────── GitHub Actions (cron, ~3x/day) ───────────────────────────┐
│  1. fetch     → download latest Stores / PriceFull / PromoFull via il-supermarket-scraper │
│  2. parse     → XML → normalized rows (per-chain adapters)                               │
│  3. normalize → unify items by barcode, units, unit prices                               │
│  4. promos    → parse promotions into a typed model (see §6)                             │
│  5. build     → write compact sharded JSON (or SQLite) into dist/data/                   │
│  6. deploy    → build frontend + data → deploy to GitHub Pages (actions/deploy-pages)    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
                 Static frontend (GitHub Pages) — all search & basket math in the browser
```

**Important:** Do NOT commit the daily data to the git repo (it would bloat the repo to many GB within
weeks). Deploy data as part of the Pages artifact via `actions/upload-pages-artifact` +
`actions/deploy-pages`. Optionally keep a small `last_run.json` / health report as a workflow artifact.

---

## 4. Risk to resolve FIRST — geo-blocking

Some chain portals refuse connections from outside Israel. GitHub-hosted runners are not in Israel.

**Milestone 0 must be a spike:** a workflow that tries to fetch one `Stores` + one `PriceFull` file
from *every* chain, from a GitHub-hosted runner, and outputs a table: chain → reachable? → file sizes →
error. Run the same script locally (I'm in Israel) for comparison.

Then propose the best option, likely one of:
- **A. All reachable from GitHub runners** → fully cloud pipeline. Great.
- **B. Some blocked** → a **self-hosted GitHub Actions runner** on a machine in Israel (home PC,
  Raspberry Pi, or an always-on mini PC). Document setup step by step (I'm comfortable with hardware
  and Linux). The workflow stays the same, just `runs-on: [self-hosted, israel]`.
- **C. Hybrid** → GitHub runner fetches what it can; self-hosted runner fetches the rest; merge.

Do not proceed past Milestone 0 without my decision.

---

## 5. Data model & normalization

### Item identity
- Primary key across chains = **barcode** (`ItemCode` where the item type indicates a real
  manufacturer barcode — inspect `ItemType` values in real data).
- Items with chain-internal codes (in-store bakery, deli, weighed produce, private label without
  barcode) are **not comparable across chains**. Keep them in a per-chain catalog, show them in
  search with a "available only at X" note, and exclude them from cross-chain basket totals unless
  the user manually maps them.
- Item name: names differ per chain for the same barcode. Pick a canonical display name (most common,
  or longest clean one) and store all aliases for search.

### Prices
- Store `price`, `unit_qty`, `unit_of_measure`, `unit_of_measure_price` (price per 100g / 1L / unit),
  `is_weighted`, `allow_discount`, `last_update`.
- Always show **unit price** next to price so different package sizes can be compared.
- Treat obviously broken values (0, negative, absurd outliers vs. other chains) as invalid; log them.

### Stores
- From `Stores` files: chain, sub-chain, store id, name, address, city.
- Files usually have no coordinates. Phase 1: filter by **city**. Phase 2 (optional): geocode once
  with a free geocoder at build time, cache results in a committed `stores_geo.json` (this small file
  CAN be committed), and enable "near me" via browser geolocation.

### Size budget (GitHub Pages)
Full prices × all stores is large (hundreds of stores × tens of thousands of items). Targets:
- Any single file < 50 MB (hard limit 100 MB); whole site well under 1 GB.
- Initial page load: < 2 MB of data. Load more on demand.

Suggested strategy (Claude Code: measure, then decide):
- `catalog/` — canonical items: barcode, name, aliases, brand, unit info → split into a small search
  index (names + barcode only, maybe ~5–10 MB gzipped total, possibly sharded by first letter or
  loaded lazily), plus detail shards by barcode prefix.
- `prices/` — per-barcode shards (e.g. `prices/729/0012.json`) containing, per chain: min / max /
  median price and the per-store prices **deduplicated** (many stores in a chain share the same
  price → store as price → [store ids]).
- `promos/` — per-chain promo definitions + item → promo id index.
- `stores.json`, `chains.json`, `meta.json` (build time, per-chain freshness, errors).
- Alternative to evaluate: a single SQLite DB queried in-browser with `sql.js-httpvfs` (HTTP range
  requests, only reads needed pages). Compare both approaches on real data and recommend one.

---

## 6. Promotions engine (the hard part — be careful)

Parse `PromoFull` into a typed model. Inspect real files from several chains first. Expected concepts:

```ts
type Promo = {
  id: string; chain: string; storeIds: string[];
  description: string;              // Hebrew text from the file — always show it to the user
  start: string; end: string;       // datetime
  weekdays?: number[];              // if the promo is limited to specific days (see below)
  clubOnly: boolean;                // club-member / credit-card-only deals
  clubName?: string;
  minQty?: number; maxQty?: number;
  minPurchaseAmount?: number;       // basket-level threshold
  kind: 'fixed_price' | 'percent_off' | 'amount_off' | 'n_for_price' | 'buy_x_get_y' | 'unknown';
  value: number;                    // meaning depends on kind
  itemBarcodes: string[];
  isGiftOrCoupon?: boolean;
  raw: unknown;                     // keep original for debugging
};
```

Rules:
- Compute an **effective price for a given quantity and date**. E.g. "3 for ₪10" only applies when
  the list contains ≥3 of the item(s); mixed-item promos (any 3 from a group) must be handled at
  basket level.
- **Club-only promos** are shown but clearly badged ("למועדון בלבד"), and the user can toggle
  "I'm a member of: [chain checkboxes]" — only then are they applied to totals.
- If a promo can't be confidently parsed → `kind: 'unknown'`: show the description text as a badge,
  do NOT apply it to totals.
- Never show a promo outside its validity window.

### Day-specific and non-feed deals (e.g. Victory "Meatless Monday")
Some deals may not appear in the official promo files, or may appear without structured weekday info.
1. First check real Victory promo files (and other chains) for how such deals are encoded.
2. Support a **manually curated file** `data/manual_deals.yaml` (committed, edited by me via PR),
   merged into the promo pipeline:
   ```yaml
   - chain: victory
     title: "יום שני ללא בשר"   # example — I'll fill in the real terms
     weekdays: [1]              # 0=Sunday … 6=Saturday (Israeli week)
     kind: percent_off
     value: 0                   # TODO: real value
     applies_to: { category_keywords: ["..."] }   # or explicit barcodes
     club_only: false
     source_url: "..."
     verified_on: "2026-10-13"
   ```
3. Show manual deals with a distinct badge ("מבצע שבועי") and their `verified_on` date.
4. The UI should let the user pick a **shopping date** (default: today) so weekday deals and promo
   windows are evaluated for the day they actually plan to shop.

---

## 7. Frontend features

Stack: **Vite + React + TypeScript + Tailwind**, RTL (`dir="rtl"`, logical CSS properties), Hebrew font
(e.g. Heebo or Assistant from Google Fonts). Installable **PWA** with offline cache of the last data.
Must work well on mobile — most use will be in the store or while writing a list.

### 7.1 Search
- Hebrew fuzzy search over names + aliases (e.g. MiniSearch or Fuse.js; handle final letters ך/כ ם/מ
  ן/נ ף/פ ץ/צ, niqqud stripping, common spellings).
- Exact barcode search; **camera barcode scanning** (native `BarcodeDetector` with a ZXing fallback).

### 7.2 Product page
- Product name, image if available (not in the feeds — skip or leave placeholder), size, unit price.
- Table: chain → cheapest store price, regular price, active promo price + badge, unit price,
  number of stores at that price. Expand a chain to see individual stores (filtered by my city).
- Highlight the cheapest option; show "last updated" per chain.

### 7.3 Shopping list
- Add products from search or by scanning; set quantity (units or kg for weighted items).
- Multiple named lists; stored in `localStorage`; **export/import JSON** and **share via URL**
  (compressed list in the URL hash, e.g. lz-string — no backend).

### 7.4 Basket comparison
- Inputs: list, my city (or selected stores), shopping date, my club memberships.
- Output, sorted by total:
  - Total per **chain** (using the cheapest store in my area) and per **store**.
  - Breakdown: per item regular price, promo applied, line total, savings.
  - **Missing items** count per store — never silently drop them. Offer to rank either by
    "total for available items" or "only stores that have everything".
  - Savings vs. the most expensive option.
- Stretch: "split shopping" — cheapest combination of 2 stores, with the total.
- Stretch: suggest cheaper equivalent products (same category + similar size), clearly marked as a
  suggestion, never auto-substituted.

### 7.5 Trust & transparency
- Footer/about page: data source (government price-transparency law), last update time per chain,
  chains currently failing, disclaimer that shelf prices may differ and promos may have conditions.

---

## 8. Repository structure (suggested)

```
/
├── PROJECT_SPEC.md            ← this file
├── README.md                  ← setup, how it works, how to run locally
├── pipeline/                  ← Python 3.12
│   ├── fetch.py               ← wraps il-supermarket-scraper
│   ├── parse/                 ← per-chain adapters → normalized rows
│   ├── normalize.py
│   ├── promos.py
│   ├── build.py               ← writes dist/data/*
│   ├── report.py              ← health report: per-chain status, counts, errors
│   └── tests/                 ← pytest with real (trimmed) XML fixtures from several chains
├── data/
│   ├── manual_deals.yaml
│   └── stores_geo.json        ← optional cached geocoding
├── web/                       ← Vite + React + TS
│   ├── src/
│   └── tests/e2e/             ← Playwright
└── .github/workflows/
    ├── spike-reachability.yml ← Milestone 0
    ├── pipeline.yml           ← cron + deploy
    └── ci.yml                 ← lint, unit tests, Playwright on PRs
```

---

## 9. Quality & testing

- **Pipeline:** pytest with real XML fixtures (trimmed) from at least 5 different chains/portals,
  including one gzipped UTF-16 or otherwise unusual file. Unit tests for every promo `kind` and for
  the effective-price calculation (quantity thresholds, date windows, weekdays, club-only).
- **Data sanity checks** in the pipeline: fail loudly (but still deploy the last good data) if a
  chain's item count drops > 50% vs. the previous run, or if a chain has no fresh files for > 48h.
  Publish these results in `meta.json` and show them on the About page.
- **Frontend:** Vitest for logic (basket math, promo application, Hebrew normalization) and
  **Playwright** e2e tests for the main flows: search → product page; build list → compare basket;
  share list via URL → open in new context → same list; RTL layout screenshot check on mobile viewport.
  I work in QA/automation with Playwright, so write these properly (page objects, stable
  `data-testid` selectors, no arbitrary waits).
- Lighthouse: performance & PWA scores ≥ 90 on mobile.

---

## 10. Constraints & principles

- **Zero cost**: GitHub Pages + GitHub Actions (+ optional self-hosted runner). No paid APIs, no
  backend server, no database server.
- Be polite to chain portals: sequential/limited concurrency, retries with backoff, no more than
  ~3–4 runs per day.
- No user accounts, no tracking, no analytics beyond what GitHub Pages provides.
- Secrets (if any) only in GitHub Actions secrets.
- If the pipeline fails, the site keeps serving the last good data and shows its age.

---

## 11. Milestones

Stop after each one, report, and wait for my approval.

**M0 — Reachability spike (§4).**
Deliverable: table of chain → reachable from GitHub runner / from local, file sizes, item counts,
sample of real field names per chain. Recommendation on runner setup.

**M1 — Pipeline for 3 chains end to end.**
Pick 3 chains on different portals (suggest: Shufersal, Rami Levy, Victory). Fetch → parse → normalize
→ build JSON. Report real sizes and propose the final storage format (§5 size budget).

**M2 — Minimal frontend.**
Search + product page with prices across the 3 chains. Deployed to GitHub Pages from the workflow.

**M3 — Promotions.**
Promo parsing for the 3 chains, effective price, badges, club-member toggle, shopping date,
`manual_deals.yaml` support. Tests for every promo kind found in real data.

**M4 — Shopping list + basket comparison.**
Lists, localStorage, export/import, share URL, basket totals by chain and store, missing items.

**M5 — All chains.**
Extend to every chain the scraper supports and that is reachable. Health report + About page.

**M6 — Polish.**
PWA/offline, barcode scanning, city/near-me filter, Playwright suite complete, Lighthouse ≥ 90,
README with screenshots and setup guide (including self-hosted runner, if used).

**Stretch:** split-basket optimization, cheaper-alternative suggestions, price history chart
(would need a small history store — propose a design that respects the size limits).

---

## 12. Open questions for me (ask when relevant, don't guess)

- Final app name and GitHub repo name.
- Which chains I'm a club member of (for default toggles).
- My default city.
- Real terms of the Victory weekday deal and any other manual deals to seed `manual_deals.yaml`.
