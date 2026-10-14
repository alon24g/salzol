import { useEffect, useState } from 'react'
import { loadMeta } from '../lib/data'
import { aboutHref } from '../lib/router'
import type { Meta } from '../lib/types'

export function Footer() {
  const [meta, setMeta] = useState<Meta | null>(null)
  useEffect(() => {
    loadMeta().then(setMeta).catch(() => setMeta(null))
  }, [])

  const chains = meta ? Object.values(meta.chains) : []
  const down = chains.filter((c) => !c.ok)

  return (
    <footer className="mt-12 border-t border-stone-200 pt-5 text-xs leading-relaxed text-stone-500" data-testid="footer">
      <p className="mb-2 font-display text-sm font-semibold text-stone-700">סל זול 💚 עוזרים לחסוך בקניות בסופר</p>
      <p>
        המחירים מבוססים על הקבצים שהרשתות מפרסמות לפי חוק קידום התחרות בענף המזון (שקיפות מחירים). מחיר המדף בפועל עשוי
        להיות שונה, ולמבצעים עשויים להיות תנאים נוספים (ראו את תיאור המבצע). קופונים אישיים ומבצעים שלא ניתן לפענח
        אינם נכללים בחישוב. סניפי אילת אינם נכללים (פטורים ממע"מ).
      </p>
      {meta && (
        <p className="mt-2" data-testid="chain-freshness">
          {chains.length - down.length} רשתות עם נתונים
          {down.length > 0 && <span className="text-red-700"> · אין נתונים עדכניים מ: {down.map((c) => c.name ?? c.slug).join(', ')}</span>}
          {' · '}
          <a href={aboutHref} className="link" data-testid="about-link">
            אודות ומצב הנתונים
          </a>
        </p>
      )}
    </footer>
  )
}
