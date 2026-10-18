import type { Page } from '@playwright/test'
import { ComparePage, ListPage, LocationBar, PricingSettings, ProductPage, Quantity, SearchPage, money } from './pages'
import { SNAPSHOT_NOW, expect, test } from './test'

const MILK = '7290116936291'
const SPELT_FLOUR = '7290002971993' // Victory "2ב30"
const PALMOLIVE = '8850006960561' // Victory ₪17.90, club ₪13.90
const CAT_TREATS = '8595657306831' // Rami Levy "1+1"; not sold at every store
const PASTA = '8076809545464'

async function addViaProductPage(page: Page, barcode: string, qty: number) {
  await new ProductPage(page).goto(barcode)
  await new Quantity(page).set(qty)
  await page.getByTestId('product-add-to-list').click()
  await expect(page.getByTestId('product-in-list')).toBeVisible()
}

test.describe('shopping list', () => {
  test('add from search, change quantity, remove', async ({ page }) => {
    const search = new SearchPage(page)
    await search.goto()
    await search.search('חלב תנובה 2 ליטר')
    await page.getByTestId('add-to-list').first().click()
    await expect(page.getByTestId('add-to-list').first()).toContainText('ברשימה')
    await expect(page.getByTestId('nav-list-count')).toHaveText('1')

    const list = new ListPage(page)
    await list.goto()
    await expect(list.items).toHaveCount(1)
    await list.item(MILK).getByTestId('qty-plus').click()
    await expect(list.item(MILK).getByTestId('qty-value')).toHaveText('2')
    await list.item(MILK).getByTestId('list-item-remove').click()
    await expect(page.getByTestId('list-empty')).toBeVisible()
  })

  test('adding the same product again adds up the quantity; the list survives a reload', async ({ page }) => {
    await addViaProductPage(page, MILK, 2)
    await page.getByTestId('product-add-to-list').click()
    await page.reload()
    const list = new ListPage(page)
    await list.goto()
    await expect(list.item(MILK).getByTestId('qty-value')).toHaveText('4')
  })

  test('several named lists', async ({ page }) => {
    await addViaProductPage(page, MILK, 1)
    const list = new ListPage(page)
    await list.goto()
    await list.newList('מסיבה')
    await expect(page.getByTestId('list-select')).toContainText('מסיבה')
    await expect(page.getByTestId('list-empty')).toBeVisible()
    await page.getByTestId('list-select').selectOption({ label: 'הרשימה שלי (1)' })
    await expect(list.items).toHaveCount(1)
  })
})

test.describe('basket comparison', () => {
  test.beforeEach(async ({ page }) => {
    await addViaProductPage(page, MILK, 2)
    await addViaProductPage(page, SPELT_FLOUR, 2)
    await addViaProductPage(page, PALMOLIVE, 1)
    const location = new LocationBar(page)
    await location.pickCity('הרצלייה')
    await location.setRadius(20)
  })

  test('stores that have everything, cheapest first, with savings vs. the most expensive', async ({ page }) => {
    const compare = new ComparePage(page)
    await compare.goto()
    await page.getByTestId('view-stores').click()
    await expect.poll(async () => (await compare.totals()).length).toBeGreaterThan(1)
    const totals = await compare.totals()
    expect([...totals].sort((a, b) => a - b)).toEqual(totals)
    // Every store tied with the cheapest gets the badge (unless all cost the same).
    const tied = totals.filter((t) => t === totals[0]).length
    await expect(page.getByTestId('basket-best')).toHaveCount(tied < totals.length ? tied : 0)
    if (totals[0] < totals[totals.length - 1]) {
      await expect(compare.baskets.first().getByTestId('basket-vs-max')).toBeVisible()
    }
  })

  test('"all stores" ranks fewest missing items first, and never claims savings for incomplete baskets', async ({ page }) => {
    const compare = new ComparePage(page)
    await compare.goto()
    await page.getByTestId('mode-available').click()
    await expect.poll(async () => (await compare.totals()).length).toBeGreaterThan(1)
    const missing = await compare.baskets.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-missing'))))
    expect([...missing].sort((a, b) => a - b)).toEqual(missing)
    await expect(page.locator('[data-testid="basket"]:not([data-missing="0"]) [data-testid="basket-vs-max"]')).toHaveCount(0)
  })

  test('breakdown lists each product with its promo', async ({ page }) => {
    const compare = new ComparePage(page)
    await compare.goto()
    const victory = compare.basket('victory')
    await victory.getByTestId('basket-toggle').click()
    await expect(victory.getByTestId('basket-line')).toHaveCount(3)
    await expect(victory.getByTestId('basket-lines')).toContainText('2 ב-₪30') // spelt flour ×2
    await expect(victory.getByTestId('basket-savings')).toBeVisible()
  })

  test('club membership changes the basket total', async ({ page }) => {
    const compare = new ComparePage(page)
    await compare.goto()
    const total = () => compare.basket('victory').getByTestId('basket-total').innerText().then(money)
    const before = await total()
    await new PricingSettings(page).joinClub('victory')
    await expect.poll(total).toBeCloseTo(before - 4, 2) // Palmolive ₪17.90 → ₪13.90
  })

  test('"complete only" vs "all stores": missing items are counted, never dropped', async ({ page }) => {
    await addViaProductPage(page, CAT_TREATS, 2)
    const compare = new ComparePage(page)
    await compare.goto()
    await page.getByTestId('view-stores').click()
    await expect(compare.baskets.first()).toBeVisible()
    const missing = () => compare.baskets.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-missing'))))
    expect((await missing()).every((m) => m === 0)).toBe(true)

    await page.getByTestId('mode-available').click()
    await expect.poll(async () => (await missing()).some((m) => m > 0)).toBe(true)
    await expect(page.getByTestId('basket-missing').first()).toContainText('חסרים')
  })

})

