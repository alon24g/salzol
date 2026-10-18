# M6 — Polish (2026-10-18)

## PWA and offline

- `web/public/manifest.webmanifest` (RTL, Hebrew, standalone, a shortcut to the list) and icons
  rendered from the logo by `web/scripts/make-icons.mjs`: 192, 512, maskable 512 and the Apple
  touch icon.
- Service worker `web/sw/sw.js`. The `serviceWorker` plugin in `vite.config.ts` emits it with the
  build's file list and a content hash.
  - **App shell** (page, JS, CSS, Hebrew and Latin fonts, icons): precached per build. Navigations
    go to the network first and fall back to the cached page.
  - **`data/meta.json`:** network first, with a cached copy. It is also cached when the worker
    installs, because the first page load fetches it before the worker is in control.
  - **Every other data file** is requested as `<file>?v=<meta.built_at>` (`src/lib/data.ts`), so it
    is served cache first. When `meta.json` reports a new build, older copies are deleted. A visitor
    stores only what they looked at, not all 163 MB.
  - Cache lookups use `ignoreVary`. Servers send `Vary: Origin`, and module scripts are requested
    with an Origin header, so without it nothing matched offline.
- In the background, the app saves what the shopping list's basket comparison needs: stores, each
  item's price shard and promotions. A list made at home can then be compared in the store with no
  signal.
- Offline banner. Product, search and basket pages say when something wasn't saved on the device,
  instead of the generic "loading failed".
- The installed app loads the search index at startup, so search is instant and works offline.
- Fonts are self-hosted (`@fontsource-variable` Heebo and Rubik, Hebrew and Latin subsets only).
  Google Fonts wouldn't work offline. The packages' "symbols" subset also claims emoji code points
  (🔍 💰), which would have replaced the colour emoji with plain glyphs.

## Search in a Web Worker

`src/lib/search.worker.ts` downloads and indexes the products (~214k) off the main thread, and
`searchClient.ts` sends it queries. Before this, the first search froze the page for several seconds
on a phone. Typing now stays responsive while the index loads. The ranking (`search.ts`) is
unchanged.

## Barcode scanning

The 📷 button in the search box opens `BarcodeScanner`, which uses the rear camera. It decodes with:

- the native `BarcodeDetector` when it supports EAN-13/EAN-8/UPC (Chrome on Android);
- otherwise ZXing, loaded on demand (iPhone, desktop Chrome on Windows). ZXing's `TRY_HARDER` is
  off: its rotated retry throws in `@zxing/browser` ("Could not create a Canvas element").

A detected code opens the product page. The scanner explains a blocked camera, and closing it with
the button or Esc stops the camera.

## City / near-me filter

This was already in place from M2 and M5: GPS or a city, plus radius chips (2/5/10/20 km), filter
every price and store list. M6 adds a test for a blocked location permission, which falls back to
choosing a city.

## Lighthouse (mobile, Lighthouse 13.5)

Lighthouse 12 dropped the PWA category. Installability is checked in the e2e suite instead
(`Page.getInstallabilityErrors` returns no errors).

Two fixes came out of the audit:

- **Layout shift on the home page (CLS 0.30 → 0).** The city dropdown was sized by its options, so it
  widened and wrapped onto a new line once the city list loaded. It now has a fixed width. The
  Hebrew fonts and Heebo Latin (digits) are preloaded, so the font swap no longer moves the page.
- **Footer jumping on the product page (CLS 0.20 → 0).** `<main>` now has a minimum height, so the
  footer starts below the fold while the page loads.

| Page | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Home (local preview, full data) | 98–99 | 100 | 100 | 100 |
| Product (local preview, full data) | 75 | 100 | 100 | 100 |

The local preview server doesn't compress files, so the product page downloads about 1.6 MB raw
(store list, price shard, promotion chunks). GitHub Pages gzips them. See the live numbers below.

## Tests

- Playwright: 45 tests (was 35).
  - New specs: `pwa.spec.ts` (installability, manifest, offline product and search, offline basket
    comparison, the offline message) and `scanner.spec.ts` (scan, blocked camera, camera off on close).
  - New `scanner-zxing` project: Chromium's fake camera plays a generated EAN-13 frame
    (`barcode-video.ts`), and ZXing must decode it.
  - New test for a blocked geolocation permission.
- Fixed a race the about test exposed. The search page's debounced URL update could overwrite a link
  clicked within 300 ms. It now only updates while the search page is still the route.
- Unit tests: 56. Pipeline tests: 99.

## Docs

- `README.md`: what the app does, screenshots (`docs/screenshots/`, made by
  `web/scripts/screenshots.mjs`), architecture, setup for the pipeline, app and tests, deploying a
  copy, and the self-hosted runner.
