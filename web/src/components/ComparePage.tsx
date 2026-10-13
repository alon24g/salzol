import { useEffect, useMemo, useState } from 'react'
import { bestPerChain, priceBasket, rank, type BasketLine, type RankMode, type StoreBasket } from '../lib/basket'
import { loadItem, loadItemPromos, loadMeta, loadStores } from '../lib/data'
import { formatKm, formatPrice } from '../lib/format'
import { useLists } from '../lib/lists'
import { DEFAULT_RADIUS_KM, type Place } from '../lib/nearby'
import { promoLabel, type PricingContext } from '../lib/promos'
import { listHref, productHref } from '../lib/router'
import type { Meta, StoresByChain } from '../lib/types'

type View = 'chains' | 'stores'
type Loaded = { key: string; lines: BasketLine[]; stores: StoresByChain; meta: Meta }

const STORES_SHOWN = 20

export function ComparePage({ place, ctx }: { place: Place | null; ctx: PricingContext }) {
  const { active } = useLists()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<RankMode>('complete')
  const [view, setView] = useState<View>('chains')

  // Reload when the list's items change (not on every quantity tweak: quantities are re-read below).
  const key = active.items.map((i) => i.barcode).join(',')
  useEffect(() => {
    let live = true
    Promise.all([
      Promise.all(
        active.items.map(async (li) => {
          const item = await loadItem(li.barcode)
          return { barcode: li.barcode, item, promos: item ? await loadItemPromos(item) : {} }
        }),
      ),
      loadStores(),
      loadMeta(),
    ])
      .then(([rows, stores, meta]) => {
        if (!live) return
        const lines = rows.map((r) => {
          const li = active.items.find((i) => i.barcode === r.barcode)!
          return { ...r, name: li.name, qty: li.qty, weighted: r.item?.w ?? li.weighted }
        })
        setLoaded({ key, lines, stores, meta })
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const data = loaded?.key === key ? loaded : null
  const lines = useMemo(
    () =>
      data?.lines.map((l) => {
        const li = active.items.find((i) => i.barcode === l.barcode)
        return li ? { ...l, qty: li.qty } : l
      }) ?? [],
    [data, active.items],
  )
  const baskets = useMemo(() => (data ? priceBasket(lines, data.stores, { place, ctx }) : []), [data, lines, place, ctx])

  if (!active.items.length)
    return (
      <p data-testid="compare-empty">
        הרשימה ריקה. <a href="#/" className="text-emerald-800 underline">חפשו מוצרים</a> והוסיפו אותם לרשימה.
      </p>
    )
  if (failed) return <p role="alert" className="text-red-700">טעינת המחירים נכשלה. נסו לרענן את הדף.</p>
  if (!data) return <p className="text-stone-500">מחשב את הסל…</p>

  const results: StoreBasket[] = view === 'chains' ? bestPerChain(baskets, mode) : rank(baskets, mode).slice(0, STORES_SHOWN)
  // "Savings vs. the most expensive" only compares baskets that have every item.
  const complete = results.filter((r) => r.missing.length === 0)
  const mostExpensive = complete.length > 1 ? Math.max(...complete.map((r) => r.total)) : null
  const notFound = lines.filter((l) => !l.item)
  const hiddenIncomplete = mode === 'complete' ? rank(baskets, 'available').length - rank(baskets, 'complete').length : 0

  return (
    <section className="flex flex-col gap-4" data-testid="compare-page">
      <header className="flex flex-col gap-1">
        <a href={listHref} className="text-sm text-emerald-800 underline">→ חזרה לרשימה</a>
        <h1 className="text-2xl font-bold">השוואת סל: {active.name}</h1>
        <p className="text-sm text-stone-500">
          {active.items.length} מוצרים · {place ? `חנויות עד ${DEFAULT_RADIUS_KM} ק"מ מ${place.label}` : 'כל הארץ (לא נבחר מיקום)'}
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="תצוגה">
        <Toggle on={view === 'chains'} onClick={() => setView('chains')} testId="view-chains">לפי רשת</Toggle>
        <Toggle on={view === 'stores'} onClick={() => setView('stores')} testId="view-stores">לפי סניף</Toggle>
        <span className="mx-1 border-s border-stone-300" />
        <Toggle on={mode === 'complete'} onClick={() => setMode('complete')} testId="mode-complete">רק סניפים עם כל המוצרים</Toggle>
        <Toggle on={mode === 'available'} onClick={() => setMode('available')} testId="mode-available">כל הסניפים (הכי פחות חוסרים)</Toggle>
      </div>

      {notFound.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="not-found-items">
          לא נמצאו בנתונים העדכניים: {notFound.map((l) => l.name).join(', ')}
        </p>
      )}

      {results.length === 0 ? (
        <p className="rounded-lg bg-stone-100 p-3" data-testid="compare-no-results">
          {mode === 'complete'
            ? 'אין סניף בטווח שיש בו את כל המוצרים. נסו „כל הסניפים (הכי פחות חוסרים)”.'
            : 'אין סניפים בטווח שמוכרים את המוצרים ברשימה.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="compare-results">
          {results.map((b, i) => (
            <BasketCard
              key={`${b.chain}:${b.storeIdx}`}
              basket={b}
              chainName={data.meta.chains[b.chain]?.name ?? b.chain}
              best={i === 0 && results.length > 1}
              vsMax={mostExpensive != null && b.missing.length === 0 ? mostExpensive - b.total : 0}
              showMissing={mode === 'available'}
              storesCompared={'storesCompared' in b ? (b as { storesCompared: number }).storesCompared : undefined}
            />
          ))}
        </ol>
      )}
      {hiddenIncomplete > 0 && (
        <p className="text-sm text-stone-500" data-testid="hidden-incomplete">
          {hiddenIncomplete} סניפים נוספים בטווח חסרים מוצרים מהרשימה ולכן לא מוצגים.
        </p>
      )}
    </section>
  )
}

function Toggle({ on, onClick, children, testId }: { on: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm ${on ? 'bg-emerald-700 text-white' : 'border border-stone-300 bg-white'}`}
      data-testid={testId}
    >
      {children}
    </button>
  )
}

function BasketCard({
  basket: b,
  chainName,
  best,
  vsMax,
  showMissing,
  storesCompared,
}: {
  basket: StoreBasket
  chainName: string
  best: boolean
  vsMax: number
  showMissing: boolean
  storesCompared?: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <li
      className={`rounded-xl border bg-white p-4 shadow-sm ${best ? 'border-emerald-600 ring-1 ring-emerald-600' : 'border-stone-200'}`}
      data-testid="basket"
      data-chain={b.chain}
      data-missing={b.missing.length}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 text-lg font-semibold">
            {chainName}
            {best && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white" data-testid="basket-best">הכי זול</span>}
          </span>
          <span className="text-sm text-stone-600" data-testid="basket-store">
            {b.store.name}
            {b.store.city && b.store.city !== b.store.name && `, ${b.store.city}`}
            {b.distanceKm != null && ` · ${formatKm(b.distanceKm)}`}
          </span>
          {storesCompared != null && storesCompared > 1 && (
            <span className="text-xs text-stone-500">הסניף הזול מבין {storesCompared} סניפים</span>
          )}
          {showMissing && b.missing.length > 0 && (
            <span className="text-sm font-medium text-amber-800" data-testid="basket-missing">
              חסרים {b.missing.length} מוצרים
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-2xl font-bold" data-testid="basket-total">{formatPrice(b.total)}</span>
          {b.savings > 0.004 && (
            <span className="text-xs text-emerald-800" data-testid="basket-savings">
              כולל מבצעים: −{formatPrice(b.savings)}
            </span>
          )}
          {vsMax > 0.004 && (
            <span className="text-xs text-stone-500" data-testid="basket-vs-max">
              {formatPrice(vsMax)} פחות מהיקר ביותר
            </span>
          )}
        </div>
      </div>

      <button type="button" className="mt-2 text-sm text-emerald-800 underline" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="basket-toggle">
        {open ? 'הסתר פירוט' : 'פירוט לפי מוצר'}
      </button>
      {open && (
        <table className="mt-2 w-full text-sm" data-testid="basket-lines">
          <thead className="text-start text-xs text-stone-500">
            <tr>
              <th className="py-1 text-start font-normal">מוצר</th>
              <th className="py-1 text-start font-normal">מחיר רגיל</th>
              <th className="py-1 text-start font-normal">לתשלום</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {b.lines.map((l) => (
              <tr key={l.barcode} data-testid="basket-line">
                <td className="py-1.5 pe-2">
                  <a href={productHref(l.barcode)} className="font-medium">{l.name}</a>
                  <span className="text-stone-500"> × {l.qty}</span>
                  {l.promo && (
                    <span className="block text-xs text-emerald-800" data-testid="basket-line-promo">
                      מבצע: {promoLabel(l.promo)}
                      {l.promo.min_purchase ? ` (בקנייה מעל ${formatPrice(l.promo.min_purchase)})` : ''}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pe-2 text-stone-500">{formatPrice(l.regularTotal)}</td>
                <td className="py-1.5 font-medium">{formatPrice(l.total)}</td>
              </tr>
            ))}
            {b.missing.map((m) => (
              <tr key={m.barcode} className="text-stone-400" data-testid="basket-line-missing">
                <td className="py-1.5" colSpan={3}>{m.name} — לא נמכר בסניף הזה</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  )
}
