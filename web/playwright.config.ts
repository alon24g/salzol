import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const PORT = 4174

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/salzol/`,
    locale: 'he-IL',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    // Production build served with a frozen real-data snapshot (tests/e2e/fixtures/data).
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/salzol/`,
    env: { DATA_DIR: path.join(import.meta.dirname, 'tests', 'e2e', 'fixtures', 'data') },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
