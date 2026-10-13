import { expect, test } from '@playwright/test'
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
    await expect(search.results.filter({ hasText: 'במבה חטיף בוטנים אסם 80 גרם' })).toHaveCount(1)
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

  test('ranks chains by the cheapest store within 20 km', async ({ page }) => {
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
    expect(Math.max(...kms)).toBeLessThanOrEqual(20)
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

test('layout is right-to-left Hebrew', async ({ page }) => {
  await new SearchPage(page).goto()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
})
