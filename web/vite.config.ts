import crypto from 'node:crypto'
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

// Emits sw.js (see sw/sw.js) with the list of files to precache: the page, the built JS/CSS, the
// Hebrew and Latin font subsets and the public icons. The version changes whenever any of them does.
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = fs.readdirSync(path.join(import.meta.dirname, 'public'))
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && (!f.endsWith('.woff2') || /-(hebrew|latin)-wght/.test(f)))
      const files = ['./', ...built.filter((f) => f !== 'index.html'), ...publicFiles]
      const hash = crypto.createHash('sha256')
      for (const f of built.sort()) {
        const out = bundle[f]
        hash.update(f).update(out.type === 'asset' ? out.source : out.code)
      }
      for (const f of publicFiles.sort()) hash.update(f).update(fs.readFileSync(path.join(import.meta.dirname, 'public', f)))
      const source = fs
        .readFileSync(path.join(import.meta.dirname, 'sw', 'sw.js'), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${JSON.stringify(files)}`)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// Preloads the body font (Hebrew + Latin for digits) and the Hebrew display font: found only after
// the CSS is parsed, they would otherwise arrive after the first paint and shift the layout.
function preloadFonts(): Plugin {
  let base = '/'
  return {
    name: 'preload-fonts',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return Object.keys(ctx.bundle ?? {})
          .filter((f) => /^assets\/(heebo-(hebrew|latin)|rubik-hebrew)-wght-normal-.*\.woff2$/.test(f))
          .map((f) => ({
            tag: 'link',
            attrs: { rel: 'preload', href: `${base}${f}`, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head' as const,
          }))
      },
    },
  }
}

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; override with BASE_PATH if that changes.
  base: process.env.BASE_PATH ?? '/salzol/',
  plugins: [react(), tailwindcss(), serveData(), serviceWorker(), preloadFonts()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
