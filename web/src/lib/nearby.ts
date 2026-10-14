import { priceAtStore, type PricedStore, type PricingContext, type Promo } from './promos'
import type { ItemPrices, Size, Store, StoresByChain } from './types'

// "Near me" choices. Store coordinates are city centroids (pipeline/geo.py), so 2 km is roughly
// "my town", and larger radii pull in neighbouring towns.
export const RADIUS_OPTIONS = [2, 5, 10, 20] as const
export const DEFAULT_RADIUS_KM = 5

export type Place = { lat: number; lon: number; label: string; source: 'gps' | 'city' }

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export type StoreOffer = { store: Store; distanceKm: number | null } & PricedStore

export type ChainOffer = {
  chain: string
  cheapest: StoreOffer
  /** stores (in range) with the cheapest total */
  storesAtCheapest: number
  /** all in-range stores, cheapest first, then nearest */
  offers: StoreOffer[]
}

export type OfferOptions = {
  radiusKm?: number
  qty?: number // units, or kg for weighted items
  ctx?: PricingContext
  promos?: Record<string, readonly Promo[]>
}

const NO_PROMOS: readonly Promo[] = []

/**
 * Per chain, the cheapest total for `qty` at a store within `radiusKm` of `place`, applying
 * the promos the user is eligible for on the shopping day. Without a place, every store counts
 * (nationwide view). Chains with no store in range are omitted. Sorted cheapest first.
 */
export function chainOffers(
  item: ItemPrices,
  stores: StoresByChain,
  place: Place | null,
  { radiusKm = DEFAULT_RADIUS_KM, qty = 1, ctx, promos = {} }: OfferOptions = {},
): ChainOffer[] {
  const out: ChainOffer[] = []
  for (const [chain, cp] of Object.entries(item.c)) {
    const chainStores = stores[chain] ?? []
    const chainPromos = ctx ? (promos[chain] ?? NO_PROMOS) : NO_PROMOS
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
        const priced = ctx
          ? priceAtStore(price, qty, chain, i, chainPromos, ctx)
          : { regular: price, total: Math.round(price * qty * 100) / 100, applied: null, other: [] }
        offers.push({ store, distanceKm, ...priced })
      }
    }
    if (!offers.length) continue
    offers.sort((a, b) => a.total - b.total || (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    const cheapest = offers[0]
    out.push({
      chain,
      cheapest,
      storesAtCheapest: offers.filter((o) => o.total === cheapest.total).length,
      offers,
    })
  }
  return out.sort((a, b) => a.cheapest.total - b.cheapest.total)
}

/** Unit price for display, e.g. { value: 0.74, per: '100 מ"ל' }. */
export function unitPrice(price: number, size: Size | null, weighted: boolean): { value: number; per: string } | null {
  if (weighted) return { value: price, per: 'ק"ג' }
  if (!size || size[0] <= 0) return null
  const [amount, base, label] = size
  const per = base === 'g' || base === 'ml' ? 100 : 1
  return { value: (price / amount) * per, per: label }
}

/**
 * For chains that sell the item but have no store within the radius: the distance to their
 * nearest such store, so the UI can offer to widen the search. Nearest first.
 */
export function chainsOutOfRange(
  item: ItemPrices,
  stores: StoresByChain,
  place: Place,
  inRange: readonly { chain: string }[],
): { chain: string; nearestKm: number }[] {
  const shown = new Set(inRange.map((o) => o.chain))
  const out: { chain: string; nearestKm: number }[] = []
  for (const [chain, cp] of Object.entries(item.c)) {
    if (shown.has(chain)) continue
    let nearestKm = Infinity
    for (const [, idxs] of cp.p) {
      for (const i of idxs) {
        const s = stores[chain]?.[i]
        if (s?.lat != null && s.lon != null) nearestKm = Math.min(nearestKm, haversineKm(place, { lat: s.lat, lon: s.lon }))
      }
    }
    if (nearestKm < Infinity) out.push({ chain, nearestKm })
  }
  return out.sort((a, b) => a.nearestKm - b.nearestKm)
}

/** The smallest radius option that reaches `km`, or null if none does. */
export function radiusToReach(km: number): number | null {
  return RADIUS_OPTIONS.find((r) => r >= km) ?? null
}
