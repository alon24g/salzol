// Basket comparison: what a whole shopping list costs at each store, with promotions applied at
// basket level (mixed-item deals, basket thresholds) and missing items counted, never dropped.
import { haversineKm, DEFAULT_RADIUS_KM, type Place } from './nearby'
import { atStore, isActiveOn, type PricingContext, type Promo } from './promos'
import type { ItemPrices, Store, StoresByChain } from './types'

export type BasketLine = {
  barcode: string
  name: string
  qty: number // units, or kg when weighted
  weighted: boolean
  item: ItemPrices | null // null = not found in current data
  promos: Record<string, readonly Promo[]>
}

export type LineResult = {
  barcode: string
  name: string
  qty: number
  unitPrice: number // regular price at this store
  regularTotal: number
  total: number
  promo: Promo | null
}

export type StoreBasket = {
  chain: string
  storeIdx: number
  store: Store
  distanceKm: number | null
  regularTotal: number
  total: number
  savings: number
  lines: LineResult[]
  missing: { barcode: string; name: string }[]
}

export type RankMode = 'complete' | 'available'

export type BasketOptions = { place: Place | null; radiusKm?: number; ctx: PricingContext }

/** Every store (in range) that sells at least one item of the list, priced for the basket. */
export function priceBasket(lines: BasketLine[], stores: StoresByChain, opts: BasketOptions): StoreBasket[] {
  const { place, radiusKm = DEFAULT_RADIUS_KM, ctx } = opts
  const priceMaps = lines.map(priceMap)

  const out: StoreBasket[] = []
  const chains = new Set(priceMaps.flatMap((m) => [...m.keys()]))
  for (const chain of chains) {
    const chainStores = stores[chain] ?? []
    const storeIdxs = new Set<number>()
    for (const m of priceMaps) for (const i of m.get(chain)?.keys() ?? []) storeIdxs.add(i)
    for (const storeIdx of storeIdxs) {
      const store = chainStores[storeIdx]
      if (!store) continue
      let distanceKm: number | null = null
      if (place) {
        if (store.lat == null || store.lon == null) continue
        distanceKm = haversineKm(place, { lat: store.lat, lon: store.lon })
        if (distanceKm > radiusKm) continue
      }
      out.push(priceAtStoreBasket(lines, priceMaps, chain, storeIdx, store, distanceKm, ctx))
    }
  }
  return out
}

/** chain → store index → regular price of one line */
function priceMap(line: BasketLine): Map<string, Map<number, number>> {
  const m = new Map<string, Map<number, number>>()
  for (const [chain, cp] of Object.entries(line.item?.c ?? {})) {
    const byStore = new Map<number, number>()
    for (const [price, idxs] of cp.p) for (const i of idxs) byStore.set(i, price)
    m.set(chain, byStore)
  }
  return m
}

function priceAtStoreBasket(
  lines: BasketLine[],
  priceMaps: Map<string, Map<number, number>>[],
  chain: string,
  storeIdx: number,
  store: Store,
  distanceKm: number | null,
  ctx: PricingContext,
): StoreBasket {
  const results: (LineResult | null)[] = lines.map((line, li) => {
    const price = priceMaps[li].get(chain)?.get(storeIdx)
    if (price == null) return null
    const regularTotal = round2(price * line.qty)
    return { barcode: line.barcode, name: line.name, qty: line.qty, unitPrice: price, regularTotal, total: regularTotal, promo: null }
  })

  // Candidate promos at this store/day, with the lines (present here) they cover.
  const candidates = new Map<Promo, number[]>()
  lines.forEach((line, li) => {
    if (!results[li]) return
    for (const p of line.promos[chain] ?? []) {
      if (p.kind === 'unknown' || p.conditional) continue
      if (p.club_only && !ctx.clubs.has(chain)) continue
      if (!atStore(p, storeIdx) || !isActiveOn(p, ctx.day)) continue
      const ls = candidates.get(p) ?? []
      ls.push(li)
      candidates.set(p, ls)
    }
  })

  // Promos don't stack: greedily take the biggest savings on disjoint lines. Basket-threshold
  // promos ("מעל ₪50") go last, once the basket total after other promos is known.
  const used = new Set<number>()
  const apply = (p: Promo, lis: number[], saving: number) => {
    const base = lis.reduce((s, li) => s + results[li]!.regularTotal, 0)
    for (const li of lis) {
      const r = results[li]!
      r.total = round2(r.regularTotal - (saving * r.regularTotal) / base)
      r.promo = p
      used.add(li)
    }
  }
  const pass = (promos: [Promo, number[]][], budget?: () => number) => {
    const scored = promos
      .map(([p, lis]) => [p, lis, promoSaving(p, lis.map((li) => ({ price: results[li]!.unitPrice, qty: lines[li].qty, weighted: lines[li].weighted })))] as const)
      .filter(([, , s]) => s > 0.004)
      .sort((a, b) => b[2] - a[2])
    for (const [p, lis, saving] of scored) {
      if (lis.some((li) => used.has(li))) continue
      if (budget && (p.min_purchase ?? 0) > budget()) continue
      apply(p, lis, saving)
    }
  }
  const all = [...candidates.entries()]
  pass(all.filter(([p]) => !p.min_purchase))
  const subtotal = () => results.reduce((s, r) => s + (r?.total ?? 0), 0)
  pass(all.filter(([p]) => p.min_purchase), subtotal)

  const present = results.filter((r): r is LineResult => r !== null)
  const regularTotal = round2(present.reduce((s, r) => s + r.regularTotal, 0))
  const total = round2(present.reduce((s, r) => s + r.total, 0))
  return {
    chain,
    storeIdx,
    store,
    distanceKm,
    regularTotal,
    total,
    savings: round2(regularTotal - total),
    lines: present,
    missing: lines.filter((_, li) => !results[li]).map((l) => ({ barcode: l.barcode, name: l.name })),
  }
}

