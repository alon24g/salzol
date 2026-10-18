// Renders the PWA icons in public/ from the logo (public/favicon.svg) with Playwright's Chromium.
// Run after changing the logo: node scripts/make-icons.mjs
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const pub = path.join(import.meta.dirname, '..', 'public')
const logo = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8')
const glyph = logo.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<rect[^>]*\/>/, '')

// Full-bleed square with the glyph scaled into the maskable safe zone (inner 80%).
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#047857"/>` +
  `<g transform="translate(20 20) scale(${scale}) translate(-20 -20)">${glyph}</g></svg>`

const icons = [
  { file: 'icon-192.png', size: 192, svg: logo },
  { file: 'icon-512.png', size: 512, svg: logo },
  { file: 'icon-maskable-512.png', size: 512, svg: fullBleed(0.72) },
  { file: 'apple-touch-icon.png', size: 180, svg: fullBleed(0.86) },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const { file, size, svg } of icons) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: path.join(pub, file), omitBackground: true })
  console.log(file)
}
await browser.close()
