import { useEffect, useMemo, useRef, useState } from 'react'
import { loadItem, loadSearch } from '../lib/data'
import { listsStore, useLists } from '../lib/lists'
import { productHref, searchHref } from '../lib/router'
import { ProductSearch } from '../lib/search'

let searchPromise: Promise<ProductSearch> | null = null
function getSearch(): Promise<ProductSearch> {
  searchPromise ??= loadSearch().then((rows) => new ProductSearch(rows))
  searchPromise.catch(() => (searchPromise = null))
  return searchPromise
}

export function SearchPage({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery)
  const [engine, setEngine] = useState<ProductSearch | null>(null)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // The index (~1.4 MB gz) loads on first interaction, not on page load.
  const ensureLoaded = () => {
    if (engine) return
    getSearch()
      .then(setEngine)
      .catch(() => setError(true))
  }
  useEffect(() => {
    if (initialQuery) ensureLoaded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the query in the URL so back/forward from a product returns to the results.
  useEffect(() => {
    const t = setTimeout(() => history.replaceState(null, '', searchHref(query.trim())), 300)
    return () => clearTimeout(t)
  }, [query])

  const { active } = useLists()
  const inList = new Set(active.items.map((i) => i.barcode))
  const hits = useMemo(() => (engine ? engine.search(query) : []), [engine, query])
  const trimmed = query.trim()

  return (
    <section className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">חיפוש מוצר</span>
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg shadow-sm focus:border-emerald-600 focus:outline-none"
          placeholder="שם מוצר או ברקוד, למשל: במבה, חלב 3%"
          value={query}
          onFocus={ensureLoaded}
          onChange={(e) => {
            setQuery(e.target.value)
            ensureLoaded()
          }}
          data-testid="search-input"
        />
      </label>

      {error && (
        <p className="text-red-700" role="alert">
          טעינת המוצרים נכשלה. נסו לרענן את הדף.
        </p>
      )}
      {!engine && !error && trimmed.length > 0 && <p className="text-stone-500">טוען מוצרים…</p>}
      {engine && trimmed.length >= 2 && hits.length === 0 && (
        <p className="text-stone-600" data-testid="search-empty">
          לא נמצאו מוצרים עבור „{trimmed}”
        </p>
      )}

      {hits.length > 0 && (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white" data-testid="search-results">
          {hits.map((h) => (
            <li key={h.barcode} className="flex items-stretch">
              <a href={productHref(h.barcode)} className="flex flex-1 items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50" data-testid="search-result">
                <span className="flex flex-col">
                  <span className="font-medium">{h.name}</span>
                  <span className="text-sm text-stone-500">
                    {h.brand && `${h.brand} · `}
                    <span dir="ltr">{h.barcode}</span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-600">
                  {h.chains === 1 ? 'רשת אחת' : `${h.chains} רשתות`}
                </span>
              </a>
              <button
                type="button"
                className={`shrink-0 border-s border-stone-200 px-3 text-sm ${inList.has(h.barcode) ? 'text-stone-400' : 'text-emerald-800'}`}
                aria-label={`הוספת ${h.name} לרשימה`}
                onClick={async () => {
                  // Search rows don't say whether an item is sold by weight; its price shard does.
                  const it = await loadItem(h.barcode).catch(() => null)
                  listsStore.addItem({ barcode: h.barcode, name: h.name, weighted: it?.w ?? false }, 1)
                }}
                data-testid="add-to-list"
              >
                {inList.has(h.barcode) ? '✓ ברשימה' : '+ לרשימה'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
