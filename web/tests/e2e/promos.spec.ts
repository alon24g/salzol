import { LocationBar, PricingSettings, ProductPage, Quantity } from './pages'
import { expect, test } from './test'

// Real promos from the 2026-10-13 snapshot (see pipeline/tests/test_promos.py for parsing).
const PALMOLIVE = '8850006960561' // Victory: ₪17.90 for all, ₪13.90 for "מקס ויקטורי" club
const SPELT_FLOUR = '7290002971993' // Victory: "2ב30"
const BARILLA_GF = '8076809545464' // Victory, 2 stores, Mon/Tue only: "3ב40"
const CAT_TREATS = '8595657306831' // Rami Levy: "1+1"

test.describe('promotions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./')
    await new LocationBar(page).pickCity('הרצלייה')
  })

  test('general promo is applied and the regular price shown struck through', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(PALMOLIVE)
    const victory = product.offer('victory')
    await expect(victory.getByTestId('cheapest-price')).toContainText('17.90')
    await expect(victory.getByTestId('regular-price')).toContainText('23.90')
    await expect(victory.getByTestId('promo-applied')).toContainText('חוסכים')
  })

  test('club-only promo is shown but applied only after joining the club', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(PALMOLIVE)
    const victory = product.offer('victory')
    await expect(victory.locator('[data-testid="promo-other"][data-why="club"]')).toContainText('מקס ויקטורי')
    await expect(victory.getByTestId('cheapest-price')).toContainText('17.90') // general promo only

    await new PricingSettings(page).joinClub('victory')
    await expect(victory.getByTestId('cheapest-price')).toContainText('13.90')
    await expect(victory.getByTestId('promo-applied')).toContainText('למועדון בלבד')
    await expect(victory.locator('[data-testid="promo-other"][data-why="club"]')).toHaveCount(0)
  })

  test('club membership is remembered', async ({ page }) => {
    await new PricingSettings(page).joinClub('victory')
    await page.reload()
    await expect(page.getByTestId('pricing-settings')).toContainText('ויקטורי')
  })

  test('"N for ₪X" needs the quantity: hint at 1, applied at 2', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(SPELT_FLOUR)
    const victory = product.offer('victory')
    await expect(victory.locator('[data-testid="promo-other"][data-why="min_qty"]')).toContainText('בקניית 2')

    await new Quantity(page).set(2)
    await expect(victory.getByTestId('cheapest-price')).toContainText('30.00')
    await expect(victory.getByTestId('promo-applied')).toContainText('2 ב-₪30')
  })

  test('weekday deal applies on Tuesday and not on Thursday', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(BARILLA_GF)
    await new Quantity(page).set(3)
    const victory = product.offer('victory')
    await expect(victory.getByTestId('cheapest-price')).toContainText('40.00')
    await expect(victory.getByTestId('promo-applied')).toContainText('רק בימים ב׳, ג׳')
    await expect.poll(async () => (await product.chainOrder())[0]).toBe('victory')

    await new PricingSettings(page).setDay('2026-10-15')
    await expect(page.getByTestId('shopping-day-label')).toContainText('חמישי')
    await expect(victory.getByTestId('promo-applied')).toHaveCount(0)
    await expect.poll(async () => (await product.chainOrder())[0]).not.toBe('victory')
  })

  test('shopping date cannot be in the past or beyond the data window', async ({ page }) => {
    await new PricingSettings(page).setDay('2026-10-13')
    const input = page.getByTestId('shopping-day')
    await expect(input).toHaveAttribute('min', '2026-10-13')
    await expect(input).toHaveAttribute('max', '2026-10-27')
  })

  test('1+1: second unit free', async ({ page }) => {
    const product = new ProductPage(page)
    await product.goto(CAT_TREATS)
    const rami = product.offer('rami_levy')
    const one = await rami.getByTestId('cheapest-price').innerText()
    await new Quantity(page).set(2)
    await expect(rami.getByTestId('cheapest-price')).toHaveText(one) // pay for one, get two
    await expect(rami.getByTestId('promo-applied')).toContainText('1+1')
  })
})
