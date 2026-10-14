import { describe, expect, it } from 'vitest'
import { ProductSearch } from './search'
import type { SearchRow } from './types'

// Real product names from the price files.
const rows: SearchRow[] = [
  ['1', 'ח.חלבון סופט ש.חלב קרמל', 'מדיטרנד', 3],
  ['2', 'שקדים בציפוי שוקולד לבן ושוקולד חלב 100 גרם', '', 3],
  ['3', 'חלב תנובה 3% שומן 2 ליטר', 'תנובה', 3],
  ['4', 'סוכריות לימון ללא סוכר 80גרם', '', 3],
  ['5', 'סוכר לבן 1 ק"ג', 'סוגת', 2],
  ['6', 'שוקולד פרה חלב 100ג עלית', 'עלית', 3],
]

const top = (q: string) => new ProductSearch(rows).search(q)[0]?.barcode

describe('search ranking', () => {
  it('a whole-word match beats a prefix match', () => {
    expect(top('חלב')).toBe('3')
    expect(top('סוכר')).toBe('5')
  })
  it('a name that is about the word beats one that repeats it', () => {
    expect(top('שוקולד')).toBe('6')
  })
  it('still finds products while the word is being typed', () => {
    expect(top('סוכרי')).toBe('4')
  })
})
