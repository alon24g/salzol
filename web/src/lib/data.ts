import type { Promo } from './promos'
import type { CityRow, ItemPrices, Meta, PriceShard, SearchRow, StoresByChain } from './types'

// Must match PROMO_CHUNK in pipeline/build.py. The shard count is in meta.json (price_shards);
// data built before it was added used 256.
const DEFAULT_PRICE_SHARDS = 256
export const PROMO_CHUNK = 500

const DATA = `${import.meta.env.BASE_URL}data/`

const cache = new Map<string, Promise<unknown>>()

function getJson<T>(file: string): Promise<T> {
  let p = cache.get(file)
  if (!p) {
    p = fetch(DATA + file).then((r) => {
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(file)) // allow retry after a failed load
    cache.set(file, p)
  }
  return p as Promise<T>
}

export const loadMeta = () => getJson<Meta>('meta.json')
export const loadStores = () => getJson<StoresByChain>('stores.json')
export const loadCities = () => getJson<CityRow[]>('cities.json')
export const loadSearch = () => getJson<SearchRow[]>('search.json')

/** Barcodes are stored as 13-digit GTINs (see pipeline/normalize.py). */
export function canonicalBarcode(input: string): string | null {
  const digits = input.trim()
  if (!/^\d+$/.test(digits)) return null
  const stripped = digits.replace(/^0+/, '')
  if (stripped.length < 8 || stripped.length > 14) return null
  return stripped.padStart(13, '0')
}

export function shardOf(barcode: string, shards = DEFAULT_PRICE_SHARDS): string {
  // Barcodes can exceed 2^53, so take the modulo digit by digit.
  let m = 0
  for (const d of barcode) m = (m * 10 + Number(d)) % shards
  return String(m).padStart(3, '0')
}

export async function loadItem(barcode: string): Promise<ItemPrices | null> {
  const meta = await loadMeta()
  const shard = await getJson<PriceShard>(`prices/${shardOf(barcode, meta.price_shards)}.json`)
  return shard[barcode] ?? null
}

/** The promos an item references, per chain (loads only the chunks needed). */
export async function loadItemPromos(item: ItemPrices): Promise<Record<string, Promo[]>> {
  const out: Record<string, Promo[]> = {}
  await Promise.all(
    Object.entries(item.pr ?? {}).map(async ([chain, idxs]) => {
      const chunks = [...new Set(idxs.map((i) => Math.floor(i / PROMO_CHUNK)))]
      const loaded = new Map<number, Promo[]>()
      await Promise.all(
        chunks.map(async (k) => loaded.set(k, await getJson<Promo[]>(`promos/${chain}/${k}.json`))),
      )
      out[chain] = idxs.map((i) => loaded.get(Math.floor(i / PROMO_CHUNK))![i % PROMO_CHUNK]).filter(Boolean)
    }),
  )
  return out
}
