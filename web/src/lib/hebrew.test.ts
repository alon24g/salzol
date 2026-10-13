import { describe, expect, it } from 'vitest'
import { normalizeHebrew, tokenize } from './hebrew'

describe('normalizeHebrew', () => {
  it('maps final letters so prefixes match mid-word forms', () => {
    expect(normalizeHebrew('לחם')).toBe('לחמ')
    expect(normalizeHebrew('שמן זית')).toBe('שמנ זית')
  })
  it('strips niqqud', () => {
    expect(normalizeHebrew('חָלָב')).toBe('חלב')
  })
  it('treats geresh, gershayim and hyphens as separators', () => {
    expect(normalizeHebrew('קוקה-קולה')).toBe('קוקה קולה')
    expect(normalizeHebrew("במבה מאנצ' צ'דר")).toBe('במבה מאנצ צ דר')
    expect(normalizeHebrew('ק"ג')).toBe('ק ג')
  })
})

describe('tokenize', () => {
  it('splits numbers glued to units (real Rami Levy name)', () => {
    expect(tokenize('חטיף במבה מאנצ צדר60ג')).toEqual(['חטיפ', 'במבה', 'מאנצ', 'צדר', '60', 'ג'])
  })
  it('keeps decimals intact', () => {
    expect(tokenize('קוקה קולה 1.5 ליטר')).toEqual(['קוקה', 'קולה', '1.5', 'ליטר'])
  })
})
