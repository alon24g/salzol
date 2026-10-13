import { useEffect, useState } from 'react'
import { loadItem } from '../lib/data'
import { decodeShare, listsStore, type ListItem } from '../lib/lists'
import { listHref } from '../lib/router'

/** Landing page for a shared list link: preview, then save as a new list. */
export function SharePage({ data }: { data: string }) {
  const decoded = decodeShare(data)
  const [items, setItems] = useState<ListItem[] | null>(null)

  useEffect(() => {
    if (!decoded) return
    let live = true
    Promise.all(
      decoded.items.map(async ({ barcode, qty }) => {
        const item = await loadItem(barcode).catch(() => null)
        return { barcode, qty, name: item?.n ?? `מוצר ${barcode}`, weighted: item?.w ?? false }
      }),
    ).then((rows) => live && setItems(rows))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (!decoded) return <p role="alert" data-testid="share-invalid">הקישור לרשימה פגום או חלקי.</p>
  if (!items) return <p className="text-stone-500">טוען רשימה…</p>

  return (
    <section className="flex flex-col gap-4" data-testid="share-page">
      <h1 className="text-2xl font-bold">שיתפו איתך רשימה: {decoded.name}</h1>
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white" data-testid="share-items">
        {items.map((i) => (
          <li key={i.barcode} className="flex justify-between px-3 py-2">
            <span>{i.name}</span>
            <span className="text-stone-500">× {i.qty}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="rounded-xl bg-emerald-700 px-4 py-3 text-lg font-semibold text-white"
        onClick={() => {
          listsStore.createList(decoded.name, items)
          location.hash = listHref
        }}
        data-testid="share-save"
      >
        שמירה כרשימה שלי
      </button>
    </section>
  )
}
