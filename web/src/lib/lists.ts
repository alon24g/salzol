// Shopping lists: several named lists in localStorage, JSON export/import and share links.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { useSyncExternalStore } from 'react'
import { canonicalBarcode } from './data'

export type ListItem = { barcode: string; name: string; qty: number; weighted: boolean }
export type ShoppingList = { id: string; name: string; items: ListItem[]; updated: string }
type State = { lists: ShoppingList[]; activeId: string }

const KEY = 'salzol.lists'
const DEFAULT_NAME = 'הרשימה שלי'

const newId = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()
const emptyList = (name = DEFAULT_NAME): ShoppingList => ({ id: newId(), name, items: [], updated: now() })

function initial(): State {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && Array.isArray(v.lists) && v.lists.length) {
      const lists = v.lists.map(sanitizeList).filter(Boolean) as ShoppingList[]
      if (lists.length) return { lists, activeId: lists.some((l) => l.id === v.activeId) ? v.activeId : lists[0].id }
    }
  } catch {
    // corrupted or unavailable storage: start fresh
  }
  const l = emptyList()
  return { lists: [l], activeId: l.id }
}

let state: State = initial()
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage unavailable: lists last for this visit only
  }
  listeners.forEach((l) => l())
}

function updateActive(fn: (l: ShoppingList) => ShoppingList) {
  set({ ...state, lists: state.lists.map((l) => (l.id === state.activeId ? { ...fn(l), updated: now() } : l)) })
}

export const listsStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => state,

  addItem(item: Omit<ListItem, 'qty'>, qty: number) {
    updateActive((l) => {
      const existing = l.items.find((i) => i.barcode === item.barcode)
      const items = existing
        ? l.items.map((i) => (i.barcode === item.barcode ? { ...i, qty: round(i.qty + qty) } : i))
        : [...l.items, { ...item, qty }]
      return { ...l, items }
    })
  },
  setQty(barcode: string, qty: number) {
    updateActive((l) => ({ ...l, items: l.items.map((i) => (i.barcode === barcode ? { ...i, qty } : i)) }))
  },
  removeItem(barcode: string) {
    updateActive((l) => ({ ...l, items: l.items.filter((i) => i.barcode !== barcode) }))
  },
  clear() {
    updateActive((l) => ({ ...l, items: [] }))
  },
  createList(name: string, items: ListItem[] = []) {
    const l = { ...emptyList(name.trim() || DEFAULT_NAME), items }
    set({ lists: [...state.lists, l], activeId: l.id })
    return l.id
  },
  renameList(name: string) {
    if (name.trim()) updateActive((l) => ({ ...l, name: name.trim() }))
  },
  deleteList() {
    const lists = state.lists.filter((l) => l.id !== state.activeId)
    if (!lists.length) lists.push(emptyList())
    set({ lists, activeId: lists[0].id })
  },
  selectList(id: string) {
    if (state.lists.some((l) => l.id === id)) set({ ...state, activeId: id })
  },
}

export function useLists() {
  const s = useSyncExternalStore(listsStore.subscribe, listsStore.get)
  const active = s.lists.find((l) => l.id === s.activeId) ?? s.lists[0]
  return { lists: s.lists, active }
}

// --- export / import / share ------------------------------------------------------------

export function exportJson(list: ShoppingList): string {
  return JSON.stringify({ format: 'salzol-list', version: 1, name: list.name, items: list.items }, null, 2)
}

export class ImportError extends Error {}

/** Parse an exported list file. Throws ImportError with a Hebrew message. */
export function importJson(text: string): { name: string; items: ListItem[] } {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new ImportError('הקובץ אינו JSON תקין')
  }
  const o = v as { format?: string; name?: unknown; items?: unknown }
  if (!o || o.format !== 'salzol-list' || !Array.isArray(o.items)) throw new ImportError('זה לא קובץ רשימה של סל זול')
  const items = o.items.map(sanitizeItem).filter(Boolean) as ListItem[]
  return { name: typeof o.name === 'string' ? o.name : DEFAULT_NAME, items }
}

/** Compact share payload: name + [barcode, qty] pairs (names are looked up again on open). */
export function encodeShare(list: ShoppingList): string {
  const payload = { n: list.name, i: list.items.map((i) => [i.barcode, i.qty]) }
  return compressToEncodedURIComponent(JSON.stringify(payload))
}

export function decodeShare(s: string): { name: string; items: { barcode: string; qty: number }[] } | null {
  try {
    const v = JSON.parse(decompressFromEncodedURIComponent(s) ?? '')
    if (!v || !Array.isArray(v.i)) return null
    const items = v.i
      .map(([bc, qty]: [unknown, unknown]) => ({ barcode: canonicalBarcode(String(bc)), qty: Number(qty) }))
      .filter((x: { barcode: string | null; qty: number }) => x.barcode && x.qty > 0 && x.qty < 1000)
    return { name: typeof v.n === 'string' ? v.n.slice(0, 60) : DEFAULT_NAME, items }
  } catch {
    return null
  }
}

function sanitizeItem(x: unknown): ListItem | null {
  const o = x as Partial<ListItem>
  const barcode = canonicalBarcode(String(o?.barcode ?? ''))
  const qty = Number(o?.qty)
  if (!barcode || !(qty > 0 && qty < 1000)) return null
  return { barcode, name: String(o.name ?? barcode).slice(0, 120), qty, weighted: Boolean(o.weighted) }
}

function sanitizeList(x: unknown): ShoppingList | null {
  const o = x as Partial<ShoppingList>
  if (!o || typeof o.id !== 'string' || !Array.isArray(o.items)) return null
  return {
    id: o.id,
    name: String(o.name ?? DEFAULT_NAME),
    items: o.items.map(sanitizeItem).filter(Boolean) as ListItem[],
    updated: String(o.updated ?? now()),
  }
}

function round(n: number) {
  return Math.round(n * 100) / 100
}
