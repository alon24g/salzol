import MiniSearch from 'minisearch'
import { canonicalBarcode } from './data'
import { normalizeHebrew, tokenize } from './hebrew'
import type { SearchRow } from './types'

export type SearchHit = { barcode: string; name: string; brand: string; chains: number }

type Doc = { id: string; name: string; brand: string; aliases: string; chains: number }

export class ProductSearch {
  private mini: MiniSearch<Doc>
  private byBarcode = new Map<string, SearchRow>()

  constructor(rows: SearchRow[]) {
    this.mini = new MiniSearch<Doc>({
      fields: ['name', 'aliases', 'brand'],
      storeFields: ['name', 'brand', 'chains'],
      tokenize,
      processTerm: (t) => normalizeHebrew(t) || null,
      searchOptions: {
        boost: { name: 3, aliases: 1.5 },
        prefix: true,
        // Short Hebrew words are dense; only allow typos in longer terms.
        fuzzy: (term) => (term.length >= 5 ? 0.2 : 0),
        combineWith: 'AND',
        // A whole-word hit must beat a prefix hit ("חלב" → milk before "חלבון"), and a name that
        // repeats the word ("שוקולד לבן ושוקולד חלב") must not outrank one that is about it.
        weights: { fuzzy: 0.2, prefix: 0.1 },
        bm25: { k: 0.5, b: 0.5, d: 0.5 },
      },
    })
    this.mini.addAll(
      rows.map(([id, name, brand, chains, aliases]) => {
        this.byBarcode.set(id, [id, name, brand, chains, aliases])
        return { id, name, brand, aliases: (aliases ?? []).join(' '), chains }
      }),
    )
  }

  search(query: string, limit = 50): SearchHit[] {
    const bc = canonicalBarcode(query)
    if (bc) {
      const row = this.byBarcode.get(bc)
      return row ? [{ barcode: row[0], name: row[1], brand: row[2], chains: row[3] }] : []
    }
    if (normalizeHebrew(query).length < 2) return []
    // Product names lead with what the product is ("חלב תנובה 3%", "סוכר לבן 1 ק"ג"), so a
    // name starting with the first query word is most likely what the user means.
    const lead = tokenize(query)[0]
    return (
      this.mini
        .search(query)
        .map((r) => {
          const hit: SearchHit = { barcode: r.id, name: r.name, brand: r.brand, chains: r.chains }
          // Relevance first; among near-equal scores prefer products sold by more chains.
          const rank = r.score * (1 + 0.15 * hit.chains) * (tokenize(hit.name)[0] === lead ? 1.6 : 1)
          return { hit, rank }
        })
        .sort((a, b) => b.rank - a.rank)
        .slice(0, limit)
        .map((r) => r.hit)
    )
  }
}
