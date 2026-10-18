import type { SearchHit } from './search'
import type { SearchRequest, SearchResponse } from './search.worker'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (hits: SearchHit[]) => void; reject: (err: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<SearchResponse>) => {
    const p = pending.get(e.data.id)
    pending.delete(e.data.id)
    if ('error' in e.data) p?.reject(new Error(e.data.error))
    else p?.resolve(e.data.hits)
  }
  w.onerror = () => {
    for (const p of pending.values()) p.reject(new Error('search worker failed'))
    pending.clear()
    worker = null
  }
  worker = w
  return w
}

/** Products matching `query` (name or barcode), best first. Loads the index on first use. */
export function searchProducts(query: string): Promise<SearchHit[]> {
  return send(query)
}

/** Starts loading the index; resolves once it is ready. */
export function loadSearchIndex(): Promise<void> {
  return send(null).then(() => undefined)
}

function send(query: string | null): Promise<SearchHit[]> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, query } satisfies SearchRequest)
  })
}
