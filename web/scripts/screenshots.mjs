// README screenshots (docs/screenshots/) from a running preview with real data:
//   npm run build && npx vite preview --port 4180   (serves ../dist/data)
//   node scripts/screenshots.mjs [baseUrl]
import path from 'node:path'
import { chromium, devices } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:4180/salzol/'
const out = path.join(import.meta.dirname, '..', '..', 'docs', 'screenshots')
const MILK = '7290116936291'
const LIST = ['7290116936291', '7290000066318', '7290002971993', '8850006960561']

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'he-IL' })
await context.addInitScript(() => {
  localStorage.setItem('salzol.place', JSON.stringify({ label: 'תל אביב -יפו', lat: 32.0853, lon: 34.7818, source: 'city' }))
})
const page = await context.newPage()
const shot = async (name) => {
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  console.log(name)
}

await page.goto(base)
await shot('home')

await page.getByTestId('search-input').fill('במבה')
await page.getByTestId('search-result').first().waitFor()
await shot('search')

await page.goto(`${base}#/p/${MILK}`)
await page.getByTestId('chain-offer').first().waitFor()
await shot('product')

for (const barcode of LIST) {
  await page.goto(`${base}#/p/${barcode}`)
  await page.getByTestId('product-add-to-list').click()
  await page.getByTestId('product-in-list').waitFor()
}
await page.goto(`${base}#/compare`)
await page.getByTestId('basket').first().waitFor()
await shot('compare')

await page.goto(`${base}#/about`)
await page.getByTestId('health-row').first().waitFor()
await page.getByTestId('health-report').scrollIntoViewIfNeeded()
await shot('about')

await browser.close()
