import { useSyncExternalStore } from 'react'

/** Registers the service worker (sw/sw.js) in production builds. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // No offline support (e.g. private mode); the app works the same online.
    })
  })
}

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}

/** Installed app (home-screen icon) rather than a browser tab. */
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches ?? false
