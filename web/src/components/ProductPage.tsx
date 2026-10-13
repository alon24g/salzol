import { useEffect, useMemo, useState } from 'react'
import { loadItem, loadItemPromos, loadMeta, loadStores } from '../lib/data'
import { formatKm, formatPrice, formatUpdated } from '../lib/format'
import { DEFAULT_RADIUS_KM, chainOffers, unitPrice, type ChainOffer, type Place } from '../lib/nearby'
import { listsStore, useLists } from '../lib/lists'
import { promoLabel, type Blocker, type PricingContext, type Promo } from '../lib/promos'
import { listHref } from '../lib/router'
import type { ItemPrices, Meta, StoresByChain } from '../lib/types'
import { QuantityStepper } from './QuantityStepper'

type Loaded = {
  barcode: string
  item: ItemPrices | null
  stores: StoresByChain
  meta: Meta
  promos: Record<string, Promo[]>
}

export function ProductPage({ barcode, place, ctx }: { barcode: string; place: Place | null; ctx: PricingContext }) {
  // Results are keyed by barcode so navigating to another product never shows stale data.
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [qtyFor, setQtyFor] = useState<{ barcode: string; qty: number } | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([loadItem(barcode), loadStores(), loadMeta()])
      .then(async ([item, stores, meta]) => {
        const promos = item ? await loadItemPromos(item) : {}
        if (live) setLoaded({ barcode, item, stores, meta, promos })
      })
      .catch(() => live && setFailed(barcode))
    return () => {
      live = false
    }
  }, [barcode])

  const data = loaded?.barcode === barcode ? loaded : null
  const error = failed === barcode
  const qty = qtyFor?.barcode === barcode ? qtyFor.qty : 1
  const { active } = useLists()
  const listed = active.items.find((i) => i.barcode === barcode)

  const offers = useMemo(
    () => (data?.item ? chainOffers(data.item, data.stores, place, { qty, ctx, promos: data.promos }) : []),
    [data, place, qty, ctx],
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <QuantityStepper weighted={item.w} value={qty} onChange={(q) => setQtyFor({ barcode, qty: q })} />
        <button
          type="button"
          className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white"
          onClick={() => listsStore.addItem({ barcode, name: item.n, weighted: item.w }, qty)}
          data-testid="product-add-to-list"
        >
          + הוספה לרשימה
        </button>
      </div>
      {listed && (
        <p className="text-sm text-emerald-800" data-testid="product-in-list">
          ברשימה „{active.name}”: {listed.qty} {item.w ? 'ק"ג' : "יח'"} · <a href={listHref} className="underline">לרשימה</a>
        </p>
      )}

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
            <ChainRow key={o.chain} offer={o} best={i === 0 && offers.length > 1} item={item} meta={meta} hasPlace={!!place} qty={qty} />
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

function qtyLabel(qty: number, weighted: boolean): string {
  return weighted ? `${qty} ק"ג` : `${qty} יח'`
}

function ChainRow({ offer, best, item, meta, hasPlace, qty }: { offer: ChainOffer; best: boolean; item: ItemPrices; meta: Meta; hasPlace: boolean; qty: number }) {
  const [open, setOpen] = useState(false)
  const chain = meta.chains[offer.chain]
  const { store, distanceKm, total, regular, applied, other } = offer.cheapest
  const perUnit = total / qty
  const up = unitPrice(perUnit, item.size, item.w)
  const saved = regular * qty - total

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
          <span className="text-2xl font-bold" data-testid="cheapest-price">{formatPrice(total)}</span>
          {qty !== 1 && <span className="text-xs text-stone-500">ל-{qtyLabel(qty, item.w)}</span>}
          {applied && (
            <span className="text-xs text-stone-500 line-through" data-testid="regular-price">
              {formatPrice(regular * qty)}
            </span>
          )}
          {up && !item.w && (
            <span className="text-xs text-stone-500" data-testid="unit-price">
              {formatPrice(up.value)} ל-{up.per}
            </span>
          )}
          {item.w && <span className="text-xs text-stone-500">{formatPrice(perUnit)} לק"ג</span>}
        </div>
      </div>

      {(applied || other.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="promo-badges">
          {applied && <AppliedBadge promo={applied} weighted={item.w} saved={saved} />}
          {dedupe(other).map(({ promo, why }) => (
            <OtherBadge key={promo.id} promo={promo} why={why} weighted={item.w} />
          ))}
        </ul>
      )}

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
                  <span className="shrink-0 font-medium">
                    {s.applied && <span className="me-1 text-xs text-emerald-700">מבצע</span>}
                    {formatPrice(s.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  )
}

function dedupe<T extends { promo: Promo }>(xs: T[]): T[] {
  const seen = new Set<string>()
  return xs.filter((x) => (seen.has(x.promo.id) ? false : (seen.add(x.promo.id), true)))
}

const badge = 'rounded-lg px-2 py-1 text-xs leading-snug'

function clubText(p: Promo) {
  return p.club_name ? `למועדון בלבד · ${p.club_name}` : 'למועדון בלבד'
}

function AppliedBadge({ promo, weighted, saved }: { promo: Promo; weighted: boolean; saved: number }) {
  return (
    <li className={`${badge} bg-emerald-50 text-emerald-900`} data-testid="promo-applied" title={promo.description}>
      <strong>{promo.source === 'manual' ? 'מבצע שבועי' : 'מבצע'}: {promoLabel(promo, weighted)}</strong>
      {saved > 0.005 && ` · חוסכים ${formatPrice(saved)}`}
      {promo.club_only && ` · ${clubText(promo)}`}
      {promo.weekdays?.length ? ` · ${weekdaysText(promo.weekdays)}` : ''}
      <span className="block text-emerald-800/80">{promo.description}</span>
      {promo.source === 'manual' && promo.verified_on && <span className="block">נבדק ב-{promo.verified_on}</span>}
    </li>
  )
}

const WHY: Record<Blocker, string> = {
  min_qty: '',
  club: '',
  min_purchase: '',
  unknown: 'לא נכלל בחישוב',
  conditional: 'מותנה (למשל הזמנה בוולט/קופון) — לא נכלל',
}

function OtherBadge({ promo, why, weighted }: { promo: Promo; why: Blocker; weighted: boolean }) {
  let head: string
  if (why === 'min_qty') {
    const n = promo.kind === 'buy_x_get_y' ? (promo.min_qty ?? 1) + (promo.get_qty ?? 1) : promo.min_qty
    head = `בקניית ${n}: ${promoLabel(promo, weighted)}`
  } else if (why === 'club') {
    head = `${promoLabel(promo, weighted)} · ${clubText(promo)}`
  } else if (why === 'min_purchase') {
    head = `${promoLabel(promo, weighted)} · בקנייה מעל ${formatPrice(promo.min_purchase ?? 0)}`
  } else {
    head = WHY[why]
  }
  const tone = why === 'min_qty' ? 'bg-amber-50 text-amber-900' : 'bg-stone-100 text-stone-700'
  return (
    <li className={`${badge} ${tone}`} data-testid="promo-other" data-why={why} title={promo.description}>
      <strong>{head}</strong>
      <span className="block opacity-80">{promo.description}</span>
    </li>
  )
}

const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
function weekdaysText(days: number[]): string {
  return `רק בימים ${days.map((d) => DAY_NAMES[d]).join(', ')}`
}
