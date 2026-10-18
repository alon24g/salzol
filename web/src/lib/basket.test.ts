import { describe, expect, it } from 'vitest'
import { bestPerChain, bestSplits, cheapestMarks, priceBasket, promoSaving, rank, splitWorthIt, type BasketLine } from './basket'
import type { Promo, PricingContext } from './promos'
import type { ItemPrices, StoresByChain } from './types'

const ctx: PricingContext = { day: '2026-10-13', clubs: new Set() }
const window = { start: '2026-10-01T00:00', end: '2026-10-31T23:59' }
const promo = (p: Partial<Promo>): Promo => ({ id: Math.random().toString(), description: '', kind: 'unknown', ...window, ...p })

const store = (id: string) => ({ id, name: `סניף ${id}`, city: 'תל אביב -יפו', address: '', lat: 32.07, lon: 34.78 })
const stores: StoresByChain = { a: [store('1'), store('2')], b: [store('1')] }

/** item sold at chain a stores 0,1 and chain b store 0 with the given prices */
function item(prices: { a0?: number; a1?: number; b0?: number }): ItemPrices {
  const c: ItemPrices['c'] = {}
  const a: [number, number[]][] = []
  if (prices.a0 != null) a.push([prices.a0, [0]])
  if (prices.a1 != null) a.push([prices.a1, [1]])
  if (a.length) c.a = { min: 0, max: 0, med: 0, p: a }
  if (prices.b0 != null) c.b = { min: 0, max: 0, med: 0, p: [[prices.b0, [0]]] }
  return { n: '', b: '', w: false, size: null, c }
}

const line = (barcode: string, qty: number, it: ItemPrices, promos: Record<string, Promo[]> = {}): BasketLine => ({
  barcode,
  name: `מוצר ${barcode}`,
  qty,
  weighted: false,
  item: it,
  promos,
})

describe('promoSaving (basket level)', () => {
  it('"N for ₪X" pools units across different products, most expensive first', () => {
    const p = promo({ kind: 'n_for_price', value: 10, min_qty: 3 }) // "3 ב-10" on a group of items
    // 2×5.90 + 1×4.90 = 16.70 → 10
    expect(promoSaving(p, [{ price: 5.9, qty: 2, weighted: false }, { price: 4.9, qty: 1, weighted: false }])).toBe(6.7)
  })
  it('"2+1 הזול מבניהם": the cheapest unit of each set is free', () => {
    const p = promo({ kind: 'buy_x_get_y', min_qty: 2, get_qty: 1 })
    expect(promoSaving(p, [{ price: 20, qty: 2, weighted: false }, { price: 8, qty: 1, weighted: false }])).toBe(8)
    expect(promoSaving(p, [{ price: 20, qty: 2, weighted: false }])).toBe(0)
  })
  it('fixed price respects the redemption limit', () => {
    const p = promo({ kind: 'fixed_price', value: 3.9, min_qty: 1, limit: 2 })
    expect(promoSaving(p, [{ price: 9.9, qty: 3, weighted: false }])).toBe(12)
  })
})

describe('priceBasket', () => {
  const milk = item({ a0: 6, a1: 7, b0: 5 })
  const bread = item({ a0: 10, a1: 10 }) // not sold at chain b
  const twoMilks = promo({ kind: 'n_for_price', value: 10, min_qty: 2 })

  it('prices each store, applies promos, counts missing items', () => {
    const baskets = priceBasket([line('milk', 2, milk, { a: [twoMilks] }), line('bread', 1, bread)], stores, { place: null, ctx })
    const a0 = baskets.find((b) => b.chain === 'a' && b.storeIdx === 0)!
    expect(a0.regularTotal).toBe(22)
    expect(a0.total).toBe(20) // 2 milks for 10 + bread 10
    expect(a0.savings).toBe(2)
    expect(a0.lines.find((l) => l.barcode === 'milk')!.promo).toBe(twoMilks)
    const b0 = baskets.find((b) => b.chain === 'b')!
    expect(b0.total).toBe(10)
    expect(b0.missing.map((m) => m.barcode)).toEqual(['bread'])
  })

  it('promos do not stack on the same line: the bigger saving wins', () => {
    const small = promo({ kind: 'fixed_price', value: 5.5, min_qty: 1 }) // saves 1.00
    const [a0] = priceBasket([line('milk', 2, milk, { a: [small, twoMilks] })], stores, { place: null, ctx }).filter(
      (b) => b.chain === 'a' && b.storeIdx === 0,
    )
    expect(a0.total).toBe(10) // twoMilks saves 2.00 > 1.00
  })

  it('basket threshold promos apply only when the basket reaches the amount', () => {
    const over50 = promo({ kind: 'fixed_price', value: 1, min_qty: 1, min_purchase: 50 })
    const small = priceBasket([line('milk', 1, milk, { a: [over50] })], stores, { place: null, ctx })
    expect(small.find((b) => b.chain === 'a' && b.storeIdx === 0)!.total).toBe(6)
    const big = priceBasket(
      [line('milk', 1, milk, { a: [over50] }), line('bread', 5, bread)],
      stores,
      { place: null, ctx },
    )
    expect(big.find((b) => b.chain === 'a' && b.storeIdx === 0)!.total).toBe(51) // 1 + 50
  })

  it('club and out-of-date promos are not applied', () => {
    const club = promo({ kind: 'fixed_price', value: 1, min_qty: 1, club_only: true })
    const old = promo({ kind: 'fixed_price', value: 1, min_qty: 1, start: '2026-01-01T00:00', end: '2026-01-31T23:59' })
    const r = priceBasket([line('milk', 1, milk, { a: [club, old] })], stores, { place: null, ctx })
    expect(r.find((b) => b.chain === 'a' && b.storeIdx === 0)!.total).toBe(6)
    const member = priceBasket([line('milk', 1, milk, { a: [club] })], stores, { place: null, ctx: { ...ctx, clubs: new Set(['a']) } })
    expect(member.find((b) => b.chain === 'a' && b.storeIdx === 0)!.total).toBe(1)
  })

  it('a store-specific promo only applies at its stores', () => {
    const onlyStore1 = promo({ kind: 'fixed_price', value: 1, min_qty: 1, s: [1] })
    const r = priceBasket([line('milk', 1, milk, { a: [onlyStore1] })], stores, { place: null, ctx })
    expect(r.filter((b) => b.chain === 'a').map((b) => [b.storeIdx, b.total])).toEqual([
      [0, 6],
      [1, 1],
    ])
  })
})

