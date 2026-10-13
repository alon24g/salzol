import { describe, expect, it } from 'vitest'
import { blocker, isActiveOn, priceAtStore, promoLabel, totalWithPromo, weekdayOf, type Promo, type PricingContext } from './promos'

// Cases mirror real promos verified in pipeline/tests/test_promos.py.
const base = { id: 'x', description: '', start: '2026-10-04T00:00', end: '2026-10-31T23:59' }
const ctx: PricingContext = { day: '2026-10-13', clubs: new Set() } // a Tuesday

const schweppes: Promo = { ...base, description: '2ב15שוופס', kind: 'n_for_price', value: 15, min_qty: 2 } // regular 8.90
const toothpaste: Promo = { ...base, description: '10.90משחת שיניים', kind: 'fixed_price', value: 10.9, min_qty: 1 } // regular 15.90
const oreo: Promo = { ...base, description: '1+1 אוראו', kind: 'buy_x_get_y', min_qty: 1, get_qty: 1 } // regular 11.90
const plates: Promo = { ...base, description: '2+1 הזול', kind: 'buy_x_get_y', min_qty: 2, get_qty: 1 }
const beefKg: Promo = { ...base, description: 'קשתית בקר ב69.90 מו9', kind: 'fixed_price', value: 69.9, min_qty: 0, max_qty: 9 }
const tofuMax: Promo = { ...base, description: 'טופו מקס ויקטורי', kind: 'fixed_price', value: 3.9, min_qty: 1, limit: 2, club_only: true, club_name: 'מקס ויקטורי' }
const vegan: Promo = { ...base, start: '2026-07-20T00:00', end: '2027-12-31T23:59', description: '2ב22 חטיף חלבון טבעוני', kind: 'n_for_price', value: 22, min_qty: 2, weekdays: [1, 2] }

describe('totalWithPromo', () => {
  it('n for price: groups of N, remainder at regular price', () => {
    expect(totalWithPromo(8.9, 1, schweppes)).toBe(8.9)
    expect(totalWithPromo(8.9, 2, schweppes)).toBe(15)
    expect(totalWithPromo(8.9, 3, schweppes)).toBe(23.9)
    expect(totalWithPromo(8.9, 4, schweppes)).toBe(30)
  })
  it('fixed price per unit', () => {
    expect(totalWithPromo(15.9, 3, toothpaste)).toBe(32.7)
  })
  it('1+1: every second unit free', () => {
    expect(totalWithPromo(11.9, 1, oreo)).toBe(11.9)
    expect(totalWithPromo(11.9, 2, oreo)).toBe(11.9)
    expect(totalWithPromo(11.9, 3, oreo)).toBe(23.8)
  })
  it('2+1: one free per three', () => {
    expect(totalWithPromo(10, 3, plates)).toBe(20)
    expect(totalWithPromo(10, 6, plates)).toBe(40)
  })
  it('weighted per-kg price applies to any weight, capped by MaxQty kg', () => {
    expect(totalWithPromo(89.9, 0.5, beefKg)).toBe(34.95)
    expect(totalWithPromo(89.9, 10, beefKg)).toBe(round(9 * 69.9 + 89.9))
  })
  it('redemption limit caps discounted units', () => {
    expect(totalWithPromo(9.9, 3, tofuMax)).toBe(round(2 * 3.9 + 9.9))
  })
  it('never costs more than the regular price', () => {
    const worse: Promo = { ...base, kind: 'n_for_price', value: 12, min_qty: 2 } // "2ב12" at 5.90 regular
    expect(totalWithPromo(5.9, 2, worse)).toBe(11.8)
  })
})

describe('dates and weekdays', () => {
  it('Victory weekday deal (PromotionDays 2,3 → Mon/Tue)', () => {
    expect(weekdayOf('2026-10-13')).toBe(2) // Tuesday
    expect(isActiveOn(vegan, '2026-10-13')).toBe(true)
    expect(isActiveOn(vegan, '2026-10-12')).toBe(true) // Monday
    expect(isActiveOn(vegan, '2026-10-14')).toBe(false) // Wednesday
  })
  it('never active outside its window', () => {
    expect(isActiveOn(schweppes, '2026-10-03')).toBe(false)
    expect(isActiveOn(schweppes, '2026-10-31')).toBe(true)
    expect(isActiveOn(schweppes, '2026-11-01')).toBe(false)
  })
})

describe('blockers', () => {
  it('club-only promos need membership of that chain', () => {
    expect(blocker(tofuMax, 'victory', 1, ctx)).toBe('club')
    expect(blocker(tofuMax, 'victory', 1, { ...ctx, clubs: new Set(['victory']) })).toBeNull()
    expect(blocker(tofuMax, 'victory', 1, { ...ctx, clubs: new Set(['shufersal']) })).toBe('club')
  })
  it('unknown and conditional promos are never applied', () => {
    expect(blocker({ ...base, kind: 'unknown' }, 'x', 5, ctx)).toBe('unknown')
    expect(blocker({ ...toothpaste, conditional: true }, 'x', 5, ctx)).toBe('conditional')
  })
  it('basket thresholds are left to the basket', () => {
    expect(blocker({ ...toothpaste, min_purchase: 50 }, 'x', 1, ctx)).toBe('min_purchase')
  })
  it('quantity thresholds', () => {
    expect(blocker(schweppes, 'x', 1, ctx)).toBe('min_qty')
    expect(blocker(oreo, 'x', 1, ctx)).toBe('min_qty') // need 2 to get the free one
    expect(blocker(oreo, 'x', 2, ctx)).toBeNull()
  })
})

describe('priceAtStore', () => {
  it('picks the best applicable promo and lists the rest', () => {
    const r = priceAtStore(8.9, 2, 'victory', 0, [schweppes, { ...toothpaste, value: 8 }], ctx)
    expect(r.total).toBe(15)
    expect(r.applied).toBe(schweppes)
  })
  it('respects store sets and shows non-applied promos with a reason', () => {
    const elsewhere = { ...toothpaste, s: [5] }
    const r = priceAtStore(15.9, 1, 'victory', 0, [elsewhere, tofuMax], ctx)
    expect(r.applied).toBeNull()
    expect(r.total).toBe(15.9)
    expect(r.other.map((o) => o.why)).toEqual(['club'])
  })
})

describe('promoLabel', () => {
  it('formats deals in Hebrew', () => {
    expect(promoLabel(schweppes)).toBe('2 ב-₪15')
    expect(promoLabel(oreo)).toBe('1+1')
    expect(promoLabel(beefKg)).toBe('₪69.90 לק"ג')
  })
})

function round(n: number) {
  return Math.round(n * 100) / 100
}
