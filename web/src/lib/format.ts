const ils = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2 })

export const formatPrice = (n: number) => ils.format(n)

/** Store coordinates are city centroids (pipeline/geo.py), so distances are approximate. */
export function formatKm(km: number): string {
  return km < 1 ? 'פחות מק"מ' : `~${km.toFixed(km < 10 ? 1 : 0)} ק"מ`
}

/** "2026-10-13T12:15" (Israel local time from the pipeline) → "13.10 12:15" */
export function formatUpdated(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s)
  return m ? `${m[3]}.${m[2]} ${m[4]}:${m[5]}` : '—'
}

/** Hours from a pipeline "updated" stamp (Israel local time, taken as UTC+3) to `now`; null if unparseable. */
export function hoursSince(updated: string, now: Date): number | null {
  const t = Date.parse(`${updated}:00+03:00`)
  return Number.isNaN(t) ? null : (now.getTime() - t) / 3_600_000
}

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/** "היום" or e.g. "יום שני 12.10". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'היום'
  const d = new Date(`${day}T12:00:00`)
  return `יום ${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`
}
