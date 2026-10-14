import { expect, test } from './test'
import { LocationBar, ProductPage, SearchPage } from './pages'

// Fixture: real data snapshot from 2026-10-13 (Shufersal, Rami Levy, Victory; Eilat excluded).
const MILK = '7290116936291' // חלב תנובה 3% שומן 2 ליטר
const TEL_AVIV = { latitude: 32.0853, longitude: 34.7818 }

test.describe('search → product', () => {
  test('finds a product by Hebrew name and opens its page', async ({ page }) => {
    const search = new SearchPage(page)
    await search.goto()
    await search.search('חלב תנובה 2 ליטר')
    await expect(search.results).toHaveCount(1)
    await search.open('חלב תנובה 3% שומן 2 ליטר')

    const product = new ProductPage(page)
    await expect(product.name).toHaveText('חלב תנובה 3% שומן 2 ליטר')
    await expect(product.offers).toHaveCount(3)
  })

  test('prefix and final-letter tolerant search', async ({ page }) => {
    const search = new SearchPage(page)
    await search.goto()
    await search.search('במב בוטני') // prefixes; "בוטני" must match "בוטנים"
    // identify by barcode: display names drift as chains rename items
    await expect(search.results.filter({ hasText: '7290000066318' })).toHaveCount(1) // במבה בוטנים אסם
  })

  test('exact barcode search, including a zero-padded code', async ({ page }) => {
    const search = new SearchPage(page)
    await search.goto()
    await search.search(`0${MILK}`)
    await expect(search.results).toHaveCount(1)
    await expect(search.results).toContainText('חלב תנובה')
  })

  test('unknown product shows an empty state', async ({ page }) => {
    const search = new SearchPage(page)
    await search.goto()
    await search.search('מוצרשלאקיים')
    await expect(page.getByTestId('search-empty')).toBeVisible()
  })
})

test.describe('cheapest near me', () => {
  test.use({ geolocation: TEL_AVIV, permissions: ['geolocation'] })

  test('ranks chains by the cheapest store near me (5 km by default)', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(MILK)
    await new LocationBar(page).useMyLocation()

    expect(await product.chainOrder()).toEqual(['rami_levy', 'shufersal', 'victory'])
    const best = product.offer('rami_levy')
    await expect(best.getByTestId('cheapest-badge')).toBeVisible()
    await expect(best.getByTestId('cheapest-price')).toContainText('14.40')
    await expect(best.getByTestId('unit-price')).toContainText('100 מ"ל')
  })

  test('store list only contains stores in range, cheapest first', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(MILK)
    await new LocationBar(page).useMyLocation()

    const offer = product.offer('rami_levy')
    await offer.getByTestId('toggle-stores').click()
    const rows = offer.getByTestId('store-list').locator('li')
    await expect(rows.first()).toBeVisible()
    const kms = (await rows.allInnerTexts()).map((t) => Number(/~?([\d.]+) ק"מ/.exec(t)?.[1] ?? 0))
    expect(Math.max(...kms)).toBeLessThanOrEqual(5)
    await expect(offer).not.toContainText('ירושלים')
  })

  test('location persists across reloads', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(MILK)
    await new LocationBar(page).useMyLocation()
    await page.reload()
    await expect(page.getByTestId('location-label')).toHaveText('המיקום שלי')
  })
})

test.describe('manual city & nationwide view', () => {
  test('without a location, shows a nationwide note', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(MILK)
    await expect(page.getByTestId('no-place-note')).toBeVisible()
    await expect(product.offers).toHaveCount(3)
  })

  test('picking a city recomputes nearby prices', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(MILK)
    await new LocationBar(page).pickCity('ירושלים')
    await expect(page.getByTestId('no-place-note')).toBeHidden()
    for (const store of await page.getByTestId('cheapest-store').allInnerTexts()) {
      expect(store).not.toContain('תל אביב')
    }
  })

  test('Eilat is excluded from data (VAT-exempt)', async ({ page }) => {
    await new SearchPage(page).goto()
    await expect(page.getByTestId('city-select').locator('option', { hasText: 'אילת' })).toHaveCount(0)
  })

  test('unknown barcode deep link shows not-found', async ({ page }) => {
    await new ProductPage(page).goto('7290000000001')
    await expect(page.getByTestId('product-not-found')).toBeVisible()
  })
})

test.describe('near me radius', () => {
  test('the radius can be narrowed and widened, and is remembered', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(MILK)
    const location = new LocationBar(page)
    await location.pickCity('הרצלייה')
    await expect(page.getByTestId('radius-5')).toHaveAttribute('aria-pressed', 'true')

    const storeCount = async () => {
      const offer = product.offers.first()
      if ((await offer.getByTestId('toggle-stores').count()) === 0) return 1
      return Number(/\((\d+)\)/.exec(await offer.getByTestId('toggle-stores').innerText())?.[1])
    }
    await location.setRadius(2)
    const near = await storeCount()
    await location.setRadius(20)
    await expect.poll(storeCount).toBeGreaterThan(near)

    await page.reload()
    await expect(page.getByTestId('radius-20')).toHaveAttribute('aria-pressed', 'true')
  })

  test('a chain with no store in range says how far its nearest store is and offers to widen', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto('8595657306831') // Rami Levy cat treats: not sold at every store
    const location = new LocationBar(page)
    await location.pickCity('הרצלייה')
    await location.setRadius(2)
    const out = page.getByTestId('out-of-range').filter({ has: page.getByTestId('widen-radius') }).first()
    await expect(out).toContainText('הקרוב ביותר')
    await out.getByTestId('widen-radius').click()
    await expect(page.getByTestId('radius-2')).toHaveAttribute('aria-pressed', 'false')
  })
})

test('each chain links to its online store, searching for the product', async ({ page }) => {
  const product = new ProductPage(page)
  await product.goto(MILK)
  const link = (chain: string) => product.offer(chain).getByTestId('chain-site-link')
  await expect(link('shufersal')).toHaveAttribute('href', /^https:\/\/www\.shufersal\.co\.il\/online\/he\/search\?text=/)
  await expect(link('rami_levy')).toHaveAttribute('href', /^https:\/\/www\.rami-levy\.co\.il\/he\/online\/search\?q=/)
  await expect(link('victory')).toHaveAttribute('href', `https://www.victoryonline.co.il/search/${MILK}`)
  await expect(link('victory')).toHaveAttribute('target', '_blank')
})

test('home page welcomes and quick searches work', async ({ page }) => {
  await new SearchPage(page).goto()
  await expect(page.getByTestId('hero')).toBeVisible()
  await expect(page.getByTestId('how-it-works').locator('li')).toHaveCount(3)
  await page.getByTestId('quick-search').filter({ hasText: 'במבה' }).click()
  await expect(page.getByTestId('search-input')).toHaveValue('במבה')
  await expect(page.getByTestId('search-result').first()).toContainText('במבה')
  await expect(page.getByTestId('hero')).toBeHidden()
})

test('layout is right-to-left Hebrew', async ({ page }) => {
  await new SearchPage(page).goto()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
})
