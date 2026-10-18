import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { BARCODE_VIDEO } from './tests/e2e/barcode-video'

const PORT = 4174
// Chromium's fake camera, so the barcode scanner can be tested without a device.
const FAKE_CAMERA = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/salzol/`,
    locale: 'he-IL',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      testIgnore: /scanner-zxing/,
      use: { ...devices['Pixel 7'], launchOptions: { args: FAKE_CAMERA } },
    },
    {
      // The fake camera shows an EAN-13 image (written by global-setup) for the ZXing fallback.
      name: 'scanner-zxing',
      testMatch: /scanner-zxing/,
      use: { ...devices['Pixel 7'], launchOptions: { args: [...FAKE_CAMERA, `--use-file-for-fake-video-capture=${BARCODE_VIDEO}`] } },
    },
  ],
  webServer: {
    // Production build served with a frozen real-data snapshot (tests/e2e/fixtures/data).
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/salzol/`,
    env: { DATA_DIR: path.join(import.meta.dirname, 'tests', 'e2e', 'fixtures', 'data') },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
