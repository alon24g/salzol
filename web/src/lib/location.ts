import { useCallback, useState } from 'react'
import type { Place } from './nearby'

const KEY = 'salzol.place'

function read(): Place | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v.lat === 'number' && typeof v.lon === 'number' ? v : null
  } catch {
    return null
  }
}

function write(place: Place | null) {
  try {
    if (place) localStorage.setItem(KEY, JSON.stringify(place))
    else localStorage.removeItem(KEY)
  } catch {
    // storage unavailable (private mode): keep the place in memory only
  }
}

export type GeoStatus = 'idle' | 'locating' | 'denied' | 'unavailable'

export function usePlace() {
  const [place, setPlaceState] = useState<Place | null>(read)
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle')

  const setPlace = useCallback((p: Place | null) => {
    write(p)
    setPlaceState(p)
  }, [])

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('unavailable')
      return
    }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus('idle')
        setPlace({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'המיקום שלי', source: 'gps' })
      },
      (err) => setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    )
  }, [setPlace])

  return { place, setPlace, locate, geoStatus }
}
