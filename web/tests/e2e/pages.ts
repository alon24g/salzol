import { expect, type Locator, type Page } from '@playwright/test'

export class LocationBar {
  readonly label: Locator
  constructor(private page: Page) {
    this.label = page.getByTestId('location-label')
  }
  async useMyLocation() {
    await this.page.getByTestId('locate-me').click()
    await expect(this.label).toBeVisible()
  }
  async pickCity(name: string) {
    const change = this.page.getByTestId('location-change')
    if (await change.isVisible()) await change.click()
    await this.page.getByTestId('city-select').selectOption(name)
    await expect(this.label).toHaveText(name)
  }
}

export class SearchPage {
  readonly input: Locator
  readonly results: Locator
  constructor(private page: Page) {
    this.input = page.getByTestId('search-input')
    this.results = page.getByTestId('search-result')
  }
  async goto() {
    await this.page.goto('./')
  }
  async search(query: string) {
    await this.input.fill(query)
  }
  async open(resultName: string | RegExp) {
    await this.results.filter({ hasText: resultName }).first().click()
  }
}

export class ProductPage {
  readonly name: Locator
  readonly offers: Locator
  constructor(private page: Page) {
    this.name = page.getByTestId('product-name')
    this.offers = page.getByTestId('chain-offer')
  }
  async goto(barcode: string) {
    await this.page.goto(`./#/p/${barcode}`)
  }
  offer(chain: string) {
    return this.page.locator(`[data-testid="chain-offer"][data-chain="${chain}"]`)
  }
  /** Chain slugs in display order (cheapest first). */
  async chainOrder(): Promise<string[]> {
    await expect(this.offers.first()).toBeVisible()
    return this.offers.evaluateAll((els) => els.map((e) => e.getAttribute('data-chain') ?? ''))
  }
}

export class PricingSettings {
  constructor(private page: Page) {}
  private async open() {
    if (!(await this.page.getByTestId('shopping-day').isVisible())) {
      await this.page.getByTestId('pricing-settings-toggle').click()
    }
  }
  async setDay(isoDay: string) {
    await this.open()
    await this.page.getByTestId('shopping-day').fill(isoDay)
  }
  async joinClub(chain: string) {
    await this.open()
    await this.page.getByTestId(`club-${chain}`).check()
  }
}

export class Quantity {
  constructor(private page: Page) {}
  async set(n: number) {
    const value = this.page.getByTestId('qty-value')
    for (let i = Number(await value.innerText()); i < n; i++) await this.page.getByTestId('qty-plus').click()
    await expect(value).toHaveText(String(n))
  }
}

type ShareWindow = Window & { __shared?: string }

export class ListPage {
  readonly items: Locator
  constructor(private page: Page) {
    this.items = page.getByTestId('list-item')
  }
  async goto() {
    await this.page.goto('./#/list')
    await expect(this.page.getByTestId('list-page')).toBeVisible()
  }
  item(barcode: string) {
    return this.page.locator(`[data-testid="list-item"][data-barcode="${barcode}"]`)
  }
  async newList(name: string) {
    this.page.once('dialog', (d) => d.accept(name))
    await this.page.getByTestId('list-new').click()
  }
  /** Click "share" with navigator.share stubbed; returns the shared URL. */
  async shareUrl(): Promise<string> {
    await this.page.evaluate(() => {
      navigator.share = async (data?: ShareData) => {
        ;(window as ShareWindow).__shared = data?.url
      }
    })
    await this.page.getByTestId('list-share').click()
    await expect.poll(() => this.page.evaluate(() => (window as ShareWindow).__shared)).toBeTruthy()
    return (await this.page.evaluate(() => (window as ShareWindow).__shared))!
  }
}

export class ComparePage {
  readonly baskets: Locator
  constructor(private page: Page) {
    this.baskets = page.getByTestId('basket')
  }
  async goto() {
    await this.page.goto('./#/compare')
    await expect(this.page.getByTestId('compare-page')).toBeVisible()
  }
  basket(chain: string) {
    return this.page.locator(`[data-testid="basket"][data-chain="${chain}"]`)
  }
  async totals(): Promise<number[]> {
    await expect(this.baskets.first()).toBeVisible()
    return (await this.page.getByTestId('basket-total').allInnerTexts()).map(money)
  }
}

/** "‏17.90 ‏₪" → 17.9 */
export function money(text: string): number {
  return Number(text.replace(/[^\d.]/g, ''))
}
