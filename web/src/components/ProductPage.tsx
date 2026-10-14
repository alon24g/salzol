import { useEffect, useMemo, useState } from 'react'
import { cheapestMarks } from '../lib/basket'
import { loadItem, loadItemPromos, loadMeta, loadStores } from '../lib/data'
import { formatKm, formatPrice, formatUpdated } from '../lib/format'
import { chainOffers, chainsOutOfRange, RADIUS_OPTIONS, radiusToReach, unitPrice, type ChainOffer, type Place } from '../lib/nearby'
import { chainSiteLink } from '../lib/chainSites'
import { listsStore, useLists } from '../lib/lists'
import { promoLabel, type Blocker, type PricingContext, type Promo } from '../lib/promos'
import { listHref } from '../lib/router'
import type { ItemPrices, Meta, StoresByChain } from '../lib/types'
import { QuantityStepper } from './QuantityStepper'

// With ~30 chains, show the cheapest few and let the user expand the rest.
const CHAINS_SHOWN = 5
const OUT_OF_RANGE_SHOWN = 3

type Loaded = {
  barcode: string
  item: ItemPrices | null
  stores: StoresByChain
  meta: Meta
  promos: Record<string, Promo[]>
}

type Props = { barcode: string; place: Place | null; radiusKm: number; setRadius: (km: number) => void; ctx: PricingContext }

