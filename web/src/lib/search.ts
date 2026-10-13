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
    return (
      this.mini
        .search(query)
        // Relevance first; among near-equal scores prefer products sold by more chains.
        .sort((a, b) => b.score * (1 + 0.15 * b.chains) - a.score * (1 + 0.15 * a.chains))
        .slice(0, limit)
        .map((r) => ({ barcode: r.id, name: r.name, brand: r.brand, chains: r.chains }))
    )
  }
}
