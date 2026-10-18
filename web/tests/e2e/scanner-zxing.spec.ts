import { expect, test } from './test'
import { SCAN_BARCODE } from './barcode-video'
import { ProductPage } from './pages'

// Runs in the "scanner-zxing" project: the fake camera shows a real EAN-13 image
// (barcode-video.ts) and BarcodeDetector is removed, as on an iPhone, so ZXing decodes it.
test('without BarcodeDetector, ZXing reads the barcode from the camera', async ({ page, context }) => {
  await context.grantPermissions(['camera'])
  await page.addInitScript(() => {
    delete (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector
  })
  await page.goto('./')
  await page.getByTestId('scan-barcode').click()
  await expect(page).toHaveURL(new RegExp(`#/p/${SCAN_BARCODE}$`), { timeout: 15_000 })
  await expect(new ProductPage(page).name).toHaveText('חלב תנובה 3% שומן 2 ליטר')
})
