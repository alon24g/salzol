import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Pipeline output (dist/data at the repo root) is served at <base>/data during dev and
// preview. DATA_DIR overrides it, e.g. the e2e tests point it at a small real-data fixture.
// In production the workflow copies the data next to the built site instead.
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(import.meta.dirname, '..', 'dist', 'data'))

function serveData(): Plugin {
  const handler = (base: string) => (req: { url?: string }, res: any, next: () => void) => {
    const prefix = `${base}data/`
    if (!req.url?.startsWith(prefix)) return next()
    const rel = decodeURIComponent(req.url.slice(prefix.length).split('?')[0])
    const file = path.join(dataDir, rel)
    if (!file.startsWith(dataDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404
      return res.end()
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    fs.createReadStream(file).pipe(res)
  }
  return {
    name: 'serve-pipeline-data',
    configureServer(server) {
      server.middlewares.use(handler(server.config.base))
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler(server.config.base))
    },
  }
}

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; override with BASE_PATH if that changes.
  base: process.env.BASE_PATH ?? '/salzol/',
  plugins: [react(), tailwindcss(), serveData()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
