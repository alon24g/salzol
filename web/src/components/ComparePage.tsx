import { Fragment, useEffect, useMemo, useState } from 'react'
import { bestPerChain, bestSplits, cheapestMarks, priceBasket, rank, splitWorthIt, type BasketLine, type RankMode, type SplitBasket, type StoreBasket } from '../lib/basket'
import { loadItem, loadItemPromos, loadMeta, loadStores } from '../lib/data'
import { formatKm, formatPrice } from '../lib/format'
import { useLists } from '../lib/lists'
import { haversineKm, type Place } from '../lib/nearby'
import { promoLabel, type PricingContext } from '../lib/promos'
import { listHref, productHref } from '../lib/router'
import type { Meta, StoresByChain } from '../lib/types'

type View = 'chains' | 'stores'
type Loaded = { key: string; lines: BasketLine[]; stores: StoresByChain; meta: Meta }

const STORES_SHOWN = 20
const CHAINS_SHOWN = 10

export function ComparePage({ place, radiusKm, ctx }: { place: Place | null; radiusKm: number; ctx: PricingContext }) {
  const { active } = useLists()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<RankMode>('complete')
  const [view, setView] = useState<View>('chains')
  const [allChains, setAllChains] = useState(false)

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
  const baskets = useMemo(() => (data ? priceBasket(lines, data.stores, { place, radiusKm, ctx }) : []), [data, lines, place, radiusKm, ctx])
  const splits = useMemo(() => bestSplits(lines, baskets, ctx), [lines, baskets, ctx])

  if (!active.items.length)
    return (
      <p data-testid="compare-empty">
        הרשימה ריקה. <a href="#/" className="link">חפשו מוצרים</a> והוסיפו אותם לרשימה.
      </p>
    )
  if (failed)
    return (
      <p role="alert" className="text-red-700" data-testid="compare-error">
        {navigator.onLine ? 'טעינת המחירים נכשלה. נסו לרענן את הדף.' : 'חלק מהמחירים לא נשמרו במכשיר, ואין חיבור לאינטרנט. נסו שוב כשתהיו מחוברים.'}
      </p>
    )
  if (!data) return <p className="text-stone-500">מחשב את הסל…</p>

  const perChain = view === 'chains' ? bestPerChain(baskets, mode) : []
  const results: StoreBasket[] =
    view === 'chains' ? perChain.slice(0, allChains ? undefined : CHAINS_SHOWN) : rank(baskets, mode).slice(0, STORES_SHOWN)
  // "Savings vs. the most expensive" only compares baskets that have every item.
  const complete = results.filter((r) => r.missing.length === 0)
  const mostExpensive = complete.length > 1 ? Math.max(...complete.map((r) => r.total)) : null
  // The badge goes to the cheapest among the baskets missing as few items as the top one.
  const best = cheapestMarks(results.map((r) => (r.missing.length === results[0]?.missing.length ? r.total : Infinity)))
  const notFound = lines.filter((l) => !l.item)
  const bestSingle = rank(baskets, mode)[0]
  const split = splits.find((s) => (mode === 'available' || s.missing.length === 0) && splitWorthIt(s, bestSingle))
  // Shown right after the best single store: that stays the main answer, the split is the alternative.
  const splitCard = split && <SplitCard split={split} single={bestSingle} chainName={(c) => data.meta.chains[c]?.name ?? c} />
  const hiddenIncomplete = mode === 'complete' ? rank(baskets, 'available').length - rank(baskets, 'complete').length : 0

  return (
    <section className="flex flex-col gap-4" data-testid="compare-page">
      <header className="flex flex-col gap-1">
        <a href={listHref} className="link self-start text-sm">→ חזרה לרשימה</a>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">השוואת סל: {active.name}</h1>
        <p className="text-sm text-stone-500">
          {active.items.length} מוצרים · {place ? `סופרים עד ${radiusKm} ק"מ מ${place.label}` : 'כל הארץ (לא נבחר מיקום)'}
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
        <>
          <p className="card p-4 text-stone-700" data-testid="compare-no-results">
            {mode === 'complete'
              ? `אין סופר עד ${radiusKm} ק"מ שיש בו את כל המוצרים. נסו „כל הסניפים (הכי פחות חוסרים)” או הגדילו את המרחק למעלה.`
              : `אין סופרים עד ${radiusKm} ק"מ שמוכרים את המוצרים ברשימה. אפשר להגדיל את המרחק למעלה.`}
          </p>
          {splitCard}
        </>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="compare-results">
          {results.map((b, i) => (
            <Fragment key={`${b.chain}:${b.storeIdx}`}>
              <BasketCard
                basket={b}
                chainName={data.meta.chains[b.chain]?.name ?? b.chain}
                best={best[i]}
                vsMax={mostExpensive != null && b.missing.length === 0 ? mostExpensive - b.total : 0}
                showMissing={mode === 'available'}
                storesCompared={'storesCompared' in b ? (b as { storesCompared: number }).storesCompared : undefined}
              />
              {i === 0 && splitCard && <li>{splitCard}</li>}
            </Fragment>
          ))}
        </ol>
      )}
      {perChain.length > results.length && (
        <button type="button" className="btn-soft self-center" onClick={() => setAllChains(true)} data-testid="show-all-chains">
          הצגת כל {perChain.length} הרשתות
        </button>
      )}
      {hiddenIncomplete > 0 && (
        <p className="text-sm text-stone-500" data-testid="hidden-incomplete">
          {hiddenIncomplete} סניפים נוספים באזור חסרים מוצרים מהרשימה ולכן לא מוצגים.
        </p>
      )}
    </section>
  )
}

