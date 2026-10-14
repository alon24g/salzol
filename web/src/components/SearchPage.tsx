import { useEffect, useMemo, useRef, useState } from 'react'
import { loadItem, loadSearch } from '../lib/data'
import { listsStore, useLists } from '../lib/lists'
import { listHref, productHref, searchHref } from '../lib/router'
import { ProductSearch } from '../lib/search'

let searchPromise: Promise<ProductSearch> | null = null
function getSearch(): Promise<ProductSearch> {
  searchPromise ??= loadSearch().then((rows) => new ProductSearch(rows))
  searchPromise.catch(() => (searchPromise = null))
  return searchPromise
}

const QUICK = ['חלב', 'ביצים', 'לחם', 'במבה', 'קפה', 'קוטג', 'שמן קנולה', 'אורז', 'טונה', 'קוקה קולה']

const STEPS = [
  { icon: '🔍', title: 'מחפשים מוצר', text: 'לפי שם או ברקוד, מתוך עשרות אלפי מוצרים' },
  { icon: '📍', title: 'בוחרים איפה', text: 'המיקום שלכם או עיר — ורק סופרים קרובים' },
  { icon: '💰', title: 'רואים איפה הכי זול', text: 'כולל מבצעים, ועם רשימה — את כל הסל' },
]

type Props = { initialQuery: string; hasPlace: boolean; listCount: number }

export function SearchPage({ initialQuery, hasPlace, listCount }: Props) {
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

  const searchFor = (q: string) => {
    setQuery(q)
    ensureLoaded()
    inputRef.current?.focus()
  }

  return (
    <section className="flex flex-col gap-4">
      {!trimmed && (
        <div className="flex flex-col gap-1.5 pt-1 text-center" data-testid="hero">
          <h1 className="font-display text-3xl font-extrabold text-stone-900 sm:text-4xl">
            מה קונים היום? <span aria-hidden>🛒</span>
          </h1>
          <p className="text-stone-600">
            משווים מחירים בין שופרסל, רמי לוי וויקטורי — ומוצאים איפה הכי זול {hasPlace ? 'בסופרים לידכם' : 'בסופרים הקרובים אליכם'}.
          </p>
        </div>
      )}

      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-xl" aria-hidden>
          🔍
        </span>
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full rounded-2xl border-2 border-stone-200 bg-white py-4 ps-12 pe-4 text-lg shadow-sm transition placeholder:text-stone-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          placeholder="מה מחפשים? למשל: חלב, במבה, קפה…"
          aria-label="חיפוש מוצר לפי שם או ברקוד"
          value={query}
          onFocus={ensureLoaded}
          onChange={(e) => {
            setQuery(e.target.value)
            ensureLoaded()
          }}
          data-testid="search-input"
        />
      </div>

      {!trimmed && (
        <>
          <div className="flex flex-wrap justify-center gap-2" data-testid="quick-searches">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                className="rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50 hover:text-brand-800"
                onClick={() => searchFor(q)}
                data-testid="quick-search"
              >
                {q}
              </button>
            ))}
          </div>

          {listCount > 0 && (
            <a href={listHref} className="card flex items-center justify-between gap-3 border-brand-100 bg-brand-50 px-4 py-3" data-testid="hero-list">
              <span>
                <span aria-hidden>📝</span> ברשימה שלכם {listCount === 1 ? 'מוצר אחד' : `${listCount} מוצרים`}
              </span>
              <span className="font-semibold text-brand-800">להשוואת הסל ←</span>
            </a>
          )}

          <ol className="grid gap-3 pt-2 sm:grid-cols-3" data-testid="how-it-works">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card flex items-start gap-3 p-4 sm:flex-col sm:items-center sm:text-center">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-2xl" aria-hidden>
                  {s.icon}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-display font-bold">
                    {i + 1}. {s.title}
                  </span>
                  <span className="text-sm text-stone-600">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {error && (
        <p className="text-red-700" role="alert">
          טעינת המוצרים נכשלה. נסו לרענן את הדף.
        </p>
      )}
      {!engine && !error && trimmed.length > 0 && <p className="text-stone-500">טוען מוצרים…</p>}
      {engine && trimmed.length >= 2 && hits.length === 0 && (
        <p className="card p-4 text-center text-stone-600" data-testid="search-empty">
          לא מצאנו מוצרים עבור „{trimmed}”. נסו מילה אחרת או ברקוד.
        </p>
      )}

      {hits.length > 0 && (
        <ul className="card divide-y divide-stone-100 overflow-hidden" data-testid="search-results">
          {hits.map((h) => (
            <li key={h.barcode} className="flex items-stretch">
              <a href={productHref(h.barcode)} className="flex flex-1 items-center justify-between gap-3 px-4 py-3 transition hover:bg-brand-50/60" data-testid="search-result">
                <span className="flex flex-col">
                  <span className="font-medium">{h.name}</span>
                  <span className="text-sm text-stone-500">
                    {h.brand && `${h.brand} · `}
                    <span dir="ltr">{h.barcode}</span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                  {h.chains === 1 ? 'רשת אחת' : `${h.chains} רשתות`}
                </span>
              </a>
              <button
                type="button"
                className={`shrink-0 border-s border-stone-100 px-3 text-sm font-semibold transition ${inList.has(h.barcode) ? 'text-stone-400' : 'text-brand-700 hover:bg-brand-50'}`}
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
