import { useCallback, useMemo, useState } from 'react'
import type { PricingContext } from './promos'

const KEY = 'salzol.pricing'

/** Local calendar date "YYYY-MM-DD" (the app is used in Israel, so local = Israel time). */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

type Stored = { day?: string; clubs?: string[] }

function read(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function write(v: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // storage unavailable: settings last for this visit only
  }
}

export function usePricingSettings() {
  const [stored, setStored] = useState<Stored>(read)
  const today = todayLocal()
  // A remembered shopping date in the past falls back to today.
  const day = stored.day && stored.day >= today ? stored.day : today

  const update = useCallback((patch: Stored) => {
    setStored((prev) => {
      const next = { ...prev, ...patch }
      write(next)
      return next
    })
  }, [])

  const clubs = useMemo(() => new Set(stored.clubs ?? []), [stored.clubs])
  const ctx: PricingContext = useMemo(() => ({ day, clubs }), [day, clubs])

  return {
    ctx,
    today,
    setDay: (d: string) => update({ day: d }),
    toggleClub: (chain: string) =>
      update({ clubs: clubs.has(chain) ? [...clubs].filter((c) => c !== chain) : [...clubs, chain] }),
  }
}
