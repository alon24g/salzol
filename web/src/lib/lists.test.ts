import { describe, expect, it } from 'vitest'
import { decodeShare, encodeShare, exportJson, importJson, ImportError, type ShoppingList } from './lists'

const list: ShoppingList = {
  id: 'x',
  name: 'קניות לשבת',
  updated: '2026-10-13T10:00:00Z',
  items: [
    { barcode: '7290116936291', name: 'חלב תנובה 3% שומן 2 ליטר', qty: 2, weighted: false },
    { barcode: '7290000066318', name: 'במבה', qty: 3, weighted: false },
  ],
}

describe('share links', () => {
  it('round-trips name, barcodes and quantities', () => {
    const decoded = decodeShare(encodeShare(list))
    expect(decoded).toEqual({
      name: 'קניות לשבת',
      items: [
        { barcode: '7290116936291', qty: 2 },
        { barcode: '7290000066318', qty: 3 },
      ],
    })
  })
  it('stays short enough for a URL', () => {
    const big = { ...list, items: Array.from({ length: 40 }, (_, k) => ({ ...list.items[0], barcode: String(7290000000000 + k) })) }
    expect(encodeShare(big).length).toBeLessThan(1000)
  })
  it('rejects garbage', () => {
    expect(decodeShare('not-a-list')).toBeNull()
  })
})

describe('export / import', () => {
  it('round-trips a list', () => {
    expect(importJson(exportJson(list))).toEqual({ name: list.name, items: list.items })
  })
  it('drops invalid items and rejects foreign files', () => {
    const text = JSON.stringify({ format: 'salzol-list', name: 'x', items: [{ barcode: 'abc', qty: 1 }, { barcode: '7290116936291', qty: -1 }, list.items[0]] })
    expect(importJson(text).items).toEqual([list.items[0]])
    expect(() => importJson('{"hello":1}')).toThrow(ImportError)
    expect(() => importJson('nope')).toThrow(ImportError)
  })
})