function SplitCard({ split, single, chainName }: { split: SplitBasket; single: StoreBasket | undefined; chainName: (chain: string) => string }) {
  const saved = single && single.missing.length === split.missing.length ? single.total - split.total : 0
  const [a, b] = split.parts.map((p) => p.store)
  // Stores are located at their city's center, so a distance only means something across cities.
  const apart =
    a.city !== b.city && a.lat != null && a.lon != null && b.lat != null && b.lon != null
      ? haversineKm({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon })
      : null
  return (
    <section className="card border-dashed border-brand-600 p-4" data-testid="split" aria-labelledby="split-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="split-title" className="font-display text-lg font-bold">🛍️ או: קנייה בשני סניפים</h2>
          <span className="text-sm text-stone-600" data-testid="split-why">
            {saved > 0
              ? `${formatPrice(saved)} פחות מהסניף הזול ביותר`
              : split.missing.length === 0
                ? 'יחד יש בהם את כל המוצרים ברשימה'
                : `חסרים רק ${split.missing.length} מוצרים`}
          </span>
          {apart != null && (
            <span className="text-xs text-stone-500" data-testid="split-apart">
              {a.city} ו{b.city}: {formatKm(apart)} זו מזו
            </span>
          )}
        </div>
        <span className="shrink-0 font-display text-2xl font-extrabold text-brand-800" data-testid="split-total">{formatPrice(split.total)}</span>
      </div>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2">
        {split.parts.map((p) => (
          <li key={`${p.chain}:${p.storeIdx}`} className="rounded-lg bg-stone-50 p-3" data-testid="split-part" data-chain={p.chain}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">{chainName(p.chain)}</span>
              <span className="font-medium" data-testid="split-part-total">{formatPrice(p.total)}</span>
            </div>
            <span className="block text-sm text-stone-600">
              {p.store.name}
              {p.store.city && p.store.city !== p.store.name && `, ${p.store.city}`}
              {p.distanceKm != null && ` · ${formatKm(p.distanceKm)}`}
            </span>
            <ul className="mt-1.5 text-sm">
              {p.lines.map((l) => (
                <li key={l.barcode} data-testid="split-line">
                  <a href={productHref(l.barcode)}>{l.name}</a>
                  <span className="text-stone-500"> × {l.qty}</span>
                  {l.promo && <span className="text-xs text-emerald-800"> · מבצע: {promoLabel(l.promo)}</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {split.missing.length > 0 && (
        <p className="mt-2 text-sm text-amber-800" data-testid="split-missing">
          לא נמכרים באף אחד מהשניים: {split.missing.map((m) => m.name).join(', ')}
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
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${on ? 'bg-brand-700 text-white shadow-sm' : 'border border-stone-200 bg-white hover:border-brand-600'}`}
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
      className={`card p-4 ${best ? 'border-brand-600 ring-2 ring-brand-600/70' : ''}`}
      data-testid="basket"
      data-chain={b.chain}
      data-missing={b.missing.length}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 font-display text-lg font-bold">
            {chainName}
            {best && <span className="badge-best" data-testid="basket-best">🏆 הכי זול</span>}
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
          <span className="font-display text-2xl font-extrabold text-brand-800" data-testid="basket-total">{formatPrice(b.total)}</span>
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

      <button type="button" className="btn-soft mt-3" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="basket-toggle">
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