export function ProductPage({ barcode, place, radiusKm, setRadius, ctx }: Props) {
  // Results are keyed by barcode so navigating to another product never shows stale data.
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [qtyFor, setQtyFor] = useState<{ barcode: string; qty: number } | null>(null)
  // "Show all" toggles are keyed by barcode so they reset when navigating to another product.
  const [allChainsFor, setAllChainsFor] = useState<string | null>(null)
  const [allOutFor, setAllOutFor] = useState<string | null>(null)

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
    () => (data?.item ? chainOffers(data.item, data.stores, place, { radiusKm, qty, ctx, promos: data.promos }) : []),
    [data, place, radiusKm, qty, ctx],
  )

  if (error) return <p role="alert" className="text-red-700">טעינת המוצר נכשלה. נסו לרענן את הדף.</p>
  if (!data) return <p className="text-stone-500">טוען…</p>
  if (!data.item)
    return (
      <p data-testid="product-not-found">
        לא מצאנו את הברקוד <span dir="ltr">{barcode}</span>.{' '}
        <a href="#/" className="link">חזרה לחיפוש</a>
      </p>
    )

  const { item, meta } = data
  const best = cheapestMarks(offers.map((o) => o.cheapest.total))
  const outOfRange = place ? chainsOutOfRange(item, data.stores, place, offers).map((o) => ({ ...o, reach: radiusToReach(o.nearestKm) })) : []
  // Chains only reachable beyond the largest radius are summarized in one line, not listed.
  const reachable = outOfRange.filter((o) => o.reach != null)
  const farChains = outOfRange.length - reachable.length
  const shownChains = allChainsFor === barcode ? offers.length : CHAINS_SHOWN
  const chainName = (slug: string) => meta.chains[slug]?.name ?? slug

  return (
    <article className="flex flex-col gap-4" data-testid="product-page">
      <header className="flex flex-col gap-1">
        <a href="#/" onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back() } }} className="link self-start text-sm">
          → חזרה
        </a>
        <h1 className="font-display text-2xl font-bold sm:text-3xl" data-testid="product-name">{item.n}</h1>
        <p className="text-sm text-stone-500">
          {item.b && `${item.b} · `}
          {item.size && !item.w && `${sizeLabel(item.size)} · `}
          {item.w && 'נמכר במשקל · '}
          ברקוד <span dir="ltr">{barcode}</span>
        </p>
      </header>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <QuantityStepper weighted={item.w} value={qty} onChange={(q) => setQtyFor({ barcode, qty: q })} />
        <button
          type="button"
          className="btn-primary"
          onClick={() => listsStore.addItem({ barcode, name: item.n, weighted: item.w }, qty)}
          data-testid="product-add-to-list"
        >
          + הוספה לרשימה
        </button>
        {listed && (
          <p className="w-full text-sm text-brand-800" data-testid="product-in-list">
            ✓ ברשימה „{active.name}”: {listed.qty} {item.w ? 'ק"ג' : "יח'"} · <a href={listHref} className="link">לרשימה</a>
          </p>
        )}
      </div>

      {!place && (
        <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="no-place-note">
          👋 עדיין לא בחרתם מיקום, אז מוצגים המחירים הזולים בכל הארץ. בחרו מיקום למעלה כדי לראות את הסופרים הקרובים אליכם.
        </p>
      )}

      {offers.length === 0 ? (
        <p className="card p-4 text-stone-700" data-testid="no-offers">
          אין סופר שמוכר את המוצר עד {radiusKm} ק"מ מ{place?.label}.
        </p>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="chain-offers">
          {offers.slice(0, shownChains).map((o, i) => (
            <ChainRow key={o.chain} offer={o} best={best[i]} item={item} barcode={barcode} meta={meta} radiusKm={place ? radiusKm : null} qty={qty} />
          ))}
        </ol>
      )}
      {offers.length > shownChains && (
        <button type="button" className="btn-soft self-center" onClick={() => setAllChainsFor(barcode)} data-testid="show-all-chains">
          הצגת כל {offers.length} הרשתות (עוד {offers.length - shownChains}, יקרות יותר)
        </button>
      )}

      {offers.length > 0 && (
        <p className="text-xs text-stone-500">↗ הקישורים לאתרי הרשתות מחפשים את המוצר בחנות המקוונת; המחיר שם עשוי להיות שונה ממחיר הסניף.</p>
      )}

      {(reachable.length > 0 || farChains > 0) && (
        <ul className="flex flex-col gap-2 text-sm" data-testid="missing-chains">
          {reachable.slice(0, allOutFor === barcode ? undefined : OUT_OF_RANGE_SHOWN).map(({ chain, nearestKm, reach }) => {
            return (
              <li key={chain} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-dashed border-stone-300 px-3 py-2 text-stone-600" data-testid="out-of-range" data-chain={chain}>
                <span>
                  ל<strong>{chainName(chain)}</strong> אין סניף שמוכר את המוצר עד {radiusKm} ק"מ. הקרוב ביותר: {formatKm(nearestKm)}.
                </span>
                {reach && (
                  <button type="button" className="link" onClick={() => setRadius(reach)} data-testid="widen-radius">
                    הרחבה ל-{reach} ק"מ
                  </button>
                )}
              </li>
            )
          })}
          {reachable.length > OUT_OF_RANGE_SHOWN && allOutFor !== barcode && (
            <li>
              <button type="button" className="link" onClick={() => setAllOutFor(barcode)} data-testid="show-all-out-of-range">
                עוד {reachable.length - OUT_OF_RANGE_SHOWN} רשתות עם סניף קצת יותר רחוק
              </button>
            </li>
          )}
          {farChains > 0 && (
            <li className="px-3 text-stone-500" data-testid="far-chains">
              {farChains === 1 ? 'רשת נוספת מוכרת' : `${farChains} רשתות נוספות מוכרות`} את המוצר רק במרחק של יותר מ-
              {RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1]} ק"מ.
            </li>
          )}
        </ul>
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

type ChainRowProps = { offer: ChainOffer; best: boolean; item: ItemPrices; barcode: string; meta: Meta; radiusKm: number | null; qty: number }

function ChainRow({ offer, best, item, barcode, meta, radiusKm, qty }: ChainRowProps) {
  const [open, setOpen] = useState(false)
  const chain = meta.chains[offer.chain]
  const { store, distanceKm, total, regular, applied, other } = offer.cheapest
  const perUnit = total / qty
  const up = unitPrice(perUnit, item.size, item.w)
  const saved = regular * qty - total
  const hasPlace = radiusKm != null
  const site = chainSiteLink(offer.chain, barcode, item.n)

  return (
    <li
      className={`card p-4 ${best ? 'border-brand-600 ring-2 ring-brand-600/70' : ''}`}
      data-testid="chain-offer"
      data-chain={offer.chain}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 font-display text-lg font-bold">
            {chain?.name ?? offer.chain}
            {best && <span className="badge-best" data-testid="cheapest-badge">🏆 הכי זול</span>}
          </span>
          <span className="text-sm text-stone-600" data-testid="cheapest-store">
            {store.name}
            {store.city && store.city !== store.name && `, ${store.city}`}
            {distanceKm != null && ` · ${formatKm(distanceKm)}`}
          </span>
          <span className="text-xs text-stone-500">
            {offer.storesAtCheapest > 1 && `המחיר הזה ב-${offer.storesAtCheapest} סניפים${hasPlace ? ` עד ${radiusKm} ק"מ` : ''} · `}
            עודכן {formatUpdated(chain?.updated ?? '')}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="font-display text-2xl font-extrabold text-brand-800" data-testid="cheapest-price">{formatPrice(total)}</span>
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {offer.offers.length > 1 && (
          <button type="button" className="btn-soft" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="toggle-stores">
            {open ? 'הסתרת הסניפים' : `${hasPlace ? 'כל הסניפים לידי' : 'כל הסניפים'} (${offer.offers.length})`}
          </button>
        )}
        {site && (
          <a href={site.href} target="_blank" rel="noopener noreferrer" className="btn-soft" data-testid="chain-site-link">
            לאתר {site.label} ↗
          </a>
        )}
      </div>
      {open && (
        <ul className="mt-2 max-h-80 divide-y divide-stone-100 overflow-y-auto text-sm" data-testid="store-list">
          {(hasPlace ? [...offer.offers].sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.total - b.total) : offer.offers).map((s) => (
            <li key={s.store.id} className="flex justify-between gap-2 py-1.5">
              <span>
                {s.store.name}
                {s.store.city && s.store.city !== s.store.name && <span className="text-stone-500">, {s.store.city}</span>}
                {s.distanceKm != null && <span className="text-stone-500"> · {formatKm(s.distanceKm)}</span>}
              </span>
              <span className="shrink-0 font-medium">
                {s.applied && <span className="me-1 text-xs text-brand-700">מבצע</span>}
                {formatPrice(s.total)}
              </span>
            </li>
          ))}
        </ul>
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
