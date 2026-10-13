import type { ItemPrices, Size, Store, StoresByChain } from './types'

export const DEFAULT_RADIUS_KM = 20

export type Place = { lat: number; lon: number; label: string; source: 'gps' | 'city' }

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export type StoreOffer = { store: Store; price: number; distanceKm: number | null }

export type ChainOffer = {
  chain: string
  cheapest: StoreOffer
  /** stores (in range) charging the cheapest price */
  storesAtCheapest: number
  /** all in-range stores, cheapest first, then nearest */
  offers: StoreOffer[]
  /** chain-wide price range, for context */
  min: number
  max: number
}

/**
 * Per chain, the cheapest price at a store within `radiusKm` of `place`.
 * Without a place, every located-or-not store counts (nationwide view).
 * Chains with no store in range are omitted. Result is sorted cheapest first.
 */
export function chainOffers(
  item: ItemPrices,
  stores: StoresByChain,
  place: Place | null,
  radiusKm = DEFAULT_RADIUS_KM,
): ChainOffer[] {
  const out: ChainOffer[] = []
  for (const [chain, cp] of Object.entries(item.c)) {
    const chainStores = stores[chain] ?? []
    const offers: StoreOffer[] = []
    for (const [price, idxs] of cp.p) {
      for (const i of idxs) {
        const store = chainStores[i]
        if (!store) continue
        let distanceKm: number | null = null
        if (place) {
          if (store.lat == null || store.lon == null) continue // e.g. online-only store
          distanceKm = haversineKm(place, { lat: store.lat, lon: store.lon })
          if (distanceKm > radiusKm) continue
        }
        offers.push({ store, price, distanceKm })
      }
    }
    if (!offers.length) continue
    offers.sort((a, b) => a.price - b.price || (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    const cheapest = offers[0]
    out.push({
      chain,
      cheapest,
      storesAtCheapest: offers.filter((o) => o.price === cheapest.price).length,
      offers,
      min: cp.min,
      max: cp.max,
    })
  }
  return out.sort((a, b) => a.cheapest.price - b.cheapest.price)
}

/** Unit price for display, e.g. { value: 0.74, per: '100 מ"ל' }. */
export function unitPrice(price: number, size: Size | null, weighted: boolean): { value: number; per: string } | null {
  if (weighted) return { value: price, per: 'ק"ג' }
  if (!size || size[0] <= 0) return null
  const [amount, base, label] = size
  const per = base === 'g' || base === 'ml' ? 100 : 1
  return { value: (price / amount) * per, per: label }
}