type PromoLine = { price: number; qty: number; weighted: boolean }

/** Saving (₪) from applying promo `p` to these lines together. Mixed-item deals pool units:
 *  "N for ₪X" groups the most expensive units first; "X+Y" frees the cheapest of each set. */
export function promoSaving(p: Promo, lines: PromoLine[]): number {
  const v = p.value ?? 0
  const minQty = p.min_qty ?? 1
  let saving = 0
  switch (p.kind) {
    case 'fixed_price': {
      const totalQty = lines.reduce((s, l) => s + l.qty, 0)
      if (totalQty < minQty) return 0
      let unitsLeft = Math.min(p.max_qty ?? Infinity, p.limit != null ? p.limit * Math.max(minQty, 1) : Infinity)
      for (const l of [...lines].sort((a, b) => b.price - a.price)) {
        const units = Math.min(l.qty, unitsLeft)
        saving += units * Math.max(0, l.price - v)
        unitsLeft -= units
      }
      break
    }
    case 'n_for_price': {
      const units = unitPrices(lines)
      const groups = Math.min(Math.floor(Math.min(units.length, p.max_qty ?? Infinity) / minQty), p.limit ?? Infinity)
      const covered = units.slice(0, groups * minQty).reduce((s, x) => s + x, 0)
      saving = covered - groups * v
      break
    }
    case 'buy_x_get_y': {
      const get = p.get_qty ?? 1
      const set = minQty + get
      const units = unitPrices(lines)
      const sets = Math.min(Math.floor(units.length / set), p.limit ?? Infinity)
      for (let k = 0; k < sets; k++) {
        const chunk = units.slice(k * set, (k + 1) * set) // descending → the last `get` are cheapest
        saving += chunk.slice(set - get).reduce((s, x) => s + x, 0)
      }
      break
    }
    case 'percent_off':
      saving = lines.reduce((s, l) => s + l.price * l.qty, 0) * (v / 100)
      break
    case 'amount_off':
      saving = lines.reduce((s, l) => s + l.qty * Math.min(v, l.price), 0)
      break
  }
  return Math.max(0, round2(saving))
}

/** Individual unit prices, most expensive first (weighted lines can't be split into units). */
function unitPrices(lines: PromoLine[]): number[] {
  const units: number[] = []
  for (const l of lines) {
    if (l.weighted) continue
    for (let k = 0; k < Math.floor(l.qty); k++) units.push(l.price)
  }
  return units.sort((a, b) => b - a)
}

export type ChainBasket = StoreBasket & { storesCompared: number }

/** Best store per chain under the ranking mode, cheapest chain first. */
export function bestPerChain(baskets: StoreBasket[], mode: RankMode): ChainBasket[] {
  const byChain = new Map<string, StoreBasket[]>()
  for (const b of rank(baskets, mode)) byChain.set(b.chain, [...(byChain.get(b.chain) ?? []), b])
  return [...byChain.values()].map((bs) => ({ ...bs[0], storesCompared: bs.length })).sort(compare(mode))
}

/** Stores ordered for the mode: "complete" keeps only stores that have every item. */
export function rank(baskets: StoreBasket[], mode: RankMode): StoreBasket[] {
  return (mode === 'complete' ? baskets.filter((b) => b.missing.length === 0) : [...baskets]).sort(compare(mode))
}

