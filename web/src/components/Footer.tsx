import { useEffect, useState } from 'react'
import { loadMeta } from '../lib/data'
import { formatUpdated } from '../lib/format'
import type { Meta } from '../lib/types'

export function Footer() {
  const [meta, setMeta] = useState<Meta | null>(null)
  useEffect(() => {
    loadMeta().then(setMeta).catch(() => setMeta(null))
  }, [])

  return (
    <footer className="mt-12 border-t border-stone-200 pt-5 text-xs leading-relaxed text-stone-500" data-testid="footer">
      <p className="mb-2 font-display text-sm font-semibold text-stone-700">סל זול 💚 עוזרים לחסוך בקניות בסופר</p>
      <p>
        המחירים מבוססים על הקבצים שהרשתות מפרסמות לפי חוק קידום התחרות בענף המזון (שקיפות מחירים). מחיר המדף בפועל עשוי
        להיות שונה, ולמבצעים עשויים להיות תנאים נוספים (ראו את תיאור המבצע). קופונים אישיים ומבצעים שלא ניתן לפענח
        אינם נכללים בחישוב. סניפי אילת אינם נכללים (פטורים ממע"מ).
      </p>
      {meta && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" data-testid="chain-freshness">
          {Object.values(meta.chains).map((c) => (
            <li key={c.slug}>
              {c.name}: {c.ok ? `עודכן ${formatUpdated(c.updated)}` : <span className="text-red-700">אין נתונים עדכניים</span>}
            </li>
          ))}
        </ul>
      )}
    </footer>
  )
}
