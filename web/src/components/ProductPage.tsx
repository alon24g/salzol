import { useEffect, useMemo, useState } from 'react'
import { loadItem, loadMeta, loadStores } from '../lib/data'
import { formatKm, formatPrice, formatUpdated } from '../lib/format'
import { DEFAULT_RADIUS_KM, chainOffers, unitPrice, type ChainOffer, type Place } from '../lib/nearby'
import type { ItemPrices, Meta, StoresByChain } from '../lib/types'

type Loaded = { barcode: string; item: ItemPrices | null; stores: StoresByChain; meta: Meta }

export function ProductPage({ barcode, place }: { barcode: string; place: Place | null }) {
  // Results are keyed by barcode so navigating to another product never shows stale data.
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([loadItem(barcode), loadStores(), loadMeta()])
      .then(([item, stores, meta]) => live && setLoaded({ barcode, item, stores, meta }))
      .catch(() => live && setFailed(barcode))
    return () => {
      live = false
    }
  }, [barcode])

  const data = loaded?.barcode === barcode ? loaded : null
  const error = failed === barcode

  const offers = useMemo(
    () => (data?.item ? chainOffers(data.item, data.stores, place) : []),
    [data, place],
  )

  if (error) return <p role="alert" className="text-red-700">טעינת המוצר נכשלה. נסו לרענן את הדף.</p>
  if (!data) return <p className="text-stone-500">טוען…</p>
  if (!data.item)
    return (
      <p data-testid="product-not-found">
        לא מצאנו את הברקוד <span dir="ltr">{barcode}</span>.{' '}
        <a href="#/" className="text-emerald-800 underline">חזרה לחיפוש</a>
      </p>
    )

  const { item, meta } = data
  const totalChains = Object.keys(item.c).length

  return (
    <article className="flex flex-col gap-4" data-testid="product-page">
      <header>
        <a href="#/" onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back() } }} className="text-sm text-emerald-800 underline">
          → חזרה
        </a>
        <h1 className="mt-1 text-2xl font-bold" data-testid="product-name">{item.n}</h1>
        <p className="text-sm text-stone-500">
          {item.b && `${item.b} · `}
          {item.size && !item.w && `${sizeLabel(item.size)} · `}
          {item.w && 'נמכר במשקל · '}
          ברקוד <span dir="ltr">{barcode}</span>
        </p>
      </header>

      {!place && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="no-place-note">
          לא נבחר מיקום — מוצגים המחירים הזולים ביותר בכל הארץ. בחרו מיקום למעלה כדי לראות חנויות עד {DEFAULT_RADIUS_KM} ק"מ מכם.
        </p>
      )}

      {offers.length === 0 ? (
        <p className="rounded-lg bg-stone-100 p-3" data-testid="no-offers">
          אין חנויות של הרשתות שמוכרות את המוצר במרחק {DEFAULT_RADIUS_KM} ק"מ מ{place?.label}.
        </p>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="chain-offers">
          {offers.map((o, i) => (
            <ChainRow key={o.chain} offer={o} best={i === 0 && offers.length > 1} item={item} meta={meta} hasPlace={!!place} />
          ))}
        </ol>
      )}

      {place && offers.length < totalChains && (
        <p className="text-sm text-stone-500" data-testid="missing-chains">
          {totalChains - offers.length === 1 ? 'רשת אחת נוספת מוכרת' : `${totalChains - offers.length} רשתות נוספות מוכרות`} את המוצר, אבל אין לה סניף בטווח.
        </p>
      )}
    </article>
  )
}

function sizeLabel([amount, base]: [number, string, string]): string {
  if (base === 'g') return amount >= 1000 ? `${amount / 1000} ק"ג` : `${amount} גרם`
  if (base === 'ml') return amount >= 1000 ? `${amount / 1000} ליטר` : `${amount} מ"ל`
  if (base === 'unit') return `${amount} יחידות`
  return `${amount} מטר`
}

function ChainRow({ offer, best, item, meta, hasPlace }: { offer: ChainOffer; best: boolean; item: ItemPrices; meta: Meta; hasPlace: boolean }) {
  const [open, setOpen] = useState(false)
  const chain = meta.chains[offer.chain]
  const up = unitPrice(offer.cheapest.price, item.size, item.w)
  const { store, distanceKm } = offer.cheapest

  return (
    <li
      className={`rounded-xl border bg-white p-4 shadow-sm ${best ? 'border-emerald-600 ring-1 ring-emerald-600' : 'border-stone-200'}`}
      data-testid="chain-offer"
      data-chain={offer.chain}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 text-lg font-semibold">
            {chain?.name ?? offer.chain}
            {best && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white" data-testid="cheapest-badge">הכי זול</span>}
          </span>
          <span className="text-sm text-stone-600" data-testid="cheapest-store">
            {store.name}
            {store.city && store.city !== store.name && `, ${store.city}`}
            {distanceKm != null && ` · ${formatKm(distanceKm)}`}
          </span>
          <span className="text-xs text-stone-500">
            {offer.storesAtCheapest > 1 && `המחיר הזה ב-${offer.storesAtCheapest} סניפים${hasPlace ? ' בטווח' : ''} · `}
            עודכן {formatUpdated(chain?.updated ?? '')}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-2xl font-bold" data-testid="cheapest-price">{formatPrice(offer.cheapest.price)}</span>
          {item.w && <span className="text-xs text-stone-500">לק"ג</span>}
          {up && !item.w && (
            <span className="text-xs text-stone-500" data-testid="unit-price">
              {formatPrice(up.value)} ל-{up.per}
            </span>
          )}
        </div>
      </div>

      {offer.offers.length > 1 && (
        <>
          <button
            type="button"
            className="mt-2 text-sm text-emerald-800 underline"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            data-testid="toggle-stores"
          >
            {open ? 'הסתר סניפים' : `כל ${offer.offers.length} הסניפים${hasPlace ? ' בטווח' : ''}`}
          </button>
          {open && (
            <ul className="mt-2 max-h-80 divide-y divide-stone-100 overflow-y-auto text-sm" data-testid="store-list">
              {offer.offers.map((s) => (
                <li key={s.store.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {s.store.name}
                    {s.store.city && s.store.city !== s.store.name && <span className="text-stone-500">, {s.store.city}</span>}
                    {s.distanceKm != null && <span className="text-stone-500"> · {formatKm(s.distanceKm)}</span>}
                  </span>
                  <span className="shrink-0 font-medium">{formatPrice(s.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  )
}