test.describe('split shopping', () => {
  async function compareInHaifa(page: Page, items: string[]) {
    for (const barcode of items) await addViaProductPage(page, barcode, 1)
    const location = new LocationBar(page)
    await location.pickCity('חיפה')
    await location.setRadius(20)
    const compare = new ComparePage(page)
    await compare.goto()
    return compare
  }

  test('two stores beat the cheapest single store; each item is bought once', async ({ page }) => {
    const compare = await compareInHaifa(page, [PASTA, PALMOLIVE, CAT_TREATS])
    const split = page.getByTestId('split')
    // Right after the cheapest single store, which stays the main answer.
    await expect(page.locator('[data-testid="compare-results"] > li').nth(1).getByTestId('split')).toBeVisible()

    const best = money(await compare.baskets.first().getByTestId('basket-total').innerText())
    const total = money(await split.getByTestId('split-total').innerText())
    expect(best - total).toBeGreaterThanOrEqual(5)
    await expect(split.getByTestId('split-why')).toContainText('פחות מהסניף הזול ביותר')

    await expect(split.getByTestId('split-part')).toHaveCount(2)
    const parts = (await split.getByTestId('split-part-total').allInnerTexts()).map(money)
    expect(parts[0] + parts[1]).toBeCloseTo(total, 2)
    const bought = await split.getByTestId('split-line').locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
    expect(bought.sort()).toEqual([PASTA, PALMOLIVE, CAT_TREATS].map((b) => `#/p/${b}`).sort())
  })

  test('no store has everything, but two stores together do', async ({ page }) => {
    await compareInHaifa(page, [CAT_TREATS, SPELT_FLOUR])
    await expect(page.getByTestId('compare-no-results')).toBeVisible()
    const split = page.getByTestId('split')
    await expect(split.getByTestId('split-why')).toHaveText('יחד יש בהם את כל המוצרים ברשימה')
    await expect(split.getByTestId('split-line')).toHaveCount(2)
    await expect(split.getByTestId('split-missing')).toHaveCount(0)
  })
})

test.describe('sharing', () => {
  test('share via URL → open in a new browser context → same list', async ({ page, browser }) => {
    await addViaProductPage(page, MILK, 2)
    await addViaProductPage(page, CAT_TREATS, 3)
    const list = new ListPage(page)
    await list.goto()
    const url = await list.shareUrl()
    expect(url).toContain('#/share/')

    const other = await browser.newContext()
    try {
      const page2 = await other.newPage()
      await page2.clock.setFixedTime(SNAPSHOT_NOW)
      await page2.goto(url)
      await expect(page2.getByTestId('share-items').locator('li')).toHaveCount(2)
      await page2.getByTestId('share-save').click()
      const list2 = new ListPage(page2)
      await expect(list2.item(MILK).getByTestId('qty-value')).toHaveText('2')
      await expect(list2.item(CAT_TREATS).getByTestId('qty-value')).toHaveText('3')
      await expect(list2.item(MILK)).toContainText('חלב תנובה')
    } finally {
      await other.close()
    }
  })

  test('a broken share link is reported', async ({ page }) => {
    await page.goto('./#/share/garbage')
    await expect(page.getByTestId('share-invalid')).toBeVisible()
  })

  test('export to a file and import it in another browser', async ({ page, browser }, testInfo) => {
    await addViaProductPage(page, PALMOLIVE, 1)
    const list = new ListPage(page)
    await list.goto()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('list-export').click()])
    const file = testInfo.outputPath('list.json')
    await download.saveAs(file)

    const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    try {
      const page2 = await other.newPage()
      await page2.goto('./#/list')
      await page2.getByTestId('list-import').setInputFiles(file)
      await expect(page2.getByTestId('list-message')).toContainText('יובאה')
      await expect(new ListPage(page2).item(PALMOLIVE)).toBeVisible()
    } finally {
      await other.close()
    }
  })
})