// "available" ranks stores by fewest missing items, then by the total of what they have.
// Ranking by total alone looked right on paper but on real data a Shufersal BE drugstore that
// stocks 1 of 5 items "won" with ₪12 — cheapest, and useless as advice.
function compare(mode: RankMode) {
  return (a: StoreBasket, b: StoreBasket) =>
    (mode === 'available' ? a.missing.length - b.missing.length : 0) ||
    a.total - b.total ||
    (a.distanceKm ?? 0) - (b.distanceKm ?? 0)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/**
 * Which totals get the "cheapest" badge: every one tied (to the agora) with the lowest, but none
 * when all are equal — a badge on every card says nothing.
 */
export function cheapestMarks(totals: number[]): boolean[] {
  const agorot = totals.map((t) => Math.round(t * 100))
  const min = Math.min(...agorot)
  if (agorot.every((a) => a === min)) return agorot.map(() => false)
  return agorot.map((a) => a === min)
}

export type SplitBasket = {
  parts: [StoreBasket, StoreBasket]
  regularTotal: number
  total: number
  savings: number
  missing: { barcode: string; name: string }[]
}

// Stores considered for a split: the best whole baskets, plus the cheapest few stores for each
// item (a store that is cheap for one expensive item can win as the second stop).
const SPLIT_POOL = 40
const SPLIT_PER_LINE = 3
// Pairs fully re-priced, picked by an estimate (each item at the cheaper store's price).
const SPLIT_REPRICED = 40

/**
 * Cheapest ways to buy the list at two stores, fewest missing items first. Each item goes to the
 * store where it costs less, then each store's share is priced again on its own: promotions that
 * pool several items or need a minimum spend may no longer apply once the list is split.
 * A heuristic, not an exhaustive search: the item assignment ignores how promotions interact.
 */
export function bestSplits(lines: BasketLine[], baskets: StoreBasket[], ctx: PricingContext, limit = 3): SplitBasket[] {
  if (lines.length < 2) return []
  const pool = new Set(rank(baskets, 'available').slice(0, SPLIT_POOL))
  const lineTotal = (b: StoreBasket, barcode: string) => b.lines.find((l) => l.barcode === barcode)?.total
  for (const line of lines) {
    baskets
      .filter((b) => lineTotal(b, line.barcode) != null)
      .sort((a, b) => lineTotal(a, line.barcode)! - lineTotal(b, line.barcode)!)
      .slice(0, SPLIT_PER_LINE)
      .forEach((b) => pool.add(b))
  }

  // Per pool store: barcode → line total (promos as priced for the whole list there).
  const stores = [...pool].map((b) => ({ b, totals: new Map(b.lines.map((l) => [l.barcode, l.total])) }))
  const estimates: { a: number; b: number; missing: number; estimate: number }[] = []
  for (let i = 0; i < stores.length; i++) {
    for (let j = i + 1; j < stores.length; j++) {
      let missing = 0
      let estimate = 0
      for (const line of lines) {
        const x = stores[i].totals.get(line.barcode)
        const y = stores[j].totals.get(line.barcode)
        if (x == null && y == null) missing++
        else estimate += Math.min(x ?? Infinity, y ?? Infinity)
      }
      estimates.push({ a: i, b: j, missing, estimate })
    }
  }
  estimates.sort((p, q) => p.missing - q.missing || p.estimate - q.estimate)

  const priceMaps = lines.map(priceMap)
  const out: SplitBasket[] = []
  for (const { a, b } of estimates.slice(0, SPLIT_REPRICED)) {
    const sa = stores[a]
    const sb = stores[b]
    const toA: number[] = []
    const toB: number[] = []
    lines.forEach((line, li) => {
      const x = sa.totals.get(line.barcode)
      const y = sb.totals.get(line.barcode)
      if (x == null && y == null) return
      if (y == null || (x != null && x <= y)) toA.push(li)
      else toB.push(li)
    })
    if (!toA.length || !toB.length) continue // all at one store: not a split
    const part = (s: StoreBasket, lis: number[]) =>
      priceAtStoreBasket(lis.map((li) => lines[li]), lis.map((li) => priceMaps[li]), s.chain, s.storeIdx, s.store, s.distanceKm, ctx)
    const parts: [StoreBasket, StoreBasket] = [part(sa.b, toA), part(sb.b, toB)]
    const covered = new Set([...toA, ...toB])
    const regularTotal = round2(parts[0].regularTotal + parts[1].regularTotal)
    const total = round2(parts[0].total + parts[1].total)
    out.push({
      parts: parts[0].total >= parts[1].total ? parts : [parts[1], parts[0]],
      regularTotal,
      total,
      savings: round2(regularTotal - total),
      missing: lines.filter((_, li) => !covered.has(li)).map((l) => ({ barcode: l.barcode, name: l.name })),
    })
  }
  return out.sort((p, q) => p.missing.length - q.missing.length || p.total - q.total).slice(0, limit)
}

/**
 * Whether a split is worth suggesting over the best single store: it has fewer missing items, or
 * the same and saves at least ₪5 and 3% (a second stop for a few shekels isn't advice).
 */
export function splitWorthIt(split: SplitBasket, single: StoreBasket | undefined): boolean {
  if (!single) return true
  if (split.missing.length !== single.missing.length) return split.missing.length < single.missing.length
  const saved = single.total - split.total
  return saved >= 5 && saved >= single.total * 0.03
}
