// Promotion engine: which promos apply on a shopping day, and what a quantity costs with them.
// Promo semantics come from pipeline/promos.py (derived from real files, see its docstring).

export type PromoKind = 'fixed_price' | 'percent_off' | 'amount_off' | 'n_for_price' | 'buy_x_get_y' | 'unknown'

export type Promo = {
  id: string
  description: string
  start: string // "YYYY-MM-DDTHH:mm", Israel local time
  end: string
  kind: PromoKind
  value?: number // fixed_price / n_for_price: ₪; percent_off: %; amount_off: ₪
  min_qty?: number // default 1; 0 = any weight (weighted items, price per kg)
  get_qty?: number // buy_x_get_y
  max_qty?: number // units the promo price applies to
  limit?: number // redemptions per purchase
  weekdays?: number[] // 0 = Sunday … 6 = Saturday
  club_only?: boolean
  club_name?: string
  min_purchase?: number // basket total required (₪) — applied in the basket, not per item
  conditional?: boolean // channel-specific (e.g. Wolt): shown, never applied
  source?: 'feed' | 'manual'
  verified_on?: string
  s?: number[] // store indexes in stores.json[chain]; omitted = every store
}

export type PricingContext = {
  day: string // "YYYY-MM-DD" shopping date
  clubs: ReadonlySet<string> // chain slugs the user is a member of
}

export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00`).getDay()
}

export function isActiveOn(p: Promo, day: string): boolean {
  if (p.start && p.start.slice(0, 10) > day) return false
  if (p.end && p.end.slice(0, 10) < day) return false
  if (p.weekdays?.length && !p.weekdays.includes(weekdayOf(day))) return false
  return true
}

const storeSets = new WeakMap<Promo, Set<number>>()
export function atStore(p: Promo, storeIdx: number): boolean {
  if (!p.s) return true
  let set = storeSets.get(p)
  if (!set) storeSets.set(p, (set = new Set(p.s)))
  return set.has(storeIdx)
}

/** Why an active promo is not applied to an item's price (null = it can be applied). */
export type Blocker = 'unknown' | 'conditional' | 'club' | 'min_purchase' | 'min_qty'

export function blocker(p: Promo, chain: string, qty: number, ctx: PricingContext): Blocker | null {
  if (p.kind === 'unknown') return 'unknown'
  if (p.conditional) return 'conditional'
  if (p.club_only && !ctx.clubs.has(chain)) return 'club'
  if (p.min_purchase) return 'min_purchase'
  const needed = p.kind === 'buy_x_get_y' ? (p.min_qty ?? 1) + (p.get_qty ?? 1) : (p.min_qty ?? 1)
  if (qty < needed) return 'min_qty'
  return null
}

/** Total for `qty` units (kg for weighted items) at `regular` per unit with promo `p`.
 *  Never more than paying the regular price. */
export function totalWithPromo(regular: number, qty: number, p: Promo): number {
  const plain = regular * qty
  const v = p.value ?? 0
  const minQty = p.min_qty ?? 1
  const cap = (units: number) => Math.min(units, p.max_qty ?? Infinity)
  let total = plain
  switch (p.kind) {
    case 'fixed_price': {
      // limit = redemptions; for a per-unit price that's a unit cap
      const eligible = Math.min(cap(qty), p.limit != null ? p.limit * Math.max(minQty, 1) : Infinity)
      total = eligible * v + (qty - eligible) * regular
      break
    }
    case 'n_for_price': {
      const groups = Math.min(Math.floor(cap(qty) / minQty), p.limit ?? Infinity)
      total = groups * v + (qty - groups * minQty) * regular
      break
    }
    case 'buy_x_get_y': {
      const set = minQty + (p.get_qty ?? 1)
      const sets = Math.min(Math.floor(qty / set), p.limit ?? Infinity)
      total = (qty - sets * (p.get_qty ?? 1)) * regular
      break
    }
    case 'percent_off':
      total = plain * (1 - v / 100)
      break
    case 'amount_off':
      total = qty * Math.max(0, regular - v)
      break
  }
  return Math.min(round2(total), round2(plain))
}

export type PricedStore = {
  regular: number
  total: number // for the requested quantity
  applied: Promo | null // promo used for `total`
  /** active promos at this store that didn't apply, with the reason */
  other: { promo: Promo; why: Blocker }[]
}

/** Best price for `qty` at one store: promos don't stack (AllowMultipleDiscounts is ~always 0). */
export function priceAtStore(
  regular: number,
  qty: number,
  chain: string,
  storeIdx: number,
  promos: readonly Promo[],
  ctx: PricingContext,
): PricedStore {
  let best: PricedStore = { regular, total: round2(regular * qty), applied: null, other: [] }
  const other: PricedStore['other'] = []
  for (const p of promos) {
    if (!atStore(p, storeIdx) || !isActiveOn(p, ctx.day)) continue
    const why = blocker(p, chain, qty, ctx)
    if (why) {
      other.push({ promo: p, why })
      continue
    }
    const total = totalWithPromo(regular, qty, p)
    if (total < best.total) {
      if (best.applied) other.push({ promo: best.applied, why: 'min_qty' })
      best = { regular, total, applied: p, other: [] }
    }
  }
  best.other = other.filter((o) => o.promo !== best.applied)
  return best
}

/** Short Hebrew label for the deal, e.g. "2 ב-₪15", "1+1", "₪10.90". */
export function promoLabel(p: Promo, weighted = false): string {
  const v = p.value ?? 0
  const money = (n: number) => `₪${Number.isInteger(n) ? n : n.toFixed(2)}`
  switch (p.kind) {
    case 'fixed_price':
      return weighted || p.min_qty === 0 ? `${money(v)} לק"ג` : money(v)
    case 'n_for_price':
      return `${p.min_qty} ב-${money(v)}`
    case 'buy_x_get_y':
      return `${p.min_qty}+${p.get_qty}`
    case 'percent_off':
      return `${v}% הנחה`
    case 'amount_off':
      return `${money(v)} הנחה`
    default:
      return 'מבצע'
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
