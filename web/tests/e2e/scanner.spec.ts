import { expect, test } from './test'
import { ProductPage } from './pages'

const MILK = '7290116936291' // חלב תנובה 3% שומן 2 ליטר

type TestWindow = Window & { BarcodeDetector?: unknown; __detectCalls?: number; __stream?: MediaStream }

// The camera is Chromium's fake device (see playwright.config.ts). On Android the native
// BarcodeDetector reads it; here a stand-in reports the milk barcode on the third frame.
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['camera'])
  await page.addInitScript((barcode) => {
    const w = window as TestWindow
    w.__detectCalls = 0
    w.BarcodeDetector = class {
      static async getSupportedFormats() {
        return ['ean_13', 'ean_8', 'qr_code']
      }
      async detect() {
        w.__detectCalls = (w.__detectCalls ?? 0) + 1
        return w.__detectCalls >= 3 ? [{ rawValue: barcode, format: 'ean_13' }] : []
      }
    }
  }, MILK)
})

test('scanning a barcode opens the product', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('scan-barcode').click()
  await expect(page).toHaveURL(new RegExp(`#/p/${MILK}$`))
  await expect(page.getByTestId('barcode-scanner')).toBeHidden()
  await expect(new ProductPage(page).name).toHaveText('חלב תנובה 3% שומן 2 ליטר')
})

test('the scanner explains a blocked camera and can be closed', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
  })
  await page.goto('./')
  await page.getByTestId('scan-barcode').click()
  await expect(page.getByTestId('scanner-status')).toHaveAttribute('data-status', 'denied')
  await page.getByTestId('scanner-close').click()
  await expect(page.getByTestId('barcode-scanner')).toBeHidden()
  await expect(page).toHaveURL(/#\/$/)
})

test('closing the scanner turns the camera off', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as TestWindow
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => (w.__stream = await real(constraints))
    // Never finds a barcode, so the scanner stays open.
    w.BarcodeDetector = class {
      static async getSupportedFormats() {
        return ['ean_13']
      }
      async detect() {
        return []
      }
    }
  })
  await page.goto('./')
  await page.getByTestId('scan-barcode').click()
  await expect(page.getByTestId('scanner-status')).toHaveAttribute('data-status', 'scanning')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('barcode-scanner')).toBeHidden()
  const live = await page.evaluate(() => (window as TestWindow).__stream!.getTracks().some((t) => t.readyState === 'live'))
  expect(live).toBe(false)
})
