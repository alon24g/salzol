import { expect, test } from './test'

test('the footer links to an About page with a per-chain health report', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('about-link').click()
  await expect(page).toHaveURL(/#\/about$/)
  const rows = page.getByTestId('health-row')
  await expect(rows).toHaveCount(3) // the fixture snapshot has 3 chains, all fresh
  await expect(page.locator('[data-testid="health-row"][data-health="ok"]')).toHaveCount(3)
  await expect(page.getByTestId('health-summary')).toContainText('3 מתוך 3')
  await expect(rows.filter({ hasText: 'שופרסל' })).toContainText('409')
})
