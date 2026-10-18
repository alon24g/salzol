import { expect, test } from './test'
import { ComparePage, LocationBar, ProductPage, SearchPage } from './pages'

const MILK = '7290116936291' // חלב תנובה 3% שומן 2 ליטר
const BAMBA = '7290000066318' // במבה בוטנים אסם

test.describe('installable app', () => {
  test('Chromium finds no installability errors', async ({ page }) => {
    await page.goto('./')
    await page.evaluate(() => navigator.serviceWorker.ready)
    const cdp = await page.context().newCDPSession(page)
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
    expect(installabilityErrors).toEqual([])
  })

  test('the manifest names the app and its icons exist', async ({ page, request }) => {
    await page.goto('./')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    const manifestUrl = new URL(href!, page.url())
    const manifest = await (await request.get(manifestUrl.href)).json()
    expect(manifest.short_name).toBe('סל זול')
    expect(manifest.dir).toBe('rtl')
    for (const icon of manifest.icons) {
      expect((await request.get(new URL(icon.src, manifestUrl).href)).ok(), icon.src).toBe(true)
    }
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  })
})

test.describe('offline', () => {
  test('pages and data seen online keep working offline', async ({ page, context }) => {
    // First visit online: the service worker installs and takes control.
    const search = new SearchPage(page)
    await search.goto()
    await waitForServiceWorker(page)
    await search.search('חלב תנובה 2 ליטר')
    await search.open('חלב תנובה 3% שומן 2 ליטר')
    const product = new ProductPage(page)
    await expect(product.offers.first()).toBeVisible()

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByTestId('offline-banner')).toBeVisible()
    await expect(product.name).toHaveText('חלב תנובה 3% שומן 2 ליטר')
    await expect(product.offers).toHaveCount(3)

    // Search works offline: its index was saved on the first visit.
    await search.goto()
    await search.search(BAMBA)
    await expect(search.results).toHaveCount(1)

    // A product whose prices were never loaded explains why it can't be shown.
    await product.goto('7290000000001')
    await expect(page.getByTestId('product-error')).toContainText('אין חיבור לאינטרנט')

    await context.setOffline(false)
    await product.goto(MILK)
    await expect(page.getByTestId('offline-banner')).toBeHidden()
  })

  test('a list made online can be compared in the store without a connection', async ({ page, context }) => {
    const search = new SearchPage(page)
    await search.goto()
    await waitForServiceWorker(page)
    await new LocationBar(page).pickCity('הרצלייה')
    for (const barcode of [MILK, BAMBA]) {
      await search.search(barcode)
      await search.results.first().locator('..').getByTestId('add-to-list').click()
      await expect(page.getByTestId('nav-list-count')).toBeVisible()
    }
    await expect(page.getByTestId('nav-list-count')).toHaveText('2')
    // The app saves what the comparison needs in the background (never opened online here).
    await expect.poll(() => page.evaluate(() => caches.match(`${location.pathname}data/stores.json`, { ignoreSearch: true }).then(Boolean))).toBe(true)

    await context.setOffline(true)
    const compare = new ComparePage(page)
    await compare.goto()
    await expect(page.getByTestId('offline-banner')).toBeVisible()
    expect((await compare.totals()).length).toBeGreaterThan(0)
  })

  test('without saved data, search says it needs a connection', async ({ page, context }) => {
    await page.goto('./')
    await waitForServiceWorker(page)
    await context.setOffline(true)
    await new SearchPage(page).search('חלב')
    await expect(page.getByTestId('search-error')).toContainText('אין חיבור לאינטרנט')
  })
})

async function waitForServiceWorker(page: import('@playwright/test').Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}
