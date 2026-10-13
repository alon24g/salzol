import { useEffect, useState } from 'react'

// Hash routes keep deep links working on GitHub Pages (no server-side rewrites).
export type Route =
  | { name: 'search'; q: string }
  | { name: 'product'; barcode: string }
  | { name: 'list' }
  | { name: 'compare' }
  | { name: 'share'; data: string }

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const m = /^\/p\/(\d{8,14})$/.exec(path)
  if (m) return { name: 'product', barcode: m[1] }
  if (path === '/list') return { name: 'list' }
  if (path === '/compare') return { name: 'compare' }
  const s = /^\/share\/(.+)$/.exec(path)
  if (s) return { name: 'share', data: s[1] }
  return { name: 'search', q: new URLSearchParams(query).get('q') ?? '' }
}

export const productHref = (barcode: string) => `#/p/${barcode}`
export const searchHref = (q: string) => (q ? `#/?q=${encodeURIComponent(q)}` : '#/')
export const listHref = '#/list'
export const compareHref = '#/compare'
export const shareHref = (data: string) => `#/share/${data}`

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