describe('ranking', () => {
  const milk = item({ a0: 6, a1: 7, b0: 5 })
  const bread = item({ a0: 10, a1: 10 })
  const baskets = priceBasket([line('milk', 1, milk), line('bread', 1, bread)], stores, { place: null, ctx })

  it('"complete" keeps only stores that have everything', () => {
    expect(rank(baskets, 'complete').map((b) => `${b.chain}${b.storeIdx}`)).toEqual(['a0', 'a1'])
  })
  it('"available" ranks every store: fewest missing items first, then total', () => {
    // b0 is cheapest (5) but lacks bread; it must not beat stores that have everything
    expect(rank(baskets, 'available').map((b) => `${b.chain}${b.storeIdx}:${b.missing.length}`)).toEqual(['a0:0', 'a1:0', 'b0:1'])
  })
  it('best store per chain', () => {
    expect(bestPerChain(baskets, 'complete').map((b) => [b.chain, b.storeIdx, b.storesCompared])).toEqual([['a', 0, 2]])
  })
})

describe('cheapestMarks', () => {
  it('marks every total tied with the lowest', () => {
    expect(cheapestMarks([16.9, 16.9, 17.7])).toEqual([true, true, false])
  })
  it('compares to the agora, ignoring float noise', () => {
    expect(cheapestMarks([0.1 + 0.2, 0.3, 1])).toEqual([true, true, false])
  })
  it('marks nothing when all are equal or there is only one', () => {
    expect(cheapestMarks([5, 5])).toEqual([false, false])
    expect(cheapestMarks([5])).toEqual([false])
  })
})

describe('bestSplits', () => {
  const opts = { place: null, ctx }
  const store = (b: { chain: string; storeIdx: number }) => `${b.chain}${b.storeIdx}`

  it('sends each item to the cheaper store and covers items no single store has', () => {
    const lines = [line('milk', 2, item({ a0: 6, a1: 7, b0: 5 })), line('bread', 1, item({ a0: 10, a1: 9 })), line('soap', 1, item({ b0: 3 }))]
    const baskets = priceBasket(lines, stores, opts)
    const [split] = bestSplits(lines, baskets, ctx)
    expect(split.missing).toEqual([])
    expect(split.total).toBe(22) // bread 9 at a1, milk 2×5 + soap 3 at b0
    expect(split.parts.map(store)).toEqual(['b0', 'a1'])
    expect(split.parts[0].lines.map((l) => l.barcode)).toEqual(['milk', 'soap'])
    expect(splitWorthIt(split, rank(baskets, 'available')[0])).toBe(true) // the best single store misses an item
  })

  it("re-prices each store's share: a deal pooling items is lost when they are split", () => {
    const pair = promo({ kind: 'n_for_price', value: 12, min_qty: 2 }) // milk + bread for ₪12 at chain a
    const lines = [line('milk', 1, item({ a0: 6, b0: 4.4 }), { a: [pair] }), line('bread', 1, item({ a0: 10 }), { a: [pair] })]
    const baskets = priceBasket(lines, stores, opts)
    const single = rank(baskets, 'available')[0]
    expect(single.total).toBe(12)
    const [split] = bestSplits(lines, baskets, ctx)
    expect(split.total).toBe(14.4) // milk 4.4 at b0 (under 4.50, its share of the deal), bread alone 10
    expect(splitWorthIt(split, single)).toBe(false)
  })

  it('needs two stores and two items', () => {
    const lines = [line('milk', 1, item({ a0: 6, b0: 5 }))]
    expect(bestSplits(lines, priceBasket(lines, stores, opts), ctx)).toEqual([])
    const both = [line('milk', 1, item({ a0: 6, a1: 6, b0: 5 })), line('salt', 1, item({ a0: 2, a1: 2, b0: 1 }))]
    expect(bestSplits(both, priceBasket(both, stores, opts), ctx)).toEqual([]) // b0 is cheapest for everything
  })

  it('suggests a split only for a saving of at least ₪5 and 3%', () => {
    const lines = [line('wine', 1, item({ a0: 100, b0: 140 })), line('cheese', 1, item({ a0: 60, b0: 40 }))]
    const baskets = priceBasket(lines, stores, opts)
    const [split] = bestSplits(lines, baskets, ctx)
    expect(split.total).toBe(140)
    expect(splitWorthIt(split, rank(baskets, 'complete')[0])).toBe(true) // ₪160 → ₪140
    expect(splitWorthIt({ ...split, total: 156 }, rank(baskets, 'complete')[0])).toBe(false) // ₪4
    expect(splitWorthIt({ ...split, total: 155.5 }, { ...rank(baskets, 'complete')[0], total: 300 })).toBe(true)
  })
})
