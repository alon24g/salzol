import { useRef, useState } from 'react'
import { ImportError, encodeShare, exportJson, importJson, listsStore, useLists } from '../lib/lists'
import { compareHref, productHref, shareHref } from '../lib/router'
import { QuantityStepper } from './QuantityStepper'

export function ListPage() {
  const { lists, active } = useLists()
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const share = async () => {
    const url = `${location.origin}${location.pathname}${shareHref(encodeShare(active))}`
    try {
      if (navigator.share) {
        await navigator.share({ title: active.name, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setMessage({ text: 'הקישור הועתק — אפשר להדביק ולשלוח' })
    } catch {
      setMessage({ text: url })
    }
  }

  const download = () => {
    const blob = new Blob([exportJson(active)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${active.name}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const { name, items } = importJson(await file.text())
      listsStore.createList(name, items)
      setMessage({ text: `יובאה הרשימה „${name}” (${items.length} מוצרים)` })
    } catch (e) {
      setMessage({ text: e instanceof ImportError ? e.message : 'הייבוא נכשל', error: true })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const small = 'rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm'

  return (
    <section className="flex flex-col gap-4" data-testid="list-page">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="sr-only">בחירת רשימה</span>
          <select
            className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-lg font-semibold"
            value={active.id}
            onChange={(e) => listsStore.selectList(e.target.value)}
            data-testid="list-select"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.items.length})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={small} onClick={() => { const n = prompt('שם הרשימה החדשה', 'רשימה חדשה'); if (n) listsStore.createList(n) }} data-testid="list-new">
          רשימה חדשה
        </button>
        <button type="button" className={small} onClick={() => { const n = prompt('שם חדש לרשימה', active.name); if (n) listsStore.renameList(n) }} data-testid="list-rename">
          שינוי שם
        </button>
        <button type="button" className={small} onClick={() => { if (confirm(`למחוק את „${active.name}”?`)) listsStore.deleteList() }} data-testid="list-delete">
          מחיקה
        </button>
      </div>

      {active.items.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-stone-600" data-testid="list-empty">
          הרשימה ריקה. חפשו מוצר ולחצו „+ לרשימה”.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white" data-testid="list-items">
          {active.items.map((i) => (
            <li key={i.barcode} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="list-item" data-barcode={i.barcode}>
              <a href={productHref(i.barcode)} className="min-w-0 flex-1 font-medium">
                {i.name}
              </a>
              <div className="flex items-center gap-2">
                <QuantityStepper weighted={i.weighted} value={i.qty} onChange={(q) => listsStore.setQty(i.barcode, q)} compact />
                <button type="button" className="px-2 text-stone-500" aria-label={`הסרת ${i.name}`} onClick={() => listsStore.removeItem(i.barcode)} data-testid="list-item-remove">
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {active.items.length > 0 && (
        <a href={compareHref} className="rounded-xl bg-emerald-700 px-4 py-3 text-center text-lg font-semibold text-white" data-testid="list-compare">
          השוואת סל ({active.items.length} מוצרים)
        </a>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={small} onClick={share} disabled={!active.items.length} data-testid="list-share">
          שיתוף בקישור
        </button>
        <button type="button" className={small} onClick={download} disabled={!active.items.length} data-testid="list-export">
          ייצוא לקובץ
        </button>
        <label className={`${small} cursor-pointer`}>
          ייבוא מקובץ
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => onImport(e.target.files?.[0])} data-testid="list-import" />
        </label>
      </div>
      {message && (
        <p role="status" className={`break-all text-sm ${message.error ? 'text-red-700' : 'text-emerald-800'}`} data-testid="list-message">
          {message.text}
        </p>
      )}
    </section>
  )
}
