import { test as base } from '@playwright/test'

/** The fixture data is a real snapshot built on 2026-10-13. Freeze the browser clock to that
 *  day (a Tuesday) so promo windows, weekday deals and "today" stay valid forever. */
export const SNAPSHOT_NOW = new Date('2026-10-13T10:00:00')

export const test = base.extend({
  page: async ({ page }, runTest) => {
    await page.clock.setFixedTime(SNAPSHOT_NOW)
    await runTest(page)
  },
})

export { expect } from '@playwright/test'
