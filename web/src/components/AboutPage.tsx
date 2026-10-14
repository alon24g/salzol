import { useEffect, useState } from 'react'
import { loadMeta } from '../lib/data'
import { formatUpdated, hoursSince } from '../lib/format'
import type { ChainMeta, Meta } from '../lib/types'

// Matches STALE_AFTER in pipeline/build.py (spec §9).
const STALE_HOURS = 48

type Health = 'ok' | 'stale' | 'down'

function chainHealth(c: ChainMeta, now: Date): Health {
  if (!c.ok) return 'down'
  const h = hoursSince(c.updated, now)
  return h != null && h > STALE_HOURS ? 'stale' : 'ok'
}

const HEALTH_LABEL: Record<Health, string> = { ok: '✅ תקין', stale: '⚠️ לא עודכן מעל יומיים', down: '❌ אין נתונים' }

export function AboutPage() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    loadMeta().then(setMeta).catch(() => setFailed(true))
  }, [])

  const [now] = useState(() => new Date())
  const chains = meta ? Object.values(meta.chains).sort((a, b) => (a.name ?? a.slug).localeCompare(b.name ?? b.slug, 'he')) : []
  const healthy = chains.filter((c) => chainHealth(c, now) === 'ok').length

  return (
    <article className="flex flex-col gap-4" data-testid="about-page">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">אודות סל זול</h1>
        <p className="text-stone-600">
          סל זול משווה מחירים בין רשתות השיווק בישראל, לפי הקבצים שכל רשת גדולה חייבת לפרסם כמה פעמים ביום לפי חוק קידום
          התחרות בענף המזון (שקיפות מחירים). הנתונים נאספים אוטומטית שלוש פעמים ביום.
        </p>
      </header>

      <section className="card flex flex-col gap-2 p-4 text-sm text-stone-700">
        <h2 className="font-display text-lg font-bold text-stone-900">כדאי לדעת</h2>
        <ul className="list-disc ps-5 leading-relaxed">
          <li>המחיר במדף או בקופה עשוי להיות שונה מהמחיר שהרשת פרסמה.</li>
          <li>למבצעים יכולים להיות תנאים נוספים (ראו את תיאור המבצע). קופונים אישיים ומבצעים שלא ניתן לפענח לא נכללים בחישוב.</li>
          <li>המרחק לסניף מחושב ממרכז העיר שלו, ולכן הוא משוער.</li>
          <li>חנויות אונליין בלבד וסניפי אילת (פטורים ממע"מ) לא נכללים.</li>
          <li>מוצרים מושווים לפי ברקוד. מוצרים בלי ברקוד (למשל ירקות במשקל) מופיעים רק ברשת שלהם.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2" data-testid="health-report">
        <h2 className="font-display text-lg font-bold">מצב הנתונים לפי רשת</h2>
        {failed && <p className="text-red-700" role="alert">טעינת מצב הנתונים נכשלה.</p>}
        {meta && (
          <>
            <p className="text-sm text-stone-600" data-testid="health-summary">
              {healthy} מתוך {chains.length} רשתות עם נתונים עדכניים · נבנה {formatUpdated(israelTime(meta.built_at))}
            </p>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-xs text-stone-500">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">רשת</th>
                    <th className="px-3 py-2 text-start font-medium">מצב</th>
                    <th className="px-3 py-2 text-start font-medium">סניפים</th>
                    <th className="px-3 py-2 text-start font-medium">עודכן</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {chains.map((c) => {
                    const h = chainHealth(c, now)
                    return (
                      <tr key={c.slug} data-testid="health-row" data-chain={c.slug} data-health={h}>
                        <td className="px-3 py-2 font-medium">{c.name ?? c.slug}</td>
                        <td className={`px-3 py-2 ${h === 'ok' ? 'text-stone-700' : h === 'stale' ? 'text-amber-800' : 'text-red-700'}`}>
                          {HEALTH_LABEL[h]}
                          {(c.stale_files?.length ?? 0) > 0 && h === 'ok' && (
                            <span className="block text-xs text-stone-500">
                              {c.stale_files!.length === 1 ? 'סניף אחד לא עודכן' : `${c.stale_files!.length} סניפים לא עודכנו`} מעל יומיים
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{c.stores ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{c.ok ? formatUpdated(c.updated) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <p className="text-sm text-stone-600">
        קוד פתוח:{' '}
        <a href="https://github.com/alon24g/salzol" className="link" target="_blank" rel="noopener noreferrer">
          github.com/alon24g/salzol
        </a>
        . איסוף הקבצים נעשה בעזרת{' '}
        <a href="https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers" className="link" target="_blank" rel="noopener noreferrer">
          israeli-supermarket-scrapers
        </a>
        .
      </p>
    </article>
  )
}

/** UTC ISO timestamp → "YYYY-MM-DDTHH:mm" in Israel time, the format formatUpdated expects. */
function israelTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
