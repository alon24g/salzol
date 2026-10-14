import { useEffect, useState } from 'react'
import { loadMeta } from '../lib/data'
import { dayLabel } from '../lib/format'
import type { PricingContext } from '../lib/promos'
import type { Meta } from '../lib/types'

type Props = {
  ctx: PricingContext
  today: string
  setDay: (d: string) => void
  toggleClub: (chain: string) => void
}

export function PricingSettings({ ctx, today, setDay, toggleClub }: Props) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    loadMeta().then(setMeta).catch(() => setMeta(null))
  }, [])

  const maxDay = meta?.promo_date_window?.[1]
  const chains = meta ? Object.values(meta.chains).filter((c) => c.ok) : []
  const memberOf = chains.filter((c) => ctx.clubs.has(c.slug)).map((c) => c.name)

  return (
    <div className="text-sm" data-testid="pricing-settings">
      <button
        type="button"
        className="flex flex-wrap items-center gap-x-2 text-start text-stone-700"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="pricing-settings-toggle"
      >
        <span>
          🗓️ קנייה ב<strong data-testid="shopping-day-label">{dayLabel(ctx.day, today)}</strong>
        </span>
        <span>· 🎟️ {memberOf.length ? `חבר/ה ב: ${memberOf.join(', ')}` : 'ללא מועדונים'}</span>
        <span className="link">{open ? 'סגירה' : 'שינוי'}</span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-xl bg-stone-50 p-3">
          <label className="flex flex-wrap items-center gap-2">
            <span>מתי קונים?</span>
            <input
              type="date"
              className="rounded-lg border border-stone-300 bg-white px-2 py-1"
              value={ctx.day}
              min={today}
              max={maxDay}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              data-testid="shopping-day"
            />
            <span className="text-xs text-stone-500">מבצעים לפי יום (כולל מבצעי יום בשבוע)</span>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1">אני חבר/ה במועדון הלקוחות / כרטיס האשראי של:</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {chains.map((c) => (
                <label key={c.slug} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={ctx.clubs.has(c.slug)}
                    onChange={() => toggleClub(c.slug)}
                    data-testid={`club-${c.slug}`}
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-stone-500">מבצעי מועדון מוצגים תמיד, אבל נכללים במחיר רק אם סימנתם חברות.</p>
          </fieldset>
        </div>
      )}
    </div>
  )
}
