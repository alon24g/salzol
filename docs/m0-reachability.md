# M0 — Chain reachability spike (2026-10-13)

Scraper: `il-supermarket-scraper==1.0.8`. One Stores + one PriceFull file per chain, fetched sequentially.
- **Local**: home PC in Israel (Windows, no-op `fcntl` shim).
- **GitHub**: `ubuntu-latest` hosted runner, egress IP in Des Moines, US (AS8075 Microsoft).
  Run: https://github.com/alon24g/salzol/actions/runs/38373310803

Sizes are uncompressed XML for one store's PriceFull file.

| Chain | Local (IL) | GitHub (US) | PriceFull size | Items | Container / encoding | Notes |
|---|---|---|---|---|---|---|
| BAREKET | ✅ | ✅ | 2.7 MB | 3356 | gzip / declared:utf-8 |  |
| YAYNO_BITAN_AND_CARREFOUR | ✅ | ✅ | 5.0 MB | 6020 | plain / utf-8-sig |  |
| CITY_MARKET_KIRYATGAT | ✅ | ✅ | 3.6 MB | 4346 | gzip / declared:utf-8 |  |
| CITY_MARKET_SHOPS | ✅ | ✅ | 0.0 MB | 1 | plain / declared:utf-8 | latest PriceFull picked was a 1-item file; check in M5 |
| DOR_ALON | ✅ | ✅ | 4.2 MB | 5081 | plain / utf-8-sig |  |
| GOOD_PHARM | ✅ | ✅ | 3.0 MB | 3377 | gzip / declared:utf-8 |  |
| HAZI_HINAM | ✅ | ❌ | 0.5 MB | 607 | plain / utf-8-sig | GH: 403 Cloudflare challenge |
| HET_COHEN_NEW_SOURCE | ✅ | ❌ | 7.1 MB | 8934 | plain / utf-8 (undeclared) | GH: TCP connect timeout (laibcatalog) |
| KESHET | ✅ | ✅ | 1.9 MB | 2365 | plain / utf-8-sig |  |
| KING_STORE | ✅ | ✅ | 2.0 MB | 2341 | gzip / declared:utf-8 |  |
| MAAYAN_2000 | ✅ | ✅ | 2.3 MB | 2703 | gzip / declared:utf-8 |  |
| MAHSANI_ASHUK_NEW_SOURCE | ✅ | ❌ | 10.0 MB | 12401 | plain / utf-8 (undeclared) | GH: TCP connect timeout (laibcatalog) |
| NETIV_HASED | ❌ | ❌ | - | - | - / - | portal returns HTTP 500 everywhere (known upstream) |
| MESHMAT_YOSEF_1 | ✅ | ✅ | 0.1 MB | 195 | plain / declared:utf-8 |  |
| MESHMAT_YOSEF_2 | ✅ | ✅ | 4.5 MB | 5495 | gzip / declared:utf-8 |  |
| OSHER_AD | ✅ | ✅ | 5.5 MB | 6595 | plain / utf-8-sig |  |
| POLIZER | ✅ | ✅ | 8.9 MB | 10663 | plain / utf-8-sig |  |
| RAMI_LEVY | ✅ | ✅ | 10.8 MB | 12965 | plain / utf-8-sig |  |
| SALACH_DABACH | ✅ | ✅ | 10.4 MB | 12510 | plain / utf-8-sig |  |
| SHEFA_BARCART_ASHEM | ✅ | ✅ | 3.0 MB | 3679 | gzip / declared:utf-8 |  |
| SHUFERSAL | ✅ | ✅ | 5.4 MB | 6589 | plain / utf-8-sig |  |
| SHUK_AHIR | ✅ | ✅ | 1.5 MB | 1819 | gzip / declared:utf-8 |  |
| STOP_MARKET | ✅ | ✅ | 11.3 MB | 13539 | plain / utf-8-sig |  |
| SUPER_PHARM | ✅ | ❌ | 7.6 MB | 9006 | plain / utf-8 (undeclared) | GH: status 247 JS bot challenge |
| SUPER_YUDA | ✅ | ✅ | 4.7 MB | 5690 | plain / utf-8-sig |  |
| SUPER_SAPIR | ✅ | ✅ | 0.9 MB | 1146 | gzip / declared:utf-8 |  |
| FRESH_MARKET_AND_SUPER_DOSH | ✅ | ✅ | 8.3 MB | 10026 | plain / utf-8-sig |  |
| TIV_TAAM | ✅ | ✅ | 17.7 MB | 21567 | plain / utf-8-sig |  |
| VICTORY_NEW_SOURCE | ✅ | ❌ | 7.1 MB | 8720 | plain / utf-8 (undeclared) | GH: TCP connect timeout (laibcatalog) |
| YELLOW | ✅ | ✅ | 0.4 MB | 508 | plain / utf-8-sig |  |
| YOHANANOF | ✅ | ✅ | 8.5 MB | 10775 | plain / utf-8-sig |  |
| ZOL_VEBEGADOL | ✅ | ✅ | 3.5 MB | 4264 | gzip / declared:utf-8 |  |
| WOLT | ✅ | ✅ | 4.0 MB | 5984 | plain / declared:utf-8 |  |

**Totals:** local 32/33, GitHub 27/33.

## Upstream scraper bugs found (patched in our wrapper, not in site-packages)

1. **All 10 Bina chains** (binaprojects.com) silently list 0 files: the portal now 302-redirects
   `http://` → `https://` and the listing call doesn't follow it. Fix: rewrite `scraper.url` to https.
2. Bina serves `.GZ` (upper case) — the scraper doesn't decompress it and saves raw gzip with no
   extension. Fix: detect gzip/zip by magic bytes in our parse layer.
3. The package imports `fcntl` (Unix-only), so it can't run natively on Windows.

## Schema findings (real files)

- **PriceFull**: 27/32 chains share one exact shape (`Root/…/Item` with `ItemCode, ItemType, ItemName,
  ManufactureName, UnitQty, Quantity, UnitOfMeasure, bIsWeighted, QtyInPackage, ItemPrice,
  UnitOfMeasurePrice, AllowDiscount, ItemStatus, PriceUpdateTime…`). 5 variants only rename fields:
  `ItemNm`, `ManufacturerName`, `ManufacturerItemDescription`, `PriceUpdateDate`, Wolt's typo
  `blsWeighted` (lower-case L), Meshnat Yosef 1 has no weighted flag, CITY_MARKET_SHOPS uses root `root`.
  → One parser with a field-alias table, not one adapter per chain.
- **Stores**: `ZIPCode` vs `ZipCode`; Shufersal root is `Chain`; CITY_MARKET_SHOPS uses
  `SubChainStoreXMLObject` nesting.
- **City** is a CBS settlement **code** in some chains (Shufersal, Rami Levy, King Store: `3000`, `0`=unknown)
  and a **Hebrew name** in others (Victory, Wolt). Needs the CBS settlement table to normalize.
- **ItemType=1 is not a guarantee of a real barcode**: King Store marks every item type 1 but 98/2341 have
  short internal codes. Victory uses type 0 for 1092 items. Barcode detection = ItemType + length (≥8) + GS1 check digit.
- Encodings seen: UTF-8 with BOM, UTF-8 declared, UTF-8 undeclared. No UTF-16/cp1255 in this sample
  (only PriceFull+Stores; PromoFull not yet inspected).
