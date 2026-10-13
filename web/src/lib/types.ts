// Shapes of the files written by pipeline/build.py.

/** search.json row: [barcode, name, brand, chainCount, aliases?] */
export type SearchRow = [string, string, string, number, string[]?]

export type Store = {
  id: string
  name: string
  city: string
  address: string
  lat: number | null
  lon: number | null
}

/** stores.json: chain slug → stores; price entries refer to stores by index. */
export type StoresByChain = Record<string, Store[]>

export type ChainPrices = {
  min: number
  max: number
  med: number
  /** [price, storeIndexes[]] — stores sharing a price are grouped. */
  p: [number, number[]][]
}

/** [size in base unit, base unit, display label], e.g. [2000, 'ml', '100 מ"ל'] */
export type Size = [number, 'g' | 'ml' | 'unit' | 'm', string]

export type ItemPrices = {
  n: string // canonical name
  b: string // brand / manufacturer
  w: boolean // weighted (price per kg)
  size: Size | null
  c: Record<string, ChainPrices>
}

export type PriceShard = Record<string, ItemPrices>

export type ChainMeta = {
  slug: string
  ok: boolean
  name: string
  updated: string // Israel local time, "YYYY-MM-DDTHH:mm"
  stores?: number
  error?: string
}

export type Meta = {
  built_at: string
  chains: Record<string, ChainMeta>
}

/** cities.json row: [name, lat, lon] */
export type CityRow = [string, number, number]
