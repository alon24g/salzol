// Builds the product index and answers queries off the main thread: indexing ~200k products
// takes seconds on a phone and would otherwise freeze the page.
import { loadSearch } from './data'
import { ProductSearch } from './search'

export type SearchRequest = { id: number; query: string | null }
export type SearchResponse = { id: number; hits: import('./search').SearchHit[] } | { id: number; error: string }

let engine: Promise<ProductSearch> | null = null

function getEngine(): Promise<ProductSearch> {
  engine ??= loadSearch().then((rows) => new ProductSearch(rows))
  engine.catch(() => (engine = null)) // allow retry after a failed load
  return engine
}

onmessage = async (e: MessageEvent<SearchRequest>) => {
  const { id, query } = e.data
  let res: SearchResponse
  try {
    const s = await getEngine()
    res = { id, hits: query == null ? [] : s.search(query) }
  } catch (err) {
    res = { id, error: String(err) }
  }
  postMessage(res)
}
