import { describe, expect, it } from 'vitest'
import { canonicalBarcode, shardOf } from './data'
import { chainOffers, haversineKm, unitPrice, type Place } from './nearby'
import type { ItemPrices, StoresByChain } from './types'

const TEL_AVIV: Place = { lat: 32.07638, lon: 34.78933, label: 'תל אביב', source: 'city' }

const store = (id: string, city: string, lat: number | null, lon: number | null) => ({ id, name: `סניף ${id}`, city, address: '', lat, lon })

// Coordinates from data/settlements.json.
const stores: StoresByChain = {
  a: [
    store('1', 'תל אביב -יפו', 32.07638, 34.78933),
    store('2', 'ירושלים', 31.78379, 35.22049), // ~52 km from Tel Aviv
    store('3', 'רמת גן', 32.08227, 34.81065), // ~2 km
  ],
  b: [store('1', 'ירושלים', 31.78379, 35.22049), store('2', '', null, null)], // 2 = online store
}

const item: ItemPrices = {
  n: 'חלב',
  b: 'תנובה',
  w: false,
  size: [2000, 'ml', '100 מ"ל'],
  c: {
    a: { min: 12, max: 15, med: 14, p: [[12, [1]], [14, [0, 2]]] }, // cheapest (12) is in Jerusalem
    b: { min: 9, max: 9, med: 9, p: [[9, [0, 1]]] },
  },
}

describe('chainOffers', () => {
  it('only counts stores within the radius', () => {
    const offers = chainOffers(item, stores, TEL_AVIV, 20)
    expect(offers.map((o) => o.chain)).toEqual(['a']) // chain b has no store in range
    expect(offers[0].cheapest.price).toBe(14) // Jerusalem's 12 is out of range
    expect(offers[0].storesAtCheapest).toBe(2)
    expect(offers[0].cheapest.store.id).toBe('1') // same price → nearest first
  })

  it('without a place, uses all stores nationwide and sorts chains by price', () => {
    const offers = chainOffers(item, stores, null)
    expect(offers.map((o) => [o.chain, o.cheapest.price])).toEqual([
      ['b', 9],
      ['a', 12],
    ])
  })

  it('a larger radius brings far stores in', () => {
    const offers = chainOffers(item, stores, TEL_AVIV, 60)
    expect(offers.map((o) => [o.chain, o.cheapest.price])).toEqual([
      ['b', 9],
      ['a', 12],
    ])
    // the online store (no coordinates) is never "near"
    expect(offers[0].offers).toHaveLength(1)
  })
})

describe('haversineKm', () => {
  it('Tel Aviv → Jerusalem is ~52 km', () => {
    const d = haversineKm(TEL_AVIV, { lat: 31.78379, lon: 35.22049 })
    expect(d).toBeGreaterThan(50)
    expect(d).toBeLessThan(55)
  })
})

describe('unitPrice', () => {
  it('per 100 ml / 100 g', () => {
    expect(unitPrice(14.7, [2000, 'ml', '100 מ"ל'], false)).toEqual({ value: 0.735, per: '100 מ"ל' })
  })
  it('weighted items are already per kg', () => {
    expect(unitPrice(59.9, [1000, 'g', '100 גרם'], true)).toEqual({ value: 59.9, per: 'ק"ג' })
  })
  it('unknown size → none', () => {
    expect(unitPrice(10, null, false)).toBeNull()
  })
})

describe('barcodes', () => {
  it('canonicalizes like the pipeline', () => {
    expect(canonicalBarcode('7290116936291')).toBe('7290116936291')
    expect(canonicalBarcode('0010900302814')).toBe('0010900302814')
    expect(canonicalBarcode('10900302814')).toBe('0010900302814')
    expect(canonicalBarcode('במבה')).toBeNull()
    expect(canonicalBarcode('1234')).toBeNull()
  })
  it('shard matches Python int(barcode) % 256', () => {
    // 7290116936291 % 256 == 99, computed with Python
    expect(shardOf('7290116936291')).toBe(String(7290116936291 % 256).padStart(3, '0'))
  })
})
